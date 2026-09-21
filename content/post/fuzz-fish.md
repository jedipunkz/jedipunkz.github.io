---
title: "コマンド・ファイル・Git 検索を行う Fish Plugin を Go で作った話"
description: "Fish シェルのコマンド履歴・ファイル・Git ブランチ/Worktree/コミットをファジー検索できるプラグイン fuzz.fish を開発しました。Go と Bubble Tea で構築した TUI ベースのツールです"
date: 2026-01-17T12:00:00+09:00
lastmod: 2026-09-21T12:00:00+09:00
tags: ["Fish", "Go"]
categories: ["Application", "go"]
draft: false
---
<img src="/pix/fuzz-logo.png" width="180" align="right" alt="fuzz.fish logo" />

[jedipunkz](https://x.com/jedipunkz) です。

今回は自作した Fish シェルの Plugin である [fuzz.fish](https://github.com/jedipunkz/fuzz.fish) を紹介します。この記事は 2026/01 に書いたものを 2026/09 時点の内容に全面的に書き直したものです。

fuzz.fish は Fish Shell の コマンド履歴・ファイル・Git ブランチ・Git Worktree・Git コミット をインクリメンタルサーチできる Fish Plugin です。Go と Bubble Tea で TUI を実装していて、fzf や fd、ripgrep、bat といった外部ツールは一切不要です。プラグイン本体と単一の Go バイナリだけで動きます。

## リンク

- ソースコード: [https://github.com/jedipunkz/fuzz.fish](https://github.com/jedipunkz/fuzz.fish)
- 公式サイト: [https://jedipunkz.rocks/fuzz.fish/](https://jedipunkz.rocks/fuzz.fish/)

## 前回記事からの差分

初出時から変わった点をまとめておきます。

| 項目 | 2026/01 時点 | 現在 |
|---|---|---|
| 検索モード | 履歴・ブランチの 2 つ | 履歴・ファイル・ブランチ・Worktree・コミットの 5 つ |
| インストール | Go が必須。ソースを clone してビルド | ビルド済みバイナリを Release から取得。Go は不要 |
| 履歴の並び順 | 時刻ベースの recency 加点 | frecency (頻度 × 時間減衰) |
| 検索方法 | ファジー検索のみ | `*` を含むと glob マッチに切り替わる |
| プレビュー | 履歴の前後コンテキスト | 全モードにプレビュー。ファイルはシンタックスハイライト付き |

## スクリーンショット

コマンド履歴・ファイル・Git ブランチ検索を切り替えている様子です。

![fuzz.fish](/pix/fuzz.gif)

コマンド履歴検索のプレビューです。左に履歴、右に実行時刻・実行ディレクトリ・その前後に実行したコマンドが出ます。

![fuzz.fish preview](/pix/fuzz-preview.png)

## 開発動機

幾つか小さなツールはこれまでも作ってきましたが、利用する機会が減るとメンテナンスも怠りがちなことに気が付き、自分自身がよく使うツールを作ろうと思ったのがきっかけです。そして普段から Fish をシェルとして使っていますが、コマンド履歴検索や Git ブランチの切り替えをより効率的に出来れば何より自分にとって便利なツールになる予感がありました。

## 主な機能

- 外部ツールが不要。fzf / fd / ripgrep / bat をインストールしなくても、プラグインと Go バイナリだけで完結する
- キーバインドは `ctrl+r` の 1 つ。起動後は `ctrl+s` `ctrl+w` `ctrl+g` `ctrl+x` で閉じずにモードを切り替えられる
- 全モードにプレビューがある。履歴は実行時刻・ディレクトリ・前後のコマンド、ファイルはシンタックスハイライト付きの中身、Git 系はそれぞれの文脈を表示する
- 履歴は frecency で並ぶ。マッチ品質を最優先にした上で、`log1p(頻度)` を最終実行時刻で減衰させるため、実際によく叩くコマンドが上に来る
- Git はブランチだけでなく Worktree とコミットも扱える。コミット検索はハッシュと件名の両方にマッチし、`git show` / `git diff` / `git revert` / `git cherry-pick` をプロンプトに置く（実行はしない）

## インストール方法

必要なのは [Fish Shell](https://fishshell.com/) 3.0+ のみです。Fisher を使ってインストールします。

```fish
fisher install jedipunkz/fuzz.fish
```

インストール時に macOS / Linux (`amd64` / `arm64`) 向けのビルド済みバイナリを GitHub Release からダウンロードします。それ以外のプラットフォームではソースからのビルドにフォールバックするため、その場合のみ Go 1.25+ と Git が必要です。

更新・アンインストールは Fisher の標準コマンドで行います。

```fish
fisher update jedipunkz/fuzz.fish
fisher remove jedipunkz/fuzz.fish
```

## 使い方

Fish のプロンプトで `ctrl+r` を押すと起動します。あとは文字を入力してインクリメンタル検索するだけです。モードはキー 1 つで切り替わります。

| キー | モード | `enter` の動作 |
|---|---|---|
| `ctrl+r` | コマンド履歴検索 (デフォルト) | コマンドをプロンプトに挿入する |
| `ctrl+s` | ファイル検索 | ファイルパスを挿入する / ディレクトリなら `cd` する |
| `ctrl+w` | Git Worktree 検索 | その Worktree へ `cd` する |
| `ctrl+g` | Git ブランチ検索 | そのブランチに切り替える |
| `ctrl+x` | Git コミット検索 | コミットに対して実行するコマンドを選ぶ |

全モード共通のキーです。

| キー | 動作 |
|---|---|
| `↑` / `↓` または `ctrl+p` / `ctrl+n` | 選択行を移動する |
| `tab` | 選択中の項目でクエリを補完する |
| `ctrl+y` | 選択中の項目をクリップボードにコピーする |
| `esc` または `ctrl+c` | キャンセルする |

細かい挙動です。

- コマンドラインに入力済みの文字列がそのまま検索ボックスに入ります。`vim` と打ってから `ctrl+r` を押すと、最初から `vim` で絞り込まれた履歴が出ます
- クエリに `*` を含めると全モードでファジー検索から glob マッチに切り替わります。`nvim *.go` は `nvim internal/app/filter.go` にマッチしますが、単に同じ文字を含むだけのコマンドにはマッチしません
- Git ブランチ検索で、現在のブランチの上でもう一度 `ctrl+g` を押すと `git pull origin <branch>` が走ります
- リモートブランチを選択してローカルに同名のブランチがない場合は、ローカルブランチを作成して切り替えます
- Git コミット検索の `enter` は小さなアクションリスト (`git show`, `git diff`, `git revert`, `git cherry-pick`, `git rebase --onto`, ハッシュのみ) を開き、選んだコマンドを実行せずにプロンプトに置きます
- ファイル検索は隠しファイルと `node_modules` や `vendor` などのビルド用ディレクトリをスキップします
- Git リポジトリ外で `ctrl+x` を押すとモードを切り替えず警告を出します

## 公式サイト

ドキュメント用に公式サイトも作りました。

[https://jedipunkz.rocks/fuzz.fish/](https://jedipunkz.rocks/fuzz.fish/)

Astro で構築し、GitHub Pages にデプロイしています。配色は TUI 側と揃えて Tokyo Night にしました。各モードの説明・キーバインド一覧・インストール手順をまとめてあるので、README を読むより手っ取り早く雰囲気が掴めると思います。

## 利用した Go パッケージ

- [charm.land/bubbletea/v2](https://github.com/charmbracelet/bubbletea) — TUI フレームワーク
- [charm.land/bubbles/v2](https://github.com/charmbracelet/bubbles) / [charm.land/lipgloss/v2](https://github.com/charmbracelet/lipgloss) — 入力コンポーネントとスタイリング
- [github.com/sahilm/fuzzy](https://github.com/sahilm/fuzzy) — ファジーマッチ
- [github.com/go-git/go-git](https://github.com/go-git/go-git) — Git 操作
- [github.com/alecthomas/chroma](https://github.com/alecthomas/chroma) — ファイルプレビューのシンタックスハイライト
- [github.com/atotto/clipboard](https://github.com/atotto/clipboard) — クリップボード連携

Bubble Tea は v2 に移行しました。移行時にカーソルが二重に出る問題や Width/Height の計算がずれる問題があり、そこそこ手を入れています。

## スコアリングについて

検索結果の並び順は自前で実装しています。マッチ品質 (前方一致・単語境界・連続マッチのボーナスと、離れたマッチへのギャップペナルティ) を 10 倍に重み付けして主たる指標とし、その上に履歴なら frecency、それ以外のモードなら recency を加算しています。

frecency は zoxide の考え方を借りて、`log1p(頻度)` に時間係数 (1 時間以内は ×4、1 日以内は ×2、1 週間以内は ×1、それ以上は ×0.5) を掛けています。`log1p` を挟んでいるのは、100 回使ったコマンドが 1 回のコマンドの 100 倍の重みを持たないようにするためです。

## 今後の改善点

初出時に挙げた項目のうち、まだ手を付けられていないものです。

- 設定ファイルによるキーバインド・配色のカスタマイズ
- 検索アルゴリズムの改善
- プレビュー機能の強化

## まとめ

初出時の「今後の改善点」に挙げていた「事前に Go がインストールされていなくてもインストール出来るよう対応」は、GitHub Release にビルド済みバイナリを添付する形で解決しました。今は Fish さえあればインストールできます。

自分が毎日使うツールなので、使っていて気になった点をそのまま直す流れができていて、結果的に一番メンテナンスが続いているツールになりました。

フィードバックやプルリクエストは歓迎なので是非一度利用してみてくれると嬉しいです。
