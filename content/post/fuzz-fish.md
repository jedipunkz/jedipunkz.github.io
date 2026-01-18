---
title: "コマンド・ブランチ検索を行う Fish Plugin を Go で作った話"
description: "Fish シェルのコマンド履歴や Git ブランチをファジー検索できるプラグイン fuzz.fish を開発しました。Go と Bubble Tea で構築した TUI ベースのツールです"
date: 2026-01-17T12:00:00+09:00
tags: ["Fish", "Go"]
categories: ["Application", "go"]
draft: false
---
[jedipunkz](https://x.com/jedipunkz) です。

今回は自作した Fish シェルの Plugin である [fuzz.fish](https://github.com/jedipunkz/fuzz.fish) を紹介します。

fuzz.fish は Fish Shell のコマンド履歴と Git ブランチをインクリメンタルサーチできる Fish Plugin [です。Go と charmbracelet/bubbletea を使って TUI を実装しており、Fisher でインストールすると自動的にバイナリがビルドされます。

## ソースコード

[https://github.com/jedipunkz/fuzz.fish](https://github.com/jedipunkz/fuzz.fish)

## スクリーンショット

ちょっと見た感じわかりにくいですがコマンド検索とブランチ検索に対応しています。

![fuzz.fish](/pix/fuzz.gif)

## 開発動機

幾つか小さなツールはこれまでも作ってきましたが利用する機会が減るとメンテナンスも怠りがちなことに気が付き、自分自身がよく使うツールを作ろうと思ったのがきっかけです。 そして普段から Fish をシェルとして使っていますがコマンド履歴検索や Git ブランチの切り替えをより効率的に出来れば何より自分にとって便利なツールになる予感がありました。。既存のツールもありますが、以下の点を満たすものを作りたいと考えました。

## 主な機能

fuzz.fish は以下の機能を持っています。今後も追加していく予定です。

- コマンド履歴と Git ブランチ検索を1つのツールで切り替えられる
- コマンド履歴検索時にそのコマンドを実行した前後のコマンドの表示・時間情報も付け加えて表示
- Fisher でシンプルにインストールできる
- Go で実装して高速に動作且つ Fish スクリプト単体では実現出来ない機能追加に備える


## インストール方法

※ 事前に Go がローカルにインストールされている必要があります。
※ インストール時に自動的に GitHub からソースをクローンし、Go でバイナリをビルドします。

Fisher を使ってインストールします。

```fish
fisher install jedipunkz/fuzz.fish
```


## 使い方

### コマンド履歴検索 (Ctrl+R)

基本的な使い方です。Fish プロンプトで `Ctrl+R` を押すとコマンド履歴のファジー検索が起動します。

- 文字を入力してインクリメンタル検索
- 矢印キーまたは `Ctrl+N/P` で上下移動
- `Enter` で選択したコマンドをコマンドラインに挿入
- (`ESC` でキャンセル)

またツール起動中に下記を行えます。

- `Ctrl+Y` でクリップボードにコピー


Git リポジトリ内ではツール起動中に更に `Ctrl+R` を再度押すと Git ブランチ検索モードに切り替わります。

- 文字を入力してインクリメンタル検索
- 矢印キーまたは `Ctrl+N/P` で上下移動
- `Enter` で選択しそのブランチに Git Switch する
  - リモートブランチを選択しローカルにそのブランチがない場合はローカルブランチを作成して Git Switch する
- (`ESC` でキャンセル)


## 利用した Go パッケージ


- [https://github.com/sahilm/fuzzy](https://github.com/sahilm/fuzzy)
- [github.com/charmbracelet/lipgloss](github.com/charmbracelet/lipgloss)
- [https://github.com/charmbracelet/bubbles](https://github.com/charmbracelet/bubbles)
- [https://github.com/muesli/termenv](https://github.com/muesli/termenv)


## 今後の改善点

現時点で考えている改善点は以下の通りです。

- プレビュー機能の強化
- カスタマイズ可能な設定ファイル
- 検索アルゴリズムの改善
- 事前に Go がインストールされていなくてもインストール出来るよう対応

## まとめ

今のところ自分自身が利用するようになって改善を続けられそうだなと感じています。

今後の改善点にも記しましたが、事前に Go がインストールされていないとセットアップが出来ないのでその点は改善したいなと思っています。GitHub Release からビルド済みバイナリをダウンロードするなど。

また当初は [https://github.com/ktr0731/go-fuzzyfinder](https://github.com/ktr0731/go-fuzzyfinder) を使っていたのですが、要件を満たせなくなり利用をやめ、[https://github.com/sahilm/fuzzy](https://github.com/sahilm/fuzzy) を使いつつある程度自前で検索周りを実装しています。なので「マッチしにくい」等といった問題が出てくれば自ら対応出来るかなと考えています。

またフィードバックやプルリクエストは歓迎なので是非一度利用してみてくれると嬉しいです。
