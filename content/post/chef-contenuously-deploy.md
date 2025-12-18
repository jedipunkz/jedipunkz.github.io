+++
title = "chef-client の継続的デリバリ"
date = "2013-03-15"
Categories = ["infrastructure"]
description = "Chef10 から Chef11 への移行手順と knife bootstrap による chef-client の継続的アップデート方法"
aliases = [
  "/blog/2013/03/15/chef-contenuously-deploy",
  "/post/2013/03/15/chef-contenuously-deploy"
]
+++
こんにちは。<a href="https://twitter.com/jedipunkz">@jedipunkz</a> です。

久々に Chef の話題。

有名な方々が最近 Chef について記事書いたりで Chef が再び盛り上がってきましたね。
僕のブログにも chef-solo で検索してアクセスしてくる方が増えているようです。

ちょうど今、仕事で試験的なサービスを立ち上げてそこで Chef を使っているのですが Server,
Workstation, Target Node(s) の構成で使っていて、僕らは最初から chef-solo と
capistrano でってことは考えていませんでした。もちろん chef-solo + capistrano
の環境も調査しましたが、今の Server 構成が便利なのでもう戻れない。

今日は Chef サーバ構成の良さについての記事ではないですが、それについては次回、
時間見つけて書こうかと思ってます。

今日は 'chef-client をどうアップデートするか' について。せっかく Chef
でサーバ構成を継続的にデプロイ出来ても Chef 自身をアップデート出来ないと悲しい
ですよね。chef-client が稼働しているインスタンスなんて起動して利用してすぐに破
棄だって時代ですが、なかなかそうもいなかい気がしています。

「ほら、だから chef-solo 使えばいいんだよ！」って思ってるあなた！違うんですよー。
そのデメリットを上回るメリットが Chef サーバ構成にあるんです。次回書きますｗ

Chef10 から Chef11 と試験してみるにはちょうど良い時期でした。今回の構成は...

旧環境
----

    +------------------+
    |   chef server    |
    |  version 10.18   |
    +------------------+
    ^
    |
    +--------------------+
    |                    |
    |                    |
    +------------------+ +------------------+
    | chef workstation | |   target node    |
    |  version 10.24   | |  version 10.24   |
    +------------------+ +------------------+

* chef server は apt.opscode.com レポジトリを利用した Chef 10.18 なもの
* chef workstaion は version 10.24 (2013年3月15日現在 10.x 系最新)
* target node は chef workstaion から knife bootstrap を行い構成

knife bootstrap の際に下記のオプションを指定します。

    % knife bootstrap -N vmtest01 -r 'role[base]' \ -i -x root -d chef-full

distro は chef-full を選択。chef-full については下記にコードがあります。

<https://github.com/opscode/chef/blob/master/lib/chef/knife/bootstrap/chef-full.erb>

コードを抜粋すると、omnibus インストーラをダンロードして実行しているのがわかり
ます。つまり Chef11 環境で再度 knife bootstrap すれば新しい Chef がインストー
ルされるはず。

``` bash
install_sh="http://opscode.com/chef/install.sh"
version_string="-v <%= chef_version %>"

if ! exists /usr/bin/chef-client; then
  if exists wget; then
    bash <(wget <%= "--proxy=on " if knife_config[:bootstrap_proxy] %> ${install_sh} -O -) ${version_string}
  elif exists curl; then
    bash <(curl -L <%= "--proxy \"#{knife_config[:bootstrap_proxy]}\" " if knife_config[:bootstrap_proxy] %> ${install_sh}) ${version_string}
  else
    echo "Neither wget nor curl found. Please install one and try again." >&2
    exit 1
  fi
fi
```

このように Chef10 で運用している状態を Chef11 に移行します。新しい環境は...

新環境
----

    +------------------+ +------------------+
    |   chef server    | |   chef server    |
    |  version 10.18   | |  version 11.0.6  |
    +------------------+ +------------------+
                         ^
                         |
    +--------------------+
    |                    |
    |                    |
    +------------------+ +------------------+
    | chef workstation | |   target node    |
    |  version 11.4    | |  version 11.4    |
    +------------------+ +------------------+

