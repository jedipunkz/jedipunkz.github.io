---
title: "ECS 以後の構成と Progressive Delivery の調査"
date: 2021-11-11T17:28:46+09:00
Categories: ["infrastructure"]
draft: false
---
こんにちは。[jedipunkz](https://twitter.com/jedipunkz) です。

今回は [READYFOR Advent Calendar 2021](https://qiita.com/advent-calendar/2020/readyfor) の記事として執筆します。

READYFOR では 2021 年の夏に AWS ECS へプラットフォーム移行をしました。ECS は自分達の要件を全て満たしてくれ運用コストも極小化できて更に周辺の技術も AWS 公式のものが揃っているので、とても満足している状況です。

移行を終えたばかりなので「では次のアーキテクチャは？」という話にはまだなっていないのですが、今は準備期間として余裕を持ってスケジューリングできる状態にして頂いているので、SRE チームとしては色々な技術をリサーチしている段階になります。

今現在は ECS + CodeDeploy を使って Blue/Green デプロイメントを実現しているのですが、よりモダンなデプロイ方式 Progressive Delivery について去年あたりから興味を持っていました。ただ、今までは実際に技術を触るまでには至っていなかったのでこの機会に色々と触ってみたという次第です。

今までも Blue/Green デプロイメント, Canary リリースとデプロイ方式が複数ありましたが、これらを含む継続的デリバリの次のステップと言われているのが Progressive Delivery です。2020年に Hashicorp 社の [Mitchell Hashimoto 氏](https://twitter.com/mitchellh) が来日した際に「今一番気になっているワード」としてあげていましたのが印象的でした。

## ECS を使った Canary リリース

Progressive Delivery の話をする前に ECS を使った Canary リリースについて少し触れておきます。
(具体的な話についても、どこかのタイミングで記事にできればと思っています)

AWS App Mesh と ECS, X-Ray を使って下記のような構成を作りました。この構成中の App Mesh の Virtual Router のルーティング情報を修正する形で Canary リリースのトラヒック操作が行えます。ECS 以前は Canary リリースを実現できていて ECS 導入によってそれがデグレした状態だったので、この構成の検証は一つの成果だったと思っていますし、今回話をする Progressive Delivery のひとつ前のステップとも考えています。

```
                             
                             +----------------+    +----------------+    +---------------+
                    App Mesh | VirtualGateway | -> | VirtualService | -> | VirtualRouter |
                             +----------------+    +----------------+    +---------------+
                                     |                                           |
+--------+    +-----+    +-----------+-----------+                       +---------------+    +---------------------+
| client | -> | NLB | -> | Envoy Gateway | X-Ray |                       |  VirtualNode  | -> | App | Envoy | X-ray | 
+--------+    +-----+    +-----------------------+                       +---------------+    +---------------------+
                         |         ECS           |                               |            |        ECS          |
                         +-----------------------+                               |            +---------------------+
                                                                                 |
                                                                         +---------------+    +---------------------+
                                                                         |  VirtualNode  | -> | App | Envoy | X-ray |
                                                                         +---------------+    +---------------------+
                                                                                              |        ECS          |
                                                                                              +---------------------+
```

## Progressive Delivery の基本的な考え方

継続的デリバリは下記の様な流れでデプロイを実施していましたが、

```
+---------+    +-------+    +------+    +--------+
| Develop | -> | Build | -> | Test | -> | Deploy |
+---------+    +-------+    +------+    +--------+
```

Progressive Delivery では下記の様になります。 (ref: https://static.sched.com/hosted_files/kccncna19/f2/Progressive%20Delivery%20%26%20Argo%20Rollouts.pdf)

```
+---------+    +---------+    +--------+
| Develop | -> |  Build  | -> |  Test  |
+---------+    +---------+    +--------+
                                   |
               +---------+    +--------+
               | Analyze | <- | Deploy |
               +---------+    +--------+
                    |              |
+---------+    +---------+    +--------+
| Rollback| <- | Success?| -> |Progress|
+---------+    +---------+    +--------+
            No             Yes
```

つまり、Canaly リリースをベースにする場合、

- 継続的デリバリと同様にビルド・テスト・デプロイを実施
- 徐々にトラヒックを Canary 環境へ寄せる
- Canary 環境に SLO をベースにしたテスト/メトリクスを元にしたクエリ実行を実施
- その結果、閾値を下回る場合はロールバックを実施
- 逆に下回らない場合はトラヒック操作を継続して、デプロイ継続

という流れなります。この Analyze (Analysis) というステップが追加されているのと、その結果自動的にロールバックさせる点が今までのデプロイ方式と異なる点です。

## 実際に調査した技術たち

実査に動かしてみたり、またはドキュメントベースで調査した技術は下記の通りです。

- [ArogCD Rollouts](https://argoproj.github.io/argo-rollouts/)
- [Flagger](https://flagger.app/)
- [PipeCD](https://pipecd.dev/)

### マルチクラウド・プラットフォーム対応

まず ArgoCD Rollouts と Flagger は Kubernetes が前提になります。その点で PipeCD は AWS ECS にも対応しています。がもちろん Kubernetes にも対応しています。ちなみに PipeCD は日本国内のエンジニアの方々が開発に携わっています。国内初 OSS として世界に広まればいいなと個人的に考えています。

### マルチ Analysis プロバイダ対応

Analysis でテスト・メトリクス収集とそれを元にしたクエリを発行する、と上記に記しましたが、その取得方法や利用できるソフトウェア or サービスに関してもそれぞれ複数対応している様です。代表的なものは下記になります。

- Prometheus
- Datadog
- AWS Cloudwatch
- New Relic
- Graphite
- Google Stackdriver
- InfluxDB
- etc...

### 実査に Analysis のコンフィギュレーションを見てみる

実際に Analysis のコンフィギュレーションを見て理解を深めたいと思います。下記は ArogCD Rollouts の Prometheus の Analysis のコンフィギュレーションです。

```yaml
apiVersion: argoproj.io/v1alpha1
kind: AnalysisTemplate
metadata:
  name: success-rate
spec:
  args:
  - name: service-name
  metrics:
  - name: success-rate
    interval: 5m
    successCondition: result[0] >= 0.95
    failureLimit: 3
    provider:
      prometheus:
        address: http://prometheus.example.com:9090
        query: |
          sum(irate(
            istio_requests_total{reporter="source",destination_service=~"{{args.service-name}}",response_code!~"5.*"}[5m]
          )) / 
          sum(irate(
            istio_requests_total{reporter="source",destination_service=~"{{args.service-name}}"}[5m]
          ))
```

Analysis に関わる Kubernetes CRD であると見てわかると思います。下記にこのコンフィギュレーションの意味を記します。

- interval でクエリを発行する間隔を指定
- successCondition でクエリ結果の閾値を指定
- failtureLimit で最大失敗許可数を指定
- provider.prometheus で Prometheus プロバイダ利用を宣言
- address で Prometheus Server の URL を指定
- query で Prometheus Server 上で実行するクエリを指定

よって、前述した SLO というのがこのクエリに相当すると考えています。SLO をクエリベースで定義することによって、SLO に即さない場合は自動的に古いアプリケーションへロールバックする、という仕組みです。

ただご存知のように SLO はこのようなデプロイの短い期間での計測に指定することが適しているのか？という話はあると思っていて、あくまでもデプロイを前提とした SLO という意味で定義するべきなのでは、と考えています。

## まとめ

ECS 移行を終えて次のステップを検討するにあたって Progressive Delivery を考えるのは着眼点としては良いと個人的には考えています。が ECS を選択したことによって、Progressive Delivery を実践するための技術の選択肢が狭まったのは事実で、ECS 以後のアーキテクチャを検討する際にこの点はネックになりそう、と考えています。2021年12月時点では PipeCD 以外にそれを実現する技術を見つけられていません。

また、Canary リリースに対して Analisys とその結果の自動ロールバックという要素さえ追加できれば、Progressive Delivery が実現できるのも事実です。前述したように App Mesh と ECS によって Canary リリースは実現できているので、Analisys と 自動ロールバックを実現する仕組みを自社で Lambda などを使って開発できれば良いのではと考え始めています。ですが、もちろん汎用性がないですし運用・保守のコストをかけてまで実践するのか、という問題はありそうです。

ということで Progressive Delivery をポイントにした次期アーキテクチャについて、今考えていることを記させていただきました。
