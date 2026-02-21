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

SKILL.md は以下に置いています:
https://github.com/jedipunkz/dotfiles/blob/main/.claude/skills/zellij-swarm/SKILL.md

## 概要

親 Claude Code に対して「swarm で〜して」と自然言語で指示を出すと、タスクを複数のサブタスクに分解し、それぞれを別々の Zellij Pane で動く子 Claude Code エージェントとして起動するオーケストレーションの仕組みです。

各エージェントは独立した git worktree 上で作業し、完了後に親エージェントが各ブランチをマージして Git worktree の後片付けまで行います。

## 使い方

Zellij セッション内で Claude Code を起動した状態で、以下のように指示します。

```
swarm で実装して。チーム A は ～機能のパフォーマンス改善、チーム B は～機能の追加。
```

この一文を受け取ると、Claude Code は SKILL の定義に従って自動的に以下を実行します。

1. タスクを独立したサブタスクに分解
2. 各エージェント向けに git worktree を作成
3. タスクファイルを各 worktree に配置
4. Zellij pane を起動して各エージェントを開始
5. 完了を監視
6. 全エージェント完了後にブランチをマージ
7. worktree とブランチのクリーンアップ

## 実行フローの詳細

### Step 1: タスク分解

受け取ったリクエストをファイル競合が起きない独立したサブタスクへ分解します。エージェント数は通常 2〜4 個、最大 6 個です。同一ファイルを複数エージェントが触る場合は通常実行にフォールバックします。

### Step 2: git worktree のセットアップ

各エージェント向けに git worktree を作成します。

```bash
REPO_ROOT=$(git rev-parse --show-toplevel)
BRANCH_BASE=$(git rev-parse --abbrev-ref HEAD)
AGENTS=(agent-1 agent-2 agent-3)

for agent in "${AGENTS[@]}"; do
  git worktree add "$REPO_ROOT/.gitworktree/$agent" -b "swarm/$agent"
done
```

ブランチ名は `swarm/agent-1` のような命名規則になります。各 worktree はリポジトリのルート配下の `.gitworktree/` ディレクトリに作成されるため、メインの作業ツリーとは完全に分離された環境で動作します。

### Step 3: タスクファイルの配置

各 worktree に 3 種類のファイルを作成します。

- `CLAUDE.md` — エージェントの役割と完了条件を説明するコンテキストファイル
- `.claude-task.md` — 詳細なタスク仕様と完了チェックリスト
- `.swarm-start.sh` — タスクを読み込んで Claude Code を起動するスクリプト

`.swarm-start.sh` の内容は以下のようなシンプルなものです。

```bash
#!/bin/bash
TASK=$(cat .claude-task.md)
claude --dangerously-skip-permissions "$TASK"
```

子エージェントは `--dangerously-skip-permissions` フラグ付きで起動するため、人間の承認なしに自律的に作業を進めます。

### Step 4: Zellij pane の起動

各エージェントを新しい Zellij Pane として起動します。

```bash
for agent in "${AGENTS[@]}"; do
  chmod +x "$REPO_ROOT/.gitworktree/$agent/.swarm-start.sh"
  zellij action new-pane \
    --name "swarm:$agent" \
    --cwd "$REPO_ROOT/.gitworktree/$agent" \
    -- bash .swarm-start.sh
done
```

このスクリプトは SKILL.md に記しているので、ユーザが入力することなく実行判断を行うのみです。

`zellij action new-pane` コマンドにより、現在のセッションに新しい pane が作成されます。`--name` でわかりやすい名前を付け、`--cwd` で各 worktree のディレクトリを作業ディレクトリとして指定します。Zellij セッション外から実行しようとした場合は、`$ZELLIJ` 環境変数が存在しないためスキルが動作しません。

### Step 5: 完了の監視

親エージェントは各 worktree に作成される `.swarm-status` ファイルを 30 秒間隔でポーリングし、全エージェントの完了を待ちます。

ステータスファイルのフォーマットは以下の通りです。

```
done|2026-02-21T10:30:00Z|add user authentication module
```

子エージェントが作業を完了したタイミングでこのファイルを書き込みます。

### Step 6: マージ

全エージェントの完了を確認したら、各ブランチをベースブランチにマージします。

```bash
for agent in "${AGENTS[@]}"; do
  git merge --no-ff "swarm/$agent" \
    -m "chore: merge swarm/$agent results"
done
```

### Step 7: クリーンアップ

マージ完了後、worktree とブランチを削除して作業完了です。万が一途中で処理が止まった場合は、`.gitworktree/` ディレクトリを手動で削除し worktree と swarm ブランチを force remove することで復旧できます。

## git worktree を使う理由

複数のエージェントが同じリポジトリで同時に作業する場合、ブランチを切り替えながらではなく、それぞれが独立したファイルシステムのビューを持つ必要があります。git worktree はまさにこのユースケースに適しており、1 つのリポジトリに複数のチェックアウトを作れるため、エージェントごとに完全に独立した作業環境が手に入ります。

また worktree ベースのブランチは通常のブランチと同様に扱えるため、マージ・差分確認・ログ確認などを普通の git 操作で行えます。

## まとめ

本当は公式がこのようなオーケストレーション機能を出してくれる事を望んでいますが2026年2月時点ではまだ Agent Teams の機能のみなので SKILL.md で作りました。

日々の Claude Code 利用の中で「並列でやれたら速いのに」という場面が増えたため作ったスキルですが、実際に使ってみると独立したサブタスクへの分解をうまく設計できれば作業が明確に速くなります。

git worktree のおかげでブランチ管理もシンプルで、Zellij の pane 管理との相性も良好でした。Claude Code の SKILL 機構を使っているため、「swarm で」と一言添えるだけで動き出すのが体験としてちょうど良いです。

SKILL.md 自体はシンプルなマークダウンなので、自分のワークフローに合わせてカスタマイズして使ってみてください。
