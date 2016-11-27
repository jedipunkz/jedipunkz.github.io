+++
description = "coreos が最近アナウンスした etcd operator を触ってみた"
linktitle = ""
featured = ""
categories = ["infrastructure"]
featuredpath = ""
featuredalt = ""
author = "jedipunkz"
date = "2016-11-27T21:00:45+09:00"
title = "coreos の etcd operator を触ってみた"

+++

こんにちは @jedipunkz です。

今日は某アドベントカレンダーに参加していて記事を書いています。
記事だけ先出ししちゃいます..。

今日は最近 coreos がリリースした 'etcd-operator' を触ってみようかと思います。ほぼ、README に書かれている手順通りに実施するのですが、所感を交えながら作業して記事にしてみたいと思います。

coreos が提供している etcd についてご存知ない方もいらっしゃると思いますが etcd は KVS ストレージでありながら Configuration Management Store として利用できる分散型ストレージです。Docker 等の環境を提供する coreos という軽量 OS 内でも etcd が起動していてクラスタで管理された情報をクラスタ内の各 OS が読み書きできる、といった機能を etcd が提供しています。
詳細については公式サイトを御覧ください。

etcd 公式サイト : https://coreos.com/etcd/docs/latest/

etcd-operator はこの etcd クラスタを kubernetes 上でクラスタ管理するための簡単に運用管理するためのソフトウェアになります。

etcd-operator 公式アナウンス : https://coreos.com/blog/introducing-the-etcd-operator.html

後に実際に触れていきますが下記のような管理が可能になります。

* etcd クラスタの構築
* etcd クラスタのスケールアップ・ダウン
* etcd Pod の障害時自動復旧
* etcd イメージをオンラインで最新のモノにアップグレード

では早速利用してみたいと思います。

必要な環境
----

下記の環境が事前に用意されている必要があります。

