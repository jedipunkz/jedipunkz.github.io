+++
title = "Claude Code から OpenCode へ移行した理由と使いこなし術"
description = "AI コーディングアシスタントを Claude Code から OpenCode に移行した経緯と、OpenCode の優れた機能（柔軟なキーバインド、多様なモデルサポート、MCP 対応など）について紹介します"
aliases = [
  "/blog/2025/12/28/opencode-migration",
  "/post/2025/12/28/opencode-migration"
]
date = "2025-12-28"
Categories = ["ai", "coding", "tools"]
+++

最近、AI コーディングアシスタントとして使っていた Claude Code から [OpenCode](https://opencode.ai/) に移行しました。この記事では OpenCode の優れた機能と、なぜ移行を決めたのかを紹介します。

## OpenCode とは

OpenCode は、ターミナルベースのオープンソース AI コーディングエージェントです。75以上の LLM プロバイダーをサポートし、高度にカスタマイズ可能なインターフェースを提供します。

公式サイト: [https://opencode.ai/](https://opencode.ai/)
公式ドキュメント: [https://opencode.ai/docs](https://opencode.ai/docs)
GitHub: [https://github.com/opencode-ai/opencode](https://github.com/opencode-ai/opencode)

## Claude Code から移行した理由

### 1. 柔軟なキーバインド設定

OpenCode の最大の魅力は、**キーバインドを自由にカスタマイズできる**点です。

#### Emacs 風のキーバインドをサポート

長年ターミナルを使ってきた私にとって、Emacs 風のキーバインドは手放せません。OpenCode では以下のようなキーバインドが自然に使えます：

- `Ctrl-a`: 行頭に移動
- `Ctrl-e`: 行末に移動
- `Ctrl-k`: カーソル位置から行末まで削除
- `Ctrl-f`, `Ctrl-b`: 前後に移動
- `Meta-f`, `Meta-b`: 単語単位で移動

これらは Claude Code では期待通りに動作しませんでしたが、OpenCode では完璧に機能します。

#### Enter と Ctrl-Enter を使い分け可能

特に便利なのが、**改行とメッセージ送信を分離できる**点です：

- `Enter`: メッセージを送信（デフォルト）
- `Shift+Enter` または `Ctrl+Enter`: 改行のみ

Claude Code では Enter を押すとすぐに送信されてしまい、複数行のメッセージを書くのが不便でした。OpenCode では `Shift+Enter` や `Ctrl+Enter` を改行に割り当てることで、より柔軟な入力が可能です。

#### opencode.json でのキーバインド設定例

OpenCode のキーバインドは `~/.config/opencode/opencode.json` で完全にカスタマイズできます。以下は実践的な設定例です：

```json
{
  "keybinds": {
    // 入力操作
    "input_submit": "return",              // Enterで送信
    "input_newline": "shift+return,ctrl+return",  // Shift+EnterまたはCtrl+Enterで改行

    // Emacs風の移動
    "input_line_home": "ctrl+a",          // 行頭に移動
    "input_line_end": "ctrl+e",           // 行末に移動
    "input_move_left": "ctrl+b",          // 左に移動
    "input_move_right": "ctrl+f",         // 右に移動
    "input_word_left": "alt+b",           // 単語単位で左に移動
    "input_word_right": "alt+f",          // 単語単位で右に移動

    // 削除操作
    "input_kill_line": "ctrl+k",          // カーソル位置から行末まで削除
    "input_delete_line": "ctrl+shift+d",  // 行全体を削除

    // 編集操作
    "input_undo": "ctrl+-,super+z",       // 元に戻す
    "input_paste": "ctrl+v,super+v",      // 貼り付け

    // メッセージ閲覧
    "messages_page_up": "pgup",           // ページアップ
    "messages_page_down": "pgdown",       // ページダウン
    "messages_half_page_up": "ctrl+alt+u",   // 半ページアップ
    "messages_half_page_down": "ctrl+alt+d", // 半ページダウン
    "messages_copy": "<leader>y",         // メッセージをコピー

    // アプリケーション操作（リーダーキー使用）
    "session_new": "<leader>n",           // 新しいセッション
    "editor_open": "<leader>e",           // エディタを開く
    "theme_list": "<leader>t",            // テーマ選択
    "model_list": "<leader>m",            // モデル選択
    "command_list": "ctrl+p",             // コマンド検索
    "app_exit": "ctrl+c,<leader>q",       // 終了

    // 不要なキーバインドを無効化
    "session_compact": "none"
  }
}
```

#### カスタマイズ可能なリーダーキー

OpenCode は**リーダーキー方式**を採用しており、デフォルトでは `Ctrl+x` がリーダーキーです。これにより、ターミナルとのキーバインドの衝突を避けられます。

例えば、新しいセッションを開始する場合：
1. `Ctrl+x` を押す（リーダーキー）
2. `n` を押す（新規セッション）

#### 設定ファイルの配置場所

キーバインド設定は以下のファイルに記述します：

- **グローバル設定**: `~/.config/opencode/opencode.json` - すべてのプロジェクトで有効
- **プロジェクト設定**: プロジェクトルートの `opencode.json` - 特定のプロジェクトでのみ有効

プロジェクト設定は グローバル設定とマージされ、重複する項目はプロジェクト設定が優先されます。

### 2. 各社のモデルが利用可能

OpenCode は **75以上の LLM プロバイダー**をサポートしており、状況に応じて最適なモデルを選択できます。

#### サポートされる主なプロバイダー

- **OpenAI**: GPT-5.1, GPT-5.1 Codex
- **Anthropic**: Claude Sonnet 4.5, Claude Haiku 4.5
- **Google**: Gemini 3 Pro
- **AWS Bedrock**
- **Groq**
- **Azure OpenAI**
- **OpenRouter**
- **ローカルモデル**: Qwen3 Coder など

#### 推奨モデル

ドキュメントでは、コード生成とツール呼び出しに優れた以下のモデルを推奨しています：

- GPT 5.1、GPT 5.1 Codex
- Claude Sonnet 4.5、Claude Haiku 4.5
- Kimi K2、GLM 4.6
- Qwen3 Coder、Gemini 3 Pro

#### モデルの切り替え方法

`/models` コマンドを入力するだけで、設定済みプロバイダーのモデルを簡単に選択できます。認証情報は `/connect` コマンドで追加可能です。

デフォルトモデルは `opencode.json` で設定できます：

```json
{
  "model": "anthropic/claude-sonnet-4.5"
}
```

Claude Code では Claude モデルに限定されていましたが、OpenCode なら**タスクに応じて最適なモデルを選択**できます。例えば、軽量なタスクには Haiku、複雑なリファクタリングには Sonnet といった使い分けが可能です。

### 3. Agent Skills を公式サポート

OpenCode は、2025年12月に Anthropic が発表した **Agent Skills** 標準を公式にサポートしています。Microsoft VS Code、GitHub、Cursor などと並んで、OpenCode は Agent Skills をサポートする主要な AI コーディングツールの一つです。

#### Agent Skills とは

Agent Skills は、AI システムに特定のタスクを一貫して実行させる方法を教えるための**オープンスタンダード**です。毎回詳細なプロンプトを書く代わりに、指示、スクリプト、リソースを含むフォルダを作成し、AI に再利用可能な「スキル」として提供できます。

詳細は公式サイトを参照: [https://agentskills.io/](https://agentskills.io/)

#### Skills の配置場所

Skills は以下のディレクトリに配置します：

- **プロジェクト固有**: `.opencode/skill/<name>/SKILL.md`
- **グローバル**: `~/.opencode/skill/<name>/SKILL.md`
- **Claude 互換**: `.claude/skills/<name>/SKILL.md`（Claude との互換性のため）

#### SKILL.md の記述例

各 Skill は `SKILL.md` ファイルで定義します。以下は実践的な例です：

```markdown
---
name: git-release
description: Create consistent releases and changelogs
license: MIT
compatibility: opencode
metadata:
  audience: maintainers
  workflow: github
---

## What I do
- Draft release notes from merged PRs
- Propose a version bump based on semantic versioning
- Create git tags and GitHub releases
- Update CHANGELOG.md automatically

## When to use me
- When you're ready to create a new release
- After merging a set of PRs to main
- When you need to generate release notes

## How I work
1. Analyze recent commits and merged PRs
2. Categorize changes (features, fixes, breaking changes)
3. Suggest version number based on changes
4. Generate formatted release notes
5. Create git tag and push to GitHub

## Example usage
"Create a new release for version 1.2.0"
"Generate release notes from the last 10 merged PRs"
```

#### フロントマターの必須項目

- `name`: 1〜64文字の小文字英数字とハイフン。**ディレクトリ名と一致する必要があります**
- `description`: スキルの概要説明

オプション項目として `license`、`compatibility`、`metadata` なども指定できます。

#### パーミッション設定

`opencode.json` で Skills の読み込みを制御できます：

```json
{
  "permission": {
    "skill": {
      "pr-review": "allow",      // このスキルは自動的に読み込む
      "internal-*": "deny",       // internal-で始まるスキルは隠す
      "*": "ask"                  // その他はユーザーに確認
    }
  }
}
```

パーミッションの種類：
- `allow`: 即座に読み込み
- `deny`: エージェントから隠蔽
- `ask`: ユーザー承認を求める（デフォルト）

#### Skills の実用例

以下のような Skills を作成すると便利です：

- **コードレビュー**: `pr-review` - プルリクエストの自動レビュー
- **テスト生成**: `test-generator` - ユニットテストの自動生成
- **リファクタリング**: `refactor-clean` - コードのクリーンアップ
- **ドキュメント生成**: `doc-generator` - README やコメントの生成
- **セキュリティチェック**: `security-scan` - セキュリティ脆弱性のチェック

OpenCode が Skills を自動的に発見し、適切なタイミングで提案してくれます。

### 4. MCP（Model Context Protocol）対応

OpenCode は **MCP サーバー**を完全にサポートしており、外部ツールやサービスとの統合が容易です。

#### MCP サーバーの種類

**ローカルサーバー**: コマンドを実行してローカルで起動するサーバー

```json
{
  "mcp": {
    "my-local-server": {
      "type": "local",
      "command": ["npx", "-y", "my-mcp-command"]
    }
  }
}
```

**リモートサーバー**: URL とヘッダー情報を指定して接続

```json
{
  "mcp": {
    "my-remote-server": {
      "type": "remote",
      "url": "https://api.example.com/mcp",
      "headers": {
        "Authorization": "Bearer YOUR_TOKEN"
      }
    }
  }
}
```

#### OAuth 認証の自動処理

OpenCode は **OAuth 認証を自動処理**します。サーバーが 401 応答を返すと、Dynamic Client Registration（RFC 7591）を活用して認証フローを開始し、トークンを安全に保存します。

#### 注意点

MCP サーバーはコンテキストに追加されるため、**有効化するサーバーは慎重に選ぶ**必要があります。多数のサーバーを有効化すると、コンテキスト使用量が急増し、制限を超える可能性があります。

### 5. 日本語入力の快適性

Claude Code では、日本語入力の変換中に**文字が横にずれる**現象が頻繁に発生し、非常にストレスでした。

OpenCode では、この問題が発生せず、**日本語入力が自然に行えます**。TUI（Terminal User Interface）の実装が優れており、IME との相性も良好です。

### 6. 豊富なカラーテーマ

OpenCode には**有名なカラーテーマが最初から組み込まれています**。エディタやターミナルで人気のテーマがすぐに使えます。

#### 利用可能な組み込みテーマ一覧

OpenCode には以下のテーマが標準で含まれています：

- **system** - ターミナルの背景色に自動適応（ANSI カラーを使用）
- **tokyonight** - 東京の夜景をイメージした人気のダークテーマ
- **everforest** - 目に優しい森をイメージしたテーマ
- **ayu** - シンプルで洗練されたダークテーマ
- **catppuccin** / **catppuccin-macchiato** - パステル調の柔らかいテーマ
- **gruvbox** - レトロで温かみのあるカラースキーム
- **kanagawa** - 日本的な美意識を取り入れたテーマ
- **nord** - 北欧風の落ち着いたテーマ
- **matrix** - ハッカースタイルの黒地に緑
- **one-dark** - Atom エディタの人気テーマ

#### テーマの変更方法

テーマは以下の2つの方法で切り替えられます：

1. **リアルタイムで切り替え**: `<leader>t`（デフォルトでは `Ctrl+x` → `t`）を押す
2. **設定ファイルで指定**: `opencode.json` に記述する

```json
{
  "theme": "tokyonight"
}
```

または `/theme` コマンドでテーマセレクタを起動することもできます。

#### カスタムテーマの作成

OpenCode では、カスタムテーマを作成して独自の配色を定義できます。テーマファイルは以下のディレクトリに配置します：

- **グローバル**: `~/.config/opencode/themes/`
- **プロジェクト固有**: `.opencode/themes/`

カスタムテーマの例（`my-theme.json`）：

```json
{
  "defs": {
    "bg": "#1a1b26",
    "fg": "#c0caf5",
    "accent": "#7aa2f7",
    "error": "#f7768e",
    "success": "#9ece6a"
  },
  "theme": {
    "primary": "{accent}",
    "secondary": "#565f89",
    "background": "{bg}",
    "text": "{fg}",
    "border": "#292e42",
    "error": "{error}",
    "success": "{success}",

    // 構文ハイライト
    "syntax_keyword": "#bb9af7",
    "syntax_string": "#9ece6a",
    "syntax_number": "#ff9e64",
    "syntax_comment": "#565f89",
    "syntax_function": "#7aa2f7",

    // Diff表示
    "diff_add": "#449dab",
    "diff_delete": "#914c54",
    "diff_modify": "#806d9c"
  }
}
```

#### テーマのカスタマイズ可能な要素

OpenCode のテーマは **62種類のカラープロパティ**をサポートしており、以下の要素をカスタマイズできます：

- **UI 要素**: 背景、テキスト、ボーダー、アクセントカラー
- **構文ハイライト**: キーワード、文字列、数値、コメント、関数など
- **Diff 表示**: 追加、削除、変更の色分け
- **Markdown レンダリング**: 見出し、リンク、コードブロックなど

カスタムテーマでは、16進数カラー（`#1a1b26`）、ANSI カラー、色参照（`{accent}`）、ダーク/ライト変種に対応しています。

好みの配色で作業環境をカスタマイズできるのは、長時間コーディングする上で重要なポイントです。

## OpenCode のその他の便利な機能

### Plan モードと Build モード

OpenCode には **Plan モード**と **Build モード**があります。

- **Plan モード**: 実装前に設計を検討し、計画を立てる
- **Build モード**: 実際にコードを書いて実装する

モードを切り替えることで、思考フェーズと実装フェーズを明確に分離できます。

### セッション管理

OpenCode は **SQLite でセッションを永続化**します。過去の会話履歴を参照したり、複数のプロジェクトを切り替えたりするのが簡単です。

- `<leader>n`: 新しいセッションを開始
- `Ctrl+p`: コマンド検索
- `<leader>e`: エディタを開く

### ツール統合

OpenCode は以下のようなツールと統合されています：

- **LSP（Language Server Protocol）**: コード補完や定義ジャンプなどの IDE 機能
- **コマンド実行**: ターミナルコマンドを直接実行
- **ファイル操作**: ファイルの読み書きや修正

### 変更管理

- `/undo`: 直前の変更を元に戻す
- `/redo`: 元に戻した変更をやり直す

これらのコマンドで、AI が行った変更を簡単に管理できます。

### 共有機能

`/share` コマンドで、チーム内で会話を共有できます。ペアプログラミングやコードレビューに便利です。

## 実際の使用感

### 開発フローの改善

OpenCode に移行してから、開発フローが大幅に改善されました：

1. **キーバインドのストレスがゼロ**: Emacs 風のキーバインドで、思考を中断せずにコーディングできます
2. **モデルの使い分けが可能**: 軽い質問には Haiku、複雑なリファクタリングには Sonnet を使うなど、コスト効率も向上
3. **日本語入力が快適**: ドキュメントやコメントを日本語で書くのが楽になりました
4. **MCP で拡張性が高い**: 自分のワークフローに合わせてカスタマイズできます

### 唯一の注意点

OpenCode のオリジナルリポジトリは 2025年9月18日にアーカイブされ、開発は [Crush](https://github.com/charmbracelet/crush) プロジェクトに移行しています。ただし、OpenCode 自体は十分に成熟しており、現時点でも問題なく使用できます。将来的には Crush への移行も検討する予定です。

## まとめ

Claude Code から OpenCode に移行した理由をまとめると：

1. **柔軟なキーバインド設定**
   - Emacs 風のキーバインド（Ctrl-a, Ctrl-e, Ctrl-k など）が完璧に動作
   - Enter と Shift+Enter/Ctrl+Enter の使い分けで複数行入力が快適
   - `opencode.json` で全てのキーバインドをカスタマイズ可能

2. **75以上の LLM プロバイダー対応**
   - OpenAI、Anthropic、Google、AWS など主要プロバイダーをサポート
   - タスクに応じて最適なモデルを選択できる
   - `/models` コマンドで簡単に切り替え

3. **Agent Skills の公式サポート**
   - Anthropic の Agent Skills 標準を完全サポート
   - SKILL.md で再利用可能なタスクを定義
   - パーミッション設定で柔軟な制御が可能

4. **MCP 完全対応**
   - ローカル・リモート MCP サーバーをサポート
   - OAuth 認証の自動処理
   - 外部ツールとの統合が容易

5. **日本語入力が快適**
   - 変換中の文字ずれがない
   - IME との相性が良好

6. **豊富なカラーテーマ**
   - tokyonight、gruvbox、nord など10種類以上の組み込みテーマ
   - カスタムテーマの作成も可能
   - 62種類のカラープロパティで細かくカスタマイズ

特に、**キーバインドのカスタマイズ性**、**モデルの選択肢の広さ**、**Agent Skills の公式サポート**は、Claude Code にはない大きな利点です。

ターミナルベースの AI コーディングアシスタントを探している方、特に Emacs ユーザーや複数の LLM を使い分けたい方、Agent Skills でワークフローを効率化したい方には、OpenCode を強くおすすめします。

## 参考リンク

- [OpenCode 公式サイト](https://opencode.ai/)
- [OpenCode ドキュメント](https://opencode.ai/docs)
- [OpenCode GitHub リポジトリ](https://github.com/opencode-ai/opencode)
- [Agent Skills 公式サイト](https://agentskills.io/)
- [Anthropic's Agent Skills announcement](https://www.anthropic.com/news/agent-skills)
- [Simon Willison's Agent Skills article](https://simonwillison.net/2025/Dec/19/agent-skills/)
- [Crush プロジェクト（後継）](https://github.com/charmbracelet/crush)
- [Superpowers (and Skills) for OpenCode - ブログ記事](https://blog.fsck.com/2025/11/24/Superpowers-for-OpenCode/)
