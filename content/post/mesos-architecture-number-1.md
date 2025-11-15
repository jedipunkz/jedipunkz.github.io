+++
title = "Mesos アーキテクチャ #1"
date = "2013-09-28"
slug = "2013/09/28/mesos-architecture-number-1"
Categories = ["infrastructure"]
description = "Apache Mesos のクラスタマネージャとしてのアーキテクチャと全体構造の解説"
+++
こんにちは。<a href="https://twitter.com/jedipunkz">@jedipunkz</a> です。

今回はクラスタマネージャである Mesos について書こうと思います。

Mesos は Apache Software Foundation によって管理されるソフトウェアで分散アプリ
ケーションをクラスタ化することが出来るマネージャです。Twitter が採用しているこ
とで有名だそうで、開発にも積極的に参加しているそうです。

<http://mesos.apache.org/>

@riywo さんが既に Mesos + Marathon + Zookeper + Docker な構成を組む手順をブロ
グで紹介されていますので是非試してみると面白いと思います。

<http://tech.riywo.com/blog/2013/09/27/mesos-introduction-1/>

私は理解した Mesos のアーキテクチャについて少し書いていきたいと思います。

全体の構造
----

```
+-----------+
| zookeeper |
|  quorum   |
+-----------+
|
+----------------+----------------+
|                |                |
+--------------+ +--------------+ +--------------+
| mesos-master | | mesos-master | | mesos-master |
|    active    | |  hot standby | |  hot standby |
+--------------+ +--------------+ +--------------+ ...
|
+----------------+----------------+
|                |                |
+--------------+ +--------------+ +--------------+
|  mesos-slave | |  mesos-slave | |  mesos-slave |
|   executor   | |   executor   | |   executor   |
| +----++----+ | | +----++----+ | | +----++----+ |
| |task||task| | | |task||task| | | |task||task| |
| +----++----+ | | +----++----+ | | +----++----+ |
+--------------+ +--------------+ +--------------+ ...
```

基本的に few masters + many slaves の構成です。task は slaves の上で走ります。
master はオファーによりアプリケーション(フレームワーク)に対して CPU, メモリの
リソースをシェア出来ます。リソースは slave ID, resource1: amount1,
resource2, amount2, ... といった配列を含みます。master はポリシに従いそれぞれ
のフレームワークに対してリソースをどれだけ提供するか決定します。プラグイン形式
で様々なポリシを取り込む仕組みになっています。

mesos は zookeeper により HA を組むことが出来ます。1つの active master と複数
(もしくは1つの) stand-by master(s) の構成です。active を投票するため zookeeper
のアルゴリズムが用いられます。

mesos-master を起動する際に下記のパラメータを渡すとmulti masters の構成が組め
ます。

```
--zk=zk://host1:port1/path,host2:port2/path,...
```   

それに対して multi slaves に対しては下記のパラータを渡します。

```
--master=zk://host1:port1/path,host2:port2/path,...
```

ネットワークの分断
----

ネットワークの分断により様々な事象が発生します。幾つかのパターンによる動きにつ
いて見ていきます。

* slave が master と分断された場合

ヘルスチェックが失敗。master は slave のことを 'deactivated' と判断しその
slave に分配した task を LOST とします。

* master に再接続出来ない場合

'deactivated' となった slave が master に再接続出来ない場合、シャットダウンの
指示が送られる
  
* slave が zookeeper と分断された場合

master がいない状態となり、再び master の投票が行われ active master が現れるま
で master からの指示を拒否する


リソースのオファ
-----

```
+-------------------+
|     framework     |
|    +----+----+    |
|    |job1|job2|    |
|    +----+----+    |
|     scheduler     |
+-------------------+
~(2)                |(3)
|                   ~
+-------------------+
|    mesos-master   |
| allocation module |
+-------------------+
~(1)                |(4)
|                   ~
+-------------------+
|    mesos-slave    |
|      executor     |
|    +----+----+    |
|    |task|task|    |
|    +----+----+    |
+-------------------+
```
 
リソースのオファの流れについて。

* (1) mesos-slave が空きの CPU, Mem の状況(4cpus,4g mem)を mesos-mater に伝える。
* (2) mesos-master はそのリソース空き状況を framework に対して伝える
* (3) framework の scheduler は mesos-mater に対して mesos-slave の上で動かすべ
き2個のタスクについて伝える。1個めは 2cpus, 1g mem。2個めは 1cpus, 2g memと。
* (4) master は task を slave に対して伝える。結果 1cpu, 1gb mem がアロケートさ
れない状況だが、それについては別の framework に対してアロケートすることとな
る。

まとめ
----

このクラスタ自体が1つの OS かのような動きを取ることが見て取れます。Mesos の上
で Hadoop, Spark などを稼働させることが出来るそうですが、次回、私は docker を動
かしてみたいと思っています。

<http://mesosphere.io/2013/09/26/docker-on-mesos/>

ここが参考になります。

駆け足でしたが、以上です。
