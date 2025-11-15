+++
title = "NetBSD on OpenStack"
date = "2013-03-28"
slug = "2013/03/28/netbsd-on-openstack"
Categories = ["infrastructure"]
description = "OpenStack Folsom の KVM ハイパーバイザ上で NetBSD を動作させる方法と注意点"
+++
もう数日で OpenStack の次期バージョン版 Grizzly がリリースされるタイミングだが
現行バージョン Folsom の OpenStack の上に NetBSD を載せてみた。完全にお遊び
だけど...。

結局、ほとんど何も特別な対応取ることなく NetBSD が動いた。もちろんハイパーバイ
ザは KVM です。だけど少し条件がある。

qemu の不具合があり Ubuntu 12.04 LTS + Ubuntu Cloud Archives の組み合わせでは
NetBSD が動作しなかった。下記のようなカーネルパニックが発生。

    panic: pci_make_tag: bad request

この不具合に相当するんじゃないかと思ってる。

<https://bugs.launchpad.net/qemu/+bug/897771>

よって下記の組み合わせで動作を確認した。

* Ubuntu 12.10 + OpenStack (Native Packages)
* qemu, kvm : 1.2.0+noroms-0ubuntu2.12.10.3
* NetBSD 6.1 RC2 amd64

前提条件
----

OpenStack Folsom が動作していること。

NetBSD OS イメージ作成
----

nova-compute が動作しているホストの qemu-kvm を利用する。OpenStack 上に何でも
良いので OS を動作させこの kvm プロセスのパラメータを参考に kvm コマンドを実行
し NetBSD をインストールさせた。一番確実な方法。

    % cd ~/
    % wget http://ftp.netbsd.org/pub/NetBSD/iso/6.1_RC2/NetBSD-6.1_RC2-amd64.iso
    % kvm-img create -f qcow2 netbsd.img 5G
    % /usr/bin/kvm -M pc-1.0 -cpu \
    core2duo,+lahf_lm,+rdtscp,+hypervisor,+avx,+osxsave,+save,+aes,+popcnt,+sse4.2,+sse4.1,+cx16,+vmx,+pclmuldq,+ht,+ss,+ds \
    -enable-kvm -m 512 -smp 1,sockets=1,cores=1,threads=1 -device piix3-usb-uhci,id=usb,bus=pci.0,addr=0x1.0x2 \
    -drive file=~/netbsd.img,if=none,id=drive-virtio-disk0,format=qcow2,cache=none \
    -device virtio-blk-pci,scsi=off,bus=pci.0,addr=0x4,drive=drive-virtio-disk0,id=virtio-disk0,bootindex=1 \
    -net nic,model=virtio -vnc :9 -cdrom ~/NetBSD-6.1_RC2-amd64.iso

VNC :9 に接続して NetBSD を普通ににインストールする。

インストールが終わったら CDROM デバイスを外して起動。

    % core2duo,+lahf_lm,+rdtscp,+hypervisor,+avx,+osxsave,+save,+aes,+popcnt,+sse4.2,+sse4.1,+cx16,+vmx,+pclmuldq,+ht,+ss,+ds \
    -enable-kvm -m 512 -smp 1,sockets=1,cores=1,threads=1 -device piix3-usb-uhci,id=usb,bus=pci.0,addr=0x1.0x2 \
    -drive file=~/netbsd.img,if=none,id=drive-virtio-disk0,format=qcow2,cache=none \
    -device virtio-blk-pci,scsi=off,bus=pci.0,addr=0x4,drive=drive-virtio-disk0,id=virtio-disk0,bootindex=1 \
    -net nic,model=virtio -vnc :9

VNC :9 に接続し下記の操作を行う。

vioif0 という virtio なネットワークインターフェースが起動するので下記のように
追記する。

    # vi /etc/rc.conf # 下記を追記
    ifconfig_vioif0=dhcp
    sshd=YES

OpenStack の metadata server から nova の管理するキーペア鍵を取得し
authorized_keys に配置する様、/etc/rc.local に追記する。curl とか便利なツール
はもちろん！入っていないので ftp コマンドでなんとかする。

``` bash
# vi /etc/rc.local # 下記を追記
if [ ! -d /root/.ssh ]; then
    mkdir -p /root/.ssh
fi
echo >> /root/.ssh/authorized_keys
cd /tmp
ftp http://169.254.169.254/latest/meta-data/public-keys/0/openssh-key
cat openssh-key | grep 'ssh-rsa' >> /root/.ssh/authorized_keys
echo "AUTHORIZED_KEYS:"
echo "*********************"
cat /root/.ssh/authorized_keys
echo "*********************"
```

nova のキーペアでログインしたいので sshd は root ユーザでログイン出来るように
修正行う。

    # vi /etc/ssh/sshd_config
    PermitRootLogin yes

OS をシャットダウンしてイメージ作成は終わり。

Glance へ登録
----

netbsd.img を Glance に接続できるホストへ移動しイメージ登録を行う。

    % glance add name="NetBSD 6.1 RC2 amd64" is_public=true \
      container_format=ovf disk_format=qcow2 < ~/netbsd.img

まとめ
----

何も手を加えていない...。NetBSD 6.1 は最初から Virtio が有効になっているので何
も考えることなくイメージ作成が出来た。コツは nova-compute が実際に動作している
ホストでイメージを作ること。ハイパーバイザの OS が若干古いホストでも作業してみ
たのだが、OpenStack に載せた途端カーネルパニックに陥った。Qemu はものすごいス
ピードで進化しているのでバージョンの差異は致命的であると共に、日に日に快適な環
境が整ってきているとも言える。
