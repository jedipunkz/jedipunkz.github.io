+++
title = "test-kitchen と OpenStack で Chef Cookbooks テスト(前篇)"
description = "test-kitchen と OpenStack インスタンスを使った Chef Cookbooks のテスト環境構築方法（前篇）。Vagrant の代替として OpenStack を活用"
date = "2013-10-13"
Categories = ["infrastructure"]
aliases = [
  "/blog/2013/10/13/test-kitchn-openstack-chef-cookbooks-test",
  "/post/2013/10/13/test-kitchn-openstack-chef-cookbooks-test"
]
+++
こんにちは。<a href="https://twitter.com/jedipunkz">@jedipunkz</a> です。

test-kitchen + Vagrant を利用して複数環境で Chef Cookbooks のテストを行う方法は
結構皆さん利用されていると思うのですが Vagrant だと手元のマシンに仮想マシンが
バシバシ立ち上げるので僕はあまり好きではないです。そこで、OpenStack のインスタ
ンスをその代替で使えればいいなぁと結構前から思っていたのですが、今回うまくいっ
たのでその方法を記します。

用意するモノ
----

* OpenStack 環境一式
* Chef がインストールされた OS イメージとその ID
* test-kitchen を実行するワークステーション (お手持ちの Macbook 等)

OS イメージの作成ですが Veewee などで自動構築できますし、インスタンス上で Chef
のインストールを行った後にスナップショットを作成してそれを利用しても構いません。

test-kitchen のインストール
----

test-kitchen をインストールします。versoin 1.0.0 はまだリリースされていないの
で github から master ブランチを取得してビルドします。直近で OpenStack に関連
する不具合の修正等が入っているのでこの方法を取ります。

``` bash
% git clone https://github.com/opscode/test-kitchen.git
% cd test-kitchen
% bundle install
% rake build # <--- gem をビルド
% gen install ./pkg/test-kitchen-1.0.0.dev.gem
```

現時点 (2013/10/13) で berkshelf の利用しているソフトウェアと衝突を起こす問題
があるので bundle で解決します。下記のように Gemfile に gem
'kitchen-openstack' と記述します。

``` ruby
source 'https://rubygems.org'
gemspec

gem 'kitchen-openstack' # <--- 追記

group :guard do
  gem 'rb-inotify', :require => false
  gem 'rb-fsevent', :require => false
  gem 'rb-fchange', :require => false
  gem 'guard-minitest', '~> 1.3'
  gem 'guard-cucumber', '~> 1.4'
end
```

kitchen-openstack のインストール
----

kitchen-openstack をインストールします。こちらも gem をビルドしてインストール
します。

``` bash
% git clone https://github.com/RoboticCheese/kitchen-openstack.git
% cd kitchen-openstack
% bundle insatll #<---- 関連ソフトウェアインストール
% rake build     #<---- gem をビルド
% gem install ./pkg/kitchen-openstack-0.5.1.gem
```

.kitchen.yml の作成
----

.kitchen.yml を用意します。test-kitchen のディレクトリに移動し .kitchen.yml を
下記の例に従って作成します。今回は Ubuntu OS, CentOS にてテストを実行します。

``` bash
% cd /path/to/test-kitchen
% ${EDITOR} .kitchen.yml
```
 
``` ruby
+++
driver_plugin: openstack

suites:
- name: default
  run_list:
  - recipe[ntp::default]
  attributes: {}

platforms:
- name: ubuntu-12.04
  driver_config:
    openstack_username: <openstac_username>
    openstack_api_key: <openstack_password>
    openstack_auth_url: http://<openstack_ip_addr>:5000/v2.0/tokens
    image_ref: <image_id>
    flavor_ref: 1
    key_name: <key_name>
    openstack_tenant: service
    username: ubuntu
    private_key_path: <path_to_secretkey>

- name: centos-64
  driver_config:
    openstack_username: <openstac_username>
    openstack_api_key: <openstack_password>
    openstack_auth_url: http://<openstack_ip_addr>:5000/v2.0/tokens
    image_ref: <image_id>
    flavor_ref: 1
    key_name: <key_name>
    openstack_tenant: service
    username: root
    private_key_path: <path_to_secretkey>
```
 
ファイルの内容について解説します。

* suites:

実行したい Chef Cookbooks のレシピ名を指定します。attriutes などをここで上書き
することも出来ます。

* platforms:

テストに用いたい OS を列挙していけます。ここでは例として Ubuntu, CentOS を記し
ました。

* openstack_username, openstack_api_key

OpenStack にログインするためのユーザ名とパスワードです。keystone で作成します。

* openstack_auth_url

Keystone の URL です。最後に /tokens と付けるのを忘れずに。

* image_ref

それぞれの OS イメージの ID を記します。前述したとおりインスタンスでオペレーショ
ン後にスナップショットを作成しそれを記すことも可能です。

* flavor_ref

Flavor ID を記します。ここでは一番小さい Flavor である m1.tiny を記しました。

* key_name

インスタンス作成時に選択する Nova のキーペア名です。OpenStack コマンドラインで
言う --key_name です。

* openstack_tenant

どのテナントにインスタンスを作成するか？を記します。

* username

インスタンスにログインする際のユーザ名を記します。

* private_key_path

インスタンスにログインするための SSH 秘密鍵のパスを記します。ここではノンパス
ワードでログイン出来るよう鍵を生成してあげる必要があります。


Cookbooks の配置
----

カレントディレクトリ配下に 'cookbooks' という名前のディレクトリを用意し
テストで用いたい Cookbooks を配置します。Berkshelf を用いれば簡単です。が、
現時点で Berkshelf の用いているソフトウェア test-kitchen のそれが衝突を起こす
のでテスト実行前には Berkshelf ファイルを退避してください。

``` bash
% ${EDITOR} Berksfile
site :opscode
    
cookbook 'ntp;
% berks install --path=./cookbooks
% mv Berksfile Berksfile.old
```

テスト実行
----

いよいよテストを実行します。上記の例では Ubuntu OS, Debian OS に対して ntp の
Chef Cookbooks を実際にデプロイしテストを行います。

``` bash
% bundle exec kitchen test
```

'test' を引数で渡すと

* インスタンス作成
* Chef のインストール
* Cookbooks のアップロード
* chef-solo の実行
* Cookbooks 中に 'test' ディレクトリがある場合はテスト実行

を行ってくれます。それぞれ別々に実行したい場合は

``` bash
% bundle exec kitchen create   # <---- インスタンスの作成
% bundle exec kitchen setup    # <---- chef のインストールと初回の converge
% bundle exec kitchen converge # <---- chef-solo を再度実行
% bundle exec kitchen verify   # <---- 'test' ディレクトリに従いテスト実行
% bundle exec kitchen destroy  # <---- インスタンスの削除
```

と行えば良いです。converge, verify は何度でも繰り返し実行が可能。

まとめ
----

前述したとおり Vagrant を使うと手元のマシンのリソースを大量に消費してしまうの
で OpenStack を利用する価値は結構あるのかなぁと思っています。バージョン 1.0.0
がリリースされる時期も近いと思うので今のうちに知っておくと良いかと思います。

また、テストと言っても test-kitchen の場合2つの意味があると思います。実際に
Cookbooks をインスタンスにインストールするテスト、と Cookbooks 自体のテストと
いう意味です。後者についてはまた後ほど記したいと思います。
