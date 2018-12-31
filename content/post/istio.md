+++
title = "Istio, Helm を使って Getting Started 的なアプリをデプロイ"
date = "2018-12-31"
slug = "2018/12/31/istio"
Categories = ["infrastructure"]
+++
こんにちは。<a href="https://twitter.com/jedipunkz">@jedipunkz</a> です。

最近は kubernetes を触ってなかったのですが Istio や Envoy 等 CNCF 関連のソフトウェアの記事をよく見かけるようになって、少し理解しておいたほうがいいかなと思い Istio と Minikube を使って Getting Started 的な事をやってみました。Istio をダウンロードすると中にサンプルアプリケーションが入っているのでそれを利用してアプリのデプロイまでを行ってみます。

Istio をダウンロードするとお手軽に Istio 環境を作るための yaml ファイルがあり、それを kubectl apply することで Istio 環境を整えられるのですが、ドキュメントにプロダクション環境を想定した場合は Helm Template を用いた方がいいだろう、と記載あったので今回は Helm Template を用いて Istio 環境を作ります。

## 前提の環境

下記の環境でテストを行いました。

- macos Mojave
- minikube v0.32.0
- kubectl v1.10.3
- helm v2.12.1
- virtualbox

## 準備
### kubectl と helm のインストール

kubctl と helm をインストールします。両者共に homebrew でインストールします。

```bash
brew install kubernetes-cli
brew install kubernetes-helm
```

### minikube のインストールと起動

minikube をインストールして起動します。

```bash
curl -Lo minikube https://storage.googleapis.com/minikube/releases/v0.32.0/minikube-darwin-amd64 && chmod +x minikube && sudo cp minikube /usr/local/bin/ && rm minikube
minikube start --memory 2048
```

### Istio のダウンロードとインストール

Istio のダウンロードとインストールを行います。後術しますがこのディレクトリの中に Istio 環境を構築するためのファイルやサンプルアプリケーションが入っています。

```bash
curl -L https://git.io/getLatestIstio | sh -
cd istio-1.0.5
sudo cp bin/istioctl /usr/local/bin/istioctl
```

## 構築作業

### Istio の Custom Resource Definitions をインストール

Istio の Custom Resource Definitions (以下 CRDs) をインストールします。Kubernetes の CRDs は独自のカスタムリソースを定義し追加するものです。Kubernets API Server を介して作成することで作成したリソースの CRUD の API が Kubernetes API に追加されます。

先程ダウンロードした Istio のディレクトリに crds.yaml があるのでそれを適用します。

```bash
kubectl apply -f install/kubernetes/helm/istio/templates/crds.yaml
```

### Helm Template を使って Istio の Core Components をインストール

Helm Template の仕組みをつかって Istio の Core Components をインストールします。まず Helm Template を出力し istio-system というネームスペースを作成、その後生成した Template を用いて kubectl コマンドで適用します。

```bash
helm template install/kubernetes/helm/istio --name istio --namespace istio-system > ./istio.yaml
kubectl create namespace istio-system
kubectl apply -f ./istio.yaml
```

### 状態の確認

この状態で service と pods の状態を確認してみます。

```bash
kubectl get svc -n istio-system
NAME                     TYPE           CLUSTER-IP       EXTERNAL-IP   PORT(S)                                                                                                                   AGE
istio-citadel            ClusterIP      10.100.143.194   <none>        8060/TCP,9093/TCP                                                                                                         55s
istio-egressgateway      ClusterIP      10.108.243.97    <none>        80/TCP,443/TCP                                                                                                            55s
istio-galley             ClusterIP      10.98.99.11      <none>        443/TCP,9093/TCP                                                                                                          55s
istio-ingressgateway     LoadBalancer   10.97.17.220     <pending>     80:31380/TCP,443:31390/TCP,31400:31400/TCP,15011:30080/TCP,8060:31309/TCP,853:31151/TCP,15030:30455/TCP,15031:30836/TCP   55s
istio-pilot              ClusterIP      10.102.75.110    <none>        15010/TCP,15011/TCP,8080/TCP,9093/TCP                                                                                     55s
istio-policy             ClusterIP      10.101.145.62    <none>        9091/TCP,15004/TCP,9093/TCP                                                                                               55s
istio-sidecar-injector   ClusterIP      10.107.131.48    <none>        443/TCP                                                                                                                   55s
istio-telemetry          ClusterIP      10.96.248.64     <none>        9091/TCP,15004/TCP,9093/TCP,42422/TCP                                                                                     55s
prometheus               ClusterIP      10.98.228.190    <none>        9090/TCP                                                                                                                  55s
```

