+++
title = "Chef-ZeroでOpenStack Kiloデプロイ(オールインワン編)"
date = "2015-07-16"
Categories = ["infrastructure"]
description = "Chef-Zero と openstack-chef-repo を使った OpenStack Kilo のオールインワン構成デプロイ手順"
aliases = [
  "/blog/2015/07/16/chef-zero-openstack-allinone",
  "/post/2015/07/16/chef-zero-openstack-allinone"
]
+++
こんにちは。@jedipunkz です。

久々に openstack-chef-repo を覗いてみたら 'openstack/openstack-chef-repo' とし
て公開されていました。今まで stackforge 側で管理されていましたが 'openstack'
の方に移動したようです。

https://github.com/openstack/openstack-chef-repo

結構安定してきているのかな？と想い、ちらっと試したのですが案の定、簡単に動作さ
せることが出来ました。

今回はこのレポジトリを使ってオールインワン構成の OpenStack Kilo を作る方法をま
とめていきます。

前提の構成
----

このレポジトリは Vagrant で OpenStack を作るための環境一式が最初から用意されて
いますが、Vagrant では本番環境を作ることは出来ないため、Ubuntu ホストを前提と
した記述に差し替えて説明していきます。前提にする構成は下記のとおりです。

* Uuntu Linux 14.04 x 1 台
* ネットワークインターフェース x 3 つ
* eth0 : External ネットワーク用
* eth1 : Internal (API, Manage) ネットワーク用
* eth2 : Guest ネットワーク用

特徴としては上記なのですが、eth2 に関してはオールインワンなので必ずしも必要と
いうわけではありません。複数台構成を考慮した設定になっています。

前提のIP アドレス
----

この記事では下記の IP アドレスを前提にします。お手持ちの環境の IP アドレスが違
い場合はそれに合わせて後に示す json ファイルを変更してください。

* 10.0.1.10 (eth0) : external ネットワーク
* 10.0.2.10 (eth1) : api/management ネットワーク
* 10.0.3.10 (eth2) : Guest ネットワーク

事前の準備
----

事前に対象ホスト (OpenStack ホスト) に chef, berkshelf をインストールします。

```bash
sudo -i
curl -L https://www.opscode.com/chef/install.sh | bash
```

Berkshelf をインストールするのに必要なソフトウェアをインストールします。

```bash
apt-get -y install build-essential zlib1g-dev libssl-dev libreadline-dev ruby-dev libxml2-dev libxslt-dev g++
```

Berkshelf をインストールします。

```bash
/opt/chef/embedded/bin/gem install berkshelf --no-ri --no-rdoc
```

デプロイ作業
----

それでは openstack-chef-repo を取得してデプロイの準備を行います。
ブランチの指定は行わず master ブランチを取得します。Kilo は master ブランチで
管理されています。次のバージョンの開発が始まるタイミングで 'stable/kilo' ブラ
ンチに管理が移されます。

```bash
sudo -i
cd ~/
git clone https://github.com/openstack/openstack-chef-repo.git
```

次に Berkshelf を使って必要な Cookbooks をダウンロードします。

```bash
cd ~/openstack-chef-repo
/opt/chef/embedded/bin/berks vendor ./cookbooks
```

Environment を作成します。これは各環境に合わせた設定ファイルのようなもので、各
Cookbooks の Attributes を上書きする仕組みになっています。下記の内容を

```
openstack-chef-repo/environments/aio-neutron-kilo.json
```

というファイル名で保存してください。

