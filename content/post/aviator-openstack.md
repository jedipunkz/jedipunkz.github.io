+++
title = "Aviator でモダンに OpenStack を操作する"
date = "2014-12-13"
slug = "2014/12/13/aviator-openstack"
Categories = ["infrastructure", "tools"]
+++
こんにちは。@jedipunkz です。

自分は Ruby を普段使うのでいつも Fog というライブラリを使って OpenStack, AWS
を操作していました。Fog を使うとクラウドの操作が Ruby のネイティブコードで行え
るのでシステムコマンド打つよりミス無く済みます。

Fog より後発で Aviator というライブラリが登場してきたので少し使ってみたのです
がまだ未完成なところがあるものの便利な点もあって今後に期待だったので紹介します。

認証情報を yaml ファイルに記す
----

接続に必要な認証情報を yaml ファイルで記述します。名前を 'aviator.yml' として
保存。この時に下記のように環境毎に認証情報を別けて書くことができます。こうする
ことでコードの中で開発用・サービス用等と使い分けられます。

```yaml
production:
  provider: openstack
  auth_service:
    name: identity
    host_uri: <Auth URL>
    request: create_token
    validator: list_tenants
  auth_credentials:
    username: <User Name>
    password: <Password>
    tenant_name: <Tenant Name>

development:
  provider: openstack
  auth_service:
    name: identity
    host_uri: <Auth URL>
    request: create_token
    validator: list_tenants
  auth_credentials:
    username: <User Name>
    password: <Password>
    tenant_name: <Tenant Name>
```

シンタックス確認
+++

次に aviator のシンタックスを確認します。Fog に無い機能で、コマンドラインでシ
ンタックスを確認できてしかも指定可能はパラメータと必須なパラメータと共にサンプ
ルコードまで提供してくれます。公式サイトに'サーバ作成'のメソッドが掲載されてい
るので、ここでは仮想ディスクを作るシンタックスを確認してみます。

```bash
% gem install aviator
% aviator describe openstack volume # <-- 利用可能な機能を確認
Available requests for openstack volume_service:
v1 public list_volume_types
v1 public list_volumes
v1 public delete_volume
v1 public create_volume
v1 public get_volume
v1 public update_volume
  v1 public root
% aviator describe openstack volume v1 public create_volume # <-- シンタックスを確認
:Request => create_volume

Parameters:
 +---------------------+-----------+
 | NAME                | REQUIRED? |
 +---------------------+-----------+
 | availability_zone   |     N     |
 | display_description |     Y     |
 | display_name        |     Y     |
 | metadata            |     N     |
 | size                |     Y     |
 | snapshot_id         |     N     |
 | volume_type         |     N     |
 +---------------------+-----------+

Sample Code:
  session.volume_service.request(:create_volume) do |params|
    params.volume_type = value
    params.availability_zone = value
    params.snapshot_id = value
    params.metadata = value
    params.display_name = value
    params.display_description = value
    params.size = value
  end
```

このように create_volume というメソッドが用意されていて、指定出来るパラメータ・
必須なパラメータが確認できます。必須なモノには "Y" が REQUIRED に付いています。
またサンプルコードが出力されるので、めちゃ便利です。

では create_volume のシンタックスがわかったので、コードを書いてみましょう。

コードを書いてみる
+++

```ruby
#!/usr/bin/env ruby

require 'aviator'
require 'json'

volume_session = Aviator::Session.new(
              :config_file => '/home/thirai/aviator/aviator.yml',
              :environment => :production,
              :log_file    => '/home/thirai/aviator/aviator.log'
            )

volume_session.authenticate

volume_session.volume_service.request(:create_volume) do |params|
  params.display_description = 'testvol'
  params.display_name = 'testvol01'
  params.size = 1
end
puts volume_session.volume_service.request(:list_volumes).body
```

6行目で先ほど作成した認証情報ファイル aviator.yml とログ出力ファイル
aviator.log を指定します。12行目で実際に OpenStack にログインしています。

14-18行目はサンプルコードそのままです。必須パラメータの display_description,
display_name, size のみを指定し仮想ディスクを作成しました。最後の puts ... は
実際に作成した仮想ディスク一覧を出力しています。

結果は下記のとおりです。

```json
{ volumes: [{ status: 'available', display_name: 'testvol01', attachments: [],
availability_zone: 'az3', bootable: 'false', created_at:
description = 'testvol', volume_type:
'standard', snapshot_id: nil, source_volid: nil, metadata:  }, id:
'3a5f616e-a732-4442-a419-10369111bd4c', size: 1 }] }
```

まとめ
+++

サンプルコードやパラメータ一覧等がひと目でわかる aviator はとても便利です。ま
だ利用できるクラウドプラットフォームが OpenStack しかないのと、Neutron の機能
がスッポリ抜けているので、まだ利用するには早いかもです...。逆に言えばコントリ
ビューションするチャンスなので、もし気になった方がいたら開発に参加してみるのも
いいかもしれません。
