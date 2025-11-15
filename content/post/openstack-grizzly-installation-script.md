+++
title = "OpenStack Grizzly 構築スクリプト"
date = "2013-04-20"
slug = "2013/04/20/openstack-grizzly-installation-script"
Categories = ["infrastructure"]
description = "OpenStack Grizzly をオールインワン構成で構築する bash スクリプトの紹介と使い方"
+++
OpenStack Grizzly がリリースされて2週間ほど経過しました。皆さん動かしてみまし
たか？今回、毎度の構築 Bash スクリプトを開発したので公開します。

下記のサイトで公開しています。

<https://github.com/jedipunkz/openstack_grizzly_install>

このスクリプト、複数台構成とオールインワン構成の両方が構成出来るようなっていま
すが、今回は簡単なオールインワン構成の組み方をを簡単に説明したいと思います。

前提の環境
----

* Ubuntu 12.04 LTS が稼働している
* Cinder のためのディスクを OS 領域と別に用意 (/dev/sdb1 など)
* オールインワン構成の場合は 2 NICs 準備

Ubuntu 13.04 の daily build も完成度上がっている時期ですが OVS 側の対応が
OpenStack 構成に問題を生じさせるため 12.04 LTS + Ubuntu Cloud Archive の組み合
わせで構築するのが主流になっているようです。また、Cinder 用のディスクは OS 領
域を保持しているディスクとは別 (もしくはパーティションを切ってディスクデバイス
を別けても可) が必要です。オールインワン構成の場合は NIC を2つ用意する必要があ
ります。通常 OpenStack を複数台構成する場合は

* コントローラノード x 1 台
* ネットワークノード x 1 台
* コンピュートノード x n 台

で組み、VM はコンピュートノードからネットワークノードを介してインターネットに
接続します。よってそのため更に NIC が必要になるのですが、オールインワン構成の
場合は

* マネージメントネットワーク, API ネットワーク(内部通信用)
* パブリックネットワーク (VM のためのブリッジインターフェース)

の計2つを用意してください。

実行前の準備
----

#### OS のインストール

OS のインストール方法は割愛しますが 

* 'openssh-server' のみをインストール
* ディスクが1つしかない場合は cinder 用のパーティションを用意

の条件が満たされていれば OK です。

#### Cinder 用のディスクデバイスパーティショニング

Cinder 用に信頼性のあるディスクを用意している場合は fdisk 等を用いてパーティショ
ニングしてください。近々 loopback デバイスでも構築できるようスクリプトの改修を
する予定です。ディスクが一つしかない場合は先程述べたとおり、OS インストール時
にパーティショニングしたディスクデバイスを使います。

    % sudo fdisk /dev/sdb

ネットワークインターフェースの設定
----

下記のように2つのネットワークインターフェースを設定してください。

    % sudo ${EDITOR} /etc/network/interfaces
    auto lo
    iface lo inet loopback
    
    # this NIC will be used for VM traffic to the internet
    auto eth0
    iface eth0 inet static
        up ifconfig $IFACE 0.0.0.0 up
        up ip link set $IFACE promisc on
        down ip link set $IFACE promisc off
        down ifconfig $IFACE down
        address 10.200.9.10
        netmask 255.255.255.0
        dns-nameservers <DNS_RESOLVER1> <DNS_RESOLVER>
        dns-search example.com
    
    # this NIC must be on management network
    auto eth1
    iface eth1 inet static
        address 10.200.10.10
        netmask 255.255.255.0
        gateway 10.200.10.1
        dns-nameservers <DNS_RESOLVER1> <DNS_RESOLVER>

eth0 が VM のためのブリッジインターフェースになります。eth1 はマネージメントネッ
トワーク用・内部 API 通信用の兼務です。

スクリプトの取得とパラメータ設定
----

スクリプトの取得を行います。

    % git clone git://github.com/jedipunkz/openstack_grizlly_install.git
    % cd openstack_grizzly_install

パラメータを設定するため setup.conf 内の各パラメータを設定変更します。数多くの
パラメータがありますが、最低限のパラメータということで...

    HOST_IP='10.200.10.10'
    HOST_PUB_IP='10.200.9.10'
    PUBLIC_NIC='eth0'

を設定してください。HOST_IP は eth1 の IP アドレス、HOST_PUB_IP は eth0 の IP
アドレス、PUBLIC_NIC は eth0 (HOST_PUB_IP のインターフェース名) を指定します。

スクリプトの実行
----

いよいよスクリプトを実行します。

    % sudo ./setup.sh allinone

しばらくすると構築が完了します。あとは

    http://${HOST_IP}/horizon/

にブラウザでアクセスすると WEB I/F である Horizon のログイン画面が表示されます。
パラメータをいじっていなければユーザ : demo, パスワード : demo でアクセス出来
ます。

各 API にコマンドでアクセスする
----

API にアクセスするためにコマンドを用いることも出来ます。スクリプトを実行した結
果、下記のファイルが生成されているはずです。

    ~/openstackrc-demo # 'demo' ユーザで API にアクセス
    ~/openstackrc      # 'admin' ユーザで API にアクセス

'demo' ユーザでアクセスするためには

    % source ~/openstackrc-demo

を実行してください。環境変数が設定され API にアクセス出来るようになります。例
として下記のコマンドを実行してみてください。

    % glnace image-list
    +--------------------------------------+---------------------+-------------+------------------+------------+--------+
    | ID                                   | Name                | Disk Format | Container Format | Size       | Status |
    +--------------------------------------+---------------------+-------------+------------------+------------+--------+
    | 1a7943a5-8f8f-4c02-9763-5a6d519c31bb | Cirros 0.3.0 x86_64 | qcow2       | bare             | 9761280    | active |
    +--------------------------------------+---------------------+-------------+------------------+------------+--------+

OS イメージ一覧が取得出来ます。スクリプトで予め Glance に登録した Cirros とい
う小さな OS イメージが確認出来るはずです。

まとめ
----

本格的な構成を組むのであれば上記の URL にも知る指定ある複数台構成を組んでみて
ください。同じくスクリプトで構築出来ます。また今回から Quantum に実装された
LBaaS も組めるようになっています。構築出来た OpenStack で LB を組んでみてくだ
さい。LBaaS の説明については OpenStack ユーザ会の中島さんのブログが参考になり
ます。

<http://aikotobaha.blogspot.jp/2013/04/use-full-function-of-openstack-grizzly.html>

LBaaS で組める負荷分散方式が 'ROUND_ROBIN' 以外にも選択出来るぽいのでもう少し
調べたら、僕のブログでも紹介しようかと思います。また Grizzly になって数多くの
機能が新たに実装されているので引き続き紹介していこうかと思います。

OpenStack は多くの機能がありますし構成の仕方も様々。予め理解しなければいけない
技術も多岐にわたるのでブログだけではなかなか説明し切れないところです。
OpenStack のコミュニティが書いた 'OpenStack Operations Guide' なるドキュメント
が最近リリースされました。

<http://docs.openstack.org/ops/>

日本のユーザ会でもこのドキュメントを翻訳しようという活動がされている最中です。
興味があるかたは一度読むことをオススメしますし、もし更に興味が有る方は翻訳活動
に協力するのはいかがでしょうか。ユーザ会の ML で現在話が進んでいます。

引き続き、OpenStack ネタはアップしていきますー。
