+++
title = "Chef で自律的クラスタを考える"
date = "2013-12-09"
slug = "2013/12/09/chef-autonoumous-cluster"
Categories = ["infrastructure"]
description = "Chef の Search 機能を使った自律的な nginx ロードバランサクラスタの構築方法"
+++
こんにちは。<a href="https://twitter.com/jedipunkz">@jedipunkz</a> です。

Serf の登場があったり、ここ最近オーケストレーションについて考える人が増えた気
がします。システムをデプロイしてその後各ノード間の連結だったりも同じ Chef,
Puppet 等のコンフィギュレーションツールで行うのか？全く別のツールで？..

最近 Serf というツールの登場がありました。

僕も Serf を触ってつい先日ブログに書きました。有用なツールだと思います。シ
ンプルだからこそ応用が効きますし、リアルタイム性もあり、将来的に異なるネットワー
クセグメント上のノードとも連結出来るようになりそうですし、とても期待です。

話が少し飛びますが..

いつも Rebuild.fm を楽しく聞いているのですが Immutable Infrastructure の話題の
時にオーケストレーションの話題になって、どうも 'Chef でも自律的なクラスタを組
むことが認知されていないのでは？' と思うようになりました。もちろん Chef でやる
べき！とは言い切りませんし、今後どうなるかわかりません。Opscode の中の人も 'オー
ケストレーションは自分でやってね' というスタンスだったとずいぶん前ですが聞きま
した。Serf を等のオーケストレーションツールを使う使わないの話は今回はしないの
ですが Chef でも自律的クラスタを組むことは出来ますよ〜というのが今回の話題。

まえがきが長くなりました。

今回は Chef で自律的クラスタを構成する方法を記したいと思います。

haproxy 等を利用すれば尚良いと思いますが、よりクラスタを組むのが簡単な nginx
を今回は利用したいと思います。

<https://github.com/opscode-cookbooks/nginx>

構成
----

'web' という Role 名と 'lb' という Role 名で単純な HTTP サーバとしての nginx
ノードを複数台と、ロードバランサとしての nginx ノードを1台でクラスタを構成しま
す。また共に environment 名は同じものを利用します。別の environment 名の場合は
別クラスタという区切りです。

* 'lb' node x 1 + 'web' node x n ('foo' environment)
* 'lb' node x 1 + 'web' node x n ('bar' environment)

'lb' nginx ロードバランサのレシピ
----

下記が 'lb' Role の recipes/cmomnos_conf.rb の修正した内容です。

``` ruby
environment = node.chef_environment
webservers = search(:node, "role:web AND chef_environment:#{environment}")
 
template "#{node['nginx']['dir']}/sites-available/default" do
  source "default-site.erb"
  owner "root"
  group "root"
  mode 00644
  notifies :reload, 'service[nginx]'
    variables ({
      :webservers => webservers
    })
end
```

何をやっているかと言うと、environment という変数に自ノードの environment 名を。
webservers という変数に role 名が 'web' で尚且つ自ノードと同じ environment 名
が付いたノード名を入れています。これで自分と同じ environment に所属している
'web' Role なノードを Chef サーバに対して検索しています。また、template 内で
webservers という変数をそのまま利用できるように variables で渡しています。

'lb' nginx ロードバランサのテンプレート
----

下記が webservers 変数を受け取った後の template 内の処理です。

``` ruby
<% if @webservers and ( @webservers != [] ) %>
upstream backend {
<% @webservers.each do |hostname| -%>
  server <%= hostname['ipaddr'] -%>;
<% end -%>
}
<% end %>
  
server {
  listen   80;
  server_name  <%= node['hostname'] %>;
    
  access_log  <%= node['nginx']['log_dir'] %>/localhost.access.log;
    
  location / {
    <% if @webservers and ( @webservers != [] ) %>
    proxy_pass http://backend;
    <% else %>
    root   /var/www/nginx-default;
    index  index.html index.htm;
    <% end %>
  }
}
```

upstream backend { ... は皆さん見慣れた記述だと思うのですが、バックエンドの
HTTP サーバの IP アドレスを一覧化します。each で回しているので台数分だけ
server <ip_addr>; の記述が入ります。

chef-client をデーモン稼働しておけば、新規に Chef サーバに登録された 'web'
Role の HTTP サーバを自動で 'lb' Role のロードバランサが組み込む、つまり自律的
なクラスタが組めることになります。もちろんこの間の手作業は一切ありません。

ちなみに chef-client をデーモン稼働するには

    recipe[chef-client::service]
    
というレシピをノードに割り当てることで可能です。

まとめ
----

Chef でも自律的なクラスタが組めました。もちろん chef-client の稼働間隔があるの
でリアルタイム性はありません。chef-client の稼働間隔は 'chef-client' レシピの
attributes で調整出来ます。その点は serf のほうが確実に勝っていると見るべきで
しょう。冒頭に記したようにこの辺りの操作を Chef で行うのか別のツールを使うのか
はまだまだ模索が必要そう。ただ、私がいつも使っている 'OpenStack を Chef で構成
する Cookbooks' 等は複数台構成を Chef で構成しています。なので僕にとってはこの
辺りの話は当たり前だと思っていたのだけど、どうも勉強会に出たりすると "Chef は
複数台構成を作るのが苦手だ" って話があがってくるので気になっていました。
