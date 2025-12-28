+++
author = ""
description = "Kubernetes 1.4 で alpha 実装された cron 的なバッチ処理を行う ScheduledJob の使用方法"
featured = ""
featuredpath = ""
title = "kubernetes1.4 で実装された ScheduledJob を試してみた！"
featuredalt = ""
categories = [
]
linktitle = ""
date = "2016-11-03T09:08:48+09:00"
aliases = ["/blog/2016/11/03/kubernetes-scheduledjob/"]

+++

こんにちは、@jedipunkz です。今回は Kubernetes1.4 から実装された ScheduledJob を試してみたのでその内容を記したいと思います。

ScheduledJob はバッチ的な処理を Kubernetes の pod を使って実行するための仕組みです。現在は alpha バージョンとして実装されています。
kubernetes の pod, service は通常、永続的に立ち上げておくサーバなどを稼働させるものですが、それに対してこの scheduledJob は cron 感覚でバッチ処理を pod に任せることができます。

Alpha バージョンということで今回の環境構築は minikube を使って簡易的に Mac 上に構築しました。Docker がインストールされていれば Linux でも環境を作れます。

参考 URL
----

今回利用する yaml ファイルなどは下記のサイトを参考にしています。

* http://kubernetes.io/docs/user-guide/scheduled-jobs/
* https://github.com/kubernetes/minikube


前提の環境
----

私の環境では下記の環境を利用しました。

* Mac OSX
* Docker-machine or Docker for Mac
* minikube

kubernetes 1.4 以降の構成を minikube で構築する
----

まず minikube のインストールを行います。

```
$ curl -Lo minikube https://storage.googleapis.com/minikube/releases/v0.12.0/minikube-darwin-amd64 && chmod +x minikube && sudo mv minikube /usr/local/bin/
```

早速 minikube を起動します。

```
$ docker-machine start default
$ minikube start
$ eval $(minikube docker-env)
```

Google Cloud の GKE を利用する場合
----

今回は minikube を使ってローカルマシンに kubernetes 1.4 環境を作りましたが Google Cloud の GKE を用いている場合下記のように gcloud SDK を用いて GKE クラスターノードを構築することで対応できます。ですが Google に確認したところこの構築方法を取った場合には Google からのサポートを得られないのと SLA も対象外になるとのことでした。リスクは大きいと思います。(2016/11現在)

```
gcloud alpha container clusters create alpha-test-cluster --zone asia-northeast1-b --enable-kubernetes-alpha
gcloud container clusters get-credentials alpha-test-cluster
gcloud container node-pools create alpha-test-pool --zone asia-northeast1-b --cluster alpha-test-cluster
```

scheduledjob を試す
----

#### yaml ファイルの生成

