+++
title = "第11回OpenStack勉強会で話してきた"
date = "2013-02-10"
Categories = ["infrastructure", "report"]
description = "openstack-chef-repo を使った Chef による OpenStack Essex 構築の勉強会発表レポート"
aliases = [
  "/blog/2013/02/10/di-11hui-openstack-study11-openstack-chef-repo",
  "/post/2013/02/10/di-11hui-openstack-study11-openstack-chef-repo"
]
+++
2013年2月9日に行われた OpenStack 勉強会第11回で話してきました。

openstack-chef-repo と言う、Opscode Chef で OpenStack を構築する内容を話して
きました。その時に説明出来なかった詳細についてブログに書いておきます。

<iframe src="http://www.slideshare.net/slideshow/embed_code/16434817"
width="427" height="356" frameborder="0" marginwidth="0" marginheight="0"
scrolling="no" style="border:1px solid #CCC;border-width:1px 1px
0;margin-bottom:5px" allowfullscreen webkitallowfullscreen mozallowfullscreen>
</iframe> <div style="margin-bottom:5px"> <strong> <a
href="http://www.slideshare.net/tomokazubobhirai/openstack-chefrepo"
title="Openstack chef-repo" target="_blank">Openstack chef-repo</a> </strong>
from <strong><a href="http://www.slideshare.net/tomokazubobhirai"
target="_blank">Tomokazu Hirai</a></strong> </div>

説明で使ったスライドです。

まえがき
----

Essex ベースで構築することしか今は出来ません。Folsom に関しては '直ちに開発が
スタートする' と記されていました。今回は Opscode と RackSpace のエンジニアが共
同で開発を進めているので期待しています。今まで個人で OpenStack の各コンポーネ
ントの cookbook を開発されていた方がいらっしゃるのだけど汎用性を持たせるという
意味で非常に難しく、またどの方の開発に追従していけばよいか判断困っていました。
よって今回こそ期待。

前提の構成
----

    +-------------+
    | chef-server |
    +-------------+ 10.0.0.10
    |
    +---------------+ 10.0.0.0/24
    |               |
    +-------------+ +-------------+
    | workstation | |    node     |
    +-------------+ +-------------+
    10.0.0.11       10.0.0.12

* chef-server : chef API を持つ chef-server 。cookbook, role..などのデータを持つ
* workstation : openstack-chef-repo を使うノード。knife が使える必要がある。
* node        : OpenStack を構築するターゲットノード

目次
----

* chef-server の構築 (BootStrap 使う)
* openstack-chef-repo を使用する準備
* openstack-chef-repo 実行

chef-server の構築
----

Opscode の wiki に記されている通りなのですが、簡単に書いておきます。今回は
bootstrap 方式で用意します。

chef-server ノードに chef をインストールします。chef-solo を用いるからです。

    chef-server# gem install chef

chef-solo を使うための設定情報を /etc/chef/solo.rb に記します。

    chef-server# mkdir /etc/chef
	chef-server# ${EDITOR} /etc/chef/solo.rb
	file_cache_path "/tmp/chef-solo"
	cookbook_path "/tmp/chef-solo/cookbooks"

chef-solo を実行する際に使う json ファイルを用意します。attribute を上書きする
ことが出来ます。今回は webui を有効にした状態にします。

    chef-server# ${EDITOR} ~/chef.json
    {
      "chef_server": {
        "server_url": "http://localhost:4000",
        "init_style": "runit"
      },
      "run_list": [ "recipe[chef-server::rubygems-install]" ]
    }

bootstrap して chef-server を構築します。

    chef-server# chef-solo -c /etc/chef/solo.rb -j ~/chef.json -r http://s3.amazonaws.com/chef-solo/bootstrap-latest.tar.gz

chef-server が完成したはずです。workstation で knife を使うために 'client' を
作ります。chef 10.x では user ではなく client が knife を実行します。


    chef-server% mkdir ~/.chef
    chef-server% sudo cp /etc/chef/validation.pem ~/.chef/
    chef-server% sudo cp /etc/chef/webui.pem ~/.chef/
    chef-server% sudo chown <my-username>:<my-group> ~/.chef

