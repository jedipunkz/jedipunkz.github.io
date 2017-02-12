+++
featuredpath = ""
featured = ""
categories = ["infrastructure"]
title = "Serverless on Kubernetes : Fission を使ってみた"
featuredalt = ""
linktitle = ""
description = "Kubernetes 上で Serverless を実現する Fission を使ってみた"
author = "jedipunkz"
date = "2017-02-12T14:55:01+09:00"

+++

こんにちは。 @jedipunkz です。

今日は Kubernetes を使って Serverless を実現するソフトウェア Fission を紹介します。

AWS の Lambda とよく似た動きをします。Lambda も内部では各言語に特化したコンテナが起動してユーザが開発した Lambda Function を実行してくれるのですが、Fission も各言語がインストールされた Docker コンテナを起動しユーザが開発したコードを実行し応答を返してくれます。

それでは早速なのですが、Fission を動かしてみましょう。

動作させるための環境
----

macOS か Linux を前提として下記の環境を用意する必要があります。また Kubernetes 環境は minikube が手っ取り早いので用いますが、もちろん minikube 以外の kubernetes 環境でも動作します。

* macOS or Linux
* minikube or kubernetes
* kubectl
* fission

ソフトウェアのインストール方法
----

簡単にですが、ソフトウェアのインストール方法を書きます。

#### OS

私は Linux で動作させましたが筆者の方は macOS を使っている方が多数だと思いますので、この手順では macOS を使った利用方法を書いていきます。

#### minikube

ここでは簡単な手順で kubernetes 環境を構築できる minikube をインストールします。

```
curl -Lo minikube https://storage.googleapis.com/minikube/releases/v0.16.0/minikube-darwin-amd64 && chmod +x minikube && sudo mv minikube /usr/local/bin/fission
```

#### kubectl

直接必要ではありませんが、kubectl があると minikube で構築した kubernetes 環境を操作できますのでインストールしておきます。

```
curl -Lo kubectl https://storage.googleapis.com/kubernetes-release/release/v1.5.2/bin/linux/amd64/kubectl && chmod +x kubectl && sudo mv kubectl /usr/local/bin/
```

#### Fission

Fission のインストールです。

```
curl http://fission.io/linux/fission > fission && chmod +x fission && sudo mv fission /usr/local/bin/fission
```

kubernetes の起動
----

ソフトウェアのインストールが完了したら minikube を使って kubernetes を起動します。

```
$ minikube start
$ minikube status
minikubeVM: Running
localkube: Running
$ kubectl get nodes
NAME       STATUS    AGE
minikube   Ready     1h
```

Fission の起動と環境変数の設定
----

Fission を起動します。

```
$ kubectl create -f http://fission.io/fission.yaml
$ kubectl create -f http://fission.io/fission-nodeport.yaml
```

次に環境変数を設定します。

```
$ export FISSION_URL=http://$(minikube ip):31313
$ export FISSION_ROUTER=$(minikube ip):31314
```

Fission を使って Python のコードを実行する
----

例として Python の Hello World を用意します。hello.py として保存します。

```
def main():
        return "Hello, world!\n"
```

ではいよいよ、kubernetes と Fission を使って上記の Hello World を実行させます。

まず Fission が用意してくれている Docker コンテナを扱うように 'env' を作ります。

```
$ fission env create --name python-env --image fission/python-env
```

次に Fission で Function を作ります。その際に上記の env と python コードを指定します。つまり、hello.py を fission/python-env という Docker コンテナで稼働する、という意味です。

```
$ fission function create --name python-hello -env python-env --code ./hello.py
```

次に Router を作ります。クエリの Path に対して Fuction を関連付けることができます。

```
$ fission route add --function python-hello --url /python-hello
```

Function を実行する環境ができました。実際に curl を使ってアクセスしてみましょう。

```
$ curl http://$FISSION_ROUTER/python-hello
Hello, world!
```

hello.py の実行結果が得られました。

まとめと考察
----

結果から Fission は "各言語の実行環境として Docker コンテナを用いていて、ユーザが開発したコードをそのコンテナ上で起動し実行結果を得られる。また各コード毎に URL パスが指定することができ、それをルータとして関係性を持たせられる" ということが分かりました。AWS の Lambda とほぼ同じことが実現出来ていることが分かると思います。

AWS には Lambda の実行結果を応答するための API Gateway があり、このマネージド HTTP サーバと併用することで API 環境を用意出来るのですが Fission の場合には HTTP サーバも込みで提供されていることも分かります。

あとは、この Fission を提供している元が "Platform9" という企業なのですが、この企業は OpenStack や kubernetes を使ったホスティングサービスを提供しているようです。開発元が一企業ということと、完全な OSS 開発体制になっていない可能性があって、万が一この企業に何かあった場合にこの Fission を使い続けられるのか問題がしばらくはありそうです。Fission 同等のソフトウェアを kubernetes が取り込むという話題は...あるのかなぁ？

kubernetes の Job Scheduler が同等の機能を提供してくれるかもしれませんが、まだ Job Scheduler は利用するには枯れていない印象があります。Fission と Job Scheduler 、どちらがいち早く完成度を上げられるのでしょうか。
