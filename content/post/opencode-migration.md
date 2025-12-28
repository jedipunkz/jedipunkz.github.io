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

- `Enter`: 改行のみ（複数行のメッセージを書ける）
- `Ctrl-Enter`: メッセージを送信

Claude Code では Enter を押すとすぐに送信されてしまい、複数行のメッセージを書くのが不便でした。OpenCode では `Shift+Enter` や `Ctrl+Enter` などの修飾キー付き Enter を設定できるため、より柔軟な入力が可能です。

#### カスタマイズ可能なリーダーキー

OpenCode は**リーダーキー方式**を採用しており、デフォルトでは `Ctrl+x` がリーダーキーです。これにより、ターミナルとのキーバインドの衝突を避けられます。

例えば、新しいセッションを開始する場合：
1. `Ctrl+x` を押す（リーダーキー）
2. `n` を押す（新規セッション）

リーダーキー自体も `opencode.json` 設定ファイルでカスタマイズ可能です。不要なキーバインドは `"none"` に設定することで無効化できます。

```json
{
  "keybinds": {
    "session_compact": "none"
  }
}
```

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

### 3. 非公式だが Skills 対応

OpenCode は **Agent Skills** をサポートしています。ネイティブな実装ではありませんが、`find_skills` と `use_skills` ツールを通じて Anthropic 互換の Skills を利用できます。

#### Skills の配置場所

- **個人用 Skills**: `~/.config/opencode/skills`
- **プロジェクト固有 Skills**: `.opencode/skills`

これにより、頻繁に使うタスクを Skills として定義し、AI エージェントの能力を拡張できます。

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

OpenCode には**有名なカラーテーマが最初から組み込まれています**。

#### テーマの変更方法

`<leader>t`（デフォルトでは `Ctrl+x` → `t`）でテーマを簡単に切り替えられます。

#### カスタムテーマも可能

`opencode.json` でカスタムテーマを定義することもできます。好みの配色で作業環境をカスタマイズできるのは、長時間コーディングする上で重要なポイントです。

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

1. **柔軟なキーバインド設定**: Emacs 風のキーバインド、Enter と Ctrl-Enter の使い分けが可能
2. **75以上の LLM プロバイダー対応**: タスクに応じて最適なモデルを選択できる
3. **Skills 対応（非公式）**: AI エージェントの能力を拡張できる
4. **MCP 完全対応**: 外部ツールとの統合が容易
5. **日本語入力が快適**: 変換中の文字ずれがない
6. **豊富なカラーテーマ**: カスタマイズも可能

特に、**キーバインドのカスタマイズ性**と**モデルの選択肢の広さ**は、Claude Code にはない大きな利点です。

ターミナルベースの AI コーディングアシスタントを探している方、特に Emacs ユーザーや複数の LLM を使い分けたい方には、OpenCode を強くおすすめします。

## 参考リンク

- [OpenCode 公式サイト](https://opencode.ai/)
- [OpenCode ドキュメント](https://opencode.ai/docs)
- [OpenCode GitHub リポジトリ](https://github.com/opencode-ai/opencode)
- [Crush プロジェクト（後継）](https://github.com/charmbracelet/crush)
- [Superpowers (and Skills) for OpenCode - ブログ記事](https://blog.fsck.com/2025/11/24/Superpowers-for-OpenCode/)
