+++
title = "期待のツール Terrafomer の基本動作方法と問題点"
description = "クラウドリソースから Terraform コードと tfstate を生成する Terraformer の基本的な使い方と、実際に使う中で見つかった問題点を解説"
date = "2019-07-26"
Categories = ["infrastructure"]
+++
こんにちは。<a href="https://twitter.com/jedipunkz">@jedipunkz</a> です。

少し前の話なのですが Google Cloud Platform が Terraformer というツールを出しました。正確には数年前に Google が買収した Waze というサービスのエンジニア達が開発したようです。このツールは GCP, AWS, OpenStack, Kubernetes 等、各クラウド・プラットフォームに対応したリバース Terraform と言えるツールになっていて、構築されたクラウド上の状態を元に terraform の .tf コードと .tfstate ファイルをインポートしてくれます。`terraform import` は tfstate のインポートのみに対応してたのでこれは夢のツールじゃないか！ということで当初期待して使い始めたのですが、使ってみる中で幾つかの問題点も見えてきました。今回はその気になった問題点を中心に Terraformer の基本的な動作を説明していきたいと思います。

## 公式サイト

下記の Github アカウントで公開されています。

https://github.com/GoogleCloudPlatform/terraformer

## Requrements

Terraformer を動作させるには下記のソフトウェアが必要です。今回は macos を想定して情報を記していますが Linux でも動作します。適宜読み替えてください。インストール方法と設定方法はここでは割愛させて頂きます。

- macos
- homebrew
- terraform
- awscli

## 今回の前提のクラウドプラットフォーム

自分がいつも使っているプラットフォームということで今回は aws を前提に記事を書いていきます。ここが結構肝心なところで、Google Cloud Platform が開発したこともあり GCP 向けの機能が一番 Feature されているように読み取れます。つまり aws を対象とした Terraformer の機能が一部追いついていない点も後に述べたいと思います。

## 動作させるまでの準備

Terraform と同様に Terraformer でも動作せせるディレクトリが必要になります。

```bash
mkdir working_dir
cd working_dir
```

Terraformer を動作させるために Terraform の plugin が必要です。先に述べたようにここでは 'aws' Plugin をダウンロードします。そのために init.tf を下記の通り作成します。

```bash
echo 'provider "aws" {}' > init.tf
```

`terraform init` コマンドを実行して Terraform 'aws' plugin をダウンロードします。

```bash
terraform init
```

awscli の profile を用意します。インポートしたい環境を管理している aws アカウントに IAM ユーザを作成して、その secret key, secret access key とリージョン情報を記して下さい。

```
aws configure
```

## 基本的動作の確認

### インスタンス・サブネット・セキュリティグループ情報をインポート

ここではインスタンスを構成する EC2 インスタンス・サブネット・セキュリティグループのリソースタイプを指定してインポート操作を行ってみます。インポートは下記のコマンド1つ実行するのみです。

```bash
terraformer import aws --resources=ec2_instance,sg,subnet --connect=true --regions=ap-northeast-1
```

結果、下記のようなディレクトリ構成でファイルがインポートされます。

```
.
├ ─ ─  generated
│    └ ─ ─  aws
│        ├ ─ ─  ec2_instance
│        │    └ ─ ─  ap-northeast-1
│        │        ├ ─ ─  instance.tf
│        │        ├ ─ ─  outputs.tf
│        │        ├ ─ ─  provider.tf
│        │        └ ─ ─  terraform.tfstate
│        ├ ─ ─  sg
│        │    └ ─ ─  ap-northeast-1
│        │        ├ ─ ─  outputs.tf
│        │        ├ ─ ─  provider.tf
│        │        ├ ─ ─  security_group.tf
│        │        └ ─ ─  terraform.tfstate
│        └ ─ ─  subnet
│            └ ─ ─  ap-northeast-1
│                ├ ─ ─  outputs.tf
│                ├ ─ ─  provider.tf
│                ├ ─ ─  subnet.tf
│                ├ ─ ─  terraform.tfstate
│                └ ─ ─  variables.tf
└ ─ ─  init.tf
```

早速インスタンスを構成する generated/aws/ec2_instance/ap-northeast-1/instance.tf を確認してみます。

```
resource "aws_instance" "i-************_test-instance" {
  ami                         = "ami-***********"
  associate_public_ip_address = true
  availability_zone           = "ap-northeast-1a"
  cpu_core_count              = "1"
  cpu_threads_per_core        = "1"

  snip ...

  subnet_id         = "subnet-****************" // サブネット

  snip...

  vpc_security_group_ids = ["sg-****************"] // セキュリティグループ
```

