---
title: "Claude Code から OpenCode へ移行した話"
description: "AI コーディングアシスタントを Claude Code から OpenCode に移行した経緯と、OpenCode の優れた機能（柔軟なキーバインド、多様なモデルサポート、MCP 対応など）について紹介します"
date: 2025-12-28T10:42:32+09:00
Categories: ["ai", "coding", "tools"]
---
[jedipunkz🚀](https://x.com/jedipunkz) です。

最近、AI コーディングアシスタントとして使っていた Claude Code から [OpenCode](https://opencode.ai/) に移行しました。この記事では OpenCode の優れた機能と、なぜ移行を決めたのかの決めてを紹介します。

> **注記 (2025-12-28)**
> OpenCode プロジェクトは、2024年7月に開発元の Charm 社による買収と運営方針を巡って、コントリビューター間で論争が発生しました。その後、Charm 版は [Crush](https://github.com/charmbracelet/crush) としてリブランドされ、現在の OpenCode は SST 組織によって [https://github.com/sst/opencode](https://github.com/sst/opencode) で開発が継続されています。両プロジェクトは現在も別々のツールとして存在しており、この記事では SST 版の OpenCode について紹介しています。

## OpenCode とは

OpenCode は、ターミナルベースのオープンソース AI コーディングエージェントです。75以上の LLM プロバイダーをサポートし、高度にカスタマイズ可能なインターフェースを提供します。

公式サイト: [https://opencode.ai/](https://opencode.ai/)
公式ドキュメント: [https://opencode.ai/docs](https://opencode.ai/docs)
GitHub: [https://github.com/opencode-ai/opencode](https://github.com/opencode-ai/opencode)

## Claude Code から移行した理由

### 1. 日本語入力
Claude Code では、日本語入力の変換中に文字が横にずれる現象が頻繁に発生し、非常にストレスでした。
OpenCode では、この問題が発生せず日本語入力が自然に行えます。地味ですが一番自分にとって大きいメリットだったかもしれません。

### 2. 柔軟なキーバインド設定

OpenCode の最大の魅力は、キーバインドを自由にカスタマイズできる点です。

#### 日本語入力
Claude Code では、日本語入力の変換中に**文字が横にずれる**現象が頻繁に発生し、非常にストレスでした。

OpenCode では、この問題が発生せず、**日本語入力が自然に行えます**。TUI（Terminal User Interface）の実装が優れており、IME との相性も良好です。

#### Emacs 風のキーバインドをサポート

Emacs 風のキーバインドが設定出来る点は自分にとっては大きかったです。設定せずとも自然に Emacs 風にバインドされているキーもあります。

- `Ctrl-a`: 行頭に移動
- `Ctrl-e`: 行末に移動
- `Ctrl-h`: 一文字削除
- `Ctrl-k`: カーソル位置から行末まで削除
- `Ctrl-f`, `Ctrl-b`: 前後に移動

```json
  "keybinds": {
    "input_backspace": "backspace,shift+backspace,ctrl+h",
    "input_delete_to_line_end": "ctrl+k"
  },
```


#### Enter と Ctrl-Enter を使い分け可能

特に便利なのが、改行とメッセージ送信を分離できる点です：

- `Enter`: メッセージを送信（デフォルト）
- `Shift+Enter` または `Ctrl+Enter`: 改行のみ

Claude Code では Enter を押すとすぐに送信されてしまい、複数行のメッセージを書くのが不便でした。OpenCode では `Cmd+Enter` や `Ctrl+Enter` を改行に割り当てることで、より柔軟な入力が可能です。自分の場合は `Cmd+Enter` と `Ctrl+Enter` を両方設定しています。

```json
  "keybinds": {
    "input_submit": "ctrl+return,super+return",
    "input_newline": "return,shift+return,alt+return",
  },
```


#### 設定ファイルの配置場所

キーバインド設定は以下のファイルに記述します：

- グローバル設定: `~/.config/opencode/opencode.json` - すべてのプロジェクトで有効
- プロジェクト設定: プロジェクトルートの `opencode.json` - 特定のプロジェクトでのみ有効

プロジェクト設定は グローバル設定とマージされ、重複する項目はプロジェクト設定が優先されます。

### 3. 各社のモデルが利用可能

OpenCode は現時点 (2025/12) で 75以上の LLM プロバイダーをサポートしており、状況に応じて最適なモデルを選択できます。

#### サポートされる主なプロバイダー

- OpenAI
- Anthropic
- Google
- AWS Bedrock
- Groq
- Azure OpenAI
- ローカルモデル: Qwen3 Coder など


#### モデルの切り替え方法

`/models` コマンドを入力するだけで、設定済みプロバイダーのモデルを簡単に選択できます。認証情報は `/connect` コマンドで追加可能です。

デフォルトモデルは `opencode.json` で設定できます。

```json
{
  "model": "anthropic/claude-sonnet-4.5"
}
```

Claude Code では Claude モデルに限定されていましたが、OpenCode なら**タスクに応じて最適なモデルを選択**できます。例えば、軽量なタスクには Haiku、複雑なリファクタリングには Sonnet といった使い分けが可能です。

### 4. (Sub) Agent のカスタマイズサポート

Agent や Sub Agent のサポートも大きいメリットです。下記のように独自のエージェントを設定でき、@<agent 名> でメンションすることで呼び出すことが出来ます。自分の場合は下記のように @reviewer サブエージェントを設定しています。ここで利用するモデルをメインのものと変える事もできます。

```json
  "agent": {
    "reviewer": {
      "description": "Code review agent with read-only permissions for analyzing code quality",
      "mode": "subagent",
      "model": "anthropic/claude-sonnet-4-5",
      "prompt": "You are a code reviewer specialized in analyzing code quality, best practices, security vulnerabilities, and potential bugs. You can read files, search code patterns using glob and grep, and provide detailed feedback. You cannot modify files.",
      "tools": {
        "write": false,
        "edit": false,
        "bash": false
      },
      "permission": {
        "edit": "deny",
        "bash": "deny"
      }
    }
  }
```

### 5. Agent Skills を公式サポート

OpenCode は、2025年12月に Anthropic が発表した Agent Skills 標準を公式にサポートしています。

#### Agent Skills とは

Agent Skills は、AI システムに特定のタスクを一貫して実行させる方法を教えるためのオープンスタンダードです。毎回詳細なプロンプトを書く代わりに、指示、スクリプト、リソースを含むフォルダを作成し、AI に再利用可能な「スキル」として提供できます。

詳細は公式サイトを参照: [https://agentskills.io/](https://agentskills.io/)

#### Skills の配置場所

Skills は以下のディレクトリに配置します：

- プロジェクト固有: `.opencode/skill/<name>/SKILL.md`
- グローバル: `~/.opencode/skill/<name>/SKILL.md`
- Claude 互換: `.claude/skills/<name>/SKILL.md`（Claude との互換性のため）

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

- `name`: 1〜64文字の小文字英数字とハイフン。ディレクトリ名と一致する必要があります
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


### 6. MCP（Model Context Protocol）対応

OpenCode は MCP サーバーにサポートしており、外部ツールやサービスとの統合が容易です。

#### MCP サーバーの種類

ローカルサーバー: コマンドを実行してローカルで起動するサーバー

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

リモートサーバー: URL とヘッダー情報を指定して接続

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


### 7. 豊富なカラーテーマ

OpenCode には**有名なカラーテーマが最初から組み込まれています**。エディタやターミナルで人気のテーマがすぐに使えます。

#### 利用可能な組み込みテーマ一覧

OpenCode には以下のテーマが標準で含まれています：

- system
- tokyonight
- everforest
- catppuccin
- gruvbox
- kanagawa
- nord
- one-dark

#### テーマの変更方法

テーマは以下の2つの方法で切り替えられます：

1. リアルタイムで切り替え: `<leader>t`（デフォルトでは `Ctrl+x` → `t`）を押す
2. 設定ファイルで指定: `opencode.json` に記述する

```json
{
  "theme": "tokyonight"
}
```

または `/theme` コマンドでテーマセレクタを起動することもできます。

#### カスタムテーマの作成

OpenCode では、カスタムテーマを作成して独自の配色を定義できます。テーマファイルは以下のディレクトリに配置します：

- グローバル: `~/.config/opencode/themes/`
- プロジェクト固有: `.opencode/themes/`

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

    "syntax_keyword": "#bb9af7",
    "syntax_string": "#9ece6a",
    "syntax_number": "#ff9e64",
    "syntax_comment": "#565f89",
    "syntax_function": "#7aa2f7",

    "diff_add": "#449dab",
    "diff_delete": "#914c54",
    "diff_modify": "#806d9c"
  }
}
```


## 参考リンク

- [OpenCode 公式サイト](https://opencode.ai/)
- [OpenCode ドキュメント](https://opencode.ai/docs)
- [OpenCode GitHub リポジトリ](https://github.com/opencode-ai/opencode)
- [Agent Skills 公式サイト](https://agentskills.io/)
- [Anthropic's Agent Skills announcement](https://www.anthropic.com/news/agent-skills)
- [Simon Willison's Agent Skills article](https://simonwillison.net/2025/Dec/19/agent-skills/)
- [Crush プロジェクト（後継）](https://github.com/charmbracelet/crush)
- [Superpowers (and Skills) for OpenCode - ブログ記事](https://blog.fsck.com/2025/11/24/Superpowers-for-OpenCode/)
