---
title: "Istio Sidecar Injection を理解する"
date: 2019-04-24T22:55:45+09:00
Categories: ["infrastructure"]
---
こんにちは。<a href="https://twitter.com/jedipunkz">@jedipunkz</a> です。

前回の記事 <a href="https://jedipunkz.github.io/blog/2018/12/31/istio/">「Istio, Helm を使って Getting Started 的なアプリをデプロイ」</a>で kubernetes 上で istio をインストールし sidecar injection を有効化しサンプルアプリケーションを起動しました。その結果、sidecar 的に envoy コンテナが起動するところまで確認しました。今回はもう少し単純な pod を用いて 'sidecar injection' の中身をもう少しだけ深掘りして見ていきたいと思います。

## Rquirements

記事と同等の動きを確認するために下記のソフトウェアが必要になります。
それぞれのソフトウェアは事前にインストールされた前提で記事を記していきます。

- macos or linux os
- kubectl
- istioctl
- minikube

## 参考 URL

下記の istio 公式ドキュメントを参考に動作確認しました。

- https://istio.io/docs/setup/kubernetes/additional-setup/sidecar-injection/
- https://istio.io/docs/setup/kubernetes/additional-setup/sidecar-injection/

## minikube で kubenetes をデプロイ

前回同様に minikube 上で動作を確認していきます。パラメータは適宜、自分の環境に読み替えてください。

```bash
minikube start --memory=8192 --cpus=4 --kubernetes-version=v1.10.0 \
  --extra-config=controller-manager.cluster-signing-cert-file="/var/lib/minikube/certs/ca.crt" \
  --extra-config=controller-manager.cluster-signing-key-file="/var/lib/minikube/certs/ca.key" \
  --vm-driver=virtualbox
```

## istio を稼働させる

下記のコマンドを用いてカレントディレクトリに istio のサンプル yaml が入ったフォルダを展開します。

```bash
curl -L https://git.io/getLatestIstio | sh -
```

次に下記のコマンドで kubernetes 上に istio をインストールします。
istio コンテナ間の通信をプレインテキスト or TLS で行うよう istio-demo.yml を apply しています。

```bash
cd istio-1.1.3/
kubectl apply -f install/kubernetes/helm/istio-init/files/crd-10.yaml
kubectl apply -f install/kubernetes/helm/istio-init/files/crd-11.yaml
kubectl apply -f install/kubernetes/helm/istio-init/files/crd-certmanager-10.yaml
kubectl apply -f install/kubernetes/helm/istio-init/files/crd-certmanager-11.yaml
kubectl apply -f install/kubernetes/istio-demo.yaml
```

稼働状況を確認します。まず Service の状態です。

```bash
kubectl get svc -n istio-system
NAME                     TYPE           CLUSTER-IP       EXTERNAL-IP   PORT(S)                                                                                                                                      AGE
grafana                  ClusterIP      10.98.111.63     <none>        3000/TCP                                                                                                                                     9s
istio-citadel            ClusterIP      10.97.197.128    <none>        8060/TCP,15014/TCP                                                                                                                           8s
istio-egressgateway      ClusterIP      10.96.35.77      <none>        80/TCP,443/TCP,15443/TCP                                                                                                                     9s
istio-galley             ClusterIP      10.100.143.114   <none>        443/TCP,15014/TCP,9901/TCP                                                                                                                   9s
istio-ingressgateway     LoadBalancer   10.105.202.136   <pending>     15020:30773/TCP,80:31380/TCP,443:31390/TCP,31400:31400/TCP,15029:31398/TCP,15030:32184/TCP,15031:31724/TCP,15032:30064/TCP,15443:30160/TCP   9s
istio-pilot              ClusterIP      10.102.53.62     <none>        15010/TCP,15011/TCP,8080/TCP,15014/TCP                                                                                                       8s
istio-policy             ClusterIP      10.105.107.53    <none>        9091/TCP,15004/TCP,15014/TCP                                                                                                                 8s
istio-sidecar-injector   ClusterIP      10.104.82.138    <none>        443/TCP                                                                                                                                      8s
istio-telemetry          ClusterIP      10.97.117.166    <none>        9091/TCP,15004/TCP,15014/TCP,42422/TCP                                                                                                       8s
jaeger-agent             ClusterIP      None             <none>        5775/UDP,6831/UDP,6832/UDP                                                                                                                   7s
jaeger-collector         ClusterIP      10.107.35.224    <none>        14267/TCP,14268/TCP                                                                                                                          7s
jaeger-query             ClusterIP      10.108.172.46    <none>        16686/TCP                                                                                                                                    7s
kiali                    ClusterIP      10.107.129.129   <none>        20001/TCP                                                                                                                                    8s
prometheus               ClusterIP      10.109.114.141   <none>        9090/TCP                                                                                                                                     8s
tracing                  ClusterIP      10.108.154.22    <none>        80/TCP                                                                                                                                       7s
zipkin                   ClusterIP      10.96.151.43     <none>        9411/TCP                                                                                                                                     7s
```

