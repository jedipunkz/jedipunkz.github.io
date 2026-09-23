---
title: "Go による Fuzzy Finder 内蔵の ghq 風リポジトリマネージャ開発"
description: "ghq list | fzf | cd のパイプラインを組まずに済むリポジトリマネージャ gm を Go と Bubble Tea で作りました。Ctrl-G でリポジトリにも Git Worktree にも飛べます"
date: 2026-09-23T12:00:00+09:00
tags: ["Go", "CLI", "Git"]
categories: ["Application", "go"]
draft: false
---

[jedipunkz](https://x.com/jedipunkz) です。

今回は自作した CLI ツール [gm](https://github.com/jedipunkz/gm) を紹介します。

gm は [ghq](https://github.com/x-motemen/ghq) と同じく `host/user/repo` の木にリポジトリを clone して管理するツールです。違うのは Fuzzy Finder を内蔵していることと、clone だけでなく Git Worktree も同じ画面から扱えることです。`Ctrl-G` を押すと Finder が開き、選んだリポジトリまたは Worktree に `cd` します。

## リンク

- ソースコード: [https://github.com/jedipunkz/gm](https://github.com/jedipunkz/gm)
- 公式サイト: [https://jedipunkz.rocks/gm/](https://jedipunkz.rocks/gm/)

## 開発動機

ghq は長く使っていて不満はほとんど無かったのですが、2 点だけ引っかかっていました。

1 つは、移動するために毎回 `ghq list | fzf | cd` 相当のパイプラインを自分で組み立てる必要があることです。rc ファイルに書いてしまえば終わりの話ではあるのですが、リポジトリの詳細 (remote・ブランチ・作業ツリーの状態) を出そうとすると `--preview` に渡すシェルスクリプトが伸びていき、結局どこかで破綻します。

もう 1 つは Git Worktree です。最近は 1 つのリポジトリに対して複数の Worktree を切って作業することが増えました。以前作った [agx](https://jedipunkz.rocks/post/cco/) も Worktree 前提のツールです。しかし ghq が知っているのは clone だけなので、Worktree への移動だけは別の手段を用意することになっていました。

この 2 つはどちらも「リポジトリ一覧を持っている側が Finder も持てば解決する」話だったので、それなら作ってしまおうというのが gm です。

## 主な機能

- Finder が内蔵されている。パイプラインを組む必要がなく、最有力候補はプロンプトのすぐ隣、リストの一番下に出るので、カーソルを動かさずに `enter` を押せる
- 並び順は自前で決めている。まずマッチ品質で並べ、同点になったときだけ frecency (どれだけ最近・どれだけ頻繁に開いたか) で決着をつける
- 選択中のリポジトリの詳細が画面に出る。パス・remote・ブランチ・作業ツリーの状態・訪問回数・直近 3 コミット (ブランチと tag の装飾つき) が並ぶので、似た名前の clone を取り違えずに済む
- Git Worktree が一級市民。`Ctrl-W` でカーソル下のリポジトリの Worktree 一覧に切り替わる
- 設定は `gm.toml` に書く。ghq は `git config` 経由でしか設定できないが、`$GHQ_ROOT` と `ghq.root` も読むので既存の ghq の木をそのまま使える
- `gm create` が `origin` まで設定する

Mercurial / Subversion / Darcs の clone、bare clone、partial clone、並列 import は意図的に実装していません。

## インストール方法

必要なのは `$PATH` 上の `git` と、True Color 対応のターミナルだけです。Homebrew の場合は Go も不要で、tap からプラットフォームに合ったバイナリを取ってきます。

```sh
brew install jedipunkz/gm/gm
```

ソースから入れる場合は Go 1.25+ が必要です。

```sh
go install github.com/jedipunkz/gm@latest
```

## シェル統合

引数無しの `gm` は Finder を開いて選ばれたパスを標準出力に出すだけなので、`$(...)` と組み合わせられます。rc ファイルに 1 行足すと、それが `Ctrl-G` での `cd` になります。

```sh
gm shell fish | source    # ~/.config/fish/config.fish
eval "$(gm shell zsh)"    # ~/.zshrc
eval "$(gm shell bash)"   # ~/.bashrc
```

## 使い方

`Ctrl-G` で Finder が開きます。あとは文字を打って絞り込むだけです。`Ctrl-W` でリポジトリ一覧と Worktree 一覧が入れ替わります。絞り込み・詳細ペイン・`enter` はどちらの一覧でも同じように動きます。

| キー | リポジトリ一覧 | Worktree 一覧 |
|---|---|---|
| 任意の文字 | 絞り込む | 絞り込む |
| `↑` / `ctrl-p` | 上に移動する | 上に移動する |
| `↓` / `ctrl-n` | 下に移動する | 下に移動する |
| `enter` | リポジトリのパスを出力して終了する | Worktree のパスを出力して終了する |
| `ctrl-w` | 選択中のリポジトリの Worktree 一覧を出す | リポジトリ一覧に戻る |
| `ctrl-alt-b` | remote をブラウザで開く | remote をブラウザで開く |
| `esc` | クエリ → 絞り込み → 終了、の順に 1 段ずつ戻す | リポジトリ一覧に戻る |

入力の先頭が `/` のときは絞り込みではなくコマンドの入力になります。入力に従って補完が出るので `tab` で確定できます。

| コマンド | 動作 |
|---|---|
| `/help` | コマンド一覧を出す |
| `/dirty` | commit していない変更があるリポジトリだけに絞り込む |
| `/create <repo>` | 確認の上でリポジトリを作り、一覧に追加する |
| `/create <branch>` | Worktree 一覧では、そのブランチを Worktree として check out する |
| `/get <repo>` | `gm get` と同じ clone をして、その clone に移動する |
| `/remove` | 確認の上で選択中のリポジトリまたは Worktree を消す |
| `/worktrees` | `ctrl-w` と同じ |
| `/remote` | `ctrl-alt-b` と同じ |

`/create` と `/remove` は Finder を抜けずに処理します。消えた行はリストから消え、作られた行は追加されて選択され、プロンプト下の行に結果が出ます。commit していない変更があるリポジトリは、同意する前に確認画面がその旨を伝えます。

Worktree の置き場所は gm が決めるので、打つのはブランチ名だけです。

```
~/gm/github.com/jedipunkz/gm/                        リポジトリ本体
~/gm/.worktrees/github.com/jedipunkz/gm/feat/login   その Worktree
```

先頭のドットは飾りではありません。Worktree には `.git` ファイルがあるため、そのままだと gm がそれをリポジトリとして一覧に載せてしまい、`gm migrate` も受け付けなくなります。走査がドット始まりのディレクトリに降りないようにすることで回避しています。

Finder を経由しないサブコマンドも一通り揃えました。

| コマンド | 動作 |
|---|---|
| `gm` | Finder を開いて、選ばれたパスを出力する |
| `gm get [-u] [--shallow] [-b <branch>] <repo>...` | 木の中に clone する。`-u` は既存の clone を更新する |
| `gm list [-p] [-e] [--unique] [<query>]` | リポジトリを一覧する |
| `gm status [--dirty] [--unpushed] [-a] [-p]` | commit していない・push していない変更があるリポジトリと Worktree を一覧する。fetch しないのでオフラインでも速い |
| `gm remove [--dry-run] [-y] <repo>...` | 確認の上でリポジトリとその Worktree を消し、空になった親を刈る |
| `gm create [-p] <repo>` | `origin` を設定済みのリポジトリを作って `git init` する |
| `gm wt <create\|remove> [-y] <repo> <branch>` | スクリプトから Worktree を足す / 消す |
| `gm migrate [--dry-run] [-y] [-r] <dir>...` | 既存の clone を `origin` を見て木の中に移す |
| `gm root [--all]` | root ディレクトリを出力する |
| `gm shell <fish\|zsh\|bash>` | `Ctrl-G` のキーバインドを出力する |

`<repo>` には完全な URL、`git@host:user/repo.git`、`host/user/repo`、`user/repo`、それに `repo` だけ (`git config github.user` で解決する) を渡せます。

## 設定

`~/.config/gm/gm.toml` は任意です。パースに失敗するファイルや、gm が知らないキーを含むファイルは、半分無視するのではなくエラーにしています。

```toml
root         = "~/ghq"         # ["~/ghq", "~/src"] と書けば順に探す
theme        = "tokyonight"
launch_key   = "ctrl-g"        # gm を開くシェル側のキー
worktree_key = "ctrl-w"        # Worktree 一覧に切り替える Finder 側のキー
remote_key   = "ctrl-alt-b"    # remote を開く Finder 側のキー
```

root は `$GM_ROOT` → `gm.toml` の `root` → `git config gm.root` → `$GHQ_ROOT` → `git config ghq.root` → `~/ghq` の順に解決します。ghq からの移行で何もしなくて良いようにこの順にしました。

テーマは `tokyonight` (デフォルト)・`solarized-dark`・`solarized-light`・`kanagawa-wave`・`catppuccin` 4 種・`rose-pine`・`dracula` の 10 種類です。

キーバインドについては、どこまでターミナルに届くかが違う点に注意が必要です。`ctrl-<英字>` はどこでも届きます。`ctrl-alt-<英字>` は Alt が ESC プレフィクスとして送られるのでほぼどこでも届きます。`ctrl-shift-<英字>` は Kitty keyboard protocol 対応のターミナル (Ghostty・kitty・WezTerm・foot・最近の Alacritty) でしか区別されず、それ以外では `ctrl-<英字>` として届きます。

## 公式サイト

ドキュメント用に公式サイトも作りました。

[https://jedipunkz.rocks/gm/](https://jedipunkz.rocks/gm/)

Astro で構築し、GitHub Pages にデプロイしています。Finder の動作を再現したデモと 10 種類のテーマのギャラリーを置いてあるので、入れる前に雰囲気が掴めると思います。

## 利用した Go パッケージ

- [charm.land/bubbletea/v2](https://github.com/charmbracelet/bubbletea) — TUI フレームワーク
- [charm.land/bubbles/v2](https://github.com/charmbracelet/bubbles) / [charm.land/lipgloss/v2](https://github.com/charmbracelet/lipgloss) — 入力コンポーネントとスタイリング
- [github.com/sahilm/fuzzy](https://github.com/sahilm/fuzzy) — ファジーマッチ
- [github.com/BurntSushi/toml](https://github.com/BurntSushi/toml) — `gm.toml` のパース

Git 操作は go-git ではなく `git` コマンドを叩いています。worktree 周りの挙動を本家と完全に揃えたかったのと、`gm status` が大量のリポジトリを並列に問い合わせる用途では素の `git` で十分速かったためです。

## スコアリングについて

並び順は 2 段構えです。まずマッチ品質で並べ、同点のときだけ frecency で決着をつけます。

マッチ品質の計算で一番気を使ったのは、リポジトリのパスが全て `host/user/` という長い共通接頭辞を持っている点です。素直にファジーマッチのスコアを使うと、この接頭辞に散らばった部分列がリポジトリ名の中の連続したマッチに勝ってしまいます。そのため、マッチ位置がリポジトリ名の中なら加点 (+10)、user 名の中なら少しだけ加点 (+3)、host の中なら減点 (-4) としています。単語境界 (`/` `-` `_` `.` の直後) のボーナスも host の中では無効にしています。どのリポジトリでも同じ位置に同じ点が入る以上、それは情報ではないためです。

加えて、クエリが文字列としてそのまま出現する場合は、ファジーマッチが別の場所から組み立てた部分列ではなくそちらの位置を採用します。打った文字列がそのまま並んでいるならそれが意図だ、という判断です。クエリ全体がリポジトリ名の中に収まっていれば更に +25 しています。

frecency は zoxide の考え方を借りて、訪問回数に時間係数 (1 時間以内は ×4、1 日以内は ×2、1 週間以内は ×0.5、それ以上は ×0.25) を掛けています。これをマッチ品質と足し合わせていないのは、frecency が強すぎると「打った文字と関係ないリポジトリが上に来る」状態になり、Finder として信用できなくなるためです。訪問記録は `$XDG_STATE_HOME/gm/frecency.json` に置いてあり、消せばリセットされます。

## 今後の改善点

- Worktree 一覧でのブランチ絞り込みの強化
- `gm status` の出力フォーマットのカスタマイズ
- テーマの追加と、設定ファイルからの配色カスタマイズ

## まとめ

ghq への不満は「Finder が別になっていること」と「Worktree を知らないこと」の 2 点だけだったので、その 2 点だけを埋めるつもりで作り始めました。結果として、リポジトリ一覧を持っている側が Finder を持つとリポジトリの作成・削除・clone まで同じ画面で完結してしまうことが分かり、思っていたより手放せないツールになっています。

フィードバックやプルリクエストは歓迎なので是非一度利用してみてくれると嬉しいです。
