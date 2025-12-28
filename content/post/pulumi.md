---
title: "マルチクラウド対応 SDK の Pulumi を使って Kubernetes を操作"
date: 2019-11-26T01:27:22+09:00
Categories: ["infrastructure"]
description: "プログラミング言語でインフラを定義できるマルチクラウド対応 SDK Pulumi を使った Kubernetes 操作"
aliases: ["/blog/2019/11/26/pulumi/"]
---
こんにちは。@jedipunkz です。

今日は Pulumi (https://www.pulumi.com/) について紹介したいと思います。

最近ではすっかり Terraform がマルチクラウドな IaC ツールとして定着しましたが、巷では AWS CDK を使う現場も増えてきている印象です。AWS CDK は Typescript, Python などのプログラミング言語の中でインフラを定義・操作することができる AWS が提供しているツールです。ただ AWS CDK は名前の通り AWS にのみ対応していて内部的には Cloudformation Template がエキスポートされています。AWS オンリーという点と Cloudformation という点、また 2019 年時点で進化が激しく後方互換性を全く失っているので AWS CDK のアップデートに追従するのに苦労する点、色々ありまだ利用するには早いのかなぁという印象を個人的には持っています。

そこで今回紹介する Pulumi なのですが CDK 同様にプログラミング言語の中でインフラを定義できて尚且つマルチクラウド対応しています。どちらかというと旧来の SDK の分類だと思うのですが、Terraform 同様にマルチクラウドという点で個人的には以前よりウォッチしていました。

今回は公式の Getting Started 的なドキュメントに従って作業を進め Kubernetes の上に Pod を起動、その後コードを修正して再デプロイを実施して理解を深めてみたいと思います。

## 作業に必要なソフトウェア

下記のソフトウェア・ツールが事前にインストールされていることを前提としたいと思います。また macOS を前提に手順を記します。

- Python3, Pip
- Minikube

## 参考

- https://www.pulumi.com/docs/get-started/kubernetes/

## 事前準備

まず macOS を使っている場合 Pulumi は下記の通り brew を使ってインストールできます。

```bash
$ brew install pulumi
```

また minikube を使って kubernetes を起動します。

```bash
$ minikube start --memory=4096 --cpus=2
```

## Pulumi を使った Nginx Pod の起動

早速 Nginx Pod を Kubernetes 情に起動する作業を行ってみます。適当なディレクトリを作成しその中で `pulumi new` を実行します。

```bash
$ mkdir quickstart && cd quickstart
$ pulumi new kubernetes-python
```

下記の通り出力され入力を促されます。今回はデフォルト値をそのまま利用するのでエンターを数回入力します。

```
project name: (quickstart)
project description: (A minimal Kubernetes Python Pulumi program)
Created project 'quickstart'

Please enter your desired stack name.
To create a stack in an organization, use the format <org-name>/<stack-name> (e.g. `acmecorp/dev`).
stack name: (dev)
Created stack 'dev'
```

すると `__main__.py` というファイルが自動生成されています。Kubernetes 上に nginx pod を起動するための Python コードです。中身を見てみましょう。`nginx` の Deployment が定義されているのが理解できると思います。

```python
import pulumi
from pulumi_kubernetes.apps.v1 import Deployment

app_labels = { "app": "nginx" }

deployment = Deployment(
    "nginx",
    spec={
        "selector": { "match_labels": app_labels },
        "replicas": 1,
        "template": {
            "metadata": { "labels": app_labels },
            "spec": { "containers": [{ "name": "nginx", "image": "nginx" }] }
        }
    })

pulumi.export("name", deployment.metadata["name"])
```

ここで今回は Python を使っているので `pip` を使って Pulumi Module をインストールする必要があります。同じディレクトリ内に自動生成された requirements.txt がありますのでそれに従って `pip install` します。

```bash
$ pip install -r requirements.txt
```

それでは下記の通り `pulumi up` を実行し Nginx Pod を起動していましょう。

```bash
$ pulumi up
Previewing update (dev):

     Type                           Name            Plan
 +   pulumi:pulumi:Stack            quickstart-dev  create
 +   └─ kubernetes:apps:Deployment  nginx           create

Resources:
    + 2 to create

Do you want to perform this update?
> yes
  no
  details
```

結果として下記のように出力されステータス 'created' となりました。

```
     Type                           Name            Status
 +   pulumi:pulumi:Stack            quickstart-dev  created
 +   └─ kubernetes:apps:Deployment  nginx           created

Outputs:
    name: "nginx-td4rq3xr"

Resources:
    + 2 created

Duration: 14s

Permalink: https://app.pulumi.com/jedipunkz/quickstart/dev/updates/1
```

`kubectl` コマンドでも確認していましょう。下記のように `nginx-****` pod が起動していることが分かります。

```bash
$ kubectl get pod
NAME                              READY   STATUS    RESTARTS   AGE
nginx-td4rq3xr-86c57db685-nfblb   1/1     Running   0          46m
```

## `__main__.py` コードを修正して外部から Nginx にアクセス

次に `__main__.py` を下記の通り修正して Nginx Pod に curl を使ってアクセスできるようにしてみます。
コードの中で minikube か否かについての Config `pulumi.Config()` に関する記述と Deployment に IP を確保する記述があります。

```python
import pulumi
from pulumi_kubernetes.apps.v1 import Deployment
from pulumi_kubernetes.core.v1 import Service

# Minikube does not implement services of type `LoadBalancer`; require the user to specify if we're
# running on minikube, and if so, create only services of type ClusterIP.
config = pulumi.Config()
is_minikube = config.require_bool("isMinikube")

app_name = "nginx"
app_labels = { "app": app_name }

deployment = Deployment(
    app_name,
    spec={
        "selector": { "match_labels": app_labels },
        "replicas": 1,
        "template": {
            "metadata": { "labels": app_labels },
            "spec": { "containers": [{ "name": app_name, "image": "nginx" }] }
        }
    })

# Allocate an IP to the Deployment.
frontend = Service(
    app_name,
    metadata={
        "labels": deployment.spec["template"]["metadata"]["labels"],
    },
    spec={
        "type": "ClusterIP" if is_minikube else "LoadBalancer",
        "ports": [{ "port": 80, "target_port": 80, "protocol": "TCP" }],
        "selector": app_labels,
    })

# When "done", this will print the public IP.
if is_minikube:
    pulumi.export("ip", frontend.spec.apply(lambda v: v["cluster_ip"] if "cluster_ip" in v else None))
else:
    pulumi.export("ip", frontend.status.apply(lambda v: v["load_balancer"]["ingress"][0]["ip"] if "load_balancer" in v else None))
```

修正が終わったら下記の通り変数 `isMinikube` に true を設定して、先ほどと同様に `pulumi up` を実行します。

```bash
$ pulumi config set isMinikube true
$ pulumi up
```

次に下記のコマンドを実行し Pods に付与された IP Addr を調べます。

```bash
$ pulumi stack output ip
```

最後に minikube のノードにログインし curl を使って先ほど調べた IP Addr 宛に curl でアクセスします。

```bash
$ minikube ssh
$ curl 10.108.14.27
<!DOCTYPE html>
<html>
<head>
<title>Welcome to nginx!</title>
<style>
    body {
        width: 35em;
        margin: 0 auto;
        font-family: Tahoma, Verdana, Arial, sans-serif;
    }
</style>
</head>
<body>
<h1>Welcome to nginx!</h1>
<p>If you see this page, the nginx web server is successfully installed and
working. Further configuration is required.</p>

<p>For online documentation and support please refer to
<a href="http://nginx.org/">nginx.org</a>.<br/>
Commercial support is available at
<a href="http://nginx.com/">nginx.com</a>.</p>

<p><em>Thank you for using nginx.</em></p>
</body>
</html>
```

nginx のデフォルトのコンテンツが応答あったことを確認出来ると思います。

## まとめ

Python コードの中でインフラを定義することが出来ました。今回は Kubernetes で試しましたが AWS や GCP にも対応しています。同様のことを AWS SDK でも自分は今まで行ってきましたが前述した通りマルチクラウドという点が優位性あるのかなぁという印象です。ただ、クラウド側も常に進化していて、それらに Pulumi が追従し続けられるのか不安な点も感じます。その点ではやはり AWS を利用しているエンジニアにとっては AWS SDK がベストな選択と今時点では言わざるを得ません。また Pulumi という企業自体が安定しているのか、買収されたりしないのかという不安も付き纏います。

SDK の利用は DevOps・SRE 的に業務を行うのであれば自動化を推進するにあたり必須とも言える技術であると言えます。個人的にはこれはインフラを構築・管理するツールとしての Terraform とは立ち位置が若干異なるという認識でいます。それに対して CDK はどういう立ち位置になるのか。今回紹介した Pulumi が SDK としてのデファクトにのしあがるのかいなか。DevOps・SRE 界隈エンジニアが用いる技術もこれから更に変化していきそうな気がしますし、その過程の中で Pulumi を知って頂くのは良いことだと思います。