Pod の状態です。

```bash
kubectl get pods -n istio-system
NAME                                      READY   STATUS      RESTARTS   AGE
grafana-688b8999cd-d4clx                  1/1     Running     0          115m
istio-citadel-5749f4b6dd-jd6qm            1/1     Running     0          115m
istio-cleanup-secrets-1.1.3-mv8lq         0/1     Completed   0          115m
istio-egressgateway-666b76dbf7-mjjx6      1/1     Running     0          115m
istio-galley-d68bdc684-nwtzz              1/1     Running     0          115m
istio-grafana-post-install-1.1.3-gkn4s    0/1     Completed   0          115m
istio-ingressgateway-d67598f4-pwddm       1/1     Running     0          115m
istio-pilot-865f6997cd-7jmq4              2/2     Running     0          115m
istio-policy-56957d4666-vljk9             2/2     Running     5          115m
istio-security-post-install-1.1.3-f894p   0/1     Completed   0          115m
istio-sidecar-injector-5cf67ccc65-9p69k   1/1     Running     0          115m
istio-telemetry-786796559d-dqwr2          2/2     Running     5          115m
istio-tracing-5d8f57c8ff-xps9b            1/1     Running     0          115m
kiali-95fcf457f-kfdhp                     1/1     Running     0          115m
prometheus-5554746896-ccs5x               1/1     Running     0          115m
```

## istio-injection な状態でサンプル pod コンテナ 'sleep' を起動

ここで sleep コマンドが起動するだけの pod コンテナを istio-injection=enabled な状態でデプロイします。まず先程ダウンロードしたディレクトリ上の sleep.yaml を見てみましょう。

```bash
cat sample/sleep/sleep.yaml
apiVersion: v1
kind: ServiceAccount
metadata:
  name: sleep
---
apiVersion: v1
kind: Service
metadata:
  name: sleep
  labels:
    app: sleep
spec:
  ports:
  - port: 80
    name: http
  selector:
    app: sleep
---
apiVersion: extensions/v1beta1
kind: Deployment
metadata:
  name: sleep
spec:
  replicas: 1
  template:
    metadata:
      labels:
        app: sleep
    spec:
      serviceAccountName: sleep
      containers:
      - name: sleep
        image: pstauffer/curl
        command: ["/bin/sleep", "3650d"]
        imagePullPolicy: IfNotPresent
---
```

この yaml ファイルを用いるのですが、istioctl コマンドのサブコマンド `kube-inject` を用いることでこの元となる yaml ファイルを istio-injection=enabled な状態の yaml ファイルに変換することが出来ます。よって kubectl コマンドで apply する手順は下記になります。

```
kubectl apply -f <(istioctl kube-inject -f samples/sleep/sleep.yaml)
```

## デプロイされた状態を確認し sidecar コンテナを知る

デプロイされた Deployment を見てみましょう。

```
kubectl get deployments sleep -o yaml
apiVersion: extensions/v1beta1
kind: Deployment
metadata:
  annotations:
    deployment.kubernetes.io/revision: "1"
<snip>
    spec:
      containers:
      - command:
        - /bin/sleep
        - 3650d
        image: pstauffer/curl
        imagePullPolicy: IfNotPresent
        name: sleep
<snip>
        image: docker.io/istio/proxyv2:1.1.3
        imagePullPolicy: IfNotPresent
        name: istio-proxy
        ports:
        - containerPort: 15090
<snip>
        image: docker.io/istio/proxy_init:1.1.3
        imagePullPolicy: IfNotPresent
        name: istio-init
<snip>
```

