---
title: "ECS の構成と Terraform コード化する際の構造化について"
date: 2019-10-17T18:37:36+09:00
Categories: ["infrastructure"]
draft: false
---
こんにちは。<a href="https://twitter.com/jedipunkz">@jedipunkz</a> です。

今回は AWS ECS についてです。直近の仕事で ECS の Terraform コード開発をしていたのですがコードの構造化について考えていました。一枚岩のコードを書いても運用に耐えられるとは考えられません。また ECS を構成するにあたって ECS のネットワークモードとコンテナのロギングについて考えているうちに、どの構成が一番適しているのか？について時間を掛けて考えました。ここではそれらについてまとめたいと思います。

## Terraform コードの構造化

運用の精神的な負担を軽減するという観点で Terraform のコード開発をする上で一番重要なのはコードの構造化だと思います。前回のブログ記事に書いたのですがコードの構造化をする上で下記に留意して考えると良いと思います。

- 影響範囲
- ステートレスかステートフルか
- 安定度
- ライフサイクル

結果、具体的に Terraform のコードはどのような構造になるでしょうか。自分は下記のようにコンポーネント化して Terraform の実行単位を別けました。ここは人それぞれだと思いますが、ECS 本体と ECS の周辺 AWS サービスの一般的な物を考慮しつつ、いかにシンプルに構造化するかを考えると自然と下記の区分けになる気がします。

| コンポーネント | 具体的なリソース |
|---------------|----------------|
| ネットワーク | vpc, route table, igw, endpoint, subnet |
| ECS 本体 | ecs, alb, autoscaling, cloudwatch, iam |
| CI/CD | codebuild, codepipeline, ecr, iam |
| パラメータ | ssm, kms |
| データストア | s3, rds, elasticache ... |

vpc や subnet に関して頻繁に更新を掛ける人は少ないのではないでしょうか。よってネットワークは "影響範囲" を考慮しつつコンポーネントを別けました。また、同じ理由でパラメータ・CI/CD も ECS 本体とは実行単位を別けた方が好ましいと思います。また "ステートフルかステートレスか" という観点でデータベースやストレージは頻繁に更新する ECS 本体とは別けるべきでしょう。

### コンポーネント化する際に Terraform Remote States 機能を用いる

構造化が上記の通りできましたが、具体的にどの様に Terraform の構造化を行うのかについて記したいと思います。

一枚岩のコードの場合、各 Resources 間で Resource 作成時に得られた id, name, arn の様な Attribute を再利用するケースが多いと思います。ですが Terraform の構造化を行うと Terraform コマンドの実行単位が異なるわけですからそういった処置が行えません。だからと言って構造単位で Variables に値を格納していては問題があるので、ここの対処法として Terraform の Remote State 機能を用います。下記に例を挙げて説明します。

上記構造の "ネットワーク" 内の provider.tf で下記のように記して states を s3 へ格納します。

```
terraform {
  required_version = ">= 0.12.0"

  backend "s3" {
    bucket  = "example-bucket"
    key     = "network/terraform.tfstate"
    region  = "ap-northeast-1"
    encrypt = true
  }
}
```

"ネットワーク" 内 vpc.tf で下記のように vpc を作成します。

```
resource "aws_vpc" "example" {
  cidr_block  = "10.0.0.0/16"
}
```

"ネットワーク" 内 output.tf で下記のように Terraform Output を指定します。これにより別の構造で値を再利用できます。

```
output "example_vpc_id" {
  value = aws_vpc.example.id
}
```

すると "ネットワーク" 以外の構造 (例 : ECS 本体等) で下記のように `terraform_remote_state` を記すと

```
data "terraform_remote_state" "network" {
  backend = "s3"

  config = {
    bucket  = "example-bucket"
    key     = "network/terraform.tfstate"
    region  = "ap-northeast-1"
    encrypt = true
  }
}
```

下記のように他の構造(この場合ネットワーク VPC) を作成した際の Terraform Attribute が呼び出せます。

```
vpc_id = data.terraform_remote_state.network.outputs.example_vpc_id
```

実際の動きとしては vpc を作成した際の terraform tfstate が s3 に格納されていてその s3 内の tfstate を他のコンポーネント作成時に呼び出す、といったことをしています。この機能によりコンポーネント化を容易に実現することが可能です。

## ECS 構成

次に ECS 自体の構成がどの様なものが最適なのか検討していきます。

自分は ECS の構成を考える上で重要な要素として下記があると考えています。

- networkMode
- logDriver

これら二つについて記していきます。

### networkMode

ECS にある networkMode のどれを用いるのがベストなのか検討する必要があります。後述するロギングの情報と合わせて考えるので、ここでは一般的な情報のみを記しておきます。

#### bridge

- ECS インスタンスの任意のポートをコンテナのポートにマッピング
- ECS インスタンスの ENI を複数のタスクが共有で利用

