+++
title = "CodeDeploy, S3 を併用して CircleCI により VPC にデプロイ"
date = "2015-11-15"
Categories = ["infrastructure"]
description = "CircleCI、AWS CodeDeploy、S3 を組み合わせた VPC プライベートインスタンスへのデプロイ方法"
aliases = [
  "/blog/2015/11/15/circleci-codedeploy",
  "/post/2015/11/15/circleci-codedeploy"
]
+++
こんにちは。<a href="https://twitter.com/jedipunkz">@jedipunkz</a> です。

最近、業務で CircleCI を扱っていて、だいぶ "出来ること・出来ないこと" や "出来ないこと
に対する回避方法" 等のノウハウが若干溜まってきたので共有したいなと思います。

この記事の前提...
----

ここでは CodeDeploy の設定方法や、CircleCIの設定方法等に関しては記述しませ
ん。あくまで、Tips 的な内容にしています。また運用する上で想定できる問題点と、
それの回避方法等...についてまとめています。

CirlceCI と併用するサービスについて
----

CircleCI は Github と連携してレポジトリ内の制御ファイル circle.yml に従ってテ
スト・ビルド・デプロイを実施してくれる CI サービスです。ただ CircleCI は自分た
ちの管理しているシステム外にあるので、AWS VPC を用いていると VPC 内のプライベー
トインスタンスにデプロイするのが難しいです。プロキシ挟んで・・ってことは出来そ
うですがプロキシの運用もしたくない、AWS のインフラリソースに任せることが出来た
らインスタンス・インスタンス上のミドルウェアを運用しなくて済むので運用コストが
省けそう。ってことで