* Docker
* Kubernetes or minikube+kubernetes (https://github.com/kubernetes/minikube)
* etcdctl : https://github.com/coreos/etcd/tree/master/etcdctl

作業準備
---

下記のレポジトリをクローンします。

```
$ git clone https://github.com/coreos/etcd-operator.git
```

Operator のデプロイ
----

下記のような内容のファイルが記さているファイルを利用します。中身を確認しましょう。

```
$ cat  example/deployment.yaml
apiVersion: extensions/v1beta1
kind: Deployment
metadata:
  name: etcd-operator
spec:
  replicas: 1
  template:
    metadata:
      labels:
        name: etcd-operator
    spec:
      containers:
      - name: etcd-operator
        image: quay.io/coreos/etcd-operator
        env:
        - name: MY_POD_NAMESPACE
          valueFrom:
            fieldRef:
              fieldPath: metadata.namespace
```

kind: Deployment で etcd-operator のイメージを使ってレプリカ数1のポッドを起動しているのが分かると思います。実際にデプロイします。

```
$ kubectl create -f example/deployment.yaml
```

どんなポッドが起動したか確認します。

```
kubectl get pods
NAME                                     READY     STATUS    RESTARTS   AGE
etcd-operator-217127005-futo0            1/1       Running   0          1m
```

あと、これは自分も知りませんでしたがサードパーティリソースという枠があるらしく下記のように確認することができます。

```
kubectl get thirdpartyresources
NAME                      DESCRIPTION             VERSION(S)
etcd-cluster.coreos.com   Managed etcd clusters   v1
```

replica数1 ですが、ポッドなのでポッド内のプロセスに問題があれば kubernetes が自動で修復 (場合によってポッドの再構築) されます。また replica 数を増やす運用も考えられそうです。

etcd クラスタの構築
----

下記の内容のファイルで etcd をデプロイします。中身を確認しましょう。
API は coreos.com/v1 で kind: EtcdCluster という情報が記されています。また version でイメージバージョンが記されているのかなということが後に確認できます。また size でレプリカ数が記されているようです。

```
$ cat example/example-etcd-cluster.yaml
apiVersion: "coreos.com/v1"
kind: "EtcdCluster"
metadata:
  name: "etcd-cluster"
spec:
  size: 3
  version: "v3.1.0-alpha.1"
```

デプロイをしてみます。

```
$ kubectl create -f example/example-etcd-cluster.yaml
```

クラスタがデプロイされたか見てみます。3つのポッドが確認できます。やはりファイル中 size: 3 はレプリカ数だったようです。

```
$ kubectl get pods --show-all
NAME                                     READY     STATUS      RESTARTS   AGE
etcd-cluster-0000                        1/1       Running     0          1m
etcd-cluster-0001                        1/1       Running     0          36s
etcd-cluster-0002                        1/1       Running     0          21s
```

同様に Service について確認します。etcd-cluster-000[012] の3つが今回作った etcd クラスタです。

```
$ kubectl get svc
NAME                    CLUSTER-IP   EXTERNAL-IP   PORT(S)             AGE
etcd-cluster            10.0.0.80    <none>        2379/TCP            1m
etcd-cluster-0000       10.0.0.13    <none>        2380/TCP,2379/TCP   1m
etcd-cluster-0001       10.0.0.111   <none>        2380/TCP,2379/TCP   1m
etcd-cluster-0002       10.0.0.183   <none>        2380/TCP,2379/TCP   50s
kubernetes              10.0.0.1     <none>        443/TCP             5d
```

etcd クラスタをスケールアウト
----

では etcd クラスタのレプリカ数を増やすことでスケールアウトしてみます。が、今現在 (2016/12) 時点では一部不具合があるらしく回避策として下記の通り curl を用いてスケールアウトすることが可能なようです。

下記の内容で body.json ファイルを用意します。size: 5 になっていることが確認できて、レプリカ数5になるのだなと判断できます。

```
$ cat body.json
{
  "apiVersion": "coreos.com/v1",
  "kind": "EtcdCluster",
  "metadata": {
    "name": "etcd-cluster",
    "namespace": "default"
  },
  "spec": {
    "size": 5
  }
}
```

ここで curl で実行するためプロキシを稼働します。

```
$ kubectl proxy --port=8080
```

curl で先程作った body.json を PUT してみます。

```
curl -H 'Content-Type: application/json' -X PUT --data @body.json http://127.0.0.1:8080/apis/coreos.com/v1/namespaces/default/etcdclusters/etcd-cluster
```

クラスタがスケールアウトされたか確認しましょう。

```
kubectl get pods --show-all
NAME                                     READY     STATUS    RESTARTS   AGE
etcd-cluster-0000                        1/1       Running   0          5m
etcd-cluster-0001                        1/1       Running   0          4m
etcd-cluster-0002                        1/1       Running   0          4m
etcd-cluster-0003                        1/1       Running   0          32s
etcd-cluster-0004                        1/1       Running   0          17s
etcd-operator-217127005-futo0            1/1       Running   0          9m
```

5台構成のクラスタにスケールアウトしたことが確認できます。

etcd にアクセス
---

5台構成の etcd クラスタがデプロイできたので etcd に etcdctl を使ってアクセスしてみましょう。事前に etcdctl をインストールする必要があります。また私の環境もそうだったのですがローカルの Mac に minikube を使って kubernetes 環境を構築しているので下記のように nodePort を作るため作業が必要です。

```
$ kubectl create -f example/example-etcd-cluster-nodeport-service.json
$ export ETCDCTL_API=3
$ export ETCDCTL_ENDPOINTS=$(minikube service etcd-cluster-client-service --url)
$ etcdctl put foo bar
$ etcdctl get foo
foo
bar
```

etcdctl でキー・値を入力・読み込みが可能であることが分かりました！

ポッドの自動復旧
----

kubernetes を普段使っている方は分かると思うのですがポッドを落としても kubernetes が自動復旧してくれます。ここで一つポッドを削除してみようと思います。

```
$kubectl get pods
NAME                                     READY     STATUS    RESTARTS   AGE
etcd-cluster-0000                        1/1       Running   0          11m
etcd-cluster-0001                        1/1       Running   0          11m
etcd-cluster-0002                        1/1       Running   0          11m
etcd-cluster-0003                        1/1       Running   0          6m
etcd-cluster-0004                        1/1       Running   0          6m
etcd-operator-217127005-futo0            1/1       Running   0          16m

$kubect delete pod etcd-cluster-0004
```

しばらくすると下記の通り etcd-cluster-0004 に代わり etcd-cluster-0005 が稼働していることが確認できると思います。

```
$ kubectl get pods
NAME                                     READY     STATUS    RESTARTS   AGE
etcd-cluster-0000                        1/1       Running   0          12m
etcd-cluster-0001                        1/1       Running   0          12m
etcd-cluster-0002                        1/1       Running   0          11m
etcd-cluster-0003                        1/1       Running   0          7m
etcd-cluster-0005                        1/1       Running   0          3s
etcd-operator-217127005-futo0            1/1       Running   0          17m
```

まとめ
----

kubernetes の上で構成することでうまく kubernetes のメリットを活かしつつ etcd クラスタを構成できていると言えると思います。記事執筆時ではまだ不具合が幾つかありました (上記の curl で実施した箇所や、イメージのアップグレード) が、etcd を手動で構築するより kubernetes で構成するほうがメリットが多いことは明らかです。また kubernetes のポッドから kubernetes dns を介してサービスネームに直接アクセスできるのでポッドから etcd に情報を読み書きすることも容易になりそうです。

ですが etcd に収めるデータの性質によっては運用面で厳しくなることも想定できます。coreos 内で etcd クラスタを介して互いのコンテナ間でコンフィグを共有し合う使い方は非常に意味があると思うのですが、coreos 外の独自のソフトウェアがいろんな種別のデータを etcd クラスタに外から入出力することの意味はそれほど無いように思えます。であれば高耐久性で運用のし易い軽量な KVS ソフトウェアを使うべきだからです。

また今回紹介した etcd-operator とは別に coreos が同時にアナウンスした(https://coreos.com/blog/the-prometheus-operator.html) に関しても興味を持っているので後に触ってみたいと思います。

何と言うか所感として最後に述べるとサーバレスが叫ばれている中でわざわざクラスタソフトウェアを自前で管理するのか？と疑問も確かに残ります。それこそクラウドプラットフォームが提供すべき機能だと思うからです..。