* chef server は omnibus インストールから構築
* chef workstation は version 11.4 (2013年3月15日現在最新)

移行手順
----

#### Chef11 サーバを用意する

Omnibus インストーラでコマンド3つ打つだけで Chef サーバは構築出来ます。Chef11
からはこの方法が推奨されているようです。bootstrap を使った方法より簡単ですし。

    % wget https://opscode-omnitruck-release.s3.amazonaws.com/ubuntu/12.04/x86_64/chef-server_11.0.6-1.ubuntu.12.04_amd64.deb
    % sudo dpkg -i chef-server_11.0.6-1.ubuntu.12.04_amd64.deb
    % sudo chef-server-ctl reconfigure

#### Chef11 Workstation を用意する

詳細は割愛します。chef10 と同じです。手順としては

* chef10 の chef-repo をコピー
* pem ファイル群を chef11 server からコピー
* knife configure -i にて knife.rb の生成
* cookbooks, roles, data_bags, environments 等を chef11 にアップロード。若干修正が必要な場合がある。

です。

#### Target Node における旧 chef-client の停止と削除

稼働している Chef10 の chef-client を停止し削除、そして pem ファイル達を退避し
てあげます。ここでは ssh で消す例を書きますが、これこそ Cookbook を書いて実行
すれば良いと思います。

    % ssh -i <ssh_secret_key> -l root <ip_address> \
    'service chef-client stop; apt-get -y remove chef; mv /etc/chef /etc/chef.old'

#### 再 knife bootstrap 実行

Chef11 の Workstation から knife bootstrap を実行します。これによって Target
Node に Chef11 の環境がインストールされ Chef11 Server と接続出来ます。

    % knife bootstrap <ip_address> -N vmtest01 -r 'role[base]' -i <ssh_secret_key> \
    -x root -d chef-full

role[base] 中の run_list に'chef-client::service' を追加すると chef-client が
常時稼動してくれて定期的に Chef Server と接続、更新してくれます。

まとめと考察
----

chef-client の更新は簡単に出来た！

今回はデフォルトの distro 'chef-full' の例で書いたのだけど、distro には他にも
下記がある。

<https://github.com/opscode/chef/tree/master/lib/chef/knife/bootstrap>

Linux のディストリビューション名がついた distro は ruby をパッケージで, Chef
を gem でインストールしている。下記は distro 'ubuntu12.04-gems' のコードの抜粋
です。

``` bash
if [ ! -f /usr/bin/chef-client ]; then
  aptitude update
  aptitude install -y ruby ruby1.8-dev build-essential wget libruby1.8 rubygems
fi
  
gem update --no-rdoc --no-ri
gem install ohai --no-rdoc --no-ri --verbose
gem install chef --no-rdoc --no-ri --verbose <%= bootstrap_version_string %>
```

ruby はディストリビューションが用意しているパッケージを。Chef は
bootstrap_version_string を指定し gem でインストールしている。

つまり 'ubuntu12.04-gems' でも chef-client の更新は出来る。ちなみに試してみま
した。chef-client の停止・削除を下記の通り行うと、全く同じ knife bootstrap コ
マンドで chef-client のアップデートが行えた。

    % ssh -i <ssh_secret_key> -l root <ip_address> 'service chef-client stop; mv \
    /usr/local/bin/chef-client /usr/local/bin/chef-client.old; mv /etc/chef /etc/chef.old'

以上です。

なんか簡単なこと書くのに長くなっちゃったけど...。運用を僕らはまだ出来ていない
のだけど、その時のことを考えると今回の試験はしてみたかったし、いい結果が出てよ
かった。Chef がメジャーバージョンアップされて Chef Server の構成が大きく代わっ
ても対応した cookbook, role, .. があればスムースに移行出来る。

Chef 無しにはインフラエンジニアやってられない時代が来たって感じｗ Chef 周りた
のしー！

追伸: 今回の方法より良いベストプラクティス的な方法があれば教えて下さい。
