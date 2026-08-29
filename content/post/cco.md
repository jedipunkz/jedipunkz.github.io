---
title: "複数の AI コーディングエージェントを1つのターミナルから起動・監視するツールを作った"
description: "Go で実装した TUI ダッシュボード付きのマルチエージェント管理ツール agx の設計と実装について紹介します"
date: 2026-03-14T00:00:00+09:00
Categories: ["AI", "tools", "development", "Go"]
draft: false
---

[jedipunkz](https://x.com/jedipunkz) です。

なお公開当初は `ax` という名前でしたが、その後 `agx` (agent cross) にリネームしました。この記事も現在の `agx` に合わせて内容を更新しています。

## 背景

Claude Code を日常的に使う中で、複数のエージェントを同時に動かしたいというシーンが増えてきました。例えば複数の独立したタスクを並列で走らせたいとき、それぞれのエージェントが今どんな状態にあるかをターミナル1つで把握したいと思っていました。

## 幾つかのアプローチについて

以前[Zellij を使って Claude Code のマルチエージェント並列・直列実行環境を作った](https://jedipunkz.rocks/post/zellij-swarm-claude-code/) という記事を書いたのですが、これは1つのレポジトリに対して複数の機能開発・リファクタ・その他修正を並列でそれぞれ別の Claude Code で行い最終的にそれぞれの git worktree 上の差分をマージする統合管理 Claude Code を実現するものでした。これは Claude Code 純正の機能 Sub Agents とは異なり複数の Claude Code をオーケストレーションするモノとして利用していたのですが、対象が1つのレポジトリに限定されること、また最終的にそれぞれの差分をマージするのであれば Sub Agents で事足りる事も多くなってきていました。

それに対して最近の要件としては下記のように変化してきました。

- 複数のレポジトリの修正を行いたい
- それぞれのエージェントのオーケストレーションよりも、それぞれの可視化と管理をしたい

そこで Go で agx というツールを作りました。
リポジトリはこちらです:
https://github.com/jedipunkz/agx

## agx とは

agx は「1つのターミナルから複数の AI コーディングエージェントを起動・監視する」ための CLI ツールです。

主な機能は以下の通りです。

- `agx agent new` でエージェントを起動（git リポジトリ内では自動で git worktree を作成）
- Claude Code / Codex CLI / Gemini CLI / OpenCode に対応。`-a` で使い分ける
- `agx dash` で TUI ダッシュボードを開き、全エージェントの状態をリアルタイムで確認
- ダッシュボードから各エージェントのログと worktree の差分をその場で参照
- `agx agent logs` / `wait` / `input` で、実行中のエージェントを別ターミナルやシェルスクリプトから扱える
- バックグラウンドのデーモンプロセスが Unix ドメインソケット経由でエージェントと各クライアント間の状態を仲介

公開当初は Claude Code 専用で、起動と一覧表示だけのツールでしたが、そこから対応エージェントの追加、ログ配信、差分ビュー、待ち合わせ・入力送信といった機能が加わり、現在は v1.0.0 になっています。

## スクリーンショット

表示は下記のようになります。vim キーバインドで移動出来ます。

![list](/pix/ax.png)

（スクリーンショットはリネーム前の `ax` 時代のものですが、画面構成は現在も同じです）

## インストール

Homebrew が使えます。

```bash
brew tap jedipunkz/agx && brew install agx
```

Go がインストールされていれば以下でも入ります。

```bash
go install github.com/jedipunkz/agx@latest
```

いずれの場合も、起動したいエージェントの CLI（`claude` / `codex` / `gemini` / `opencode` のいずれか）が `$PATH` にある必要があります。

## 使い方

### エージェントの起動

git リポジトリの中で実行します。カレントディレクトリからリポジトリを検出して、専用の worktree を作ってからエージェントを起動します。

```bash
cd /path/to/your/repo
agx agent new
```

デフォルトは Claude Code です。`-a` で他のエージェントを指定します。

```bash
agx agent new -a claude      # Claude Code (default)
agx agent new -a codex       # OpenAI Codex CLI
agx agent new -a gemini      # Gemini CLI
agx agent new -a opencode    # OpenCode
```

`-n` で名前をつけられます。この名前がそのまま worktree のブランチ名になるので、ブランチ名を指定しておくと管理上良いです。`--` の後ろはエージェント自身のオプションとしてそのまま渡されます。

```bash
agx agent new -n feat/foo
agx agent new -n feat/foo -- --model sonnet --dangerously-skip-permissions
agx agent new -a codex -n feat/foo -- --sandbox workspace-write --ask-for-approval never
```

### セッションの再開

ID または名前を指定して、前回のセッションを同じ worktree で再開します。エージェントごとの再開方法（`claude --continue`、`codex resume --last`、`gemini --resume latest`、`opencode --continue`）は agx 側が持っているので、利用者はどれを使っていても同じコマンドで再開できます。

```bash
agx agent resume -n feat/foo
```

### 一覧・移動・削除

```bash
agx agent list                  # ID, 名前, リポジトリ, 終了時刻, worktree のパス
agx agent cd -n <name|id>       # そのエージェントの worktree で新しいシェルを開く
agx agent remove -n <name|id>   # 終了済みエージェントの worktree・ログ・状態を削除
```

`remove` は worktree に未コミットの変更や未追跡ファイルが残っている場合、何も消さずに拒否します。ブランチはどちらにせよ残るので、コミットしてから消すか、`-f` で明示的に破棄します。

### ログの参照

```bash
agx agent logs -n <name|id>      # ANSI エスケープを除去してログを出力
agx agent logs -f -n <name|id>   # 新しい出力を追従表示 (Ctrl-C で終了)
```

`-f` はデーモン経由で配信されるため、エージェントを起動した端末とは別のターミナルからでも追えます。

### 差分の確認

そのエージェントがセッション中に積んだコミットの差分を、ページャ経由で色付き表示します。

```bash
agx agent diff -n <name|id>
```

### 待ち合わせと入力送信

個人的に一番効いている機能です。エージェントが終了するか、プロンプトで入力待ちになるまでブロックします。終了時はエージェント自身の終了コード（シグナルで殺された場合は `130`）を、入力待ちで止まった場合は `0` を返すので、シェルのパイプラインにそのまま組み込めます。

```bash
agx agent wait -n <name|id> && ./deploy.sh
```

入力待ちのエージェントには、別のターミナルから回答を送れます。

```bash
agx agent input -n <name|id> "y\n"
```

入力の送信はエージェントが実際に入力待ちの間だけ受け付けられます。処理中に送るとデーモンが拒否するので、起動元の端末で打っているキーと混ざりません。

### TUI ダッシュボードの起動

```bash
agx dash
```

エージェントを起動すると下記のような TUI で状態を確認できます。上部に選択中エージェントの概要（名前・エージェント種別・PID・作業ディレクトリ・ブランチ・起動引数・経過時間やコミット数などの統計）が出て、その下が Running / Success / Killed のセクションに分かれた一覧になります。

```
Name/Id                  Agent    Repo         Status    Ended       Last Output
feat/foo                 claude   my-repo      running               Editing src/main.go
fix/bar                  codex    my-repo      waiting               Do you want to proceed?
chore/baz                claude   other-repo   success   04/03 21:42 /exit
```

### キーバインド

| キー | アクション |
|------|-----------|
| `j` / `↓` | カーソルを下に移動 |
| `k` / `↑` | カーソルを上に移動 |
| `enter` | 詳細ビュー（ログ）を開く |
| `d` | worktree の差分ビューを開く |
| `o` | 終了済みエージェントの表示切り替え |
| `/` | ID・名前で絞り込み |
| `y` | `cd <worktree のパス>` をクリップボードにコピー |
| `K` | 選択中のエージェントを強制終了 (SIGTERM) |
| `r` | 選択中のエージェントを削除（確認あり） |
| `q` / `ctrl+c` | 終了 |

差分ビューは、記録済みのコミット・未コミットの変更・未追跡ファイルをまとめて色付きの unified diff として表示します。エージェントが実行中は2秒ごとに再読み込みされ、更新の新しいファイルほど上に並ぶので、変更が入ってくる様子をそのまま眺められます。再読み込みしてもスクロール位置は保たれます。

### ステータスインジケーター

| シンボル | 意味 |
|---------|------|
| `⠋ running` | エージェントが処理中 |
| `waiting` | 入力待ち (プロンプト表示中) |
| `success` | 終了コード 0 で正常終了 |
| `failed` | 非ゼロ終了コードで異常終了 |
| `killed` | シグナルによる強制終了 |

終了済みのエージェントはデフォルトで 7 日間表示され続けます（後述の設定で変更可能）。`o` で表示・非表示を切り替えられます。

## アーキテクチャ

システムは3つの層で構成されています。

```
┌───────────────────────────────────────────────────┐
│ Clients                                           │
│  - TUI Dashboard (agx dash): list / detail / diff │
│  - CLI (agx agent logs -f | wait | input)         │
│  - both usable from any terminal                  │
└────────────────────┬──────────────────────────────┘
                     │ JSON-lines / Unix socket
┌────────────────────▼──────────────────────────────┐
│ Daemon  (~/.agx/agx.sock, ~/.agx/state.json)      │
│  - single instance guarded by ~/.agx/daemon.lock  │
│  - broadcast state / relay output / forward input │
└────────────────────┬──────────────────────────────┘
                     │ state updates / output / input
┌────────────────────▼──────────────────────────────┐
│ Agent Process Layer (agx agent new | resume)      │
│  - Boot claude|codex|gemini|opencode with PTY     │
│  - Detect Idle (waiting) Status                   │
│  - Track Commits Made in the Worktree             │
│  - Output Logs into ~/.agx/agents/<id>/output.log │
└───────────────────────────────────────────────────┘
```

### エージェントプロセス (agx agent)

`agx agent new` は PTY (Pseudo-Terminal) を使ってエージェントのサブプロセスを起動します。PTY を経由することで双方向の I/O を実現しつつ、出力ストリームを監視して状態検出に使います。

エージェントは処理中（思考中・ツール実行中・出力ストリーミング中）は継続的に stdout にバイト列を流します。入力プロンプトを出して待機状態になると stdout が止まります。この特性を利用して **2秒間無出力** であれば「waiting」状態として検出します。

同時に、起動時の HEAD を覚えておいて worktree に積まれたコミットを追跡しています。`agx agent diff` とダッシュボードの差分ビューは、この記録を使って「このエージェントが何をしたか」を表示しています。

### 状態管理と IPC

デーモンは2つのメカニズムで状態を管理します。

- `~/.agx/state.json`: アプリ再起動をまたいで状態を復元するための永続スナップショット
- `~/.agx/agx.sock`: JSON-lines プロトコルによるリアルタイムなメッセージストリーミング

デーモンは自動起動する設計で、エージェントや TUI がソケットに到達できない場合、バックグラウンドプロセスとして自動でフォークして最大5秒間ソケットの利用可能を待ちます。また agx のバイナリがデーモン起動時より新しい場合は、古いデーモンを落としてから新しいものを立ち上げます。バージョンアップ後に古いデーモンが残り続けるのを防ぐためです。

デーモンは状態を配るだけでなく、ログ出力の中継（`attach`）と、入力待ちエージェントへの入力転送も担っています。`agx agent logs -f` や `agx agent input` が起動元と別のターミナルから使えるのはこのためです。

### デーモンの単一インスタンス保証

各デーモンは自分のメモリ上のエージェントマップから `state.json` を書き出します。そのため同じデータディレクトリを2つのデーモンが掴むと、互いのエージェントを静かに消し合います。これを防ぐため、デーモンは `~/.agx/daemon.lock` に対する排他 advisory ロック (`flock`) をプロセスの生存期間中ずっと保持します。ロックはファイルのオープン記述子に紐づくので、デーモンがクラッシュしてもカーネルが自動的に解放してくれます。ロックを取れなかった側は「既に誰かが動いている」と判断して静かに終了します。

### git worktree との統合

`agx agent new` を git リポジトリ内で実行すると、自動的に専用の git worktree を `~/.agx/worktrees/<repo>-<id>/` に作成し、HEAD からブランチを切ります。ブランチ名は `-n` で渡した名前がそのまま使われ、指定しなかった場合や同名ブランチが既にある場合は `agx/<id>` になります。エージェントはこの隔離された worktree 内で動作するため、各エージェントの変更がメインの作業ツリーに干渉しません。

worktree の作成に失敗した場合、agx はリポジトリのルートにフォールバックせずエラーで終了します。隔離こそが agx 経由でエージェントを起動する理由なので、フォールバックしてしまうと利用者が今いるブランチに直接コミットが積まれることになるためです。この場面で警告を出してもエージェントの全画面 UI に即座に上書きされて気づけないので、そもそも起動しない方を選んでいます。

## 設定ファイル

`~/.agx/agx.yaml` で挙動を変えられます。任意なので、無ければデフォルトで動きます。

```yaml
theme: tokyonight          # tokyonight (default) / catppuccin / solarized-dark / kanagawa-wave
duration_days: 7d          # 終了済みエージェントをダッシュボードに表示する期間
remove_duration_days: 30d  # 終了後、worktree を自動削除するまでの期間
```

`agx dash` の実行中は、バックグラウンドで古い worktree を自動的に片付けます。起動時に1回、その後は24時間ごとに動き、`~/.agx/worktrees/` 配下にある終了済みエージェント（success / failed / killed）の worktree のうち、閾値より古いものだけを削除します。放っておくと worktree がどんどん溜まるので、これがないと結局手で消すことになります。

## ディレクトリ構成

下記のようにホームディレクトリ上にファイルが構成されます。

```
~/.agx/
├── agx.yaml              # 設定ファイル (任意)
├── agx.sock              # Unix ドメインソケット (デーモン IPC)
├── daemon.pid            # デーモンの PID
├── daemon.lock           # 単一インスタンスを保証する advisory ロック
├── state.json            # エージェント状態スナップショット
├── agents/
│   └── <id>/
│       └── output.log    # エージェントごとの出力ログ
└── worktrees/
    └── <repo>-<id>/      # エージェントごとの git worktree
```

## 実装で工夫した点

### PTY によるアイドル検出

「処理中」と「入力待ち」の区別は PTY 出力のアイドル時間で判定しています。2秒という閾値は実際に使いながら調整した値です。短すぎると誤検知が増え、長すぎると UI の応答が遅くなります。この判定はエージェントごとのプロンプト文字列に一切依存せず「出力が止まる」という共通の性質だけを見ているので、対応エージェントを増やしてもここには手が入りません。

### デーモンの自動起動

明示的な `agx daemon` コマンドを不要にするため、エージェントや TUI がソケットを見つけられない場合にデーモンを自動フォークする設計にしました。ユーザーが「デーモンを先に起動する」という手順を意識しなくてよいため、体験がシンプルになります。

### エージェントの追加は1箇所

対応エージェントは内部のレジストリに「再開時に渡す引数」だけを登録する形にしています。新しいエージェントに対応するのはこのテーブルへの1行追加で済み、起動・監視・worktree・ログまわりのコードには手が入りません。

### bubbletea による TUI

TUI は [bubbletea](https://github.com/charmbracelet/bubbletea) フレームワークで実装しています。一覧ビュー・詳細ビュー・差分ビューの3画面構成で、詳細ビューではエージェントのメタデータと最新の出力ログをスクロール表示できます。

## まとめ

agx を使うと、複数の AI コーディングエージェントの状態を1つのターミナルで把握しながら並列作業できます。git worktree との統合により各エージェントが独立した作業ツリーを持つため、変更が互いに干渉しない点も便利です。

今、agx の開発自体もこの agx を使って行っています。それぞれのエージェントの操作完了時に PR 作成を指示して作業を完結する、という使い方です。複数の機能を1つに PR にまとめるなら Sub Agents や以前の自分の記事の Swarm SKILL が良いですが、実際の作業ではそれぞれ機能・修正ごとに PR を作るので、今はこの agx が自分に適していると感じています。

ぜひ使ってみてください。フィードバックや Issue も歓迎です。
