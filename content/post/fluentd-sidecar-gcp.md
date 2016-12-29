+++
categories = [
]
title = "fluentd-sidecar-gcp と Kubernetes Volumes で Cloud Logging ログ転送"
linktitle = ""
featured = ""
featuredpath = ""
featuredalt = ""
author = ""
description = "fluentd-sidecar-gcp と Kubernetes Volumes で Cloud Logging へログ転送"
date = "2016-12-29T09:43:18+09:00"

+++

こんにちは @jedipunkz です。

今回は Kubernetes を使った構成で Google-Fluentd をどのコンテナに載せるか？ってことを考えてみたので書きたいと思います。

Kubernetes は Docker を利用したソフトウェアなので Docker と同じく "1コンテナ, 1プロセス" というポリシがあります。つまり、コンテナ上のプロセスが停止したら Kubernetes がそれを検知してコンテナを起動しなおしてくれます。ですが、複数プロセスを1コンテナに稼働させると、それが出来ません。そうは言っても中には複数のプロセスを稼働させたい場面があります。その場面として考えられる具体的な例として HTTPD サーバのログを Google-Fluentd を使って GCP Cloud Logging に転送したい場合があります。

今回は上記の例を fluentd-sidecar-gcp と kubernetes volumes を使って解決する方法を記したいと思います。

構成のシナリオ
----

シナリオとしては下記のとおりです。

* マルチコンテナポッドを扱う
* 1つの Kubernetes Volumes を複数コンテナで共有する
* HTTPD ログをその Volume に出力
* 隣接する Google-Fluentd コンテナでその Volume に出力されたログを読み込みログ転送

fluentd-sidecar-gcp とは
----

次に説明するのは fluentd-sidecar-gcp の概略です。これは Kubernetes が contrib で扱っているコンテナです。下記の URL にあります。

https://github.com/kubernetes/contrib/tree/master/logging/fluentd-sidecar-gcp

Google-Fluentd を稼働させる Dockerfile が用意されているのですが、下記の記述を確認するとこのコンテナに環境変数 $FILES_TO_COLLECT を渡すと Google Fluentd でログを取得してくれることが分かります。

https://github.com/kubernetes/contrib/blob/master/logging/fluentd-sidecar-gcp/config_generator.sh#L22-L37

つまり、fluentd-sidecar-gcp コンテナに隣接する HTTPD コンテナのログが出力される Kubernetes Volumes 上のファイルパスを指定すれば HTTPD のログが取得でき、Google Cloud Logging へログが転送できます。

サンプルの Kubernetes YAML
----

下記にサンプルとして Kubernetes YAML を記します。

```
apiVersion: v1
kind: Pod
metadata:
  labels:
    run:  my-nginx
  name: nginx-fluentd-logging-example
spec:
  containers:
  - name: nginx-container
    image: nginx
    ports:
    - containerPort: 80
    volumeMounts:
    - name: log-storage
      mountPath: /var/log/nginx
  - name: sidecar-log-collector
    image: gcr.io/google_containers/fluentd-sidecar-gcp:1.4
    resources:
      limits:
        cpu: 100m
        memory: 200Mi
    env:
    - name: FILES_TO_COLLECT
      value: "/mnt/log/nginx/access.log /mnt/log/nginx/error.log"
    volumeMounts:
    - name: log-storage
      readOnly: true
      mountPath: /mnt/log/nginx
  volumes:
  - name: log-storage
    emptyDir: {}
---
apiVersion: v1
kind: Service
metadata:
  name: my-nginx
  labels:
    run: my-nginx
spec:
  ports:
  - port: 80
    protocol: TCP
  selector:
    run: my-nginx
```

特徴を下記に解説します。

* nginx-container, sidecar-log-collector のマルチコンテナポッドです。
* sidecar-log-collector の image: としては gcr.io/google_containers/fluentd-sidecar-gcp:1.4 が指定されています
* 'log-storage' として nginx-container の /var/log/nginx が sidecar-log-collector の /mnt/log/nginx として共有されています
* FILES_TO_COLLECT として共有 Volume 上の access.log, error.log が指定されています

結果、Nginx コンテナのログが Kubernetes Volume で Google-Fluentd コンテナに読み込み専用で共有され (readOnly 行) 、この Google-Fluentd は環境変数で渡された /mnt/log/nginx/access.log と /mnt/log/nginx/error.log を読み込み開始し、内容を Google Cloud Logging へ転送します。

デプロイ方法
----

デプロイは下記の通り実施します。

```
$ kubectl create -f <上記のファイル名>
```

結果とまとめ
----

それぞれのログファイルを Tag を Google-Fluentd で付けた形で Google Cloud Logging へ転送出来ました。ログ毎に結果を Cloud Logging UI 上で確認できます。
本来、Docker なので標準出力にログを出力し Kubernetes がその標準出力を Cloud Logging へ転送してくれるのですが、それだと Tag が付けられないため、ログを分離するのが一苦労だと思います。ですが、今回紹介した方法では Google-Fluentd で Tag を付けてログ転送出来たため、その心配はありません。

この Kubernetes Volumes は他にも利用方法がありそうです。

本来、GKE や Kubernetes を利用される方は Microservice Architecture が採用出来ている方々だと思うのですが、fluentd をアプリコンテナから分離するのは結構悩むところじゃないかと思うので、今回紹介した方法はそう言った場合に有用かと思います。
