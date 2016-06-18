+++
title = "Chef-Zero でお手軽に OpenStack Icehouse を作る"
date = "2014-11-15"
slug = "2014/11/15/chef-zero-openstack-icehouse"
Categories = ["infrastructure"]
+++
こんにちは。<a href="https://twitter.com/jedipunkz">@jedipunkz</a> です。

OpenStack Juno がリリースされましたが、今日は Icehouse ネタです。

icehouse 以降、自分の中で OpenStack を自動で作る仕組みが無くなりつつあり、気軽
に OpenStack を作って色々試したい！ッていう時に手段が無く困っていました。例え
ば仕事でちょっと OpenStack 弄りたい！って時に DevStack, RDO しかなく。DevStack
は御存知の通り動かない可能性が結構あるし RDO は Ubuntu/Debian Gnu Linux ベース
じゃないし。

ってことで、以前にも紹介した stackforge 管理の openstack-chef-repo と
Chef-Zero を使って OpenStack Icehouse (Neutron) のオールインワン構成を作る方法
を書きます。ちなみに最近 Chef-Solo が Chef-Zero に置き換わりつつあるらしいです。
Chef-Zero はオンメモリで Chef サーバを起動する仕組みです。Chef-Solo と違って Chef
サーバを扱う時と何も変更無く操作が出来るのでとても楽です。また、Chef サーバを
別途構、構築・管理しなくて良いので、気軽に OpenStack が作れます。

ちなみに stackforge/openstack-chef-repo の README.md に Chef-Zero での構築方法
が書いてありますが、沢山の問題があります。

* nova-network 構成
* API の Endpoint が全て localhost に向いてしまうため外部から操作不可能
* 各コンポーネントの bind_address が localhost を向いてしまう
* berkshelf がそのままでは入らない

よって、今回はこれらの問題を解決しつつ "オールインワンな Neutron 構成の
Icehouse OpenStack を作る方法" を書いていきます。

