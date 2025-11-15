+++
title = "Mirantis OpenStack (Neutron GRE)を組んでみた！"
date = "2014-04-23"
slug = "2014/04/23/mirantis-openstack"
Categories = ["infrastructure"]
description = "Mirantis OpenStack ディストリビューションを使った Neutron GRE 構成の構築手順"
+++
こんにちは。<a href="https://twitter.com/jedipunkz">@jedipunkz</a> です。

皆さん、Mirantis OpenStack はご存知ですか？ OpenStack ディストリビューションの
1つです。以下、公式サイトです。

<http://software.mirantis.com/main/>

この Mirantis OpenStack を使って OpenStack Havana (Neutron GRE) 構成を作ってみ
ました。その時のメモを書いていきたいと思います。


構成は?
----

構成は下記の通り。

<img src="http://jedipunkz.github.io/pix/mirantis_gre.jpg">

※ CreativeCommon

特徴は

* Administrative Network : Fuel Node, DHCP + PXE ブート用
* Management Network : 各コンポーネント間 API 用
* Public/Floating IP Network : パブリック API, VM Floating IP 用
* Storage Network : Cinder 配下ストレージ <-> インスタンス間用
* 要インターネット接続 : Public/Floating Networks
* Neutron(GRE) 構成

です。タグ VLAN 使って物理ネットワークの本数を減らすことも出来るはずですが、僕
の環境では何故かダメだったので上記の4つの物理ネットワークを別々に用意しました。

Fuel ノードの構築
----

Fuel ノードとは、OpenStack の各ノードをデプロイするための管理ノードのことです。
DHCP + PXE を管理する Cobbler やデプロイツールの Puppet が内部で稼働し、
Administrative Network 上で稼働したノードを管理・その後デプロイします。

構築方法は...

下記の URL より ISO ファイルをダウンロード。

<http://software.mirantis.com/main/>

Administrative Network に NIC を出したノードを上記の ISO から起動。

Grub メニューが表示されたタイミングで "Tab" キーを押下。

<img src="http://jedipunkz.github.io/pix/grub.png">

上記画面にてカーネルオプションにて hostname, ip, gw, dns を修正。下記は例。

``` bash
vmlinuz initrd=initrd.img biosdevname=0 ks=cdrom:/ks.cfg ip=10.200.10.76
gw=10.200.10.1 dns1=8.8.8.8 netmask=255.255.255.0 hostname=fuel.cpi.ad.jp
showmenu=no_
```

ブラウザで http://10.200.10.76:8080 (上記例)にアクセスし、新しい 'OpenStack
Environment' を作成する。

```
Name : 任意
OpenStack Release : Havana on CentOS6.4
```
    
なお、Ubuntu 構成も組めるが、私の環境では途中でエラーが出力した。

Next を押下し、ネットワーク設定を行う。今回は 'Nuetron GRE' を選択。

<img src="http://jedipunkz.github.io/pix/mirantis_network.png">

'Save Settings' を押下し設定を保存。この時点では 'Verify Networks' は行えない。
少なくとも 2 ノードが必要。次のステップで2ノードの追加を行う。

ノードの追加
----

下記の4つのネットワークセグメントに NIC を出したノードを用意し、起動する。起動
すると Administrative Network 上で稼働している Cobbler によりノードが PXE 起動
しミニマムな OS がインストールされる。これは後に Fuel ノードよりログインがされ、
各インターフェースの Mac アドレス等の情報を知るためです。ネットワークベリファ
イ等もこのミニマムな OS 越しに実施されます。

* Administrative Network
* Public/Floating IP Network
* Storage Network
* Management Network

ノードが稼働した時点で Fuel によりノードが認識されるので、ここでは2つのノード
をそれぞれ

* Controller ノード
* Compute ノード

として画面上で割り当てます。

インターフェースの設定
----

<img src="http://jedipunkz.github.io/pix/mirantis_mac.png">

<http://10.200.10.76:8000/#cluster/1/nodes> にログインし作成した Environment
を選択。その後、'Nodes' タブを押下。ノードを選択し、'Configure Interfaces' を
選択。各ノードのインターフェースの Mac アドレスを確認し、各々のネットワークセ
グメントを紐付ける。尚、Fuel ノードから 'root' ユーザで SSH(22番ポート) にノン
パスフレーズで公開鍵認証ログインが可能となっている。Fuel ノードに対しては SSH
(22番ポート) にて下記のユーザにてログインが可能です。

    username : root
    password : r00tme

ネットワークの確認
----

<http://10.200.10.76:8000/#cluster/1/network> にて 'Networks' タブを開き、'Verify
Networks' を押下。ネットワーク設定が正しく行われているか否かを確認。

デプロイ
----

<http://10.200.10.76:8000/#cluster/1/nodes> にて 'Deploy Changes' を押下しデプ
ロイ開始。kickstart にて OS が自動でインストールされ puppet にて fuel ノードか
ら自動で OpenStack がインストールされます。

OpenStack へのアクセス
----

SSH では下記のステップで OpenStack コントローラノードにログイン。

fuel ノード (SSH) -> node-1 (OpenStack コントローラノード)(SSH)

ブラウザで Horizon にアクセスするには

<http://10.200.10.2>

にアクセス。これは例。Administrative Network に接続している NIC の IP アドレス
へ HTTP でログイン。

まとめ
----

Mirantis OpenStack Neutron (GRE) 構成が組めた。上記構成図を見て疑問に思ってい
た "VM 間通信のネットワークセグメント" であるが、Administrative Network のセグ
メントを用いている事が判った。これは利用者が意図しているとは考えづらいので、正
直、あるべき姿では無いように思える。が、上記構成図に VM ネットワークが無い理由
はこれにて判った。

下記はノード上で ovs-vsctl show コマンドを打った結果の抜粋です。

``` bash
    Bridge "br-eth1"
        Port "br-eth1"
            Interface "br-eth1"
                type: internal
        Port "br-eth1--br-fw-admin"
            trunks: [0]
            Interface "br-eth1--br-fw-admin"
                type: patch
                options: {peer="br-fw-admin--br-eth1"}
        Port "eth1"
            Interface "eth1"
```

今回の構成は eth1 は Administrative Network に割り当てていました。

一昔前は OS のディストリビュータが有料サポートをビジネスにしていました。Redhat
がその代表格だと思いますが、今は OS 上で何かを実現するにもソフトウェアの完成度
が高く、エンジニアが困るシチュエーションがそれほど無くなった気がします。そこで
その OS の上で稼働する OpenStack のサポートビジネスが出てきたか！という印象で
す。OpenStack はまだまだエンジニアにとって敷居の高いソフトウェアです。自らクラ
ウドプラットフォームを構築出来るのは魅力的ですが、サポート無しに構築・運用する
には、まだ難しい技術かもしれません。こういったディストリビューションが出てくる
辺りが時代だなぁと感じます。

尚、ISO をダウンロードして利用するだけでしたら無償で OK です。
