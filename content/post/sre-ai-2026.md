---
title: "2026年5月現時点において SRE がどう AI に向き合っているか調べてみた"
date: 2026-04-24T14:00:00+09:00
Categories: ["SRE", "AI"]
description: "2026 年における SRE の AI 活用事例と課題を調査し分類して紹介する"
---
こんにちは。@jedipunkz です。

2026年5月現時点において、SRE の領域で AI はどう活用されているのか、世の中の SRE はどのように AI に向き合っているのか気になり調査を行いました。普段自分は具体の技術に興味がある人間なのであまりこういう抽象的な話は好まないのですが、AI の進化はここ数ヶ月でも激しく推進しているので SRE の活動にも変化が生じているだろうと気になり調査した次第です。

## AI SRE の分類

調査の結果、AI を SRE 領域に適用するアプローチは概ね以下の施策に分類できました。

### 1. AI によるインシデントトリアージと原因分析

最も広く普及しているアプローチが AI によるインシデント対応です。AI はログ、メトリクス、トレース、変更履歴、過去インシデントという情報を横断的に相関させ、「何が起きているか」だけでなく「なぜ起きたか」という原因候補を提示します。

PagerDuty の SRE Agent は、既存のインシデントワークフローの中でログ、メトリクス、変更、過去インシデントを集め、タイムライン要約や次の対応候補を提示し、許可された場合には事前定義されたアクションを実行する方向に進んでいます ([PagerDuty](https://www.pagerduty.com/blog/ai/meet-your-virtual-responder-pagerdutys-sre-agent-for-ai-driven-reliability/))。ここでのポイントは、AI が独立したチャットボットとして横に立つのではなく、Slack、Teams、Incident Details Page、Operations Console など、普段の対応導線に入り込むことです。

### 2. 自律的修復への進化

AI が推奨を示すだけでなく実際の修復アクションを実行する段階があります。整理すると成熟度は以下の 4 段階で分類できそうです。

- (1) Read-Only: AI がダッシュボードを表示するがアクションは取らない
- (2) Advised: AI が修復 Steps を提案し人間が実行
- (3) Approval-Based: AI がアクションを準備し人間の承認後に実行
- (4) Autonomous: ポリシーのガバナンス内で完全な detect(検知), diagnose(診断), remediate(修復) を実行

2026 年現在は Stage 2〜3 の間が現実的に見えます。Dynatrace の agentic AI 調査では、完全自律 agent を使う組織は 13% に留まり、69% の agentic AI 判断はまだ人間が検証しているとされています ([Dynatrace](https://www.dynatrace.com/news/press-release/pulse-of-agentic-ai-2026/))。また Gartner は 2026 年 4 月の I&O リーダー調査で、AI の失敗が auto-remediation、self-healing infrastructure、agent-led workflow management で起こりやすく、失敗要因としてスキルギャップやデータ品質・データ可用性の不足を挙げています ([Gartner](https://www.gartner.com/en/newsroom/press-releases/2026-04-07-gartner-says-artificial-intelligence-projects-in-infrastructure-and-operations-stall-ahead-of-meaningful-roi-returns))。つまり自律修復は方向性としては自然ですが、いきなり Stage 4 を狙うよりも、承認付き実行と証跡を残すところから進むのが現実的です。

### 3. 予測的信頼性へシフト

2026 年の AI SRE に関する予測でよく出てくるのが、プロアクティブな変更管理です。歴史的なインシデントデータと現在のシステムコンテキストを組み合わせ、展開前の変更がどの程度の影響を与えるかを事前に推測します。また RAG 以外も含む複数の推論技術を組み合わせた高度なアーキテクチャの台頭、人間と AI の協働・役割分担の進化、そして AI SRE が断片化したツール群を横断する統合インターフェースとして機能する「エンタープライズ抽象化レイヤー」といった方向性も示されています ([Ciroos](https://ciroos.ai/news/2026-predictions-ai-in-site-reliability-engineering))。ただしこれはあくまでベンダーによる市場予測なので、現時点では「問題が発覚してから対応する」から「問題が発覚する前に準備する」方向へ関心が移っている、と控えめに見るのがよさそうです。


### 4. 非構造化データ解析

従来の AIOps は構造化されたメトリクスやログの解析が主でしたが、2026 年の潮流として注目されているのが非構造化データ解析です。SRE 領域では Post-Mortem ドキュメント、Slack や Teams のやり取り、チケット、Runbook、ベンダードキュメントなどを横断して読む必要があります。AI を入れる価値は、単にログ検索を速くするだけでなく、インシデント中の会話や判断の流れを時系列に整理し、次のアクションや再発防止の材料に変換するところにあります。

一方で、非構造化データは個人情報、顧客情報、内部の意思決定、未公開の障害情報を含みやすいので、AI に読ませる前にデータ境界と保存・学習・監査の設計が必要です。この点は「便利そう」だけで進めると事故りやすい領域だと思います。


### 5. AI エージェント自身の信頼性

AI エージェントシステム自体を管理するための SRE です。従来の「可用性」「レイテンシ」に加えて「決定品質」「タスク完了の忠実性」「単位コスト」「いつ停止して人間に確認するか」という新たな指標が必要です。

ここは 2026 年 5 月にかなり進展があり、OpenTelemetry の GenAI Semantic Conventions は、LLM 呼び出し、token 数、例外、model span、agent span、MCP などを trace/metric/event として扱う語彙を整備しています ([OpenTelemetry](https://opentelemetry.io/docs/specs/semconv/gen-ai/))。OpenTelemetry の blog でも、AI agent の遅延がモデル由来なのか、tool call 由来なのか、retry loop 由来なのかを追うために GenAI Observability が必要だと説明されています ([OpenTelemetry](https://opentelemetry.io/blog/2026/genai-observability/))。AI エージェントの運用は「LLM の入出力をログに出す」だけでは足りず、tool 呼び出し、外部 API、権限、コスト、失敗時の分岐まで trace する必要がある、という話です。

### 6. Change-Centric 分析

Harness ([https://www.harness.io/blog/harness-ai-january-2026-updates](https://www.harness.io/blog/harness-ai-january-2026-updates)) が提供する Human-Aware Change Agent はまた別のアプローチをしています。従来のログやメトリクスだけでなく、実際のインシデントで生じるコミュニケーション(Slack、Teams、Zoom など）を読み込み、人間の知見を構造化された 情報に変換します。

「デプロイが12分前にアプリの振る舞いを変更しその直後にレイテンシが急上昇した」というような、変更とインシデントを結びつける仮説を生成します。人間の情報とソフトウェア配信の知識グラフを統合することで、チームは「何が起こっているのか？」から「何が変わったのか？」、そして「安全にロールバックまたは修正すべきことは何か？」へと迅速な具体の対応方法への提示につなげることが可能になると言っています。


## 調査から見えてきた課題

これらの施策が進む一方で、いくつかの課題も浮上しています。

### 1. AI 起因の障害リスク

AI の自律化が進む一方で、AI の誤判断や設定ミスに起因する障害リスクも現実のものとなっています。Gartner は I&O 領域での AI use case について、ROI 期待を満たして完全に成功しているものは 28%、20% は完全に失敗していると 2026 年 4 月に報告しています ([Gartner](https://www.gartner.com/en/newsroom/press-releases/2026-04-07-gartner-says-artificial-intelligence-projects-in-infrastructure-and-operations-stall-ahead-of-meaningful-roi-returns))。AI は信頼性を向上させると同時に新たな障害の原因になりうる、というパラドックスは業界全体が認識する課題となっています。

### 2. 労働時間の変化

SRE Report 2026 によると、Toil の中央値は 34% で、前年より増えています。また、AI により toil が減ったとする回答が半数近くある一方で、約 3 分の 1 は変化なし、一部は新しい負担が増えたと回答しています ([Catchpoint](https://www.catchpoint.com/learn/sre-report-2026))。AI 導入が必ずしも toil を減少させるわけではなく、維持、検証、説明責任も新しい toil になりうることがわかります。

### 3. 信頼性と「証明」

AI SRE 特に Stage 3-4 に進むと、ブラックボックス的な自動化ではエンジニアに受け入れられないという問題があります。AI の推薦には証跡、タイムライン、変更履歴を伴って表示される能力が信頼性を担保する上で不可欠になります。特に人間にとって。

この「証明」は研究領域でもテーマになっており、2026 年 5 月に公開された SREGym は、実際の cloud-native stack 上で fault injector によって障害を起こし、AI SRE agent の診断・緩和能力を評価する benchmark を提案しています ([arXiv](https://arxiv.org/abs/2605.07161))。プロダクト導入だけでなく、AI SRE agent をどう測るか、どう再現性のある形で比較するかも論点になってきています。

## まとめ

2026 年の SRE と AI は以下の施策に分類できました。

1. AI によるインシデントトリアージと原因分析
2. 自律的修復への進化
3. 予測的信頼性へシフト
4. 非構造化データ解析
5. AI エージェント自身の信頼性
6. Change-Centric 分析

これらの多くは相互補完的であり業界全体として成熟に向かうのは必然と言えると思います。前述の通り AI SRE ツールを開発・利用する段階に来たと言えますが、単にツールを導入すれば解決するのではなく、先に述べた通りデータの質と Observability 基盤が前提となることを理解しておく必要があります。Dynatrace の 2026 年調査でも、agentic AI の production 化における障壁として security/privacy/compliance と、agent を大規模に管理・監視する技術的課題が上位に挙げられています ([Dynatrace](https://www.dynatrace.com/news/press-release/pulse-of-agentic-ai-2026/))。

ますます Observability が重要と。

また個人的には、基盤を各社が独自に開発することも出来ますが世界中の SRE が同じ方向に進んでいるので近い将来に出てくるデファクトな基盤サービスに乗せる、というのが重要なポイントのような気がしています。少なくとも telemetry の語彙については OpenTelemetry の GenAI Semantic Conventions に寄せておくのが現実的に見えます。

なお、AWS・Salesforce・Honeycomb などの主要企業が集まる [AI SRE Summit 2026](https://komodor.com/ai-sre-summit-2026/) が 2026 年 5 月 12 日に開催されており、この分野への注目度の高まりをよく示しています。
