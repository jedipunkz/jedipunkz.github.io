+++
title = "OpenStack Havana Cinder,Glance の分散ストレージ Ceph 連携"
date = "2014-04-04"
slug = "2014/04/04/openstack-havana-cinder-glance-ceph"
Categories = ["infrastructure"]
+++
こんにちは！<a href="https://twitter.com/jedipunkz">@jedipunkz</a> です。

今回は Havana 版の OpenStack Glance, Cinder と分散ストレージの Ceph を連携させ
る手順を書いていきます。元ネタはこちら。下記の Ceph の公式サイトに手順です。

<https://ceph.com/docs/master/rbd/rbd-openstack/>

この手順から下記の変更を行って、ここでは記していきます。

* Nova + Ceph 連携させない
* cinder-backup は今のところ動作確認出来ていないので省く
* 諸々の手順がそのままでは実施出来ないので補足を入れていく。

cinder-backup は Cinder で作成した仮想ディスクのバックアップを Ceph ストレージ
上に取ることが出来るのですが、そもそも Ceph 上にある仮想ディスクを Ceph にバッ
クアップ取っても意味が薄いですし、まだ動いていないので今回は省きます。LVM やそ
の他ストレージを使った Cinder 連携をされている方にとっては cinder-backup の
Ceph 連携は意味が大きくなってくると思います。

構成
----

下記の通りの物理ネットワーク6つの構成です。
OpenStack, Ceph 共に最小構成を前提にします。


```
                  +--------------------------------------------------------------------- external
                  |
+--------------+--(-----------+--------------+------------------------------------------ public
|              |  |           |              |
+------------+ +------------+ +------------+ +------------+ +------------+ +------------+
| controller | |  network   | |  compute   | |   ceph01   | |   ceph02   | |   ceph03   |
+------------+ +------------+ +------------+ +------------+ +------------+ +------------+
|  |           |  |           |  |  |        |  |  |        |  |  |        |  |  |
+--------------+--(-----------+--(-----------+--(--(--------+--(--(--------+--(--(------- management
   |              |              |  |           |  |           |  |           |  |
   |              +--------------+--(-----------(--(-----------(--(-----------(--(------- guest
   |                                |           |  |           |  |           |  |
   +--------------------------------+-----------+--(-----------+--(-----------+--(------- storage
                                                   |              |              |
                                                   +--------------+--------------+------- cluster
```
特徴

* 最小構成 controller x 1 + network x 1 + compute x 1 + ceph x 3
* OpenStack API の相互通信は management ネットワーク
* OpenStack VM 間通信は guest ネットワーク
* OpenStack 外部通信は public ネットワーク
* OpenStack VM の floating-ip (グローバル) 通信は external ネットワーク
* Ceph と OpenStack 間の通信は storage ネットワーク
* Ceph の OSD 間通信は cluster ネットワーク
* ここには記されていないホスト 'workstation' から OpenStack, Ceph をデプロイ

前提の構成
----

前提構成の OpenStack と Ceph ですが、ここでは構築方法は割愛します。OpenStack
は rcbops/chef-cookbooks を。Ceph は ceph-deploy を使って自分は構築しました。
下記の自分のブログに構築手順が載っているので参考にしてみてください。

OpenStack 構築方法

<http://jedipunkz.github.io/blog/2013/11/17/openstack-havana-chef-deploy/>

Ceph 構築方法

<http://jedipunkz.github.io/blog/2014/02/27/journal-ssd-ceph-deploy/>

OpenStack + Ceph 連携手順
----

では実際に連携するための手順を記していきます。

#### rbd pool の作成

Ceph ノードの何れかで下記の手順を実施し rbd pool を作成する。

``` bash
ceph01% sudo ceph osd pool create volumes 128
ceph01% sudo ceph osd pool create images 128
ceph01% sudo ceph osd pool create backups 128
```

#### ssh 鍵の配置

Ceph ノードから OpenStack の controller, compute ノードへ接続出来るよう鍵を配
布します。

``` bash
ceph01% ssh-copy-id <username>@<controller_ip>
ceph01% ssh-copy-id <username>@<compute_ip>
```