```bash
kubectl get pods -n istio-system
NAME                                     READY     STATUS              RESTARTS   AGE
istio-citadel-55cdfdd57c-64tnn           0/1       ContainerCreating   0          1m
istio-cleanup-secrets-x6dmj              0/1       Completed           0          1m
istio-egressgateway-7798845f5d-qfx2k     1/1       Running             0          1m
istio-galley-76bbb946c8-5l626            0/1       ContainerCreating   0          1m
istio-ingressgateway-78c6d8b8d7-68r2z    1/1       Running             0          1m
istio-pilot-5fcb895bff-pmg8z             0/2       Pending             0          1m
istio-policy-7b6cc95d7b-w7ndg            2/2       Running             0          1m
istio-security-post-install-jcwg5        0/1       Completed           0          1m
istio-sidecar-injector-9c6698858-8lt92   0/1       ContainerCreating   0          1m
istio-telemetry-bfc9ff784-2mzzj          2/2       Running             0          1m
prometheus-65d6f6b6c-nttwz               0/1       ContainerCreating   0          1m
```

## サンプルアプリケーションのデプロイ

先程ダウンロードした Istio のディレクトリにサンプルアプリケーション 'bookinfo' がありますのでそれをデプロイしてみます。
デプロイ方法は2パターンあります。

方法1. istioctl を使ってアプリの yaml に対して sidecar を記すよう変換しそれを kubctl apply します。

```bash
kubectl apply -f <(istioctl kube-inject -f samples/bookinfo/platform/kube/bookinfo.yaml)
```

方法2. Sidecar Injection をデフォルトの動きとして設定し kubectl apply します

```bash
kubectl label namespace default istio-injection=enabled
kubectl apply -f samples/bookinfo/platform/kube/bookinfo.yam
```

最後にアプリケーションの状態を確認します

```bash
kubectl get svc
NAME          TYPE        CLUSTER-IP       EXTERNAL-IP   PORT(S)    AGE
details       ClusterIP   10.111.252.7     <none>        9080/TCP   17s
kubernetes    ClusterIP   10.96.0.1        <none>        443/TCP    6m
productpage   ClusterIP   10.108.205.216   <none>        9080/TCP   10s
ratings       ClusterIP   10.102.161.24    <none>        9080/TCP   14s
reviews       ClusterIP   10.106.18.105    <none>        9080/TCP   12s
```

```bash
kubectl get pods
NAME                              READY     STATUS            RESTARTS   AGE
details-v1-5458f64c65-svrr7       0/2       PodInitializing   0          48s
productpage-v1-577c9594b7-4f49s   0/2       Init:0/1          0          43s
ratings-v1-79467df9b5-vrx4w       0/2       PodInitializing   0          47s
reviews-v1-5d46b744bd-686s9       0/2       Init:0/1          0          46s
reviews-v2-7f7d7f99f7-xsvm8       0/2       Init:0/1          0          46s
reviews-v3-7bc67f66-cmt4x         0/2       Init:0/1          0          45s
```

## まとめ

プロダクション環境を想定した Istio 構築と言っても Helm Template を用いて簡単に操作できることが分かりました。

またここで重要なのはサンプルアプリケーション 'bookinfo' の Kubenetes Pods に Envoy プロキシを Sidecar 的に配置するための変換コマンドとして

```bash
kubectl apply -f <(istioctl kube-inject -f samples/bookinfo/platform/kube/bookinfo.yaml)
```

が用いられていることです。下記の操作を実行してみるとよくわかるでしょう。

```bash
istioctl kube-inject -f samples/bookinfo/platform/kube/bookinfo.yaml > ./bookinfo.sidecar.yaml
diff -u bookinfo.yaml bookinfo.sidecar.yaml
```

差分が長くなるためここでは省略しますが元の bookinfo.yaml には記されていなかった sidecar の文字が読み取れると思います。アプリに隣接した pods に Envoy が起動している pods が Sidecar 的に配置され下記のような構成になりました。

```
              ingress          "python"            "java"            "nodejs"
           +-----------+    +-------------+    +-------------+    +-------------+
           | +-------+ |    |  +-------+  |    |  +-------+  |    |  +-------+  |
request -> | | envoy | | -> |  | envoy |  | -> |  | envoy |  | -> |  | envoy |  |
           | +-------+ |    |  +-------+  |    |  +-------+  |    |  +-------+  |
           +-----------+    | productpage |    |  review-v1  |    |   ratings   |
                            +-------------+    +-------------+    +-------------+
           
                                               +-------------+
                                               |  +-------+  |
                                               |  | envoy |  |
                                               |  +-------+  |
                                               |  review-v2  |
                                               +-------------+
           
                                               +-------------+
                                               |  +-------+  |
                                               |  | envoy |  |
                                               |  +-------+  |
                                               |  review-v3  |
                                               +-------------+
           
                                               +-------------+
                                               |  +-------+  |
                                               |  | envoy |  |
                                               |  +-------+  |
                                               |   details   |
                                               +-------------+
                                                    ruby
```

## 参考 URL

- https://istio.io/docs/setup/kubernetes/quick-start/
- https://istio.io/docs/examples/bookinfo/
- https://istio.io/docs/setup/kubernetes/helm-install/
