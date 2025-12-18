+++
title = "Kibana + ElasticSearch + fluentd を試してみた"
date = "2013-09-07"
Categories = ["infrastructure"]
description = "Kibana、ElasticSearch、fluentd を組み合わせたログ解析システムの構築手順"
aliases = [
  "/blog/2013/09/07/kibana-plus-elasticsearch-plus-fluentd",
  "/post/2013/09/07/kibana-plus-elasticsearch-plus-fluentd"
]
+++
こんにちは。<a href="https://twitter.com/jedipunkz">@jedipunkz</a> です。

自動化の流れを検討する中でログ解析も忘れてはいけないということで ElasticSearch
を使いたいなぁとぼんやり考えていて Logstash とか Kibana とかいうキーワードも目
に止まるようになってきました。

ElasticSaerch は API で情報を検索出来たりするので自動化にもってこい。バックエ
ンドに Logstash を使って... と思ってたのですが最近よく聞くようになった fluentd
をそろそろ真面目に使いたい！ということで、今回は Kibana + ElasticSearch +
fluentd の組み合わせでログ解析システムを組む方法をメモしておきます。


参考にさせて頂いた URL
----

<http://memocra.blogspot.jp/2013/04/kibanakibanaelasticsearchfluentd.html>

前提の環境
----

* OS : Ubuntu 12.04 Precise (同じ方法で 13.04 Raring でも出来ました)

必要なパッケージインストール
----

下記のパッケージを事前にインストールします。

``` bash
% sudo apt-get install git-core build-essential ruby1.9.3 openjdk-7-jdk
```

手順を省くために Ruby はパッケージで入れました。また Java は他の物を利用しても
構いません。Ruby は Kibana, fluentd が、Java は ElasticSearch が必要とします。

ElasticSearch のインストール
----

下記のサイトより ElasticSearch をダウンロードします。

<http://www.elasticsearch.org/download/>

現時点 (2013/09/07) で最新のバージョンは 0.90.3 でした。

``` bash
% wget https://download.elasticsearch.org/elasticsearch/elasticsearch/elasticsearch-0.90.3.deb
% sudo dpkg -i elasticsearch-0.90.3.deb
% sudo service elasticsearch start
```

Kibana のインストール
----

Kibana をダウンロードして Gemfile にしたがって必要なモノをインストールします。

``` bash
% git clone --branch=kibana-ruby https://github.com/rashidkpc/Kibana.git
% sudo gem install bundler
% cd Kibana
% sudo bundle install
% sudo gem install tzinfo-data
```

KibanaConfig.rb の KibanaHost はリスンアドレスになるので 0.0.0.0 に修正sます。

``` bash
KibanaHost = '0.0.0.0'
```

Kibana を起動します。

``` bash
% ruby kibana.rb
== Sinatra/1.4.3 has taken the stage on 5601 for development with backup from Thin
>> Thin web server (v1.5.1 codename Straight Razor)
>> Maximum connections set to 1024
>> Listening on 0.0.0.0:5601, CTRL+C to stop
```

fluentd のインストール
----

fluentd を下記の通りインストールします。

``` bash
% sudo -i
% curl -L http://toolbelt.treasure-data.com/sh/install-ubuntu-precise.sh | sh
```

/etc/td-agent/td-agent.conf を下記の通りに修正します。サンプルで Apache のログ
を ElasticSearch に飛ばす設定にします。

``` xml
<source>
  type tail
  format apache
  path /var/log/apache2/access.log
  tag kibana01.apache.access
</source>

<match *.apache.*>
  index_name adminpack
  type_name apache
  type elasticsearch
  include_tag_key true
  tag_key @log_name
  host 10.0.1.8
  port 9200
  logstash_format true
  flush_interval 3s
</match>
```

host パラメータは環境に合わせて設定します。

fluentd を起動します。

``` bash
% sudo service td-agent start
```

Apache のインストール
----

システムに必要なわけではありませんが、サンプルで Apache のログを fluentd 経由
で飛ばして Kibana で確認したいのでインストールします。

``` bash
% sudo apt-get install apache2
% sudo chown -R td-agent /var/log/apache2
```
 
ファイルのオーナを td-agent にする必要がありました。

ブラウザでアクセス
----

Apache2 のポート 80 にブラウザでアクセスし、その後 ポート 5601 にアクセスする
と Kibana の画面が表示されます。ポート 80 のアクセスに応じて結果が出力されます。

{% img /pix/kibana-cap.png %}

まとめ
----

LogStash でも今度試してみたい。
あと API をどう叩くかは..

<http://www.elasticsearch.org/guide/reference/api/>

にリファレンスがあるので、時間を見つけてやってみる。Apache 以外のログ転送につ
いては fluentd を詳細に知る必要があるので、そちらも時間を見つけてやってみる。
kibana.rb を起動するもっと良い方法がないかも調べないと。

2013.09.08追記

@nora96o さんに「Kibana3 使うと幸せになれますよ！」と教えて頂いて早速 Kibana3
も試してみました。

<http://jedipunkz.github.io/post/kibana3-plus-elasticsearch-plus-fluentd/>
