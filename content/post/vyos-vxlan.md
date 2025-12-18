+++
title = "VyOS で VXLAN を使ってみる"
date = "2014-12-16"
Categories = ["infrastructure"]
+++
こんにちは。@jedipunkz です。

VyOS に VXLAN が実装されたと聞いて少し触ってみました。この情報を知ったきっかけ
は @upaa さんの下記の資料です。

参考資料 : http://www.slideshare.net/upaa/vyos-users-meeting-2-vyosvxlan

VyOS は御存知の通り実体は Debian Gnu/Linux 系の OS でその上に OSS なミドル
ウェアが搭載されていて CLI でミドルウェアのコンフィギュレーション等が行えるモ
ノになっています。Linux で VXLAN といえば OVS を使ったモノがよく知られています
が VyOS の VXLAN 機能は Linux Kernel の実装を使っているようです。

要件
----

* トンネルを張るためのセグメントを用意
* VyOS 1.1.1 (現在最新ステーブルバージョン) が必要
* Ubuntu Server 14.04 LTS (同じく Linux VXLAN 搭載バージョン)

構成
----

特徴

* マネージメント用セグメント 10.0.1.0/24 を用意
* GRE と同じくトンネル終端が必要なのでそのためのセグメント 10.0.2.0/24 を用意
* 各 eth1 は IP reachable である必要があるので予め IP アドレスの設定と疎通を確認
* VXLAN を喋れる Ubuntu 14.04 LTS x 1 台と VyOS 1.1.1 x 2 台で相互に疎通確認

```
+-------------+-------------+------------ Management 10.0.1.0/24
|10.0.0.254   |10.0.0.253   |10.0.0.1
|eth0         |eth0         |eth0
+----------+  +----------+  +----------+ 
|  vyos01  |  |  vyos02  |  |  ubuntu  |
+-+--------+  +----------+  +----------+ 
| |eth1       | |eth1       | |eth1
| |10.0.2.254 | |10.0.2.253 | |10.0.2.1
| +-----------)-+-----------)-+---------- Tunneling 10.0.2.0/24
|             |             |
+-------------+-------------+------------ VXLAN(eth1にlink) 10.0.1.0/24
10.0.1.254     10.0.1.253    10.0.1.1
```

設定を投入
----

vyos01 の設定を行う。VXLAN の設定に必要なものは...

* VNI (VXLAN Network Ideintity)という識別子
* Multicast Group Address
* 互いに IP reachable なトンネルを張るためのインターフェース

です。これらを意識して下記の設定を vyos01 に投入します。

```bash
$ configure
% set interfaces vxlan vxlan0
% set interfaces vxlan vxlan0 group 239.1.1.1
% set interfaces vxlan vxlan0 vni 42
% set interfaces vxlan vxlan0 address '10.0.1.254/24'
% set interfaces vxlan vxlan0 link eth1
```

設定を確認します

```bash
% exit
$ show int
...<省略>...
    vxlan vxlan0 {
     address 10.0.1.254/24
     group 239.1.1.1
     link eth1
     vni 42
}
```

VyOS の CLI を介さず直 Linux の設定を iproute2 で確認してみましょう。
VNI, Multicast Group Address と共に 'link eth1' で設定したトンネルを終端するための物理 NIC が確認できます。

```bash
vyos@vyos01# ip -d link show vxlan0
5: vxlan0: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1450 qdisc noqueue state UNKNOWN mode DEFAULT group default
    link/ether 86:24:26:b2:11:5c brd ff:ff:ff:ff:ff:ff promiscuity 0
    vxlan id 42 group 239.1.1.1 dev eth1 port 32768 61000 ttl 16 ageing 300
```

vyos02 の設定を同様に行います。

```bash
$ congigure
% set interfaces vxlan vxlan0 address '10.0.1.253/24'
% set interfaces vxlan vxlan0 vni 42
% set interfaces vxlan vxlan0 group 239.1.1.1
% set interfaces vxlan vxlan0 link eth1
```

設定の確認を行います。

```bash
... 省略 ...
vxlan vxlan0 {
     address 10.0.1.254/24
     group 239.1.1.1
     link eth1
     vni 42
}
```

同じく Linux の iproute2 で確認します。

