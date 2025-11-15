+++
title = "Chef で OpenStack デプロイ"
date = "2013-07-08"
slug = "2013/07/08/chef-openstack-deploy"
Categories = ["infrastructure"]
description = "RackSpace の Chef Cookbooks を使った OpenStack Grizzly のオールインワン構成デプロイ"
+++
こんにちは。<a href="https://twitter.com/jedipunkz">@jedipunkz</a> です。

前回の記事で OpenCenter を使った OpenStack デプロイを行いましたが、デプロイの
仕組みの実体は Opscode Chef です。慣れている人であれば Chef を単独で使った方が
よさそうです。僕もこの方法を今後取ろうと思っています。

幾つかの構成を試している最中ですが、今回 nova-network を使ったオールインワン構
成を作ってみたいと思います。NIC の数は1つです。ノート PC や VPS サービス上にも
構築できると思いますので試してみてください。

今回は Chef サーバの構築や Knife の環境構築に関しては割愛します。

また全ての操作は workstation ノードで行います。皆さんお手持ちの Macbook 等です。
デプロイする先は OpenStack をデプロイするサーバです。

手順
----

#### Chef Cookbook を取得

RackSpace 社のエンジニアがメンテナンスしている Chef Cookbook を使います。各
Cookbook が git submodule 化されているので --recursive オプションを付けます。

``` bash
% git clone https://github.com/rcbops/chef-cookbooks.git ~/openstack-chef-repo
% cd openstack-chef-repo
```

#### 'v4.0.0' ブランチをチェックアウト

master ブランチは今現在 (2013/07/08) folsom ベースの構成になっているので
'grizzly' のためのブランチ 'v4.0.0' をローカルにチェックアウトします。

``` bash
% git checkout v4.0.0
```

submodule である Cookbooks を初期化 -> 更新を行います。

``` bash
% git submodule init
% git submodule sync
% git submodule update
```

#### Environment の作成

Chef の中に Environment という情報があります。これは環境に合わせ各 Cookbooks
内の Attributes 等を上書きすることが可能です。この Environment を作成すること
でそれぞれ独立している Cookbooks を用いて一つの環境を作ることが可能になっています。
Environement は clone してきた環境の environments ディレクトリ配下に格納します。
下記の情報をコピペして environments/AllinOne.json として保存してください。

``` json
{
  "name": "AllinOne",
  "description": "",
  "cookbook_versions": {
  },
  "json_class": "Chef::Environment",
  "chef_type": "environment",
  "default_attributes": {
  },
  "override_attributes": {
    "package_component": "grizzly",
    "osops_networks": {
      "management": "10.0.0.0/24",
      "public": "10.0.0.0/24",
      "nova": "10.0.0.0/24"
    },
    "nova": {
      "networks": [
        {
          "bridge": "br100",
          "num_networks": "1",
          "dns2": "8.8.4.4",
          "dns1": "8.8.8.8",
          "ipv4_cidr": "172.16.0.0/24",
          "network_size": "256",
          "label": "private"
        }
      ],
      "config": {
        "use_single_default_gateway": false,
        "ram_allocation_ratio": "1",
        "cpu_allocation_ratio": "16"
      },
      "network": {
        "dmz_cidr": "172.18.0.0/24",
        "public_interface": "eth0",
        "multi_host": true,
        "fixed_range": "172.16.0.0/24"
      },
      "apply_patches": true,
      "libvirt": {
        "vncserver_listen": "0.0.0.0",
        "virt_type": "qemu"
      }
    },
    "keystone": {
      "admin_user": "admin",
      "tenants": [
        "admin",
        "service"
      ],
      "users": {
        "admin": {
          "password": "secrete",
          "roles": {
            "admin": [
              "admin"
            ]
          }
        },
        "demo": {
          "password": "demo",
          "default_tenant" : "service",
          "roles": {
            "service": [ "service" ]
          }
        }
      }
    },
    "horizon": {
      "theme": "Rackspace"
    },
    "mysql": {
      "root_network_acl": "%",
      "allow_remote_root": true
    },
    "monitoring": {
      "procmon_provider": "monit",
      "metric_provider": "collectd"
    },
    "glance": {
      "images": [
        "precise",
        "cirros"
      ],
      "image": {
      },
      "image_upload": true
    },
    "developer_mode": false
  }
}
```

