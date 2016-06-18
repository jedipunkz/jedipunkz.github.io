+++
title = "第2回 Elasticsearch 勉強会参加レポート"
date = "2013-11-13"
slug = "2013/11/13/elasticsearch-second-study-report"
Categories = ["infrastructure"]
+++
こんにちは。<a href="https://twitter.com/jedipunkz">@jedipunkz</a> です。

第2回 Elasticsearch 勉強会に参加してきました。箇条書きですが参加レポートを記し
ておきます。


    開催日 : 2013/11/12
    場所 : 東京駅 グラントウキョウサウスタワー リクルートテクノロジーズさま
    URL : http://elasticsearch.doorkeeper.jp/events/6532

Routing 周りの話
----

    株式会社シーマーク　大谷純さん (@johtani)

#### Index 構成

* cluster の中に index -> type が作成される
* index は shard という部分的な index の集まり
* shard 数は生成時のみ指定可能
* node ごとに replica, primary を別ける
* replica 数は後に変えられる
* doc -> hash 値を shard 数で割って replica, primary に登録
* doc の id の ハッシュ値を利用
* type も含める場合はかの設定を true に
* クライアントはどのノードに対してクエリを投げても OK

#### routing

* id の代わりに routing (URL パラメータ) で登録
* url リクエストパラメータとして登録時にルーティングパラメータを登録
* id の代わりにパラメータで指定された値のハッシュ値を計算して利用
* 検索時 routing 指定で関係のある shard のみを指定出来る

#### スケールアウト

* sharding によるスケールアウト数 = インデックス作成時に指定
* shard によるインデックスの分割以外にインデックス自体を複数持つことによるスケール
* 複数のドキュメントをエイリアス書けることが可能


#### 所感

個人的には非常に興味のあるところでした。mongodb のような sharding をイメージし
てよいのか？そうでないのか？すら理解出来ていなかったので。sharding を理解する
前提知識の話もあって非常に参考になりました。

ElasticSearchを使ったBaaS基盤の開発
----

    株式会社富士通ソフトウェアテクノロジーズ 滝田聖己さん（@pisatoshi）

運用の話。これは貴重...。

* shard 数 : 10 , replica : 1 で運用している
* データは業務データ , トラッキングデータ
* マルチテナント, 更新の即時反映, ルーティングによる性能向上 が要件
* 登録更新 -> 検索結果反映までタイムラグがある -> replica 完了まで待つので高コスト
* replica 数を減らすことで性能向上

#### routing id を指定することで...

* doc id の has から shard 自動選択がデフォルト
* -> hash key を指定して格納シャードを制御出来る
* -> doc 登録性能向上
* -> 検索対象の shard を絞りこみえる
* -> 不可を軽減

#### バックアップ/リストア

* mysql にもデータ格納 -> backup
* elasticsearch の index はバックアップ取らず -> bug を踏みたくないのが理由

#### dynamic mapping の問題

* 入力データから型を推測 -> 自動マッピング登録
* -> マッピング定義が肥大化
* -> データ型のコンフリクト

#### mapping の肥大化

* mapping 定義は type, field の数に応じてサイズが増加
* -> index 性能低下
* -> mapping を伴う doc 登録 3sec (mapping size 80MB)
* -> 各 node への mapping 定義の同期
* 大量のデータを一気に登録するときは 1 node が速い
* -> その後シャード再配置したことがある

=> dynamic mapping を使うのをやめた -> app で指定

#### よく利用するツール

* bigdesk
* elasticsearch-head
* sense (chrome extention)

#### unit test

unit test はどうする？

* nodeClient テスト開始時に起動
* テストデータを配置して起動, 終了時に削除
* memoryIndex で高速に実行
* elasticsearch-test が便利

#### 所感

運用の話はどの技術でも重要!!! 実際に困った話、トラブル等聞けて貴重な時間でした。
よく使うツールの話も意外と参考になるので聞けてよかった。

Kibana
-----

    Cookpad 水戸祐介さん (@y_310)

