+++
title = "Sensu 監視システムを Chef で制御"
date = "2013-06-20"
slug = "2013/06/20/sensu-chef-controll"
Categories = ["infrastructure"]
+++
こんにちは。<a href="https://twitter.com/jedipunkz">@jedipunkz</a> です。

自動化の基盤を導入するために色々調べているのですが、監視も自動化しなくちゃ！と
いうことで Sensu を調べてたのですが Chef との相性バッチリな感じで、自分的にイ
ケてるなと思いました。

* 公式サイト <http://www.sonian.com/cloud-monitoring-sensu/>
* ドキュメント <http://docs.sensuapp.org/0.9/index.html>

開発元が予め Chef の Cookbook (正確にはラッパー Cookbook 開発のための
Cookbook で Include して使う) を用意してくれていたり、インストールを容易にする
ための Omnibus 形式のパッケージの提供だったり。Omnibus なのでインストールと共
に Sensu が推奨する Ruby 一式も一緒にインストールされます。Chef と同じですね。

今回紹介したいのは、Chef で Sensu を構築・制御する方法です。

```
+--------------+ +--------------+
| chef-server  | | workstation  |
+--------------+ +--------------+
       |                |
       +----------------+ 
       |
+--------------+
| sensu-server |
+--------------+
       |
       +----------------+----------------+----------------+
       |                |                |                |
+--------------+ +--------------+ +--------------+ +--------------+
| sensu-client | | sensu-client | | sensu-client | | sensu-client | ..>
+--------------+ +--------------+ +--------------+ +--------------+
| service node | | service node | | service node | | service node |
+--------------+ +--------------+ +--------------+ +--------------+
```

この構成の処理の流れとしては...

#### sensu-server, sensu-client の構築の流れ

* 1. workstation から cookbook, role, data_bag を chef-server へアップ
* 2. workstation から sensu-server を bootstrap で構築
* 3. workstation から sensu-client を boostrrap で構築

#### 監視項目の追加・無効化の流れ

* 4. workstation から監視項目 data bag の chef-server へのアップ
* 5. sensu-server 上の chef-client が chef-server から data bag の取得
* 6. sensu-server に新たな(削除された)監視項目が追加
* 7. sensu-client が新たな(削除された)監視項目を検知し、監視開始

つまり... 運用で必要な操作 (監視対象の追加・監視項目の追加・無効化)を
workstation から knife を使って全て行えるっていうことです。しかも Chef も Sensu
も API を持っているので自動化を形成するプログラムの開発も容易です。実際に API
を叩くちょっとしたダッシュボードを Ruby on Rails で作ってみましたが簡単に出来
ました。

今回はこの構成の構築と操作方法について書いていきます。予め私のほうで作っておい
た sensu のための chef-repo を使って環境を作っていきます。

<https://github.com/jedipunkz/sensu-chef-repo>

この chef-repo には

* Berksfile
* サンプルの監視項目 data bag
* SSL 鍵生成の仕組み (後に data bag に収める)

のみが入っています。公式の sensu-chef レポジトリ内にあったサンプルを利用して作っ
ています。また、Berksfile 内で、これまた

* chef-redis (redis の cookbook)
* sensu-chef (公式の sensu cookbook, ラッパー cookbook 内で用いる)
* chef-monitor (ラッパー cookbook の例)

を取得するようにしています。それぞれ fork して私のレポジトリに置いています。動
く状態を保ちたかったためです。redis に関しては結構手を加えました。そのままでは
全く構築出来ない状態でしたので。chef-monitor は内部で sensu-chef (公式
cookbook) を Include しているラッパー cookbook です。公式 cookbook 内で例とし
て挙げられていたモノです。こちらは手を加えていません。

では手順を...

(chef 環境の構築方法は割愛します)

sensu-server のデプロイ
----

sensu-chef-repo の取得を行います。ここからの操作は全て上図の workstation 上で
の操作になります。

``` bash
% git clone https://github.com/jedipunkz/sensu-chef-repo
```

