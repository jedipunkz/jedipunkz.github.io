+++
author = ""
categories = ["infrastructure"]
date = "2016-06-21T17:05:25+09:00"
description = ""
featured = ""
featuredalt = ""
featuredpath = ""
linktitle = ""
title = "Vagrant で Mesosphere DC/OS を構築"

+++

こんにちは。<a href="https://twitter.com/jedipunkz">@jedipunkz</a> です。

今回は DC/OS (https://dcos.io/) を Vagrant を使って構築し評価してみようと思います。
DC/OS はその名の通りデータセンタ OS として利用されることを期待され開発された OS で内部で
Docker と Mesos が稼働しています。

一昔前に Mesos のマルチノード構成は構築したことあったのですが、DC/OS はデプロイ方法が全く変わっていました。
はじめに想定する構成から説明していきます。

想定する構成
----

本来 DC/OS は public, private ネットワーク構成ですが利用するレポジトリではこのような構成が想定されていました。

```shell
+----+ +----+ +----+ +------+
| m1 | | a1 | | p1 | | boot |
+----+ +----+ +----+ +------+
|      |      |      |
+------+------+------+--------- 192.168.65/24
```

各ノードは下記の通り動作します。

* m1 : Mesos マスタ, Marathon
* a1 : Mesos スレーブ(Private Agent)
* p1 : Mesos スレーブ(Public Agent)
* boot : DC/OS インストレーションノード

前提の環境
----

Vagrant が動作するマシンであれば問題ないと思いますが私は下記の構成で利用しました。
比較的たくさんのマシンリソースを使うのでメモリ 8GB はほしいところです。

* Mac OSX
* Vagrant
* Virtualbox

事前の準備
----

事前の手順を記します。

* 予め用意された dcos-vagrant を取得する

```shell
$ git clone https://github.com/dcos/dcos-vagrant
```

* Mac OSX の hosts ファイルをダイナミック編集する Vagrant プラグインをインストール

```shell
$ vagrant plugin install vagrant-hostmanager
```

構築手順
----

それでは構築手順です。

* DC/OS が利用する config を環境変数に指定指定

```shell
$ export DCOS_CONFIG_PATH=etc/config-1.7.yaml
```

* DC/OS をレポジトリのルートディレクトリに保存

DC/OS 1.7.0 (Early Access)(2016/06/21現在) をダウンロードしてレポジトリのルートディレクトリにインストール

```shell
$ cd dcos-vagrant
$ wget https://downloads.dcos.io/dcos/EarlyAccess/dcos_generate_config.sh
```

* VagrantConfig を作成

'VagrantConfig.yaml.example' というファイルがレポジトリ内ルートディレクトリにあるのでこれを元に下記の通りファイルを生成。元のファイルのままだと比較的大きな CPU/Mem リソースが必要になるので環境に合わせてリソース量を指定。

```yaml
m1:
  ip: 192.168.65.90
  cpus: 1
  memory: 512
  type: master
a1:
  ip: 192.168.65.111
  cpus: 1
  memory: 1024
  memory-reserved: 512
  type: agent-private
p1:
  ip: 192.168.65.60
  cpus: 1
  memory: 1024
  memory-reserved: 512
  type: agent-public
  aliases:
  - spring.acme.org
  - oinker.acme.org
boot:
  ip: 192.168.65.50
  cpus: 1
  memory: 1024
  type: boot
```

* デプロイを実施

```shell
$ vagrant up m1 a1 p1 boot
```

DC/OS の UI
----

インストールが完了すると下記のアドレスで DC/OS の UI にアクセスできます。

http://m1.dcos/

<img src="http://jedipunkz.github.io/pix/dcos-mesos.png" width="70%">

Marathon の UI
----

下記のアドレスで Marathon の UI にアクセスできます
Marathon は分散型の Linux Init 機構のようなものです。

http://m1.dcos:8080/

<img src="http://jedipunkz.github.io/pix/dcos-marathon.png" width="70%">

Chronos の UI
----

下記のアドレスで Chronos の UI にアクセスできる
Chronos は分散型のジョブスケジューラーであり cron のようなものです。

http://a1.dcos:1370/

<img src="http://jedipunkz.github.io/pix/dcos-chronos.png" width="70%">

Marathon で redis サーバを立ち上げる
----

テストで redis サーバを立ち上げてみる。Mesos-Slave (今回の環境だと a1 ホスト) 上に Docker コンテナとして redis サーバが立ち上がることになる。

* Marathon の UI にて "Create Application" を選択
* General タブの ID に任意の名前を入力
* General タブの Command 欄に 'redis-server' を入力
* Docker Container タブの Image 欄に 'redis' を入力
* 'Create Application' を選択

結果、下記の通りアプリケーションが生成される

<img src="http://jedipunkz.github.io/pix/dcos-marathon-redis.png" width="70%">

まとめと考察
----

一昔前の Mesos + Marathon + Chronos とはだいぶデプロイ方法が変わっていた。だが構成には大きな変化は見られない。
本来 Mesos 構成は public なネットワークと private なネットワークを別けた形とするが今回は簡易的な構成なため private のみで構築した。
public なネットワークを構築した際の p1 ホスト上へのジョブのスケールがどのような動きをするか、今後調べる必要がありそうです。


参考 URL
---

手順は右記のものを利用。
https://github.com/dcos/dcos-vagrant/blob/master/docs/deploy.md
