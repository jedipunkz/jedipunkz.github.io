+++
title = "Mesos + Marathon + Deimos + Docker を試してみた!"
date = "2014-06-13"
Categories = ["infrastructure"]
description = "Mesos の Docker プラグイン Deimos と Marathon を使ったコンテナオーケストレーション"
aliases = [
  "/blog/2014/06/13/mesos-marathon-deimos-docker",
  "/post/2014/06/13/mesos-marathon-deimos-docker"
]
+++
こんにちは。@jedipunkz です。

以前 Mesos, Docker について記事にしました。

<http://jedipunkz.github.io/post/mesos-architecture-number-1/>
<http://jedipunkz.github.io/post/methos-architecture-number-2-docker-on-mesos/>

Twitter で Docker 関連のオーケストレーションツールについて呟いていたら @everpeace さんから
こんな情報をもらいました。

<blockquote class="twitter-tweet" lang="ja"><p><a href="https://twitter.com/jedipunkz">@jedipunkz</a> 元々meos-dockerっていうmesos executorがあったんですけど、mesosがcontainer部分をpluggableにしたので、それに合わせてdeimosっていうmesos用のexternal containerizer が作られました。</p>&mdash; Shingo Omura (@everpeace) <a href="https://twitter.com/everpeace/statuses/476998842383347712">2014, 6月 12</a></blockquote>
<script async src="//platform.twitter.com/widgets.js" charset="utf-8"></script>

Deimos !!! 知らなかった。Mesos の Docker プラグインらしく下記の場所にありました。

<https://github.com/mesosphere/deimos>

色々調べいたら、こんな資料が見つかりました。どうやらまだ公開されて4日しか経っていないようです。

<http://mesosphere.io/learn/run-docker-on-mesosphere/>

Mesos + Marathon + Deimos + Docker をオールインワン構成で構築する手順が書かれています。

内容はほぼ同じですが、一応自分がやってみて理解したことをまとめたいので下記に記していきます。

構築してみる
----

手順をまとめてスクリプトにしました。パッケージは Ubuntu 13.10 用のようですが 14.04 のホスト
で実行出来ました。14.04 のパッケージはまだ見つかっていません。

``` bash
#!/bin/bash
# disable ipv6
echo 'net.ipv6.conf.all.disable_ipv6 = 1' | sudo tee -a /etc/sysctl.conf
echo 'net.ipv6.conf.default.disable_ipv6 = 1' | sudo tee -a /etc/sysctl.conf
sudo sysctl -p

# install related tools
sudo apt-get update
sudo apt-get -y install curl python-setuptools python-pip python-dev python-protobuf

# install zookeeper
sudo apt-get -y install zookeeperd
echo 1 | sudo dd of=/var/lib/zookeeper/myid

# install docker
sudo apt-get -y install docker.io
sudo ln -sf /usr/bin/docker.io /usr/local/bin/docker
sudo sed -i '$acomplete -F _docker docker' /etc/bash_completion.d/docker.io
sudo docker pull libmesos/ubuntu

# install mesos
curl -fL http://downloads.mesosphere.io/master/ubuntu/13.10/mesos_0.19.0-xcon3_amd64.deb -o /tmp/mesos.deb
sudo dpkg -i /tmp/mesos.deb
sudo mkdir -p /etc/mesos-master
echo in_memory  | sudo dd of=/etc/mesos-master/registry
curl -fL http://downloads.mesosphere.io/master/ubuntu/13.10/mesos_0.19.0-xcon3_amd64.egg -o /tmp/mesos.egg
sudo easy_install /tmp/mesos.egg

# install marathon
curl -fL http://downloads.mesosphere.io/marathon/marathon_0.5.0-xcon2_noarch.deb -o /tmp/marathon.deb
sudo dpkg -i /tmp/marathon.deb

# restart each services
sudo service docker.io restart
sudo service zookeeper restart
sudo service mesos-master restart
sudo service mesos-slave restart

# install deimos
sudo pip install deimos
sudo mkdir -p /etc/mesos-slave

## Configure Deimos as a containerizer
echo /usr/bin/deimos  | sudo dd of=/etc/mesos-slave/containerizer_path
echo external     | sudo dd of=/etc/mesos-slave/isolation
```

プロセスの確認
----

実行が終わると各プロセスが確認出来ます。オプションでどのプロセスが何を見ているか大体
わかりますので見ていきます。

#### mesos-master

mesos-master は zookeeper を参照して 5050 番ポートで起動しているようです。

``` bash
% ps ax | grep mesos-master
 1224 ?        Ssl    0:30 /usr/local/sbin/mesos-master --zk=zk://localhost:2181/mesos --port=5050 --log_dir=/var/log/mesos --registry=in_memory
```

#### mesos-slave

mesos-slave は同じく zookeeper を参照して containerizer を deimos として稼働していることが
わかります。

``` bash
% ps ax | grep mesos-slave
 1225 ?        Ssl    0:12 /usr/local/sbin/mesos-slave --master=zk://localhost:2181/mesos --log_dir=/var/log/mesos --containerizer_path=/usr/bin/deimos --isolation=external
```

#### zookeeper

zookeeper は OpenJDK7 で稼働している Java プロセスです。

``` bash
% ps ax | grep zookeeper
 1073 ?        Ssl    1:07 /usr/bin/java -cp /etc/zookeeper/conf:/usr/share/java/jline.jar:/usr/share/java/log4j-1.2.jar:/usr/share/java/xercesImpl.jar:/usr/share/java/xmlParserAPIs.jar:/usr/share/java/netty.jar:/usr/share/java/slf4j-api.jar:/usr/share/java/slf4j-log4j12.jar:/usr/share/java/zookeeper.jar -Dcom.sun.management.jmxremote -Dcom.sun.management.jmxremote.local.only=false -Dzookeeper.log.dir=/var/log/zookeeper -Dzookeeper.root.logger=INFO,ROLLINGFILE org.apache.zookeeper.server.quorum.QuorumPeerMain /etc/zookeeper/conf/zoo.cfg
```