knife を使うために下記の操作を行います。

    chef-server% cd ~
    chef-server% knife configure -i
    Where should I put the config file? [~/.chef/knife.rb]
    Please enter the chef server URL: [http://10.0.0.1:4000]
    Please enter a clientname for the new client: [jedipunkz]
    Please enter the existing admin clientname: [chef-webui]
    Please enter the location of the existing admin client's private key:[/etc/chef/webui.pem] /home/jedipunkz/.chef/webui.pem
    Please enter the validation clientname: [chef-validator]
    Please enter the location of the validation key:[/etc/chef/validation.pem] /home/jedipunkz/.chef/validation.pem
    Please enter the path to a chef repository (or leave blank):
    Creating initial API user...
    Created client[jedipunkz]
    Configuration file written to /home/jedipunkz/.chef/knife.rb

workstaion ノードで knife を操作するための 'worker' client を作成します。

    chef-server% export EDITOR=vim
    chef-server% knife client create worker -a -f worker.pem
    chef-server% knife client list
      chef-validator
      chef-webui
	  chefserver.example.com
      jedipunkz
      worker

openstack-chef-repo を使用する準備
----

workstation で openstack-chef-repo を使うための準備をします。

まずは knife を使えるように下記のように knife.rb や pem の手元への転送を行います。

    workstation% gem install chef librarian spiceweasel
	workstation% cd ~
	workstation% git clone git://github.com/opscode/openstack-chef-repo.git
	workstation% cd openstack-chef-repo
	workstation% vim .chef/knife.rb
    log_level                :info
    log_location             STDOUT
    node_name                'worker'
    client_key               '/home/jedipunkz/openstack-chef-repo/.chef/worker.pem'
    validation_client_name   'chef-validator'
    validation_key           '/home/jedipunkz/openstack-chef-repo/.chef/validation.pem'
    chef_server_url          'http://10.0.0.10:4000'
    cache_type               'BasicFile'
    cache_options( :path => '/home/jedipunkz/openstack-chef-repo/.chef/checksums' )
    cookbook_path           '/home/jedipunkz/openstack-chef-repo/cookbooks'
    workstation% scp 10.0.0.10:~/worker.pem .chef/
	workstation% scp 10.0.0.10:~/.chef/validation.pem .chef/

librarian を使って OpenStack 構築に必要な cookbooks をダンロードします。Cheffile 
というファイルに何をどこから取得するのか記されいてそれにしたがってダウンロードされます。

    workstation% libratrian-chef update

環境に合わせて production.yml を修正します。今回必要最低限の箇所のみ修正します。
"osops_networks" という箇所に nova-network に渡すネットワーク情報があるので今回の
環境 10.0.0.0/24 に修正します。全体はこのような内容になります。

    workstation% ${EDITOR} production.yml
    name "production"
    description "Defines the network and database settings you're going to use with OpenStack. The networks will be used in the libraries provided by the osops-utils cookbook. This example is for FlatDHCP with 2 physical networks."
    
    override_attributes(
      "glance" => {
        "image_upload" => true,
        "images" => ["precise","cirros"],
      },
      "mysql" => {
        "allow_remote_root" => true,
        "root_network_acl" => "%"
      },
      "osops_networks" => {
        "public" => "10.0.0.0/24",
        "management" => "10.0.0.0/24",
        "nova" => "10.0.0.0/24"
      },
      "nova" => {
        "network" => {
          "fixed_range" => "192.168.100.0/24",
          "public_interface" => "eth0"
        },
        "networks" => [
          {
            "label" => "public",
            "ipv4_cidr" => "192.168.100.0/24",
            "num_networks" => "1",
            "network_size" => "255",
            "bridge" => "br100",
            "bridge_dev" => "eth0",
            "dns1" => "8.8.8.8",
            "dns2" => "8.8.4.4"
          }
        ]
      }
      )  

infrastructure.yml という spiceweasel が参照するファイルの修正を行います。
cookbooks, roles, environments, data bags, node とパラメータがあり node
のみ記されていないので今回用意したターゲットノードの情報を追記します。

node には予め SSH 公開鍵を設置する必要があります。また下記は root ユーザでログ
インしていますが、sudo してもらっても構わないです。role で指定した 'allinone'
は OpenStack の全てのコンポーネントを一台のノードにインストールするためのもの
です。これを他の role 例えば 'keystone' 等を指定して複数のノードに OpenStack
を展開することも可能なはずです。試していませんが。

    workstation% vim infrastructure.yml
	... 省略
	nodes:
	- 10.0.0.12:
	  run_list: role[allinone]
	  options: -i ~/.ssh/id_rsa -x root -E production

openstack-chef-repo 実行
----

準備が整ったので spiceweasel を使って knife コマンドの出力チェックと実行をして
みます。先ほど追記した infrastructure.yml を使います。

    workstation% spiceweasel infrastructure.yml
    knife cookbook upload apache2
    knife cookbook upload apt
    knife cookbook upload aws
    knife cookbook upload build-essential
    knife cookbook upload ntp
    knife cookbook upload openssh
    knife cookbook upload openssl
    knife cookbook upload postgresql
    knife cookbook upload selinux
    knife cookbook upload xfs
    knife cookbook upload yum
    knife cookbook upload erlang
    knife cookbook upload mysql
    knife cookbook upload rabbitmq
    knife cookbook upload database
    knife cookbook upload omnibus_updater
    knife cookbook upload lxc
    knife cookbook upload sysctl
    knife cookbook upload osops-utils
    knife cookbook upload mysql-openstack
    knife cookbook upload rabbitmq-openstack
    knife cookbook upload keystone
    knife cookbook upload glance
    knife cookbook upload nova
    knife cookbook upload horizon
    knife environment from file production.rb
    knife role from file base.rb
    knife role from file lxc.rb
    knife role from file mysql-master.rb
    knife role from file rabbitmq-server.rb
    knife role from file keystone.rb
    knife role from file glance-api.rb
    knife role from file glance-registry.rb
    knife role from file glance.rb
    knife role from file nova-setup.rb
    knife role from file nova-scheduler.rb
    knife role from file nova-api-ec2.rb
    knife role from file nova-api-os-compute.rb
    knife role from file nova-volume.rb
    knife role from file nova-vncproxy.rb
    knife role from file horizon-server.rb
    knife role from file single-controller.rb
    knife role from file single-compute.rb
    knife role from file allinone.rb
    knife bootstrap 10.0.0.12 -i ~/.ssh/id_rsa -x root -E production -r 'role[allinone]'  

この操作で spiceweasel は role ファイルの中身と yml ファイルを読み、依存関係を
チェックしてくれます。

ではいよいよ実行。

    workstaion% spiceweasel -e infrastructure.yml

数分で OpenStack 環境が構築出来ると思います。

所感
----

現時点ではまだ essex ベースの OpenStack しか構築出来ない。folsom 以降について
は直ちに行われる。また先にも記したが Opscode と RackSpace のエンジニアが共同で
作業に入ったので今後に期待。複数の OpenStack cookboooks を見てきたが個人で開発
するのは厳しいと感じています。fedra, centos, ubuntu, debian ... いろんなプラッ
トフォームを前提に開発するのは厳しい...。pull request する余力があればやってみ
たい。また合わせて各コンポーネントの cookbooks についても同様に参加していきた
い。

chef は繰り返し実行されるので継続的にデプロイが可能であり、chef Resources が我々
の操作を抽象化してくれる。尚且つ API で開発も容易になる。学習コストは若干高い
し、cookbooks の開発も正直しんどい。だけどインフラを chef でコントロールする意
味はとても大きい。その他のメリットとして属人的な操作に依存したシステムを無くす
という事もある。

OpenStack のドキュメントにはデプロイ方法として dodai-deploy と puppet が掲載さ
れている。chef は載っていない。これは cookbooks の開発が遅れている状況が理由に
あると思う。今回 Opscode の中の Matt Ray さんの下記の資料

<http://www.slideshare.net/mattray/chef-11-previewchef-for-openstack>

を見て、これからに期待したいと感じた。
