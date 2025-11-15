+++
title = "内部で Chef を使っている OpenCenter で OpenStack 構築"
date = "2013-07-02"
slug = "2013/07/02/chef-opencenter-openstack"
Categories = ["infrastructure"]
description = "GUI でドラッグ&ドロップ操作により OpenStack をデプロイできる OpenCenter の使用方法"
+++

こんにちは。<a href="https://twitter.com/jedipunkz">@jedipunkz</a> です。

第13回 OpenStack 勉強会に参加してきました。内容の濃い収穫のある勉強会でした。
参加してよかった。特にえぐちさんの OpenCenter に関するプレゼン (下記のスライド
参照のこと) には驚きました。ちょうど当日 RackSpace のエンジニアが管理している
github 上の Chef Cookbooks を使って OpenStack 構築できたぁ！と感動していたのに、
その晩のうちに Chef を使って GUI で！ OpenStack が自動構築出来るだなんて...。

えぐちさんのスライド資料はこちら。

<http://www.slideshare.net/guchi_hiro/open-centeropenstack>

早速、私も手元で OpenCenter 使ってみました。えぐちさん、情報ありがとうございましたー。

実は私 としては Chef 単体で OpenStack を構築したいのですが、OpenCenter がどう
Cookbook や Roles, Environment を割り当てているのか知りたかったので、
OpenCenter を使って構築してみました。今回はその準備。今日は OpenCenter で皆さ
んも OpenStack を構築できるようキャプチャ付きで方法を紹介しますが、次の機会に
Chef 単体での OpenStack の構築方法を紹介出来ればいいなぁと思っています。


構成
----

```
+---------------+---------------+---------------+---------------+-------------- public network
|eth0           |eth0           |eth1           |eth1           | eth1
|10.200.10.11   |10.200.10.12   |10.200.10.13   |10.200.10.14   |10.200.10.15
+-------------+ +-------------+ +-------------+ +-------------+ +-------------+
| opencenter  | |   oc-chef   | |oc-controller| | oc-compute01| | oc-compute02|
+-------------+ +-------------+ +-------------+ +-------------+ +-------------+
                                                |10.200.9.14    |10.200.9.15
                                                | eth0          |eth0
                                                +---------------+-------------- vm network
```

* 5台使ってみた
* 全てのノードでインターネットへの経路を public network に向ける
* VM が接続する br100 ブリッジは eth0 にバインドした
* VM からインターネットへのアクセスは oc-computeNN が NAT する
* oc-chef は Chef Server !

OpenCenter の構築
----

構築は...

``` bash
% curl -s -L http://sh.opencenter.rackspace.com/install.sh | sudo bash -s - --role=server
% curl -s -L http://sh.opencenter.rackspace.com/install.sh | \
  sudo bash -s - --role=dashboard --ip=10.200.10.11
```

これだけ！

OpenCenter で管理するノードへエージェントをインストール
----

oc-chef, oc-controller, oc-computeNN は全て OpenCenter で管理する必要があるの
で OpenCeter エージェントをインストールします。

``` bash
% curl -s -L http://sh.opencenter.rackspace.com/install.sh | \
  sudo bash -s - --role=agent --ip=10.200.10.11
```

GUI へアクセス
----

```
https://10.200.10.11
```

ブラウザで上記の URL にアクセスするとデフォルトアカウント情報 (ユーザ名 :
admin, パスワード : password) でログイン出来ます。

{% img /pix/oc01.png 600 %}

こんな感じ。

#### Chef Server のインストール

oc-chef をクリック -> 'Install Chef Server' を選択

暫くするとタスクがグリーンになり完了。

{% img /pix/oc02.png 600 %}

こうなります。この Chef Server 上の Cookbooks, Roles 等を利用して knife
bootstrap しコントローラ・コンピュートノードを構築する仕組みです。

#### NovaCluster の作成

NovaCluster という controller x n, compute x n のセットを意味するモノを作りま
す。入力フォームが表示されるので下記の画像のように入力します。

{% img /pix/oc03.png 600 %}

NAT Exclusion CIDRs が DMZ, VM Network CIDR が Fixed Range だと理解すれば、他
は問題ないように思います。

{% img /pix/oc04.png 600 %}

結果、こうなります。

#### コントローラノード構築

available nodes にあるノード 'oc-controller' を 'Infrastructure' へドラッグア
ンドドロップします。

{% img /pix/oc05.png 600 %}

#### コンピュートノード構築

available nodes にあるノード 'oc-computeNN' を 'AZ Nova' へドラッグアンドドロッ
プします。

{% img /pix/oc07.png 600 %}

2台ともドラッグアンドドロップすると、こうなります。

Horizon へアクセスし操作
----

あとはいつものように OpenStack を操作するだけです。Horizon へは下記の URL でア
クセス出来ます。admin ユーザのパスワードは先ほどの NovaCluster 作成の際に入力
したモノです。

```
https://10.200.10.13
```

まとめ
-----

完成された OpenStack を覗いたのですが monit が利用されていたり、Horizon が
HTTPS 化されていたり、完成度が高かったです。さすが RackSpace 製という感じ。も
う OpenStack 構築スクリプトを作成する必要がなくなったなぁと。Chef で構築するべ
きです。

内部で使われている Chef Cookbooks は下記の URL に同じものがありました。

<https://github.com/rcbops/chef-cookbooks>

この Chef Cookbooks を単体で使って構築してみましたが同様に1コマンドで構築が出
来ました。(オール・イン・ワン構成しか試していません) 僕らとしては GUI は仕事で
は操作しにくいのでこのCookbooks を利用した形で改修し使っていきたいなぁと感じて
います。GUI であってもドラッグアンドドロップで元には戻せませんし、後々
Cookbook に手を入れ構成を変更するといったことも面倒になりそうです。

とは言っても、ドラッグアンドドロップで構築できるなんて... 。誰でも構築できる時
期にあるんですね。運用するには Cookbook を理解している必要がありそうですが、
RackSpace としては Private Cloud Service に運用もセットで付加して売っているの
で問題ないのでしょう。

ちなみに Chef の情報は os-chef ノードの root ユーザホームディレクトリ配下で探
れます。

``` bash
oc-chef# cd ~
oc-chef# knife cookbook list
oc-chef# knife role list
oc-chef# knife environment list
oc-chef# knife environment show NovaCluster01
```
