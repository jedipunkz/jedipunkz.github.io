---
title: "Zellij を使って Claude Code のマルチエージェント並列実行環境を作った"
description: "Zellij の pane 管理と git worktree を活用し、Claude Code の複数エージェントを並列実行するオーケストレーション SKILL 'zellij-swarm' を作った話"
date: 2026-02-21T00:00:00+09:00
Categories: ["AI", "tools", "development"]
draft: false
---

[jedipunkz🚀](https://x.com/jedipunkz) です。

Claude Code を日常的に使う中で、大きなタスクを複数の独立したサブタスクに分けて並列処理させたいというニーズが出てきました。例えばコードのリファクタリングとテスト追加を同時に進めたり、複数ファイルへの独立した修正を並行して行ったりといったケースです。

2026年2月に Claude Code Agent Teams という機能が出てきたのですが、あくまでも1つのタスクの中で複数のサブエージェントを稼働させるものだったので自分としては期待していたものと若干異なりました。やりたいのは親 Claude Code のプロンプトから指示を出して複数のタスクを行ってくれる子 Claude Code のオーケストレーションでした。

そこで、Zellij の Pane 管理と git worktree を組み合わせて、親 Claude Code が複数の子エージェントを Zellij Pane として起動しタスクを並列実行させる SKILL「zellij-swarm」を作りました。この記事ではその仕組みと使い方を紹介します。

SKILL は以下に置いています:
https://github.com/jedipunkz/dotfiles/tree/main/.claude/skills/zellij-swarm

## 概要

親 Claude Code に対して「swarm で〜して」と自然言語で指示を出すと、タスクを複数のサブタスクに分解し、それぞれを別々の Zellij Pane で動く子 Claude Code エージェントとして起動するオーケストレーションの仕組みです。

各エージェントは独立した git worktree 上で作業し、完了後に親エージェントが各ブランチをマージして Git worktree の後片付けまで行います。

## ディレクトリ構成

当初は単一の SKILL.md にすべてのロジックを記述していましたが、管理性を高めるため `templates/` と `scripts/` に分離しました。

```
.claude/skills/zellij-swarm/
├── SKILL.md                    # オーケストレーション手順を定義
├── templates/
│   ├── CLAUDE.md.template      # エージェント用コンテキストファイルのテンプレート
│   └── claude-task.md.template # タスク定義テンプレート
└── scripts/
    ├── setup-worktrees.sh      # worktree 作成
    ├── launch-panes.sh         # Zellij ペイン起動
    ├── monitor.sh              # ステータス監視
    ├── merge.sh                # ブランチマージ
    └── cleanup.sh              # worktree・ブランチ削除
```

SKILL.md はオーケストレーションの手順だけを記述し、実際のシェル操作は `scripts/` 配下のスクリプトに委譲します。`templates/` にはエージェントの worktree に配置するファイルのテンプレートを格納しています。

## 使い方

Zellij セッション内で Claude Code を起動した状態で、以下のように指示します。

```
swarm で実装して。チーム A は ～機能のパフォーマンス改善、チーム B は～機能の追加。
```

この一文を受け取ると、Claude Code は SKILL の定義に従って自動的に以下を実行します。

1. タスクを独立したサブタスクに分解
2. `scripts/setup-worktrees.sh` で git worktree を作成
3. `templates/` を元にタスクファイルを各 worktree に配置
4. `scripts/launch-panes.sh` で Zellij pane を起動して各エージェントを開始
5. `scripts/monitor.sh` で完了を監視
6. `scripts/merge.sh` で全エージェント完了後にブランチをマージ
7. `scripts/cleanup.sh` で worktree とブランチのクリーンアップ

## 実行フローの詳細

### Step 1: タスク分解

受け取ったリクエストをファイル競合が起きない独立したサブタスクへ分解します。エージェント数は通常 2〜4 個、最大 6 個です。同一ファイルを複数エージェントが触る場合は通常実行にフォールバックします。

### Step 2: git worktree のセットアップ

`scripts/setup-worktrees.sh` を使って各エージェント向けに git worktree を作成します。

```bash
.claude/skills/zellij-swarm/scripts/setup-worktrees.sh agent-1 agent-2 agent-3
```

スクリプトは現在のブランチをベースとして、各エージェント用の worktree を `.gitworktree/<agent>` に作成し、`swarm/<agent>` ブランチを切ります。既存の worktree がある場合はスキップする冪等な設計です。

ブランチ名は `swarm/agent-1` のような命名規則になります。各 worktree はリポジトリのルート配下の `.gitworktree/` ディレクトリに作成されるため、メインの作業ツリーとは完全に分離された環境で動作します。

### Step 3: タスクファイルの配置

`templates/` ディレクトリのテンプレートを元に、各 worktree に 3 種類のファイルを作成します。

- `CLAUDE.md` — `templates/CLAUDE.md.template` を元にしたエージェントの役割と完了条件を説明するコンテキストファイル
- `.claude-task.md` — `templates/claude-task.md.template` を元にした詳細なタスク仕様と完了チェックリスト
- `.swarm-start.sh` — タスクを読み込んで Claude Code を起動するスクリプト

テンプレートはエージェントの共通ルール（Conventional Commits の遵守、担当ディレクトリ外のファイル編集禁止、`.swarm-status` への完了通知書き込みなど）を定義しており、親エージェントがテンプレートを読み取って各 worktree に書き込みます。

`.swarm-start.sh` の内容は以下のようなシンプルなものです。

```bash
#!/bin/bash
TASK=$(cat .claude-task.md)
claude --dangerously-skip-permissions "$TASK"
```

子エージェントは `--dangerously-skip-permissions` フラグ付きで起動するため、人間の承認なしに自律的に作業を進めます。

### Step 4: Zellij pane の起動

`scripts/launch-panes.sh` を使って各エージェントを新しい Zellij Pane として起動します。

```bash
.claude/skills/zellij-swarm/scripts/launch-panes.sh agent-1 agent-2 agent-3
```

スクリプト内部では `zellij action new-pane` コマンドを使い、各 worktree のディレクトリを作業ディレクトリとして pane を作成します。`--name` で `swarm:agent-1` のようなわかりやすい名前を付けます。Zellij セッション外から実行しようとした場合は、`$ZELLIJ` 環境変数が存在しないためエラーで停止します。

### Step 5: 完了の監視

`scripts/monitor.sh` を使って全エージェントの完了を監視します。

```bash
.claude/skills/zellij-swarm/scripts/monitor.sh agent-1 agent-2 agent-3
```

スクリプトは各 worktree に作成される `.swarm-status` ファイルを 30 秒間隔でポーリングし、全エージェント完了時に自動終了します。進行中のエージェントについては直近のコミットログも表示されるため、進捗を把握できます。

ステータスファイルのフォーマットは以下の通りです。

```
done|2026-02-21T10:30:00Z|add user authentication module
```

子エージェントが作業を完了したタイミングでこのファイルを書き込みます。

### Step 6: マージ

全エージェントの完了を確認したら、`scripts/merge.sh` でベースブランチにマージします。

```bash
.claude/skills/zellij-swarm/scripts/merge.sh agent-1 agent-2 agent-3
```

競合が発生した場合はエラーで停止するため、手動で解決してからスクリプトを再実行します。

### Step 7: クリーンアップ

マージ完了後、`scripts/cleanup.sh` で worktree とブランチを削除して作業完了です。

```bash
.claude/skills/zellij-swarm/scripts/cleanup.sh agent-1 agent-2 agent-3
```

万が一途中で処理が止まった場合は、`--force` オプションを付けて実行することで強制的にクリーンアップできます。

```bash
.claude/skills/zellij-swarm/scripts/cleanup.sh --force agent-1 agent-2 agent-3
```

## git worktree を使う理由

複数のエージェントが同じリポジトリで同時に作業する場合、ブランチを切り替えながらではなく、それぞれが独立したファイルシステムのビューを持つ必要があります。git worktree はまさにこのユースケースに適しており、1 つのリポジトリに複数のチェックアウトを作れるため、エージェントごとに完全に独立した作業環境が手に入ります。

また worktree ベースのブランチは通常のブランチと同様に扱えるため、マージ・差分確認・ログ確認などを普通の git 操作で行えます。

## まとめ

本当は公式がこのようなオーケストレーション機能を出してくれる事を望んでいますが2026年2月時点ではまだ Agent Teams の機能のみなので SKILL.md で作りました。

日々の Claude Code 利用の中で「並列でやれたら速いのに」という場面が増えたため作ったスキルですが、実際に使ってみると独立したサブタスクへの分解をうまく設計できれば作業が明確に速くなります。

git worktree のおかげでブランチ管理もシンプルで、Zellij の Pane 管理との相性も良好でした。Claude Code の SKILL 機構を使っているため、「swarm で」と一言添えるだけで動き出すのが体験としてちょうど良いです。

自分のワークフローに合わせてカスタマイズして使ってみてください。
