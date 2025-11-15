+++
linktitle = "Helm を使って Kubernetes を管理する"
featured = ""
categories = ["infrastructure"]
description = "Kubernetes パッケージマネージャ Helm を使った Pod と Service の管理方法"
date = "2016-11-20T11:27:00+09:00"
featuredpath = ""
featuredalt = ""
author = "jedipunkz"
title = "Helm を使って Kubernetes を管理する"

+++

こんにちは。@jedipunkz です。

今回は Helm という kubernetes のパッケージマネージャ的なソフトウェアを使ってみたので記事にしたいと思います。

* 公式サイト : https://helm.sh/

Kubernetes を仕事で使っているのですが "レプリケーションコントローラ" や "サービス" といった単位を使って Pod, Service を管理しています。Helm を使うことでこれらの管理方法が変わるのか調べたいと思います。

依存するソフトウェア
----

今回は MacOS を使って環境を整えます。

* virtualbox
* minikube
* kubectl

これらのソフトウェアをインストールしていきます。

```
$ brew cask install virtualbo
$ curl -Lo minikube https://storage.googleapis.com/minikube/releases/v0.12.2/minikube-darwin-amd64 && chmod +x minikube && sudo mv minikube /usr/local/bin/
$ brew install kubectl
```

minikube を使って簡易的な kubernetes 環境を起動します。

```
$ minikube start
$ eval $(minikube docker-env)
```

Helm を使ってみる
----

Helm は Charts という単位で Kubernetes をパッケージングします。Charts の一覧を見てみましょう。

```
$ helm search
NAME                    VERSION         DESCRIPTION
stable/drupal           0.3.7           One of the most versatile open source content m...
stable/factorio         0.1.1           Factorio dedicated server.
stable/ghost            0.4.0           A simple, powerful publishing platform that all...
stable/jenkins          0.1.1           A Jenkins Helm chart for Kubernetes.
stable/joomla           0.4.0           PHP content management system (CMS) for publish...
stable/mariadb          0.5.3           Chart for MariaDB
stable/mediawiki        0.4.0           Extremely powerful, scalable software and a fea...
stable/memcached        0.4.0           Chart for Memcached
stable/minecraft        0.1.0           Minecraft server
stable/mysql            0.2.1           Chart for MySQL
stable/phpbb            0.4.0           Community forum that supports the notion of use...
stable/postgresql       0.2.0           Chart for PostgreSQL
stable/prometheus       1.3.1           A Prometheus Helm chart for Kubernetes. Prometh...
stable/redis            0.4.1           Chart for Redis
stable/redmine          0.3.5           A flexible project management web application.
stable/spark            0.1.1           A Apache Spark Helm chart for Kubernetes. Apach...
stable/spartakus        1.0.0           A Spartakus Helm chart for Kubernetes. Spartaku...
stable/testlink         0.4.0           Web-based test management system that facilitat...
stable/traefik          1.1.0-rc3-a     A Traefik based Kubernetes ingress controller w...
stable/uchiwa           0.1.0           Dashboard for the Sensu monitoring framework
stable/wordpress        0.3.2           Web publishing platform for building blogs and ...
```

各アプリケーションの名前で Charts が管理されていることが分かります。
ここでは stable/mysql を使って kubernetes の中に MySQL 環境を作ってみます。まず stable/mysql に設定できるパラメータ一覧を取得します。

```
$ helm inspect stable/mysql
Fetched stable/mysql to mysql-0.2.1.tgz
description: Chart for MySQL
engine: gotpl
home: https://www.mysql.com/
keywords:
- mysql
- database
- sql
maintainers:
- email: viglesias@google.com
  name: Vic Iglesias
name: mysql
sources:
- https://github.com/kubernetes/charts
- https://github.com/docker-library/mysql
version: 0.2.1

---
## mysql image version
## ref: https://hub.docker.com/r/library/mysql/tags/
##
imageTag: "5.7.14"

## Specify password for root user
##
## Default: random 10 character string
# mysqlRootPassword: testing

## Create a database user
##
# mysqlUser:
# mysqlPassword:

## Allow unauthenticated access, uncomment to enable
##
# mysqlAllowEmptyPassword: true

## Create a database
##
# mysqlDatabase:

## Specify a imagePullPolicy
## 'Always' if imageTag is 'latest', else set to 'IfNotPresent'
## ref: http://kubernetes.io/docs/user-guide/images/#pre-pulling-images
##
# imagePullPolicy:

## Persist data to a persitent volume
persistence:
  enabled: true
  storageClass: generic
  accessMode: ReadWriteOnce
  size: 8Gi

## Configure resource requests and limits
## ref: http://kubernetes.io/docs/user-guide/compute-resources/
##
resources:
  requests:
    memory: 256Mi
    cpu: 100m
```

stable/mysql という Charts を構成するパラメータ一覧が取得できました。今回は DB 上のユーザを作ってパスワードを設定してみようと思います。上記のパラメータの中から 'mysqlUser', 'mysqlPasswword' を編集してみます。下記の内容を config.yaml というファイル名で保存します。

```
mysqlUser: user1
mysqlPassword: password1
```

この config.yaml を使って stable/mysql を起動してみます。

```
$ helm install -f config.yaml stable/mysql
$ helm ls # <--- 起動した環境を確認する
NAME            REVISION        UPDATED                         STATUS          CHART
dealing-ladybug 1               Sun Nov 20 10:44:00 2016        DEPLOYED        mysql-0.2.1
```

'dealing-ladybug' という名前で mysql が起動したことが分かります。

kubectl をつかって Services を確認してみます。

```
$ kubectl get svc
NAME                    CLUSTER-IP   EXTERNAL-IP   PORT(S)    AGE
dealing-ladybug-mysql   10.0.0.24    <none>        3306/TCP   33m
```

'dealing-ladybug-mysql' という Service が kubernetes 環境に作られました。この名前は Kubernetes 内のコンテナから DNS 名前解決できるアドレスとなります。

ここで mysql-client 環境を作るために下記のようなコンテナを起動して mysql-client をインストール、config.yaml で作成したユーザ・パスワードで mysql サーバにアクセス確認します。

```
$ kubectl run -i --tty ubuntu02 --image=ubuntu:16.04 --restart=Never -- bash -il
# apt-get update; apt-get install -y mysql-client
# mysql -h dealing-ladybug-mysql -u user1 -ppassword1
<省略>
mysql>
```

config.yaml に記したユーザ情報で MySQL にアクセスできることを確認できました。

まとめ
----

Helm を使うことでレプリケーションコントローラやサービスを直接 yaml で作らなくても MySQL 環境構築と設定が行えました。Helm の Charts は自分で開発することも可能です。(参考 URL) 

https://github.com/kubernetes/helm/blob/master/docs/charts.md

パッケージングすることで他人の作った資源を有用に活用することもできるため、こういった何かを抽象化する技術を採用することにはとても意味があると思います。自動化を考える上でも抽象化できる技術は有用だと思います。

ですがレプリケーションコントローラを使っても Helm でも Yaml で管理することに変わりはなく、またレプリケーションコントローラで指定できる詳細なパラメータ (replicas や command, image など) を指定できないためすぐに実用するというわけにはいかないなぁと感じました。

参考 URL
----

* https://github.com/kubernetes/helm/blob/master/docs/charts.md
* https://github.com/kubernetes/helm/blob/master/docs/quickstart.md

