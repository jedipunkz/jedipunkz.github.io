+++
title = "OpenStack + Ceph 連携"
date = "2013-05-19"
slug = "2013/05/19/openstack-ceph"
Categories = ["infrastructure"]
description = "OpenStack の Cinder と Glance を Ceph 分散ストレージに連携させる構成と手順"
+++
こんにちは。最近 OpenStack の導入に向けて保守性や可用性について調査している
<a href="https://twitter.com/jedipunkz">@jedipunkz</a> です。

OpenStack は MySQL のダンプや OS イメージ・スナップショットのバックアップをとっ
ておけばコントローラの復旧も出来ますし、Grizzly 版の Quantum では冗長や分散が
取れるので障害時に耐えられます。また Quantum の復旧は手動もで可能です。最後の
悩みだった Cinder の接続先ストレージですが、OpenStack のスタンスとしては高価な
ストレージの機能を使ってバックアップ取るか、Ceph, SheepDog のようなオープンソー
スを使うか、でした。で、今回は Ceph を OpenStack に連携させようと思いました。

この作業により Cinder の接続先ストレージが Ceph になるのと Glance の OS イメー
ジ・スナップショットの保管先が Ceph になります。


下記の参考資料が完成度高く、ほぼ内容はそのままです。若干付け足していますが。

参考資料
----

<http://ceph.com/docs/master/rbd/rbd-openstack/>

前提の構成
----

    +-------------+-------------+--------------------------------------------- Public/API Network
    |             |             |             
    +-----------+ +-----------+ +-----------+ +-----------+ +-----------+ +-----------+
    |           | |           | |vm|vm|..   | |           | |           | |           |
    | controller| |  network  | +-----------+ |  ceph01   | |  ceph01   | |  ceph01   |
    |           | |           | |  compute  | |           | |           | |           |
    |           | |           | |           | |           | |           | |           |
    +-----------+ +-----------+ +-----------+ +-----------+ +-----------+ +-----------+
    |             |     |       |     |       |             |             |
    +-------------+-----)-------+-----)-------+-------------+-------------+-- Management/API Network
                        |             |                       
                        +-------------+-----------------------------------+-- Data Network

* Ceph は OpenStack の Management Network 上に配置
* Ceph は3台構成 (何台でも可)
* OpenStack も3台構成 (何台でも可)
* 連携処理するのは controller, compute ノード

では早速手順ですが、OpenStack と Ceph の構築手順は割愛します。私の他の記事を参
考にしていただければと思います。

* <a href="http://jedipunkz.github.io/blog/2013/04/20/openstack-grizzly-installation-script/">構築スクリプト</a>
* <a href="http://jedipunkz.github.io/blog/2013/05/11/ceph-deploy/">ceph-deploy で Ceph 構築</a>

Ceph + OpenStack 連携手順
----

#### OpenStack 用に Ceph Pool を作成する

    ceph01% sudo ceph pool create volumes 128
    ceph01% sudo ceph pool create images 128

#### sudoers の設定

controller, compute ノードにて sudoers の設定

    jedipunkz ALL = (root) NOPASSWD:ALL

#### ceph パッケージのインストール

controller, compute ノードに ceph をインストールする。

    controller% wget -q -O- 'https://ceph.com/git/?p=ceph.git;a=blob_plain;f=keys/release.asc' | sudo apt-key add -
    controller% echo deb http://ceph.com/debian/ $(lsb_release -sc) main | sudo tee /etc/apt/sources.list.d/ceph.list
    controller% sudo apt-get update && sudo apt-get install -y python-ceph ceph-common

#### /etc/ceph 作成

    controller% sudo mkdir /etc/ceph
    compute   % sudo mkdir /etc/ceph

#### ceph コンフィギュレーションのコピー

controller, compute ノードに ceph コンフィギュレーションをコピーする。尚、接続
先の OpenStack ノードでの sudoers 設定は予め済ませること。

    ceph01% sudo -i
    ceph01# ssh <controller> sudo tee /etc/ceph/ceph.conf </etc/ceph/ceph.conf
    ceph01# ssh <compute> sudo tee /etc/ceph/ceph.conf </etc/ceph/ceph.conf


