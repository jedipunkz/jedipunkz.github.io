---
title: "App Mesh と ECS によるカナリーリリース構成を検証してみた"
date: 2021-12-10T13:56:56+09:00
Categories: ["infrastructure"]
draft: false
---
こんにちは。[jedipunkz🚀](https://twitter.com/jedipunkz) です。

今回も [READYFOR Advent Calendar 2021](https://qiita.com/advent-calendar/2021/readyfor) の記事として執筆します。

## 今回のテーマ

[前回の記事](https://jedipunkz.github.io/post/progressive_delivery/) では ECS 移行後の構成について検討する内容を記しました。Progressive Delivery を実践する上でもその一歩手前の構成と言っていいカナリーリリース構成について、今回は記していきたいと思います。

### デグレしてしまっていたカナリーリリース

READYFOR では AWS ECS 移行を行い ECS + CodeDeploy による Blue/Green デプロイメントを導入しました。逆に移行前までに出来ていたカナリーリリースが実施できなくなりました。とは言ってもそれまで開発者がカナリーリリースに対して求めていた主な機能はロールバックだったため、ひとまずは Blue/Green デプロイメントで事足りている状況なのですが、今後大きな機能をリリースする際にはトラヒックを徐々に寄せ影響を把握した上でリリース進めるという作業は必要になってくる可能性があります。

よって、

- Progressive Delivery の一歩手前の構成を実践する
- 大きなリリースのための環境整備

という意味でも、一回カナリーリリース構成について検討しておこうと考えました。

## 環境構築

### 今回用意した Terraform コード

検証で作成した AWS 環境をデプロイするための Terraform コードを下記の場所に置いてあります。参考にしてください。

[https://github.com/jedipunkz/tf-appmesh-ecs-canary-release](https://github.com/jedipunkz/tf-appmesh-ecs-canary-release)

(今回検証で作成したコードは業務上作成したものですが、READYFOR の OSS ポリシーに則り著作権譲渡をうけており、自らのGitHubリポジトリで公開しています。)

- App Mesh
- ECS
- NLB
- Service Discovery
- Envoy
- X-Ray

といった技術要素で構成されています。

### Terraform コードによるデプロイ実施

上記に記した Terraform コードを使った構成のデプロイ手順を記します。

前提として Terraform バージョン 1.0.x 系以上をローカルにインストールする必要があります。

```shell
$ # AWS クレデンシャル情報を設定
$ git clone https://github.com/jedipunkz/tf-appmesh-ecs-canary-release
$ cd tf-appmesh-ecs-canary-release
$ terraform plan
$ terraform apply
```

### 構成

検証で構築した構成(上記の Terraform コードで構築できる) は下記になります。

<img src="http://jedipunkz.github.io/pix/appmesh_ecs.png" width="100%">

#### 構成の特徴とリクエスト処理の流れ

- NLB で受け付けた TCP 80 番ポートのリクエストを ECS Task 上で起動している Envoy (Gateway) にリクエスト分散
- Envoy (Gateway) はトラヒックを AppMesh Virtual Gateway のルーティング先に指定している VirtualService へ分散
- VirtualService には VirtualRouter が設定されておりルーティング情報として VirtualNode x 2 台を設定している
- 結果 VirtualNode x 2 "example1", "example2" へ荷重ルーティングによってトラヒックがルーティングされる
- 各 VirtualNode は ECS Task (example1, example2) に紐付いている

※example1, example2 は上記 Terraform コード内で設定している AWS リソース名です。


#### サービスディスカバリの構成

AWS ServiceDiscovery を用いてサービスディスカバリの機能を用いています。名前の関係については下記になります。

- Namespace として `example.internal` を作成 (CloudMap として生成される)
- Namespace `example.internal` 配下に `exmaplegw.example.internal` をサービスディスカバリサービスとして生成
- Namespace `example.internal` 配下に `exmaple1.example.internal` をサービスディスカバリサービスとして生成
- Namespace `example.internal` 配下に `exmaple2.example.internal` をサービスディスカバリサービスとして生成

また、各サービスディスカバリサービスはヘルスチェックの機能を有していて、実体である ECS Task が無いと Route53 レコードは生成されません。


## 動作確認

構築した App Mesh + ECS 構成の動作確認をしてみます。

[下記の App Mesh Route の記述](https://github.com/jedipunkz/tf-appmesh-ecs-canary-release/blob/main/appmesh.tf#L73-L91) にある通り、各 VirtualNode (exmaple1, example2) への荷重ルーティングとして `95:5` という比率を設定しています。

```hcl
  spec {
    http_route {
      match {
        prefix = "/"
      }

      action {
        weighted_target {
          virtual_node = aws_appmesh_virtual_node.example1.name
          weight       = 95
        }

        weighted_target {
          virtual_node = aws_appmesh_virtual_node.example2.name
          weight       = 5
        }
      }
    }
  }
```

この設定した比率 95:5 が機能しているかを確認するため、下記のような簡単なスクリプトを用意して実行してみます。

```shell
#!/bin/sh
i=0
while [ $i -ne 100 ]
do
        i=$(($i+1))
        echo "$i"
        curl http://<NLB の DNS 名/ >> /tmp/example.log
        sleep 1
done
```

結果として下記のに `97:3` という比率でそれぞれの VirtualNode (ECS Task) から応答があり、App Mesh Route の設定値 `95:5` とほぼ同等である事が判りました。

```shell
$ grep example1 /tmp/example.log | wc -l
      97
$ grep example2 /tmp/example.log | wc -l
       3
```

## aws-sdk-go を使った荷重ルーティング操作について

READYFOR ではインフラのコードを Go 言語を使って開発する機会が多いのですが、ここでは aws-sdk-go を使った荷重ルーティング操作について調べたので記していきます。

### なぜ aws-sdk-go なのか？

荷重ルーティングは App Mesh の VirtualRoute というルーティング設定に設定を施すのですが、それ自体が AWS リソースです。よって Terraform コードでリソース作成したのですが、SRE やインフラメンバと異なり、開発者自身にカナリーリリースを実践してもらう 事を想定すると Terraform コードによる操作は不向きと考えました。よって他の方法を考えなくてはいけません。

SRE の持っている権限と機能を開発者に提供するという意味では Slack 等のコミュニケーションツールの入力によるボット操作が非常に融和性が高いと考えています。よって、このボットを開発する上でも aws-sdk-go を使って荷重ルーティング操作が出来てしまえば、あとは開発するだけとなります。

### 参考資料

aws-sdk-go の荷重ルーティング操作については下記の関数を利用します。

[https://docs.aws.amazon.com/sdk-for-go/api/service/appmesh/#AppMesh.UpdateRoute](https://docs.aws.amazon.com/sdk-for-go/api/service/appmesh/#AppMesh.UpdateRoute)

### 荷重ルーティング操作コード

下記に動作確認まで行った Go のコードを記します。
UpdateRoute メソッドを実行するだけで操作が行えました。UpdateRouteInput に環境情報を記しつつ、`Spec` に荷重設定値を入力する事で荷重ルーティングを操作できることが分かります。

```go
package main

import (
	"encoding/json"
	"fmt"
	"log"

	"github.com/aws/aws-sdk-go/aws"
	"github.com/aws/aws-sdk-go/aws/session"
	"github.com/aws/aws-sdk-go/service/appmesh"
)

func main() {
	sess := session.New()
	svc := appmesh.New(sess)

	jsonBlob := []byte(`
	{
		"HttpRoute": {
			"Action": {
				"WeightedTargets": [{
					"VirtualNode": "example1",
					"Weight": 90 // example1 の荷重
				},{
					"VirtualNode": "example2",
					"Weight": 10 // example2 の荷重
				}]
			},
			"Match": {
				"Prefix": "/"
			}
		}
	}`)

	var spec *appmesh.RouteSpec
	err := json.Unmarshal(jsonBlob, &spec)
	if err != nil {
		log.Fatal(err)
	}

	input := &appmesh.UpdateRouteInput{
		// ClientToken: aws.String("foo"),
		MeshName:          aws.String("example"),
		MeshOwner:         aws.String("<AWS アカウント ID>"),
		RouteName:         aws.String("example"),
		Spec:              spec,
		VirtualRouterName: aws.String("example"),
	}
	result, err := svc.UpdateRoute(input)
	if err != nil {
		log.Println(err)
	}
	fmt.Println(result)
}
```

## まとめと考察

結果として下記のことが分かりました。

- App Mesh + ECS の最小構成が組め、カナリーリリース機能を開発者へ提供できる
- 操作自体も開発者自身に行ってもらえる

ですが、幾つかか考えなくてはいけない事があります。

### 問題点

一方の VirualNode A (仮の名前として用います) からもう一方の VirtualNode B へカナリーリリースを実施すると通常時にリクエストを受ける環境は VirtualNode B とります。その次のリリースタイミングでは逆に VirtualNode B -> VirtualNode A と切り替えなくてはいけないのか？またアプリケーションのデプロイワークフローの対象リソースが A なのか B なのか、という問題が浮上してきます。

これらが解決できないと、運用負担増やトラブルシュートの難易度高といった受け入れがたい具体的な問題に繋がると考えています。

### 問題点の解消: 構成案 #1

そこで上記の問題を回避しつつどう構成するかを考えてみました。

#### 前提の環境

下記の前提で構成を考えてみます。

- VirtualNode A を通常時にサービスを受ける ECS Service として用意
- VirtualNode B をカナリーリリース時のサービスを受ける ECS Service として用意

#### ブランチと ECS Service の対応

レポジトリのブランチ `main` , `canary` に対して下記のような対応付けで ECS Service をデプロイする戦略です。

| ブランチ名 | デプロイ先の ECS Serivice |
|---|---|
| main | ECS Service (VIrtualNode A) |
| canary | ECS Service (VirtualNode B) |

#### リリースの流れ

リリースの流れとしては下記が考えれます。

- (1) `canary` ブランチにマージ & VirtualNode B ECS へデプロイ
- (2) 荷重ルーティングにより A -> B へ徐々にトラヒックを流し最終的に 100% に
- (3) `main` ブランチにマージして VirtualNode A ECS へデプロイ
- (4) 荷重ルーティング A:B = 100:0 として VirtualNode A ECS へ 100% 流す

これにより、VirtualNode A は通常時用 ECS 環境という前提を守ることが出来ます。また、A -> B, B -> A とカナリーリリースの流れの向きを切り替える問題も解消されます。

ただ、これは一案であって、他にも良い構成が考えられるかもしれません。

### 今回紹介した構成以外の構成について

今回は検証しなかったのですが、VirtualNode の backend 設定が可能なようです。詳細は[こちらの Terraform ドキュメント](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/appmesh_virtual_node#backend) にあります。これによって下記のような流れが組めると想定しています。

```
NLB -> VirtualGateway (ECS) -> VirtualSerivce α -> VirtualRoute α -> VirtualNod α (ECS) x n -> VirtualService β -> VirtualRouter β -> VirtualNode β (ECS) x n
```

### ロードバランサなのかサービスディスカバリなのかの考察

ロードバランサとサービスディスカバリが提供できる機能は

- 冗長性
- 保守性
- 拡張性

という意味ではほぼ同等の機能を有していると考えています。なのでより枯れた技術であるロードバランサを使って構成を考えられないか検討してみました。

結果、VirtualNode -> SerivceDiscovery -> ECS Service と連携する際に ECS Service は ServiceDiscovery 自体をレジスト出来るので上記の構成図の様な構成が組めるのですが、ロードバランサにすると、ECS Service に当てはめられるのは LB となります。荷重ルーティング・カナリーリリースをする際に ECS Service が複数必要なわけですが、そうすると ECS Service の数分の LB が必要になります。もちろんそれを構成する TargetGroup, Listenr (ListenrRule) も必要になります。

尚、その際には Virtual Node の Service Discovery の dns パラメータに hostname だけを記して、LB の DNS 名を知るせば良さそうに見受けました。が、この構成については無駄なリソースが発生すると判断したことを受け、検証未実施です。

```hcl
    service_discovery {
      dns {
        hostname = "nlb-****.example.internal"
      }
    }
```

これは同等の機能を提供してくれる ServiceDiscovery を使ったほうが無駄な aws リソースを作らなくて済む、という結果につながります。


### まとめのまとめ(所感)

以上、ECS を使ったカナリーリリース構成について記しました。個人的には導入の前に Envoy や X-ray についてもう少し情報収集して調査の解像度を上げていく必要があると感じています。すべてのリクエストのトラヒックが Envoy コンテナを介す事になり、それらの知識が十分に無いと万が一のトラブルシュートの際に困るだろうなぁと考えています。