```bash
vyos@vyos01# ip -d link show vxlan0
5: vxlan0: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1450 qdisc noqueue state UNKNOWN mode DEFAULT group default
    link/ether 86:24:26:b2:11:5c brd ff:ff:ff:ff:ff:ff promiscuity 0
    vxlan id 42 group 239.1.1.1 dev eth1 port 32768 61000 ttl 16 ageing 300
```

ubuntu ホストの設定を行っていきます。

Ubuntu Server 14.04 LTS であればパッチを当てること無く Linux Kernel の VXLAN 機能を使うことができます。
設定内容は VyOS と同等です。VyOS がこの Linux の実装を使っているのがよく分かります。

```bash
sudo modprobe vxlan
sudo ip link add vxlan0 type vxlan id 42 group 239.1.1.1 dev eth1
sudo ip link set up vxlan0
sudo ip a add 10.0.1.1/24 dev vxlan0
```

同じく Linux iproute2 で確認を行います。

```bash
 ip -d link show vxlan0
5: vxlan0: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1450 qdisc noqueue state UNKNOWN mode DEFAULT group default
    link/ether d6:ff:c1:27:69:a0 brd ff:ff:ff:ff:ff:ff promiscuity 0
    vxlan id 42 group 239.1.1.1 dev eth1 port 32768 61000 ageing 300
```

疎通確認
----

疎通確認を行います。

ubuntu -> vyos01 の疎通確認です。ICMP で疎通が取れることを確認できます。

```bash
thirai@ubuntu:~$ ping 10.0.1.254 -c 3
PING 10.0.1.254 (10.0.1.254) 56(84) bytes of data.
64 bytes from 10.0.1.254: icmp_seq=1 ttl=64 time=0.272 ms
64 bytes from 10.0.1.254: icmp_seq=2 ttl=64 time=0.336 ms
64 bytes from 10.0.1.254: icmp_seq=3 ttl=64 time=0.490 ms

--- 10.0.1.254 ping statistics ---
3 packets transmitted, 3 received, 0% packet loss, time 1999ms
rtt min/avg/max/mdev = 0.272/0.366/0.490/0.091 ms
```

次に ubuntu -> vyos02 の疎通確認です。

```bash
thirai@ubuntu:~$ ping 10.0.1.253 -c 3
PING 10.0.1.253 (10.0.1.253) 56(84) bytes of data.
64 bytes from 10.0.1.253: icmp_seq=1 ttl=64 time=0.272 ms
64 bytes from 10.0.1.253: icmp_seq=2 ttl=64 time=0.418 ms
64 bytes from 10.0.1.253: icmp_seq=3 ttl=64 time=0.451 ms

--- 10.0.1.253 ping statistics ---
3 packets transmitted, 3 received, 0% packet loss, time 1998ms
rtt min/avg/max/mdev = 0.272/0.380/0.451/0.079 ms
```

この時点で ubuntu ホストの fdb (forwarding db) の内容を確認します。

```bash
$ bridge fdb show dev vxlan0
00:00:00:00:00:00 dst 239.1.1.1 via eth1 self permanent
4e:69:a4:a7:ef:1c dst 10.0.2.253 self
86:24:26:b2:11:5c dst 10.0.2.254 self
```

vyos01, vyos02 のトンネル終端 IP アドレスと Mac アドレスが確認できます。ubuntu ホストから見ると
送信先は vyos0[12] の VXLAN インターフェースではなく、あくまでもトンネル終端を行っているインターフェース
になることがわかります。

まとめ
----

VyOS ver 1.1.0 には VXLAN を物理インターフェースに link する機能に不具合がありそうなので今ら ver 1.1.1 を使うしか
なさそう。とは言え、ver 1.1.1 なら普通に動作しました。

VyOS は仮想ルータという位置付けなので今回紹介したようにインターフェースを VXLAN ネットワークに所属させる
機能があるのみです。VXLAN Trunk を行うような設定はありません。これはハイパーバイザ上で動作させることを前提
に設計されているので仕方ないです..というかスイッチで行うべき機能ですよね..。VM を接続して云々するには OVS
のようなソフトウェアスイッチを使えばできます。

また fdb は時間が経つと情報が消えます。これは VXLAN のメッシュ構造なトンネルがその都度張られているのかどうか
気になるところです。ICMP の送信で一発目のみマルチキャストでその後ユニキャストになることを確認しましたが、その
一発目のマルチキャストでトンネリングがされるものなのでしょうか...。あとで調べてみます。OVS のように CLI で
トンネルがどのように張られているか確認する手段があれば良いのですが。

以上です。
