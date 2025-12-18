+++
title = "クラウドライブラリ Fog で AWS を操作！..のサンプル"
date = "2014-05-29"
Categories = ["infrastructure"]
description = "Ruby クラウドライブラリ Fog を使った AWS EC2 と ELB 操作のサンプルコード集"
aliases = [
  "/blog/2014/05/29/fog-aws-ec2-elb",
  "/post/2014/05/29/fog-aws-ec2-elb"
]
+++
こんにちは。<a href="https://twitter.com/jedipunkz">@jedipunkz</a> です。

最近 OpenStack でサービスを開発！.. じゃなくて AWS でプロトタイプサービス作っ
ているのですが、Ruby で開発したかったので Fog を使っています。EC2 と ELB の
API を叩くコードになりつつあるのですが、サンプルコードって世の中に中々無いと気
がついたので、このブログ記事にサンプルコードを載せたいと思います。

Fog とは ?
----

Fog <http://fog.io/> はクラウドライブラリソフトウェアです。AWS, Rackspace,
CloudStack, OpenStack .. と数ある世の中のクラウドプラットフォームを扱うために
用意されたソフトウェアです。対応しているプラットフォームの種別は下記を見ると参
考になります。

<http://fog.io/about/provider_documentation.html>

ドキュメントがまだまだ揃っていなく、Fog のコードを覗きながら実装するしかない状
況です。なので「こう使えば良い！」というお手本があまりネット上にも無い気がしま
す。

ドキュメントは一応下記にあります。
が使い方がよくわからない・・！(´；ω；｀)ﾌﾞﾜｯ

<http://rubydoc.info/gems/fog/frames/index>

EC2 インスタンスを使ってみる
----

まずは AWS EC2 の API を叩いて t1.micro インスタンスを立ち上げてみましょう。

```ruby
require 'fog'

compute = Fog::Compute.new({
  :provider => 'AWS',
  :aws_access_key_id => '....',
  :aws_secret_access_key => '....',
  :region => 'ap-northeast-1'
})

server = compute.servers.create(
  :image_id => 'ami-cedaa2bc',
  :flavor_id => 't1.micro',
  :key_name => 'test_key',
  :tags => {'Name' => 'test'},
  :groups => 'ssh-secgroup'
)

server.wait_for { print "."; ready? }

puts "created instance name :", server.dns_name
```

#### 解説

* compute = ... とあるところで接続情報を記しています。

"ACCESS_KEY_ID" や "SECRET_ACCESS_KEY" はみなさん接続する時にお持ちですよね。それ
とリージョン名やプロバイダ名 (ここでは AWS) を記して AWS の API に接続します。

* server = ... とあるところで実際にインスタンスを作成しています。

ここではインスタンス生成に必要な情報を盛り込んでいます。Flavor 名や AMI イメー
ジ名・SSH 鍵の名前・セキュリティグループ名等です。

便利なメソッド
----

server = ... でインスタンスを生成すると便利なメソッドを扱って情報を読み込むこ
とが出来ます。

```ruby
server.dns_name # => public な DNS 名を取得
server.private_dns_name # => private な DNS 名を取得
server.id # => インスタンス ID を取得
server.availability_zone # => Availability Zone を取得
server.public_ip_address # => public な IP アドレスを取得
server.private_ip_address # => private な IP アドレスを取得
```
これは便利...

モジュール化して利用
+++

毎回コードの中でこれらの接続情報を書くのはしんどいので、Ruby のモジュールを作
りましょう。

```ruby
module AWSCompute
  def self.connect()
    conn = Fog::Compute.new({
      :provider => 'AWS',
      :aws_access_key_id => '...',
      :aws_secret_access_key => '...',
      :region => '...'
    })
    begin
      yield conn
    ensure
      # conn.close
    end
  rescue Errno::ECONNREFUSED
  end
end
```

こう書いておくと例えば...

#### インスタンスのターミネイト

```ruby
AWSCompute.connect() do |sock|
  server = sock.servers.get(instance_id)
  server.destroy
  return server.id
end
```

#### インスタンスの起動

```ruby
AWSCompute.connect() do |sock|
  server = sock.servers.get(instance_id)
  server.start
  return server.id
end
```

#### インスタンスの停止

```ruby
AWSCompute.connect() do |sock|
  server = sock.servers.get(instance_id)
  server.stop
  return server.id
end
```

等と出来ます。

ELB (Elastic LoadBalancer) を使ってみる
----

同様に ELB を扱うコードのサンプルも載せておきます。同じくモジュール化して書くと

```ruby
module AWSELB
  def self.connect()
    conn = Fog::AWS::ELB.new(
      :aws_access_key_id => '...',
      :aws_secret_access_key => '...',
      :region => '...',
    )
    begin
      yield conn
    ensure
      # conn.close
    end
  rescue Errno::ECONNREFUSED
  end
end
```

としておいて...

#### ELB の新規作成

下記のコードで ELB を新規作成出来ます。

```ruby
AWSELB.connect() do |sock|
  availability_zone = '...'
  elb_name = '...'
  listeners = [{ "Protocol" => "HTTP", "LoadBalancerPort" => 80, "InstancePort" => 80, "InstanceProtocol" => "HTTP" }]
  result = sock.create_load_balancer(availability_zone, elb_name, listeners)
  p result
end
```

この状態では ELB に対してインスタンスが紐付けられていないので使えません。下記の操作で
インスタンスを紐付けてみましょう。

```ruby
AWSELB.connect() do |sock|
  insntance_id = '...'
  elb_name = '...'
  result = sock.register_instances_with_load_balancer(instance_id, elbname)
  p result
end
```

insntance_id には紐付けたいインスタンスの ID を、elb_name には先ほど作成した ELB の名前を
入力します。 この操作を繰り返せば AWS 上にクラスタが構成出来ます。

逆にクラスタからインスタンスの削除したい場合は下記の通り実行します。

```ruby
AWSELB.connect() do |sock|
  result = sock.deregister_instances_from_load_balancer(instance_id, elbname)
  p result
end
```

まとめ
----

今回は Fog を紹介しましたが Python 使いの方には libcloud をおすすめします。

<https://libcloud.apache.org/>

Apache ファウンデーションが管理しているクラウドライブラリです。こちらも複数の
クラウドプラットフォームに対応しているようです。

Fog で OpenStack も操作したことがあるのですが、AWS 用のコードの方が完成度が高
いのか、戻り値などが綺麗に整形されていて扱いやすかったり、メソッドも豊富に用意
されていたりという印象でした。これは... OpenStack 用の Fog コードにコントリビュー
トするチャンス・・！

皆さんもサンプルコードお持ちでしたら、ブログ等で公開していきましょうー。
ではでは。
