+++
title = "cAdvisor/influxDB/GrafanaでDockerリソース監視"
date = "2015-09-12"
Categories = ["infrastructure"]
description = "cAdvisor、influxDB、Grafana を使った Docker コンテナのリソース監視環境構築"
aliases = [
  "/blog/2015/09/12/cadvisor-influxdb-grafana-docker",
  "/post/2015/09/12/cadvisor-influxdb-grafana-docker"
]
+++
こんにちは。<a href="https://twitter.com/jedipunkz">@jedipunkz</a> です。

今回は Docker ネタです。Docker 導入するにしても監視はどうする？という話になる
と思うのですが、各 Monitoring as a Service を使うにしてもエージェント入れない
といけないしお金掛かることもあるし..で、調べていたら cAdvisor というキーワード
が出てきました。今回は cAdvisor を使ってコンテナの監視が出来ないか、について書
いていきたいと想います。

* cAdvisor とは ?

cAdvisor は Kubernates で用いられているコンポーネントで単体でも利用可能とのこ
と。Google が開発しています。また Docker コンテナの監視においてこの cAdvisor
は一般化しつつあるようです。

https://github.com/google/cadvisor

* 収集したメトリクスの保存

cAdvisor 自体も Docker で起動して、同ホスト上に起動している Docker コンテナの
リソースをモニタリングしてくれます。そのメトリクスデータは幾つかの DB に保存出
来るのですが、そのうちの一つが influxDB です。influxDB は時系列データベースで
す。システムのメトリクスデータを収めるのにちょうどいいデータベースになります。

https://influxdb.com/

* DB に収めたメトリクスの可視化

influxDB に収めたメトリクスデータを可視化するのが Grafana です。Grafana のデー
タソースは influxDB の他にも幾つかあり Elasticsearch, KairosDB, Graphite 等が
それです。

http://grafana.org/

では早速試してみましょう。

前提の環境
-----

今回は Vagrant を使います。また Vagrant 上で上記の3つのソフトウェアを Docker
で稼働します。またどうせなので docker-compose を使って3つのコンテナを一斉に立
ち上げてみましょう。

VagrantFile の準備
----

下記のような VagrantFile を作成します。各ソフトウェアはそれぞれ WebUI を持って
いて、そこに手元のコンピュータから接続するため forwarded_port しています。

```
# -*- mode: ruby -*-
# vi: set ft=ruby :

Vagrant.configure(2) do |config|
    config.vm.box = "ubuntu/trusty64"
    config.vm.network "forwarded_port", guest: 8080, host: 8080
    config.vm.network "forwarded_port", guest: 8083, host: 8083
    config.vm.network "forwarded_port", guest: 3000, host: 3000
    config.vm.network "private_network", ip: "192.168.33.10"
end
```

Docker コンテナの起動と docker-compose.yml の準備
----

Vagrant を起動し docker, docker-compose のインストールを行います。

```bash
$ vagrant up
$ vagrant ssh
vagrant$ sudo apt-get update ; sudo apt-get -y install curl
vagrant$ curl -sSL https://get.docker.com/ | sh
vagrant$ sudo -i
vagrant# export VERSION_NUM=1.4.0
vagrant# curl -L https://github.com/docker/compose/releases/download/VERSION_NUM/docker-compose-`uname -s`-`uname -m` > /usr/local/bin/docker-compose
vagrant# chmod +x /usr/local/bin/docker-compose
```

次に docker-compose.yml を作成します。上記3つのソフトウェアが稼働するコンテナ
を起動するため下記のように記述しましょう。カレントディレクトリに作成します。

