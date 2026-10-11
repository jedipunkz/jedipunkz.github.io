---
title: "開発した OSS ツール"
date: 2026-10-11T12:00:00+09:00
Categories: ["profile"]
draft: false
---

これまでに開発して GitHub で公開している OSS ツールを紹介します。

## gm

https://github.com/jedipunkz/gm

ghq ライクなリポジトリ管理ツールです。fuzzy finder を内蔵していて、frecency (利用頻度と最終利用時刻) によるランキングや git worktree の閲覧にも対応しています。Rust で書いています。

```sh
brew install jedipunkz/gm/gm
```

関連記事: [ghq の気になる点を改善した Rust 製ツール開発](/post/gm/)

## fuzz.fish

https://github.com/jedipunkz/fuzz.fish

Fish shell 用の fuzzy finder プラグインです。コマンド履歴・ファイル・Git ブランチ・worktree を、Ctrl+R の 1 つのインターフェースから検索できます。Go で書いています。

```fish
fisher install jedipunkz/fuzz.fish
```

関連記事: [Go によるコマンド履歴・ファイル・Git ブランチ/Worktree/コミットを検索する Fish Plugin 開発](/post/fuzz-fish/)

## agx

https://github.com/jedipunkz/agx

複数の AI コーディングエージェントを、それぞれ独立した git worktree で並列に実行し、1 つのターミナルダッシュボードからまとめて監視するツールです。Claude Code / Codex CLI / Gemini CLI / OpenCode に対応しています。Go で書いています。

```sh
brew tap jedipunkz/agx && brew install agx
```

関連記事: [複数の AI コーディングエージェントを1つのターミナルから起動・監視するツールを作った](/post/cco/)

## miniecs

https://github.com/jedipunkz/miniecs

Amazon ECS のコンテナを fuzzy finder でインクリメンタルサーチし、そのままコンテナにログインできる CLI ツールです。Go で書いています。

```sh
brew tap jedipunkz/miniecs
brew install jedipunkz/miniecs/miniecs
```

関連記事: [ECS コンテナにログインする CLI を Go 言語で作った話](/post/ecs-login-cli/)

## rebind

https://github.com/jedipunkz/rebind

Windows の一般的なアプリケーションに Emacs ライクなキーバインドを追加する、タスクトレイ常駐型のアプリケーションです。Rust と Tauri で書いています。バイナリは GitHub Releases からダウンロードできます。

## UnNatural

https://github.com/jedipunkz/UnNatural

macOS のメニューバーに常駐し、マウスとトラックパッドのスクロール方向を個別に反転できるアプリケーションです。Swift で書いています。

```sh
git clone https://github.com/jedipunkz/UnNatural.git
cd UnNatural
make install
```