#### docker

docker が起動していることも確認できます。設定は特にしていないです。

``` bash
% ps axuw | grep docker
root       831  0.0  0.3 364776 14924 ?        Sl   01:30   0:01 /usr/bin/docker.io -d
```

Marathon の WebUI にアクセス
----

Marathon の WebUI にアクセスしてみましょう。

<img src="http://jedipunkz.github.com/pix/deimos_01.png">

まだ何も Tasks が実行されていないので一覧には何も表示されないと思います。

Tasks の実行
----

Marathon API に対してクエリを発行することで Mesos の Tasks として Docker コンテナを稼働させることが出来ます。
下記のファイルを ubuntu.json として保存。

``` json
{
    "container": {
    "image": "docker:///libmesos/ubuntu"
  },
  "id": "ubuntu",
  "instances": "1",
  "cpus": ".5",
  "mem": "512",
  "uris": [ ]
}
```

下記の通り localhost:8080 が Marathon API の Endpoint になっているのでここに対して作成した JSON を POST します。

``` bash
% curl -X POST -H "Content-Type: application/json" localhost:8080/v2/apps -d@ubuntu.json
```

Tasks の一覧を取得してみます。

``` bash
% curl -X GET -H "Content-Type: application/json" localhost:8080/v2/apps
{"apps":[{"id":"ubuntu","cmd":"","env":{},"instances":1,"cpus":0.5,"mem":512.0,"executor":"","constraints":[],"uris":[],"ports":[13049],"taskRateLimit":1.0,"container":{"image":"docker:///libmesos/ubuntu","options":[]},"version":"2014-06-13T01:45:58.693Z","tasksStaged":1,"tasksRunning":0}]}
```

Tasks の一覧が JSON で返ってきます。id : ubuntu, インスタンス数 : 1, CPU 0.5, メモリー : 512MB で
Task が稼働していることが確認出来ます。

ここで WebUI 側も見てみましょう。

<img src="http://jedipunkz.github.com/pix/deimos_05.png">

一つ Task が稼働していることが確認出来ると思います。

<img src="http://jedipunkz.github.com/pix/deimos_04.png">

その Task をクリックすると詳細が表示されます。

次に Tasks のスケーリングを行ってみましょう。
下記の通り ubuntu.json を修正し instances : 2 とする。これによってインスタンス数が2に増えます。

``` json
{
    "container": {
    "image": "docker:///libmesos/ubuntu"
  },
  "id": "ubuntu",
  "instances": "2",
  "cpus": ".5",
  "mem": "512",
  "uris": [ ]
}
```

修正した JSON を POST します。

``` bash
% curl -X PUT -H "Content-Type: application/json" localhost:8080/v2/apps/ubuntu -d@ubuntu.json
```

Tasks の一覧を取得し containers が 2 になっていることが確認できます。

``` bash
% curl -X GET -H "Content-Type: application/json" localhost:8080/v2/apps
{"apps":[{"id":"ubuntu","cmd":"","env":{},"instances":2,"cpus":0.5,"mem":512.0,"executor":"","constraints":[],"uris":[],"ports":[17543],"taskRateLimit":1.0,"container":{"image":"docker:///libmesos/ubuntu","options":[]},"version":"2014-06-13T02:40:04.536Z","tasksStaged":3,"tasksRunning":0}]}
```

最後に Tasks を削除してみましょう。

``` bash
% curl -X DELETE -H "Content-Type: application/json" localhost:8080/v2/apps/ubuntu
```

Tasks が削除されたことを確認します。

``` bash
% curl -X GET -H "Content-Type: application/json" localhost:8080/v2/apps
{"apps":[]}
```

Marathon API v2
----

Marathon API v2 について下記の URL に仕様が載っています。上記に記したクエリ以外にも色々載っているので
動作を確認してみるといいと思います。

<https://github.com/mesosphere/marathon/blob/master/docs/api/http/REST_template.md>

まとめ
----

オールインワン構成が出来ました。また動作確認も無事出来ています。
以前試した時よりも大分、手順が簡潔になった印象があります。また参考資料中に

"checkout our other multi-node tutorials on how to scale Docker in your data center."

とありますが、まだ見つかっていません(´・ω・｀)見つかった方教えてくださいー。

以前試した時は Mesos-Master の冗長化が出来なかったので今回こそ Multi Mesos-Masters,
Multi Mesos-Slaves の構成を作ってみたいと思います。

また今月？になって続々と Docker のオーケストレーションツールを各社が公開しています。

##### centurion

New Relic が開発したオーケストレーションツール。
<https://github.com/newrelic/centurion>

##### helios

Spotify が開発したオーケストレーションツール。
<https://github.com/spotify/helios>

##### fleet

CoreOS 標準搭載。
<https://github.com/coreos/fleet>

##### geard

RedHat が Red Hat Enterprise Linux Atomic Host に搭載しているツール。
<http://openshift.github.io/geard/>

##### Kubernetes

Google が開発したオーケストレーションツール。
<https://github.com/GoogleCloudPlatform/kubernetes>

##### shipper

Python のコードで Docker をオーケストレーション出来るツール。
<https://github.com/mailgun/shipper>

幾つか試したのですが、まだまだ動く所までいかないツールがありました。github の README にも
"絶賛開発中なのでプロダクトレディではない" と書かれています。これからでしょう。


