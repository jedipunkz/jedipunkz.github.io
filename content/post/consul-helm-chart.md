---
title: "Consul Helm Chart で Kubernetes 上に Consul をデプロイ"
date: 2019-04-26T17:08:02+09:00
Categories: ["infrastructure"]
description: "Hashicorp Consul Helm Chart を使った Kubernetes 上での Consul クラスタのデプロイ方法"
aliases: ["/blog/2019/04/26/consul-helm-chart/"]
---
こんにちは。<a href="https://twitter.com/jedipunkz">@jedipunkz</a> です。

今回は Hashicorp の Consul クラスタを Kubernetes 上で稼働させる方法について調べてみました。

Hashicorp Consul はサービスディスカバリが行えるソフトウェアで、私も以前居た職場で利用していました。アプリケーション間で互いに接続先を確認し合う事が出来ます。以前構築した Consul クラスタはインスタンス上に直に起動していたのですが最近だとどうやってデプロイするのか興味を持ち Kubernetes 上にデプロイする方法を調べた所 Helm を使って簡単にデプロイ出来る事が分かりました。

また今回は minikube を使って複数のレプリカを起動するようにしていますが、Helm Chart を用いると Kubernetes のノード毎に Consul Pod が1つずつ起動するようになっていて、ノードの障害を考慮した可用性という点でも優れているなぁと感じました。また Kubernetes の Pod ですのでプロセスが落ちた際に即座に再起動が行われるという点でも優れています。勿論 Consul クラスタの Leader が落ちた場合には Leader Election (リーダ昇格のための選挙) が行われ、直ちに隣接した Kubernetes ノード上の Consul Pod がリーダーに昇格します。といった意味でも Kubernetes 上に Consul をデプロイするという考えは優れているのではないでしょうか。

### Requirements

下記のソフトウェアが事前に必要です。この手順では予めこれらがインストールされていることとして記していきます。

- minikube
- kubectl
- helm

### Consul クラスタ起動までの手順

早速ですが手順を記していきます。

Hashicorp の Github にて Consul の Helm Chart が公開されています。`helm search` しても出てきますが、今回は Github のものを用いました。

```bash
git clone https://github.com/hashicorp/consul-helm.git
cd consul-helm
git checkout v0.7.0
```

次にコンフィギュレーションを記した yaml ファイルを生成 (修正) します。本来、Kubernetes のノード毎に1つずつの Pod が起動するようになっていて、逆に言うと1ノードに複数の Consul Pod は起動しません。今回は手元も端末の minikube でお手軽に試せるようレポジトリ上のファイル value.yml を下記のように修正加えました。この手順は Github の Issue https://github.com/hashicorp/consul-helm/issues/13 で記されています。

もちろん、minikube ではなく Kubernetes 環境を利用できる方はこの手順は飛ばして構いません。

```yaml
  # 下記はコメントアウト
  # affinity: |
  #   podAntiAffinity:
  #     requiredDuringSchedulingIgnoredDuringExecution:
  #       - labelSelector:
  #           matchLabels:
  #             app: {{ template "consul.name" . }}
  #             release: "{{ .Release.Name }}"
  #             component: server
  #         topologyKey: kubernetes.io/hostname

  # minikube 用に下記を有効にする
  affinity: |
    podAntiAffinity:
      preferredDuringSchedulingIgnoredDuringExecution:
      - weight: 1
        podAffinityTerm:
          topologyKey: kubernetes.io/hostname
          labelSelector:
            matchExpressions:
            - key: component
              operator: In
              values:
              - "{{ .Release.Name }}-{{ .Values.Component }}"
```

kubectl, helm コマンドが minikube を向くように下記のようにコマンドを実行します。

```bash
kubectl config use-context minikube
helm init
```

Consul クラスタを helm を用いてデプロイします。下記のコマンドでデプロイが一気に完了します。

```bash
helm install --name consul .
```

暫くすると下記の通り Pods, Services の状態が確認出来ると思います。

```bash
$ kubectl get pods
NAME              READY   STATUS    RESTARTS   AGE
consul-q5s62      1/1     Running   0          21m
consul-server-0   1/1     Running   0          21m
consul-server-1   1/1     Running   0          21m
consul-server-2   1/1     Running   0          21m
$ kubectl get services
NAME            TYPE        CLUSTER-IP      EXTERNAL-IP   PORT(S)                                                                   AGE
consul-dns      ClusterIP   10.108.171.87   <none>        53/TCP,53/UDP                                                             22m
consul-server   ClusterIP   None            <none>        8500/TCP,8301/TCP,8301/UDP,8302/TCP,8302/UDP,8300/TCP,8600/TCP,8600/UDP   22m
consul-ui       ClusterIP   10.107.40.197   <none>        80/TCP                                                                    22m
kubernetes      ClusterIP   10.96.0.1       <none>        443/TCP                                                                   48m
```

起動した Consul クラスタの状態を確認してみます。`consul members` コマンドを各 Pod 上で実行すると、クラスタに Join しているノード (この場合 Consul Pod) の状態を一覧表示出来ます。minikube ノードにも consul-agent が起動していることが確認出来ます。

