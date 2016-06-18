+++
title = "Sensu,Chef,OpenStack,Fog を使ったオレオレオートスケーラを作ってみた！"
date = "2014-03-05"
slug = "2014/03/05/sensu-chef-openstack-fog-autoscaler"
Categories = ["infrastructure"]
+++
こんにちは。@jedipunkz です。

今まで監視システムの Sensu やクラウドプラットフォームの OpenStack、コンフィギュ
レーションマネージメントツールの Chef やクラウドライブラリの Fog 等使ってきま
したが、これらを組み合わせるとオレオレオートスケーラ作れるんじゃないか？と思い、
ちょろっと作ってみました。

ちなみに自分はインフラエンジニアでしかも運用の出身なので Ruby に関しては初心者
レベルです。Chef で扱っているのと Rails アプリを作った経験はありますが、その程
度。Fog というクラウドライブラリにコントリビュートしたことはアリますが..。ちな
みに Fog のコントリビュート内容は OpenStack Neutron(当時 Quantum) の仮想ルータ
の操作を行う実装です。

そんな自分ですが...設計1周間・実装1周間でマネージャと CLI が出来ました。
また暫く放置していたマネージャと CLI に WebUI くっつけようかなぁ？と思って
sinatra の学習を始めたのですが、学習を初めて 1.5 日で WebUI が動くところまで行
きました。何故か？Ruby には有用な技術が揃っているから・・！(´；ω；｀)ﾌﾞﾜｯ

オレオレオートスケーラ 'sclman' の置き場所
----

<https://github.com/jedipunkz/sclman>

スクリーンショット
+++

<img src="https://raw.github.com/jedipunkz/sclman/master/pix/sclman.png" width="600">

構成は？
----

```
+-------------- public network                  +-------------+
|                                               |sclman-api.rb|
+----+----+---+                                 |  sclman.rb  |
| vm | vm |.. |                                 |sclman-cli.rb|
+-------------+ +-------------+ +-------------+ +-------------+
|  openstack  | | chef server | | sensu server| | workstation |
+-------------+ +-------------+ +-------------+ +-------------+
|               |               |               |
+---------------+---------------+---------------+--------------- management network
```

'sclman' っていう名前です。上図の workstation ノードで稼働します。処理の流れは


処理の流れ
----

* 1) sclman-cli.rb もしくは WebUI から HTTP クラスタのセットを OpenStack 上に生成
* 2) 生成された VM に対して Chef で nginx をインストール
* 3) Chef の Roles である 'LB' と 'Web" が同一 Envrionment になるようにブートストラップ
* 4) LB VM のバックエンドに Web VM が指し示される
* 5) bootstrap と同時に sensu-client をインストール
* 6) Web VM の load を sensu で監視
* 7) sclman.rb (マネージャ) は Sensu AP を定期的に叩いて Web VM の load を監視
* 8) load が高い environment があれが該当 environment の HTTP クラスタに VM を追加
* 9) LB VM は追加された VM へのリクエストを追加  
* 10) 引き続き監視し一定期間 load が上がらなけれ Web VM を削除
* 11) LB VM は削除された VM へのリクエストを削除

といった感じです。要約すると CLI/WebUI から HA クラスタを作成。その時に LB,
Web ミドルウェアと同時に sensu クライアントを VM に放り込む。監視を継続して負
荷が上昇すれば Web インスタンスの数を増加させ LB のリクエスト振り先にもその追
加した VM のアドレスを追加。逆に負荷が下がれば VM 削除と共にリクエスト振り先も
削除。この間、人の手を介さずに処理してくれる。です。

使い方
----

詳細な使い方は github の README.md を見て下さい。ここには簡単な説明だけ書いて
おきます。

* sclman を github から取得して bundler で必要な gems をインストールします。
* chef-repo に移動して Berkshelf で必要な cookbooks をインストールします。
* cookbooks を用いて sensu をデプロイします。
* Omnibus インストーラーを使って chef サーバをインストールします。
* OpenStack をインストールします。
* sclman.conf を環境に合わせて修正します。
* sclman.rb (マネージャ) を稼働します。
* sclman-api.rb (WebUI/API) を稼働します。
* sclman-cli.rb (CLI) もしくは WebUI から最小構成の HTTP クラスタを稼働します。
* この状態で 'Web' Role のインスタンスに負荷が掛かると 'Web' Role のインスタンスの数が増加します。
* また逆に負荷が下がるとインスタンス数が減ります。

負荷の増減のシビアさは sclman.conf のパラメータ 'man_sensitivity' で決定します。
値が長ければ長いほど増減のし易さは低下します。

まとめ
+++

こんな僕でも Ruby の周辺技術使ってなんとなくの形が出来ましたー。ただまだまだ課
題はあって、インフラを制御するアプリってエラーハンドリングが難しいっていうこと
です。帰ってくるエラーの一覧などがクラウドプラットフォーム・クラウドライブラリ
のドキュメントにあればいいのだけど、まだそこまで行ってない。Fog もまだまだ絶賛
開発中と言うかクラウドプラットフォームの進化に必死で追いついている状態なので、
僕らがアプリを作るときには自分でエラーを全部洗い出す等の作業が必要になるかもし
れない。大変だけど面白い所でもありますよね！これからも楽しみです。