```
InfluxSrv:
    image: "tutum/influxdb:0.8.8"
    ports:
        - "8083:8083"
        - "8086:8086"
    expose:
        - "8090"
        - "8099"
    environment:
        - PRE_CREATE_DB=cadvisor
cadvisor:
    image: "google/cadvisor:0.16.0"
    volumes:
        - "/:/rootfs:ro"
        - "/var/run:/var/run:rw"
        - "/sys:/sys:ro"
        - "/var/lib/docker/:/var/lib/docker:ro"
    links:
        - "InfluxSrv:influxsrv"
    ports:
        - "8080:8080"
    command: "-storage_driver=influxdb -storage_driver_db=cadvisor -storage_driver_host=influxsrv:8086 -storage_driver_user=root -storage_driver_password=root -storage_driver_secure=False"
grafana:
    image: "grafana/grafana:2.1.3"
    ports:
        - "3000:3000"
    environment:
        - INFLUXDB_HOST=localhost
        - INFLUXDB_PORT=8086
        - INFLUXDB_NAME=cadvisor
        - INFLUXDB_USER=root
        - INFLUXDB_PASS=root
    links:
        - "InfluxSrv:influxsrv"
```

コンテナの起動
+++

docker コンテナを立ち上げます。

```
vagrant$ docker-compose -d
```

influxDB の WebUI に接続する
----

それでは起動したコンテナのうち一つ influxDB の WebUI に接続していましょう。
上記の VagrantFile では IP アドレスを 192.168.33.10 と指定しました。

URL : http://192.168.33.10:8083

データベースに接続します。

ユーザ名 : root
パスワード : root

接続するとデータベース作成画面に飛びますので Database Datails 枠に "cadvisor"
と入力、その他の項目はデフォルトのままで "Create Database" をクリックします。

cAdvisor の WebUI に接続する
-----

続いて cAdvisor の WebUI に接続してみましょう。

URL : http://192.168.33.10:8080

ここでは特に作業の必要はありません。コンテナの監視が行われグラフが描画されてい
ることを確認します。

Grafana の WebUI に接続する
----

最後に Grafana の WebUI です。

URL : http://192.168.33.10:3000
ユーザ名 : admin
パスワード : admin

まずデータソースの設定を行います。左上のアイコンをクリックし "Data Sources" を
選択します。次に "Add New Data Source" ボタンをクリックします。

下記の情報を入力しましょう。

* Name : influxdb
* Type : influxDB 0.8.x
* Url  : http://influxsrv:8086
* Access : proxy
* Basic Auth User admin
* Basic Auth Password admin
* Database : cadvisor
* User : root
* Password : root


さて最後にグラフを作成していきます。左メニューの "Dashboard" を選択し上部の
"Home" ボランを押し "+New" を押します。

下記の画面を参考にし値に入力していきます。

Metrics を選択しネットワークの受信転送量をグラフにしています。

* series : 'stats'
* alias : RX Bytes
* select mean(rx_bytes)

同じく送信転送量もグラフにします。Add Query を押すと追加できます。

* series : 'stats'
* alias : TX Bytes
* select mean(tx_bytes)

<img src="http://jedipunkz.github.io/pix/grafana_input_data.png" width="80%">

時間が経過すると下記のようにグラフが描画されます。

<img src="http://jedipunkz.github.io/pix/grafana_graph.png" width="80%">

まとめと考察
----

3つのソフトウェア共に開発が活発であり、cAdvisor は特に Docker コンテナの監視と
して一般化しつつあるよう。Kubernates の一部ということもありそう簡単には廃れな
いと想います。コンテナの中にエージェント等を入れることもなく、これで Docker コ
ンテナのリソース監視が出来そう。ただサービス監視は別途考えなくてはいけないなぁ
という印象です。また、今回 docker-compose に記した各コンテナのバージョンは
Docker Hub を確認すると別バージョンもあるので時期が経ってこのブログ記事をご覧
になった方は修正すると良いと想います。ただこの記事を書いている時点では
influxDB の 0.9.x 系では動作しませんでした。よって latest ではなくバージョン指
定で記してあります。

参考にしたサイト
----

* http://qiita.com/atskimura/items/4c4aaaaa554e2814e938
* https://www.brianchristner.io/how-to-setup-docker-monitoring/
