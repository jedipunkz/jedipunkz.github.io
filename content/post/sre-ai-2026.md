---
title: "2026年4月現時点において SRE がどう AI に向き合っているか調べてみた"
date: 2026-04-24T14:00:00+09:00
Categories: ["SRE", "AI"]
description: "2026 年における SRE の AI 活用事例と課題を調査し分類して紹介する"
---
こんにちは。@jedipunkz です。

2026年4月現時点において、SRE の領域で AI はどう活用されているのか、世の中の SRE はどのように AI に向き合っているのか気になり調査を行いました。普段自分は具体の技術に興味がある人間なのであまりこういう抽象的な話は好まないのですが、AI の進化はここ数ヶ月でも激しく推進しているので SRE の活動にも変化が生じているだろうと気になり調査した次第です。

## AI SRE の分類

調査の結果、AI を SRE 領域に適用するアプローチは概ね以下の施策に分類できました。

### 1. AI によるインシデントトリアージと原因分析

最も広く普及しているアプローチが AI によるインシデント対応です。AI はログ、メトリクス、トレースという情報を横断的に相関させ、「何が起きているか」だけでなく「なぜ起きたか」という原因を自動で提示します。

Lightrun の blog ([https://lightrun.com/blog/what-is-ai-sre/](https://lightrun.com/blog/what-is-ai-sre/)) によると、AI SRE は自律的にインシデントのトリアージ、根本原因分析、修復提案、ポストモーテム生成を行います。特に重要な点として、従来の静的なテレメトリーでは見落とされがちな実行時の変数状態やコードパスといった詳細を補完し、確率的な推論ではなく実測に基づく原因特定を目指すものも登場しています。

### 2. 自律的修復への進化

AI が推奨を示すだけでなく実際の修復アクションを実行する段階があります。Signisys の Guide ([https://www.signisys.com/blog/sre-in-the-age-of-ai-when-systems-can-heal-themselves/](https://www.signisys.com/blog/sre-in-the-age-of-ai-when-systems-can-heal-themselves/)) によると、成熟度は以下の 4 段階で分類できるそうです。

- (1) Read-Only: AI がダッシュボードを表示するがアクションは取らない
- (2) Advised: AI が修復 Steps を提案し人間が実行
- (3) Approval-Based: AI がアクションを準備し人間の承認後に実行
- (4) Autonomous: ポリシーのガバナンス内で完全な detect(検知), diagnose(診断), remediate(修復) を実行

2026 年現在の多くの企業は Stage 2〜3 の間にあり、完全に自律修復には Observability の基盤整備と組織の信頼構築が課題となっています。

### 3. 予測的信頼性へシフト

Ciroos の分析 ([https://ciroos.ai/news/2026-predictions-ai-in-site-reliability-engineering](https://ciroos.ai/news/2026-predictions-ai-in-site-reliability-engineering)) によると、2026 年は AI SRE が展開する前から「予測」を行う段階に入ります。歴史的なインシデントデータ、現在のシステムコンテキスト、知識グラフを組み合わせ、展開前の変更がどの程度の影響を受けるかを推測します。これまでの「問題が発覚してから対応する」から「問題が発覚する前に準備する」というパラダイムシフトが進んでいます。


### 4. 非構造化データ解析

従来の AIOps は構造化されたメトリクスやログの解析が主でしたが、2026 年の潮流として注目されているのが非構造化データ解析です。Energent.ai ([https://energent.ai](https://energent.ai)) は Post-Mortem の PDF やインシデントスプレッドシート、ベンダードキュメントといった非構造化データを解析し、過去のインシデントパターンを見つけ出す能力を持っています。


### 5. AI エージェント自身の信頼性

AI エージェントシステム自体を管理するための SRE です。Zylos Research ([https://zylos.ai/research/2026-03-22-sre-ai-agent-systems-observability-incident-response](https://zylos.ai/research/2026-03-22-sre-ai-agent-systems-observability-incident-response)) が取り上げるように、従来の「可用性」「レイテンシ」に加えて「決定品質」「タスク完了の忠実性」「単位コスト」「いつ停止して人間に確認するか」という新たな指標が必要です。

OpenTelemetry (OTel) の GenAI Semantic Conventions SIG が標準化し、Datadog、Honeycomb、New Relic などが Native でサポートするようになりました。フレームワークとしての LangChain、CrewAI、AutoGen、AG2 などが OTel 互換の Span を出力します。

### 6. Change-Centric 分析

Harness ([https://www.harness.io/blog/harness-ai-january-2026-updates](https://www.harness.io/blog/harness-ai-january-2026-updates)) が提供する Human-Aware Change Agent はまた別のアプローチをしています。従来のログやメトリクスだけでなく、実際のインシデントで生じるコミュニケーション(Slack、Teams、Zoom など）を読み込み、人間の知見を構造化された 情報に変換します。

「デプロイが12分前にアプリの振る舞いをを変更しその直後にレイテンシが急上昇した」というような、変更とインシデントを結びつける仮説を生成します。人間の情報とソフトウェア配信の知識グラフを統合することで、チームは「何が起こっているのか？」から「何が変わったのか？」、そして「安全にロールバックまたは修正すべきことは何か？」へと迅速な具体の対応方法への提示につなげることが可能になると言っています。


## 調査から見えてきた課題

これらの施策が進む一方で、いくつかの課題も浮上しています。

### 1. AI 起因の障害リスク

Gartner は2029年までに90%の企業が AI 起因の障害を経験すると予測しています。これは皮肉な話ですが、AI は信頼性を向上させると同時に脅威も生み出すというパラドックスです。

### 2. 労働時間の変化

SRE Report 2026 ([http://www.catchpoint.com/blog/sre-report-2026-ai-optimism-and-the-economics-of-effort](http://www.catchpoint.com/blog/sre-report-2026-ai-optimism-and-the-economics-of-effort)) によると、Toil は前年から 20% -> 34% と変化。また49%の人が AI により toil が減少したと報告し、35% は変化なしと回答しています。AI 導入が必ずしも toil を減少させるわけではなく、データ品質と Observability の基盤が重要であることがわかります。

### 3. 信頼性と「証明」

AI SRE 特に Stage 3-4 に進むと、ブラックボックス的な自動化ではエンジニアに受け入れられないという問題があります。AI の推薦には証跡、タイムライン、変更履歴を伴って表示される能力が信頼性を担保する上で不可欠になります。特に人間にとって。

## まとめ

2026 年の SRE と AI は以下の施策に分類できました。

1. AI によるインシデントトリアージと原因分析
2. 自律的修復への進化
3. 予測的信頼性へシフト
4. 非構造化データ解析
5. AI エージェント自身の信頼性
6. Change-Centric 分析

これらの多くは相互補完的であり業界全体として成熟に向かうのは必然と言えると思います。前述の調通り AI SRE ツールを開発・利用する段階に来たと言えますが、単にツールを導入すれば解決するのではなく、先に述べた通りデータの質と Observability 基盤が前提となることを理解しておく必要があります。

ますます Observabillity が重要と。

また個人的には、基盤を各社が独自に開発することも出来ますが世界中の SRE が同じ方向に進んでいるので近い将来に出てくるデファクトな基盤サービスに乗せる、というのが重要なポイントのような気がしています。