構成
----

    +----------------- 10.0.0.0/24 (api/management network)
    |
    +----------------+
    | OpenStack Node |
    |   Controller   |
    |    Compute     |
    +----------------+
    |  |
    +--(-------------- 10.0.1.0/24 (external network)
       |
       +-------------- 10.0.2.0/24 (guest vm network)

IP address 達

* 10.0.0.10 (api/manageent network) : eth0
* 10.0.1.10 (external network) : eth1
* 10.0.2.10 (guest vm network) : eth2

注意 : 操作は全て eth0 経由で行う

前提の環境
----

stackforge/openstack-chef-repo の依存している Cookbooks の関係上、upstart 周り
がうまく制御できていないので Ubuntu Server 12.04.x を使います。

インストール方法
----

上記のように3つのネットワークインターフェースが付いたサーバを1台用意します。
KVM が利用出来たほうがいいですが使えないくても構いません。KVM リソースが使えな
い場合の修正方法を後に記します。

サーバにログインし root ユーザになります。その後 Chef をオムニバスインストーラ
でインストールします。

```bash
% sudo -i
# curl -L https://www.opscode.com/chef/install.sh | bash
```

次に stable/icehose ブランチを指定して openstack-chef-repo をクローンします。

```bash
# cd ~
# git clone -b stable/icehouse https://github.com/stackforge/openstack-chef-repo
# 
```

berkshelf をインストールするのですが依存パッケージが足らないのでここでインストー
ルします。

```bash
# apt-get -y install build-essential zlib1g-dev libssl-dev libreadline-dev \
  ruby-dev libxml2-dev libxslt-dev g++
```

berkshelf をインストールします。

```bash
# /opt/chef/embedded/bin/gem install berkshelf --no-ri --no-rdoc
```

次に openstack-chef-repo に依存する Cookbooks を取得します。

```bash
# cd ~/openstack-chef-repo
# /opt/chef/embedded/bin/berks vendor ./cookbooks
```

~/openstack-chef-repo/environments ディレクトリ配下に neutron-allinone.json と
いうファイル名で作成します。内容は下記の通りです。

```json
{                                                                                                                                                      [0/215]
  "name": "neutron-allinone",
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
      "server_root_password": "root",
      "server_debian_password": "root",
      "server_repl_password": "root",
      "allow_remote_root": true,
      "root_network_acl": ["10.0.0.0/8"]
    },
    "rabbitmq": {
      "address": "10.0.1.10",
      "port": "5672"
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
          "host": "10.0.1.10"
        },
        "novnc_proxy": {
          "bind_interface": "eth0"
        },
        "libvirt": {
          "bind_interface": "eth0",
        },
        "novnc_proxy": {
          "bind_interface": "eth0"
        },
        "xvpvnc_proxy": {
          "bind_interface": "eth0"
        },
        "image_api_chef_role": "os-image",
        "identity_service_chef_role": "os-identity",
        "nova_setup_chef_role": "os-compute-api",
        "rabbit_server_chef_role": "os-ops-messaging",
        "network": {
          "public_interface": "eth0",
          "service_type": "neutron"
        }
      },
      "network": {
        "debug": "True",
        "dhcp": {
          "enable_isolated_metadata": "True"
        },
        "metadata": {
          "nova_metadata_ip": "10.0.1.10"
        },
        "openvswitch": {
          "tunnel_id_ranges": "1:1000",
          "enable_tunneling": "True",
          "tenant_network_type": "gre",
          "local_ip_interface": "eth2"
        },
        "api": {
          "bind_interface": "eth0"
        },
        "l3": {
          "external_network_bridge_interface": "eth1"
        },
        "service_plugins": ["neutron.services.l3_router.l3_router_plugin.L3RouterPlugin"]
      },
      "db": {
        "bind_interface": "eth0",
        "compute": {
          "host": "10.0.1.10"
        },
        "identity": {
          "host": "10.0.1.10"
        },
        "image": {
          "host": "10.0.1.10"
        },
        "network": {
          "host": "10.0.1.10"
        },
        "volume": {
          "host": "10.0.1.10"
        },
        "dashboard": {
          "host": "10.0.1.10"
        },
        "telemetry": {
          "host": "10.0.1.10"
        },
        "orchestration": {
          "host": "10.0.1.10"
        }
      },
      "developer_mode": true,
      "endpoints": {
        "compute-api-bind": {
          "host": "10.0.1.10",
          "scheme": "http",
          "port": "8774"
        },
        "compute-api": {
          "host": "10.0.1.10",
          "scheme": "http",
          "port": "8774"
        },
        "compute-ec2-admin-bind": {
          "host": "10.0.1.10",
          "scheme": "http",
          "port": "8773"
        },
        "compute-ec2-admin": {
          "host": "10.0.1.10",
          "scheme": "http",
          "port": "8773"
        },
       "compute-ec2-api-bind": {
          "host": "10.0.1.10",
          "scheme": "http",
          "port": "8773"
        },
        "compute-ec2-api": {
          "host": "10.0.1.10",
          "scheme": "http",
          "port": "8773"
        },
        "compute-xvpvnc": {
          "host": "10.0.1.10",
          "scheme": "http",
          "port": "6081"
        },
        "compute-novnc-bind": {
          "host": "10.0.1.10",
          "scheme": "http",
          "port": "6080"
        },
        "compute-novnc": {
          "host": "10.0.1.10",
          "scheme": "http",
          "port": "6080"
        },
        "compute-vnc": {
          "host": "0.0.0.0",
          "scheme": "http",
          "port": "6080"
        },
        "image-api": {
          "host": "10.0.1.10",
          "scheme": "http",
          "port": "9292"
        },
        "image-api-bind": {
          "host": "10.0.1.10",
          "scheme": "http",
          "port": "9292"
        },
        "image-registry": {
          "host": "10.0.1.10",
          "scheme": "http",
          "port": "9191"
        },
        "image-registry-bind": {
          "host": "10.0.1.10",
          "scheme": "http",
          "port": "9191"
        },
        "identity-api": {
          "host": "10.0.1.10",
          "scheme": "http",
          "port": "5000"
        },
        "identity-bind": {
          "host": "10.0.1.10",
          "scheme": "http",
          "port": "5000"
        },
        "identity-admin": {
          "host": "10.0.1.10",
          "scheme": "http",
          "port": "35357"
        },
        "volume-api-bind": {
          "host": "10.0.1.10",
          "scheme": "http",
          "port": "8776"
        },
        "volume-api": {
          "host": "10.0.1.10",
          "scheme": "http",
          "port": "8776"
        },
        "telemetry-api": {
          "host": "10.0.1.10",
          "scheme": "http",
          "port": "8777"
        },
        "network-api-bind": {
          "host": "10.0.1.10",
          "scheme": "http",
          "port": "9696"
        },
        "network-api": {
          "host": "10.0.1.10",
          "scheme": "http",
          "port": "9696"
        },
        "orchestration-api": {
          "host": "10.0.1.10",
          "scheme": "http",
          "port": "8004"
        },
        "orchestration-api-cfn": {
          "host": "10.0.1.10",
          "scheme": "http",
          "port": "8000"
        }
      },
      "identity": {
        "admin_user": "admin",
        "bind_interface": "eth0",
        "debug": true
      },
      "image": {
        "api": {
          "bind_interface": "eth0"
        },
        "debug": true,
        "identity_service_chef_role": "os-identity",
        "rabbit_server_chef_role": "os-ops-messaging",
        "registry": {
          "bind_interface": "eth0"
        },
        "syslog": {
          "use": false
        },
        "upload_images": [
          "precise"
        ]
      },
      "mq": {
        "bind_interface": "eth0",
        "host": "10.0.1.10",
        "user": "guest",
        "vhost": "/nova",
        "network": {
          "rabbit": {
             "host": "10.0.1.10",
             "port": "5672"
          }
        },
        "compute": {
           "service_type": "rabbitmq",
          "rabbit": {
            "host": "10.0.1.10",
            "port": "5672"
          }
        },
        "block-storage": {
          "service_type": "rabbitmq",
          "rabbit": {
            "host": "10.0.1.10",
            "port": "5672"
          }
        }
      }
    },
    "queue": {
      "host": "10.0.1.10",
      "user": "guest",
      "vhost": "/nova"
    }
  }
}
```

内容について全て説明するのは難しいですが、このファイルを作成するのが今回一番苦
労した点です。と言うのは、構成を作りつつそれぞれのコンポーネントのコンフィギュ
レーション、エンドポイントのアドレス、バインドアドレス、リスンポート等など、全
てが正常な値になるように Cookbooks を読みつつ作業するからです。この json ファ
イルが完成してしまえば、あとは簡単なのですが。

前述しましたが KVM リソースが使えない環境の場合 Qemu で仮想マシンを稼働するこ
とができます。その場合、下記のように "libvirt" の項目に "virt_type" を追記して
ください。

```json
        "libvirt": {
          "bind_interface": "eth0",
          "virt_type": "qemu" # <------ 追記
        },
```
        
それではデプロイしていきます。

ここで 'allinone' はホスト名、'allinone-compute' は Role 名、neutron-allinone
は先ほど作成した json で指定している environment 名です。

```bash
# chef-client -z
# knife node -z run_list add allinone 'role[allinone-compute]'
# chef-client -z -E neutron-allinone
```

環境にもよりますが、数分でオールインワンな OpenStack Icehouse が完成します。

まとめ
+++

Chef サーバを使わなくて良いのでお手軽に OpenStack が構築出来ました。この json
ファイルは実は他にも応用出来ると思っています。複数台構成の OpenStack も指定
Role を工夫すれば構築出来るでしょう。が、その場合は chef-zero は使えません。
Chef サーバ構成にする必要が出てきます。

ちなみに OpenStack Paris Summit 2014 で「OpenStack のデプロイに何を使っている
か？」という調査結果が下記になります。Chef が2位ですが Pueppet に大きく離され
ている感があります。Juno 版の openstack-chef-repo も開発が進んでいますので、頑
張って広めていきたいです。

* 1位 Puppet
* 2位 Chef
* 3位 Ansible
* 4位 DevStack
* 5位 PackStack
* 6位 Salt
* 7位 Juju
* 8位 Crowbar
* 9位 CFEngine

参考 URL : <http://superuser.openstack.org/articles/openstack-user-survey-insights-november-2014>

ちなみに、Puppet を使った OpenStack デプロイも個人的に色々試しています。