```bash
$ for i in {0..2}; do kubectl exec consul-server-$i -- sh -c 'consul members'; done
Node             Address          Status  Type    Build  Protocol  DC   Segment
consul-server-0  172.17.0.6:8301  alive   server  1.4.4  2         dc1  <all>
consul-server-1  172.17.0.7:8301  alive   server  1.4.4  2         dc1  <all>
consul-server-2  172.17.0.8:8301  alive   server  1.4.4  2         dc1  <all>
minikube         172.17.0.5:8301  alive   client  1.4.4  2         dc1  <default>
Node             Address          Status  Type    Build  Protocol  DC   Segment
consul-server-0  172.17.0.6:8301  alive   server  1.4.4  2         dc1  <all>
consul-server-1  172.17.0.7:8301  alive   server  1.4.4  2         dc1  <all>
consul-server-2  172.17.0.8:8301  alive   server  1.4.4  2         dc1  <all>
minikube         172.17.0.5:8301  alive   client  1.4.4  2         dc1  <default>
Node             Address          Status  Type    Build  Protocol  DC   Segment
consul-server-0  172.17.0.6:8301  alive   server  1.4.4  2         dc1  <all>
consul-server-1  172.17.0.7:8301  alive   server  1.4.4  2         dc1  <all>
consul-server-2  172.17.0.8:8301  alive   server  1.4.4  2         dc1  <all>
minikube         172.17.0.5:8301  alive   client  1.4.4  2         dc1  <default>
```

次に Consul のリーダーがどの Pod なのかを確認してみます。下記の結果から consule-server-2 という Pod がリーダーだと分かります。

```bash
$ for i in {0..2}; do kubectl exec consul-server-$i -- sh -c 'consul info | grep leader'; done
        leader = false
        leader_addr = 172.17.0.8:8300
        leader = false
        leader_addr = 172.17.0.8:8300
        leader = true
        leader_addr = 172.17.0.8:8300
```

この状態で consule-server-2 Pod を削除してみます。削除しても Kubernetes Pod なので即座に再作成・起動がされるのですが、Consul 的には「リーダーが落ちた」という判断が下り、リーダー選出のための選挙が consule-server-0, consul-server-1 の 2 Pods で行われます。

```bash
$ kubectl delete pod consul-server-2
```

下記が consul-server-0 で確認した Consul プロセスのログになります。"consul: New leader elected: consul-server-1" と表示され新たに consul-server-1 Pod がリーダーに選出されたことが確認出来ます。

```
$ kubectl logs consul-server-0
<snip>
    2019/04/26 07:31:22 [INFO] serf: EventMemberLeave: consul-server-2.dc1 172.17.0.8
    2019/04/26 07:31:22 [INFO] consul: Handled member-leave event for server "consul-server-2.dc1" in area "wan"
    2019/04/26 07:31:26 [INFO] serf: EventMemberLeave: consul-server-2 172.17.0.8
    2019/04/26 07:31:26 [INFO] consul: Removing LAN server consul-server-2 (Addr: tcp/172.17.0.8:8300) (DC: dc1)
    2019/04/26 07:31:29 [WARN] raft: Rejecting vote request from 172.17.0.7:8300 since we have a leader: 172.17.0.8:8300
    2019/04/26 07:31:33 [WARN] raft: Heartbeat timeout from "172.17.0.8:8300" reached, starting election
    2019/04/26 07:31:33 [INFO] raft: Node at 172.17.0.6:8300 [Candidate] entering Candidate state in term 3
    2019/04/26 07:31:36 [ERR] agent: Coordinate update error: No cluster leader
    2019/04/26 07:31:36 [INFO] serf: EventMemberJoin: consul-server-2 172.17.0.8
    2019/04/26 07:31:36 [INFO] consul: Adding LAN server consul-server-2 (Addr: tcp/172.17.0.8:8300) (DC: dc1)
    2019/04/26 07:31:37 [INFO] serf: EventMemberJoin: consul-server-2.dc1 172.17.0.8
    2019/04/26 07:31:37 [INFO] consul: Handled member-join event for server "consul-server-2.dc1" in area "wan"
    2019/04/26 07:31:37 [INFO] raft: Node at 172.17.0.6:8300 [Follower] entering Follower state (Leader: "")
    2019/04/26 07:31:37 [INFO] consul: New leader elected: consul-server-1
<snip>
```

先程と同様にリーダーの確認を下記の通り行います。

```bash
$ for i in {0..2}; do kubectl exec consul-server-$i -- sh -c 'consul info | grep leader'; done
        leader = false
        leader_addr = 172.17.0.7:8300
        leader = true
        leader_addr = 172.17.0.7:8300
        leader = false
        leader_addr = 172.17.0.7:8300
```

### コンフィギュレーションの例

今回レポジトリ上にある value.yaml を一部修正しただけでしたが、yaml 内にある各設定値を変更することで構成を変更することが可能です。各設定値については下記のサイトに詳細が記されています。公式のドキュメントになります。

https://www.consul.io/docs/platform/k8s/helm.html

設定値の例をあげると...

- server - replicas

replicas はレプリカ数。Consul クラスタの Pod 数になります。但し冒頭で述べたとおり Consul Helm Chat は各 Kubernetes ノードに対して 1 Pod の原則で起動しますので、その点認識しておく必要があります。

- server - bootstrapExpect

何台の Consul クラスタ Pod が起動していればリーダー選出を行うか？の設定値です。

- server - storageClass

デフォルトはローカルディスクです。Ceph 等を選択することも可能です。

- client - grpc

agent が gRPC リスナを持つかどうかです。true に設定すると gRPC リスナが 8502 番ポートで起動します。

### まとめ

Kubernetes 上で Helm を使って簡単に Consul クラスタをデプロイ出来る事が分かりました。また運用を考慮された設計になっていることも確認出来ました。ロードバランサを用いずとも、アプリケーション間、API 間で互いに正常に可動している先をディスカバリし接続し合えるという点で Consul はとても有用なので Kubernetes を用いたアーキテクチャにも適しているのではないでしょうか。