```json
{
  "name": "aio-neutron-kilo",
  "description": "test",
  "cookbook_versions": {
  },
  "json_class": "Chef::Environment",
  "chef_type": "environment",
  "default_attributes": {
  },
  "override_attributes": {
    "mysql": {
      "bind_address": "0.0.0.0",
      "server_root_password": "mysqlroot",
      "server_debian_password": "mysqlroot",
      "server_repl_password": "mysqlroot",
      "allow_remote_root": true,
      "root_network_acl": ["10.0.0.0/8"]
    },
    "rabbitmq": {
      "address": "0.0.0.0",
      "port": "5672",
      "loopback_users": []
    },
    "openstack": {
      "auth": {
        "validate_certs": false
      },
      "dashboard": {
        "session_backend": "file"
      },
      "block-storage": {
        "syslog": {
          "use": false
        },
        "api": {
          "ratelimit": "False"
        },
        "debug": true,
        "image_api_chef_role": "os-image",
        "identity_service_chef_role": "os-identity",
        "rabbit_server_chef_role": "os-ops-messaging"
      },
      "compute": {
        "rabbit": {
          "host": "10.0.2.10"
        },
        "novnc_proxy": {
          "bind_interface": "eth1"
        },
        "libvirt": {
          "virt_type": "qemu",
          "bind_interface": "eth1"
        },
        "novnc_proxy": {
          "bind_interface": "eth1"
        },
        "xvpvnc_proxy": {
          "bind_interface": "eth1"
        },
        "image_api_chef_role": "os-image",
        "identity_service_chef_role": "os-identity",
        "nova_setup_chef_role": "os-compute-api",
        "rabbit_server_chef_role": "os-ops-messaging",
        "network": {
          "public_interface": "eth1",
          "service_type": "neutron"
        }
      },
      "network": {
        "debug": "True",
        "dhcp": {
          "enable_isolated_metadata": "True"
        },
        "metadata": {
          "nova_metadata_ip": "10.0.2.10"
        },
        "openvswitch": {
          "tunnel_id_ranges": "1:1000",
          "enable_tunneling": "True",
          "tenant_network_type": "gre",
          "local_ip_interface": "eth2"
        },
        "api": {
          "bind_interface": "eth1"
        },
        "l3": {
          "external_network_bridge_interface": "eth0"
        },
        "service_plugins": ["neutron.services.l3_router.l3_router_plugin.L3RouterPlugin"]
      },
      "db": {
        "bind_interface": "eth1",
        "compute": {
          "host": "10.0.2.10"
        },
        "identity": {
          "host": "10.0.2.10"
        },
        "image": {
          "host": "10.0.2.10"
        },
        "network": {
          "host": "10.0.2.10"
        },
        "volume": {
          "host": "10.0.2.10"
        },
        "dashboard": {
          "host": "10.0.2.10"
        },
        "telemetry": {
          "host": "10.0.2.10"
        },
        "orchestration": {
          "host": "10.0.2.10"
        }
      },
      "developer_mode": true,
      "endpoints": {
        "compute-api-bind": {
          "host": "10.0.2.10",
          "scheme": "http",
          "port": "8774"
        },
        "compute-api": {
          "host": "10.0.2.10",
          "scheme": "http",
          "port": "8774"
        },
        "compute-ec2-admin-bind": {
          "host": "10.0.2.10",
          "scheme": "http",
          "port": "8773"
        },
        "compute-ec2-admin": {
          "host": "10.0.2.10",
          "scheme": "http",
          "port": "8773"
        },
       "compute-ec2-api-bind": {
          "host": "10.0.2.10",
          "scheme": "http",
          "port": "8773"
        },
        "compute-ec2-api": {
          "host": "10.0.2.10",
          "scheme": "http",
          "port": "8773"
        },
        "compute-xvpvnc": {
          "host": "10.0.2.10",
          "scheme": "http",
          "port": "6081"
        },
        "compute-novnc-bind": {
          "host": "10.0.2.10",
          "scheme": "http",
          "port": "6080"
        },
        "compute-novnc": {
          "host": "10.0.2.10",
          "scheme": "http",
          "port": "6080"
        },
        "compute-vnc": {
          "host": "0.0.0.0",
          "scheme": "http",
          "port": "6080"
        },
        "image-api": {
          "host": "10.0.2.10",
          "scheme": "http",
          "port": "9292"
        },
        "image-api-bind": {
          "host": "10.0.2.10",
          "scheme": "http",
          "port": "9292"
        },
        "image-registry": {
          "host": "10.0.2.10",
          "scheme": "http",
          "port": "9191"
        },
        "image-registry-bind": {
          "host": "10.0.2.10",
          "scheme": "http",
          "port": "9191"
        },
        "identity-api": {
          "host": "10.0.2.10",
          "scheme": "http",
          "port": "5000"
        },
        "identity-bind": {
          "host": "10.0.2.10",
          "scheme": "http",
          "port": "5000"
        },
        "identity-admin": {
          "host": "10.0.2.10",
          "scheme": "http",
          "port": "35357"
        },
        "identity-internal": {
          "host": "10.0.2.10",
          "scheme": "http",
          "port": "35357"
        },
        "volume-api-bind": {
          "host": "10.0.2.10",
          "scheme": "http",
          "port": "8776"
        },
        "volume-api": {
          "host": "10.0.2.10",
          "scheme": "http",
          "port": "8776"
        },
        "telemetry-api": {
          "host": "10.0.2.10",
          "scheme": "http",
          "port": "8777"
        },
        "network-api-bind": {
          "host": "10.0.2.10",
          "scheme": "http",
          "port": "9696"
        },
        "network-api": {
          "host": "10.0.2.10",
          "scheme": "http",
          "port": "9696"
        },
        "orchestration-api": {
          "host": "10.0.2.10",
          "scheme": "http",
          "port": "8004"
        },
        "orchestration-api-cfn": {
          "host": "10.0.2.10",
          "scheme": "http",
          "port": "8000"
        },
        "db": {
          "host": "0.0.0.0",
          "port": "3306"
        },
        "bind-host": "0.0.0.0"
      },
      "identity": {
        "admin_user": "admin",
        "bind_interface": "eth1",
        "debug": true
      },
      "image": {
        "api": {
          "bind_interface": "eth1"
        },
        "debug": true,
        "identity_service_chef_role": "os-identity",
        "rabbit_server_chef_role": "os-ops-messaging",
        "registry": {
          "bind_interface": "eth1"
        },
        "syslog": {
          "use": false
        }
      },
      "mq": {
        "bind_interface": "eth1",
        "host": "10.0.2.10",
        "user": "guest",
        "vhost": "/nova",
        "network": {
          "rabbit": {
             "host": "10.0.2.10",
             "port": "5672"
          }
        },
        "compute": {
           "service_type": "rabbitmq",
          "rabbit": {
            "host": "10.0.2.10",
            "port": "5672"
          }
        },
        "block-storage": {
          "service_type": "rabbitmq",
          "rabbit": {
            "host": "10.0.2.10",
            "port": "5672"
          }
        }
      }
    },
    "queue": {
      "host": "10.0.2.10",
      "user": "guest",
      "vhost": "/nova"
    }
  }
}
```