#### host

- コンテナで expose したポートをインスタンスでも利用
- よって基本、同じポートを用いるコンテナを複数起動できない

#### awsvpc

- ENI がタスク毎にアタッチされる
- タスク間でのポートマッピングの考慮不要
- ネットワークパフォーマンスが優れている
- ENI 毎に SecurityGroup を紐づけ
- ALB と NLB に IP ターゲットとして登録が可能

結果的には awsvpc がパフォーマンス的にも優れていて最適解です。また logDriver fluentd の通信のことを考えると bridge も検討するべきだと解りますが詳しくは後術します。

### logDriver

ECS の場合のロギングの選択肢としては Cloudwatch Logs か Fluentd か、となると思います。ログの格納先は何が考えられるでしょうか。s3, cloudwatch logs, elasticsearch を通常考えると思いますが、格納した後のログの再利用を考えるとどうなるでしょう。自分は Elasticsearch にログを格納して Kibana で可視化するケースが多いのですが、ここで注意が必要です。Cloudwatch Logs から Elasticsearch Service へログのストリームをする際に圧縮されたデータを展開しつつストリームする必要があります。これを Terraform でコード化するのは結構厄介です。具体的には Lambda Function を作成して Python or Nodejs でコードを書き Firehose を使って Elasticsearch Service へ繋ぎ込みます。その点では Fluentd -> Elasticsearch Service と直接ストリーム出来れば都合がいいです。ということは Fluentd 一択？と考えたいところなのですが... Fluentd を ECS で扱うことを考えると結構構成に悩みます。

### 考慮点を踏まえた結果の ECS 構成

結果、networkMode, logDriver の検討を行うと下記のような構成パターンが選択肢としてあげられます。

#### ECS/Fargate 構成の場合

- networkMode : awsvpc
  - logDriver : awslogs
    - -> cloudwatch logs

#### ECS/EC2 構成の場合

構成(2)

- networkMode : awsvpc
  - logDriver : awslogs
    - -> cloudwatch logs

構成(3)

- networkMode : awsvpc
  - logDriver : fluentd
    - 通信 : socket
      - 起動タイプ : daemon type
        - -> s3, cloudwatch logs, elasticsearch service

構成(4)

- networkMode : bridge
  - logDriver : fluentd
    - 通信 : tcp
      - 起動タイプ : daemon type
        - -> s3, cloudwatch logs, elasticsearch service

構成(5)

- networkMode : awsvpc
  - logDriver : fluentd
    - 通信 : socket
      - 起動タイプ : sidecar
        - -> s3, cloudwatch logs, elasticsearch service

構成(6)

- networkMode : bridge
  - logDriver : fluentd
    - 通信 : tcp
      - 起動タイプ : sidecar
        - -> s3, cloudwatch logs, elasticsearch service

### 上記構成案の説明と結果

結果として ECS/Fargate を用いる場合は logDriver fluentd がまだサポートされていないので (2019/10時点)、awslogs となり cloudwatch logs をログ格納先として選択せざるを得ないです。

また ECS/EC2 構成の場合は結論を言うと構成 (5), (6) は sidecar 構成で fluentd コンテナを起動して隣接したコンテナのログを転送するのですが、この構成をとる場合下記が原則になります。

「1タスク / 1インスタンス」

これは fluentd で用いる通信が socket, tcp に関わらずインスタンス内の一つのリソースを複数タスクで共有することができないからです。1タスク/1インスタンスでもサービスは提供できますし考えることは少なくなるのですがそうするとデプロイ時にどのような影響を与えるかは考慮しておいた方がいいです。デプロイ発生時にクラスタインスタンスのオートスケールが発生する事はエンジニアによっては良いとは考えないかもしれません。構成(3), (4) なら「nタスク/1インスタンス」の構成が可能で autoscaling policy configuration をうまく設計すればでデプロイ時もオートスケールが発動せずに済みます。

この sidecar 構成のタスクとインスタンスの関係についてもう少し記すと...、

下記は tcp の場合のコンテナ定義内 logConfiguration です。この場合、インスタンスの24224ポートを指定しています。また fluentd コンテナは portMappings オプションで public (インスタンス) の 24224 ポートを binding しているため、1インスタンスで1 fluentd コンテナしか起動出来ない。つまり1タスク/1インスタンス。

```
    "logConfiguration": {
      "logDriver": "fluentd",
      "options": {
        "fluentd-address": "localhost:24224",
```

そしてこちらは socket の場合コンテナ定義内 logConfiguration。この場合はインスタンスの volume を コンテナ上でマウントするため1インスタンス上に1 fluentd コンテナしか起動しない。つまり1タスク/1インスタンス

```
    "logConfiguration": {
      "logDriver": "fluentd",
      "options": {
        "fluentd-address": "unix:///var/run/fluent/fluent.sock",
```

