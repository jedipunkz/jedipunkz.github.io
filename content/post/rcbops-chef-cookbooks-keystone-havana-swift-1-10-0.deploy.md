+++
title = "rcbops/chef-cookbooks で Keystone 2013.2.2(Havana) + Swift 1.10.0 を構築"
date = "2014-03-16"
slug = "2014/03/16/rcbops-chef-cookbooks-keystone-havana-swift-1-10-0.deploy"
Categories = ["infrastructure"]
description = "rcbops/chef-cookbooks を使った OpenStack Keystone Havana と Swift 1.10.0 構成の構築手順"
+++
こんにちは。<a href="https://twitter.com/jedipunkz">@jedipunkz</a> です。

#### 追記

2014/03/20 : 一旦削除していた記事なのですが、無事動作が確認出来たので再度アッ
プします！

第17回 OpenStack 勉強会で rcbops/chef-cookbooks の話をしてきたのですが会場から
質問がありました。「Havana の Swift 構成を作る Cookbooks はどこにありますか？」
と。私が試したのが Grizzly 時代のモノで、よく rcbops/chef-cookbooks を見てみる
と Havana ブランチ又は Havana に対応したリリースタグのファイル構成に Swift が
綺麗サッパリ消えているではありませんか・・！下記の Swift の Cookbooks は幸い
github 上に残っていました。

<https://github.com/rcbops-cookbooks/swift>

が rcbops/chef-cookbooks との関連付けが切れています・・。ぐあぁ。

ということで Havana 構成の Keystone 2013.2.2 と Swift 1.10.0 の構成を Chef で
作らねば！と思い色々試していたら結構あっさりと出来ました。今回はその方法を書い
ていきたいと思います！

構成
----

構成は...以前の記事 <http://jedipunkz.github.io/blog/2013/10/27/swift-chef/> と同じです。

```
+-----------------+
|  load balancer  |
+-----------------+
|
+-------------------+-------------------+-------------------+-------------------+---------------------- proxy network
|                   |                   |                   |                   |                   
+-----------------+ +-----------------+ +-----------------+ +-----------------+ +-----------------+
|   chef server   | | chef workstation| |   swift-mange   | |  swift-proxy01  | |  swift-proxy02  | 
+-----------------+ +-----------------+ +-----------------+ +-----------------+ +-----------------+ ...> scaling
|                   |                   |                   |                   |                   
+-------------------+-------------------+-------------------+-------------------+-------------------+-- storage network
|                   |                   |                   |                   |                   |
+-----------------+ +-----------------+ +-----------------+ +-----------------+ +-----------------+ +-----------------+ 
| swift-storage01 | | swift-storage02 | | swift-storage03 | | swift-account01 | | swift-account02 | | swift-account03 |
+-----------------+ +-----------------+ +-----------------+ +-----------------+ +-----------------+ +-----------------+ ..> scaling
```

手順
----

では早速手順を記していきますね。毎回なのですが Chef ワークステーション・Chef
サーバの環境構築については割愛します。オムニバスインストーラを使えば Chef サー
バの構築は簡単ですし、ワークステーションの構築も Ruby インストール -> gem で
Chef をインストール -> .chef 配下を整える、で出来ます。

rcbops/chef-cookbooks の取得。現在 Stable バージョンの refs/tags/v4.2.1 を用いる。

``` bash
% git clone https://github.com/rcbops/chef-cookbooks.git ./chef-cookbooks-4.2.1
% cd ./chef-cookbooks-4.2.1
% git checkout -b v4.2.1 refs/tags/v4.2.1
% git submodule init
% git submodule sync
% git submodule update
```

ここで本家 rcbops/chef-cookbooks と関連付けが消えている rcbops-cookbooks/swift
を cookbooks ディレクトリ配下にクローンします。あと念のため 'havana' ブランチ
を指定します。コードを確認したところ何も変化はありませんでしたが。

``` bash
% git clone https://github.com/rcbops-cookbooks/swift.git cookbooks/swift
% cd cookbooks/swift
% git checkout -b havana remotes/origin/havana
% cd ../..
```

cookbooks, roles の Chef サーバへのアップロードを行います。

``` bash
% knife cookbook upload -o cookbooks -a
% knife role from file role/*.rb
```

今回の構成 (1クラスタ) 用の environments/swift-havana.json を作成します。json
ファイルの名前は任意です。

