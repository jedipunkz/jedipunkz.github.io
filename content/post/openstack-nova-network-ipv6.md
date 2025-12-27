+++
title = "OpenStack nova-network IPv6 対応"
date = "2013-08-18"
Categories = ["infrastructure"]
description = "OpenStack の nova-network を IPv6 対応にする設定手順と構成方法"
aliases = [
  "/blog/2013/08/18/openstack-nova-network-ipv6",
  "/post/2013/08/18/openstack-nova-network-ipv6"
]
+++
こんにちは。<a href="https://twitter.com/jedipunkz">@jedipunkz</a> です

今更なのかもしれませんが、OpenStack の nova-network を IPv6 対応する方法を調べ
てみました。何故 nova-network なのか? 自宅の構成が nova-network だからです..。
以前は Quantum (現 Neutron) 構成で使っていましたが、ノードをコントローラとコン
ピュートに別けた時に NIC が足らなくなり...。

さて本題です。下記のサイトを参考にしました。ほぼそのままの手順ですが、自分のた
めにもメモです。

参考 URL
----

<http://docs.openstack.org/grizzly/openstack-compute/admin/content/configuring-compute-to-use-ipv6-addresses.html>

前提
----

* OpenStack の構成は予め構築されている
* nova-network を用いている
* 構成はオールインワンでも複数台構成でも可能

手順
----

nova がインストールされているすべてのノードで python-netaddr をインストールし
ます。私の場合は rcbops の chef cookbooks で構築したのですが、既にインストール
されていました。

``` bash
% sudo apt-get install python-netaddr
```

nova-network が稼働しているノードで radvd をインストールします。これは
IPv6 を Advertise しているルータ等が予め備わっている環境であっても、インストー
ルする必要があります。また /etc/radvd.conf が初め無いので radvd 単体では稼働し
ませんが、問題ありません。OpenStack の場合 /var/lib/nova 配下のコンフィギュレー
ションファイルを読み込んでくれます。

``` bash
% sudo apt-get install radvd
```

/etc/sysctl.conf に下記の記述を追記します。RA の受信とフォワーディングを許可し
ています。

``` bash
% ${EDITOR} /etc/sysctl.conf
net.ipv6.conf.default.forwarding=1
net.ipv6.conf.all.forwarding = 1
net.ipv6.conf.all.accept_ra = 1
% sudo sysctl -p
```

nova がインストールされている全てのノードで /etc/nova.conf に下記の行を追記し
ます。

``` bash
% sudo ${EDITOR} /etc/nova/nova.conf
use_ipv6=true # <- 追記
```

nova プロセスを再起動します。

``` bash
% cd /etc/init.d/; for i in $( ls nova-* ); do sudo service $i restart; done
```

次に IPv6 のレンジの仮想ネットワークを nova-manage コマンドで生成します。環境にあったレンジを
追加してください。

``` bash
 % sudo nova-manage network create public --fixed_range_v4 x.x.x.x/24 \
   --fixed_range_v6 xxxx:xxx:xx:xxx::/64 --bridge=br300 --bridge_interface=eth0 \
   --dns1=8.8.8.8 --dns2=8.8.4.4 --multi_host=T
```

ここで IPv4 のレンジも追加しなくてはならないようです。IPv6 オンリーで生成したところ、
nova-network が下記のエラーを吐いてハングアップしました。

```
TRACE nova Stderr: 'Error: an inet prefix is expected rather than "None".\n'
```

また仮想ネットワーク生成時に指定した物理ネットワークインターフェース名は IPv6 が通信出来る
セグメントのものを利用してください。(環境に合わせてください)

あとは nova boot で仮想マシンを生成すると IPv4, IPv6 のデュアルスタックで起動してきます。

まとめ
----

OpenStack 外の構成についても IPv6 にもちろん対応している必要があります。上記の例だと 
OpenStack の eth0 側の IPv6 ネットワークを適切にルーティングしてくれるルータが必要です。
自分の場合は自宅で Vyatta を使って行いました。(今度その方法も記そうと思います) また
floating ip は IPv6 には対応していないそうです。はじめこの方法を取ろうと思ったのですがダメでした。
上記のように public ネットワーク側のネットワークインターフェースをブリッジインターフェースにして
public ネットワークを生成する方法で対応出来ますので問題ないかと。

また、Neutron 構成でも今度 IPv6 対応してみないと。:D
