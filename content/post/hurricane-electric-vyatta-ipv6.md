+++
title = "Hurricane Electric + Vyatta で宅内 IPv6 化"
date = "2013-09-01"
slug = "2013/09/01/hurricane-electric-vyatta-ipv6"
Categories = ["infrastructure"]
+++
こんにちは。<a href="https://twitter.com/jedipunkz">@jedipunkz</a> です。

自宅の IPv6 化、したいなぁとぼんやり考えていたのですが、Hurricane Electric
Internet Services を見つけました。IPv4 の固定グローバル IP を持っていれば誰で
も IPv6 のトンネルサービスを無料で受けられるサービスです。

1つのユーザで5アカウントまで取得でき (5 エンドポイント)、1アカウントで /64 の
アドレスがもらえます。また申請さえすれば (クリックするだけ) /48 も1アカウント
毎にもらえます。つまり /48 x 5 + /64 x 5 ... でか！

私の宅内は Vyatta で PPPOE してるのですが、各種 OS (Debian, NetBSD...) や機器
(Cisco, JunOS..)のコンフィギュレーションを自動生成してくれるので、接続するだけ
であればそれをターミナルに貼り付けるだけ！です。

サービス URL
----

Hurricane Electric は下記の URL です。アカウントもここで作成出来ます。

<http://tunnelbroker.net>

IPv6 接続性を確保する方法
----

Vyatta が IPv6 のアドレスを持ち接続性を確保するだけであれば、上に記したように
コピペで出来ます。上記の URL でアカウントを作成しログインします。左メニューの
"Create Regular Tunnel" を押して、自分の情報 (IPv4 のエンドポイントアドレス等)
を入力します。その後、取得した IPv6 のレンジのリンクをクリックし上記メニュー
"Example Configuration" を選択します。プルダウンメニューが現れるので、自宅の
OS や機器に合った名前を選択します。

すると下記のようなコマンドがテキストエリアに出力されるのでこれをコピペする...だ
けです。

``` bash
configure
edit interfaces tunnel tun0
set encapsulation sit
set local-ip xxx.xxx.xxx.xxx
set remote-ip xxx.xxx.xxx.xxx
set address 2001:470:xx:xxx:2/64
set description "HE.NET IPv6 Tunnel"
exit
set protocols static interface-route6 ::/0 next-hop-interface tun0
commit
```

コピペしたら接続できたか確認しましょう。

``` bash
% ping6 ipv6.google.com -c 3
PING ipv6.google.com(2404:6800:4004:803::1010) 56 data bytes
64 bytes from 2404:6800:4004:803::1010: icmp_seq=1 ttl=59 time=32.6 ms
64 bytes from 2404:6800:4004:803::1010: icmp_seq=2 ttl=59 time=27.4 ms
64 bytes from 2404:6800:4004:803::1010: icmp_seq=3 ttl=59 time=20.5 ms

--- ipv6.google.com ping statistics ---
3 packets transmitted, 3 received, 0% packet loss, time 2002ms
rtt min/avg/max/mdev = 20.542/26.901/32.677/4.971 ms
```

Vyatta 配下の宅内 LAN の端末を IPv6 化する
----

ここまでの操作だと Vyatta は IPv6 トンネル接続出来ましたが、その配下の機器はま
だ接続できていません。そこで IPv6 RA (Router Advertise) します。

``` bash
configure
edit interfaces ethernet eth0 
set ipv6 router-advert send-advert true
set ipv6 router-advert cur-hop-limit 64
set ipv6 router-advert max-interval 10
set ipv6 router-advert other-config-flag true
set ipv6 router-advert default-preference high
set ipv6 router-advert managed-flag true
set ipv6 router-advert prefix 2001:470:xx:xxx::/64
set ipv6 router-advert prefix 2001:470:xx:xxx::/64 autonomous-flag true
commit
```

ここで RA のみの起動をしていますが、LAN 内に Windows 端末がある場合、IPv6 ネー
ムサーバの情報が取得できないため DHCPv6 サーバを別途起動する必要があります。が、
私の LAN 内には Mac, Linux, *BSD しかありませんでしたので起動しませんでした。
必要に応じて起動してください。

IPv6 ファイアーウォール設定
----

これで端末も IPv6 トンネル接続できるようになった！のですが、外部から端末に直接
接続が出来てしまいます。ファイアーウォールを設定しましょう。

``` bash
configure
set firewall ipv6-name tun-in description "IPv6 Traffice to Internal"
set firewall ipv6-name tun-in default-action drop
set firewall ipv6-name tun-in rule 10 action accept
set firewall ipv6-name tun-in rule 10 description "Accept Established-Related"
set firewall ipv6-name tun-in rule 10 state established enable
set firewall ipv6-name tun-in rule 10 state related enable
set firewall ipv6-name tun-local default-action drop
set firewall ipv6-name tun-local description "IPv6 Traffic to Router"
set firewall ipv6-name tun-local rule 10 action accept
set firewall ipv6-name tun-local rule 10 description "Accept Established-Related"
set firewall ipv6-name tun-local rule 10 state established enable
set firewall ipv6-name tun-local rule 10 state related enable

set interface tunnel tun0 firewall in ipv6-name tun-in
set interface tunnel tun0 firewall local ipv6-name tun-local
commit
save
```

まとめ
----

ルータ配下のサービスを IPv6 で外部に公開したい場合は tun-in のファイアーウォールに
ルールを追加すれば OK です。

また自動生成出来るサンプルコンフィギュレーションに対応したOS, 機器の種類が豊富です。
pfSense や Solaris, Windows, ScreenOS, Fortigate 等など、多岐にわたっているの
で、大抵の方は問題ないのではないでしょうか。

