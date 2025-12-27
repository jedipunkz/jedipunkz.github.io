+++
title = "Ceph-Deploy で Ceph 分散ストレージ構築"
date = "2013-05-11"
Categories = ["infrastructure"]
description = "ceph-deploy ツールを使った Ceph 分散ストレージの簡単構築手順とマウント方法"
aliases = [
  "/blog/2013/05/11/ceph-deploy",
  "/post/2013/05/11/ceph-deploy"
]
+++
今回は ceph-deploy というツールを使って Ceph ストレージを簡単に構築することが
出来るので紹介します。Ceph は分散ストレージでオブジェクトストレージとしてもブ
ロックストレージとしても動作します。今回の構築ではブロックストレージとしてのみ
の動作です。

Ceph が公開しているのが ceph-deploy なわけですが、マニュアル操作に代わる構築方
法として公開しているようです。その他にも Chef Cookbook も公開されているようで
す。

それでは早速。

今回の構成
----

    +--------+ +--------+ +--------+
    | ceph01 | | ceph02 | | ceph03 |
    |  osd   | |  osd   | |  osd   |
    |  mon   | |  mon   | |  mon   |
    |  mds   | |  mds   | |  mds   |
    +--------+ +--------+ +--------+
    | 10.0.0.1 | 10.0.0.2 | 10.0.0.3
    |          |          |          
    +----------+----------+
    |
    | 10.0.0.10
    +-------------+
    | workstation |
    +-------------+

特徴は

* すべてのホストで osd, mon, mds を動作
* ceph データ格納用ディスクデバイスを /dev/sdb として利用
* workstation は ceph-deploy を実行するホスト

です。osd は object store daemon で実際にファイルを格納していくデーモン。mon
はモニタリング用デーモン, mds は metadata server で POSIX 互換のファイルシステ
ムをクライアントに提供するためのデーモンです。

ceph-deploy を使うまでの準備
----

ceph-deploy を使うまでのターゲットのホスト ceph01-03 と workstation と共に準備
が必要です。

#### ceph01-03 の準備

'ceph' ユーザの作成を行う。

    % ssh user@ceph-server
    % sudo useradd -d /home/ceph -m ceph
    % sudo passwd ceph

sudoers の設定を行う。

    % echo "ceph ALL = (root) NOPASSWD:ALL" | sudo tee /etc/sudoers.d/ceph
    % sudo chmod 0440 /etc/sudoers.d/ceph

#### workstation の準備

ノンパスフレーズの SSH 公開鍵・秘密鍵を生成する。

    workstation% ssh-keygen
    Generating public/private key pair.
    Enter file in which to save the key (/ceph-client/.ssh/id_rsa):
    Enter passphrase (empty for no passphrase):
    Enter same passphrase again:
    Your identification has been saved in /ceph-client/.ssh/id_rsa.
    Your public key has been saved in /ceph-client/.ssh/id_rsa.pub.

公開鍵をターゲットホスト (ceph01-03) に配置

    workstation% ssh-copy-id ceph@ceph01
    workstation% ssh-copy-id ceph@ceph02
    workstation% ssh-copy-id ceph@ceph03

ceph-deploy の取得を行う。

    workstation% git clone https://github.com/ceph/ceph-deploy.git ~/ceph-deploy

'python-virtualenv' パッケージをインストールする。

    workstation% sudo apt-get update ; sudo apt-get -y install python-virtualenv

ceph-deploy をブートストラップする

    workstation% cd ~/ceph-deploy
    workstation% ./bootstrap

PATH を通す。自分の shell に合わせて登録してください。

    workstation% ${EDITOR} ~/.zshrc
    export PATH=$HOME/ceph-deploy:$PATH

ホスト名の解決を行う。

    workstation% sudo ${EDITOR} /etc/hosts
    10.0.0.1    ceph01
    10.0.0.2    ceph02
    10.0.0.3    ceph03

これで準備は終わり。

3台構成構築
----

3台 (ceph01-03) を新規に構築する方法を書きます。すべて workstaiton 上からの操
作です。

ceph サーバ・クライアント間通信のための鍵の生成とコンフィギュレーションの生成
を下記の操作で行う。

    workstation% ceph-deploy new ceph01 ceph02 ceph03

