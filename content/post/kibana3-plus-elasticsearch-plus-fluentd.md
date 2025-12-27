+++
title = "Kibana3 + elasticsearch + fluentd を試した"
date = "2013-09-08"
Categories = ["infrastructure"]
description = "Kibana3 の新機能を使った elasticsearch と fluentd によるログ解析環境構築"
aliases = [
  "/blog/2013/09/08/kibana3-plus-elasticsearch-plus-fluentd",
  "/post/2013/09/08/kibana3-plus-elasticsearch-plus-fluentd"
]
+++
こんにちは。<a href="https://twitter.com/jedipunkz">@jedipunkz</a> です。

{% img /pix/kibana3.png %}

前回の記事で Kibana + elasticsearch + fluentd を試しましたが、ツイッターで
@nora96o さんに "Kibana3 使うと、幸せになれますよ！" と教えてもらいました。早
速試してみましたので、メモしておきます。

前回の記事。

<http://jedipunkz.github.io/post/kibana-plus-elasticsearch-plus-fluentd/>

前半の手順は前回と同様ですが、念のため書いておきます。

前提の環境
----

* OS : Ubuntu 12.04 Precise (同じ方法で 13.04 Raring でも出来ました)

必要なパッケージのインストール
----

下記のパッケージを事前にインストールします。

``` bash
% sudo apt-get install git-core build-essential ruby1.9.3 openjdk-7-jdk
```

手順を省くために Ruby はパッケージで入れました。また Java は他の物を利用しても
構いません。Ruby は fluentd が、Java は elasticsearch が必要とします。

elasticsearch のインストール
----

下記のサイトより elasticsearch をダウンロードします。

<http://www.elasticsearch.org/download/>

現時点 (2013/09/08) で最新のバージョンは 0.90.3 でした。

``` bash
% wget https://download.elasticsearch.org/elasticsearch/elasticsearch/elasticsearch-0.90.3.deb
% sudo dpkg -i elasticsearch-0.90.3.deb
% sudo service elasticsearch start
```

fluentd のインストール
----

fluentd を下記の通りインストールします。

``` bash
% sudo -i
% curl -L http://toolbelt.treasure-data.com/sh/install-ubuntu-precise.sh | sh
```

/etc/td-agent/td-agent.conf を下記の通りに修正します。サンプルで Apache のログ
を elasticsearch に飛ばす設定にします。

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

Kibana3 のインストール
----

下記のサイトから Kibana3 をダウンロードします。

<http://three.kibana.org/intro.html>

% wget https://github.com/elasticsearch/kibana/archive/master.tar.gz
% tar zxvf master.tar.gz
% sudo mv kibana-master /var/www/kibana3

config.js を修正します。elasticsearch の起動している URL を入力します。ここで
注意が必要なのが、ブラウザからアクセス出来る elasticsearch のアドレスにする必
要があるという点です。従来の Kibana の場合は Ruby 製だったため Kibana から
elasticsearch に到達できれば良かったのですが、Kibana3 は JavaScript 製ですので
ブラウザから elasticsearch の 9200 版ポートに到達出来る必要があります。

``` bash
% sudo ${EDITOR} /var/www/kibana3/config.js
...snip...
elasticsearch:    "http://<ElasticSearch IP addr>:9200",
...snip...
```

これで完了です。

ブラウザでアクセス
----

あとはブラウザでアクセスするだけです。

```
http://<kibana IP addr>/kibana3/
```

まとめ
----

ElasticSearch を外部に公開する必要があるのだけど、その辺りどう制限掛けるかは別
途調べないといけないなぁと。あと ElasticSearch, fluentd を Cookbook でデプロイ
するのも出来そう。もちろん Apache も。次回以降の記事に載せます。またブラウザで
アクセスした後に様々な形式のグラフ等を追加していけました。もちろん Kibana3 を
使わないでも elasticseach だけで API によるログの検索が出来たりして、僕らエン
ジニアにとってはめっちゃくちゃメリットあります。あぁなんでもっと早く使ってなかっ
たんだろう。elasticsearch...。
