---
title: "Google が提唱する AI SRE とは何か ── 自律型運用の体系的解説"
description: "Google SRE チームが発表した「AI in SRE」論文をもとに、AI-Ops ガバナンス・自律性レベル・評価フレームワーク・AI Operator / Actus の実装まで体系的に解説します"
date: 2026-06-12T12:00:00+09:00
Categories: ["SRE", "AI", "Operations", "Platform Engineering"]
draft: false
---

こんにちは。[jedipunkz🚀](https://x.com/jedipunkz) です。

Google SRE チームが公開した論文「[AI in SRE: How Google is Engineering the Future of Reliable Operations](https://sre.google/resources/practices-and-processes/ai-engineering-reliable-operations/)」を読み込んで、その内容を体系的にまとめました。著者は Ioannis Papapanagiotou、Stevan Malesevic、Chris Heiser、Ruslan Meshenberg の4名。単なる「AI でアラートを減らそう」という話ではなく、SRE そのものが AI によって構造的に変容していく過程を、具体的なシステム名・フレームワーク・測定結果を交えて論じた内容です。

---

## なぜ今 AI SRE なのか

AI 支援開発によって生産性が最大4倍向上することを目指す組織が急増しています。それ自体は良いことですが、コードレビューや運用プロセスという「人間がボトルネック」になる部分は4倍速にはなりません。機械生成コードの量に対して従来のコードレビュー手法はスケールしない、システム複雑性の急速な増加に標準的な運用プロセスが追いつかない、という問題が顕在化しています。

Google SRE の回答は次の通りです。

> "SRE is architecting a new foundation for reliability"

その新しい基盤として、3つの中核コンポーネントを開発しています。

| コンポーネント | 役割 |
|--------------|------|
| **AI Operator** | 自律型緩和エージェント（本番アラートに自動対応） |
| **Actus** | 厳密な実行ガードレール（安全な実行制御平面） |
| **IRM Analyzer** | 人間の運用知識を継続的に取り込む評価パイプライン |

---

## AI-Ops ガバナンスの課題：6つのリスク領域

本番環境での AI 活用にあたり、Google は6つのリスク領域を特定しています。

1. **進化する人間の専門知識**：オペレータが「手動で直す人」から「AI エージェントを監督するアーキテクト」へシフトする変化への対応
2. **説明可能性と信頼の構築**：自律エージェントの判断を Chain of Thought でリアルタイム追跡し、すべての意思決定を監査可能にする必要性
3. **データ整合性とバイアス軽減**：本番環境データの品質と完全性確保
4. **動的環境でのモデルドリフト**：進化するシステム行動へ AI モデルが適応できるか
5. **セキュリティベクトル**：敵対的攻撃・データポイズニング・プロンプトインジェクション対策
6. **意図しない自動化の結果**：フィードバックループや連鎖障害の防止

### Safety Trifecta（安全保障の三要素）

これら6つのリスクに対し、Google SRE は **Safety Trifecta** と呼ぶ3本柱の統治モデルを採用しています。

**透明性（Transparency）**

> "AI actions and decisions must be observable and understandable"

エージェントは使用したシグナル、検討した仮説、行動選択の理由、信頼度レベルをすべて記録します。

**リアルタイムリスク評価**

提案されるすべての自動アクションは、現在の本番状態・エラーバジェット残量・進行中のデプロイメント・時間帯に基づくリスクを考慮して評価されます。

**段階的認可（Progressive Authorization）**

自律性レベルを段階的にスケールさせる仕組みで、後述の L0〜L4 モデルと連動します。

### アーキテクチャ上のガードレール

| ガードレール | 内容 |
|-----------|------|
| アンビエント・アクセスなし | エージェント固有の認証と最小権限の原則 |
| エージェント・サーキット・ブレーカー | エージェント固有のレート制限と自動遮断 |
| ドライラン必須化 | `dry_run=true` モードの標準実装 |
| ゼロトラスト実行 | 安全メカニズムを備えたツール経由のみ本番操作を許可 |

---

## SRE 自律性の5段階モデル（L0〜L4）

論文の核心のひとつが、自律性を5段階で定義した **SRE Autonomy Levels** です。自動車の自動運転レベルと同様の考え方ですが、SRE 文脈で「監視・調査・承認・実行・自己主導」という5軸で評価します。

| レベル | 監視 | 調査 | 承認 | 実行 | 自己主導 |
|--------|------|------|------|------|---------|
| **L0：手動** | 人間 | 人間 | 人間 | 人間 | 人間 |
| **L1：支援** | 自動 | 自動 | 人間 | 人間 | 人間 |
| **L2：部分自律** | 自動 | 自動 | 人間 | 自動 | 人間 |
| **L3：高度自律** | 自動 | 自動 | 自動 | 自動 | 人間 |
| **L4：完全自律** | 自動 | 自動 | 自動 | 自動 | 自動 |

**各レベルの詳細**

- **L0（手動実行）**：すべてが人間駆動。従来の SRE スタイル。
- **L1（支援）**：AI が分析と提案を提供し、人間が承認・実行する。アラート充実化や Incident Hypothesis がここに該当。
- **L2（部分自律）**：AI が実行前に人間の明示的承認を必要とする。ステージングや安全なパスが確立されている操作向け。
- **L3（高度自律）**：十分定義されたシナリオで AI が独立実行する。Google の AI Operator は軽微インシデントに対して L3 を達成。
- **L4（完全自律）**：複数ステップの解決と複雑なシナリオ管理。現時点では研究段階。

**レベルを上げるためのゲート**

昇格は自動ではなく、統計的な成功実績に基づきます。

- L1 → L2：正確な提案生成と安全な実行パスの確立
- L2 → L3：信頼構築と高精度デモンストレーションの継続
- L3 → L4：マルチステップ解決能力と動的戦略適応の実証

---

## 人間の運用知識を継承する評価フレームワーク

AI エージェントの品質を担保するために、Google は人間の運用経験を「ゴールデンデータ」として継続的に収集・評価する仕組みを構築しています。

### IRM-Analyzer

インシデント管理ツールのチャット、インシデント記録、コマンドラインエントリから、AI が以下を自動抽出します。

- 主要イベント（タイムライン）
- 実施したアクション
- 使用したツール
- 検討した仮説

これをもとに、各インシデントの「人間が実際に取った操作軌跡」を構造化します。

![IRM-Analyzerのタイムラインと人間の操作軌跡](https://lh3.googleusercontent.com/N7DM7UkXwEOIAr8o87nIDPqB8YzU_OdBa4U08pBEEg-eulPToMWDiGtx47z54v0dXeQhVJjiCXk6N93TnM1Po-osvy432BPEcu65kaRzq_JZ7CoeEg=w1024)

*図1: IRM-Analyzer によるタイムラインと人間操作軌跡の可視化。出典: [Google SRE - AI Engineering Reliable Operations](https://sre.google/resources/practices-and-processes/ai-engineering-reliable-operations/)*

### 3階層のデータ品質分類

| 階層 | 生成方法 | 信頼度 |
|------|---------|--------|
| **Bronze** | 自動ラベラーによる発見的生成 | 低〜中 |
| **Silver** | プログラム生成 + Gold データとの数学的キャリブレーション | 中 |
| **Gold** | 人間専門家による検証済みデータ | 高 |

層化サンプリングにより多様な Gold データを継続生成し、Silver データとの精度ギャップを埋め続けます。

### Golden データの生成フロー

オンコーラーがインシデント解決を宣言する際、システムが構造化提案を自動生成し、承認・修正・拒否を通じてシームレスに高品質ラベルを収集します。通常ワークフローに組み込まれているため、追加負担がほとんどありません。

![ミティゲーションの構造化提案](https://lh3.googleusercontent.com/xZaZxl9ADcGhu6JMDuKrrPfL7pdDthkJ7VgzLr3rLBOhuZay3db-A2nN4iTf1O064YUcQAOFEHVKVSc66A07KOy2fjCAvhKrf0utoheM5rHWwcqOGw=w1024)

*図2: インシデント解決時に自動生成されるミティゲーションの構造化提案。出典: [Google SRE - AI Engineering Reliable Operations](https://sre.google/resources/practices-and-processes/ai-engineering-reliable-operations/)*

### 継続的夜間評価（Nightly Evals）

毎晩、2種類の評価手法でエージェントの品質を計測します。

1. **LLM-as-a-Judge**：定性的な側面（推論の妥当性・説明の質）を評価
2. **決定論的スコアリング**：最終出力の精度・再現率を機械的に測定（緩和アクションのパラメータが Golden Data と完全一致する場合のみ「正確」と判定）

---

## SRE ライフサイクル全体への AI 統合

論文は AI を単一ツールとして捉えるのではなく、SRE のライフサイクル全体に段階的に組み込むロードマップを示しています。

### 1. 本番環境の観察：Detectr

従来のメトリクス・ログ・トレースベースの監視には「既知の障害モードしか検出できない」という根本的な限界があります。Google が開発した **Detectr** は Gemini を活用し、以下のユーザーシグナルを分析することで未知の障害を早期検出します。

- カスタマーサポートチケット
- 外部フォーラムへの投稿
- ソーシャルメディア

関連フィードバックボリュームが信号となり、ノイズを自然にフィルタリング。Cloud・Ads・YouTube・Search の複数チームで採用され、**数百時間の顧客影響削減** を達成しています。

### 2. アラート充実化：AI Alert

未加工アラートをリッチなコンテキストで補強し、初期調査時間を大幅削減します。**約2分**という厳密な実行時間枠内で、以下を並列クエリします。

- モニタリングシステム
- ロギングプラットフォーム
- 本番変更ログ
- 依存関係グラフ

読み取り専用モードで動作し、検証可能なファクトとエビデンスベースの洞察、ソースへのリンクを付与します。

### 3. インシデント調査支援（L1）

**Incident Hypothesis（インシデント仮説）**

LLM と RAG（検索拡張生成）を組み合わせ、以下を総合分析して根本原因候補を提示します。

- リアルタイム異常
- サービスプレイブック
- アプリケーションログ
- 類似過去インシデントのパターン

A/B テストで **MTTM（平均緩和時間）を10% 削減** することが確認されています。

**Investigation Dashboard（調査ダッシュボード）**

動的 AI 駆動システムが、インシデント固有の「統一ビュー」をオンデマンド生成します。分析は4段階の能力で構成されます。

1. **異常検知**：ML モデルが時系列の視覚的偏差をフラグ化
2. **変化の相関**：アラート信号との関連付け
3. **調査価値評価**：調査対象の有望性を判定
4. **根本原因特定**：最高レベルの分析精度

100以上のドメイン固有「トラブルシューター」を並列実行することで、**ML 駆動の異常検知により検出数が195%増加**し、**MTTM を約44%削減** しています。

![自動トラブルシューティンググラフ](https://lh3.googleusercontent.com/6iSBMx5PL1UUaUIpGJA38GKPIyjlPToMWDiGtx47z54v0dXeQhVJjiCXk6N93TnM1Po-osvy432BPEcu65kaRzq_JZ7CoeEg=w1024)

*図5: Investigation Dashboard の自動トラブルシューティンググラフ。出典: [Google SRE - AI Engineering Reliable Operations](https://sre.google/resources/practices-and-processes/ai-engineering-reliable-operations/)*

**Antigravity CLI（Gemini 駆動 CLI）**

SRE がターミナルから自然言語で本番環境を操作できるインターフェースです。内部では **Model Context Protocol（MCP）** を使った Production Agent サーバーが動作し、以下のツールカテゴリを提供します。

| カテゴリ | 機能 |
|---------|------|
| 可観測性 | 時系列データクエリ、ログ検索、異常検知 |
| インシデント管理 | インシデント詳細取得、ステータス更新 |
| トラフィック制御 | トラフィックシフト、容量変更 |
| インフラストラクチャ | コンピュートジョブ検査 |

モジュール化された **Skills ライブラリ** により、ドメイン固有の問題解決と安全でポリシー準拠のミティゲーションを実現します。

![Antigravity CLI のサブエージェント完了後の安全評価](https://lh3.googleusercontent.com/UU8wCVJIrFNK9-idmo7Gc27eL84MEj8eYc1N14_MFqV_oZh0dXeQhVJjiCXk6N93TnM1Po-osvy432BPEcu65kaRzq_JZ7CoeEg=w1024)

*図6: Antigravity CLI がサブエージェント完了後に安全評価を通過したミティゲーション提案を表示。出典: [Google SRE - AI Engineering Reliable Operations](https://sre.google/resources/practices-and-processes/ai-engineering-reliable-operations/)*

---

## 自律型ミティゲーション（L3）：AI Operator と Actus

L1 の支援ツールは認知負荷を削減しますが、運用スケーラビリティを本質的に解決するには AI が直接本番環境を変更する「実行（actuation）」が必要です。

### AI Operator

本番アラートの最初のレスポンダーとして機能する自律エージェントです。

**調査と根本原因分析（RCA）**

- 並列型拡張モジュール群（Enrichers）で多角的調査
- 過去の専門家調査事例に基づく推論ガイダンス
- 仮説の形成と検証サイクル

**緩和選択**

コンテキストの構造化カタログから適切なミティゲーションを選択します。

| 要素 | 役割 |
|------|------|
| **Enrichers** | 決定論的シグナルブースター（確実な情報の自動収集） |
| **Skills** | 問題固有の緩和メソッド |
| **Few-shot prompts** | 調査戦略のガイダンス |

**現在の自律性レベル**

- 重大運用インシデント：L2（人間 SRE の承認必須）
- 軽微インシデント：L3（自律実行）

**Chain of Thought の可視化**

すべての推論ステップが UI で可視化され、各段階で人間が方向を指示できます。長時間インシデントでも厳密なトークン管理によってハルシネーションを防止しています。

**エスカレーション**

根本原因を特定できない場合、またはセーフティー境界を超える操作が必要な場合は、即座に人間オペレータへエスカレーションします。

![AI Operator の Chain of Thought](https://lh3.googleusercontent.com/lY7LCIDsOVhwo-EHcauPpwiTQiciy83THCRS0oYBglKzTC7nIDPqB8YzU_OdBa4U08pBEEg-eulPToMWDiGtx47z54v0dXeQhVJjiCXk6N93TnM1Po-osvy432BPEcu65kaRzq_JZ7CoeEg=w1024)

*図7: AI Operator が調査から緩和まで推論する Chain of Thought の UI 表示。出典: [Google SRE - AI Engineering Reliable Operations](https://sre.google/resources/practices-and-processes/ai-engineering-reliable-operations/)*

**LLM-as-a-Judge による自己改善ループ**

自動でインシデントメタデータを分析し、エージェントのアクションを Golden Data（理想的な人間対応）と比較評価します。改善すべき領域を特定し、具体的な実装計画とともにバグとして自動登録する「自己改善ループ」を持ちます。

![LLM-as-a-Judge 評価ループ](https://lh3.googleusercontent.com/D1f5cMS6XTjPiwoVq0--ITAJLrlo9wgI4GvjqzqQUnJzZ7obzmMtqHIFCzNyp2Ev23KXKA=w1024)

*図8: AI Operator の LLM-as-a-Judge 評価ループ。正例（正しい診断と緩和）と負例（診断失敗と緩和失敗）を比較。出典: [Google SRE - AI Engineering Reliable Operations](https://sre.google/resources/practices-and-processes/ai-engineering-reliable-operations/)*

### Actus（Mitigation Safety Verification Agent）

AI Operator の推論能力と本番インフラ実行のギャップを安全に橋渡しする **統一制御平面** です。AI Operator と Actus を分離することで、モデルが進化しても実行ガバナンスは常に人間の制御下に維持されます。

**3段階ライフサイクル**

**Phase 1：標準化された Discovery & Planning**

- 利用可能な緩和ツール（トラフィックドレイン、容量アップサイズ等）の動的フィルタリングされたレジストリを提供
- `EvaluateAction` リクエストで必要パラメータをハイドレート
- LLM のインテント → 検証可能な実行計画への変換

**Phase 2：動的自律性とセーフティーガードレール**

プリフライト安全検証として以下を必須実行します。

- 義務的ドライラン（`dry_run=true`）
- 正当化検証（アクションが開かれたインシデントに対応するか）
- 並行アクション確認（競合する操作がないか）

リスクが高い L3 リクエストを検出した場合は自動で L2 にダウングレードし、人間 SRE へ承認リクエストを転送します。

**Phase 3：Post-Action Guardian**

- Long Running Operation（LRO）の状態を保持
- インフラをポーリングしてミティゲーションの成功・失敗を確認
- 緊急時は人間オペレータが **Red Button** で実行中のエージェントアクションを即座に停止し、L3 権限をグローバルに取消

---

## AI-Ops を支える技術基盤

### 高品質な本番データとメタデータ

AI-Ops の前提となるデータ基盤：

- リアルタイムテレメトリ（メトリクス・ログ・トレース）
- 正確なサービストポロジーと依存グラフ
- 歴史的インシデントデータ
- エンジニアリングプレイブック
- SLO とエラーバジェット
- 本番ツールカタログ

### RAG（検索拡張生成）プラットフォーム

LLM が最新のコンテキストで本番状態にグラウンドされた応答を生成するための基盤。Incident Hypothesis や AI Alert の核心技術です。

### Model Context Protocol（MCP）

AI が安全かつ効果的に本番環境と相互作用するための標準インターフェース。Production Agent MCP サーバーを通じて可観測性・インシデント管理・トラフィック制御・インフラ検査の各ツールを提供します。本番状態を変更するツールはすべて Actus と統合されています。

### ロバストなエージェントアイデンティティ管理

エージェントは人間とは別の一意なマシン識別可能アイデンティティを持ちます。「人間のみが実行できるアクション」を厳格化し、エージェントのすべての操作を完全な不変レコードとして記録します。

### A2A（Agent-to-Agent）通信プロトコル

モニタリング・ロールアウト・容量などのドメイン特化エージェントが協調して動作するための通信プロトコル。複数の専門エージェントが連携して複雑なインシデントを解決します。

---

## SRE の未来：エージェント SDLC での監視スケーリング

AI 統合の最深層は、SDLC（ソフトウェア開発ライフサイクル）自体の変容です。

### 人間の監視を「左にシフト」する

4倍のコード量に対して行単位のコードレビューはスケールしません。認知疲労とゴムスタンプ（形式的な承認）を招くだけです。Google SRE の回答は「抽象化階層を上昇させる」こと。

- **設計・意図・ポリシーのレビュー**：エンジニアが詳細仕様を共同執筆・承認し、AI がコードを生成する前にアーキテクチャとセーフティー制約を検証
- **Independent Harnesses**：コード生成エージェントとテストケース定義エージェントを厳格に分離し、クロスバイアス伝播を防止

### Adaptive Progressive Rollouts

高変更率環境では、従来のソーク時間と標準 Canary リリースが障壁となります。機械速度での「継続的本番検証」技術として、高 QPS な RPC システムや複雑なデータ生成パイプラインで下流消費者へ伝播する前に異常を検知するアプローチが必要です。

### Intervening Pull Request Problem と AI-Assisted Fix-Forward

急速な AI 生成デプロイメント環境では、ロールバックが危険になります。「最後の既知の正常状態」への単純なロールバックは、中間のバグ修正やセキュリティパッチを失うリスクがあるためです。

**対策**

- 動的設定・フィーチャーフラグによる問題コードパスの即座の無効化
- **AI-Assisted Fix-Forward**：ターゲットパッチを自動生成・デプロイして並行進捗を安全に保護

### SRE の役割の進化

| 従来 | これから |
|------|---------|
| 「システムを手動で運用する」 | 「自律エージェントが安全に継続イノベーションできる境界を設計する」 |
| 手動緩和・オペレーター | 建築的意図と機械速度の補償制御 |
| 既知の障害モードへの対応 | エージェントエコシステムのガバナンス設計 |

---

## 測定可能な成果まとめ

| 施策 | 定量的効果 |
|------|---------|
| Incident Hypothesis | MTTM 10% 削減（A/B テスト） |
| Investigation Dashboard | MTTM 44% 削減 |
| ML 駆動異常検知 | 検出数 195% 増加 |
| Detectr | 複数チームで数百時間の顧客影響削減 |

---

## まとめ

Google SRE の AI 統合戦略が示すのは、「AI ツールを追加する」という発想ではなく、**本番環境ガバナンスの根本的な再構想** です。

- **Safety Trifecta**（透明性・リアルタイムリスク評価・段階的認可）による段階的な信頼構築
- **Bronze / Silver / Gold** の評価データ階層と Nightly Evals による継続的な品質担保
- **AI Operator + Actus** という推論と実行を分離した責任あるアーキテクチャ
- **L0〜L4** の自律性モデルによって、統計的成功実績に基づいて段階的に自律性を拡大

4倍の開発速度でも信頼性を維持するための枠組みとして、また AI 時代の SRE エンジニアが「何を設計すべきか」の指針として、この論文は非常に示唆に富んでいます。行単位のコードレビューから設計意図のアーキテクチャル監視へのシフト、そして機械速度の補償制御を並行して構築していく── これが SRE の進化の本質と言えるでしょう。

---

*参考: [Google SRE - AI in SRE: How Google is Engineering the Future of Reliable Operations](https://sre.google/resources/practices-and-processes/ai-engineering-reliable-operations/)*
