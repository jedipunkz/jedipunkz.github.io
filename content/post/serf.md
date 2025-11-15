+++
title = "Serf を使ってみた"
date = "2013-11-10"
slug = "2013/11/10/serf"
Categories = ["infrastructure"]
description = "HashiCorp Serf オーケストレーションツールの紹介と基本的な動作の理解"
+++
こんにちは。<a href="https://twitter.com/jedipunkz">@jedipunkz</a> です。

僕は Chef 使いなのですが、Chef はオーケストレーションまで踏み込んだツールでは
ないように思います。せいぜいインテグレーションが出来る程度なのかなぁと。
しかもインテグレーションするにも Cookbooks の工夫が必要です。以前聞いたことの
ある話ですが Opscode 社のエンジニア曰く「オーケストレーション等へのアプローチ
はそれぞれ好きにやってね」だそうです。

個人的にオーケストレーションをテーマに色々調べようかと考えているのですが、
Serf という面白いツールが出てきました。'Serf' はオーケストレーションを手助けし
てくれるシンプルなツールになっています。

もう既にいろんな方が Serf について調べていますが、どのような動きをするのかを自
分なりに理解した点を記しておこうと思います。

参考にしたサイト
----

* 公式サイト <http://www.serfdom.io/>
* クラスメソッド開発者ブログ <http://dev.classmethod.jp/cloud/aws/serf_on_ec2/>
* Glidenote さん <http://blog.glidenote.com/blog/2013/10/30/serf-haproxy/>


Serf とは
----

Serf は gossip protocol をクラスタにブロードキャストする。gossip protocol は
SWIM : Scalable Weakly-consistent Infecton-style process Group Membership
Protocol” をベースとして形成されている。

SWIM Protocol 概略
----

serf は新しいクラスタとして稼働するか、既存のクラスタに ‘join’ する形で稼働
するかのどちらかで起動する。

新しいメンバは TCP で状態を 'full state sync' され既存のクラスタ内にて
‘gossipin (噂)される。この ’gosiping’ は UDP で通信されこれはネットワーク使
用量はノード数に比例することになる。

ランダムなノードとの 'full state sync' は TCP で行われるけどこれは
‘gossiping’ に比べて少い

ある一定期間、あるノードが fails 状態の場合、迂回経路を使ってそのノードに対し
てチェックを行う。両方の経路にて fails な場合ノードが ‘suspiciou' (容疑者)
状態になる。もし迂回経路のチェックが fails しなかった場合ネットワーク障害として
判断される。

Serf の SWIM Protocol からの改修点
----

Serf は SWIM Protocol をベースにしていると記しましたが、どのような点を改修した
のかまとめました。

* 'full state sync' の TCP 化

serf は ‘full state sync’ を TCP にて行う。これにより serf はネットワーセグ
メントが分離されている状態でも通信出来る。

* gossip レイヤの分離

serf は failure detection protocol から完全に gossip レイヤを分離。これでより
高速にデータ増殖が行える。

* dead node の扱い
    
serf は デッドノードに対して回数を記憶している。これにより full state sync が
実施された場合、逆に死んだノードの情報を受取る。SWIM では full state sync を行
わないので死んだノードにを削除してしまう。これはクラスタに対する情報一点集中化
に役立つ。

使ってみる
----

早速使ってみます。下記の URL にある demo 用スクリプトを少し改修して使ってみま
した。

<https://github.com/hashicorp/serf/tree/master/demo/web-load-balancer>

* 2つノードを立ち上げる

AWS でも OpenStack でもベアメタルでも何でも良いのでノードを2台用意する。

* 下記のスクリプトを置いて両ノードで実行する。

```bash
#!/bin/sh
set -e

export SERF_ROLE=role01

sudo apt-get install -y unzip

# Download and install Serf
cd /tmp
until wget -O serf.zip https://dl.bintray.com/mitchellh/serf/0.2.1_linux_amd64.zip; do
sleep 1
done
unzip serf.zip
sudo mv serf /usr/local/bin/serf

# The member join script is invoked when a member joins the Serf cluster.
# Our join script simply adds the node to the load balancer.
cat <<EOF >/tmp/join.sh
#!/bin/sh
echo 'member joined' >> /tmp/serf_join.log
EOF
sudo mv /tmp/join.sh /usr/local/bin/serf_member_join.sh
chmod +x /usr/local/bin/serf_member_join.sh

# Configure the agent
cat <<EOF >/tmp/agent.conf
description "Serf agent"

start on runlevel [2345]
stop on runlevel [!2345]

exec /usr/local/bin/serf agent \\
-event-handler "member-join=/usr/local/bin/serf_member_join.sh" \\
-role=${SERF_ROLE} >>/var/log/serf.log 2>&1
EOF
sudo mv /tmp/agent.conf /etc/init/serf.conf

# Start the agent!
sudo start serf
```

実行すると 'role01' という Role 名で serf agent が稼働しているはず。またスクリ
プトを見てわかると思うが --event-handler "member-join=<スクリプト>" としている。
これでクラスタに新しいメンバが join すると /tmp/serf_join.log に 'member
joined' というメッセージが出力されるはずだ。実際に実行してみる。

``` bash
% sudo serf join <もう片系ノードの IP>
% sudo serf members
  vm01    10.0.2.1    alive    role01
  vm02    10.0.2.3    alive    role01
% tail /tmp/serf_join.log
  ‘member joined
  ‘member joined
```

イベントハンドラにはユーザ指定のものも扱える。

```
user:deploy=foo.sh
```

この場合のハンドラは下記のコマンドで発生出来る。

``` bash
% serf event deploy
```

コンフィギュレーションファイル
----

今回は init 起動スクリプト内でイベントハンドラ発生時のスクリプト指定等を行った
が、json 形式のコンフィギュレーションファイルにて記述することも可能。

```json
{
  "role": "load-balancer",

  "event_handlers": [
    "member_join.sh",
    "user:deploy=foo.sh"
  ]
}
```

上記ファイルを serf.conf とした場合、このコンフィグの指定は
--config-file=serf.conf で行える。

ロードマップ
----

最後に Serf の今後のロードマップについて記してあったので、まとめてみた。


* コンフィギュレーションファイル

よりカスタマイズ可能なコンフィギュレーションファイルを扱えるようにする。

* SIGHUP

SIGHUP 信号でリロード出来ないので、これに対応する。

* イベントハンドラライブラリ

イベントハンドラを自作・シェアを容易に行えるようプラグイン化を進める。


まとめと考察
----

冒頭にオーケストレーションについて触れましたが、このツールを使うだけでは自分の
考えているオーケストレーションにはならないと思いました。当たり前ですね。。複数
ノードを束ねて構成を形成する、またそれをトリガするのが人間であればそれはインテ
グレーションの範囲かなぁと。その先にオーケストレーションがあるとすればトリガ自
身もソフトウェアにさせる必要があるのでそのアルゴリズムを人間が書く必要があるの
かなぁと。もちろんそのためにこのSerf は貴重なパーツとなってくれそう。

あと、ロードマップにも記しましたが開発が盛んにされているようなので今後が楽しみ
です。
