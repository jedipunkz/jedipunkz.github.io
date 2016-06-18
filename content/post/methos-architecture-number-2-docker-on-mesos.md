+++
title = "Methos アーキテクチャ #2 (Docker on Mesos)"
date = "2013-10-01"
slug = "2013/10/01/methos-architecture-number-2-docker-on-mesos"
Categories = ["infrastructure"]
+++
こんにちは。<a href="https://twitter.com/jedipunkz">@jedipunkz</a> です。

Mesos アーキテクチャについて2つめの記事です。

<http://jedipunkz.github.io/blog/2013/09/28/mesos-architecture-number-1/>

上記の前回の記事で Mesos 自体のアーキテクチャについて触れましたが、今回は
Mesos + Marathon + Docker の構成について理解したことを書いていこうと思います。

mesos クラスタは 幾つかの mesos masters と沢山の mesos slaves から成っており、
mesos slaves の上では docker を操作する executor が稼働している。marathon は
mesos master の上で稼働する mesos framework である。init や upstart の様な存在
であることが言え、REST API を持ち container の動作を制御する。marathon には
ruby の client 等も存在する。下記がそれ。

<https://github.com/mesosphere/marathon_client>

構成
----

```
+-----------------+
| docker registry | index.docker.io (もしくは local registry)
+-----------------+
|
+----------------+
|                |
+--------------+ +--------------+
| mesos master | | mesos master |
+--------------+ +--------------+
|                |
|----------------+-----------------------------------|

+--------------+ +--------------+     +--------------+
| mesos slave  | | mesos slave  | ... | mesos slave  | 
+--------------+ +--------------+     +--------------+
|                |                    |
+--------------+ +--------------+     +--------------+
| mesos slave  | | mesos slave  | ... | mesos slave  | 
+--------------+ +--------------+     +--------------+
.                .                    .
.                .                    .
.                .                    .
+--------------+ +--------------+     +--------------+
| mesos slave  | | mesos slave  | ... | mesos slave  |
+--------------+ +--------------+     +--------------+
```

オファから docker が稼働するまでの流れ
----

上記の構成の図を見ながら理解していきましょう。

* HTTP API もしくは web UI で marathon がリクエストを受ける
* marathon はリソースリクエストを作成しオファが受け付けられるのを待つ
* オファが受け付けられた後、mesos master は slave に task の仕様を送信する
* slave では docker コマンドラインツールを実行する mesos docker を mesos slave デーモンが呼び出す
* docker コマンドラインツールはローカルの docker デーモンと image cache, lxc ツールにより通信する
* もし image cache が存在すればそれを、無ければ docker registry から pull する。
* その時、index.docker.io の代わりにローカルの docker registry を稼働させることも可能
* docker デーモンが container を稼働させる

marathon のクラスタとしての動作
----

marathon は init や upstart のようなモノだと上記で説明しましたが、図を交えて説明して
いきましょう。

marathon が 'serarch service' と 'docker' を稼働させている状態だとする。

```
+----------+ +----------+ +----------+
|          | |          | |          | 
| |search| | | |docker| | | |docker| |
+----------+ +----------+ +----------+

+----------+ +----------+ +----------+
|          | |          | |          | 
| |search| | | |docker| | | |docker| |
+----------+ +----------+ +----------+

+----------+ +----------+ +----------+
|          | |          | |          | 
| |search| | | |docker| | | |docker| |
+----------+ +----------+ +----------+
```

サービスの状況によりオファが立て込んでくると下記のように docker をスケールアウ
トが発生する。

```
+----------+ +----------+ +----------+
| |docker| | | |docker| | |          | 
| |search| | | |docker| | | |docker| |
+----------+ +----------+ +----------+

+----------+ +----------+ +----------+
|          | | |docker  | | |docker| | 
| |search| | | |docker| | | |docker| |
+----------+ +----------+ +----------+

+----------+ +----------+ +----------+
| |docker| | | |docker| | | |docker| |
| |search| | | |docker| | | |docker| |
+----------+ +----------+ +----------+
```

システムに異常がありノードが落ちた場合、下記のように marathon は serach
service と docker をノード間で移動させる処置を行う。

```
             +----------+ +----------+
             | |docker| | | |search| | 
             | |docker| | | |docker| |
             +----------+ +----------+

+----------+ +----------+ +----------+
| |docker|   | |docker| | | |docker| | 
| |search| | | |docker| | | |docker| |
+----------+ +----------+ +----------+

+----------+ +----------+ +----------+
| |docker| | | |docker| | | |docker| |
| |search| | | |docker| | | |docker| |
+----------+ +----------+ +----------+
```

まとめ
----

mesos と docker, marathon の関係について記していきました。今度、実際にこの構成
を組んでみて障害系のテストしてみたいです。あとは framework について理解してい
く必要がありそう。あとは chronos についても。chronos については下記の URL が公
式らしい。これは cron 代替な仕組みらしいです。

<https://github.com/airbnb/chronos>

まだまだ理解できていないことだらけだ...。
