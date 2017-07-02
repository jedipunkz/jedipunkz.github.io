---
title: "Docker,Test-Kitchen,Ansible でクラスタを構成する"
date: "2017-07-02"
Categories: ["infrastructure"]
---
こんにちは。<a href="https://twitter.com/jedipunkz">@jedipunkz</a> です。

以前、"Test-Kitchen, Docker で Ansible Role 開発サイクル高速化！" ってタイトルで Ansible Role の開発を test-kitchen を使って行う方法について記事にしたのですが、やっぱりローカルで Docker コンテナ立ち上げてデプロしてテストして.. ってすごく楽というか速くて今の現場でも便利につかっています。前の記事の URL は下記です。

https://jedipunkz.github.io/blog/2016/07/14/test-kitchen-with-ansible/

最近？は ansible container って技術もあるけど、僕らが Docker 使う目的はコンテナでデプロイするのではなくて単に Ansible を実行するローカル環境が欲しいってこととか、Serverspec をローカル・実機に実行する環境が欲しいってことなので、今でも test-kitchen 使っています。

で、最近になって複数ノードの構成の Ansible Role を test-kitchen, Docker を使って開発できることに気がついたので記事にしようと思います。これができるとローカルで Redis Master + Redis Slave(s) + Sentinel って環境も容易にできると思います。

使うソフトウェア
----

前提は macOS ですが Linux マシンでも問題なく動作するはずです。

ほぼ前回と同じです。

* Ansible
* Docker
* test-kitchen
* kitchen-docker (test-kitchen ドライバ)
* kitchen-ansible (test-kitchen ドライバ)
* Serverspec

インストール
----

ソフトウェアののインストール方法については前回の記事を見てもらうこととして割愛します。

test-kitchen の環境を作る
----

test-kitchen の環境を作ります。'kitchen init' を実行して基本的には生成された .kitchen.yml を弄るんじゃなくて .kitchen.local.yml を修正していきます。こちらの記述が必ず上書きされて優先されます。

.kitchen.local.yml の例を下記に記します。

```yaml
---
driver:
  name: docker
  binary: /usr/local/bin/docker
  socker: unix:///var/run/docker.sock
  use_sudo: false

provisioner:
  name: ansible_playbook
  roles_path: ../../roles
  group_vars_path: ../../group_vars/local/
  hosts: kitchen-deploy
  require_ansible_omnibus: false
  ansible_platform: centos
  require_chef_for_busser: true

platforms:
  - name: centos
    driver_config:
      image: centos:7.2.1511 # (例)
      platform: centos
      require_chef_omnibus: false
      privileged: true                 # systemd 使うときの例
      run_command: /sbin/init; sleep 3 # 同上

suites:
  - name: master
    provisioner:
      name: ansible_playbook
      playbook: ./site_master.yml
    driver_config:
      run_options: --net=kitchen --ip=172.18.0.11
  - name: slave
    provisioner:
      name: ansible_playbook
      playbook: ./site_slave.yml
    driver_config:
      run_options: --net=kitchen --ip=172.18.0.12
```

各パラーメタの詳細については kitchen-ansibke, kitchen-docker のドキュメントを見ていただくとして...

* https://github.com/neillturner/kitchen-ansible/blob/master/provisioner_options.md
* https://github.com/test-kitchen/kitchen-docker

特徴としては suites: の項目で mater, slave として Docker コンテナを2つ扱うことを宣言している部分です。

* name: master で site_master.yml という Playbook を実行することを宣言
* name: master で 172.18.0.11 という IP アドレスを使うことを宣言
* name: slave で site_slave.yml という Playbook を実行することを宣言
* name: slave で 172.18.0.12 という IP アドレスを使うことを宣言

勿論、同様の記述で 3, 4.. 個目のコンテナ環境を作ることもできます。

こんな感じです。ここで "固定 IP アドレス" を使うよう宣言したことはとても重要で、例えば NSD のクラスタ構成を作りたい時、お互いのコンテナ同士が相手のコンテナの IP アドレスを知り合う必要があります。