下記の操作で ceph パッケージのインストールを各 Ceph サーバにて行う。--testing
等と引数を渡せば RC 版の利用が行える。何も渡さなければ stable 版。

    workstation% ceph-deploy install ceph01 ceph02 ceph03

MON daemon のデプロイを行う。

    workstation% ceph-deploy mon create ceph01 ceph02 ceph03

鍵のデプロイを行う。Ceph サーバ間・クライアント間での共有鍵である。1 Cluster
に対して1つの鍵を保有する。

    workstation% ceph-deploy gatherkeys create ceph01 ceph02 ceph03

OSD daemon のデプロイを行う。下記の様にパーティションを指定しなければツールが
自動でパーティショニングを行なってくれる。

    workstation% ceph-deploy osd create create ceph01:/dev/sdb ceph02:/dev/sdb ceph03:/dev/sdb

MDS deamon のデプロイを行う。

    cephcleint% ceph-deploy mds create ceph01 ceph02 ceph03

これで終わりです。これらの操作が終わるとすべてのホスト ceph01-03 で mon, osd,
mds の各デーモンが起動していることが分かると思います。超カンタン！

マウントしてみよう！
----

さぁ～、クライアントからマウントしてみましょう。ここでは workstaion ホストを利
用します。Linux 系のマシンで同じネットワークセグメントに属していれば大抵マウン
ト出来ると思います。mds が稼働しているホストに対してであればどこにでもマウント
出来ます。

#### Block Device としてマウントする方法

ストレージ上に block device を生成しそれをマウントする。

    workstation% rbd create foo --size 4096
    workstation% sudo modprobe rbd
    workstation% sudo rbd map foo --pool rbd --name client.admin
    workstation% sudo mkfs.ext4 -m0 /dev/rbd/rbd/foo
    workstation% sudo mkdir /mnt/myrbd
    workstation% sudo mount /dev/rbd/rbd/foo /mnt/myrbd

#### Kernel Driver を用いてマウントする方法

kernel Driver を用いてストレージをマウントする。

    workstation% sudo mkdir /mnt/mycephfs
    workstation% sudo mount -t ceph 10.0.0.1:6789:/ /mnt/mycephfs -o \
                name=admin,secret=`sudo ceph-authtool -p /etc/ceph/ceph.keyring`

#### Fuse Driver (ユーザランド) を用いてマウントする方法

ユーザランドソフトウェア FUSE を用いてマウントする。

    workstation% sudo mkdir /home/<username>/cephfs
    workstation% sudo ceph-fuse -m 10.0.0.1:6789 /home/<username>/cephfs

まとめ
----

もし導入するのであればマニュアルでの構築も一度体験した方が良いかもしれません。
ツールを使うと一体どんな作業がされているのか理解出来ないので。ただ今ではマニュ
アル操作で構築している途中に 'ceph-deploy を使ってください' と warning が出る
ので、開発元としてもこちらの構築方法を薦めたいのでしょう。あと Ceph はドキュメ
ントが非常に充実しています。ドキュメントの全てに大事なことが書いてあるので一度
読むことをオススメします。また Ceph が Chef Cookbook も公開しているようで、そ
ちらの方法もドキュメントにチラっと書いてありました。私はまだ試していませんが時
間があればやってみたいです。あとあと！ceph-deploy はまだ未完成な域を脱していま
せん。上記の通り新規構築系の操作はひと通り出来るのですが、ホストの削除系の実装
がまだされていませんでした。ホスト追加系の操作に関しても削除系程ではないのです
が完成度が上がっていません。手作業で少しカバーしてあげる必要があります。

OpenStack の Cinder の先のストレージについて最近考えていました。LVM 管理のロー
カルディスクでもいいのですが運用のことを考えるとバックアップを取らなくちゃい
けないのだけど logcal volume が存在しないのでスナップショットバックアップが出
来なそう。Cinder は比較的高価なストレージも扱えるのでそちらの機能でバックアッ
プ取るのもいいけど、ここはオープンソースでなんとかしたい！と思って Ceph を検討
してみました。

Ceph は分散ストレージでオブジェクトストレージとしてもブロックストレージとして
も動作が可能。OpenStack と組み合わせると Cinder の先のストレージとしても
Glance のイメージ置き場としても利用可能らしい。Cinder の接続先ストレージとして
の動作方法はまた別の機会にブログに書きます。