* AWS S3 (https://aws.amazon.com/jp/s3/)
* AWS CodeDeploy (https://aws.amazon.com/jp/codedeploy/)

を併用することを考えました。

S3 は皆さんご存知のオブジェクトストレージです。CircleCI 用のバケットを作って、
ビルドした結果を格納します。私の務めている会社ではプログラミング言語として
Scala を用いているので SBT というツールを使ってビルドします。その結果もバージョ
ニングしつつ S3 バケットに格納できれば、万が一問題が発生した時にバイナリ毎切り
戻すことが出来そうです。

また CodeDeploy は EC2 インスタンス・またオンプレのインスタンスへコードのデプ
ロイが可能になるサービスです。東京リージョンでは 2015/08 から利用が可能になり
ました。これの便利なところは CircleCI 等の CI サービスから簡単に叩けて、VPC 内
のインスタンスに対してもデプロイが可能なところです。

Tips 的な情報として
+++

circle.yml という CircleCI の制御ファイルがあります。Git レポジトリ内に格納することで
CircleCI の動作を制御することが出来ます。この記事では circle.yml の紹介をメインとしたい
と思います。

Git push からデプロイまでを自動で行う circle.yml
----

Github への push, merge をトリガーとしてデプロイまでの流れを自動で行う流れを組む場合の
circle.yml を紹介します。全体の流れとしては...

* レポジトリに git push, merge ことがトリガで処理が走る
* circle.yml を元にテスト・ビルド(場合によってはテストのみ) が走る
* S3 バケットにビルドされた結果が格納される
* CodeDeploy が実行され S3 バケット内のビルドされた成果物を対象のインスタンスにデプロイする

となります。

```yml
machine:
  environment:
    SBT_VERSION: 0.13.9
    SBT_OPTS: "-Xms512M -Xmx1536M -Xss1M -XX:+CMSClassUnloadingEnabled -XX:MaxPermSize=256M"
  services:
    - docker

dependencies:
  pre:
    - (事前に実行したいコマンド・スクリプトを記述)
  cache_directories:
    - "~/.sbt"

test:
  override:
    - sbt compile

deployment:
  production:
    branch: master
    codedeploy:
      codedeploy-sample:
        application_root: /
        region: ap-northeast-1
        revision_location:
          revision_type: S3
          s3_location:
            bucket: circleci-sample-bucket
            key_pattern: filename-{CIRCLE_BRANCH}-{CIRCLE_BUILD_NUM}.zip
        deployment_group: codedeploy-sample-group
```

#### それぞれのパラメータの意味

上記 circle.yml の重要なパラメータのみ説明していきます。
私が務めている会社は Scala を使っていると冒頭に説明しましたがテスト・ビルドに
SBT を使うのでこのような記述になっています。Ruby や Python でも同様に記述でき
ると思いますので読み替えてください。

* machine -> environment : 全体で適用できる環境変数を定義します
* dependencies -> pre : 事前に実行したいコマンド等を定義できます
* test -> overide : テストを実行するコマンドを書きます。
* deployment -> production -> branch : 適用するブランチ名と本番環境であることを記述します。
* 'codedeploy-sample' : CodeDeploy 上にサンプルで作成した 'Application' 名です
* s3_location -> bucket : ビルドした成果物を S3 へ格納する際のバケット名を記します
* s3_location -> key_pattern : S3 バケットに収めるファイル名指定です
* deployment_group : CodeDeploy で定義する 'Deployment-Group' 名です

より詳細な説明を読みたい場合は下記の URL に描いてあります。

https://circleci.com/docs/configuration

S3 のみににデプロイする例
----

上記の circle.yml ではビルドとデプロイを一気に処理するのですが、テスト・ビルドとデプロイを別けて
実行したい場面もありそうです。流れとしては...

* レポジトリに git push, merge ことがトリガで処理が走る
* circle.yml を元にテスト・ビルド(場合によってはテストのみ) が走る
* S3 バケットにビルドされた結果が格納される

です。S3 のバケットに格納されたアプリを CodeDeploy を使ってデプロイするのは CodeDeploy の
API を直接叩けば出来そうです。

http://docs.aws.amazon.com/codedeploy/latest/APIReference/API_CreateDeployment.html

このリファレンスにある "CreateDeployment" については後に例をあげます。

ただ、同様のサービスとして TravisCI 等は S3 にのみデプロイを実施する仕組みが用意されているのですが
CircleCI にはこの機能はありませんでした。サポートに問い合わせもしたのですが、あまり良い回答ではありませんでした。

よって、下記のように awscli をテストコンテナ起動の度にインストールして S3 にアクセスすれば
上記の流れが組めそうです。

```yml
machine:
  environment:
    SBT_VERSION: 0.13.9
    SBT_OPTS: "-Xms512M -Xmx1536M -Xss1M -XX:+CMSClassUnloadingEnabled -XX:MaxPermSize=256M"
  services:
    - docker

dependencies:
  pre:
    - sudo pip install awscli
  cache_directories:
    - "~/.sbt"

test:
  override:
    - sbt compile

deployment:
  master:
    branch: master
    commands:
      - zip -r sample-code-${CIRCLE_BRANCH}-${CIRCLE_BUILD_NUM}.zip .
      - aws s3 cp
        sample-code-${CIRCLE_PROJECT_REPONAME}-${CIRCLE_BRANCH}-${CIRCLE_BUILD_NUM}.zip s3://<バケット名>/<ディレクトリ>/ --region ap-northeast-1
```

事前に awscli をインストールしているだけです。

S3 バケットに格納された成果物を CodeDeploy を使って手動でデプロイするには下記
のコマンドで実施できます。

```bash
$ aws deploy create-deployment \
  --application-name codedeploy-sample \
  --deployment-config-name CodeDeployDefault.OneAtATime \
  --deployment-group-name codedeploy-sample-group \
  --description "deploy test" \
  --s3-location bucket=<バケット名>,bundleType=zip,key=<ファイル名>
  {
    "deploymentId": "d-2B4OAMT0B"
   }
```

deploymentId は CodeDeploy 上の Application に紐付いた ID です。CodeDeploy の
API を叩くか AWS コンソールで確認可能です。

#### CircleCI の問題点とそれの回避方法

* production と staging

1つのブランチで管理できる circle.yml は1つです。このファイルの中で定義できる '本番用', '開発用' の定義は
deployment -> production, staging の2種類になります。この2つで管理しきれない環境がある場合(例えば staging 以前の
development 環境がある) は、レポジトリのブランチを別けて circle.yml を管理する方法があると思います。

* 複数のデプロイ先があるレポジトリの運用

同一のレポジトリ内で管理しているコードのデプロイ先が複数ある場合は CodeDeploy 上で1つの Application に対して複数の
Deployment-Group を作成することで対応できます。ただ、cirlce.yml で定義できるデプロイ先は deployment_group: の1つ(
厳密に言うと production, staging の2つ) になるので、こちらもブランチによる circle.yml の別管理で回避できそうです。

こちらの問題については CircleCI 的にはおそらく「1つのレポジトリで管理するデプロイ先は1つに」というコンセプトなのかもしれません。

#### AWS IAM ユーザにアタッチする Policy 作成

IAM ユーザを CircleCI に事前に設定しておくことで直接 AWS のリソースを操作出来るのですが、
そのユーザにアタッチしておくべき Policy について例をあげておきます。

特定の S3 バケットにオブジェクト Put する Policy

```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Sid": "Stmt1444196633000",
            "Effect": "Allow",
            "Action": [
                "s3:PutObject"
            ],
            "Resource": [
                "arn:aws:s3:::<S3 バケット名>/*"
            ]
        }
    ]
}
```

CodeDeploy の各 Action を実行する Policy

```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Action": [
                "codedeploy:RegisterApplicationRevision",
                "codedeploy:GetApplicationRevision"
            ],
            "Resource": [
                "*"
            ]
        },
        {
            "Effect": "Allow",
            "Action": [
                "codedeploy:CreateDeployment",
                "codedeploy:GetDeployment"
            ],
            "Resource": [
                "*"
            ]
        },
        {
            "Effect": "Allow",
            "Action": [
                "codedeploy:GetDeploymentConfig"
            ],
            "Resource": [
                "*"
            ]
        }
    ]
}
```

まとめ
----

CodeDeploy, S3 を併用することで CircleCI を使っても VPC 内のプライベートインス
タンスにデプロイできることが判りました。もし EC2 インスタンスを使っている場合
は他の方法も取れることが判っています。circle.yml 内の pre: で指定出来るコマン
ド・スクリプトで EC2 インスタンスに紐付いているセキュリティグループに穴あけ処
理を記述すれば良さそうです。デプロイが終わったら穴を塞げばいいですね。この辺の
例については国内でもブログ記事にされている方がいらっしゃいますので参考にしてくだ
さい。