scheduledjob を実行するための yaml ファイルを生成します。公式サイト (http://kubernetes.io/docs/user-guide/scheduled-jobs/) にあるものを一部修正して記述しています。ファイル名は sj.yaml とします。

```
apiVersion: batch/v2alpha1
kind: ScheduledJob
metadata:
  name: hello
spec:
  schedule: 0/1 * * * ?
  jobTemplate:
    spec:
      template:
        spec:
          containers:
          - name: hello
            image: busybox
            args:
            - /bin/sh
            - -c
            - date; echo Hello from the Kubernetes cluster
          restartPolicy: OnFailure
  concurrencyPolicy: Allow
  #suspend: true
```

#### scheduledJob の実行

生成した yaml ファイルを元に kubectl コマンドで scheduledjob を実行します。

```
$ kubectl create -f ./sj.yaml
```

実行したジョブがどのような状況か確認します。下記のコマンドで生成した scheduledjob 一覧が確認できます。
yaml ファイルの通り、1分間隔で 'hello' という scheduledJob が実行されることが確認できると思います。

```
$ kubectl get scheduledjob
NAME      SCHEDULE      SUSPEND   ACTIVE    LAST-SCHEDULE
hello     0/1 * * * ?   False     0         <none>
```

scheduledjob を元に実行された(実行される) ジョブ(job) 一覧を確認します。
1分間隔で実行されている様子が確認できます。また、DESIRED:1 で SUCCESSFUL:0 の行は、1分間隔で実行される直前のジョブとして認識されていることがわかります。

```
$ kubectl get jobs --watch
NAME               DESIRED   SUCCESSFUL   AGE
hello-1856276298   1         1            59s
NAME               DESIRED   SUCCESSFUL   AGE
hello-1780451143   1         0            0s
hello-1780451143   1         0         0s
hello-1780451143   1         1         5s
hello-1476429627   1         0         0s
hello-1476429627   1         0         0s
hello-1476429627   1         1         5s
hello-1628211009   1         0         0s
hello-1628211009   1         0         0s
hello-1628211009   1         1         5s
hello-1552385854   1         0         0s
hello-1552385854   1         0         0s
hello-1552385854   1         1         5s
```

下記のコマンドで実行されたジョブ一覧を取得できます。こちらは結果のみですので SUCCESSFULL=1 のみが表示されています。

```
$ kubectl get job
NAME               DESIRED   SUCCESSFUL   AGE
hello-1476429627   1         1            6m
hello-1552385854   1         1            4m
hello-1552516926   1         1            1m
hello-1628211009   1         1            5m
hello-1628342081   1         1            2m
hello-1704167236   1         1            3m
hello-1704298308   1         1            49s
hello-1780451143   1         1            7m
hello-1856276298   1         1            8m
```

この際に pod の様子も確認してみます。--show-all オプションで過去の pod を一覧表示します。今回のジョブは一瞬で実行可能な内容なのでこのオプションを付けないと pod 一覧が取得できない可能性が高いです。

```
kubectl get pod --show-all
NAME                     READY     STATUS      RESTARTS   AGE
hello-1476429627-pxr06   0/1       Completed   0          8m
hello-1552385854-y68ci   0/1       Completed   0          6m
hello-1552516926-ggjpk   0/1       Completed   0          3m
hello-1628211009-iih0i   0/1       Completed   0          7m
hello-1628342081-ig5lg   0/1       Completed   0          4m
hello-1628473153-9wvn4   0/1       Completed   0          1m
hello-1704167236-zqg94   0/1       Completed   0          5m
hello-1704298308-eaq8m   0/1       Completed   0          2m
hello-1780254535-64mah   0/1       Completed   0          28s
hello-1780451143-tjg8r   0/1       Completed   0          9m
hello-1856276298-y2o65   0/1       Completed   0          10m
```

最終行のジョブ 'hello-1856276298-y2o65' の内容を確認します。

```
$ kubectl logs hello-1856276298-y2o65
Thu Oct 27 01:18:11 UTC 2016
Hello from the Kubernetes cluster
```

sj.yaml 内に記述したジョブ内容 'echo ...' の実行結果が表示されていることが確認できます。

docker のイメージも確認します。ジョブ内で指定した image: busybox が確認できます。
その他のイメージは minikube を構成するものです。

```
$ docker images
REPOSITORY                                            TAG                 IMAGE ID            CREATED             SIZE
busybox                                               latest              e02e811dd08f        2 weeks ago         1.093 MB
gcr.io/google_containers/kubernetes-dashboard-amd64   v1.4.0              436faaeba2e2        5 weeks ago         86.27 MB
gcr.io/google-containers/kube-addon-manager           v5.1                735ce4344f7f        3 months ago        255.8 MB
gcr.io/google_containers/pause-amd64                  3.0                 99e59f495ffa        5 months ago        746.9 kB
```

ジョブの削除
----

ジョブを削除します。削除する対象は scheduledjob とそれを元に生成・実行された jobs です。

```
$ kubectl delete scheduledjob hello
$ kubectl delete jobs $(kubectl get jobs | awk '{print $1}' | grep -v NAME)
job "hello-1476429627" deleted
job "hello-1552385854" deleted
job "hello-1552516926" deleted
job "hello-1628211009" deleted
job "hello-1628342081" deleted
job "hello-1628473153" deleted
job "hello-1628604225" deleted
job "hello-1704167236" deleted
job "hello-1704298308" deleted
job "hello-1704429380" deleted
job "hello-1780254535" deleted
job "hello-1780385607" deleted
job "hello-1780451143" deleted
job "hello-1856276298" deleted
```

ここで確認できたのは scheduledjob を削除するとそれ以降の jobs は新規実行されませんでした。が、実行された後の jobs は情報として残ったままでした。

その他のオプション
----

#### concurrencyPolicy

下記のように spec.concurrencyPolicy オプションが指定できます。下記のような value を渡すと実行されるジョブの動作を変えることが可能です。

* Allow (Default) : 重複するジョブ実行を許可
* Forbid : 直前のジョブが終了していない場合ジョブ実行をスキップする
* Replace : 直前のジョブが終了していない場合新しいジョブを上書きする

#### suspend

'spec.suspend: true' に設定すると ScheduledJob は生成されますが次回実行時のジョブがサスペンドされ実行されません。デフォルトは false です。

```
$ kubectl get scheduledjob
NAME      SCHEDULE      SUSPEND   ACTIVE    LAST-SCHEDULE
hello     0/1 * * * ?   True      0         <none>
$ kubectl get job
$
```

#### オプションの適用例ファイル

```
apiVersion: batch/v2alpha1
kind: ScheduledJob
metadata:
  name: hello
spec:
  schedule: 0/1 * * * ?
  jobTemplate:
    spec:
      template:
        spec:
          containers:
          - name: hello
            image: busybox
            args:
            - /bin/sh
            - -c
            - date; echo Hello from the Kubernetes cluster
          restartPolicy: OnFailure
  concurrencyPolicy: Forbid
  suspend: true
```

まとめと考察
----

今回試してみて、バッチ的な処理を kubernetes で行うならこの scheduledJob しかないな、と思いました。
ですが、2016/11 現在ではまだ Alpha バージョンということで下記のようなリスクを含んでいます。

* このバージョンはバギーです
* アナウンス無しに機能が削られることがあります
* アナウンス無しにそれまでの互換性を変更することがあります
* テスト用としての利用を勧めます。

参考サイト : http://kubernetes.io/docs/api/

また上記にも記しましたが、ジョブの結果が残っていくため、通常使う cron のように数分間隔で実行しているとあっという間に job の量が大量に肥大化することが予想されます。この job には実行結果も含まれているため、消されるものではないのは理解できるのですが kubernetes api が持っている DB 上に大量のデータが生成され続けてしまうため、kubernetes api/サーバを管理している場合には問題になると思います。この辺り、仕様の修正が入ることを期待しています。
