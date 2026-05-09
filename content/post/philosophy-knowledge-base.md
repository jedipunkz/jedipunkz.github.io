---
title: "哲学ノート管理術 研究動向を自動収集する仕組みを Go Scraper と Obsidian で作った"
description: "PhilArchive / PhilPapers / arXiv から哲学論文のメタデータと本文を自動収集し inbox に蓄積、Codex / Claude Code で 研究動向 ノートに統合する Obsidian Vault パイプラインの構成と実装"
date: 2026-05-09T00:00:00+09:00
Categories: ["AI", "philosophy", "tools"]
draft: false
---

[jedipunkz🚀](https://x.com/jedipunkz) です。

最初に、これから書く仕組みの完成イメージとして、実際に scrape 処理が走っている動画を貼っておきます。`docker compose up scheduler` で Go 製スクレイパーが PhilArchive / PhilPapers / arXiv を巡回し、`inbox/` 配下に Scrape 結果が次々と書き出されていく様子です。

<video src="/pix/philosophy.mp4" autoplay loop muted playsinline controls preload="auto" style="max-width:100%;height:auto;"></video>

個人で哲学者・著作ごとのノートを管理しているのですが Notebook LM や Claude Cowork を使い色々と試してきたものの下記の点を課題として持っていました。

* 新しい情報源の取得の自動化
* モバイルアプリでの記事の整理

そこで、Go 製スクレイパーを Docker Compose で定期実行し、PhilArchive / PhilPapers / arXiv といった情報源から関心キーワードに沿った論文を自動収集して `inbox/` に蓄積するパイプラインを作りました。蓄積された素材は Codex / Claude Code が読み、既存ノートと照合しながら `研究動向/` ディレクトリに日本語のまとめノートとして統合します。

レポジトリはこちらです:

https://github.com/jedipunkz/philosophy

## 全体アーキテクチャ


```
                 +-----------------+
                 |  scrape.yaml    |
                 +--------+--------+
                          v
+--------------------------------------------------+ docker compose
|   +------------------+    +------------------+   |
|   |  scraper (Go)    |    |  scheduler (Go)  |   |
|   +---------+--------+    +---------+--------+   |
|             |                       |            |
|             +-----------+-----------+            |
|                         |                        |
|             fetch via HTTP / arXiv API           |
|                         |                        |
|    +--------------------v-------------------+    |
|    |  PhilArchive  /  PhilPapers  /  arXiv  |    |
|    +--------------------+-------------------+    |
+-------------------------|------------------------+
                          v
            +----------------------------+
            |  inbox/*.md                | Obsidian Vault
            +-------------+--------------+
                          |
                          | git commit
                          v
            +----------------------------+
            |  GitHub (philosophy repo)  |
            +-------------+--------------+
                          |
                          | pulled from other devices
                          v
            +----------------------------+
            |  Codex  /  Claude Code     |  reads inbox + existing notes
            +-------------+--------------+
                          |
                          v
            +----------------------------+
            |  research-trends/*.md      |  curated Japanese notes
            +----------------------------+
```

ポイントは 3 つです。

- スクレイパーは 書込み先を `inbox/` に限定する。正式ノートを直接更新しない
- Obsidian Valut の保管庫となる `inbox/` フォルダでは Front Matter と Obsidian Links を付け、Codex / Claude Code が文脈を取れるようにする
- Codex / Claude Code は `inbox/` を読んで `研究動向/` にだけ書く。`書籍/` 配下の正式ノートは人間が編集する

「収集（自動）」「整理（AI）」「正式ノート（人間）」の境界を明示的に切ったことで、自動収集を増やしても正式ノートが汚れない構造にできました。

## レポジトリ構成

レポジトリ自体を Obsidian Vault として運用しています。

```
philosophy/
├── scrape.yaml             # scrape config (edited by humans)
├── docker-compose.yml      # scraper / scheduler service defs
├── docker/                 # Dockerfiles
├── cmd/scrapem/            # Go CLI entry point
├── internal/               # scraper / markdown / vault / scheduler
├── scripts/
│   ├── scrape.sh           # one-shot wrapper
│   └── scrape-and-commit.sh # auto-commit inbox (use --push to push)
├── inbox/                  # auto-collected raw items (status: raw)
├── 研究動向/               # research notes integrated by Codex / Claude Code
├── 書籍/
│   ├── 西洋哲学/(古代|近代|現代)/  # human-written canonical notes
│   └── 東洋哲学/
├── .scrapem/               # state files (e.g. seen-urls.json)
├── README.md
├── DESIGN.md               # design notes
└── CLAUDE.md               # rules for AI agents
```

`書籍/` と `研究動向/` のように日本語ディレクトリ名を使っているのは、Obsidian の Graph View や検索結果で「これは正式ノート」「これは研究動向」が一目で分かるようにするためです。

## scrape.yaml: 収集設定

人間が編集する唯一の収集設定で、キーワードと検索クエリ、情報源、タグを書きます。今こんな状態です。

```yaml
vault:
  root: /vault
  inbox: inbox

scrape:
  interval: 24h
  user_agent: philosophy-scraper/0.1 (+https://github.com/jedipunkz/philosophy)
  max_results: 50
  max_pdf_chars: 50000
  max_pdf_bytes: 20971520
  request_timeout: 20s
  request_delay: 2s
  refresh_existing: true

sources:
  - name: philarchive
    enabled: true
    type: html
    base_url: https://philarchive.org
    search_url: https://philarchive.org/s/{query}

  - name: philpapers
    enabled: true
    type: html
    base_url: https://philpapers.org
    search_url: https://philpapers.org/s/{query}

  - name: arxiv
    enabled: true
    type: api
    base_url: https://export.arxiv.org/api/query
    search_url: https://export.arxiv.org/api/query?search_query=all:{query}&start=0&max_results=50

keywords:
  - name: ハンナ・アーレント
    queries:
      - Hannah Arendt
      - Hannah Arendt totalitarianism
      - Hannah Arendt The Human Condition
    sources:
      - philarchive
    tags:
      - 政治哲学
      - 現代思想
      - 全体主義

  - name: ユング
    queries:
      - Carl Gustav Jung
    sources:
      - philarchive
      - philpapers
      - arxiv
    tags:
      - 現代思想

  - name: ニーチェ
    queries:
      - Friedrich Nietzsche
      - Nietzsche Thus Spoke Zarathustra
      - Nietzsche Beyond Good and Evil
    sources:
      - philarchive
      - arxiv
    tags:
      - 近代思想
      - 実存主義
      - ニヒリズム
```

`keywords[].name` は保存先 Markdown のキーワード列やファイル名のヒントに使い、`queries` は実際に検索エンジンへ投げる文字列、`sources` でキーワードごとの情報源を絞り、`tags` は Obsidian 上での横断検索用です。`request_delay` と `max_results` を控えめにして、向こう側に迷惑をかけない速度で回すようにしています。

## Go アプリ (scrapem)

スクレイパー本体は Go で書いています。だいたいこんな構成です。

```
cmd/scrapem/main.go         # CLI エントリ (run / watch サブコマンド)
internal/config/            # scrape.yaml の読込・検証
internal/scraper/           # HTTP取得 + 検索 + 本文抽出 (PhilArchive/PhilPapers/arXiv)
internal/markdown/          # Front Matter + 本文を Markdown へ正規化
internal/vault/             # 保存パス決定・URL重複排除・ファイル書込
internal/scheduler/         # interval を見て watch ループを回す
```

サブコマンドを 2 つ持っています。

- `scrapem run` — 1 回だけ全キーワードを巡回して終了
- `scrapem watch` — `scrape.interval` の周期で巡回し続ける

`watch` サブコマンドを Go アプリ側に持たせたので、cron や外部スケジューラを別コンテナで立てなくても定期実行できます。コンテナを増やさない方針です。

各情報源の特性に合わせて取得方法を分けています。

- PhilArchive / PhilPapers — HTML を取得してメタデータ・Abstract・Citation・BibTeX・PDF 本文テキストを抽出
- arXiv — 公式 API で Atom フィードを取り、メタデータと Abstract を抽出

PDF 本文テキストは `max_pdf_chars` / `max_pdf_bytes` でサイズ上限を切っています。哲学論文の PDF は本文が長いので、リソースを食い過ぎない範囲で要約用の素材を確保する、というバランスです。抽出結果には改行ノイズなどが混ざるので、Codex / Claude Code 側で扱うときは「Abstract と Citation を主、PDF Text を補助」の優先順位で参照させています。

URL 重複排除は `.scrapem/seen-urls.json` に取得済み URL を記録して行います。`scrape.refresh_existing: true` のときは Front Matter のメタデータだけ更新し、本文は再生成する挙動にしてあります。

## Docker Compose による定期実行

`docker-compose.yml` はかなりシンプルです。

```yaml
services:
  scraper:
    build:
      context: .
      dockerfile: docker/scraper/Dockerfile
    volumes:
      - .:/vault
    command: ["run", "--config", "/vault/scrape.yaml"]
    restart: "no"

  scheduler:
    build:
      context: .
      dockerfile: docker/scraper/Dockerfile
    volumes:
      - .:/vault
    command: ["watch", "--config", "/vault/scrape.yaml"]
    restart: unless-stopped
```

`scraper` は単発デバッグ用、`scheduler` が定期実行用です。Vault のディレクトリは bind mount で `/vault` に渡しているので、コンテナが書いた Markdown はそのままホスト側ファイルシステムに現れます。

定期実行を始めるときは:

```bash
docker compose up -d scheduler
```

GitHub への同期はコンテナ内ではやりません。コンテナに SSH 鍵や GitHub 認証を渡したくないからです。代わりに、ホスト側のスクリプト `scripts/scrape-and-commit.sh --push` がホストの Git 認証で `inbox/` と `.scrapem/seen-urls.json` だけを最小コミットして push します。スクレイパーが正式ノートを汚す経路を物理的に持たない構造にしてあります。

ただまだ運用では commit までは自動化していなく様子を見つつ改善できる仕組みがないか模索しようと思います。

## inbox の扱い

`inbox/` のノートはそのまま哲学ノートにはなりません。「素材ー」として扱います。Front Matter はこんな感じです。

```yaml
source: "https://philarchive.org/rec/HIRADC"
title: "A democratic consensus? Isaiah Berlin, Hannah Arendt, and the anti-totalitarian family quarrel"
author: "Kei Hiruta"
source_name: "philarchive"
keyword: "ハンナ・アーレント"
query: "Hannah Arendt totalitarianism"
status: raw
```

そして本文の冒頭には Obsidian Graph 用の `[[...]]` リンクとタグを並べた `## Obsidian Links` セクションを置きます。

```markdown
## Obsidian Links

- 研究動向: [[研究動向/ハンナ・アーレント-現代研究動向|ハンナ・アーレント-現代研究動向]]
- キーワード: [[ハンナ・アーレント]]
- 関連分野: [[政治哲学]]
- 関連分野: [[現代思想]]
- 関連タグ: #政治哲学 #現代思想 #全体主義
```

このおかげで、`inbox/` に貯まった素材は Obsidian Graph View 上で対応する研究動向ノートやキーワードと自然に繋がります。AI が `研究動向/` を埋めていく前から、グラフ上で「どのキーワードに何件溜まっているか」が見える状態になります。

ノートのライフサイクルは Front Matter の `status` で管理します。

- `status: raw` — 自動収集された未処理素材（既定）
- `status: processed` — 研究動向ノートに反映済み
- `status: ignored` — 関連薄・低品質・重複で取り込まない

AI 側が反映を終えると `status: processed` と `processed_to: "研究動向/..."` を書き戻し、無視するときは `ignore_reason` を付けて `status: ignored` にする運用です。

## Codex / Claude Code 側のルール

`CLAUDE.md` でエージェント側のルールを最小限に絞っています。具体的には:

- `inbox/` を移動・直訳して正式ノートにしない。既存ノートと照合して日本語で再構成する
- 統合先は原則 `研究動向/`。`書籍/` 配下の正式ノートはエージェントが直接更新しない
- PDF Text は抽出ノイズがあるので、必ず Abstract / Citation と照合して使う
- `git push` はエージェントから実行しない（ローカル端末でユーザーが行う）

依頼の出し方の例はこんな感じです。

> 「inbox/ のハンナ・アーレント関連で `status: raw` のノートを読んで、`研究動向/ハンナ・アーレント-現代研究動向.md` に重複しない形で統合して。反映した inbox は status: processed に更新して」

> 「inbox/ のうち `status: raw` のものだけを確認し、正式ノート化すべきもの・無視してよいもの・追加調査が必要なものに分類して」

エージェントが Vault を「書く側」ではなく「読んで整理する側」になるように責務を切ったことで、自動収集を増やしてもノート全体の構造が壊れにくくなりました。

## まとめ

- 個人の哲学ノート Vault に対して、研究動向の収集を 自動化したい人間、自動化された素材、人間と AI の整理作業の 3 層に分解した
- 収集は Go scraper + Docker Compose、保管は `inbox/`、整理は Codex / Claude Code、正式ノートは人間、と責務が衝突しない設計にした
- `scrape.yaml` を編集するだけで関心キーワードを増減でき、`docker compose up -d scheduler` を 1 回打てば定期収集が回る
- スクレイパーは `inbox/` 以外を書かないので、自動化を増やしても正式ノートは汚れない

この構成にしてから、関心キーワードを足すコストが「`scrape.yaml` に数行書く」だけになり、研究動向のキャッチアップにかかる手間がだいぶ下がりました。今後は対象ソースを少しずつ広げつつ、`研究動向/` 側のテンプレートも整えていく予定です。

