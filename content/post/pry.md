+++
title = "pry のススメ"
date = "2013-03-06"
slug = "2013/03/06/pry"
Categories = ["tools"]
+++
OpenStack をコードで管理するためのフレームワークは幾つか存在するのだけど Ruby
で記述出来る Fog が良い！と隣に座ってるアプリエンジニアが言うので僕も最近少し
触ってます。

Fog を使った OpenStack を管理するコードを書くことも大事なのだけど、Fog のコン
トリビュートってことで幾つかの機能を付け足して (Quantum Router 周り) ってこと
をやってました。まだ取り込まれてないけど。

その開発の中で pry の存在を教えてもらいその便利さに驚いたので少し説明します。
バリバリ開発系の人は既に知っているだろうけど、インフラ系エンジニアの僕にとって
は感激モノでした。

pry は irb 代替な Ruby のインタラクティブシェルです。下記の URL から持ってこれ
ます。

<https://github.com/pry/pry>

シンタックスハイライトされたり json のレスポンスが綺麗に成形されたり irb 的に
使うだけでも便利なのだけど '?' や '$' でコードのシンタックスを確認したりコード
内容を確認したり出来るのがアツい！

ちょうど今回追加した Fog の機能を使って説明していみます。

Fog のコードを require して OpenStack に接続するための情報を設定し OpenStack
Quantum に接続します。これで準備完了。

``` ruby
[38] pry(main)> require '/home/jedipunkz/fog/lib/fog.rb'
[49] pry(main)> @connection_hash = {
[49] pry(main)*   :openstack_username => 'demo',
[49] pry(main)*   :openstack_api_key => 'demo',
[49] pry(main)*   :openstack_tenant => 'service',
[49] pry(main)*   :openstack_auth_url =>
'http://172.16.1.11:5000/v2.0/tokens',
[49] pry(main)*   :provider => 'OpenStack',
[49] pry(main)* }
[50] pry(main)> @quantum = Fog::Network.new(@connection_hash)
``` 

試しに Router 一覧を取得します。list_routers メソッドです。

``` ruby
[54] pry(main)> @quantum.list_routers()
=> #<Excon::Response:0x00000003da3560
 @body=
  "{\"routers\": [{\"status\": \"ACTIVE\", \"external_gateway_info\": {\"network_id\": \"b8ef37a9-9ed1-4b6d-862d-fe9e381a2f2a\"}, \"name\": \"router-admin\", \"admin_state_up\": true, \"tenant_id\": \"5e9544d4823a44d59f3591144049f691\", \"id\": \"35c65e2c-5cd8-4eb5-87a8-c370988c101a\"}]}",
 @data=
  {:body=>
    {"routers"=>
      [{"status"=>"ACTIVE",
        "external_gateway_info"=>
         {"network_id"=>"b8ef37a9-9ed1-4b6d-862d-fe9e381a2f2a"},
        "name"=>"router-admin",
        "admin_state_up"=>true,
        "tenant_id"=>"5e9544d4823a44d59f3591144049f691",
        "id"=>"35c65e2c-5cd8-4eb5-87a8-c370988c101a"}]},
   :headers=>
    {"Content-Type"=>"application/json",
     "Content-Length"=>"259",
     "Date"=>"Wed, 06 Mar 2013 06:53:22 GMT"},
   :status=>200,
   :remote_ip=>"172.16.1.11"},
 @headers=
  {"Content-Type"=>"application/json",
   "Content-Length"=>"259",
   "Date"=>"Wed, 06 Mar 2013 06:53:22 GMT"},
 @remote_ip="172.16.1.11",
 @status=200>
```

綺麗に色付けされてレスポンスがあります。

次に 'cd @quantum' して cd します。そして '? メソッド名' するとメソッドのシン
タックスを確認出来ます。試しに Router を生成する create_router メソッドを見て
みます。

``` ruby
[56] pry(main)> cd @quantum
[59] pry(#<Fog::Network::OpenStack::Real>):1> ? create_router

From: /home/jedipunkz/fog/lib/fog/openstack/requests/network/create_router.rb @ line 6:
Owner: Fog::Network::OpenStack::Real
Visibility: public
Signature: create_router(name, options=?)
Number of lines: 1
```

そして '$ メソッド名' するとコードが確認出来ます。

``` ruby
[64] pry(#<Fog::Network::OpenStack::Real>):1> $ create_router

From: /home/jedipunkz/fog/lib/fog/openstack/requests/network/create_router.rb @ line 6:
Owner: Fog::Network::OpenStack::Real
Visibility: public
Number of lines: 27

def create_router(name, options = {})
  data = {
    'router' => {
      'name' => name,
    }
  }

  vanilla_options = [
    :admin_state_up,
    :tenant_id,
    :network_id,
    :external_gateway_info,
    :status,
    :subnet_id
  ]

  vanilla_options.reject{ |o| options[o].nil? }.each do |key|
    data['router'][key] = options[key]
  end

  request(
    :body     => Fog::JSON.encode(data),
    :expects  => [201],
    :method   => 'POST',
    :path     => 'routers'
  )
end
```

あとは 'puts @quantum' 等するとオブジェクトの内容が確認出来たり、'ls @quantum'
すると @quantum オブジェクトのメソッド一覧が確認出来たり。

開発の効率が上がるなぁと感激。

春なので OpenStack もそろろろ次期リリースの時期。それぞれのコンポーネントの機
能が拡張されているようなので Fog 等のフレームワークにコントリビュートする機会
もますます増えそう。Fog やその他のクラウドフレームワークはなんだかんだ言って
AWS のフューチャがメインなので OpenStack の機能追加に追いついていない感がある。
もし興味持っている人が居たら是非一緒に OpenStack 界隈を盛り上げましょう。

