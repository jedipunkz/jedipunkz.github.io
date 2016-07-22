+++
author = ""
categories = ["infrastructure"]
date = "2016-07-23T02:40:11+09:00"
description = ""
featured = ""
featuredalt = ""
featuredpath = ""
linktitle = ""
title = "Go言語でInfluxDBにメトリクスデータを挿入"

+++
こんにちは。<a href="https://twitter.com/jedipunkz">@jedipunkz</a> です。

Ansible, Terraform, Chef などのソフトウェアを使ってインフラを定義するのが当たり前になった現在ですが、本当の意味でのソフトウェアによるインフラの定義ってなんだろと最近考えています。aws-sdk や fog などを使ったネイティブな言語でインフラを定義することの意味もあるように感じているからです。某サービスプロバイダのエンジニアはこうした言語によるインフラの定義の一番大きなメリットとして "再利用性" をあげていました。

ってことで真の Infrastructure as a Code を実践するために幾つかのソフトウェアでインフラを構成したりってことを勉強していこうかなと思い始めています。

今回は InfluxDB を Go 言語で操作する方法を紹介したいと思います。

情報源
----

* https://github.com/influxdata/influxdb/tree/master/client

今回使う InfluxDB Client です。InfluxDB 自体が Go 言語で書かれていますがクライアントも Go 言語で記述することができます。ここにあるサンプルコードをすこしいじって、今回の記事を書こうと思います。

* https://github.com/shirou/gopsutil

@shirou さんが作られた psutil の Go 言語版です。CPU, Mem などリソースをモニタするのに便利なので利用します。

環境構築
----

環境を作っていきます。InfluxDB と Chronograf を構築するのですが Docker で構築するのが簡単なのでこれを利用します。

* InfluxDB の起動

InfluxDB のコンテナを起動します。

```
docker run -p 8083:8083 -p 8086:8086 \
      -v $PWD:/var/lib/influxdb \
      influxdb
```

* Chronograf の起動

Chronograf のコンテナを起動します。

```
docker run -p 10000:10000 chronograf
```

この時点で http://${DOCKER_HOST}:10000/ にアクセスすると Chronograf の UI を確認できます。

InfluxDB にユーザ・データベースを作成する
----

InfluxDB 上にユーザとデータベースを作成します。言語の中でも作ることが出来ますが、今回は手動で。
Mac OSX を使っている場合 homebrew で influxdb をインストールすることが簡単にできます。

```
brew install influxdb
```

ユーザを作ります。

```
influx -host 192.168.99.100 -port 8086
> create user foo with password 'foo'
> grant all privileges to foo
```

データベースを作ります。

```
influx -host 192.168.99.100 -port 8086
> CREATE DATABASE IF NOT EXISTS square_holes;
```

Go言語でメモリー使用率を取得し InfluxDB にメトリクスデータを挿入
----

Go 言語でメモリー使用率を取得し得られたメトリクスデータを InfluxDB に挿入するコードを書きます。

```golang
package main

import (
    "log"
    "time"

    "github.com/influxdata/influxdb/client/v2"
    "github.com/shirou/gopsutil/mem"
)

const (
    MyDB = "square_holes"
    username = "foo"
    password = "foo"
)

func main() {
    for {
        // Make client
        c, err := client.NewHTTPClient(client.HTTPConfig{
            Addr: "http://192.168.99.100:8086",
            Username: username,
            Password: password,
        })
    
        if err != nil {
            log.Fatalln("Error: ", err)
        }
    
        // Create a new point batch
        bp, err := client.NewBatchPoints(client.BatchPointsConfig{
            Database:  MyDB,
            Precision: "s",
        })
    
        if err != nil {
            log.Fatalln("Error: ", err)
        }
    
        // get mem
        v, _ := mem.VirtualMemory()
    
        // Create a point and add to batch
        tags := map[string]string{"mem": "mem-total"}
        fields := map[string]interface{}{
            "total":   v.Total,
            "free":    v.Free,
        }
        pt, err := client.NewPoint("memory", tags, fields, time.Now())
    
        if err != nil {
            log.Fatalln("Error: ", err)
        }
    
        bp.AddPoint(pt)
    
        // Write the batch
        c.Write(bp)
        time.Sleep(1 * time.Second)
    }
}
```

ビルドして実行すると下記のように influxdb 上のデータベースにメトリクスデータが挿入されていることを確認できます。

```
influx -host 192.168.99.100 -port 8086 -execute 'SELECT * FROM memory' -database=square_holes -precision=s | head -8
name: memory
------------
time            mem             free            total
1469207199      mem-total       260071424       8589934592
1469207201      mem-total       260616192       8589934592
1469207205      mem-total       260145152       8589934592
1469208496      mem-total       77627392        8589934592
1469208660      mem-total       213663744       8589934592
```

Chronograf の UI で確認してみましょう。

<img src="http://jedipunkz.github.io/pix/influx-go.png" width="70%">

まとめと考察
----

InfluxDB の提供元が出している Telegraf というメトリクスデータの送信エージェントがありますが、同じような動きを Go 言語で簡単に開発できることが分かりました。ネイティブな言語で開発するとより柔軟にデータの送信ができることも期待できます。各言語の aws-sdk, fog, などを使ってインフラを定義することでも同じ効果が得られることが期待できると思います。また、古くからみんなが使っている activerecord 等も同じようにインフラを言語の中で定義しているとも言えるのかなぁと influxdb-client を使っていて思いました。