SSL 鍵ペアを生成し data bag に投入します。

``` bash
% cd ~/sensu-chef-repo/data_bags/ssl
% ./ssl_certs.sh generate
% knife data bag create sensu
% knife data bag from file sensu ./ssl.json
```

サンプル監視項目 proc_cron.json を data bags に投入します。

``` bash
% cd ~/sensu-chef-repo/
% knife data bag create sensu_checks
% knife data bag from file sensu_checks data_bags/sensu_checks/proc_cron.json
```

proc_cron.json の内容は下記の通り

``` json
{
  "id": "proc_cron",
  "command": "check-procs.rb -p cron -C 1",
  "subscribers": [
    "sensu-client"
  ],
  "interval": 10
}
```

json の構成を説明すると..

* id : 監視項目名
* command : agent が実行するコマンド
* subscribers : 監視対象のグループ名, chef role 名が自動で監視対象に割り当てられる
* interval : 監視間隔 (秒)

となります。

Berkshelf を使って cookbook の取得を行います。

``` bash
% gem install berksfile --no-ri --no-rdoc
% berks install --path ./cookbooks/
```

roles を chef server へアップロードします。

``` bash
% knife role from file roles/sensu-client.rb # 後の sensu-client デプロイのためついでに準備します
% knife role from file roles/sensu-server.rb
```

"master_address" を sensu-server の IP アドレスに書き換えます。書き換える箇所
は 'monitor' cookbook の attributes です。

``` bash
% ${EDITOR} cookbooks/monitor/attributes/default.rb
default["monitor"]["master_address"] = "XXX.XXX.XXX.XXX"
```

cookbooks を chef server へアップロードします。

``` bash
workstation% knife cookbook upload -a
```

sensu-server を knife を用いてブートストラップします。

``` bash
% knife bootstrap <server-ip> -N <server-name> -r 'role[sensu-server]' -x root -i <secret-key>
```

sensu ダッシュボード URL : http://<server-ip>:8080 にアクセスし動作確認, アカ
ウント情報は下記の attributes に記載してあります。

```
cookbooks/sensu/attributes/default.rb
```

sensu-client デプロイ方法
----

knife を用いて sensu-client をデプロイします。

``` bash
% knife bootstrap <client-ip> -N <client-name> -r 'role[sensu-client]' -x root -i <secret-key>
```

この状態で先ほどの 'proc_cron' が監視開始されます。

監視項目の追加方法
----

下記のような json ファイルを生成します。ここでは例として nginx のプロセス監視
のための項目を追加してみます。

``` bash
% ${EDITOR} data_bags/sensu_checks/proc_nginx.json
```

``` json
{
  "id": "proc_nginx",
  "command": "check-procs.rb -p nginx -w 5 -c 10",
  "subscribers": [
    "sensu-client"
  ],
  "interval": 10
}
```

先ほども書きましたが subscribers は chef 的な role 名と一致しています。なので
sensu の監視をグルーピングしたいときは role 名を変えて knife bootstrap すると
良いと思います。ここでは例として 'sensu-client' という先ほど利用した role 名を
用います。

data bags に監視項目情報を投入します。

``` bash
% knife data bag from file sensu_checks data_bags/sensu_checks/proc_nginx.json
```

暫くすると下記のプロセスを経て監視が開始される

* sensu-server 上の chef-client が interval 間隔後実行
* sensu-server に proc_nginx.json が配置
* sensu-server が chef により再起動
* sensu-client 上の sensu agent が自らの subscribers が属している proc_nginx.json を検知
* sensu-client が nginx のプロセス監視開始

まとめ
----

監視対象追加 (agent 仕込み), 監視項目追加を workstation 上から knife を使って
操作出来ました。監視項目の削除についてはダミーの json (command 項に 'echo ok'
など設定) を投入することで、私は対処していますが、本来は data bag が存在しない
ことを検知して sensu-server 上から監視項目を削除する cookbook に仕上げなければ
いけないと思います。

