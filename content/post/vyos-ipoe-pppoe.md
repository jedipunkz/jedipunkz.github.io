---
title: "VyOS で IPoE/PPPoE 併用して安定した接続&サーバー公開"
date: 2023-12-10T01:14:57+09:00
Categories: ["infrastructure"]
draft: false
---
<a href="https://twitter.com/jedipunkz">@jedipunkz</a> です。PPPoE 接続をして Global IPv4 アドレスを取得して自宅にマイクラサーバーを外部公開したり、その接続を使って各端末でオンラインゲームやインターネットをしています。ただ、IPoE 接続すると混雑時間を回避出来ると聞いていたので、普段のゲームや各端末のインターネット接続は IPoE 接続を利用、マイクラサーバーは PPPoE で公開、と出来ないかと考えました。

ここでは VyOS を使ってその両者を満たす接続の設定方法を記します。

## 要件

- PPPoE して Global IPv4 を取得しサーバーを外部に提供
- (その際に Dynamic DNS を利用 (自宅は Cloudflare))
- サーバー以外の端末のトラヒックは IPoE 接続した経路に流す
- VyOS のバージョンは 1.3.4 (2023/12 時点で最新の Stable バージョン) を利用
- 回線はNTT フレッツ想定 (自分の場合は Asahi-net, IPv6 接続オプションあり, その他でも可)

## ISO イメージをビルド

VyOS は Stable のバージョンは有償バージョンでないとダウンロード出来ませんがビルドすれば ISO イメージが作れます。その方法を記します。

- 2023/12 時点で最新の Stable Version 1.3.4 を指定
- 適当な Linux 端末でビルドしましたが Docker を利用できればどこでも良さそう

```shell
git clone -b equuleus https://github.com/vyos/vyos-build
cd vyos-build/
docker run --rm -it --privileged -v $(pwd):/vyos -w /vyos vyos/vyos-build:equuleus bash
./configure --architecture amd64 --build-type release --version 1.3.4
sudo make iso
```

ビルドが完了すると `build/` ディレクトリ配下に iso イメージが出来上がっているはずです。

## 構成

- 下記のように VyOS マシンには NIC が2つ以上あれば要件満たせます。

```
+--------------+     +----------------+     +-------------+
| the internet | --- | eth0 vyos eth1 | -+- | IPv4 server | 10.0.1.100/32
+--------------+     +----------------+  |  +-------------+
                           10.0.1.254/32 |
                                         |  +---------------+
                                         +- | other clients | ... 10.0.1.0/24
                                            +---------------+
```

## 手順

### eth1 のネットワークアドレス設定

```shell
set interface ethernet eth1 address 10.0.1.254
```

### IPoE 接続

eth0 側で IPv6 の IP アドレスを受け取ります。

```shell
set interface ethernet eth0 address dhcpv6
set interface ethernet eth0 dhcpv6-options parameters-only
set interface ethernet eth0 ipv6 address autoconf
set interface ethernet eth0 ipv6 disable-forwarding
commit
```

この時点で数分待つと IPv6 アドレスが取得できます。

```shell
run show int
Codes: S - State, L - Link, u - Up, D - Down, A - Admin Down
Interface        IP Address                        S/L  Description
---------        ----------                        ---  -----------
eth0             2405:xx:xx:xx:xx:xx:xx:xxx/64
...

自宅の場合は Asahi-net というプロバイダです。v6 connect という IPv6 接続オプションなのですが、終端の情報は公開していないとサポートから聞きました。よってここにもアドレスを記すのは問題だと思うので記しません。ただ参考資料だけ掲載しておきます。

- https://scrapbox.io/for2ando/Asahi%E3%83%8D%E3%83%83%E3%83%88DS-Lite%E3%81%AEAFTR%E3%82%A2%E3%83%89%E3%83%AC%E3%82%B9%E3%82%92%E8%AA%BF%E3%81%B9%E3%82%8bash
- https://gist.github.com/stkchp/4daea9158439c32d7a70a255d51e568b

また DS-Lite で transix の場合は `dig @2404:1a8:7f01:b::3 gw.transix.jp aaaa +short` で引けるアドレスがそれになるそうです。


```shell
set interfaces tunnel tun0 encapsulation ipip6
set interfaces tunnel tun0 multicast disable
set interfaces tunnel tun0 remote 2001:xxx:x:xxx:xx #接続先終端
set interfaces tunnel tun0 source-address 2405:xx:xx:xx:xx:xx:xx:xxx/64 #上記手順で取得
set protocols static interface-route 0.0.0.0/0 next-hop-interface tun0
commit
```

この時点で IPv6 でも IPv4 (IPv4 over IPv6) でもインターネットに接続できるはずです。

### IPoE 接続を利用した宅内端末のインターネット接続

eth1 側に接続した各端末が IPv4 でインターネットに接続できるよう NAT の設定を行います。

```shell
set nat source rule 100 description 'LAN Source NAT'
set nat source rule 100 outbound-interface tun0
set nat source rule 100 source address 10.0.1.0/24
set nat source rule 100 translation address masquerade
commit
```

この時点で宅内の各端末が IPv4 でインターネットに接続出来ます。

### PPPoE 接続して IPv4 Server 公開

PPPoE 接続を行います。そして IPv4 Server を外部に公開する手順です。

まず PPPoE 接続します。

```shell
set interface pppoe pppoe0 authentication user xxxxx
set interface pppoe pppoe0 authentication password xxxxxxx
set inetrface pppoe pppoe0 source-interface eth0
set inetrface pppoe pppoe0 mtu 1454
```

Source NAT をこの IPv4 Server 用に行って PPPoE 接続経路からインターネットに接続できるようにします。

```shell
set nat source rule 110 description 'Server Source NAT'
set nat source rule 110 outbound-interface pppoe0
set nat source rule 110 source address 10.0.1.100/32
set nat source rule 110 translation address masquerade
```

Destination NAT で IPv4 Server を外部公開します。

```shell
set nat destination rule 19132 description 'Minecraft'
set nat destination rule 19132 destination port 19132 #公開するサービス次第
set nat destination rule 19132 inbound-interface pppoe0
set nat destination rule 19132 protocol udp #公開するサービス次第
set nat destination rule 19132 translation address 10.0.1.100
set nat destination rule 19132 translation port 19132 #公開するサービス次第

