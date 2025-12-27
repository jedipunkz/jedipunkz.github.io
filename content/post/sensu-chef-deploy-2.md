+++
title = "sensu-chef で監視システム Sensu を管理 #2"
date = "2013-11-27"
Categories = ["infrastructure"]
description = "更新された sensu-chef Cookbook を使った Sensu 監視システムの簡易管理方法"
aliases = [
  "/blog/2013/11/27/sensu-chef-deploy-2",
  "/post/2013/11/27/sensu-chef-deploy-2"
]
+++
こんにちは。<a href="https://twitter.com/jedipunkz">@jedipunkz</a> です。

以前、Sensu を Chef で管理する方法について書きました。

<http://jedipunkz.github.io/post/sensu-chef-controll/>

これは今年(2013)の6月頃の記事ですが、この時はまだ sensu-chef を include して使う別の Chef
Cookbook が必要でした。また Redis 周りの Cookbooks が完成度あまく、またこれも
公式とは別の Cookbooks を改修して再利用する形でした。この作業は結構しんどかっ
た記憶があるのですが、最近 GlideNote さんのブログを読んで( ﾟдﾟ)ﾊｯ!と思い、
sensu-chef を再確認したのですが、だいぶ更新されていました。

下記が sensu-chef です。

<https://github.com/sensu/sensu-chef>

この Chef Cookbook 単体で利用できる形に更新されていて、plugins, checks 等は
Recipe に追記することで対応可能になっていました。早速利用してみたので簡単に使
い方を書いていきます。

下記が Sensu の管理画面です。最終的にこの画面に監視対象のアラートが上がってきます。

{% img /pix/sensu.png %}


使い方
----

sensu-chef を取得する。chef-repo になっています。

``` bash
% git clone https://github.com/sensu/sensu-chef.git ~/chef-repo-sensu
```

bundle にて Gemfile に記述の在る gem パッケージをインストールします。

``` bash
% cd ~/chef-repo-sensu
% bundle install
```

.chef/ 配下の設定は割愛します。chef サーバの情報に合わせて設定します。

ssl 鍵を生成して data bags に投入します。

``` bash
% cd examples/ssl
% ./ssl_certs.sh generate
% cd ../../
% knife data bag create sensu
% knife data bag from file sensu examples/ssl/ssl.json
% ./examples/ssl/ssl_certs.sh clean
```

Roles を作成します。chef-repo なのに何も入っていませんでした...汗
ここで面白いのは 'sensu-client' は sensu で言う subscribers の名前にそのまま利
用されるところです。つまり 'sensu-client' の名前が記された sensu サーバ上の監
視項目 (checks) がこの sensu クライアントに割り当てられます。

``` ruby
% mkdir roles
% ${EDITOR} roles/sensu-server.rb
name "sensu-server"
description "role applied to sensu server."
run_list 'recipe[sensu::default]',
         'recipe[sensu::rabbitmq]',
         'recipe[sensu::redis]',
         'recipe[sensu::server_service]',
         'recipe[sensu::api_service]',
         'recipe[sensu::dashboard_service]',
         'recipe[chef-client::service]'

% ${EDITOR} roles/sensu-client.rb
name "sensu-client"
description "role applied to sensu client."
run_list 'recipe[sensu::default]',
         'recipe[sensu::client_service]',
         'recipe[chef-client::service]'
```

Cheffile に 'chef-client' の Cookbook 名を追記します。

``` ruby
site 'http://community.opscode.com/api/v1'

cookbook 'sensu', path: './'
cookbook 'sensu-test', path: './test/cookbooks/sensu-test'
cookbook 'chef-client' # <---- 追記
```

librarian-chef を実行して Cookbooks を取得します。

``` bash
% librarian-chef install
```

Rabbitmq, Redis, API の IP アドレスを設定します。IP アドレスは例です。

``` bash
% ${EDITOR} cookbooks/sensu/attributes/default.rb
default.sensu.rabbitmq.host = "172.24.19.11"
default.sensu.redis.host = "172.24.19.11"
default.sensu.api.host = "172.24.19.11"
```

sensu-server 用の Recipe に監視項目を追記します。ここでは cron デーモンの稼働
状況を監視してみました。

``` bash
% ${EDITOR} cookbooks/sensu/recipes/server_service.rb # 下記を追記
```
 
``` ruby    
sensu_check "cron_process" do
  command "check-procs.rb -p cron -C 1"
  handlers ["default"]
  subscribers ["sensu-client"]
  interval 30
  additional(:notification => "Cron is not running", :occurrences => 5)
end
```

sensu-client 用の Recipe に client.json (クライアント用設定ファイル) の記述と
上記監視項目に合った plugins 設定の追記を行います。

``` bash
% ${EDITOR} cookbooks/sensu/recipes/client_service.rb # 下記を追記
```

``` ruby
sensu_client node.name do
  address node.ipaddress
  subscriptions node.roles + ["all"]
end

cookbook_file 'check-procs.rb' do
  source 'check-procs.rb'
  mode 0755
  path '/etc/sensu/plugins/check-procs.rb'
end
```

上記 check-procs.rb は community サイトからダウンロードする必要があるのですが
cookbook_file で対応したので files/ ディレクトリ配下に置いておきます。

``` bash
% mkdir -p cookbooks/sensu/files/default
% wget -o cookbooks/sensu/files/default/check-procs.rb \
  https://github.com/sensu/sensu-community-plugins/raw/master/plugins/processes/check-procs.rb
```

上記の check-procs.rb は行頭に '#!/usr/bin/env ruby' が記されているのですが
Sensu インストール時に入る ruby は /opt/sensu/embedded/bin/ruby にあるので行頭
の1行を書き換えます。

``` diff
% diff cookbooks/sensu/files/default/check-procs.rb.org cookbooks/sensu/files/default/check-procs.rb
- #!/usr/bin/env ruby
+ #!/opt/sensu/embedded/bin/ruby
```

Roles, Cookbooks を Chef サーバにアップロードします。

``` bash
% knife cookbook upload -o ./cookbooks -a
% knife role from file roles/*.rb
```

いよいよブートストラップします!

まずは sensu-server を。

``` bash
% knife bootstrap <server_ip_addr> -N sensu-server -r 'role[sensu-server]' \
  -x ubuntu --sudo
```

次に監視対象である sensu-client を。

``` bash
% knife bootstrap <client_ip_addr> -N sensu-client01 -r 'role[sensu-client]' \
  -x ubuntu --sudo
```

http://<sensu-server の IP アドレス>:8080/ にアクセスすると Sensu の管理画面が
表示されます。認証アカウントは cookbooks/sensu/attributes/default.rb に記述が
ありますので確認して下さい。


まとめ
----

インフラリソースのフルオートメーション化について情報リサーチしていますが監視も
重要なインフラリソースの一部です。Sensu サーバ・クライアントの自動デプロイが出
来たのでこれで一つパーツが揃ったことに。Sensu は API を持っていますのでアプリ
から検知することも簡単に出来ますよ。API については下記を参照してください。

<http://sensuapp.org/docs/0.12/api>

また以前抱えていた問題もスッキリクリアになって、これでまた前進できた感があります。

参考サイト
----

* <http://sensuapp.org/docs/0.12>
* <http://blog.glidenote.com/blog/2013/11/26/sensu/>
* <https://github.com/sensu/sensu-chef>
