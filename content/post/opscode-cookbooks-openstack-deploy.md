+++
title = "openstack-chef-repo で OpenStack 複数台構成をデプロイ"
date = "2013-08-06"
slug = "2013/08/06/opscode-cookbooks-openstack-deploy"
Categories = ["infrastructure"]
description = "Opscode/Stackforge の openstack-chef-repo を使った OpenStack 複数台構成の自動デプロイ手順"
+++
こんにちは。<a href="https://twitter.com/jedipunkz">@jedipunkz</a> です。

前回、github.com/rcbops の Cookbooks を利用した OpenStack デプロイ方法を紹介し
ました。これは RackSpace 社の Private Cloud Service で使われている Cookbooks
で Apache ライセンスの元、誰でも利用できるようになっているものです。HA 構成を
組めたり Swift の操作 (Rings 情報管理など) も Chef で出来る優れた Cookbooks な
わけですが、運用するにあたり幾つか考えなくてはならないこともありそうです。

* chef-client の実行順番と実行回数が密接に関わっていること
* HA 構成の手動切替等、運用上必要な操作について考慮する必要性

※ 後者については OpenStack ユーザ会の方々に意見もらいました。

特に前項は Chef を利用する一番の意義である "冪等性" をある程度 (全くという意味
ではありませんが) 犠牲にしていると言えます。また chef-client の実行回数、タイ
ミング等 Cookbooks を完全に理解していないと運用は難しいでしょう。自ら管理して
いる Cookbooks なら問題ないですが、rcbops が管理しているので常に更新状況を追っ
ていく必要もありそうです。

一方、Opscode, RackSpace, AT&T 等のエンジニアが管理している Cookbooks がありま
す。これは以前、日本の OpenStack 勉強会で私が話した 'openstack-chef-repo' を利
用したモノです。github.com/stackforge の元に管理されています。
openstack-chef-repo は Berksfile, Roles, Environments のみの構成で各 Cookbooks
は Berksfile を元に取得する形になります。取得先は同じく github.com/stackforge
上で管理されています。

こちらの Cookbooks を利用するメリットとしては

* 冪等性が保たれる
* 複数ベンダ管理なのでリスクがある程度軽減される

などです。逆にデメリットは...

* 容易に HA 構成を組むことが出来ない
* node, environment, role による search で自律的に構成してくれない

です。一長一短ですが、運用し切れない HA 構成を組むのであれば、冪等性が保たれる
こちらの Cookbooks を使う、というのも一つの考えだと思います。

今回は nova-network を用いた複数台構成 (controller + compute x n) を
この Stackforge Cookbooks を使ってデプロイする方法を紹介しようと思います！

前提条件
----

* Chef サーバの構築は済ませている
* knife をワークショテーションで扱えるまでの準備は出来ている
* デプロイする先のノード (controller01 , compute0[12]) は sshd が起動している

構成
----

```                                                                           
+----------------+----------------+------------------------------------------------- public
| eth0           | eth0           | eth0                                                 network
+--------------+ +--------------+ +--------------+ +--------------+ +--------------+ 
| controller01 | |   compute01  | |   compute02  | | chef server  | |  workstation |
+--------------+ +--------------+ +--------------+ +--------------+ +--------------+ 
| eth1           | eth2  |        | eth2  |        | eth0           | eth0 
+----------------+-------o--------+-------o--------+----------------+--------------- api/management
                         | eth1           | eth1                                            network
                         +----------------+----------------------------------------- vm network
```

特徴は...

* controller01 ノードは OpenStack コントローラノード
* compute0[12] ノードは OpenStack コンピュートノード
* Chef サーバ、ワークステーションは api/management ネットワーク上に配置
* compute0[12] は 3 本目の NIC (eth1) を出し vm ネットワークをマッピング (bridge デバイス)
* API endpoint は controller01 の eth1 で受ける
* 仮想マシンは compute ノードの eth1 にブリッジ接続し eth0 を介してインターネットへ

IP アドレス情報...

* controller01,  eth0 : 10.0.0.10, eth1 : 10.0.1.10
* compute01, eth0 : 10.0.0.11, eth1 : 172.24.18.11, eth2 : 10.0.1.11
* compute02, eth0 : 10.0.0.12, eth1 : 172.24.18.12, eth2 : 10.0.1.12
* chef server, eth0 : 10.0.1.13
* workstation, eth0 : 10.0.1.14

デプロイ手順
----

ここからの操作は全てワークステーション上から行います。

まず、openstakc-chef-repo を取得します。私のアカウント上のものを利用します。stackforge のモノは
管理が追いついていないため、動作しません...。私のモノは fork して Roles を主に修正しています。

``` bash
% git clone git://github.com/jedipunkz/openstack-chef-repo.git ~/openstack-chef-repo
% cd ~/openstack-chef-repo
```

Cookbooks を取得します。Berksfile に従って取得しますが予め berkshelf を gem で
インストールしましょう。

``` bash
% gem install berkshelf --no-ri --no-rdoc
% rbenv rehash # rbenv を利用している場合
% berks install --path=./coobooks
```

上記の環境に合わせ environment を作成します。この environment は各 Cookbooks の attributes を上書きし
1つの environment で 1つの構成 (controller, compute..) を形成します。knife bootstrap, chef-client を
実行するとこの environment をサーチし、それぞれが連携し合ってくれます。

