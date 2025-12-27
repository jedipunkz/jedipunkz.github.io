+++
title = "Vyatta で L2TP over IPsec による VPN 構築"
description = "Vyatta で L2TP over IPsec による安全な VPN 環境を構築する方法。PPTP の脆弱性を回避した推奨構成を解説"
date = "2013-08-24"
Categories = ["infrastructure"]
aliases = [
  "/blog/2013/08/24/vyatta-l2tp-ipsec-vpn",
  "/post/2013/08/24/vyatta-l2tp-ipsec-vpn"
]
+++
こんにちは。<a href="https://twitter.com/jedipunkz">@jedipunkz</a> です。

以前、こんな記事をブログに記しました。2012/06 の記事です。

<http://jedipunkz.github.io/post/vyatta-vpn/>

その後、PPTP で保護されたネットワークの VPN パスワードを奪取出来るツールが公開
されました。2012/07 のことです。よって今では VPN に PPTP を用いることが推奨さ
れていません。

ということで L2TP over IPsec による VPN 構築を Vyatta で行う方法を記します。

fig.1 : home lan と vyatta のアドレス
----

```
                +--------+                      +-----+
    home lan ---| vyatta | --- the internet --- | CPE |
                +--------+                      +-----+
    X.X.X.X/X(NAT)     pppoe0
                       Y.Y.Y.Y
```

この様に X.X.X.X/X と Y.Y.Y.Y/Y が関係しているとします。CPE は VPN により
X.X.X.X/X に接続することが出来ます。

手順 : IPsec
----

下記の操作で IPsec を待ち受けるインターフェースの設定します。

``` bash
% configure
# edit vpn ipsec
# set ipsec-interface interface pppoe0
```

インターフェース名は環境に合わせて設定してください。私の環境では pppoe0 です。

IPsec パケットが NAT を超えるように設定します。

``` bash
# set nat-traversal enable
```

CPE がどの環境にいるか、IPsec 接続を許可するネットワークアドレスを入力します。
渡しの場合はどこからでも接続できるよう 0.0.0.0/0 を入力しました。

``` bash
# set nat-networks allowed-network 0.0.0.0/0
# exit
```

手順 : L2TP
----

入力を省くために edit します。

``` bash
# edit vpn l2tp remote-access
```

IPsec 認証モードに pre-shared-secret を選択し pre-shared-secret (パスワード)
を設定します。このパスワードは接続するユーザ全員が知るものです。また認証モード
を local に設定します。

``` bash
# set ipsec-settings authentication mode pre-shared-secret
# set ipsec-settings authentication pre-shared-secret <パスワード>
# set authentication mode local
```

接続ユーザを作成します。パスワードはユーザに合わせたパスワードを入力します。先
ほど設定した pre-shared-secret とは別のパスワードを設定するべきです。

``` bash
# set authentication local-users username <ユーザ名> password <パスワード>
```

接続するネットワーク情報を記します。pool のアドレス範囲は環境に合わせて設定し
てください。渡しの場合は第4オクテット 100 - 120 を設定しました。

``` bash
# set outside-address Y.Y.Y.Y
# set client-ip-pool start X.X.X.100
# set client-ip-pool stop X.X.X.120
```

最後に commit & save を忘れずに。

``` bash
# commit
# save
```

まとめ
----

iPhone で接続を確認しました。iOS の場合は L2TP, PPTP, IPsec と3つのタブがあり、
どれかを選択するようになっていますが、L2TP over IPsec の場合には L2TP タブの項
目に情報を入力すれば OK です。