#### sudoers の設定

controller, compute ノード上で sudoers の設定を予め実施する。
/etc/sudoers.d/<username> として保存する。

``` bash
<username> ALL = (root) NOPASSWD:ALL
```

#### ceph パッケージのインストール

controller ノード, compute ノード上で Ceph パッケージをインストールする。

``` bash
controller% wget -q -O- 'https://ceph.com/git/?p=ceph.git;a=blob_plain;f=keys/release.asc' | sudo apt-key add -
controller% echo deb http://ceph.com/debian/ $(lsb_release -sc) main | sudo tee /etc/apt/sources.list.d/ceph.list
controller% sudo apt-get update && sudo apt-get install -y python-ceph ceph-common

compute% wget -q -O- 'https://ceph.com/git/?p=ceph.git;a=blob_plain;f=keys/release.asc' | sudo apt-key add -
compute% echo deb http://ceph.com/debian/ $(lsb_release -sc) main | sudo tee /etc/apt/sources.list.d/ceph.list
compute% sudo apt-get update && sudo apt-get install -y python-ceph ceph-common
```

controller ノード, compute ノード上でディレクトリを作成する。

``` bash
controller% sudo mkdir /etc/ceph
compute   % sudo mkdir /etc/ceph
```

ceph.conf を controller, compute ノードへ配布する。

``` bash
ceph01% sudo -i
ceph01# ssh <controller_ip> sudo tee /etc/ceph/ceph.conf </etc/ceph/ceph.conf
ceph01# ssh <compute_ip> sudo tee /etc/ceph/ceph.conf </etc/ceph/ceph.conf
```

#### ceph 上にユーザを作成

Ceph 上に cinder, glance 用の新しいユーザを作成する。

``` bash
ceph auth get-or-create client.cinder mon 'allow r' osd 'allow class-read object_prefix rbd_children, allow rwx pool=volumes, allow rx pool=images'
ceph auth get-or-create client.glance mon 'allow r' osd 'allow class-read object_prefix rbd_children, allow rwx pool=images'
ceph auth get-or-create client.cinder-backup mon 'allow r' osd 'allow class-read object_prefix rbd_children, allow rwx pool=backups'
```

#### キーリングの作成と配置

client.cinder, client.glance, client.cinder-backup のキーリングを作成する。また作成したキーリングを
controller ノードに配布する。

``` bash
ceph01% sudo ceph auth get-or-create client.glance | ssh {your-glance-api-server} sudo tee /etc/ceph/ceph.client.glance.keyring
ceph01% ssh {your-glance-api-server} sudo chown glance:glance /etc/ceph/ceph.client.glance.keyring
ceph01% sudo ceph auth get-or-create client.cinder | ssh {your-volume-server} sudo tee /etc/ceph/ceph.client.cinder.keyring
ceph01% ssh {your-cinder-volume-server} sudo chown cinder:cinder /etc/ceph/ceph.client.cinder.keyring
ceph01% sudo ceph auth get-or-create client.cinder-backup | ssh {your-cinder-backup-server} sudo tee /etc/ceph/ceph.client.cinder-backup.keyring
ceph01% ssh {your-cinder-backup-server} sudo chown cinder:cinder /etc/ceph/ceph.client.cinder-backup.keyring
```

client.cinder のキーリングを compute ノードに配置する。

``` bash
ceph01% sudo ceph auth get-key client.cinder | ssh {your-compute-node} tee client.cinder.key
```

#### libvirt への secret キー追加

compute ノード上で secret キーを libvirt に追加する。

``` bash
compute% uuidgen
457eb676-33da-42ec-9a8c-9293d545c337

cat > secret.xml <<EOF
<secret ephemeral='no' private='no'>
  <uuid>457eb676-33da-42ec-9a8c-9293d545c337</uuid>
  <usage type='ceph'>
    <name>client.cinder secret</name>
  </usage>
</secret>
EOF
compute % sudo virsh secret-define --file secret.xml
Secret 457eb676-33da-42ec-9a8c-9293d545c337 created
compute% sudo virsh secret-set-value --secret 457eb676-33da-42ec-9a8c-9293d545c337 --base64 $(cat client.cinder.key) && rm client.cinder.key secret.xml
```

