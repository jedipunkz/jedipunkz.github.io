+++
categories = ["infrastructure"]
date = "2017-01-13T20:29:07+09:00"
title = "Kubernetes Deployments を使ってみた！"
author = "jedipunkz"
featuredpath = ""
description = "Kubernetes Replication Controller の次世代版 Deployments を使ってみました"
featuredalt = ""
featured = ""
linktitle = ""
aliases = ["/blog/2017/01/13/kubernetes-deployments/", "/blog/2017/01/13/kubernetes-deployments"]

+++
こんにちは。 @jedipunkz です。

いま僕らは職場では GKE 上に Replication Controller と Services を使って Pod を起動しているのですが最近の Kubernetes 関連のドキュメントを拝見すると Deployments を使っている記事をよく見掛けます。Kubernetes 1.2 から実装されたようです。今回は Kubernetes の Replication Controller の次世代版と言われている Deployments について調べてみましたので理解したことを書いていこうかと思います。

参考資料
----

今回は Kubernetes 公式の下記のドキュメントに記されているコマンドを一通り実行していきます。追加の情報もあります。

* https://kubernetes.io/docs/user-guide/deployments/

Deployments を使って nginx Pod を起動
----

nginx をデプロイするための Yaml ファイルを用意します。

```
apiVersion: extensions/v1beta1
kind: Deployment
metadata:
  name: nginx-deployment
spec:
  replicas: 2
  template:
    metadata:
      labels:
        app: nginx
    spec:
      containers:
      - name: nginx
        image: nginx:1.7.9
        ports:
        - containerPort: 80
```

作成した yaml ファイルを指定して Pod を作ります。
下記の通りここで "--record" と記しているのは、後に Deployments の履歴を表示する際に "何を行ったか" を出力するためです。このオプションを指定しないと "何を行ったか" の出力が "NONE" となります。

```
$ kubectl create -f nginx.yaml --record
```

ここで

* deployments
* replica set
* pod
* rollout

の状態をそれぞれ確認してみます。

```
$ kubectl get deployments
NAME               DESIRED   CURRENT   UP-TO-DATE   AVAILABLE   AGE
nginx-deployment   2         2         2            2           8s

$ kubectl get rs
NAME                          DESIRED   CURRENT   READY     AGE
nginx-deployment-4087004473   2         2         2         10s

$ kubectl get pods --show-labels
NAME                                READY     STATUS    RESTARTS   AGE       LABELS
nginx-deployment-4087004473-6csa7   1/1       Running   0          21s       app=nginx,pod-template-hash=4087004473
nginx-deployment-4087004473-teyzc   1/1       Running   0          21s       app=nginx,pod-template-hash=4087004473

$ kubectl rollout status deployment/nginx-deployment
deployment nginx-deployment successfully rolled out
```

結果から、下記の事が分かります。

* yaml に記した通り "nginx-deployment" という名前で deployment が生成された
* "nginx-deployment-4087004473" という名前の rs (レプリカセット) が生成された
* yaml に記した通り2つの Pod が起動した
* "nginx-deployment" が正常に Rollout された

Replication Controller でデプロイした際には作られない replica set, rollout というモノが出てきました。後に Deployments を使うメリットに繋がっていきます。

nginx イメージの Tag を更新してみる
---

ここで yaml ファイル内で指定していた "image: nginx:1.7.9" を "image: nginx:1.9.1" と更新してみます。
Replication Controller で言う Rolling-Update になります。後に述べますが他にも更新方法があります。

```
$ kubectl set image deployment/nginx-deployment nginx=nginx:1.9.1
```

ここで先ほどと同様に状態を確認してみます。

```
$ kubectl get deployments
NAME               DESIRED   CURRENT   UP-TO-DATE   AVAILABLE   AGE
nginx-deployment   2         2         2            2           2m

$ kubectl get rs
NAME                          DESIRED   CURRENT   READY     AGE
nginx-deployment-3599678771   2         2         2         39s
nginx-deployment-4087004473   0         0         0         2m

$ kubectl get pods
NAME                                READY     STATUS    RESTARTS   AGE
nginx-deployment-3599678771-0vj9m   1/1       Running   0          53s
nginx-deployment-3599678771-t1y62   1/1       Running   0          53s
```

ここで...

* 新しい Replica Set "nginx-deployment-3599678771" が作成された
* 古い Replica Set "nginx-deployment-4087004473" の Pod は 0 個になった
* Pod 内コンテナが更新された (NAME より判断)

となったことが分かります。
Replication Controller と異なり、Deployments では以前の状態が Replica Set として保存されていて状態の履歴が追えるようになっています。

ここで Rollout の履歴を確認してみます。

```
$ kubectl rollout history deployment/nginx-deployment
deployments "nginx-deployment"
REVISION        CHANGE-CAUSE
1               kubectl create -f nginx.yaml --record
2               kubectl set image deployment/nginx-deployment nginx=nginx:1.9.1
```

REVISION という名前で履歴番号が付き、どの様な作業を行ったか CHANGE-CAUSE という項目で記されていることがわかります。作業の履歴がリビジョン管理されています。

下記のように REVSION 番号を付与して履歴内容を表示することも可能です。

```
$ kubectl rollout history deployment/nginx-deployment --revision=2
deployments "nginx-deployment" with revision #2
  Labels:       app=nginx
        pod-template-hash=3599678771
  Annotations:  kubernetes.io/change-cause=kubectl set image deployment/nginx-deployment nginx=nginx:1.9.1
  Containers:
   nginx:
    Image:      nginx:1.9.1
    Port:       80/TCP
    Volume Mounts:      <none>
    Environment Variables:      <none>
  No volumes.
```

