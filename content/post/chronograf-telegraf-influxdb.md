+++
title = "Chronograf, Telegraf, Influxdbでサーバとコンテナ情報を可視化する"
date = "2015-12-28"
Categories = ["infrastructure"]
description = "Chronograf、Telegraf、Influxdb を使ったサーバと Docker コンテナのメトリクス可視化"
aliases = [
  "/blog/2015/12/28/chronograf-telegraf-influxdb",
  "/post/2015/12/28/chronograf-telegraf-influxdb"
]
+++
こんにちは。<a href="https://twitter.com/jedipunkz">@jedipunkz</a> です。

Influxdb が Influxdata (https://influxdata.com/) として生まれ変わり公式の
メトリクス送信エージェント Telegraf と可視化ツール Chronograf をリリースしたので
使ってみました。

3つのツールの役割は下記のとおりです。

* Chronograf : 可視化ツール, Grafana 相当のソフトウェアです
* Telegraf : メトリクス情報を Influxdb に送信するエージェント
* Influxdb : メトリクス情報を格納する時系列データベース

以前に cAdvisor, influxdb, grafana を使って Docker コンテナのメトリクスを可視
化する記事を書きましたが telegraf を使うとサーバ情報と合わせて Docker コンテナ
のメトリクスも influxdb に送信することが出来ます。個人的にはそのコンテナ情報の
扱いもサーバ情報と同様に扱ってくれる点に期待しつつ、評価してみました。

今回の環境
----

今回は Ubuntu 15.04 vivid64 を使ってテストしています。

influxdb をインストールして起動
----

最新リリース版の deb パッケージが用意されていたのでこれを使いました。

```
wget http://influxdb.s3.amazonaws.com/influxdb_0.9.5.1_amd64.deb
sudo dpkg -i influxdb_0.9.5.1_amd64.deb
sudo service influxdb start
```

telegraf のインストールと起動
----

こちらも deb パッケージで。

```
wget http://get.influxdb.org/telegraf/telegraf_0.2.4_amd64.deb
sudo dpkg -i telegraf_0.2.4_amd64.deb
```

コンフィギュレーションですが今回は CPU, Disk, Net, Docker のメトリクス情報を送
信するようにしました。

```
[agent]
    interval = "0.1s"

[outputs]

[outputs.influxdb]
    urls = ["http://localhost:8086"]
    database = "telegraf-test"
    user_agent = "telegraf"

[plugins]
[[plugins.cpu]]
  percpu = true
  totalcpu = false
  drop = ["cpu_time*"]

[[plugins.disk]]
  [plugins.disk.tagpass]
    fstype = [ "ext4", "xfs" ]
    #path = [ "/home*" ]

[[plugins.disk]]
  pass = [ "disk_inodes*" ]
  
[[plugins.docker]]

[[plugins.net]]
  interfaces = ["eth0"]
```

他にも色々メトリクス情報を取得できそうです、下記のサイトを参考にしてみてください。
https://github.com/influxdb/telegraf/blob/0.3.0/CONFIGURATION.md

telegraf を起動します。Docker コンテナのメトリクスを取得するために root ユーザ
で起動する必要があります。

```
sudo telegraf -config telegraf.conf
```

chronograf のインストールと起動
----

こちらも deb でインストールします。

```
wget https://s3.amazonaws.com/get.influxdb.org/chronograf/chronograf_0.4.0_amd64.deb
sudo dpkg -i chronograf_0.4.0_amd64.deb
sudo /opt/chronograf/chronograf -sample-config > /opt/chronograf/config.toml
sudo service chronograf start
```

グラフの描画
----

この状態でブラウザでアクセスしてみましょう。

http://<ホストのIPアドレス>:10000/

アクセスすると簡単なガイドが走りますのでここでは設定方法は省きます。Grafana を使った場合と
同様に気をつけるポイントは下記のとおりです。

* 'filter by'  に描画したいリソース名を選択(CPU,Disk,Net,Dockerの各リソース)
* Database に telegraf.conf に記した 'telegraf-test' を選択

すると下記のようなグラフやダッシュボードが作成されます。下記は CPU 使用率をグ
ラフ化したものです。

<img src="http://jedipunkz.github.io/pix/chronograf_cpu.png" width="70%">

こちらは Docker 関連のグラフ。

<img src="http://jedipunkz.github.io/pix/chronograf_docker.png" width="70%">

複数のグラフを1つのダッシュボードにまとめることもできるようです。

まとめ
+++

個人的には Grafana の UI はとてもわかりずらかったので公式の可視化ツールが出てきて良かった
と思っています。操作もとても理解しやすくなっています。Telegraf についても公式のメトリクス
情報送信エージェントということで安心感があります。また Grafana は別途 HTTP サー
バが必要でしたが Chronograf は HTTP サーバも内包しているのでセットアップが簡単
でした。

ただ configuration guide がまだまだ説明不十分なので凝ったことをしようすとする
とソースを読まなくてはいけないかもしれません。

いずれにしてもサーバのメトリクス情報と共に cAdvisor 等のソフトウェアを用いなく
てもサーバ上で稼働しているコンテナ周りの情報も取得できたので個人的にはハッピー。
cAdvisor でしか取得できない情報もありそうですが今後、導入を検討する上で評価し
ていきたいと思います。