#### glance 連携手順

controller ノードの /etc/glance/glance-api.conf に下記を追記。
default_store=file と標準ではなっているので下記の通り rbd に書き換える。

```
default_store=rbd
rbd_store_user=glance
rbd_store_pool=images
```

#### cinder 連携手順

controller ノードの /etc/cinder/cinder.conf に下記を追記。
volume_driver は予め LVM の設定が入っていると思われるので書き換える。
また rbd_secret_uuid は先ほど生成した uuid を記す。

```
volume_driver=cinder.volume.drivers.rbd.RBDDriver
rbd_pool=volumes
rbd_ceph_conf=/etc/ceph/ceph.conf
rbd_flatten_volume_from_snapshot=false
rbd_max_clone_depth=5
glance_api_version=2
rbd_user=cinder
rbd_secret_uuid=457eb676-33da-42ec-9a8c-9293d545c337
```

#### ceph.conf への追記

上記で配布した ceph.conf にはキーリングのパスが記されていない。controller ノー
ド上の /etc/ceph/ceph.conf に下記の通り追記する。

ここは公式サイトには印されていないのでハマりました。ポイントです。

```
[client.keyring]
  keyring = /etc/ceph/ceph.client.cinder.keyring
```

#### OpenStack のそれぞれのコンポーネントを再起動かける

``` bash
controller% sudo glance-control api restart
compute   % sudo service nova-compute restart
controller% sudo service cinder-volume restart
controller% sudo service cinder-backup restart
```

動作確認
----

では動作確認を。Glance に OS イメージを登録。その後そのイメージを元にインスタ
ンスを作成。Cinder 上に仮想ディスクを作成。その後先ほど作成したインスタンスに
接続しマウント。そのマウントした仮想ディスク上で書き込みが行えるか確認をします。

テストで Ubuntu Precise 12.04 のイメージを glance を用いて登録する。

``` bash
controller% wget http://cloud-images.ubuntu.com/precise/current/precise-server-cloudimg-amd64-disk1.img
controller% glance image-create --name precise-image --is-public true --container-format bare --disk-format qcow2 < precise-server-cloudimg-amd64-disk1.img
```

テスト VM を稼働する。

``` bash
controller% nova boot --nic net-id=<net_id> --flavor 2 --image precise-image --key_name novakey01 vm01
controller% cinder create --display-name vol01 1
controller% nova volume-attach <instance_id> <volume_id> auto
```

テスト VM へログインしファイルシステムを作成後、マウントする。

``` bash
controller% ssh -i <key_file_path> -l ubuntu <instance_ip>
vm01% sudo mkfs -t ext4 /dev/vdb
vm01% sudo mount -t ext4 /dev/vdb /mnt
```

マウントした仮想ディスク上でデータを書き込んでみる。

``` bash
vm01% sudo dd if=/dev/zero of=/mnt/500M bs=1M count=5000
```

まとめ
----

Ceph, Cinder の Ceph 連携が出来ました！

OpenStack Grizzly 版時代に Ceph 連携は取っていたのですが Havana では

* cinder-bacup の Ceph 連携
* nova の Ceph 連携

が追加されていました。Nova 連携をとるとインスタンスを稼働させる際に通常は
controller ノードの /var/lib/nova 配下にファイルとしてインスタンスイメージが作
成されますが、これが Ceph 上に作成されるとのことです。Nova 連携は是非とってみ
たいのですが、今のところ動いていません。引き続き調査を行います。

cinder-backup も少し連携取ってみましたが backup_driver に Ceph ドライバの指定
をしているにも関わらず Swift に接続しにいってしまう有り様でした..。こちらも引
き続き調査します。またステートが 'in-use' の場合バックアップが取れず
'available' なステートでないといけないようです。確かに書き込み中に操作が行われ
てしまってもバックアップの整合性が取れないですし、ここは仕方ないところですね。
