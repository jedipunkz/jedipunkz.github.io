+++
title = "test-kitchen と OpenStack で Chef Cookbooks テスト (後篇)"
description = "OpenStack と test-kitchen を使った Chef Cookbooks のテスト方法（後篇）。rspec/serverspec と busser-bats を使ったテストの書き方を解説"
date = "2013-10-20"
Categories = ["infrastructure"]
+++
こんにちは。<a href="https://twitter.com/jedipunkz">@jedipunkz</a> です。

前回、OpenStack と test-kitchen を使った環境構築方法を書きました。下記の記事で
す。

<http://jedipunkz.github.io/post/test-kitchn-openstack-chef-cookbooks-test/>

今回は実際にテストを書く方法を記していたい思います。

今回使用するテストツールは下記の2つです。

* rspec と serverspec
* busser-bats

参考資料
----

Creationline lab さんの資料を参考にさせて頂きました。

<http://www.creationline.com/lab/2933>

用意するモノ達
----

* OpenStack にアクセスするためのユーザ・パスワード
* Keystone の AUTH_URL
* テストに用いる OS イメージの Image ID
* テナント ID
* nova 管理のキーペアの作成

これらは OpenStack を普段から利用されている方なら馴染みのモノかと思います。

.kitchen.yml ファイルの作成
----

下記の通り .kitchen.yml ファイルを test-kitchen のルートディレクトリで作成しま
す。今後の操作は全てこのディレクトリで作業行います。

"<>" で括った箇所が環境に合わせた設定になります。

また、ここでは前回同様に 'ntp' の Cookbook をテストする前提で記します。

``` yaml
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
    openstack_username: <openstack_username>
    openstack_api_key: <openstack_password>
    openstack_auth_url: http://<openstack_ip_addr>:5000/v2.0/tokens
    image_ref: <image_id>
    flavor_ref: 1
    key_name: <key_name>
    openstack_tenant: <tenant_name>
    username: <ssh_username>
    private_key_path: <path_to_secretkey>

- name: centos-64
  driver_config:
    openstack_username: <openstack_username>
    openstack_api_key: <openstack_password>
    openstack_auth_url: http://<openstack_ip_addr>:5000/v2.0/tokens
    image_ref: <image_id>
    flavor_ref: 1
    key_name: <key_name>
    openstack_tenant: <tenant_name>
    username: <ssh_username>
    private_key_path: <path_to_secretkey>
```


busser-bats テスト
+++

まずはじめに busser-bats のテストを記します。

#### ディレクトリ作成

kitchen init を行うことでもこの操作は可能なのですが kitchen-openstack を利用すること
を想定しない形で成形されてしまうため、下記の通り実行する。

``` bash
% cd $TEST-KITCHEN-ROOT/
% mkdir -p test/integration/default/bats
```

#### ディレクトリ構成

ディレクトリ構成は

```
test/integration/${SUITE_NAME}/${BUSSER_NAME}/${TEST_NAME}
```

となっています。

#### テスト作成

test/integration/default/bats/test.bats として下記のファイルを作成します。

``` ruby
@test "ntp must be installed" {
    which ntpd
}

@test "ntp.conf must be exist" {
    cat /etc/ntp.conf | grep "server 0.pool.ntp.org iburst"
}
```

一項目と二項目の説明を書いておきます。

* 一項目の @test

ntpd コマンドが存在するか否かで package 'ntp' がインストール
されていることを確認。

* 二項目の @test 

特定の文字列が /etc/ntp.conf に記述あるか否かでファイルの存在を確認。

rspec serverspec によるテスト実施
----

次に rspec + serverspec のテストの記述方法を記します。

#### ディレクトリ作成

ディレクトリを作成します。

``` bash
% mkdir test/integration/default/rspec
```

### Gemfile 追記

下記の通り test/integration/default/rspec/Gemfile を作成します。

``` ruby
source 'https://rubygems.org'
gem 'serverspec'
```

