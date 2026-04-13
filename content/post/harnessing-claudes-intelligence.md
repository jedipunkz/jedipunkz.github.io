+++
title = "Harnessing Claude's Intelligence: エージェントハーネスエンジニアリングの最新知見"
date = "2026-04-13"
Categories = ["AI", "infrastructure"]
description = "Anthropic 公式ブログ「Harnessing Claude's Intelligence」の内容を網羅的に解説。エージェントハーネス設計における3つのパターン、ベンチマーク結果、プロンプトキャッシング戦略まで詳細にまとめる。"
+++

2026年4月2日、Anthropic の Claude Platform チームの Lance Martin が公式ブログ「Harnessing Claude's Intelligence」を公開した。本記事はその内容を日本語で網羅的に解説する。

エージェントを構築する上で「ハーネス」とは、モデルの能力を引き出すための設計・実装全体を指す。このブログポストは、モデルの進化に伴いハーネスをどう再設計すべきかという問いに対する、Anthropic 自身の回答である。

## 背景: モデルは「育てられる」

Anthropic の共同創業者 Chris Olah の言葉を引用しながら記事は始まる。

> 「Claude のような生成 AI システムは、構築されるというより育てられる」

エージェントフレームワークは「Claude が単独ではできないこと」に関する仮定を埋め込んでいる。しかしモデルの能力は継続的に向上する。その仮定を定期的に見直さなければ、ハーネスは能力の足かせになってしまう。

---

## 全体構造

この記事が示す設計思想は3つのパターンに集約される。

```
+----------------------------------------------------+
|        Agent Harness Design: 3 Patterns            |
|                                                    |
|  Pattern 1: Use what Claude already knows          |
|  Pattern 2: Ask "What can I stop doing?"           |
|  Pattern 3: Set boundaries carefully               |
+----------------------------------------------------+
```

---

## Pattern 1: Claude がすでに知っていることを使う

### 基本ツールの力を信頼する

Claude 3.5 Sonnet は `bash` とテキストエディタツールだけを使って **SWE-bench Verified で 49%** を達成した。これは当時の state-of-the-art である。

Claude Code もこれと同じ基本ツールを使っている。`bash` はエージェントアーキテクチャのために設計されたわけではないが、Claude がそれを巧みに活用するからこそ機能する。

### 構成の積み重ね

以下はいずれも基本的な `bash` とテキストエディタの上に構築されている:

```
+-------------------------------+
|  Agent Skills                 |
|  Programmatic tool calling    |
|  Memory tool                  |
+-------------------------------+
        |
        v
+-------------------------------+
|  bash + text editor (base)    |
+-------------------------------+
```

---

## Pattern 2: 「やめられること」を問い続ける

このパターンは3つのサブアプローチで構成される。

### 2-A: Claude 自身にアクションをオーケストレーションさせる

#### 問題: コンテキストウィンドウの無駄

従来のハーネスでは、すべてのツール結果を Claude のコンテキストウィンドウ経由でルーティングする。Claude の推論を必要としない結果でもトークンコストが発生する。

たとえば大きなデータテーブルを読み込んで特定の列だけを抽出したい場合、Claude が処理しない行のトークンまでコストを支払うことになる。

#### 解決策: コード実行ツールの提供

`bash` や言語固有の REPL などのコード実行ツールを提供することで、Claude は:

- ツール呼び出しを表すコードを記述する
- 出力を独立してフィルタリングする
- コンテキストを消費せずに結果をパイプする

```
Before:
  Tool Result (large) ---> Claude Context Window ---> Process

After:
  Tool Result ---> Self-filtering via Claude-written code
                     |
                     v
               Only necessary data enters Context
```

#### ベンチマーク結果

BrowseComp (Web 閲覧ベンチマーク) において、Opus 4.6 に出力フィルタリング能力を付与した結果 (+16.3% の改善):

| 設定 | 精度 |
|---|---|
| ベースライン | 45.3% |
| 出力フィルタリングあり | 61.6% |

---

### 2-B: Claude 自身にコンテキストを管理させる

#### 問題: 手作りシステムプロンプトのスケーラビリティ

