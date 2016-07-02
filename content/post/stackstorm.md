+++
author = ""
categories = ["infrastructure"]
date = "2016-07-02T23:37:17+09:00"
description = ""
featured = ""
featuredalt = ""
featuredpath = ""
linktitle = ""
title = "イベントドリブンな StackStorm で運用自動化"

+++
こんにちは。<a href="https://twitter.com/jedipunkz">@jedipunkz</a> です。

今回は StackStorm (https://stackstorm.com/) というイベントドリブンオートメーションツールを使ってみましたので
紹介したいと思います。

クラウドとプロビジョニングツールの登場で昨今はエンジニアがほぼ全ての操作を自動化出来るようになりました。
ですが監視についてはどうでしょうか？監視システムを自動で構築することが出来ても障害発生時に対応を行う
のは手動になっていませんでしょうか。もちろんクラスタ組んでいれば大抵のアラートは放置出来ますが、クラスタ
を組むことが出来ないような箇所はクラウドを使ってもどうしても出てきます。

そこで登場するのが今回紹介する StackStorm のようなツールかなぁと考えるようになりました。

インストール
----

インストール手順は下記の URL にあります。

https://docs.stackstorm.com/install/index.html

自分は CentOS7 を使ったので下記のワンライナーでインストールできました。
password は任意のものを入れてください。

```
curl -sSL https://stackstorm.com/packages/install.sh | bash -s -- --user=st2admin --password=foo
```

MongoDB, postgreSQL が依存してインストールされます。

80番ポートで下記のような WEB UI も起動します。

<img src="http://jedipunkz.github.io/pix/stackstorm.png" width="70%">

StackStorm の基本
----

基本を知るために幾つかの要素について説明していきます。

まず CLI で操作するために TOKEN を取得して環境変数にセットする必要があります。
上記で設定したユーザ名・パスワードを入力してください。

```
export ST2_AUTH_TOKEN=`st2 auth -t -p foo st2admin`
```

* Action

Action はイベントが発生した際に実行できるアクションになります。早速アクションの一覧を取得してみましょう。

```
$ st2 action list
+---------------------------------+---------+-------------------------------------------------------------+
| ref                             | pack    | description                                                 |
+---------------------------------+---------+-------------------------------------------------------------+
| chatops.format_execution_result | chatops | Format an execution result for chatops                      |
| chatops.post_message            | chatops | Post a message to stream for chatops                        |
| chatops.post_result             | chatops | Post an execution result to stream for chatops              |
<省略>
| core.http                       | core    | Action that performs an http request.                       |
| core.local                      | core    | Action that executes an arbitrary Linux command on the      |
|                                 |         | localhost.                                                  |
| core.local_sudo                 | core    | Action that executes an arbitrary Linux command on the      |
|                                 |         | localhost.                                                  |
| core.remote                     | core    | Action to execute arbitrary linux command remotely.         |
| core.remote_sudo                | core    | Action to execute arbitrary linux command remotely.         |
| core.sendmail                   | core    | This sends an email                                         |
| core.windows_cmd                | core    | Action to execute arbitrary Windows command remotely.       |
<省略>
| linux.cp                        | linux   | Copy file(s)                                                |
| linux.diag_loadavg              | linux   | Diagnostic workflow for high load alert                     |
| linux.dig                       | linux   | Dig action                                                  |
<省略>
| st2.kv.get                      | st2     | Get value from datastore                                    |
| st2.kv.set                      | st2     | Set value in datastore                                      |
+---------------------------------+---------+-------------------------------------------------------------+
```

上記のように Linux のコマンドや ChatOps, HTTP でクエリを投げるもの、Key Value の読み書きを行うモノまであります。
上記はかなり咲楽して貼り付けたので本来はもっと沢山のアクションがあります。

* Trigger

Trigger は Action を実行する際のトリガになります。同様に一覧を見てみましょう。

```
$ st2 trigger list
+--------------------------------------+-------+----------------------------------------------------------------+
| ref                                  | pack  | description                                                    |
+--------------------------------------+-------+----------------------------------------------------------------+
| core.st2.generic.actiontrigger       | core  | Trigger encapsulating the completion of an action execution.   |
| core.st2.IntervalTimer               | core  | Triggers on specified intervals. e.g. every 30s, 1week etc.    |
| core.st2.generic.notifytrigger       | core  | Notification trigger.                                          |
| core.st2.DateTimer                   | core  | Triggers exactly once when the current time matches the        |
|                                      |       | specified time. e.g. timezone:UTC date:2014-12-31 23:59:59.    |
| core.st2.action.file_writen          | core  | Trigger encapsulating action file being written on disk.       |
| core.st2.CronTimer                   | core  | Triggers whenever current time matches the specified time      |
|                                      |       | constaints like a UNIX cron scheduler.                         |
| core.st2.key_value_pair.create       | core  | Trigger encapsulating datastore item creation.                 |
| core.st2.key_value_pair.update       | core  | Trigger encapsulating datastore set action.                    |
| core.st2.key_value_pair.value_change | core  | Trigger encapsulating a change of datastore item value.        |
| core.st2.key_value_pair.delete       | core  | Trigger encapsulating datastore item deletion.                 |
| core.st2.sensor.process_spawn        | core  | Trigger indicating sensor process is started up.               |
| core.st2.sensor.process_exit         | core  | Trigger indicating sensor process is stopped.                  |
| core.st2.webhook                     | core  | Trigger type for registering webhooks that can consume         |
|                                      |       | arbitrary payload.                                             |
| linux.file_watch.line                | linux | Trigger which indicates a new line has been detected           |
+--------------------------------------+-------+----------------------------------------------------------------+
```

CronTimer はその名の通り Cron であることが分かります。IntervalTimer は同じように一定時間間隔で実行するようです。
その他 webhook や Key Value のペアが生成・削除・変更されたタイミング、等あります。

* Rule

Rule は Trigger が発生して Action を実行する際のルールを記述するものになります。

```
$ st2 rule list
+----------------+---------+-------------------------------------------------+---------+
| ref            | pack    | description                                     | enabled |
+----------------+---------+-------------------------------------------------+---------+
| chatops.notify | chatops | Notification rule to send results of action     | True    |
|                |         | executions to stream for chatops                |         |
+----------------+---------+-------------------------------------------------+---------+
```

初期では上記の chatops.notify のみがあります。

実際に使ってみる
----

core.local というアクションを実行してみました。

```
$ st2 run core.local -- uname -a
id: 5774c022e138230c66f2eefc
status: succeeded
parameters:
  cmd: uname -a
result:
  failed: false
  return_code: 0
  stderr: ''
  stdout: 'Linux localhost.localdomain 3.10.0-327.el7.x86_64 #1 SMP Thu Nov 19 22:10:57 UTC 2015 x86_64 x86_64 x86_64 GNU/Linux'
  succeeded: true
```

stdout に実行結果が出力されています。また下記のように実行結果の一覧を得ることが出来ます。

```
$ st2 execution list
+----------------------------+---------------+--------------+-------------------------+-----------------------------+-------------------------------+
| id                         | action.ref    | context.user | status                  | start_timestamp             | end_timestamp                 |
+----------------------------+---------------+--------------+-------------------------+-----------------------------+-------------------------------+
|   5774bdbee138230c66f2eeef | core.local    | st2admin     | succeeded (0s elapsed)  | Thu, 30 Jun 2016 06:35:42   | Thu, 30 Jun 2016 06:35:42 UTC |
|                            |               |              |                         | UTC                         |                               |
+----------------------------+---------------+--------------+-------------------------+-----------------------------+-------------------------------+
```

応用した使い方
----

上記のように core.local, core.remote 等でホスト上のコマンドを実行できることが分かりました。
ここで応用した使い方をしてみます。と言いますか、上記の基本的な使い方だけでは StackStorm を
使うメリットが無いように思えます。

下記のような Rule を作成します。ファイル名は st2_sample_rule_webhook_remote_command.yaml とします。

```
---
    name: "st2_sample_rule_webhook_remote_command"
    pack: "examples"
    description: "Sample rule of webhook."
    enabled: true

    trigger:
        type: "core.st2.webhook"
        parameters:
            url: "restart"

    criteria:

    action:
        ref: "core.remote"
        parameters:
            hosts: "10.0.1.250"
            username: "thirai"
            private_key: "/root/.ssh/id_rsa"
            cmd: "sudo service cron restart"
```

StackStorm の基本要素 Action, Criteria(Rule の基準), Trigger から成っていることが分かります。
Triger は webhoook です。url: "restart" となっているのは URL : https://<stackstorm_ip_addr>/api/v1/webhooks/restart という名前で
アクセスを受けるようになるという意味です。criteria は今回は無条件で action を実行したいので空行にします。
action では core.remote が選択されていて hosts: '10.0.1.250' に username で SSH してコマンドを実行しています。

要するに https://<stackstorm_ip_addr>/api/v1/webhooks/restart というアドレスでリクエストを受けると
10.0.1.250 に 'foo' というユーザで SSH してコマンドを実行する、というルールになっています。

下記のコマンドで上記の yaml ファイルをルールに読み込みます。

```
st2 rule create st2_sample_rule_webhook_remote_command.yaml
```

実際にリクエストを投げてみましょう。Token は読み替えてください。

```
curl -k https://localhost/api/v1/webhooks/restart -d '{}' -H 'Content-Type: application/json' -H 'X-Auth-Token: <Your_Token>'
```

するとリモートホストで 'cron' プロセスの再起動が掛かります。

まとめと考察
----

StackStorm は紹介した以外にも沢山のアクションがあり応用が効きます。また監視ツールでアラートが発生した際に webhook 通知するようにして
障害対応を自動で行うといった操作も可能な事がわかりました。ChatOps でも応用が可能なことが分かります。従来、ChatOps ではリモートホストで
コマンドなどを実行しようとした場合には Hubot 等のプロセスが稼働しているホストもしくはそのホストから SSH 出来るホストで実行する必要がありましたが
StackStorm を介すことで実行結果の閲覧やルールに従った実行等が可能になります。

自分はまだ少しのアクション・ルールを試用しただけなのですが、他に良い運用上の応用例がないか探してみようと思います。