#### serverspec-init の実行

serverspec-init コマンドにより初期化を行います。

``` bash
% cd test/integration/default/rspec
% serverspec-init
Select OS type:

  1) UN*X
  2) Windows

Select number: 1

Select a backend type:

  1) SSH
  2) Exec (local)

Select number: 2

 + spec/
 + spec/localhost/
 + spec/localhost/httpd_spec.rb
 + spec/spec_helper.rb
 + Rakefile
```

上記の通り spec ディレクトリ・ファイルが作成されることを確認します。

#### ntp_spec.rb を作成

下記の通り test/integration/default/rspec/spec/localhost/ntp_spec.rb を作成し
ます。

``` ruby
require 'spec_helper'

describe package('ntp') do
  it { should be_installed }
end

describe service('ntp') do
  it { should be_enabled   }
  it { should be_running   }
end

describe port(123) do
  it { should be_listening }
end
   
describe file('/etc/ntp.conf') do
  it { should be_file }
  it { should contain "server 0.pool.ntp.org iburst" }
end
```

テスト内容の解説は...

* 1) 'ntp' パッケージがインストールされていることを確認
* 2) 'ntp' サービスが再起動時有効になっていること・起動していることを確認
* 3) 123 番ポートで Listen していることを確認
* 4) /etc/ntp.conf に特定の文字列が存在することを確認

テスト実行
----

下記の通りテストを実行する。

``` bash
% cd $TEST-KITCHEN-ROOT
% bundle exec kitchen create # <---- OpenStack 上にインスタンス作成
% bundle exec kitchen setup  # <---- Chef Cookbooks の実行
% bundle exec kitchen verify # <---- テストの実施
```

またこれらの操作は下記の一つのコマンドで実施出来る。

``` bash
% bundle exec kitchen test
```

テスト結果
----

#### busser-bats

下記の通り2つのテストが実施され 'ok' ステータスが帰って来たことを確認する。

```
-----> Running bats test suite
       1..2
       ok 1 ntp must be installed
       ok 2 ntp.conf must be exist
```

#### serverspec

下記の通り 6 個のテスト全てが通り failure 0 個であることを確認する。

```
-----> Running rspec test suite
       [2013-10-17T02:27:19+00:00] INFO: Run List is []
       [2013-10-17T02:27:19+00:00] INFO: Run List expands to []
Recipe: (chef-apply cookbook)::(chef-apply recipe)
  * execute[bundle install --local || bundle install] action run       [2013-10-17T02:27:19+00:00] INFO: Processing execute[bundle install --local || bundle install] action run ((chef-apply cookbook)::(chef-apply recipe) line 42)
Resolving dependencies...
Using diff-lcs (1.2.4)
Using highline (1.6.20)
Using net-ssh (2.7.0)
Using rspec-core (2.14.6)
Using rspec-expectations (2.14.3)
Using rspec-mocks (2.14.4)
Using rspec (2.14.1)
Using serverspec (0.10.6)
Using bundler (1.3.5)
       Your bundle is complete!
       Use `bundle show [gemname]` to see where a bundled gem is installed.
       [2013-10-17T02:27:19+00:00] INFO: execute[bundle install --local || bundle install] ran successfully

           - execute bundle install --local || bundle install
```
......

       Finished in 0.0567 seconds
6 examples, 0 failures
       Finished verifying <default-ubuntu-1204> (0m7.44s).
```

まとめ
-----

busser-bats はまだ地道なテストの記述が必要らしい。それに比べて serverspec は既
に実用的と言えるかもしれない。どちらのテストツールも Cookbook でデプロイされた
環境の *状態* をテストするモノであって Cookbook, Recipe のテストとは違う。これ
はある意味都合が良い。Cookbooks のテストは ChefSpec 等のテストツールでテストを
行い、完成された Cookbooks を実際に複数の OS 上にデプロイしてテストするのが今
回紹介したモノとなる。