`pstauffer/curl` イメージ内で '/bin/sleep' コマンドが起動しているコンテナと隣接して `istio-proxy` と `istio-init` というコンテナが起動していることが確認出来ると思います。それぞれの役割は下記のとおりです。

- istio-proxy : 他の istio からの通信をサービスコンテナに中継するためのコンテナ
- istio-init : istio-proxy コンテナを介す通信を iptables で制御するためのコンテナ

これらが istio を用いることで起動した sidecar コンテナとなります。

下記の通り pods を describe することでもこれらのコンテナが稼働していることが分かります。

```bash
kubectl describe pod sleep-759d5cb4ff-btqvl
<snip>
Init Containers:
  istio-init:
    Container ID:  docker://ded035851fa141997fdca47a0c317203cda650a0f9dce2f8d46ab264aa0e168b
    Image:         docker.io/istio/proxy_init:1.1.3
    Image ID:      docker-pullable://istio/proxy_init@sha256:000d022d27c198faa6cc9b03d806482d08071e146423d6e9f81aa135499c4ed3
    Port:          <none>
    Host Port:     <none>
<snip>
Containers:
  sleep:
    Container ID:  docker://b6121c749a2eb394b81728063046eb0eb48ea1b48c464debe395e4b58768513c
    Image:         pstauffer/curl
    Image ID:      docker-pullable://pstauffer/curl@sha256:2663156457abb72d269eb19fe53c2d49e2e4a9fdcb9fa8f082d0282d82eb8e42
    Port:          <none>
    Host Port:     <none>
<snip>
  istio-proxy:
    Container ID:  docker://0baee18b7d6ecec985b61fd10eff3409131245d390fad8f274d420f0807bc941
    Image:         docker.io/istio/proxyv2:1.1.3
    Image ID:      docker-pullable://istio/proxyv2@sha256:b682918f2f8fcca14b3a61bbd58f4118311eebc20799f24b72ceddc5cd749306
    Port:          15090/TCP
    Host Port:     0/TCP
```

## sidecar のテンプレートとなる configmap を確認する

今回 istio-injection=enabled な状態で 'sleep' コンテナをデプロイし本体のコンテナとは別に sidecar なコンテナ2つが稼働することが確認できました。次に説明するのが configmap です。どの様な状態でどの様なコンテナを sidecar 的に稼働させるかのルールを記したものが `istio-sidecar-injector` という configmap になります。その configmap の内容を確認してみましょう。


```bash
kubectl -n istio-system get configmap istio-sidecar-injector -o=jsonpath='{.data.config}'
policy: enabled
template: |-
  rewriteAppHTTPProbe: false
  initContainers:
  [[ if ne (annotation .ObjectMeta `sidecar.istio.io/interceptionMode` .ProxyConfig.InterceptionMode) "NONE" ]]
  - name: istio-init
    image: "docker.io/istio/proxy_init:1.1.3"
    args:
    - "-p"
    - [[ .MeshConfig.ProxyListenPort ]]
    - "-u"
    - 1337
    - "-m"
    - [[ annotation .ObjectMeta `sidecar.istio.io/interceptionMode` .ProxyConfig.InterceptionMode ]]
    - "-i"
    - "[[ annotation .ObjectMeta `traffic.sidecar.istio.io/includeOutboundIPRanges`  "*"  ]]"
    - "-x"
    - "[[ annotation .ObjectMeta `traffic.sidecar.istio.io/excludeOutboundIPRanges`  ""  ]]"
    - "-b"
    - "[[ annotation .ObjectMeta `traffic.sidecar.istio.io/includeInboundPorts` (includeInboundPorts .Spec.Containers) ]]"
    - "-d"
    - "[[ excludeInboundPort (annotation .ObjectMeta `status.sidecar.istio.io/port`  15020 ) (annotation .ObjectMeta `traffic.sidecar.istio.io/excludeInboundPorts`  "" ) ]]"
    [[ if (isset .ObjectMeta.Annotations `traffic.sidecar.istio.io/kubevirtInterfaces`) -]]
    - "-k"
    - "[[ index .ObjectMeta.Annotations `traffic.sidecar.istio.io/kubevirtInterfaces` ]]"
    [[ end -]]
    imagePullPolicy: IfNotPresent
    resources:
      requests:
        cpu: 10m
        memory: 10Mi
      limits:
        cpu: 100m
        memory: 50Mi
    securityContext:
      runAsUser: 0
      runAsNonRoot: false
      capabilities:
        add:
        - NET_ADMIN
    restartPolicy: Always
  [[ end -]]
  containers:
  - name: istio-proxy
    image: [[ annotation .ObjectMeta `sidecar.istio.io/proxyImage`  "docker.io/istio/proxyv2:1.1.3"  ]]
    ports:
    - containerPort: 15090
      protocol: TCP
      name: http-envoy-prom
    <snip>
```

