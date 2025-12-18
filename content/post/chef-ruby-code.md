+++
title = "Chef を Ruby コード内で利用する"
date = "2013-06-12"
Categories = ["infrastructure"]
description = "Ruby コード内で Chef のライブラリを利用して data bags や nodes を操作するサンプルコード集"
aliases = [
  "/blog/2013/06/12/chef-ruby-code",
  "/post/2013/06/12/chef-ruby-code"
]
+++
こんにちは。<a href="https://twitter.com/jedipunkz">@jedipunkz</a> です。

require 'chef' して Ruby コードの中で chef を利用したいと思って色々調べていた
のですが、そもそもリファレンスが無くサンプルコードもごくわずかしかネット上に見
つけられない状態でした。結局ソースコードを読んで理解していく世界なわけですが、
サンプルコードが幾つかあると他の人に役立つかなぁと思い、ブログに載せていこうか
なぁと。

まず Chef サーバへアクセスするためには下記の情報が必要です。

* ユーザ名
* ユーザ用のクライアント鍵
* Chef サーバの URL

これらは Chef::Config で記していきます。

では早速サンプルコードです。まずは data bags 内データの一覧を取得するコードで
す。data bags 内のデータを全で取得し配列で表示します。

``` ruby
#!/usr/bin/env ruby

require 'rubygems'
require 'chef/rest'
require 'chef/search/query'

Chef::Config[:node_name]='user01'
Chef::Config[:client_key]='/home/user01/user01.pem'
Chef::Config[:chef_server_url]="https://10.200.9.22"

Chef::DataBag::list.each do |bag_name, url|
  Chef::DataBag::load(bag_name).each do |item_name, url|
    item = Chef::DataBagItem.load(bag_name, item_name).to_hash
    puts item
  end
end
```

次は data bags にデータを入力するコードです。json_data という JSON 形式のデー
タを test_data という data bag に放り込んでいます。

``` ruby
#!/usr/bin/env ruby

require 'rubygems'
require 'chef/rest'
require 'chef/search/query'

Chef::Config[:node_name]='user01'
Chef::Config[:client_key]='/home/user01/user01.pem'
Chef::Config[:chef_server_url]="https://10.0.0.10"

json_data = {
  "id" => "test",
  "command" => "echo test"
}

databag_item = Chef::DataBagItem.new
databag_item.data_bag('test_data')
databag_item.raw_data = proc_nginx
databag_item.save
```

次は nodes 一覧の取得です。

``` ruby
#!/usr/bin/env ruby

require 'rubygems'
require 'chef/rest'
require 'chef/search/query'


Chef::Config[:node_name]='user01'
Chef::Config[:client_key]='/home/user01/user01.pem'
Chef::Config[:chef_server_url]="https://10.0.0.10"

Chef::Node.list.each do |node|
  puts node
end
```

次は bootstrap するコード。

``` ruby
#!/usr/bin/env ruby
require 'rubygems'
require "chef"
require "chef/knife/core/bootstrap_context"
require 'chef/knife'
require 'chef/knife/ssh'
require 'net/ssh'
require 'net/ssh/multi'
require 'chef/knife/bootstrap'


Chef::Config[:node_name]='user01'
Chef::Config[:client_key]='/home/user01/user01.pem'
Chef::Config[:validation_key]='/home/user01/chef-validator.pem'
Chef::Config[:chef_server_url]="https://10.0.0.10"

kb = Chef::Knife::Bootstrap.new
kb.name_args = ["sensu-client04.deathstar.jp", "10.0.0.20"]
kb.config[:ssh_user] = "root"
kb.config[:identity_file] = "~/novakey01"
kb.config[:ssh_port] = "22"
kb.config[:run_list ] = "role[sensu-client]"
kb.config[:template_file] = "/home/thirai/chef-full.erb"
kb.run
```

以上です。他のサンプルもこれから探していこうかと思ってます。knife のソース見る
のが一番はやいかなぁと。もしくは Chef のテストコード見るか。皆さんもご存知であ
れば共有してくださーい。
