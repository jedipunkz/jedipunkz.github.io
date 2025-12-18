+++
title = "Cobbler で OS 自動インストール"
date = "2013-07-28"
Categories = ["infrastructure"]
description = "Cobbler を使った複数 OS ディストリビューションの PXE 自動インストール環境構築"
aliases = [
  "/blog/2013/07/28/cobbler-os-automation-install",
  "/post/2013/07/28/cobbler-os-automation-install"
]
+++
こんにちは。<a href="https://twitter.com/jedipunkz">@jedipunkz</a> です。

最近、自動化は正義だと最近思うのですが、その手助けをしてくれるツール Cobbler
を試してみました。Cobbler と複数 OS, ディストリビューションを CLI, GUI で管理出
来るツールです。PXE, TFTP, DHCPを組分せれば OS の自動構築が出来るのは古くから
ありますが、TFTP サーバに配置するカーネルイメージやマックアドレスの管理を一元
して管理してくれるのがこの Cobbler です。


今回は Cobbler の構築方法をお伝えします。本当は Chef Cookbooks で構築したかっ
たのですが Opscode Community にある Cookbooks はイマイチだったので、今回は手動
で。

前提環境
----

* OS は CentOSを。Ubuntu を利用すると DHCP のコンフィギュレーションを自動で出
  来ません
* 利用するネットワークの DHCP はオフにします

構築手順
----

SELINUX を無効にします。石◯さん、ごめんなさい。

``` bash
# ${EDITOR} /etc/sysconfig/selinux
SELINUX=disabled
# setenforce 0
```

EPEL のレポジトリを追加します。

``` bash
# rpm -Uvh http://ftp.iij.ad.jp/pub/linux/fedora/epel/6/x86_64/epel-release-6-8.noarch.rpm
```

cobbler をインストールします。またその他必要なパッケージもここでインストールし
ます。

``` bash
# yum install cobbler debmirror pykickstart
```

自分の設定したいパスワードを生成して /etc/cobbler/settings 内の
default_password_crypted: に設定します。パスワードの生成は下記のように openssl
コマンドを利用します。

``` bash
% openssl passwd -1
```

/etc/cobbler/settings 内の下記のパラメータについて設定します。manage_dhcp: は
1 にしておくと、Cobbler が自動で ISC DHCP の設定も書き換えてくれるので、ほぼ必
須の設定です。

```
server: <自ホストの IP>
next_server: <自ホストの IP>
manage_dhcp: 1
```

/etc/cobbler/dhcp.template を設定します。自分のネットワーク環境に合わせて設定
します。

```
subnet 192.168.1.0 netmask 255.255.255.0 {
     option routers             192.168.1.254;
     option domain-name-servers 8.8.8.8,8.8.4.4;
     option subnet-mask         255.255.255.0;
     range dynamic-bootp        192.168.1.120 192.168.1.150;
     default-lease-time         21600;
     max-lease-time             43200;
     next-server                $next_server;
     class "pxeclients" {
          match if substring (option vendor-class-identifier, 0, 9) = "PXEClient";
          if option pxe-system-type = 00:02 {
                  filename "ia64/elilo.efi";
          } else if option pxe-system-type = 00:06 {
                  filename "grub/grub-x86.efi";
          } else if option pxe-system-type = 00:07 {
                  filename "grub/grub-x86_64.efi";
          } else {
                  filename "pxelinux.0";
          }
     }
}
```

/etc/xinetd.d/rsync の disable = yes を no に設定します。

``` bash
# ${EDITOR} /etc/xinetd.d/rsync
<snip>
    disable = no
<snip>
```

サービスを起動します。

``` bash
# service cobbler start
# service dhcpd start
# service httpd start
# service xinetd start
```

OS 起動時に各サービスが起動するよう設定します。

``` bash
# chkconfig cobbler on
# chkconfig dhcpd on
# chkconfig httpd on
# chkconfig xinetd on
```

iptables をオフにします。

``` bash
# service iptables stop
# chkconfig iptables off
```

構築は完了です。

ディストリビューションのインポート
----

ここではテストで Ubuntu Server 12.04 amd64 をインポートしてみます。

ダウンロードしてきたインストール ISO をマウントします。

``` bash
# mount -t iso9660 -o loop,ro /path/to/Image.iso /mnt
```

インポートします。

``` bash
# cobbler import --name=ubuntu1204 --arch=x86_64 --path=/mnt
```

Debian 系の Ubuntu は x86_64 ではなく通常 amd64 と記しますが、Cobbler が
CentOS, RHEL を前提に開発されているので x86_64 と記します。注意してください。

インポートされたか確認します。

``` bash
# cobbler distro list
# cobbler profile list
```

ここでは自分の作成した preseed.cfg を使いたいのでその設定を行います。この操作
は行わなくても構いませんが、preseed.cfg 内で自分の環境に合わせて色々したいと思
うので、行なっておくと便利です。予め preseed.cfg は作成する必要ありますが。

``` bash
# cp /path/to/preseed.cfg /var/lib/cobbler/kickstarts/ubuntu1204-preseed.cfg
# cobbler profile edit --name=ubuntu1204-x86_64 \
 --kickstart=/var/lib/cobbler/kickstarts/ubuntu1204-preseed.cfg \
 --kopts="priority=critical locale=en_US"
```

インストールターゲットマシンの登録
----

インストールターゲットのマシンを登録します。予め NIC の Mac アドレスを用意して
ください。

``` bash
# cobbler system add --name=foo --profile=ubuntu1204-x86_64
# cobbler system edit --name=foo --interface=eth0 \
 --mac=00:1c:25:72:1f:79 --ip-address=192.168.1.120 --netmask \
 255.255.255.0 --static=0
# cobbler system edit --name=foo -gateway=192.168.1.254 --hostname=foo
```

こちらもネットワーク環境に合わせて gateway や netmask の情報を記してください。

ターゲットマシンのインストール
----

PXE ブートするだけです。

まとめ
----

'cobbler-web' の設定は今回は説明しませんでした、慣れている人なら CLI のほうがい
いと思うので 'cobbler' パッケージだけでも十分だと思います。

Cobbler は CentOS, RHEL を中心に考えられたツールなので Debian 系への対応がイマ
イチでした。あと、import する時にコケることがあります。コケる理由がエラーメッ
セージとして表示されないものもあるので、ちょっと苦労します。

ただ管理する・新しいターゲット・ディストリビューションの登録を容易にしてくれる
ツールとしてはとても有用です。今、この辺りの操作であれば Chef で出来ないかな？
と考えている最中です。と言うか既に Cookbooks を用意し始めています。Chef でシン
プルな PXE インストール環境を作った方が多くのディストリビューションに対応出来
そうですし、やる意味あるかな？と思っています。

