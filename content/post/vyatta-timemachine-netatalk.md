+++
title = "Vyatta で Mac 用 TimeMachine サーバ兼ファイルサーバを構築！"
date = "2013-11-26"
Categories = ["infrastructure"]
+++
こんにちは。<a href="https://twitter.com/jedipunkz">@jedipunkz</a> です。

自宅ルータを Vyatta で運用しているのですが、諸電力な筐体に交換した際に HDD ス
ロットが余っていたので HDD を一本さしてみました。もったいないので Netatalk を
インストールして Mac 用の TimeMachine サーバにするか！そんでもってファイルサー
バ兼務にしよう！と思い立って作業したら簡単に出来たので共有します。

Vyatta はご存知の通り Debian Gnu/Linux がベースになっているのでパッケージレポ
ジトリを追加してちょちょいで設定出来ます。

手順
----

電源を通して Disk を追加します。その後起動。私は 3TB Disk が余っていたのでそれ
を挿しました。

debian wheezy のパッケージレポジトリを Vyatta に追記します。

``` bash
% configure
# set system package repository debian url http://ftp.jp.debian.org/debian
# set system package repository debian distribution wheezy
# set system package repository debian components "main contrib"
# commit
# save
# exit 
```

netatalk, avahi をインストールする。その際に libgcrypt11 のバージョン 1.5.0 が
必要になるのでインストールすること。

``` bash
% sudo apt-get update
% sudo apt-get install netatalk avahi-daemon avahi-utils libgcrypt11
```

ディスクのパーティショニング・フォーマットを行うために e2fsprogs, gdisk を入れ
る。2TB オーバーな disk が一般的になったので fdisk ではなく gdisk を使う。

``` bash
% sudo apt-get install e2fsprogs gdisk
```

パーティショニングを行う。私は1つの大きなパーティションを作りました。その後ファ
イルシステム ext4 にてフォーマットを行います。

``` bash
% sudo gdisk /dev/sdb # パーティショニング方法は割愛
% sudo mkfs.ext4 /dev/sdb1
```

/mnt ディレクトリにマウントします。/mnt/storage をファイルサーバ用,
/mnt/timemachine を Mac の TimeMachine 用として稼働させるためにディレクトリを
作成します。

``` bash
% sudo mount -t ext4 /dev/sdb1 /mnt
% sudo vi /etc/fstab # /mnt の記述追加
% sudo mkdir /mnt/storage ; sudo chown <userid>:users /mnt/storage
% sudo mkdir /mnt/timemachine ; sudo chown <userid>:users /mnt/timemachine
```

/etc/netatalk/apfd.conf を修正します。

``` diff
% diff /etc/netatalk/apfd.conf.org /etc/netatalk/afpd.conf
- # - -tcp -noddp -uamlist uams_dhx.so,uams_dhx2.so -nosavepassword
+ - -tcp -noddp -uamlist uams_guest.so,uams_dhx.so,uams_dhx2.so -nosavepassword
```

TimeMachine 用のディレクトリパスに下記のファイルを touch します。中身は空で OK
です。

``` bash
% touch /mnt/timemachine/.com.apple.timemachine.supported
```

/etc/netatalk/AppleVolumes.default ファイルにファイルサーバ, TimeMachine 用の
設定を投入します。TimeMachine 用は下記の通りオプションが必要になります。

``` bash
% sudo vi /etc/netatalk/AppleVolumes.default # 下記を追記
/mnt/storage "Storage"
/mnt/timemachine "TimeMachine" cnidscheme:dbd options:usedots,upriv,tm
```

netatalk を再起動します。

``` bash
% sudo /etc/init.d/netatalk restart
```

TimeMachine を設定する Mac 側の設定
----

今回の様に Apple 公式の TimeCupsule 以外のマシンを TimeMachine のバックアップ
先として利用する場合、Mac 側で下記の設定が必要になります。

``` bash
% defaults write com.apple.systempreferences TMShowUnsupportedNetworkVolumes 1
```

あとは '環境設定' -> 'TimeMachine' にて Vyatta を TimeMachine のバックアップ先
に指定すれば OK です。

まとめ
----

パッケージレポジトリは Wheezy の main, contrib を設定しましたが他のモノを入れ
ることも勿論可能。最近の Netatalk は TimeMachine 用の設定が簡単にできるように
なっていました。
