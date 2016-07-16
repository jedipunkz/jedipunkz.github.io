+++
author = ""
categories = ["infrastructure"]
date = "2016-07-14T09:10:57+09:00"
description = "test-kitchen with ansible, docker"
featured = ""
featuredalt = ""
featuredpath = ""
linktitle = ""
title = "Test-Kitchen, Docker で Ansible Role 開発サイクル高速化！"

+++

こんにちは。<a href="https://twitter.com/jedipunkz">@jedipunkz</a> です。

私もインフラのプロビジョニングツールとして Chef ではなく Ansible を使うことが増えたのですが、Chef を使っていた頃に同じく利用していた test-kitchen が便利だったので ansible と併用できないかと思い試してみました。test-kitchen は Docker コンテナや EC2 等を起動して Chef, Ansible 等で構成をデプロイし serverspec 等のテストツールで構成をテストできるソフトウェアです。AWS EC2 でデプロイしてもいいのですが、EC2 を起動してデプロイして失敗したら削除してのサイクルを回すことを考えるとだいぶ面倒なので Docker + test-kitchen を使ってこのサイクルを高速に回す方がメリットが大きそうです。今回は Docker + test-kitchen を使って Ansible Role (Playbook) を開発するサイクルを高速化する方法を記したいと思います。

ソフトウェアの構成
----

構成は、私の場合 Mac OSX を使っているので下記のとおりです。

* test-kitchen
* kitchen-ansible (test-kitchen ドライバ)
* kitchen-docker (test-kitchen ドライバ)
* serverspec
* ansible
* docker (Docker-machine)
* VirtualBox

Linux でネイティブな Docker を使っている方は以降、読み替えて下さい。読み替えるのはそれほど難しくないと思います。

ソフトウェアのインストール
----

今回は上記ソフトウェアのインストール方法は省きます。test-kitchen, kitchen-ansible, kitchen-docker, serverspec は Ruby で開発されたソフトウェアなので Gemfile 等で管理、ansible は pip 等でインストールしてください。

環境作成
----

test-kitchen が稼働するように環境を作っていきます。
作業ディレクトリで kitchen コマンドを使って初期設定を行います。今回は試しに nginx のデプロイを実施したいと思います。

```
$ mkdir -p test-kitchen/nginx test-kitchen/roles
$ cd test-kitchen/nginx
$ kitchen init
```

また上記で作成した roles ディレクトリに ansible-galaxy で nginx の role を取得します。

```
$ ansible-galaxy install geerlingguy.nginx -p ../roles/nginx
```

下記の内容を .kitchen.local.yml として保存してください。
Docker ホストの指定、Provisioner として ansible の指定、Platform として 'ubuntu:16.04' の Docker コンテナの指定を行っています。

```
---
driver:
  name: docker
  binary: /usr/local/bin/docker
  socker: tcp://192.168.99.100:2376

provisioner:
  name: ansible_playbook
  playbook: ./site.yml
  roles_path: ../roles
  host_vars_path: ./host_vars
  hosts: kitchen-deploy
  require_ansible_omnibus: false
  ansible_platform: ubuntu
  require_chef_for_busser: true

platforms:
    - name: ubuntu
      driver_config:
        image: ubuntu:16.04
        platform: ubuntu
        require_chef_omnibus: false

suites:
  - name: default
    run_list:
    attributes:
```

ここからは上記 .kitchen.local.yml ファイル内で指定したファイルの準備を行っていきます。

site.yml ファイルの内容を下記のように書いてください。

```
---
- hosts: kitchen-deploy
  sudo: yes
  roles:
    - { role: geerlingguy.nginx, tags: nginx }
```

host_vars/hosts ファイルを作成します。'host_vars' ディレクトリは手動で作成してください。

```
localhost              ansible_connection=local
[kitchen-deploy]
localhost
```

次に serverspec で行うテストの内容を作成します。
serverspec-init コマンドではインタラクティブに回答しますが、SSH ではなく EXEC(Local) を選択することに注意してください。

```
$ mkdir -p test/integration/default/serverspec
$ cd test/integration/default/serverspec
$ serverspec-init             # <--- インタラクティブに回答 : 1) UNIX, 2) EXEC(Local) を選択
$ rm localhost/sample_spec.rb # <--- 必要ないので削除
```

test/integration/default/serverspec/localhost/nginx_spec.rb として下記の内容を試しに書いてみましょう。

```
require 'spec_helper'

describe package('nginx') do
    it { should be_installed }
end

describe service('nginx') do
    it { should be_enabled }
    it { should be_running }
end

describe file('/etc/nginx/nginx.conf') do
    it { should be_file }
end
```

下記のようなファイルとディレクトリ構成になっていることを確認しましょう。

```
.
├── nginx
│   ├── chefignore
│   ├── host_vars
│   │   └── hosts
│   ├── site.yml
│   └── test
│       └── integration
│           └── default
│               ├── Rakefile
│               └── serverspec
│                   ├── localhost
│                   │   └── nginx_spec.rb
│                   └── spec_helper.rb
└── roles
    └── geerlingguy.nginx
        ├── README.md
        <省略>
```

デプロイ・テストを実行する
----

環境作成が完了したの Docker コンテナを起動し Ansible でデプロイ、その後 Serverspec でテストしてみます。

```
$ cd test-kitchen
$ kitchen create  # <--- Docker コンテナ起動
$ kitchen setup   # <--- Ansible デプロイ
$ kitchen verify  # <--- Serverspec テスト
$ kitchen destroy # <--- コンテナ削除
$ kitchen test    # <--- 上の4つのコマンドを一気に実行
```

まとめ
----

Ansible でも test-kitchen を使ってデプロイ・テストが出来ることが分かりました。インスタンスを使ってデプロイ・テストを実施するよりコンテナを使うほうが失敗した際に削除・起動するのも一瞬で終わりますし Ansible 開発が高速化できることも実際に触っていただいてわかっていただけると思います。

ただ上記の手順ではコンテナの中に Ruby, Chef も一緒にインストールされてしまいます。
test-kitchen 的には下記の記述を .kitchen.local.yml の provisioner: の欄に記述すると Chef のインストールは省けるはず (Ruby は Serverspec で用いる) のですが今現在 (2016/7中旬) では NG でした。これが正常に機能するようになるともっと高速にコンテナデプロイが完了すると思うので残念です。

```
require_chef_for_busser: false
require_ruby_for_busser: true
```

