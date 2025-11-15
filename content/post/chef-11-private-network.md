+++
title = "Chef 11 サーバのローカルネットワーク上構築"
date = "2013-04-06"
slug = "2013/04/06/chef-11-private-network"
Categories = ["infrastructure"]
description = "FQDN ではなく IP アドレスでアクセス可能な Chef 11 サーバのローカルネットワーク構築手順"
+++
chef-solo を使うの？Chef サーバを使うの？という議論は結構前からあるし、答えは
「それぞれの環境次第」だと思うのだが、僕は個人的に Chef サーバを使ってます。ホ
ステッド Chef を使いたいけどお金ないし。会社で導入する時はホステッド Chef を契
約してもらうことを企んでます。(・∀・) 何故なら cookbooks を開発することがエン
ジニアの仕事の本質であって Chef サーバを運用管理することは本質ではないから。そ
れこそクラウド使えという話だと思う。

でも！Chef に慣れるには無料で使いたいし、継続的に Cookbooks をターゲットノード
で実行したい。ということで Chef サーバを構築して使っています。

Chef 10 の時代は Chef サーバの構築方法は下記の通り3つありました。

* 手作業！
* Bootstrap 構築
* Opscode レポジトリの Debian, Ubuntu, CentOS パッケージ構築

それが Chef 11 では

* Ubuntu, RHEL のパッケージ (パッケージインストールですべて環境が揃う)

<http://www.opscode.com/chef/install/>

この方法1つだけ。でも簡単になりました。

'Chef Server' タブを選択するとダウンロード出来る。じっくりは deb ファイルの中
身を見たことがないけど、チラ見した時に chef を deb の中で実行しているように見
えた。徹底してるｗ

Chef 10 時代のパッケージと違って行う操作は下記の2つのコマンドだけ。

    % sudo dpkg -i chef-server_11.0.6-1.ubuntu.12.04_amd64.deb # ダウンロードしたもの
    % sudo chef-server-ctl reconfigure

簡単。でも... この状態だと https://<サーバの FQDN> でサーバが Listen している。
IP アドレスでアクセスしてもリダイレクトされる。つまり、ローカルネットワーク上
に構築することが出来ない。安易に hosts で解決も出来ない。何故ならターゲットノー
ドは通常まっさらな状態なので bootstrap するたびに hosts を書くなんてアホらしい
しやってはいけない。

今日の本題。ローカルネットワーク上に Chef 11 サーバを構築する方法を調べました。

修正箇所
----

* /var/opt/chef-server/chef-pedant/etc/pedant_config.rb

URL を IP アドレスに変更する。

    chef_server "https://chef.example.com"

* /var/opt/chef-server/erchef/etc/app.config

URL を IP アドレスに変更する。

    {s3_url, "https://chef.example.com"},

* /var/opt/chef-server/nginx/etc/nginx.conf

URL を IP アドレスに変更する。2箇所あるので注意。鍵ファイルにも FQDN が記され
ているがそれらは変更しない。

    server_name chef.example.com;

* /etc/chef-server/chef-server-running.json

URL を IP アドレスに変更する。鍵ファイルにも FQDN が記されているがそれらは変更
しない。

    "vip": "chef.example.com",
    "api_fqdn": "chef.example.com",
    "web_ui_fqdn": "chef.example.com",
    "server_name": "chef.example.com",
    "url": "https://chef.example.com",

最後に Chef サーバを再起動する。

    % sudo chef-server-ctl restart

まとめ
----

会社で、この環境を使って色々試しています。今のところ不具合なく動作している。強
引ワザなのでもっと綺麗な方法を知っている方がいましたら教えて下さい。
m ( _ _ ) m