また(3), (4) の daemon type について簡単に述べると、ECS/EC2 のクラスタインスタンス1つに対して必ず1つの fluentd コンテナを起動させる起動モードのことを言います。(https://docs.aws.amazon.com/ja_jp/AmazonECS/latest/developerguide/ecs_services.html)

よって、Fargate を用いる場合は構成(1)で EC2 構成の場合は構成(2), (3), (4) となるでしょうか。


### アーキテクチャ

図を描くとこんな感じになると思います。大体構成が決まってくるのではないでしょうか。

- 構成(1), (2), (3), (4)の場合

```
+---------------------+      +
| instance / fargate  | ...  |
+---------------------+      |
+------+ +------+            | ap-northeast-1a
| task | | task | ...        |
+------+ +------+            |
|                            +
+---------------------+
| alb                 |
+---------------------+
|                            +
+------+ +------+            |
| task | | task | ...        |
+------+ +------+            | ap-northeast-1c
+---------------------+      |
| instance / fargate  | ...  |
+---------------------+      +
```

- 構成 (5), (6) の場合

```
+----------+                 +
| instance | ...             |
+----------+                 |
+----------+                 | ap-northeast-1a
|   task   | ...             |
+----------+                 |
|                            +
+---------------------+
| alb                 |
+---------------------+
|                            +
+----------+                 |
|   task   | ...             |
+----------+                 | ap-northeast-1c
+----------+                 |
| instance | ...             |
+----------+                 +
```


## バッチについて検討

バッチ処理も ECS を使って行うことができます。この場合の構成を考えると下記が選択肢として残りました。

- Fargate
  - networkMode : awsvpc
     - logDriver : awslogs


構成イメージは下記の様になります。

```
+---------+      +------------------+
|  task   | <--- | cloudwatch event |
+---------+      +------------------+
+---------+
| Fargate |
+---------+
```


この構成になったのは ECS/EC2 構成の場合に構成上の問題があることが発覚したからです。EC2 の場合 ECS Service を起動しないとバッチのための Task が起動しないので daemon として何かしらのタスクをインスタンス上に常時稼働させる必要があります。そして `aws_cloudwatch_event_target` で下記の通りコンテナ定義を上書きすることでバッチ処理を実行できます。

```
{
  "containerOverrides": [
    {
      "name": "nginx",
      "command": ["バッチ処理のコマンド"]
    }
  ]
}
```

よって常時稼働させるインスタンスや ECS Service のリソースが無駄に使用されることになります。そういった点で ECS/Fargate の場合は無駄なインスタンスを起動しなくていい、というメリットがあります。

## CI/CD

CI/CD について考えます。下記のようなアーキテクチャと処理の流れを想定します。ここでは CircleCI ではなく CodeBuild, CodePipeline を想定します。

```
+--------+              +-----------+    +--------------+    +---------------------+
| Github | - webhook -> | Codebuild | -> | CodePipeline | -> | ECS Cluster/Service |
+--------+              +-----------+    +--------------+    +---------------------+
```

処理の流れ

- (1) Github の指定ブランチにプッシュされたのをトリガーに CodeBuild でコンテナがビルドされる。ビルド情報は buildspec.yml に指定
- (2) ビルドされた結果 imagedefinitions.json が生成される
- (3) imagedefinitions.json を元に CodePipeline を経由して ECS Clusnter/Service にデプロイ実施
- (4) rolling-update が実施される

下記は buildspec.yml。

```yaml
version: 0.2

phases:
  pre_build:
    commands:
    - $(aws ecr get-login --region $AWS_DEFAULT_REGION --no-include-email)
    - WEB_REPO=$(aws ecr describe-repositories --repository-names web --output text --query "repositories[0].repositoryUri")
    - WEB_IMAGE=$WEB_REPO:latest
    - APP_REPO=$(aws ecr describe-repositories --repository-names app --output text --query "repositories[0].repositoryUri")
    - APP_IMAGE=$APP_REPO:latest
  build:
    commands:
    - docker build -t $WEB_IMAGE ./web
    - docker push $WEB_IMAGE
    - docker build -t $APP_IMAGE ./app
    - docker push $APP_IMAGE
  post_build:
    commands:
    - printf '[{"name":"web","imageUri":"%s"}, {"name":"app","imageUri":"%s"}]' $WEB_IMAGE $APP_IMAGE > imagedefinitions.json
artifacts:
  files: 
    - imagedefinitions.json
```

## まとめ

networkMode, logDriver を考える中で構成が決まりました。また Terraform でコード化する際の構造化についての考えをまとめ、付随する CI/CD, バッチについてもまとめました。完成するコードは必然的にシンプルなものになると思います。また ECS/Fargate 構成での logDriver の fluentd 対応については今進んでいる最中とのことで、期待しています。そうすると2019年初めのコストダウンと相まってより Fargate を選択しやすい状況になるのではないでしょうか。

