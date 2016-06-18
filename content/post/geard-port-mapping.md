+++
title = "Geard のポートマッピングについて調べてみた"
date = "2014-04-22"
slug = "2014/04/22/geard-port-mapping"
Categories = ["infrastructure"]
+++
こんにちは。@jedipunkz です。

今週 Redhat が 'Redhat Enterprise Linux Atomic Host' しましたよね。Docker を特
徴としたミニマムな OS だとのこと。その内部で用いられている技術 Geard について
少し調べてみました。複数コンテナの関連付けが可能なようです。ここでは調べた結果
について簡単にまとめていきます。

参考資料
----

<http://openshift.github.io/geard/deploy_with_geard.html>

利用方法
----

ここではホスト OS に Fedora20 を用意します。

まず Geard をインストール

``` bash
% sudo yum install --enablerepo=updates-testing geard
```

下記の json ファイルを作成します。ここにはコンテナをデプロイするための情報と関
連付けのための情報を記します。

``` json
$ ${EDITOR} rockmongo_mongodb.json
{
  "containers":[
    {
      "name":"rockmongo",
      "count":1,
      "image":"derekwaynecarr/rockmongo",
      "publicports":[{"internal":80,"external":6060}],
      "links":[{"to":"mongodb"}]
    },
    {
      "name":"mongodb",
      "count":1,
      "image":"ccoleman/ubuntu-mongodb",
      "publicports":[{"internal":27017}]
    }
  ]
}
```

上記のファイルの解説。

* コンテナ 'rockmongo' と 'mongodb' を作成
* それぞれ1個ずつコンテナを作成
* 'image' パラメータにて docker イメージの指定
* 'publicports' パラメータにてコンテナ内部とホスト側のポートマッピングを行う
* 'links' パラメータで 'rockmongo' を 'mongodb' に関連付け

では、デプロイ開始します。

``` bash
$ sudo gear deploy rockmongo_mongo.json
2014/04/22 07:21:12 Deploying rockmongo_mongo.json.20140422-072112
2014/04/22 07:21:12 appending 27017 on rockmongo-1: &{PortPair:{Internal:27017 External:0} Target:127.0.0.1:27017} &{Id:rockmongo-1 Image:derekwaynecarr/rockmongo From:rockmongo On:0xc2100bb980 Ports:[{PortPair:{Internal:80 External:6060} Target::0}] add:true remove:false container:0xc21000be00 links:[]}
2014/04/22 07:21:12 ports: Releasing
2014/04/22 07:21:12 systemd: Reloading daemon
local PortMapping: 80 -> 6060
local Container rockmongo-1 is installed
2014/04/22 07:21:12 ports: Releasing
2014/04/22 07:21:12 systemd: Reloading daemon
local PortMapping: 27017 -> 4000
local Container mongodb-1 is installed
linking rockmongo: 127.0.0.1:27017 -> localhost:4000
local Links set on local
local Container rockmongo-1 starting
local Container mongodb-1 starting
```

ブラウザにてホスト OS に接続することで rockmongo の管理画面にアクセスが可能。

```
http://<ホストOSのIP:6060>/
```

ポートマッピング管理
----

デプロイが完了して、実際に RockMongo の管理画面にアクセス出来たと思います。
関連付けが特徴と言えそうなのでその解析をしてみました。

Geard のコンテナ関連付けはホストとコンテナのポート管理がキモとなっていることが
解ります。これを紐解くことで geard のコンテナ管理を理解します。

```
                        'rockmongo' コンテナ             'mongodb' コンテナ
+----------+        +--------------------------+        +-------------------+
|  Client  |->6060->|->80-> RockMongo ->27017->|->4000->|->27017-> Mongodb  |
+----------+        +--------------------------+        +-------------------+
                    |-------------------- docker ホスト --------------------|
```

上記 'gear deploy' コマンド発行時のログと json ファイルにより上図のような構成
になっていることが理解できます。一つずつ読み解いていきましょう。

* 'rockmongo' コンテナの内部でリスンしている 80 番ポートはホスト OS の 6060 番へ変換
* 'rockmongo' コンテナ内で稼働する RockMongo の config.php から '127.0.0.1:27017' でリスンしていることが解る

試しに 'derekwaynecarr/rockmongo:latest' に /bin/bash でログインし config.php を確認。

``` bash
$ sudo docker run -i -t derekwaynecarr/rockmongo:latest /bin/bash
bash-4.1# grep mongo_host /var/www/html/config.php
$MONGO["servers"][$i]["mongo_host"] = "127.0.0.1";//mongo host
$MONGO["servers"][$i]["mongo_host"] = "127.0.0.1";
```

* デプロイ時のログと json ファイルの 'links' パラメータより、ホストのポートに動的に(ここでは 4000番ポート) に変換されることが解ります。

``` 
linking rockmongo: 127.0.0.1:27017 -> localhost:4000
```

* ホストの 4000 番ポートは動的に 'mongodb' コンテナの内部ポート 27017 にマッピングされる

これらのポートマッピングによりそれぞれのコンテナの連携が取れている。

まとめと考察
-----

Geard は下記の2つを特徴とした技術だと言えるとことがわかりました。

* コンテナを json で管理しデプロイする仕組みを提供する
* コンテナ間の関連付けをホスト OS のポートを動的に管理・マッピングすることで行う
  
同じような OS に CoreOS <https://coreos.com/> がありますが、こちらも docker,
sytemd 等を特徴としています。さらに etcd を使ってクラスタの構成等が可能になっ
ていますが、Geard はホストのポートを動的に管理することで関連付けが可能なことが
わかりました。

実際に触ってみた感覚から言えば、まだまだ実用化は厳しい状況に思えますが、今後へ
の展開に期待したい技術です。
