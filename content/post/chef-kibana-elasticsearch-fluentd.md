+++
title = "Chef で kibana + elasticsearch + fluentd デプロイしてみた"
date = "2013-09-13"
Categories = ["infrastructure"]
description = "Berkshelf を使った Kibana、Elasticsearch、Fluentd のオールインワン構成デプロイ"
aliases = [
  "/blog/2013/09/13/chef-kibana-elasticsearch-fluentd",
  "/post/2013/09/13/chef-kibana-elasticsearch-fluentd"
]
+++
こんにちは。<a href="https://twitter.com/jedipunkz">@jedipunkz</a> です。

前回 kibana + elasticsearch + fluentd を構築する方法を載せたのだけど手動で構築
したので格好悪いなぁと思っていました。いうことで！ Chef でデプロイする方法を調
べてみました。

意外と簡単に出来たし、スッキリした形でデプロイ出来たのでオススメです。

前提の環境は...
----

* Ubuntu 12.04 LTS precise
* Chef サーバ構成
* 入力するログは nginx (例)
* オールインワン構成

Cookbook が他の OS に対応しているか確認していないので Ubuntu を前提にしていま
す。Chef サーバのデプロイや knife の設定は済んでいるものとして説明していきます。
例で nginx のログを入力します。なので nginx も Chef でデプロイします。ここは他
のものに置き換えてもらっても大丈夫です。手順を省略化するためオールインワン構成
で説明します。nginx, fluentd は複数のノードに配置することも手順を読み替えれば
もちろん可能です。

Cookbook の準備
----

お決まり。Cookbooks の取得に Berkshelf を用いる。

``` bash
% cd chef-repo
% gem install berkshelf
% ${EDITOR} Berksfile
cookbook 'elasticsearch', git: 'https://github.com/elasticsearch/cookbook-elasticsearch.git'
cookbook 'td-agent', git: 'https://github.com/treasure-data/chef-td-agent.git'
cookbook 'kibana', git: 'https://github.com/realityforge/chef-kibana.git'
cookbook 'nginx', git: 'https://github.com/opscode-cookbooks/nginx.git'
```

Cookbooks を取得します。

``` bash
% berks install --path=./cookbooks
```

elasticsearch デプロイ準備
----

elasticsearch の Role を作成する。java, elasticsearch レシピを指定。また Java
に openjdk7 を override_attributes にて指定する。openjdk6 だと elasticsearch が起動し
なかった。尚、デフォルトは 6 です。Environment で override_attributes を指定し
てもらっても構わないです。

``` bash
% ${EDITOR} roles/elasticsearch.rb
name "elasticsearch"
description "Base role applied to elasticsearch nodes."
run_list(
  "recipe[java]",
  "recipe[elasticsearch]"
)
override_attributes "java" => { "install_flavor" => "openjdk", "jdk_version" => "7" }
```

fluentd デプロイの準備
----

td-agent (fluentd) の Role を作成する。override_attributes にて td-agent のプ
ラグインを指定。配列で複数指定可能。こちらも同じく Role で override_attributes
を指定したが Environments で指定しても構わないです。あと公式の README には
attributes に直接 plugins を指定するよう書いてありましたが、構成毎に plugins
は変えたいと思うので、この様に Roles, Environments で指定するのが良いと思います。

``` ruby
% ${EDITOR} roles/td-agent.rb
name "td-agent"
description "Base role applied to td-agent nodes."
run_list(
  "recipe[td-agent]"
)
override_attributes "td_agent" => {
                      "plugins" => [ "elasticsearch" ]
                    }
```

td-agent.conf の template を作成。今回は nginx の
/var/log/nginx/localhost.access.log を入力する。これは例なので好きなログを指定
可能。

``` ruby
% ${EDITOR} cookbooks/td-agent/templates/default/td-agent.conf.erb
<source>
  type tail
  format nginx
  path /var/log/nginx/localhost.access.log
  tag foo01.nginx.access
</source>

<match *.nginx.*>
  index_name adminpack
  type_name nginx
  type elasticsearch
  include_tag_key true
  tag_key @log_name
  host localhost
  port 9200
  logstash_format true
  flush_interval 10s
</match>    
```

デプロイ
----

Cookbooks, Roles を Chef サーバにアップロード。

``` bash
% knife cookbook upload -o cookbooks -a
% knife role from file roles/*.rb
```

knife bootstrap しデプロイ！

``` bash
% knife bootstrap <ip_addr> -N <hostname> -r \
  'role[td-agent]','role[elasticsearch]','recipe[kibana]','recipe[nginx]' \
  --sudo -x <username>
```

下記の URL にブラウザでアクセスし nginx のログを生成。

```
http://<ip_addr>/
```

下記の URL にて Kibana の UI 越しにログ解析結果を確認出来る。

```
http://<ip_addr>:5601
```
 
まとめ
----

fluentd plugins は複数指定可能。環境毎に td-agent.conf を変更したいという要望
があると思うけど fluentd の Recipe を修正する必要がありそう。それとも
td-agent.conf 自体でうまくさばけるのかな？調べてない。オールインワン構成で説明
しましたが、elasticsearch + kibana のノードに対して、複数の nginx(なんでも良い)
+ td-agent ノードの構成が一般的だと思います。手順を読み替えてやってみてくださ
い。その場合 kibana の Cookbook の attributes 中に elasticsearch の IP アドレ
ス・ポートを記す箇所があるので Role, Environments で上書きしてあげてください。

``` ruby
default['kibana']['elasticsearch']['hosts'] = ['127.0.0.1']
default['kibana']['elasticsearch']['port'] = 9200
````

あと td-agent/templates/default/td-agent.conf.erb の中に記した host, port の指
定も elasticsearch のホスト情報に書き換えてあげてください。

```
host localhost
port 9200
```

以上です。意外と簡単に出来ました。スッキリ。