#### 認証設定

nova, cinder, glance 用にユーザを作成する。

    ceph01% sudo ceph auth get-or-create client.volumes mon 'allow r' osd 'allow class-read object_prefix rbd_children, allow rwx pool=volumes, allow rx pool=images'
    ceph01% sudo ceph auth get-or-create client.images mon 'allow r' osd 'allow class-read object_prefix rbd_children, allow rwx pool=images'

#### キーリングの作成

Ceph キーリングの作成を行う。Glance, Cinder が起動しているホスト controller ノードに
キーリングを配置する。

    ceph01% sudo ceph auth get-or-create client.images | ssh {your-glance-api-server} sudo tee /etc/ceph/ceph.client.images.keyring
    ceph01% ssh {your-glance-api-server} sudo chown glance:glance /etc/ceph/ceph.client.images.keyring
    ceph01% sudo ceph auth get-or-create client.volumes | ssh {your-volume-server} sudo tee /etc/ceph/ceph.client.volumes.keyring
    ceph01% ssh {your-volume-server} sudo chown cinder:cinder /etc/ceph/ceph.client.volumes.keyring

compute ノードにて libvirt に secret key を格納する。ここで登場する uuid は後
に利用するためメモをとっておくこと。

    ceph01 % sudo ceph auth get-key client.volumes | ssh 10.200.10.59 tee client.volumes.key

    compute% cat > secret.xml <<EOF
    <secret ephemeral='no' private='no'>
      <usage type='ceph'>
        <name>client.volumes secret</name>
      </usage>
    </secret>
    EOF
    comupte% sudo virsh secret-define --file secret.xml
    <uuid of secret is output here>
    compute% sudo virsh secret-set-value --secret {uuid of secret} --base64 $(cat client.volumes.key) && rm client.volumes.key secret.xml

#### OpenStack 連携のための設定

controller:/etc/glance/glance-api.conf に下記を追記。

    default_store=rbd
    rbd_store_user=images
    rbd_store_pool=images
    show_image_direct_url=True

controller:/etc/cinder/cinder.conf に下記を追記。先ほど登場した uuid を入力す
る。

    volume_driver=cinder.volume.driver.RBDDriver
    rbd_pool=volumes
    rbd_user=volumes
    rbd_secret_uuid={uuid of secret}

controller:/etc/init/cinder-volume.conf の冒頭に下記の記述を追記する。

    env CEPH_ARGS="--id volumes"

OpenStack の各サービスを再起動もしくはホストの再起動を行う。

    sudo service glance-api restart
    sudo service nova-compute restart
    sudo service cinder-volume restart

#### 確認

実際にインスタンスを作成して Volume をアタッチしディスクを消費していくと Ceph
のディスク使用量が増えていきます。

    % cinder create --display-name test 5
    % nova volumeattach <instance_id> <volume_id> auto

まとめ
----

Cinder は分散ストレージですので各ファイルのレプリカが全て失われない限りデータ
はロストしません。ただし Ceph 自体の完成度は以前に比べ高くはなったものの、運用
に耐えられるかどうかまだ私にも分かりません。先日の OpenStack Day に来日してい
たファウンデーションの方が「ベンダロックインするな」と言っていました。僕もオー
プンソースでなんとかしたいと思っています。OpenStack を導入するためには今、Ceph
は欠かすことが出来ないコンポーネントな気がしています。皆で Ceph も盛り上げて行
きたいです。

また、この構成の際のOpenStack 全体の保全について考えると...

* MySQL のデータさえダンプの取得すれば OK
* OS イメージ・スナップショットは Ceph 上にあるのでバックアップ不要
* Ceph はなんとしても守る。バックアップ取るのは難しい
* Network ノードは分散・冗長可能, データのバックアップは不要
* Compute ノード上のインスタンスデータは Ceph のスナップショットから復旧

といったことが考えられます。つまり MySQL のデータさえダンプしておけば
OpenStack 全体が復旧できることになります。実際にやってみましたが可能でした。
