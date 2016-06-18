+++
title = "CoreOS etcd のクラスタとその応用性"
date = "2013-12-09"
slug = "2013/12/09/coreos-etcd-cluster"
Categories = ["infrastructure"]
+++
こんにちは。<a href="https://twitter.com/jedipunkz">@jedipunkz</a> です。

皆さん CoreOS は利用されたことありますか？CoreOS は軽量な docker との相性の良
い OS です。下記が公式サイト。

<http://coreos.com/>

特徴としては下記の3つがあります。

* etcd 
* systemd
* docker

ここではこの中の etcd について注目していきたいと思います。etcd はクラスタエイ
ブルな KVS データベースです。コンフィギュレーションをクラスタ間で共有すること
がなので、オーケストレーションの分野でも期待出来るのでは？と個人的に感じていま
す。今回は etcd のクラスタ構成構築の手順とその基本動作の確認、またどう応用出来
るのか？について記していきたいと思います。

参考 URL
----

* <http://coreos.com/using-coreos/etcd/>
* <https://github.com/coreos/etcd>

ビルド
----

go 1.1 or later をインストールして etcd のコンパイル準備を行います。Ubuntu
Saucy のパッケージを用いると容易に行えます。

``` bash
% apt-get -y install golang
```

coreos/etcd を取得しビルド

``` bash
% git clone https://github.com/coreos/etcd
% cd coreos
% ./build
% ./etcd --version
v0.2.0-rc1-60-g73f04d5
```

CoreOS の用意
----

ここではたまたま手元にあった OpenStack を用いて CoreOS のイメージを登録してい
みます。ベアメタルでも可能ですのでその場合は手順を読み替えて作業してみてくださ
い。OpenStack 等クラウドプラットフォームを利用する場合は metadata サービスが必
須となるので注意してください。

``` bash
% wget http://storage.core-os.net/coreos/amd64-generic/dev-channel/coreos_production_openstack_image.img.bz2
% bunzip2 coreos_production_openstack_image.img.bz2
% glance image-create --name coreos-image --container-format ovf \
  --disk-format qcow2 --file coreos_production_openstack_image.img
```

nova boot にて CoreOS を起動します。(下記は例)

``` bash
% nova keypair-add testkey01 > testkey01.pem
% nova boot --nic net-id .... --image coreos-image --flavor 1 --key_name testkey01 coreos01
```

CoreOS 上での etcd クラスタ起動
----

上記でコンパイルした etcd のバイナリを起動したインスタンス (CoreOS) に転送しま
す。scp 等で転送してください。

ここでは 1 node 上で複数のポート番号を用いて 3 つの etcd を稼働することでクラ
スタを構築します。

7002 番ポートを peer addr として master を起動。listen ポートは 4002

``` bash
% ./etcd -peer-addr 127.0.0.1:7002 -addr 127.0.0.1:4002 -data-dir machines/machine1 -name machine1
```

上記の master を参照する slaves (残り2台) を起動。

``` bash
% ./etcd -peer-addr 127.0.0.1:7003 -addr 127.0.0.1:4003 -peers 127.0.0.1:7002 -data-dir machines/machine2 -name machine2
% ./etcd -peer-addr 127.0.0.1:7004 -addr 127.0.0.1:4004 -peers 127.0.0.1:7002 -data-dir machines/machine3 -name machine3
```

クラスタ構成内のノード情報を確認する。

``` bash
% curl -L http://127.0.0.1:4002/v2/machines
[etcd] Dec  4 03:46:44.153 INFO      | URLs: machine1 / machine1 (http://127.0.0.1:4002,http://127.0.0.1:4003,http://127.0.0.1:4004)
http://127.0.0.1:4002, http://127.0.0.1:4003, http://127.0.0.1:4004
```

leader (master) 情報を確認する。

``` bash
% curl -L http://127.0.0.1:4002/v2/leader
http://127.0.0.1:7002
```

上記で起動した master プロセスが leader (master) になっていることを確認出来る
と思います。

キーの投入と参照
-----

テストでキーと値を入力してみましょう。'foo' キーに 'bar' という値を投入てくだ
さい。

``` bash
% curl -L http://127.0.0.1:4002/v2/keys/foo -XPUT -d value=bar
```

クラスタ内全てのプロセスから上記のキーの取得できることを確認します。

``` bash
% curl -L http://127.0.0.1:4002/v2/keys/foo
{"action":"get","node":{"key":"/foo","value":"bar","modifiedIndex":4,"createdIndex":4}}
% curl -L http://127.0.0.1:4003/v2/keys/foo
{"action":"get","node":{"key":"/foo","value":"bar","modifiedIndex":4,"createdIndex":4}}
% curl -L http://127.0.0.1:4004/v2/keys/foo
{"action":"get","node":{"key":"/foo","value":"bar","modifiedIndex":4,"createdIndex":4}}
```

master のシャットダウンと master 選挙後の動作確認
----

テストで master のプロセスをシャットダウンしてみます。

master プロセスのシャットダウン

``` bash
% kill <master プロセスの ID>
```

その他 2 つのプロセスから 'foo' キーの確認を行う。

``` bash
% curl -L http://127.0.0.1:4004/v2/keys/foo
{"action":"get","node":{"key":"/foo","value":"bar","modifiedIndex":4,"createdIndex":4}}
% curl -L http://127.0.0.1:4003/v2/keys/foo
{"action":"get","node":{"key":"/foo","value":"bar","modifiedIndex":4,"createdIndex":4}}
```

勿論、旧 master からは確認出来ない。

``` bash
% curl -L http://127.0.0.1:4002/v2/keys/foo
 curl: (7) Failed connect to 127.0.0.1:4002; Connection refused
```

新 master の確認を行う。選挙の結果 3 つ目のプロセスが master に昇格しているこ
とが確認出来る。

``` bash
% curl -L http://127.0.0.1:4003/v2/leader
http://127.0.0.1:7004
```



考察とその応用性について
----

とてもシンプルな KVS ではあるけど大きな可能性を秘めていると思っています。オー
ケストレーション等への応用です。お互いのノード (今回はプロセス) 間で情報をやり
とりできるので自律的なクラスタの構築も可能になるのでは？と思っています。

'etcenv' という @mattn さんが開発したツールを見てみましょう。

<https://github.com/mattn/etcdenv>

下記、README から引用。

``` bash
$ curl http://127.0.0.1:4001/v1/keys/app/db -d value="newdb"
$ curl http://127.0.0.1:4001/v1/keys/app/cache -d value="new cache"

$ curl http://localhost:4001/v1/keys/app
[{"action":"GET","key":"/app/db","value":"newdb","index":4},{"action":"GET","key":"/app/cache","value":"new cache","index":4}]

$ etcdenv -key=/app/
DB=newdb
CACHE=new cache

$ etcdenv -key=/app/ ruby web.rb
```

クラスタ間の情報を環境変数に落としこむツールです。自ノードの環境変数まで落ちれ
ば、クラスタ構築も色々想像出来るのではないでしょうか？

軽量で docker との相性も良くて etcd 等の仕組みも持っている CoreOS にはこれから
も期待です。
