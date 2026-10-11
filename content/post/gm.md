---
title: "ghq の気になる点を改善した Rust 製ツール開発"
description: "ghq list | fzf | cd のパイプラインを組まずに済むリポジトリマネージャ gm を Rust と ratatui で作りました。Ctrl-G でリポジトリにも Git Worktree にも飛べ、ブランチや Pull Request からそのまま Worktree を作れます"
date: 2026-09-23T12:00:00+09:00
tags: ["Rust", "TUI", "CLI", "Git"]
categories: ["Application", "rust"]
draft: false
---

[jedipunkz🚀](https://x.com/jedipunkz) です。

今回は自作した ツール [gm](https://github.com/jedipunkz/gm) を紹介します。

gm は [ghq](https://github.com/x-motemen/ghq) と同じくリポジトリを clone して管理するツールです。違うのは Fuzzy Finder を内蔵していることと、clone だけでなく Git Worktree も同じ画面から扱えることです。ブランチや Pull Request を選べば、その場で Worktree を作って移動します。`Ctrl-G` を押すと Finder が開き、選んだリポジトリまたは Worktree に `cd` します。またランク機能を設けて頻繁にアクセスするレポジトリを優先的に選択するようにしています。

最初は Go (Bubble Tea) で書いていましたが、[PR #83](https://github.com/jedipunkz/gm/pull/83) で挙動を変えずに Rust (ratatui) へ書き換えました。`gm.toml`・訪問記録・ディレクトリ構成は互換なので、Go 版から入れ替えてもそのまま動きます。

## リンク

- ソースコード: [https://github.com/jedipunkz/gm](https://github.com/jedipunkz/gm)
- 公式サイト: [https://jedipunkz.rocks/gm/](https://jedipunkz.rocks/gm/)

## Finder の画面

左がリポジトリ一覧、右が選択中のリポジトリの詳細、下が入力欄とキーの案内です。詳細には path・remote・ブランチ・作業ツリーの状態・訪問回数・直近 3 コミットが出ます。最有力候補は入力欄のすぐ隣、一覧の一番下に置いています。入力欄の右端の箱には、いま絞り込んでいる一覧の名前 (`repository` / `worktree` / `branch` / `pr`) が出ます。

![gm の Finder](/pix/gm.png)

(公式サイトに置いてあるモックです)

## 開発動機

普段の作業で ghq を頻繁に使っています。長く使っていて不満はほとんど無かったのですが、2点だけ引っかかるなと気が付きました。

1 つは頻繁にアクセスするレポジトリに似た名前のレポジトリがあるとそちらが起動直後に選択されて ctrl-n/p で移動して毎回アクセスしていました。毎日多用してるのでこの作業無駄では・・と考えるようになりました。

もう 1 つは Git Worktree です。最近は 1 つのリポジトリに対して複数の Worktree を切って作業することが増えました。以前作った [agx](https://jedipunkz.rocks/post/cco/) も Worktree 前提のツールです。しかし ghq は Worktree にはアクセスが出来ないので、Worktree への移動だけは別の手段を用意することになっていました。これも以前作った [fuzz.fish](https://jedipunkz.rocks/fuzz.fish/) で Worktree にアクセスしていたのですが、これはレポジトリに移動した後に利用できるツールです。なので ghq を起動してその流れで Worktree にアクセスしたい！という要望が出てきました。

これら 2 つはどちらも「リポジトリ一覧を持っている側が Worktree の Finder を持てば解決する」話だったので、それなら作ってしまおうと考えました。

## 主な機能

- Finder が内蔵されている。Shell のパイプラインを組む必要がない
- ランク機能を備えていて頻繁にアクセスするレポジトリ移動がキー操作少なく行える
- Fuzzy Finder の並び順は自前で決めている。
- 選択中のリポジトリの詳細が画面に出る。パス・remote・ブランチ・作業ツリーの状態・訪問回数・直近 3 コミット (ブランチと tag の装飾つき) が並ぶので、似た名前の clone を取り違えずに済む
- Git Worktree にアクセス出来る。`Ctrl-W` でカーソル下のリポジトリの Worktree 一覧に切り替わる
- ブランチ一覧 (`Ctrl-L`) と Pull Request 一覧 (`Ctrl-J`) を持つ。`enter` で選んだものを Worktree として check out し、そこに移動する
- リポジトリと Worktree の作成・削除、放置された Worktree の一括削除 (`/expire`) を Finder を抜けずに行える
- commit していない変更・push していない commit があるリポジトリを `gm status` と `/dirty` `/unpushed` で探せる
- 設定は `gm.toml` に書く。キー設定やルートディレクトリ、テーマ設定などが行える。
- Sub Commands に加えて TUI 内で実行出来る Slash Commands を備えている。(ショートカットキー枯渇問題に対処)

Mercurial / Subversion / Darcs の clone、bare clone、partial clone、並列 import は意図的に実装していません。

## インストール方法

対応 OS は macOS と Linux (WSL2 を含む) です。必要なのは `$PATH` 上の `git` と、True Color 対応のターミナルだけです。Pull Request 一覧を使う場合のみ、ログイン済みの [GitHub CLI](https://cli.github.com/) (`gh`) も必要です。Homebrew の場合は Rust も不要で、tap からプラットフォームに合ったバイナリを取ってきます。

```sh
brew install jedipunkz/gm/gm
```

ソースから入れる場合は Rust 1.95+ が必要です。

```sh
cargo install --locked --git https://github.com/jedipunkz/gm
```

## シェル統合

引数無しの `gm` は Finder を開いて選ばれたパスを標準出力に出すだけなので、`$(...)` と組み合わせられます。rc ファイルに 1 行足すと、それが `Ctrl-G` での `cd` になります。

```sh
gm shell fish | source    # ~/.config/fish/config.fish
eval "$(gm shell zsh)"    # ~/.zshrc
eval "$(gm shell bash)"   # ~/.bashrc
```

## 使い方

`Ctrl-G` で Finder が開きます(キー設定可能)。あとは文字を打って絞り込むだけです。Finder にはリポジトリ・Worktree・ブランチ・Pull Request の 4 つの一覧があり、`Ctrl-W` / `Ctrl-L` / `Ctrl-J` でそれぞれに切り替わります。同じキーをもう一度押すとリポジトリ一覧に戻ります。絞り込みと詳細ペインはどの一覧でも同じように動きます。

| 一覧 | 開くキー | 並ぶもの | `enter` |
|---|---|---|---|
| リポジトリ | `gm` / `Ctrl-G` | root 配下の clone | そこに移動する |
| Worktree | `Ctrl-W` | 選択中のリポジトリの Worktree | そこに移動する |
| ブランチ | `Ctrl-L` | 選択中のリポジトリのブランチ | その Worktree に移動する。無ければ作る |
| Pull Request | `Ctrl-J` | 選択中のリポジトリの open な Pull Request | その Worktree に移動する。無ければ作る |

キー操作は次の通りです。

| キー | リポジトリ一覧 | その他の一覧 |
|---|---|---|
| 任意の文字 | 絞り込む | 絞り込む |
| `↑` `ctrl-p` / `↓` `ctrl-n` | 移動する | 移動する |
| `PgUp` / `PgDn` | 1 画面分移動する | 1 画面分移動する |
| `ctrl-w` / `ctrl-l` / `ctrl-j` | その一覧を開く | その一覧を開く。今いる一覧のキーならリポジトリ一覧に戻る |
| `ctrl-alt-b` | remote をブラウザで開く | 同じ |
| `ctrl-g` | クエリ → 絞り込み、の順に消す | リポジトリ一覧に戻る |
| `esc` | クエリ → 絞り込み → 終了、の順に 1 段ずつ戻す | リポジトリ一覧に戻る |
| `ctrl-c` | 何も出力せず終了する | 同じ |

git や GitHub の応答を待つ間 (Pull Request の読み込み、check out、`/dirty` `/unpushed` の走査) は、入力欄の下の行にスピナーと待っている対象、経過秒数が出ます。待っている間も Finder は操作できます。

### ブランチ一覧

ローカルブランチと、同名のローカルブランチが無い remote ブランチ (`origin/feat/login` など) が並びます。最新のコミットを持つものが一番下です。絞り込みの点数が同じなら、クエリが名前を占める割合が大きいものを下に置きます。`main` と打てば `fix/foo-main` ではなく `main` がカーソル位置に来ます。直近の `git fetch` で取ってきていない remote 側のブランチも、裏で `git ls-remote` を叩いて応答があり次第、一覧の上に足されます。fetch は選んだ時にそのブランチだけ行います。`gh` は不要で、認証は git 自身のもの (ssh agent や credential helper) を使います。パスワードを求める remote はスキップし、入力欄の下の行にその名前を出します。

`enter` を押すと、既に check out 済みのブランチならその Worktree に移動します。それ以外のブランチは確認無しで Worktree を作って移動します。remote ブランチはそれを追跡するローカルブランチになります。

### Pull Request 一覧

[GitHub CLI](https://cli.github.com/) (`gh`) にログイン済みで、`gh pr checkout --worktree` を持つバージョンが必要です。open な Pull Request が新しいものほど下に並び、draft には `[draft]` が付きます。`#42` のように番号を打って探すこともできます。

`enter` を押すと Pull Request の Worktree に移動します。Worktree が無ければ `gh pr checkout` で先に作ります。ブランチ名と、fork の場合の push 先は `gh` が決めます。Worktree 名は head ブランチ名で、fork の場合は `.forks/<owner>/` の下に置きます (後述)。

### Slash Commands

入力の先頭が `/` のときは絞り込みではなく Slash Command の入力になります。入力に従って補完が出るので `tab` で確定できます。`acme/alpha` のように途中に `/` があるだけなら、これまで通り絞り込みです。使えるコマンドは一覧ごとに異なります。

| コマンド | 使える一覧 | 動作 |
|---|---|---|
| `/help` | 全て | コマンド一覧を出す (`q` / `esc` で閉じる) |
| `/get [flags] <repo>` | 全て | Finder を閉じてターミナルで `gm get` を実行し (進捗やパスフレーズ入力が見える)、その clone に移動する |
| `/browse` | 全て | `ctrl-alt-b` と同じ |
| `/worktrees` `/branches` `/prs` | 全て | `ctrl-w` `ctrl-l` `ctrl-j` と同じ |
| `/dirty` | リポジトリ | commit していない変更があるリポジトリだけに絞り込む (トグル) |
| `/unpushed` | リポジトリ | push していない commit があるリポジトリだけに絞り込む (トグル) |
| `/create <repo>` | リポジトリ | `origin` を設定済みのリポジトリを作り、一覧に追加して選択する |
| `/create <branch>` | Worktree・ブランチ・Pull Request | そのブランチを Worktree として check out する。新しいブランチは `HEAD` から作る |
| `/remove` | リポジトリ | 選択中のリポジトリとその Worktree を消す (確認画面に Worktree の数が出る) |
| `/remove` | Worktree | 選択中の Worktree を消し、`git branch -d` が通ればそのブランチも消す。main worktree は拒否する |
| `/expire <days>d` | Worktree | HEAD が指定日数動いていない Worktree を全て消し、`git branch -d` が通ればブランチも消す |

`/dirty` と `/unpushed` は同時に有効にでき、その場合は両方に当てはまるリポジトリが残ります。走査は裏で 1 回だけ行い、両方で使い回します。`esc` はクエリ → 絞り込みの順に解除します。

`/expire` は選択中の行ではなく一覧全体が対象です。HEAD がいつ動いたかは reflog で判断し、確認画面に消える Worktree が全て並びます。commit していない変更がある Worktree は残します。`/expire 30d` と打てば 30 日放置された Worktree を片付けられます。

絞り込んだリポジトリに対してコマンドを打ちたいときは、クエリの末尾に `;` を付けてコマンドを続けます。`gm;/remove` と打つと `gm` を選んで消します。`esc` で入力欄を空にしても選択は残るので、その後に `/remove` と打っても同じです。

`/create` と `/remove` は `y` / `n` を確認画面で尋ね、Finder を抜けずに処理します。消えた行はリストから消え、作られた行は追加されて選択され、プロンプト下の行に結果が出ます。commit していない変更が失われる場合は、同意する前に確認画面がその旨を伝えます。

### Worktree の置き場所

Worktree の置き場所は gm が決めるので、打つのはブランチ名だけです。

```bash
~/gm/github.com/jedipunkz/gm/                              # リポジトリ本体
~/gm/.worktrees/github.com/jedipunkz/gm/feat/login         # ブランチの Worktree
~/gm/.worktrees/github.com/jedipunkz/gm/.forks/bob/main    # fork の Pull Request の Worktree
```

先頭のドットは飾りではありません。Worktree には `.git` ファイルがあるため、そのままだと gm がそれをリポジトリとして一覧に載せてしまい、`gm migrate` も受け付けなくなります。走査がドット始まりのディレクトリに降りないようにすることで回避しています。

fork 用の `.forks/<owner>/` にドットを付けているのは、ドットで始まるブランチ名が存在しないためです。これで fork の `main` は、リポジトリ自身の `main` とも `bob/main` という名前のブランチともぶつかりません。

### Sub Commands

Finder を経由しないサブコマンドも一通り揃えました。

| コマンド | 動作 |
|---|---|
| `gm` | Finder を開いて、選ばれたパスを出力する |
| `gm get [-u] [--ssh] [--shallow] [--no-recursive] [-b <branch>] [-s] [-l] <repo>...` | 木の中に clone する。既存の clone は飛ばす。`-u` は既存の clone を更新する (後述)。`--ssh` は SSH で clone する。`--no-recursive` は submodule を取らない。`-s` は出力を抑える。`-l` は clone したリポジトリの中でシェルを開く |
| `gm list [-p] [-e] [--unique] [<query>]` | リポジトリを一覧する |
| `gm status [--dirty] [--unpushed] [-a] [-p]` | commit していない変更、またはどの remote にも無い commit をローカルブランチに持つリポジトリと Worktree を一覧する。fetch しないのでオフラインでも速い |
| `gm create [--ssh] <repo>` | `origin` を設定済みのリポジトリを作って `git init` し、パスを出力する |
| `gm remove [--dry-run] [-y] <repo>...` | 確認の上でリポジトリとその Worktree を消し、空になった親を刈る (`gm rm` でも可) |
| `gm wt create <repo> <branch>` | Worktree を足してパスを出力する (`gm wt new` でも可)。`cd (gm wt create gm feat/login)` のように使う |
| `gm wt remove [--dry-run] [-y] <repo> <branch>` | Worktree を消し、`git branch -d` が通ればブランチも消す (`gm wt rm` でも可) |
| `gm wt expire [--dry-run] [-y] <repo> <days>d` | `/expire` と同じ。`gm wt expire gm 30d` のように使う |
| `gm migrate [--dry-run] [-y] [-r] <dir>...` | 既存の clone を `origin` を見て木の中に移す |
| `gm root [--all]` | root ディレクトリを出力する |
| `gm shell <fish\|zsh\|bash>` | `Ctrl-G` のキーバインドを出力する |
| `gm version` / `gm help` | バージョン / 使い方を出力する |

`<repo>` には完全な URL、`git@host:user/repo.git`、`host/user/repo`、`user/repo`、それに `repo` だけ (`git config github.user` で解決する) を渡せます。

`gm get -u` は fetch した後、作業ツリーがクリーンなら check out 中のブランチを fast-forward し、submodule も更新します。dirty な場合や分岐している場合は報告だけして触りません。

フラグの綴りは揃えました。以前は `-p` が `get` / `create` では SSH、`list` / `status` ではフルパスを意味していたため、SSH は `--ssh` に分け、`-p` はフルパスだけを意味するようにしています。同様に、ブラウザで remote を開く Slash Command は `/remote` から `/browse` に改名しました (`gm.toml` の `remote_key` は互換のため名前を据え置いています)。

`gm wt` はスクリプト (dotfiles の bootstrap など) 向けです。手で操作するなら Finder の方が楽です。

## 設定

`~/.config/gm/gm.toml` (または `$XDG_CONFIG_HOME/gm/gm.toml`) は任意です。パースに失敗するファイルや、gm が知らないキーを含むファイルは、半分無視するのではなくエラーにしています。

```toml
root         = "~/ghq"         # ["~/ghq", "~/gm"] と書けば順に探す
theme        = "tokyonight"
launch_key   = "ctrl-g"        # gm を開くシェル側のキー
worktree_key = "ctrl-w"        # Worktree 一覧に切り替える Finder 側のキー
branch_key   = "ctrl-l"        # ブランチ一覧に切り替える Finder 側のキー
pr_key       = "ctrl-j"        # Pull Request 一覧に切り替える Finder 側のキー
remote_key   = "ctrl-alt-b"    # remote を開く Finder 側のキー
```

root は `$GM_ROOT` → `gm.toml` の `root` → `git config --get-all gm.root` → `$GHQ_ROOT` → `git config --get-all ghq.root` → `~/ghq` の順に解決します。ghq からの移行で何もしなくて良いようにこの順にしました。root は絶対パスである必要があり (`~` は展開する)、相対パスはエラーにします。

テーマは `tokyonight` (デフォルト)・`solarized-dark`・`solarized-light`・`kanagawa-wave`・`catppuccin` 4 種・`rose-pine`・`dracula` の 10 種類です。知らない名前を指定すると、有効な名前を並べたエラーになります。

キー設定にはいくつか制約があります。

| 設定 | 効く場所 | 使えるもの | 拒否するもの |
|---|---|---|---|
| `launch_key` | シェル | 修飾なしの Ctrl chord | `alt`・`shift` 付き、`ctrl-m` `ctrl-i` `ctrl-j` (Enter・Tab・改行として届くため) |
| `worktree_key` `branch_key` `pr_key` `remote_key` | Finder | Ctrl に `alt` / `shift` を任意で付けたもの | `ctrl-c` `ctrl-n` `ctrl-p` `ctrl-g`、修飾付きを含む `ctrl-m` `ctrl-i`、4 つの間での重複 |

不正な chord は黙って無視せずエラーにします。`ctrl-shift-<letter>` は Kitty keyboard protocol に対応したターミナル (Ghostty・kitty・WezTerm・foot・最近の Alacritty) でしか区別できず、それ以外では `ctrl-<letter>` として届きます。`launch_key` を変えたら `gm shell <shell>` を再実行するかシェルを再起動します。

## 公式サイト

ドキュメント用に公式サイトも作りました。

[https://jedipunkz.rocks/gm/](https://jedipunkz.rocks/gm/)

Astro で構築し、GitHub Pages にデプロイしています。Finder の動作を再現したデモと 10 種類のテーマのギャラリーを置いてあるので、入れる前に雰囲気が掴めると思います。

## 利用した Rust クレート

- [ratatui](https://ratatui.rs/) (crossterm backend) — TUI フレームワーク
- [toml](https://crates.io/crates/toml) — `gm.toml` のパース
- [serde_json](https://crates.io/crates/serde_json) — 訪問記録 (`frecency.json`) の読み書き
- [libc](https://crates.io/crates/libc) — `SIGPIPE` の既定動作を戻す (`gm list | head` で panic させないため)

依存は最小限にしていて、URL の正規化・フラグのパース・ファジーマッチ (Go 版で使っていた [sahilm/fuzzy](https://github.com/sahilm/fuzzy) の移植) は自前で書いています。開発用には [divan](https://crates.io/crates/divan) でベンチマークを書き、絞り込みなどのホットパスから不要なアロケーションを削りました。

Git 操作は git ライブラリではなく `git` コマンドを叩いています。worktree 周りの挙動を本家と完全に揃えたかったのと、`gm status` が大量のリポジトリを並列に問い合わせる用途では素の `git` で十分速かったためです。

## スコアリングについて

並び順は 2 段構えです。まずマッチ品質で並べ、同点のときだけ frecency で決着をつけます。

マッチ品質の計算で一番気を使ったのは、リポジトリのパスが全て `host/user/` という長い共通接頭辞を持っている点です。素直にファジーマッチのスコアを使うと、この接頭辞に散らばった部分列がリポジトリ名の中の連続したマッチに勝ってしまいます。そのため、マッチ位置がリポジトリ名の中なら加点 (+10)、user 名の中なら少しだけ加点 (+3)、host の中なら減点 (-4) としています。単語境界 (`/` `-` `_` `.` スペースの直後) のボーナスも host の中では無効にしています。どのリポジトリでも同じ位置に同じ点が入る以上、それは情報ではないためです。スペースを単語境界に含めたのは、文章で書かれる Pull Request のタイトルのためです。

加えて、クエリが文字列としてそのまま出現する場合は、ファジーマッチが別の場所から組み立てた部分列ではなくそちらの位置を採用します。打った文字列がそのまま並んでいるならそれが意図だ、という判断です。文字列が複数回出現する場合は最初の出現ではなく、点数が最も高い出現を採用します。`gmdev/gm` に対して `gm` と打ったとき、user 名側ではなくリポジトリ名側の `gm` で評価するためです。クエリ全体がリポジトリ名の中に収まっていれば +25、リポジトリ名がクエリと完全に一致すれば更に +25 しています。これで訪問履歴が無くても、`gm` と打てば `gm-something` より先に `github.com/x/gm` が来ます。

frecency は zoxide の考え方を借りて、訪問回数に時間係数 (1 時間以内は ×4、1 日以内は ×2、1 週間以内は ×0.5、それ以上は ×0.25) を掛けています。これをマッチ品質と足し合わせていないのは、frecency が強すぎると「打った文字と関係ないリポジトリが上に来る」状態になり、Finder として信用できなくなるためです。訪問記録は `$XDG_STATE_HOME/gm/frecency.json` に置いてあり、消せばリセットされます。

## まとめ

既に使い始めていますが、自らが多用するツールを開発することはモチベーションにも繋がるので開発の入口としてはとても良いと思っています。今後も不満や機能拡張アイデアに気がつけば改善を続けられます。

フィードバックやプルリクエストは歓迎なので是非一度利用してみてくれると嬉しいです。