タスク固有の指示が埋め込まれた手作りのシステムプロンプトはスケールしない。プリロードされたトークンは Claude の「注意バジェット」を消費し続ける。

#### 解決策 1: スキルフレームワーク

YAML で各スキルの概要を簡潔に記述し、関連するときにのみファイル読み込みで全内容をロードする。

```
System Prompt (always loaded):
  +------------------------------------------+
  | skill: code_review                        |
  |   description: "Review code"             | <- YAML summary only
  | skill: deploy                             |
  |   description: "Execute deployment"      |
  +------------------------------------------+
             |
             | loaded on demand
             v
  +------------------------------------------+
  | Full skill content loaded via file read  |
  +------------------------------------------+
```

#### 解決策 2: コンテキスト編集

古くなった情報 (古いツール結果、思考ブロックなど) を選択的に削除する。

#### 解決策 3: サブエージェント

Claude が独立したサブタスクのために新しいコンテキストウィンドウを生成する。

```
Main Agent (Opus 4.6)
  |
  |-- subtask_1 --> [fresh context] Sub Agent A
  |-- subtask_2 --> [fresh context] Sub Agent B
  |-- subtask_3 --> [fresh context] Sub Agent C
  |
  <- aggregate results
```

BrowseComp での結果: Opus 4.6 がサブエージェントを使うことで **+2.8%** の改善。

---

### 2-C: Claude 自身にコンテキストを永続化させる

長時間動作するエージェントは単一のコンテキストウィンドウの上限を超える。

#### 解決策 1: コンパクション (要約)

Claude が過去のコンテキストを要約し、タスクの継続性を維持する。パフォーマンスはモデルの能力に直結する:

| モデル | 精度 | 備考 |
|---|---|---|
| Sonnet 4.5 | 43% | バジェット無関係で横ばい |
| Opus 4.5 | 68% | |
| Opus 4.6 | 84% | |

#### 解決策 2: メモリフォルダ

Claude がコンテキストをファイルに書き出し、必要に応じて取得する。

BrowseComp-Plus での結果 (+6.8% の改善、Sonnet 4.5):

| 設定 | 精度 |
|---|---|
| メモリフォルダなし | 60.4% |
| メモリフォルダあり | 67.2% |

#### 実例: ポケモンゲームプレイ

同じタスク (ポケモンのゲームをプレイする) を異なるモデルに実行させた結果が印象的だ。

**Sonnet 3.5 (旧モデル)**:
- メモリをトランスクリプトとして扱う
- ステップ14,000時点: ファイル31個
- まだ2番目の町にいる (進捗が遅い)

**Opus 4.6 (最新モデル)**:
- 戦略的にディレクトリ構成を整理
- ステップ同時点: ファイル10個 (ディレクトリ配下)
- ジムバッジを3つ取得済み
- 失敗から学んだ知見を蒸留して記録

モデルが賢くなるほど、より少ない情報でより多くを成し遂げる。これがコンパクションの効果がモデル能力と連動する理由だ。

---

## Pattern 3: 境界を慎重に設定する

### 3-A: キャッシュヒットを最大化するコンテキスト設計

#### Messages API の性質

Messages API はステートレスである。ハーネスは各ターンで全コンテキストを再パッケージする必要がある。

#### プロンプトキャッシング

Claude API は指定したブレークポイントでコンテキストをキャッシュし、以前のエントリとの一致を確認する。

**コストメリット**: キャッシュ済みトークンのコストはベース入力トークンの **10%** である。

#### キャッシュ最適化の原則

| 原則 | ガイダンス |
|---|---|
| Static first, dynamic last | システムプロンプト・ツールなど安定したコンテンツを変動コンテンツより前に置く |
| Messages for updates | プロンプトを編集するのではなく `<system-reminder>` を messages に追記する |
| Don't change models | キャッシュはモデル固有。切り替えるとキャッシュが破壊される。安価なモデルが必要ならサブエージェントを使う |
| Carefully manage tools | ツールはキャッシュプレフィックスに含まれる。追加・削除でキャッシュが破壊される。動的な発見にはツール検索を使う |
| Update breakpoints | マルチターンアプリでは最新 message にブレークポイントを移動させる。auto-caching も活用する |