``` json
% ${EDITOR} environments/openstack-cluster01.rb

name "separated"
description "separated nodes environment"

override_attributes(
    "release" => "grizzly",
    "osops_networks" => {
      "management" => "10.0.1.0/24",
      "public" => "10.0.1.0/24",
      "nova" => "10.0.1.0/24"
    },
    "mysql" => {
      "bind_address" => "0.0.0.0",
      "root_network_acl" => "%",
      "allow_remote_root" => true,
      "server_root_password" => "secrete",
      "server_repl_password" => "secrete",
      "server_debian_password" => "secrete"
    },
    "nova" => {
      "network" => {
        "fixed_range" => "172.18.0.0/24",
        "public_interface" => "eth0"
      }
    },
    "openstack" => {
      "developer_mode" => true,
      "compute" => {
        "rabbit" => {
          "host" => "10.0.1.10"
        },
        "novnc_proxy" => {
          "bind_interface" => "eth1"
        },
        "libvirt" => {
          "bind_interface" => "eth1"
        },
        "network" => {
          "fixed_range" => "172.18.0.0/24"
        },
        "networks" => [
        {
          "label" => "private",
          "ipv4_cidr" => "172.18.0.0/24",
          "num_networks" => "1",
          "network_size" => "255",
          "bridge" => "br200",
          "bridge_dev" => "eth1",
          "dns1" => "8.8.8.8",
          "dns2" => "8.8.4.4",
          "multi_host" => "T"
        }
        ]
      },
      "identity" => {
        "bind_interface" => "eth1",
        "users" => {
          "demo" => {
            "password" => "demo",
            "default_tenant" => "service",
            "roles" => {
              "Member" => [ "Member" ]
            }
          }
        }
      },
      "image" => {
        "bind_interface" => "eth1",
      },
      "network" => {
        "api" => {
          "bind_interface" => "eth1",
        }
      },
      "db" => {
        "bind_interface" => "eth1",
        "compute" => {
          "host" => "10.0.1.10"
        },
        "identity" => {
          "host" => "10.0.1.10"
        },
        "image" => {
          "host" => "10.0.1.10"
        },
        "network" => {
          "host" => "10.0.1.10"
        },
        "volume" => {
          "host" => "10.0.1.10"
        },
        "dashboard" => {
          "host" => "10.0.1.10"
        }
      },
      "mq" => {
        "bind_interface" => "eth1"
      },
      "endpoints" => {
        "identity-api" => {
          "host" => "10.0.1.10"
        },
        "identity-admin" => {
          "host" => "10.0.1.10"
        },
        "compute-api" => {
          "host" => "10.0.1.10"
        },
        "compute-ec2-api" => {
          "host" => "10.0.1.10"
        },
        "compute-ec2-admin" => {
          "host" => "10.0.1.10"
        },
        "compute-novnc" => {
          "host" => "10.0.1.10",
        },
        "network-api" => {
          "host" => "10.0.1.10",
        },
        "image-api" => {
          "host" => "10.0.1.10",
        },
        "image-registry" => {
          "host" => "10.0.1.10",
        },
        "volume-api" => {
          "host" => "10.0.1.10",
        }
      }
    }
)
```

spiceweasel を gem でインストールします。これは Cookbooks, Roles, Environments
等を Chef サーバへアップロードしたり、knife bootstrap を一気に行なってくれるツー
ルです。knife bootstrap コマンドの書式も書く必要がありません。

``` bash
% gem install spiceweasel --no-ri --no-rdoc
% rbenv rehash # rbenv を使っている場合
```

infrastracture.yml を修正します。作成した environments 名の修正と node: を修正
します。

``` yaml
...<snip>...

environments:
- separated:

...<snip>...

nodes:
- 10.0.0.10:
  run_list: role[os-compute-single-controller]
  options: -N controller01 -E separated --sudo -x <your_accout_name> 
- 10.0.0.11:
  run_list: role[os-compute-worker]
  options: -N compute01 -E separated --sudo -x <your_accout_name> 
- 10.0.0.12:
  run_list: role[os-compute-worker]
  options: -N compute02 -E separated --sudo -x <your_accout_name>    
```

spiceweasel を実行します。すると knife コマンドの一覧が出力されますので実行さ
れる内容を確認します。ここではまだ実行が行われません。

``` bash
% spiceweasel infrastructure.yml
```

-e オプションをつけて実行すると先ほど出力された knife コマンドが順に実行されま
 す。この操作で3台のデプロイが完了します。

``` bash
% spiceweasel -e infrastructure.yml
```


まとめと考察
----

以上の操作で OpenStack 複数台構成が組める。Neutron 構成についても
'openstack-network' Cookbook に実装が入っている様子なので以後試してみたいです。
今回は public ネットワーク・api/management ネットワーク・vm ネットワークの3つ
のネットワーク構成で組みました。運用するのであれば public と api/management が
別れている必要があると思いますので。自宅で作ってみたい！でもネットワークが...と
いう場合、environment ファイルの内容を修正すれば pubcic/api/management ネット
ワーク・vm ネットワークの2つのネットワーク構成でも組めるので試してみてください。
もしくは bridge_dev の記述を environment から削除すると仮想ネットワークの物理
ネットワークへのマッピングがされないので、1つのネットワークでも構成出来ます。

また、オールインワン構成も組めます。オールインワン構成の場合

``` bash
% knife bootstrap <ip_addr> -N allinone01 -E allinone \
  -r 'role[allinone-compute]' --sudo --x <your_account>
```

でデプロイ出来ます。こちらもネットワーク構成は1つでも2つでも3つでも組めます。もう少し
詳しい手順をオールインワン構成については別途ブログにまとめるかもしれませんー。
