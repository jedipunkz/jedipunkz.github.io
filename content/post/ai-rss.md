---
title: "HackerNews を翻訳・要約して RSS 配信するパイプラインを完全無料で作った話"
description: "GitHub Actions・Google Translate・GitHub Models・Vercel を組み合わせ、Hacker News を日本語翻訳＆AI 要約して RSS 配信する仕組みを $0 で構築した話"
date: 2026-06-06T14:00:00+09:00
Categories: ["AI", "tools", "github-actions", "Go"]
draft: false
---
こんにちは。[jedipunkz🚀](https://x.com/jedipunkz) です。

[HackerNews](https://news.ycombinator.com/) を毎日読みたいのですが、昔は狂ったように巡回していたものの最近は厳しく英語も何だか疲れてしまうし、そして1日に流れてくる記事数が多すぎて自分の関心領域（SRE / Platform Engineering / AI）に絞り込むのが面倒、という課題がありました。そこで「興味のある記事だけを日本語に翻訳し、AI でサマライズして RSS リーダーに流す」パイプラインを作りました。ポイントは、翻訳・要約・ホスティングまで含めてすべて無料サービスだけで完結している点です。


## 全体アーキテクチャ

パイプラインは下記のように、クロール → 翻訳 → AI 要約 → RSS 配信という流れになっています。

- (1) HackerNews をクロール (GitHub Actions + Go + Algolia API)
- (2) `contents/YYYY-MM-DD/*.md` として保存 (Google Tranalate)
- (3) AI 翻訳 (GitHub Models - gpt-4o-mini
- (4) `summaries/YYYY-MM-DD.json` 保存
- (5) Astro ビルド -> rss.xml 配信 (Vercel)


クロールと要約は2つの GitHub Actions ワークフローに分かれていて、前者の完了をトリガーに後者が走るようにしています。要約結果の JSON が main に push されると Vercel が自動でビルドし、RSS が更新されます。

## 1. クロールと翻訳（GitHub Actions + Go）

最初のステップは HackerNews からの記事取得です。これは Go で書いたツールが担当しています。HackerNews 公式 API ではなく [Algolia の HN Search API](https://hn.algolia.com/api) を使うことで、期間指定や検索が簡単になります。API キーは不要です。

GitHub Actions では3時間ごとに実行し、直近3時間以内に投稿された記事を取得しています。タイトルに関心キーワード（`sre`, `platform engineering`, `terraform`, `google cloud`, `ai`, `llm` など）を含むものだけをフィルタしています。

```yaml
on:
  schedule:
    # every 3 hours
    - cron: "0 */3 * * *"
  workflow_dispatch:

# ...
      - name: Crawl and translate
        run: ./bin/hn-digest --source algolia --since 3h --limit 0 \
          --title-keywords "${{ vars.HN_DIGEST_TITLE_KEYWORDS || 'sre,...,llm' }}"
```

### 翻訳は Google Translate の非公式エンドポイントで無料

ここが今回のコスト削減の肝のひとつです。記事本文の翻訳には、Google Translate の Web 版が内部的に叩いている `translate.googleapis.com/translate_a/single` エンドポイントを利用しています。`client=gtx` を付けることで、**API キーなし・無料**で翻訳できます。

```go
func (g *googleTranslator) translateChunk(ctx context.Context, text string) (string, error) {
	params := url.Values{}
	params.Set("client", "gtx")
	params.Set("sl", "auto")
	params.Set("tl", "ja")
	params.Set("dt", "t")
	params.Set("q", text)

	endpoint := "https://translate.googleapis.com/translate_a/single?" + params.Encode()
	// ... GET して結果をパース
}
```

レスポンスは独特なネスト配列の JSON なので、これをパースして翻訳テキストを取り出します。1 リクエストあたりの文字数に制限があるため、本文を 1800 文字程度のチャンクに分割してから翻訳し、結果を結合しています。

翻訳済みの記事は `contents/YYYY-MM-DD/*.md` に Markdown として保存され、フロントマターに `hn_id` / `score` / `title` / `hn_url` / `posted_at` などのメタデータ、本文に `## Translation`（日本語訳）と `## Original Extract`（原文抜粋）を持つ構造にしています。

## 2. AI 要約（GitHub Models — これも無料）

翻訳しただけでは記事数が多すぎる（1 日 150〜200 記事）ので、関心度でスコアリングして上位 30 件に絞り、それぞれを AI で要約します。この要約に使っているのが GitHub Models です。

GitHub Models は GitHub が提供する OpenAI 互換の推論 API で、GitHub Actions に組み込みの `GITHUB_TOKEN` だけで利用できます。レート制限はありますが、**料金は無料**です。モデルは要約用途には十分な `gpt-4o-mini` を使っています。

| 項目 | 仕様 |
|------|------|
| エンドポイント | https://models.inference.ai.azure.com/chat/completions |
| モデル | gpt-4o-mini |
| 認証 | `${{ secrets.GITHUB_TOKEN }}`（Actions 組み込み） |
| permissions | `models: read` |
| コスト | 無料（レート制限内） |

ワークフローでは `models: read` 権限を付与し、組み込みトークンをそのまま渡すだけです。

```yaml
permissions:
  contents: write
  models: read

# ...
      - name: Generate summaries
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: ./bin/summarize
```

### 記事の選定とスコアリング

要約対象を選ぶとき、単純な HN スコア順ではなく、自分の興味カテゴリに応じたボーナスを加味した `final_score` でソートしています。

```
final_score = int(hn_score * (1.0 + sum of matched interest bonuses))
```

タイトルや翻訳本文にキーワードが含まれるとカテゴリごとにボーナスが付きます（例: `ai` なら +0.3、`sre` なら +0.5、`platform` なら +0.8）。各カテゴリは複数キーワードがヒットしても 1 回しか加算されないようにしています。これにより「HN で純粋に話題」かつ「自分の関心が高い」記事が上位に来るようにしています。

上位 30 件について `## Translation` セクションの先頭 4000 文字を GitHub Models に渡し、600〜900 文字程度の日本語サマリーを生成して `summaries/YYYY-MM-DD.json` に保存します。要約結果は記事単位の配列として持たせ、RSS リーダーで個別アイテムとして読めるようにしています。

## 3. RSS 配信（Astro + Vercel）

最後に RSS フィードの生成と配信です。`summaries/*.json` を読み込んで RSS 2.0 を生成する部分は [Astro](https://astro.build/) と `@astrojs/rss` で実装し、[Vercel](https://vercel.com/) の Hobby プラン（無料）でホスティングしています。main ブランチへの push で自動デプロイされます。

| 項目 | 仕様 |
|------|------|
| `<title>` | 記事タイトル（英語のまま） |
| `<description>` | AI サマリー（日本語） |
| `<link>` | HN のディスカッション URL |
| `<pubDate>` | 投稿日時 |
| アイテム数 | 直近 14 日分 × 30 記事 |

## ライセンス配慮：RSS は token で保護する

ここは技術というより運用上の判断ですが、重要なポイントです。

HackerNews に投稿される記事のリンク先は、当然ながらそれぞれの著作権者のコンテンツです。それを勝手に翻訳・要約して誰でも見られる形で公開するのは、ライセンス・著作権に違反する可能性が高いと考えました。あくまで自分が個人的に読むためのものに留めるべきです。

そこで、RSS フィードを含むサイト全体を [Vercel Routing Middleware](https://vercel.com/docs/routing-middleware) で保護し、正しい `token` クエリパラメータを持つリクエストにしか応答しないようにしています。token は環境変数 `RSS_TOKEN` と照合します。

```js
export const config = {
  matcher: ['/', '/index.html', '/rss.xml'],
};

export default function middleware(request) {
  const token = new URL(request.url).searchParams.get('token');
  const expected = process.env.RSS_TOKEN;

  if (!expected || token !== expected) {
    return new Response('Forbidden', { status: 403 });
  }
  // token 一致時のみ静的ファイルの配信を継続
}
```

`RSS_TOKEN` は Vercel の環境変数に `openssl rand -hex 32` で生成したランダム値を設定し、RSS リーダーには下記のように token 付き URL で購読します。

```
https://<your-site>.vercel.app/rss.xml?token=<RSS_TOKEN>
```

token を漏らさない限り他人からはアクセスできず、漏れたとしても `RSS_TOKEN` を更新して再デプロイすれば古い URL は即座に無効になります。あくまで個人利用の範囲に収めるための仕組みです。

## コスト

冒頭で述べた通り、このパイプラインは構成要素すべてが無料枠に収まっています。

| サービス | 用途 | 料金 |
|----------|------|------|
| GitHub Actions | クロール・翻訳・要約の実行 | 無料（パブリックリポジトリ） |
| Algolia HN Search API | 記事取得 | 無料（キー不要） |
| Google Translate (gtx) | 日本語翻訳 | 無料（キー不要） |
| GitHub Models | AI 要約 | 無料（`GITHUB_TOKEN`、レート制限内） |
| Vercel | RSS ホスティング | 無料（Hobby プラン） |
| **合計** | | **$0** |

## まとめ

HackerNews を「関心領域だけ・日本語で・要約付きで・RSS で」読むためのパイプラインを、翻訳から AI 要約、ホスティングまで完全無料で構築しました。

AI 時代になっても人間にとっての情報収集には RSS は未だに必須だと感じているのと同時に、AI 時代だからこそそれをつかって自分の興味に従った情報の配信を自分用に行う、というのはアリかもと思いました。