作業を切り戻してみる
----

先程 nginx の Image Tag を更新しましたが、ここで Deployments の機能を使って作業を切り戻してみます。下記の様に実行します。

```
$ kubectl rollout undo deployment/nginx-deployment
```

状態を確認します。

```
$ kubectl get deployments
NAME               DESIRED   CURRENT   UP-TO-DATE   AVAILABLE   AGE
nginx-deployment   2         2         2            2           5m

$ kubectl rollout history deployment/nginx-deployment
deployments "nginx-deployment"
REVISION        CHANGE-CAUSE
2               kubectl set image deployment/nginx-deployment nginx=nginx:1.9.1
3               kubectl create -f nginx.yaml --record
```

ここでは...

* コンテナが2個、正常に起動した
* REVISION 番号 3 として初期構築の状態 (kubectl create ..) が新たに保存

ということが分かります。注意したいのは REVSION 番号 1 が削除され 3 が生成されたことです。1 と 3 は同じ作業ということと推測します。

念のため 'nginx' コンテナの Image Tag が切り戻っているか確認してみます。

```
$ kubectl describe pod nginx-deployment-4087004473-nq35u | grep "Image:"
    Image:              nginx:1.7.9
```

最初の Yaml ファイルに記した 'nginx' イメージ Tag "1.7.9" となっていることが確認できました。set image ... でイメージ更新をした作業が正常に切り戻ったことになります。

レプリカ数を 2->3 へスケールしてみる
---

更に replicas の数値を 2 から 3 へスケールしてみます。

```
$ kubectl scale deployment nginx-deployment --replicas 3
```

同様に状態を確認してみます。

```
kubectl get pods
NAME                                READY     STATUS    RESTARTS   AGE
nginx-deployment-4087004473-esj5l   1/1       Running   0          6s
nginx-deployment-4087004473-nq35u   1/1       Running   0          4m
nginx-deployment-4087004473-tyibo   1/1       Running   0          4m

kubectl get rs
NAME                          DESIRED   CURRENT   READY     AGE
nginx-deployment-3599678771   0         0         0         9m
nginx-deployment-4087004473   3         3         3         11m

kubectl rollout history deployment/nginx-deployment
deployments "nginx-deployment"
REVISION        CHANGE-CAUSE
2               kubectl set image deployment/nginx-deployment nginx=nginx:1.9.1
3               kubectl scale deployment nginx-deployment --replicas 3
```

ここで気になるのは REVISION 3 が上書きされたことです。REVSION 番号 4 が新たに作成されると思っていたからです。先程 REVISION 番号 3 として保存されていた下記の履歴が消えてしまいました。この点については引き続き検証してみます。今の自分には理解できませんでした。ご存知の方いましたら、コメントお願いします！

```
3               kubectl create -f nginx.yaml --record
```

Puase, Resume 機能を使ってみる
----

次は deployments の機能を使って Image Tag を更に 1.9.1 へ変更し、その処理をポーズしてみます。

```
kubectl set image deployment/nginx-deployment nginx=nginx:1.9.1; kubectl
```

同様に状態を確認してみます。

```
$ kubectl get rs
NAME                          DESIRED   CURRENT   READY     AGE
nginx-deployment-3599678771   2         2         2         10m
nginx-deployment-4087004473   2         2         2         12m

$ kubectl rollout status deployment/nginx-deployment
Waiting for rollout to finish: 2 out of 3 new replicas have been updated...
Ctrl-C #<--- キー入力
```

rollout status で deployment "deployment/nginx-deployment" を確認すると "waiting for rollout to finish" と表示され処理がポーズされていることが確認できました。また古い Deployment "nginx-deployment-4087004473" 上に未だコンテナが残り、新しい Deployment もコンテナが生成中であることが分かります。

では Resume します。

```
$ kubectl rollout resume deployment/nginx-deployment
deployment "nginx-deployment" resumed
```

この時点の状態を確認しましょう。

```
$ kubectl rollout status deployment/nginx-deployment
deployment nginx-deployment successfully rolled out

$ kubectl get rs
NAME                          DESIRED   CURRENT   READY     AGE
nginx-deployment-3599678771   3         3         3         11m
nginx-deployment-4087004473   0         0         0         14m
```

ここからは...

* 正常に Deployment "nginx-deployment" が Rollout されたこと
* 古い Deployment 上のコンテナ数が 0 に、新しい Deployment 上のコンテナ数が 3 になった

ということが分かります。

Rolling-Update 相当の作業を行う方法
----

前述した通り、Replication Controller 時代にあった Rolling-Update 作業 (イメージタグ・レプリカ数等の更新) ですが、Deployments では下記の方法をとることが出来ます。

#### set オプションを付与する場合

set オプションを付与して Key 項目に対して新しい Value を渡します。

```
$ kubectl set image deployment/nginx-deployment nginx=nginx:1.9.1
```

#### yaml ファイルを修正する場合

yaml ファイルの内容を更新して適用したい場合、下記のように apply オプションを付与します。

```
$ kubectl apply -f <新しいYamlファイル>
```

まとめと考察
----

REVISION の履歴が上書きされる点など、まだ未完成な感が否めませんでしたが(自分の勘違いかもしれません！)、Replication Controller と比べると作業の切り戻しや、履歴が保存され履歴内容も確認できる点など機能が追加されていることが分かりました。公式ドキュメントを読んでいてもコマンド結果等怪しい点があって流石に API バージョンが "v1beta1" だなぁという感じではありますが、機能が整理されていて利便性が上がっているので Replication Controller を使っているユーザは自然と今後、Deployments に移行していくのではないかと感じました。