#### キャッシュ効果的な構造

```
[Conversation Turn N]
  +---------------------------------+
  | System Prompt  (static)         | <- cached
  | Tools          (static)         | <- cached
  +---------------------------------+
  | Prior Messages (semi-static)    | <- cached
  +---------------------------------+
  | Latest Message (dynamic)        | <- not cached
  +---------------------------------+
```

---

### 3-B: UX・可観測性・セキュリティのための宣言的ツール

Claude はアプリケーションのセキュリティ境界や UX サーフェスを理解していない場合がある。そこで特定の目的のために専用ツールを用意する。

#### 専用ツールを作るべきケース

**1. セキュリティ境界**

元に戻しにくいアクション (外部 API 呼び出しなど) にはユーザー確認ゲートを設ける。

```
Claude              Dedicated Tool           External API
  |                      |                        |
  |-- action request --> |                        |
  |                      |-- show confirm dialog -> User
  |                      |<-- approve/deny ------- User
  |                      |-- only if approved --> |
  |<-- result ---------- |<---------------------- |
```

**2. データ保護**

書き込みツールに「古さチェック」を組み込み、上書きを防止する。

**3. ユーザーインタラクション**

モーダルとしてレンダリングしてオプションを表示し、ユーザーのフィードバックを待つブロッキングループを実現する。

**4. 可観測性**

型付きツールは構造化された引数を提供し、ログ取得・トレーシング・リプレイを可能にする。

```json
{
  "timestamp": "2026-04-13T10:00:00Z",
  "tool": "delete_directory",
  "args": {
    "path": "/data/old",
    "recursive": true
  },
  "user_approved": true
}
```

#### Claude Code の事例: auto-mode

Claude Code の研究フェーズでは、`bash` コマンドの安全性をセカンダリ Claude がレビューする仕組みを使っている。これにより専用ツールの必要性が将来的に減少する可能性を示している。

---

## ベンチマーク一覧

記事で紹介されているすべてのベンチマーク数値をまとめる。

**SWE-bench Verified**

| 設定 | 精度 |
|---|---|
| Claude 3.5 Sonnet (bash + text editor のみ) | 49% |

**BrowseComp**

| 設定 | 精度 |
|---|---|
| Opus 4.6 ベースライン | 45.3% |
| Opus 4.6 出力フィルタリングあり | 61.6% (+16.3%) |
| Opus 4.6 サブエージェントあり | 基準値 +2.8% |

**BrowseComp-Plus (コンパクション)**

| モデル | 精度 |
|---|---|
| Sonnet 4.5 | 43% (バジェット無関係) |
| Opus 4.5 | 68% |
| Opus 4.6 | 84% |

**BrowseComp-Plus (メモリフォルダ、Sonnet 4.5)**

| 設定 | 精度 |
|---|---|
| メモリフォルダなし | 60.4% |
| メモリフォルダあり | 67.2% (+6.8%) |

---

## まとめ: 「Bitter Lesson」とハーネス設計

記事の結論は明快だ。

> 「Claude の能力が進化するにつれて、エージェントハーネスに組み込まれた仮定は時代遅れになる。継続的な再評価なしには、そうした仮定がパフォーマンスのボトルネックになる。」

「Bitter Lesson」の原則を引用し、構造的な制約はモデルの実際の能力に基づいて刈り込むべきであり、以前の仮定を温存するべきではないと述べている。

```
Old harness problem:
  +-----------------------------------------+
  | [Harness assumption (outdated)]          |
  |   "Claude cannot do X -> do Y instead"  |
  |                                          |
  |  -> When Claude can now do X,           |
  |     Y becomes unnecessary complexity    |
  +-----------------------------------------+

Right approach:
  +-----------------------------------------+
  | Continuously ask:                        |
  | "What can I stop making Claude do?"      |
  +-----------------------------------------+
```

技術的な実装の詳細は GitHub 上の [claude-api skill](https://github.com/anthropics/skills/tree/main/skills/claude-api) で公開されている。

---

## 参考

- 元記事: https://claude.com/blog/harnessing-claudes-intelligence
- 著者: Lance Martin (Technical Staff, Claude Platform team)
- 公開日: 2026年4月2日
