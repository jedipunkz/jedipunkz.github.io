+++
author = ""
categories = ["infrastructure"]
date = "2016-07-23T02:40:11+09:00"
description = "Go 言語と InfluxDB Client、gopsutil を使ったサーバメトリクス監視のコード化"
featured = ""
featuredalt = ""
featuredpath = ""
linktitle = ""
aliases = ["/blog/2016/07/23/influxdb-go/"]
title = "Go言語とInfluxDBで監視のコード化"

+++
こんにちは。<a href="https://twitter.com/jedipunkz">@jedipunkz</a> です。

今日は Go 言語でサーバのメトリクスデータを InfluxDB に入れてリソース監視を行う方法について書きます。

Ansible, Terraform, Chef などのソフトウェアを使ってインフラを定義するのが当たり前になった現在ですが、本当の意味でのソフトウェアによるインフラの定義ってなんだろと最近考えています。aws-sdk や fog などを使ったネイティブな言語でインフラを定義することの意味もあるように感じているからです。某サービスプロバイダのエンジニアはこうした言語によるインフラの定義の一番大きなメリットとして "再利用性" をあげていました。こうしたソフトウェアによるインフラの定義や構成を行う上で監視についてもコード化できるのでは？と考えて今回の記事に至りました。

使うモノ
----

* https://github.com/influxdata/influxdb/tree/master/client

公式の InfluxDB Go Client です。InfluxDB 自体が Go 言語で書かれていますがクライアントも Go 言語で記述することができます。ここにあるサンプルコードをすこしいじって、今回の記事を書こうと思います。

* https://github.com/shirou/gopsutil

@shirou さんが作られた psutil の Go 言語版です。CPU, Mem などリソースをモニタするのに便利なので利用します。

環境構築
----

環境を作っていきます。InfluxDB と Chronograf を構築するのですが Docker で構築するのが簡単なのでこれを利用します。Chronograf は InfluxDB 内のデータを可視化するためのソフトウェアです。

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

Go言語で CPU 時間を取得し InfluxDB にメトリクスデータを挿入
----

Go 言語でメモリー使用率を取得し得られたメトリクスデータを InfluxDB に挿入するコードを書きます。

```golang
package main

import (
    "log"
    "time"

    "github.com/influxdata/influxdb/client/v2"
    "github.com/shirou/gopsutil/cpu"
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
    
        // get CPU info
        cp, _ := cpu.Times(true)

        // get CPU status info for each core
        var user, system, idle float64 = 0, 0, 0
        for _, sub_cpu := range cp {
            user = user + sub_cpu.User
            system = system + sub_cpu.System
            idle = idle + sub_cpu.Idle
        }
    
        // Create a point and add to batch
        tags := map[string]string{"cpu": "cpu"}
        fields := map[string]interface{}{
            "User":     user / float64(len(cp)),
            "System":   system / float64(len(cp)),
            "Idle":     idle / float64(len(cp)),
        }
        pt, err := client.NewPoint("cpu", tags, fields, time.Now())
    
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
influx -host 192.168.99.100 -port 8086 -execute 'SELECT * FROM cpu' -database=square_holes -precision=s | head -8
name: cpu
---------
time            Idle            System          User            cpu
1469342272      20831.04296875  3700.185546875  3544.90234375   cpu
1469342273      20831.666015625 3700.302734375  3544.966796875  cpu
1469342274      20832.2109375   3700.447265625  3545.068359375  cpu
1469342275      20832.828125    3700.546875     3545.13671875   cpu
1469342291      20841.728515625 3702.482421875  3546.806640625  cpu
```

Chronograf の UI で確認してみましょう。

<img src="http://jedipunkz.github.io/pix/influx-go.png" width="80%">

得られた CPU に関するデータが可視化されていることが確認できます。変化に乏しいグラフですが...。
この辺りは CPU 時間から CPU 使用率を得るコードに書き換えるといいかもしれません。

まとめと考察
----

InfluxDB の提供元が出している Telegraf というメトリクスデータの送信エージェントがありますが、同じような動きを Go 言語で簡単に開発できることが分かりました。ネイティブな言語で開発するとより柔軟にデータの送信ができることも期待できます。また冒頭に述べた通り再利用も用意になるのではと思います。インフラの状態をメトリクスデータとして時系列 DB に挿入して可視化するということは監視のコード化とも言えると思います。ただし、フレームワークが出てきてもっと簡単に書ける仕組みが出てこないと厳しい気もしますが。果たしてこれらインフラを言語で記述していくことがどれだけ有用なのかまだわかりませんが、いつか現場で実践してみたいと思います。
