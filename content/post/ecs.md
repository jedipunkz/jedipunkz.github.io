---
title: "ECS の構成と Terraform コンポーネント化について考える"
date: 2019-10-17T18:37:36+09:00
Categories: ["infrastructure"]
draft: false
---
こんにちは。<a href="https://twitter.com/jedipunkz">@jedipunkz</a> です。

単純な API/WEB サービスを立ち上げる時に 2019 年時点でデファクトスタンダードになっているプラットフォームとしては、

- GKE
- ECS

となっている気がします。AKS, EKS でバリバリ運用していますって話はあまりまだ聞かないです。Kubernetes & gRPC で運用しているケースは最近聞くようになってきましたが RESTful API で開発しているケースがまだ圧倒的に多い印象です。またコンテナを用いない構成は今はあまり考える人は居ないのではないでしょうか。で、尚且つ国内での話を言うと aws を用いているケースが多くそうなると必然的に ECS となるって現場は多い気がします。

最近の仕事で ECS をどのような構造で Terraform 化できるか開発しながら試していたのですが、今回は ECS を Terraform コード化する前提で、どのようにコードの構造化するのが良いのか、どのような ECS 構成を組むのが良いのかについて幾つかの観点で模索してみたいと思います。

## Terraform コードのコンポーネント化

Terraform を使ったコードを開発する上で気を付ける事としてはコンポーネント化だと思います。下記を考慮してコンポーネント化するのが良いと思っています。(下記は Pragmatic Terraform on AWS より)

- 影響範囲
- ステートレスかステートフルか
- 安定度
- ライフサイクル

そうすると具体的に Terraform のコードはどのような構造になるでしょうか。自分は下記のようにコンポーネント化して Terraform の実行単位を別けました。

| コンポーネント | 具体的なリソース |
|---------------|----------------|
| ネットワーク | vpc, route table, igw, endpoint, subnet |
| ECS 本体 | ecs, alb, autoscaling, cloudwatch, iam |
| CI/CD | codebuild, codepipeline, ecr, iam |
| パラメータ | ssm |
| データストア | s3, rds, elasticache ... |

vpc や subnet に関して頻繁に更新を掛ける人は少ないのではないでしょうか。よってネットワークは "影響範囲" を考慮しつつコンポーネントを別けました。また、同じ理由でパラメータ・CI/CD も ECS 本体とは実行単位を別けた方が好ましいと思います。また "ステートフルかステートレスか" という観点でデータベースやストレージは頻繁に更新する ECS 本体とは別けるべきでしょう。

### コンポーネント化する際に Terraform Remote States 機能を用いる

またそれぞれのコンポーネント間で Terraform Attributes を再利用する必要が出てくると思いますがその場合は Terraform Remote States 機能を用いると良いです。具体的には下記のように記します。

"ネットワーク" コンポーネント内の provider.tf で下記のように記して states を s3 へ格納します。

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

"ネットワーク" コンポーネント内 vpc.tf で下記のように vpc を作成します。

```
resource "aws_vpc" "example" {
  cidr_block           = "10.0.0.0/16"
}
```

"ネットワーク" コンポーネント内 output.tf で下記のように output を指定します。

```
output "example_vpc_id" {
  value = aws_vpc.example.id
}
```

すると "ネットワーク" 以外のコンポーネント (例 : ECS 本体等) で下記のように terraform_remote_state を記すと

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

下記のように他のコンポーネント(この場合ネットワーク VPC) を作成した際の Terraform Attribute が呼び出せます。

```
vpc_id = data.terraform_remote_state.network.outputs.example_vpc_id
```

実際には vpc を作成した際の terraform tfstate が s3 に格納されていてその s3 内の tfstate を他のコンポーネント作成時に呼び出す、といったことをしています。この機能によりコンポーネント化を容易に実現することが可能です。

## ECS 構成

### ネットワークモード

ECS にあるネットワークモードのどれを用いるのがベストなのか検討する必要があります。後述するロギングの情報と合わせて考えるので、ここでは一般的な情報のみを記しておきます。

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

### ロギング

次にロギング。ECS の場合のロギングの選択肢としては Cloudwatch Logs か Fluentd か、となると思います。ログの格納先は何が考えられるでしょうか。s3, cloudwatch logs, elasticsearch を通常考えると思いますが、格納した後のログの再利用を考えるとどうなるでしょう。自分は Elasticsearch にログを格納して Kibana で可視化するケースが多いのですが、ここで注意が必要です。Cloudwatch Logs から Elasticsearch Service へログのストリームをする際に圧縮されたデータを展開しつつストリームする必要があります。これを Terraform でコード化するのは結構厄介です。具体的には Lambda Function を作成して Python or Nodejs でコードを書き Firehose を使って Elasticsearch Service へ繋ぎ込みます。その点では Fluentd -> Elasticsearch Service と直接ストリーム出来れば都合がいいです。ということは Fluentd 一択？と考えたいところなのですが... Fluentd を ECS で扱うことを考えると結構構成に悩みます。

### 考慮点を踏まえた結果の ECS 構成

上記の "ネットワーク" と "ロギング" の情報を踏まえて考えると下記のような構成パターンが考えられます。

#### ECS/Fargate 構成の場合

構成(1)

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

### 結果

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

構成が決まったところで付随する機能について考えます。

バッチ処理も ECS を使って行うことができます。この場合の構成を考えると下記が選択肢として残りました。

- Fargate
  - networkMode : awsvpc
    - logDriver : awslogs

図を描くと...

```
+---------+      +------------------+
|  task   | <--- | cloudwatch event |
+---------+      +------------------+
+---------+
| Fargate |
+---------+
```

となります。

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

ネットワークモード・ロギングを観点に構成を決め Terraform でコード化し、CI/CD とバッチについても考えていました。完成するコードは必然的にシンプルなものになると思います。また ECS/Fargate 構成での logDriver の fluentd 対応については今進んでいる最中とのことで、期待しています。そうすると2019年初めのコストダウンと相まってより Fargate を選択しやすい状況になるのではないでしょうか。