この configmap から下記のパラメータが記されていることが分かります。

- コンテナイメージ
- CPU 割当
- メモリ割り当て
- 修正するために必要な権限
- ポート指定
- プロトコル
- etc..

## pod の iptables を確認してトラヒックを理解する

次に minikube のホストにログインしサービス pod (今回は 'sleep') に割り当てられた iptables の内容を確認してみましょう。

```bash
minikube ssh
docker ps | grep sleep
b6121c749a2e        pstauffer/curl             "/bin/sleep 3650d"       3 hours ago         Up 3 hours                              k8s_sleep_sleep-759d5cb4ff-btqvl_default_6f3f6854-6651-11e9-970b-080027d5d6a7_0
```

この docker id `b6121c749a2e' と nsenter コマンドを用いて pod (sleep) に適用されている iptables の内容を確認します。

```bash
docker inspect b6121c749a2e --format '{{ .State.Pid }}'
20066
```

```
sudo nsenter -t 20066 -n iptables -t nat -S
-P PREROUTING ACCEPT
-P INPUT ACCEPT
-P OUTPUT ACCEPT
-P POSTROUTING ACCEPT
-N ISTIO_IN_REDIRECT
-N ISTIO_OUTPUT
-N ISTIO_REDIRECT
-A OUTPUT -p tcp -j ISTIO_OUTPUT
-A ISTIO_IN_REDIRECT -p tcp -j REDIRECT --to-ports 15001
-A ISTIO_OUTPUT ! -d 127.0.0.1/32 -o lo -j ISTIO_REDIRECT
-A ISTIO_OUTPUT -m owner --uid-owner 1337 -j RETURN
-A ISTIO_OUTPUT -m owner --gid-owner 1337 -j RETURN
-A ISTIO_OUTPUT -d 127.0.0.1/32 -j RETURN
-A ISTIO_OUTPUT -j ISTIO_REDIRECT
-A ISTIO_REDIRECT -p tcp -j REDIRECT --to-ports 15001
```

結果から、この pod は INBOUND 通信のリダイレクト先ポートとして 15001 番ポートが指定されているのが分かります。このポートは istio-proxy が待ち受けているポートになります。また OUTBOUND 通信に関しても同様に 15001 番ポートにリダイレクトされているのが分かります。よって 'sleep' pod コンテナの全ての通信が istio-proxy を介すようになっています。また今回は単純に sleep するだけのコンテナを起動しましたが、http サーバ等を起動する pod を立ち上げた場合 `-A ISTIO_INBOUND -p tcp -m tcp --dport 80 -j ISTIO_IN_REDIRECT` といった制御も確認出来ると思います。

## まとめ

kubernetes 上に istio をインストールすることで、テストで起動した pod コンテナに隣接する形で sidecar コンテナ istio-proxy, istio-init コンテナが起動することが確認出来ました。またそれらのコンテナを起動するテンプレートとなる configmap の内容を確認することができました。この configmap は修正することが可能な様です。そしてこの pod コンテナのインバウンド・アウトバウンドの通信は全て istio-proxy コンテナにリダイレクトされていることも分かりました。また今回は configmap の内容を確認するに留まりましたが、istio の機能としては routing, service discovery 等も有しているため、次回は routing あたりを調べようかと思っています。この routing を操作することで今回確認した iptables の内容も変わってくるのではないでしょうか。

