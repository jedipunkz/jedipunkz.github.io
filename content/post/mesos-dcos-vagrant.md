+++
author = ""
categories = ["infrastructure"]
date = "2016-06-21T17:05:25+09:00"
description = "Vagrant を使った Mesosphere DC/OS のデータセンタ OS 環境構築と評価"
featured = ""
featuredalt = ""
featuredpath = ""
linktitle = ""
aliases = ["/blog/2016/06/21/mesos-dcos-vagrant/"]
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

※ 20160625 下記追記

構成
----

ここからは Mesosphere DC/OS の内部構成を理解していきます。主となる mesos-master, mesos-slave の構成は下記の通り。

* Mesos-Master Node 構成

```shell
+--------------+
| mesos-master |
+--------------+ +-----------+ +----------+ +-------------+ +-----------+ +-----------+
|   zookeeper  | | mesos-dns | | marathon | | adminRouter | | minuteman | | exhibitor |
+--------------+ +-----------+ +----------+ +-------------+ +-----------+ +-----------+
|                  mesos-master node                                                  |
+-------------------------------------------------------------------------------------+
```

* * * * * * * * Mesos-Slave (Mesos-Agent) Node 構成

```shell
+-------------+ +---+---+---+---+
| m-executor  | | c | c | c | c |
+-------------+ +---+---+---+---+
| mesos-slave | | docker-daemon |
+-------------------------------+
|        mesos-slave node       |
+-------------------------------+
```

各プロセスの役割
----

上記の図の各要素を参考資料を元にまとめました。

* mesos-master

masos-slave node からの情報を受け取り mesos-slave へプロセスを分配する
役割。mesos-master は zookeeper によってリーダー選出により冗長構成が保
たれている。

* mesos-dns

mesos フレームワーク内での DNS 解決を行うプロセス。各 mesos-master ノー
ド上に稼働している。通常の DNS でいうコンテンツ DNS (Authoritative
DNS)になっており mesos-master からクラスタ情報を受け取って DNS レコー
ド登録、それを mesos-slave が DNS 参照する。mesos-slave が内部レコード
に無い DNS 名を解決しに来た際にはインターネット上の root DNS へ問い合
わせ実施。

* marathon

コンテナオーケストレーションを司り mesos-slave へ支持を出しコンテナを
稼働する役割。各 mesos-master 上で稼働し zookeeper 越しに mesos-master
のカレントリーダを探しだしリクエストを創出。他に下記の機能を持っている。
'HA', 'ロードバランス', 'アプリのヘルスチェック', 'Web UI', 'REST
API', 'Metrics'。

* adminRouter

実態は nginx。各サービスの認証と Proxy の役割を担っている。

* minuteman

L4 レイヤのロードバランサ。各 mesos-master ノードで稼働。

* zookeeper

mesos-master プロセスを冗長構成させるためのソフトウェア。

* exhibitor

zookeeper のコンフィギュレーションを実施。

* mesos-slave

Task を実行する役割。内部で meosos-executor (上記 m-executor) を実行し
ている。

* m-executor (mesos-executor)

mesos-slave ノード上でサービスのための TASK を稼働させる。

起動シーケンス
----

ここからは mesos-master, mesos-slave の起動シーケンスについて、まとめてきます。

mesos-master

* exhibitor が起動し zookeeper のコンフィギュレーションを実施し zookeeper を起動
* mesos-master が起動。自分自身をレジスト後、他の mesos-master ノードを探索
* mesos-dns が起動
* mesos-dns が leader.mesos にカレントリーダの mesos-master を登録
* marathon が起動し zookeeper 越しに mesos-master を探索。
* adminRouter が起動し各 UI (mesos, marathon, exhibitor) が閲覧可能に。

mesos-slave

* leader.mesos に ping を打って mesos-master のカレントリーダを見つけ出し mesos-slave 稼働。
* mesos-master に対して自分自身を 'agent' として登録。
* mesos-master はその登録された IP アドレスを元に接続を試みる
* mesos-slave が TASK 実行可能な状態に

まとめと考察
----

一昔前の Mesos + Marathon + Chronos とはだいぶデプロイ方法が変わっていた。だが構成には大きな変化は見られない。
AWS のような public, private ネットワークが別れたプラットフォームでは mesos-slave (DC/OS 的には Agent とも呼ぶ)は public agent, private agent として別けて管理される模様。public agent は AWS の ELB 等で分散され各コンテナ上のアプリにクエリがインターネットからのリクエストに応える。private agent はプライベートネットワーク上に配置されて public agent からのリクエストにも応える。また、mesos-master 達は別途 admin なネットワークに配置するのが Mesosphare の推奨らしい。

だがしかし public, private を別けずに DC/OS を構成することも可能なように思えた。下記のように p1 を削除して構成して物理・仮想ロードバランサでリクエストを private agent に送出することでも DC/OS は機能するので。

```shell
$ vagrant up m1 a1 boot
```

ちなみに a2, a3, ... と数を増やすことで private agent ノードを増やすことが可能。

あとマニュアルインストール手順(公式)を実施してみて解ったが、pulic, private ネットワークを各ノードにアタッチして mesos-master, mesos-slave, またその他の各機能はプライベートネットワークを、外部からのリクエストに応えるためのパブリックネットワーク、といった構成も可能でした。

参考 URL
---

* 手順は右記のものを利用。
https://github.com/dcos/dcos-vagrant/blob/master/docs/deploy.md
* https://docs.mesosphere.com/1.7/overview/architecture/
* https://docs.mesosphere.com/1.7/overview/security/