``` json
{
  "name": "swift-havana",
  "description": "",
  "cookbook_versions": {
  },
  "json_class": "Chef::Environment",
  "chef_type": "environment",
  "default_attributes": {
  },
  "override_attributes": {
    "package_component": "havana",
    "osops_networks": {
      "management": "10.200.9.0/24",
      "public": "10.200.10.0/24",
      "swift": "10.200.9.0/24"
    },
    "keystone": {
      "pki": {
        "enabled": false
      },
      "admin_port": "35357",
      "admin_token": "admin",
      "admin_user": "admin",
      "tenants": [
        "admin",
        "service"
      ],
      "users": {
        "admin": {
          "password": "secrete",
          "roles": {
            "admin": [
              "admin"
            ]
          }
        },
        "demo": {
          "password": "demo",
          "default_tenant" : "service",
          "roles": {
            "admin": [ "admin" ]
          }
        }
      },
      "db": {
        "password": "keystone"
      }
    },
    "mysql": {
      "root_network_acl": "%",
      "allow_remote_root": true,
      "server_root_password": "secrete",
      "server_repl_password": "secrete",
      "server_debian_password": "secrete"
    },
    "monitoring": {
      "procmon_provider": "monit",
      "metric_provider": "collectd"
    },
    "vips": {
      "keystone-admin-api": "10.200.9.11",
      "keystone-service-api": "10.200.9.11",
      "keystone-internal-api": "10.200.9.11",
      "swift-proxy": "10.200.9.11",
      "config": {
        "10.200.9.112": {
          "vrid": 12,
          "network": "management"
        }
      }
    },
    "developer_mode": false,
    "swift": {
      "swift_hash": "307c0568ea84",
      "authmode": "keystone",
      "authkey": "20281b71-ce89-4b27-a2ad-ad873d3f2760"
    }
  }
}
```

作成した environment ファイル environments/swift-havana.json を chef-server へアップ
ロードする。

``` bash
% knife environment from file environments/swift-havana.json
```

Cookbooks の修正
----

swift cookbooks を修正します。havana からは keystone を扱うクライアントは
keystone.middleware.auth_token でなく keystoneclient.middleware.auth_token を
使うように変更掛かっていますので、下記のように修正しました。

``` bash
% cd cookbooks/swift/templates/default
% diff -u proxy-server.conf.erb.org proxy-server.conf.erb
--- proxy-server.conf.erb.org   2014-03-20 16:28:28.000000000 +0900
+++ proxy-server.conf.erb       2014-03-20 16:28:13.000000000 +0900
@@ -243,7 +243,8 @@
 use = egg:swift#keystoneauth
 
 [filter:authtoken]
-paste.filter_factory = keystone.middleware.auth_token:filter_factory
+#paste.filter_factory = keystone.middleware.auth_token:filter_factory
+paste.filter_factory = keystoneclient.middleware.auth_token:filter_factory
 auth_host = <%= @keystone_api_ipaddress %>
 auth_port = <%= @keystone_admin_port %>
 auth_protocol = <%= @keystone_admin_protocol %>
% cd ../../../..
```

デプロイ
----

かきのとおり knife bootstrap する。

``` bash
% knife bootstrap <manage_ip_addr> -N swift-manage -r 'role[base]','role[mysql-master]','role[keystone]','role[swift-management-server]' -E swift-havana --sudo -x thirai
% knife bootstrap <proxy01_ip_addr> -N swift-proxy01 -r "role[base]","role[swift-proxy-server]",'role[swift-setup]','role[openstack-ha]' -E swift-havana --sudo -x thirai
% knife bootstrap <proxy02_ip_addr> -N swift-proxy02 -r "role[base]","role[swift-proxy-server]",'role[openstack-ha]' -E swift-havana --sudo -x thirai
% knife bootstrap <storage01_ip_addr> -N swift-storage01 -r 'role[base]','role[swift-object-server]' -E swift-havana --sudo -x thirai
% knife bootstrap <storage02_ip_addr> -N swift-storage02 -r 'role[base]','role[swift-object-server]' -E swift-havana --sudo -x thirai
% knife bootstrap <storage03_ip_addr> -N swift-storage03 -r 'role[base]','role[swift-object-server]' -E swift-havana --sudo -x thirai
% knife bootstrap <account01_ip_addr> -N swift-account01 -r 'role[base]','role[swift-account-server]','role[swift-container-server]' -E swift-havana --sudo -x thirai
% knife bootstrap <account02_ip_addr> -N swift-account02 -r 'role[base]','role[swift-account-server]','role[swift-container-server]' -E swift-havana --sudo -x thirai
% knife bootstrap <account03_ip_addr> -N swift-account03 -r 'role[base]','role[swift-account-server]','role[swift-container-server]' -E swift-havana --sudo -x thirai
```