* NSD Master は Slave へ Xfer するため Slave コンテナの IP アドレスを知る必要あり
* NSD Slave は Master からのみ Xfer 受信する設定が必要なので Master IP を知る必要あり

って感じです。RabbitMQ や Redis, Consul などのクラスタの際にも同様に互い・もしくは一方の IP アドレスを知る必要が出てくる場合があります。

で、固定 IP アドレスなのですが Docker では動的 IP が基本なので、固定 IP アドレスを用いるために macOS + Docker 環境の中に一つネットワークを作る必要があります。下記を実行するだけで作成できます。

```bash
docker network create --subnet 172.18.0.0/24 kitchen
```

Serverspec のディレクトリ構成
---

前回の記事でも書いたように、Ansible でコンテナに対してデプロイした結果に対して Servrspec テストが流せます。で今回は、クラスタ構成で複数のコンテナを扱うのでそれぞれのコンテナに対して流すテストが必要になります。下記のようなディレクトリ構成があればそれを実現できます。

```
.
├── README.md
├── chefignore
├── site_master.yml
├── site_slave.yml
└── test
    └── integration
        ├── master
        │   └── serverspec
        │       └── nsd_master_spec.rb
        └── slave
            └── serverspec
                └── nsd_slave_spec.rb
```

そして 上記の nsd_master_spec,rb, nsd_slave_spec.rb の記述の仕方ですが下記のようになります。

```
require 'serverspec'

# Required by serverspec
set :backend, :exec

describe package('nsd') do
  it { should be_installed }
end

describe process('nsd') do
  it { should be_running }
end

...<省略>...

```

コンテナデプロイ・テスト実行方法
----

ここまでで環境が整ったと思うので (実際には site_master.yml 等の Playbook もしくは Ansible Role の指定が必要) 、コンテナに対して Ansible デプロイする方法・Serverspec テスト実行する方法を書いていきます。


```bash
kitchen create   # 2 コンテナ作られます
kitchen converge # 2 コンテナに対して Ansible デプロイされます
kitchen verify   # 2 コンテナに対して Serverspec テストされます
kitchen test     # destroy, create, converge, veriy, destroy が一斉実行されます
```

各コンテナ毎に操作する場合

```bash
kitchen create master-centos   # or slave-centos
kitchen converge master-centos # or slave-centos
kitchen verify master-centos   # or slave-centos
kitchen destroy master-centos  # or slave-centos
```

まとめ
----

ローカルの Docker コンテナに対してデプロイテストできるのでとても手軽に、尚且つ高速に Ansible の Playbook や Role が開発出来ることは前回の記事でわかったと思うのですが、クラスタ構成についてもローカルで開発出来ることがわかりました。

ちなみに私達の環境だと .kitchen.local.yml に下記の記述をしているので...

```
roles_path: ../../roles
```

site_master(slave).yml の中の記述としては下記のようにしています。'nsd' っていう Role を作る想定で Role 指定がしてあった、尚且つローカルでの Ansible Variable を上書き(一番優先される) することで、Role のローカルデプロイを実現しています。(variable 名は Role の作り方によります)

```yaml
---
- hosts: kitchen-deploy
  sudo: yes
  roles:
    - { role: nsd, tags: nsd }
  vars:
    nsd_type: 'master'
    nsd_master_addr: '172.18.0.11'
    nsd_slave_addr: '172.18.0.12'
```

test-kitchen 自体はリリースされてだいぶ時間が経過している分、技術的に枯れてきていて未だに私達は Ansible の開発に役立てています。元々は Chef 向けの技術ではあるのだけどそこは今回紹介した .kitchen.local.yml の書き方で回避できるし、Serverspec のテストも流せるし..。

またローカル(ホストの macOS) へのポートマッピング等もコンテナ毎に記せますのでその辺りはドキュメントを読んでみてください。

最終的にはここで書いた Serverspec テストを実機へ流せれば文句なしだと思います。方法はあると思います。また気がついたら紹介しようと思います。
