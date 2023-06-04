---
title: "手軽にローカルで Argo Rollouts, Istio, Prometheus で Progressive Delivery を試す"
date: 2023-06-03T05:55:09+09:00
Categories: ["infrastructure"]
draft: false
---
こんにちは。[jedipunkz🚀](https://twitter.com/jedipunkz) です。

以前[こちらの PipeCD 検証の記事](https://jedipunkz.github.io/post/ecs-pipecd/) で Progressive Deliver について調査したのですが、Kubernetes でこの Progressive Delivery を実現する方法を調べておきたいなと思って手元の Macbook 上で検証してみたのでその際の手順を記そうかと思います。

## Progressive Delivery の概要

ここで概要だけ記しておきます。Canary リリースは新しいデプロイメントをある程度の割合だけリリースし、徐々にリリースを進行させるデプロイ方式ということはご存知だと思いますが、Progressive Delivery はその過程で

- 新しいデプロイメントの統計情報を得る
- 予め定義したデプロイ成功定義に対して条件満たしているかを過程毎にチェックする
- チェック OK であれば次の過程にデプロイを進める
- 予め定義した幾つかのデプロイ過程を全て終えるとデプロイ完了となる

というステップを経ます。

## 用いるソフトウェア

Kubernetes で Progressive Delivery を実現するには下記のソフトウェアを用いる事が可能です。
また今回の手順は MacOS を前提に記します。

- [Argo Rollouts](https://argo-rollouts.readthedocs.io/en/stable/b)
- [Prometheus](https://prometheus.io/)
- [Istio](https://istio.io/)
- Kubernetes (今回は Minikube を使いました)

## 事前の準備

### Istio

Istio をダウンロードします。

```shell
curl -L https://istio.io/downloadIstio | ISTIO_VERSION=17.2 sh -
```

Istio を Minikube にデプロイします。

```shell
cd istio-17.2
istioctl install --set profile=demo -y
```

Kubernetes Namespace `default` で起動した Pod が自動的に Envoy サイドカーを取得するように設定します。

```shell
kubectl label namespace default istio-injection=enabled
```

### Prometheus

下記の Istio のディレクトリにある Manifest を用いる事で、Istio のメトリクスが自動的に Prometheus に収集されます。

```shell
kubectl apply -f https://raw.githubusercontent.com/istio/istio/release-1.17/samples/addons/prometheus.yaml
```

下記のコマンドを実施して Prometheus UI にアクセスします。コマンド実行と共に自動的にブラウザで UI ページへ遷移します。

```shell
minikube service -n istio-system prometheus
```

## Nginx コンテナで動作確認

Nginx のコンテナイメージを用いて動作確認を実施しようと思います。

### Deployment, Service のデプロイ

下記の内容を nginx.yaml というファイル名で保存します。

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: nginx
spec:
  replicas: 1
  selector:
    matchLabels:
      app: nginx
  template:
    metadata:
      labels:
        app: nginx
    spec:
      containers:
      - name: nginx
        image: nginx:1.23.4 # tag はあえて古くしています
        ports:
        - containerPort: 80

---
apiVersion: v1
kind: Service
metadata:
  name: nginx
spec:
  selector:
    app: nginx
  ports:
    - protocol: TCP
      port: 80
      targetPort: 80
```

下記の通りデプロイします。

```shell
kubectl apply -f nginx.yaml
```

### Istio Gateway のデプロイ

下記の内容を `nginx-istio.yaml` というファイル名で保存します。


```yaml
apiVersion: networking.istio.io/v1alpha3
kind: Gateway
metadata:
  name: nginx-gateway
spec:
  selector:
    istio: ingressgateway 
  servers:
  - port:
      number: 80
      name: http
      protocol: HTTP
    hosts:
    - "*"

---
apiVersion: networking.istio.io/v1alpha3
kind: VirtualService
metadata:
  name: nginx
spec:
  hosts:
  - "*"
  gateways:
  - nginx-gateway
  http:
  - match:
    - uri:
        exact: /
    route:
    - destination:
        host: nginx.default.svc.cluster.local
        port:
          number: 80
```

Istio Gateway をデプロイします。

```shell
kubectl apply -f nginx-istio.yaml
```

下記のコマンドを実行すると、Istio Gateway 経由で Nginx のコンテンツにアクセス出来ます。

```shell
minikube service istio-ingressgateway -n istio-system
|--------------|----------------------|-------------------|---------------------------|
|  NAMESPACE   |         NAME         |    TARGET PORT    |            URL            |
|--------------|----------------------|-------------------|---------------------------|
| istio-system | istio-ingressgateway | status-port/15021 | http://192.168.49.2:31483 |
|              |                      | http2/80          | http://192.168.49.2:30891 |
|              |                      | https/443         | http://192.168.49.2:31959 |
|              |                      | tcp/31400         | http://192.168.49.2:31196 |
|              |                      | tls/15443         | http://192.168.49.2:32100 |
|--------------|----------------------|-------------------|---------------------------|
🏃  Starting tunnel for service istio-ingressgateway.
|--------------|----------------------|-------------|------------------------|
|  NAMESPACE   |         NAME         | TARGET PORT |          URL           |
|--------------|----------------------|-------------|------------------------|
| istio-system | istio-ingressgateway |             | http://127.0.0.1:52115 |
|              |                      |             | http://127.0.0.1:52116 |
|              |                      |             | http://127.0.0.1:52117 |
|              |                      |             | http://127.0.0.1:52118 |
|              |                      |             | http://127.0.0.1:52119 |
|--------------|----------------------|-------------|------------------------|
```

実際には `http2/80` のポートにアクセスすることになるので上記の場合は `http://127.0.0.1:52116`  ブラウザでアクセスすると nginx のコンテンツにアクセス出来ます。上記の minikube コマンドを実行した状態でターミナルで loop しつつ curl でアクセスしておきます。これは Progressive Delivery の Analysis の定義で Istio メトリクスからステータスコードによる統計結果を記し利用するためです。

```shell
while true; do curl http://127.0.0.1:52116; sleep 1; done
```

### Argo Rollouts, Analysis の定義

Argo Rollouts の Rollout, Analysis を定義します。

Analysis を定義するため下記の内容を `nginx-analysis.yaml` というファイル名で保存します。

```yaml
apiVersion: argoproj.io/v1alpha1
kind: AnalysisTemplate
metadata:
  name: http-req-check
spec:
  args:
  - name: service-name
    value: nginx
  metrics:
  - name: request-success-rate
    interval: 1m
    successCondition: result[0] >= 0.95
    failureLimit: 1
    provider:
      prometheus:
        address: http://prometheus.istio-system:9090
        query: |
          sum(irate(
            istio_requests_total{reporter="source",destination_service=~"nginx.default.svc.cluster.local",response_code!~"5.*"}[5m]
          )) /
          sum(irate(
            istio_requests_total{reporter="source",destination_service=~"nginx.default.svc.cluster.local"}[5m]
          ))
```

このファイル中で Analysis が定義されているのですが、Prometheus へのクエリの定義も行っています。先程開いた Prometheus UI から上記のクエリが実際に実行できるか確認しておくと良いでしょう。上記のクエリを 🔍 マークに入力して `Execute` ボタンを押すだけです。


Analysis をデプロイします。

```shell
kubectl apply -f nginx-analysis.yaml
```

次に Rollout を定義するため下記の内容を `nginx-rollout.yaml` というファイル名で保存します。

```yaml
apiVersion: argoproj.io/v1alpha1
kind: Rollout
metadata:
  name: nginx
spec:
  replicas: 2
  selector:
    matchLabels:
      app: nginx
  strategy:
    canary:
      analysis:
        templates:
        - templateName: http-req-check
      maxUnavailable: 0
      maxSurge: 1
      steps:
      - setWeight: 30
      - pause:
          duration: "30s"
      - setWeight: 60
      - pause:
          duration: "30s"
      - setWeight: 100
      - pause:
          duration: "10s"
  template:
    metadata:
      labels:
        app: nginx
    spec:
      containers:
      - name: nginx
        image: nginx:1.23.4   # 使用するnginxのバージョンを指定
        ports:
        - containerPort: 80
---
apiVersion: v1
kind: Service
metadata:
  name: nginx
  labels:
    app: nginx
spec:
  ports:
  - port: 80
    targetPort: 80
  selector:
    app: nginx
```

Rollout をデプロイします。

```shell
kubectl apply -f nginx-rollout.yaml
```

### Progressive Delivery の進行状況を確認する

では実際に Progressive Delivery のデプロイ進行状況を確認していきます。

下記のコマンドで Argo Rollouts のデプロイ進行状況をウォッチし続ける事が可能です。新しいターミナルを起動して実行しておきます。

```shell
kubectl argo rollouts get rollout nginx --watch
```

まず `nginx:1.23.4` というイメージでデプロイされている様子が下記のように確認出来るはずです。Status: Healty となっています。

```
Name:            nginx
Namespace:       default
Status:          ✔ Healthy
Strategy:        Canary
  Step:          6/6
  SetWeight:     100
  ActualWeight:  100
Images:          nginx:1.23.4 (stable)
Replicas:
  Desired:       2
  Current:       2
  Updated:       2
  Ready:         2
  Available:     2

NAME                               KIND        STATUS     AGE  INFO
⟳ nginx                            Rollout     ✔ Healthy  24s
└──# revision:1
   └──⧉ nginx-8595d69c7f           ReplicaSet  ✔ Healthy  24s  stable
      ├──□ nginx-8595d69c7f-p5cxl  Pod         ✔ Running  24s  ready:2/2
      └──□ nginx-8595d69c7f-tvqx9  Pod         ✔ Running  24s  ready:2/2
```

新しいデプロイメントを行うためコンテナイメージのタグを更新してみます。下記の操作で行えます。

```shell
kubectl argo rollouts set image nginx nginx=nginx:1.24.0
```

Progressive Delivery の各過程が全て通過した状況を下記に記します。Revision: 2 の状態で Status: Healty となっている事が確認出来ます。

```shell
Name:            nginx
Namespace:       default
Status:          ✔ Healthy
Strategy:        Canary
  Step:          6/6
  SetWeight:     100
  ActualWeight:  100
Images:          nginx:1.24.0 (stable)
Replicas:
  Desired:       2
  Current:       2
  Updated:       2
  Ready:         2
  Available:     2

NAME                             KIND         STATUS        AGE    INFO
⟳ nginx                          Rollout      ✔ Healthy     2m35s
├──# revision:2
│  ├──⧉ nginx-67d8cf46           ReplicaSet   ✔ Healthy     81s    stable
│  │  ├──□ nginx-67d8cf46-jbjch  Pod          ✔ Running     81s    ready:2/2
│  │  └──□ nginx-67d8cf46-8rksc  Pod          ✔ Running     48s    ready:2/2
│  └──α nginx-67d8cf46-2         AnalysisRun  ✔ Successful  81s    ✔ 2
└──# revision:1
   └──⧉ nginx-8595d69c7f         ReplicaSet   • ScaledDown  2m35s
```

ここまで到達するために `nginx-rollout.yaml` で下記の通り定義した内容の各ステップを経ている事になります。実際に過程は 30%, 60%, 100% の割合で新しいデプロイメントをデプロイし、pause で指定した期間、Analysis でメトリクスを Prometheus にクエリを実行することで異常がないか計測し、問題なければその過程を終え、最終的に新しいデプロイメントの割合が 100% となります。

```yaml
      steps:
      - setWeight: 30
      - pause:
          duration: "30s"
      - setWeight: 60
      - pause:
          duration: "30s"
      - setWeight: 100
      - pause:
          duration: "10s"
```

## まとめ

比較的簡単に Progressive Delivery が実践出来ました。実際に運用する際にはもちろん Istio, Prometheus の設定は精査したほうがいいと思います。また Analysis の定義や Prometheus へのクエリも、環境やサービスの性質に合わせて調整する必要がありますが、今回紹介した構成が基本となると思っています。