上記ファイルは KVM が使えない環境用に virt_type : qemu にしていますが、KVM が
利用できる環境をご利用であれば該当行を削除してください。デフォルト値の 'kvm'
が入るはずです。

次にデプロイ前に databag 関連の事前操作を行います。Vagrant 用に作成されたファ
イルを除くと...

```ruby
machine 'controller' do
  add_machine_options vagrant_config: controller_config
  role 'allinone-compute'
  role 'os-image-upload'
  chef_environment env
  file('/etc/chef/openstack_data_bag_secret',
       "#{File.dirname(__FILE__)}/.chef/encrypted_data_bag_secret")
  converge true
end
```

となっていて /etc/chef/openstack_data_bag_secret というファイルを事前にコピー
する必要がありそうです。下記のように操作します。

```bash
cp .chef/encrypted_data_bag_secret /etc/chef/openstack_data_bag_secret
```

デプロイを実行します。

この openstack-chef-repo には .chef ディレクトリが存在していてノード名が記され
ています。'nodienode' というノード名です。これを利用してそのままデプロイを実行
します。

```bash
chef-client -z
knife node -z run_list add nodienode 'role[allinone-compute]'
chef-client -z -E aio-neutron-kilo
```

上記の説明を行います。
１行目 chef-client -z で Chef-Zero サーバをメモリ上に起動し、2行目で自ノードへ
run_list を追加しています。最後、3行目でデプロイ実行、となります。

数分待つと OpenStack Kilo が構成されているはずです。

まとめ
----

Chef-Zero を用いることで Chef サーバを利用せずに楽に構築が行えました。ですが、
OpenStack の複数台構成となるとそれぞれのノードのパラメータを連携させる必要が出
てくるので Chef サーバを用いたほうが良さそうです。今度、時間を見つけて Kilo の
複数台構成についても調べておきます。

また、master ブランチを使用していますので、まだ openstack-chef-repo 自体が流動
的な状態とも言えます。が launchpad で管理されている Bug リストを見ると、ステー
タス Critical, High の Bug が見つからなかったので Kilo に関しては、大きな問題
無く安定してきている感があります。

https://bugs.launchpad.net/openstack-chef

