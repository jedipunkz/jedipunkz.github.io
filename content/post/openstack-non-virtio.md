+++
title = "OpenStack Grizzy で非 Virtio OS 稼働"
date = "2013-04-21"
slug = "2013/04/21/openstack-non-virtio"
Categories = ["infrastructure"]
description = "OpenStack Grizzly で Virtio 非対応の OS イメージを稼働させる Glance の設定方法"
+++
こんにちは jedipunkz です。

Virtio に対応していない OS を OpenStack で稼働させることが今まで出来なかったの
ですが Grizzly から非 Virtio な OS イメージが扱えるようになった。今まで NetBSD
やら古い FreeBSD やら virtio ドライバを OS イメージに入れることに苦労していたの
だけど、これで問題無くなった。

最初、この機能のこと調べるのに「どうせ libvirt が生成する xml を書き換えるのだ
から nova 周りの設定なんだろうー」と思っていたら全く方法が見つからず...。結局
OS イメージを格納している Glance の設定にありました。

ここでは FreeBSD7.4 Release を例に挙げて説明していきます。

前提とする環境
----

* OpenStack Grizzly が稼働していること
* ホスト OS に Ubuntu 12.04.2 LTS が稼働していること
* ゲスト OS に FreeBSD 7.4 Release を用いる

とします。OS のバージョンはホスト・ゲスト共に、上記以外でも構いません。Grizzly
さえ動いていれば OK です。

OS イメージ作成
----

KVM で OS イメージを作成します。もちろん virtio なインターフェースは指定せず

* IDE ディスクインターフェース
* e1000 (intel) ネットワークインターフェース

を指定してあげてください。

    % kvm-img create -f qcow2 <IMAGE_NAME> 5G
    % sudo kvm -m 1024 --cdrom FreeBSD-7.4-RELEASE-amd64-disc1.iso --drive \
      file=./<IMAGE_NAME> -boot d -net nic,model=e1000 -net user -nographic \
      -vnc :9

VNC クライアントソフトを用いてホスト :9 番に接続し OS をインストールする。

Glance への登録
----

OpenStack API に接続する環境変数等を合わせ下記のコマンドを実行します。


    % glance image-create --name="FreeBSD7.4" --is-public \
      true --container-format bare --disk-format qcow2 < <IMAGE_NAME>
    % glance image-update --property hw_vif_model=e1000 "FreeBSD7.4"
    % glance image-update --property hw_disk_bus=ide "FreeBSD7.4"

--property オプションでディスク・ネットワークインターフェースの指定を変更して
います。

VM の稼働
----

あとは普段通り nova boot コマンドで VM を稼働させるだけです。

    % nova boot --nic net-id=<network_id> --image <image_id> --flavor <flavor_number> <vm_name>