環境に合わせ修正する必要があるのは...

```
"osops_networks": {
  "management": "10.0.0.0/24",
  "public": "10.0.0.0/24",
  "nova": "10.0.0.0/24"
},
```

だけです。私の環境は 10.0.0.0/24 にあるので上記のように記しましたが、これはみ
なさんのネットワーク環境に合わせ修正してください。

Roles の修正
----

デフォルトの 'allinone' Role では Cinder が使えない状態です。これは別ストレー
ジを扱うことを前提にしているためと思われます。今回はオールインワンでコミコミの
構成を組みたいので roles/allinone.json を下記のように追記します。

``` ruby
run_list(
  "role[single-controller]",
  "role[single-compute]",
  "role[cinder-volume]" # <- 追加
)
```

Cookbooks, Roles, Environments を Chef サーバへアップロード
----

チェックアウトした Cookbooks, Roles, あと今作成した Environements を Chef サー
バへアップロードします。

``` bash
% knife cookbook upload -o cookbooks -a
% knife role from file roles/*.rb
% knife environment from file environments/AllinOne.json
```

OpenStack をデプロイ
----

いよいよ、次のコマンドでデプロイを行います。

``` bash
% knife bootstrap <ip_address> -N <hostname> -r 'role[allinone]' -E AllinOne --sudo -x <username>
```

数分経つと OpenStack デプロイが完了します。ブラウザで https://<ip_address> へ
アクセスして確認してみてください。ログインアカウントを上記の environments 内に
記してあります。(user : demo, pass : demo, もしくは user : admin, pass : secrete)

Cinder の利用
----

この状態で VM を作成してアクセスすることは出来るのですが、Block Storage as a
Service (Cinder) は利用できない状態です。下記の操作で使えるようになります。

``` bash
% sudo dd if=/dev/zero of=/var/lib/cinder/volumes-disk bs=2 count=0 seek=7G
% sudo modprobe loop
% sudo losetup /dev/loop3 /var/lib/cinder/volumes-disk
% sudo pvcreate /dev/loop3
% sudo vgcreate cinder-volumes /dev/loop3
% sudo service cinder-volume restart
```

まとめと考察
----

操作して気がついたと思いますが、Roles が数多く存在します。これは色んな構成が組
めることを明示していると言えます。また、Environments を OpenStack 上の一つの構
成に見立てる (例 : controller + compute x n ) あたりが、とても Chef との親和性
が高いと言えます。今まで構築のために bash スクリプトを書いてきましたが、もうそ
の必要が無くなりました。また Git のブランチに 'folsom' 等がある通り、ブランチ
をチェックアウトし直すことで folsom ベースの構成も組むことが出来ます。私は今、
コントローラノードの HA 化をこの Cookbooks でデプロイしてみています。とても完
成度が高いなぁと感じるのは environments である json ファイルに vips という項目
を追記するだけで HA 構成が組める点です。これにより MySQL, Rabbitmq, API が VIP
を持ち、コントローラノードの片系に障害が発生しても OpenStack 全体の構成 (今回
で言う一つの Envorinments ですね) がサービス継続できる！ということです。次回、
機会がありましたら、その構成のデプロイ方法についても紹介したいと思います。

また、今回は VPS サービス上等に構築出来るように

```
"virt_type": "qemu"
```

と environments に記しましたが、KVM リソースが扱える環境であればここを 'kvm'
とすることでパフォーマンスは若干上がると思います。

