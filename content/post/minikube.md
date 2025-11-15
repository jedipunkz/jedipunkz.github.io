+++
author = ""
categories = ["infrastructure"]
date = "2016-07-25T23:18:16+09:00"
description = "Minikube と VirtualBox を使った Mac OSX での簡易 Kubernetes 環境構築手順"
featured = ""
featuredalt = ""
featuredpath = ""
linktitle = ""
title = "Minikube で簡易 kubernetes 環境構築"

+++

こんにちは。@jedipunkz です。

kubernetes の環境を簡易的に作れる Minikube (https://github.com/kubernetes/minikube) が2ヶ月前ほどにリリースになっていました。簡単ですが少し触ってみたのでその際のメモを記したいと思います。VirtualBox もしくは VMware Fusion がインストールされていればすぐにでも稼働可能です。私は Kubernetes 初心者ですが何も考えずに kubernetes を動かすことが出来ました。

前提
----

前提として下記の環境が必要になります。

* Mac OSX がインストールされていること
* VirtualBox もしくは VMware Fusion がインストールされていること

minikube をインストール
----

minikube をインストールします。

```
$ curl -Lo minikube https://storage.googleapis.com/minikube/releases/v0.6.0/minikube-darwin-amd64 && chmod +x minikube && sudo mv minikube /usr/local/bin/
```

kubetl をインストール
----

次に kubectl をインストールします。

```
$ curl -k -o kubectl https://kuar.io/darwin/kubectl && chmod +x kubectl && sudo mv kubectl /usr/local/bin/
```

Minikube で Kurbernates を稼働
----

Minikube を使って Kubernetes を稼働してみます。下記のコマンドを実行すると Virtualbox 上で仮想マシンが稼働し Kubernetes 一式も立ち上がります。

```
$ minikube start
```

Kurbernates を使ってみる
----

Pods を立ち上げてみましょう。下記の内容を redis-django.yaml ファイルに保存します。

```
apiVersion: v1
kind: Pod
metadata:
  name: redis-django
  labels:
    app: web
spec:
  containers:
    - name: key-value-store
      image: redis
      ports:
        - containerPort: 6379
    - name: frontend
      image: django
      ports:
        - containerPort: 8000
```

kubectl コマンドで Pod を立ち上げます。

```
$ kubectl create -f ./redis-django.yaml
```

Pod の様子を確認します。

```
$ kubectl get pods
NAME           READY     STATUS             RESTARTS   AGE
redis-django   1/2       CrashLoopBackOff   7          15m
```

Minikube はクラスタといってもノードが1つなので READY 1/2 となるようです。Nodes の様子を見てみます。

```
$ kubectl get nodes
NAME         LABELS                                                                                        STATUS
minikubevm   beta.kubernetes.io/arch=amd64,beta.kubernetes.io/os=linux,kubernetes.io/hostname=minikubevm   Ready
```

Docker ホスト上の様子を見てみましょう。Kubernetes を形成するコンテナと共に redis のコンテナが稼働していることが確認できます。

```
$ eval $(minikube docker-env)
$ docker ps
CONTAINER ID        IMAGE                                                  COMMAND                  CREATED             STATUS              PORTS               NAMES
550285614e33        redis                                                  "docker-entrypoint.sh"   20 minutes ago      Up 20 minutes                           k8s_key-value-store.a3b8356e_redis-django_default_4440a1d8-5272-11e6-9f19-6e0006e7fb51_90c3fec8
aba3a8c040d4        gcr.io/google_containers/pause-amd64:3.0               "/pause"                 20 minutes ago      Up 20 minutes                           k8s_POD.822b267d_redis-django_default_4440a1d8-5272-11e6-9f19-6e0006e7fb51_5bef1d2a
9ea96a3f3e10        gcr.io/google-containers/kube-addon-manager-amd64:v2   "/opt/kube-addons.sh"    48 minutes ago      Up 48 minutes                           k8s_kube-addon-manager.a1c58ca2_kube-addon-manager-minikubevm_kube-system_48abed82af93bb0b941173334110923f_84f4fd38
192e886a5795        gcr.io/google_containers/pause-amd64:3.0               "/pause"                 48 minutes ago      Up 48 minutes                           k8s_POD.d8dbe16c_kube-addon-manager-minikubevm_kube-system_48abed82af93bb0b941173334110923f_6c65b482
7b005c68d9d4        gcr.io/google_containers/pause-amd64:3.0               "/pause"                 48 minutes ago      Up 48 minutes                           k8s_POD.2225036b_kubernetes-dashboard-pzdxy_kube-system_7005dce1-479a-11e6-a0ce-86b669e45864_c08bd009
```

まとめ
----

Kubernetes のことを殆ど知らない私でもなんとなくですが稼働させて基本的な操作が出来ました。2016/5/31 にリリースされたツールなのでまだ安定しないところもありますが、より容易に Kubernetes が稼働できるようになったのでエンジニアの敷居が下がったのではないでしょうか。