* 作った dashboard は elasticsearch に保存される
* db 要らず , web サーバのみ, クライアントサイドの技術のみで実装されている
* term, trends, map, table, column... それぞれ図形式がある
title = "test", -title
* 1つの index に異なるスキーマを持つデータを入れられる
* 1つの index に入れることでグラフを重ねて比較出来る
* やはり dynamic mapping は使わないほうが良い
* m1.large x 1 : 1日のインデックスサイズが10GB 超えるあたりで ES が詰まる

下記が当日の資料です。

<script async class="speakerdeck-embed"
data-id="3d0776802ddb0131fdd042970ce72c15" data-ratio="1.33333333333333" src="//speakerdeck.com/assets/embed.js"></script>

#### 所感

Cookpad さんで実際に利用されているとか。運用の話と同じくやはり dynamic routing
でのトラブルの話があった。また Cookpad さんでのトラブル例の話もあってよかった。


ElasticSearch＋Kibana v3を利用する際の運用ノウハウ
----

    株式会社リブセンス Y.Kentaro さん (@yoshi_ken)

下記が発表資料。

<iframe src="http://www.slideshare.net/slideshow/embed_code/28165189"
width="597" height="486" frameborder="0" marginwidth="0" marginheight="0"
scrolling="no" style="border:1px solid #CCC;border-width:1px 1px
0;margin-bottom:5px" allowfullscreen> </iframe> <div
style="margin-bottom:5px"> <strong> <a
href="https://www.slideshare.net/y-ken/elasticsearch-kibnana-fluentd-management-tips"
title="ElasticSearch+Kibanaでログデータの検索と視覚化を実現するテクニックと運
用ノウハウ" target="_blank">ElasticSearch+Kibanaでログデータの検索と視覚化を実
現するテクニックと運用ノウハウ</a> </strong> from <strong><a
href="http://www.slideshare.net/y-ken" target="_blank">Kentaro
Yoshida</a></strong> </div>

* nginx の basic 認証等でアクセス制限を掛ける例

等など... ごめんなさい！メモが取れてなかった！...汗


Fluentd as a Kibana
----

    @repeatedly さん

fluentd-plugin-kibana-server  というkibana をダウンロードしてくるのがめんどい
ので fluentd の中で kibana を動かすプラグインを作った話。下記が発表資料。

<https://gist.github.com/repeatedly/7427856>

* fluentd input plugin として実装
* logstash 版もあるらしい

#### 所感

さすが...。確かにサーバをいちいち作るのめんどいです。fluentd plugin の中で
kibana を動かすって発想が...。

auth プラグインでアクセスコントロール
----

    株式会社エヌツーエスエム 菅谷信介さん (@shinsuke_sugaya)
    

* elasticsearch のアクセス制御をしたい
* rest api をアクセス制御する
* ユーザ管理, REST API のアクセス管理, ログイン・ログアウト・トーケン
* ユーザ管理は elasticsearch 内に格納
* path, http method, role の組み合わせで制御

インストールは下記の通り elasticsearch plugin コマンドで。

    % ./bin/plugin --install org.codelibs/elasticsearch-auth/1.0.0
    
* ユーザ作成は POST で可能


所感とまとめ
----

箇条書きのざっくりしたまとめでしたが...。個人的には sharding の話はとても聞き
たかったので貴重な時間でした。また、運用の話もとてもおもしろかったし plugin 作っ
てみた話も「すごい..」って感じでした。僕はこれからアプリも書くけどインフラエン
ジニアなのでアーキテクチャをまず知りたいかなぁという印象。と言うかスケールさせ
るときにも横に並べて shard するだけの様な話に聞こえましたが、まだぼんやり感が
あります。特に shard 周り。mongo の sharding と同じ様なものを想像していますが。
またモチベーション上がったので週末やってみますー！

kibana3 は一回使いました。javascript, html で実装されているのでクライアントか
ら elasticsearch まで直接アクセス出来なければならないとなって、構成的にどうな
のかな？と思っていたら菅谷さんの 'auth プラグイン' の話があったりしたので、良
かったです。使ってみます！

主催の方々、発表者の方々、当日はありがとうございましたー。また参加させてもらい
ます。