同様の目的で Policy Based Routing を書きます。

```shell
set policy route PBR rule 10 description 'ipv4 server traffic via pppoe'
set policy route PBR rule 10 set table 100
set policy route PBR rule 10 source address 10.0.1.100/32
set policy route PBR rule 20 description 'FLETS'
set policy route PBR rule 20 destination address 0.0.0.0/0
set policy route PBR rule 20 protocol tcp
set policy route PBR rule 20 set tcp-mss 1414
set policy route PBR rule 20 tcp flags SYN,!ACK,!FIN,!RST
```

作成した Policy Based Route を interface にアタッチします。

```shell
set interface ethernet eth1 policy PBR
```

### Dynamic DNS して IPv4 Server の DNS 名付与

ここはおまけですが、自分の場合 Cloudflare でドメイン名を取得したのでそのドメインを利用して IPv4 Server に FQDN を付与します。もちろん固定 IPv4 オプションを契約していればこの手順は不要で、単にホスト名を DNS 解決すれば OK です。

ここでは下記を前提として手順を記します。

- 取得したドメイン名は `foo.com`
- IPv4 Server のホスト名は `bar'

```shell
set service dns dyamic interface pppoe0 service cloudflare host-name bar.foo.com
set service dns dyamic interface pppoe0 service cloudflare login <email address>
set service dns dyamic interface pppoe0 service cloudflare password <global api key>
set service dns dyamic interface pppoe0 service cloudflare protocol cloudflare
set service dns dyamic interface pppoe0 service cloudflare zone foo.com
commit
```

この状態で下記の操作で状態を確認します。

```shell
run show dns dynamic status
ip address   : 14.x.x.x
host-name    : bar.foo.com
last update  : 2023-12-DD 07:16:59
update-status: good
```

名前解決を確認します。


```shell
dig bar.foo.com. a +short
x.x.x.x
```

### Firewall 設定

```shell
set firewall name LAN_OUT description 'LAN to the Internet'
set firewall name LAN_OUT default-action accept
set firewall name WAN_IN description 'WAN to Internal'
set firewall name WAN_IN default-action drop
set firewall name WAN_IN rule 10 action accept
set firewall name WAN_IN rule 10 state established enable
set firewall name WAN_IN rule 10 state related enable
set firewall name WAN_IN rule 20 action drop
set firewall name WAN_IN rule 20 state invalid enable
set firewall name WAN_IN rule 19132 description 'Minecraft'
set firewall name WAN_IN rule 19132 action accept
set firewall name WAN_IN rule 19132 destination address 10.0.1.100
set firewall name WAN_LOCAL default-action drop
set firewall name WAN_LOCAL rule 10 action accept
set firewall name WAN_LOCAL rule 10 state established enable
set firewall name WAN_LOCAL rule 10 state related enable
set firewall name WAN_LOCAL rule 20 action drop
set firewall name WAN_LOCAL rule 20 state invalid enable
```

作成した firewall を interface にアタッチします。

```shell
set interface pppoe pppoe0 firewall in name WAN_IN
set interface pppoe pppoe0 firewall local name WAN_LOCAL
set interface pppoe pppoe0 firewall out name LAN_OUT
commit
save
```

## まとめ

前述した要件すべてが満たせませいた。ただ課題もあります。

- IPv6 の Firewall 設定がまだ (後に追記しようと思います)
- IPoE が結構遅い

前者はただ設定すればいいだけなので解決出来るのですが、後者の課題は想定とは異なっていました。帯域も PPPoE の数分の1程度、レイテンシも時間帯によっては若干劣ります。そもそも自分の場合は Asani-net の v6connect を使っていて、本来終端の情報等を自動設定できる対応ルータのみサポートしているそうです。サポート外の方法で接続している時点で不安はあります...。よって PPPoE 接続オンリーのホットスタンバイ機を今回設定したルータの横に隣接して並べています。