このディレクトリ構成と instance.tf の内容から下記のことが言えると思います。

- aws インフラリソース毎に terraform を実行する想定のディレクトリが別れている
- insntace.tf を見るとリソース ID が直打ちになっていて依存関係が解決されていないコードになっている

### filter オプションで特定のリソースのコードだけインポート

下記のように filter オプションを用いて特定の ID のリソースだけ .tf, .tfstate ファイルをインポートすることも可能です。

```bash
terraformer import aws --resources=vpc --filter=aws_vpc=vpc-********* --regions=ap-northeast-1
```

ここまでで幾つか問題点に気がつくと思います。

### 自分が気になった利用する上での問題点その1

Terraform は様々な単位でコードを束ねる事は勿論なのですが、何かしらのサービスを形成するシステム一式という単位でコードを束ねる事はしてくれない、ということになります。例えば instance, subnet 両方に影響を与える修正をする場合 terraform コマンドを2つのディレクトリで実行しなければいけないことになります。なんだかスッキリしません...。

### 自分が気になった利用する上での問題点その2

通常 Terraform のコードを書く際に Resource 間の依存関係保ちます。例えば 'aws_instance' 内の 'subnet_id' には通常下記のように依存関係を記します。

```
subnet_id = "${aws_subnet.foo.id}"
```

ですが生成されたコードを確認すると id がベタ書きされています。Resource 間の依存関係が解決されていません。

### 自分が気になった利用する上での問題点その3

Terraform の Module 機能が用いられていないコードが生成されています。コード全体を簡潔に尚且可読性良くするために Module 機能を用いて Terraform コードを書くのが一般的になっているので、全くのベタ書きなコードが生成されているところに若干問題を感じます。


## 今現在 2019/07 で対応している aws インフラリソース一覧

2019/07 現在で対応している aws のインフラリソース一覧です。Terraform の Resources 名で記してあります。

- aws_elb
- aws_lb
- aws_lb_listener
- aws_lb_listener_rule
- aws_lb_listener_certificate
- aws_lb_target_group
- aws_lb_target_group_attachment
- aws_autoscaling_group
- aws_launch_configuration
- aws_launch_template
- aws_db_instance
- aws_db_parameter_group
- aws_db_subnet_group
- aws_db_option_group
- aws_db_event_subscription
- aws_iam_role
- aws_iam_role_policy
- aws_iam_user
- aws_iam_user_group_membership
- aws_iam_user_policy
- aws_iam_policy_attachment
- aws_iam_policy
- aws_iam_group
- aws_iam_group_membership
- aws_iam_group_policy
- aws_internet_gateway
- aws_network_acl
- aws_s3_bucket
- aws_s3_bucket_policy
- aws_security_group
- aws_subnet
- aws_vpc
- aws_vpn_connection
- aws_vpn_gateway
- aws_route53_zone
- aws_route53_record
- aws_acm_certificate
- aws_elasticache_cluster
- aws_elasticache_parameter_group
- aws_elasticache_subnet_group
- aws_elasticache_replication_group
- aws_cloudfront_distribution
- aws_instance

### 自分が気になった利用する上での問題点その3

Google Cloud Platform が開発していることもあり Google Cloud の対応状況は良いと思うのですが(ごめんなさい、あまり確認出来ていません)ですが aws に関して対応されているリソースは下記で全てです。例えば基本的なインフラリソース aws_iam_instance_profile もないのでリソース ID を直打ちする必要がありますし、cloudwatch 等もありません。対応状況はだいぶ良くないのかなぁという印象です。

## 考察

以上、簡単にですが基本的な利用方法と自分が気になった箇所を紹介させてもらいました。

Terraform 自体にもインポート機能がありますが tfstate のみ対応していて .tf をインポートすることが出来ません。なのでこのツールへの期待はとても大きかったのですが、いま現時点では既存環境のコードを書く時にインポートして参考にする、という程度の使い方しか出来ないかもしれません。問題点を中心に Terraformer がインポートするコードの特徴を下記にあげます。

- `terraform plan/apply` 実行する単位が Resource 単位に別れてしまっている
- Resource 間の依存関係が解決されていない
- Module が用いられていない .tf コード
- 対応している aws Resource がまだまだ追いついていない

ただ、まだ発表されて間もないツールなので今後に期待です。完成度が上がれば最高のツールになるでしょう。対応している aws resource がまだ追い付いていないもの今後開発が進めば時間だけの問題な気もします。また今回私は動作確認出来ていないのですが、GCP であれば対応している Resource 状況も良さそうです。