ここでバグ対策。Swift 1.10.0 にはバグがあるので下記の通り対処します。

keystone.middleware.s3_token に既知のバグがあり、下記のように対処します。この
状態ではバグにより swift-proxy が稼働してない状態ですが後の各ノードでの
chef-client 実行時に稼働する予定です。

``` python
% diff /usr/lib/python2.7/dist-packages/keystone/exception.py.org /usr/lib/python2.7/dist-packages/keystone/exception.py 
--- exception.py.org    2014-03-12 16:45:00.181420694 +0900
+++ exception.py        2014-03-12 16:44:47.173177081 +0900
@@ -18,6 +18,7 @@

 from keystone.common import config
 from keystone.openstack.common import log as logging
+from keystone.openstack.common.gettextutils import _
 from keystone.openstack.common import strutils
```

上記のバグ報告は下記の URL にあります。

<https://bugs.launchpad.net/ubuntu/+source/swift/+bug/1231339>

zone 番号を付与します。

``` bash
% knife exec -E "nodes.find(:name => 'swift-storage01') {|n| n.set['swift']['zone'] = '1'; n.save }"
% knife exec -E "nodes.find(:name => 'swift-account01') {|n| n.set['swift']['zone'] = '1'; n.save }"
% knife exec -E "nodes.find(:name => 'swift-storage02') {|n| n.set['swift']['zone'] = '2'; n.save }"
% knife exec -E "nodes.find(:name => 'swift-account02') {|n| n.set['swift']['zone'] = '2'; n.save }"
% knife exec -E "nodes.find(:name => 'swift-storage03') {|n| n.set['swift']['zone'] = '3'; n.save }"
% knife exec -E "nodes.find(:name => 'swift-account03') {|n| n.set['swift']['zone'] = '3'; n.save }"
```

zone 番号が付与されたこと下記の通りを確認します

account-server の確認

``` bash 
% knife exec -E 'search(:node,"role:swift-account-server") \
  { |n| z=n[:swift][:zone]||"not defined"; puts "#{n.name} has the role \
  [swift-account-server] and is in swift zone #{z}"; }'
swift-account01 has the role       [swift-account-server] and is in swift zone 1
swift-account02 has the role       [swift-account-server] and is in swift zone 2
swift-account03 has the role       [swift-account-server] and is in swift zone 3
```

container-server の確認
  
``` bash
% knife exec -E 'search(:node,"role:swift-container-server") \
  { |n| z=n[:swift][:zone]||"not defined"; puts "#{n.name} has the role \
  [swift-container-server] and is in swift zone #{z}"; }'
swift-account01 has the role       [swift-container-server] and is in swift zone 1
swift-account02 has the role       [swift-container-server] and is in swift zone 2
swift-account03 has the role       [swift-container-server] and is in swift zone 3
```

object-server の確認

``` bash
% knife exec -E 'search(:node,"role:swift-object-server") \
  { |n| z=n[:swift][:zone]||"not defined"; puts "#{n.name} has the role \
  [swift-object-server] and is in swift zone #{z}"; }'
swift-storage01 has the role   [swift-object-server] and is in swift zone 1
swift-storage02 has the role   [swift-object-server] and is in swift zone 2
swift-storage03 has the role   [swift-object-server] and is in swift zone 3
```


Chef が各々のノードに搭載された Disk を検知出来るか否かを確認する。

``` ruby
% knife exec -E \
  'search(:node,"role:swift-object-server OR \
  role:swift-account-server \
  OR role:swift-container-server") \
  { |n| puts "#{n.name}"; \
  begin; n[:swift][:state][:devs].each do |d| \
  puts "\tdevice #{d[1]["device"]}"; \
  end; rescue; puts \
  "no candidate drives found"; end; }'
    swift-storage02
            device sdb1
    swift-storage03
            device sdb1
    swift-account01
            device sdb1
    swift-account02
            device sdb1
    swift-account03
            device sdb1
    swift-storage01
            device sdb1
```

swift-manage ノードにて chef-client を実行し
/etc/swift/ring-workspace/generate-rings.sh を更新します。

``` bash
swift-manage% sudo chef-client
```

generate-rings.sh の 'exit 0' 行をコメントアウトし実行します。

``` bash
swift-manage% sudo ${EDITOR} /etc/swift/ring-workspace/generage-rings.sh
swift-manage% sudo /etc/swift/ring-workspace/generate-rings.sh
```

この操作で /etc/swift/ring-workspace/rings 配下に account, container, object
用の Rings ファイル群が生成されたことを確認出来るはずです。これらを
swift-manage 上で既に稼働している git サーバに push し管理します。

``` bash
swift-manage# cd /etc/swift/ring-workspace/rings
swift-manage# git add account.builder container.builder object.builder
swift-manage# git add account.ring.gz container.ring.gz object.ring.gz
swift-manage# git commit -m "initial commit"
swift-manage# git push
```

各々のノードにて chef-client を実行することで git サーバ上の Rings ファイル群
を取得し、swift プロセスを稼働させます。

``` bash
swift-proxy01# chef-client
swift-proxy02# chef-client
swift-storage01# chef-client
swift-storage02# chef-client
swift-storage03# chef-client
swift-account01# chef-client
swift-account02# chef-client
swift-account03# chef-client
```

3台のノードが登録されたかどうかを下記の通り確認行います。

``` bash
swift-proxy01% sudo swift-recon --md5
[sudo] password for thirai:
===============================================================================
--> Starting reconnaissance on 3 hosts
===============================================================================
[2013-10-18 11:14:43] Checking ring md5sums
3/3 hosts matched, 0 error[s] while checking hosts.
===============================================================================
```

動作確認
----

構築が出来ました！ということで動作の確認をしてみましょう。

テストコンテナ 'container01' にテストファイル 'test' をアップロードしてみる。

``` bash
swift-storage01% swift -V 2 -A http://<ip_addr_keystone>:5000/v2.0/ -U admin:admin -K secrete stat
swift-storage01% swift -V 2 -A http://<ip_addr_keystone>:5000/v2.0/ -U admin:admin -K secrete post container01
swift-storage01% echo "test" > test
swift-storage01% swift -V 2 -A http://<ip_addr_keystone>:5000/v2.0/ -U admin:admin -K secrete upload container01 test
swift-storage01% swift -V 2 -A http://<ip_addr_keystone>:5000/v2.0/ -U admin:admin -K secrete list
container01
swift-storage01% swift -V 2 -A http://<ip_addr_keystone>:5000/v2.0/ -U admin:admin -K secrete list container01 test
```

まとめ
----

前回「実用的な Swift 構成を Chef でデプロイ」の記事で記した内容とほぼ手順は変
わりませんでした。rcbops-cookbooks/rcbops-utils 内にソフトウェアの取得先レポジ
トリを記すレシピが下記の場所にあります。

<https://github.com/rcbops-cookbooks/osops-utils/blob/master/recipes/packages.rb>

そして havana ブランチの attributes を確認すると Ubuntu Cloud Archive の URL
が記されていることが確認出来ます。下記のファイルです。

<https://github.com/rcbops-cookbooks/osops-utils/blob/havana/attributes/repos.rb>

ファイルの中身の抜粋です。

```json
    "havana" => {
      "uri" => "http://ubuntu-cloud.archive.canonical.com/ubuntu",
      "distribution" => "precise-updates/havana",
      "components" => ["main"],
      "keyserver" => "hkp://keyserver.ubuntu.com:80",
      "key" => "EC4926EA"
    },
```

これらのことより、rcbops-utils の attibutes で havana (実際には
'havana-proposed') をレポジトリ指定するように Cookbooks 構成を管理してあげれば
Havana 構成の Keystone, Swift が構築出来ることになります。ちなみに
havana-proposed で Swift や Keystone のどのバージョンがインストールされるかは、
下記の Packages ファイルを確認すると判断出来ます。

<http://ubuntu-cloud.archive.canonical.com/ubuntu/dists/precise-proposed/havana/main/binary-amd64/Packages>


以上です。
