---
title: "自作 Go ツールに導入したガードレール策"
description: "一人で開発・運用している Go 製の Fish プラグイン fuzz.fish に、LLM が書くコードのセキュリティ・バグ混入・パフォーマンス・設計思想を機械的に守らせるためのガードレールを 17 件導入しました。CLAUDE.md に書いたルールを linter と CI と ruleset に落とした記録です"
date: 2026-10-12T18:00:00+09:00
tags: ["Go", "Fish", "GitHub Actions"]
categories: ["AI", "Go", "SRE"]
draft: false
---

こんにちは。[ジェダイパンくず🚀](https://x.com/jedipunkz) です。

以前の記事 [Go によるコマンド履歴・ファイル・Git ブランチ/Worktree/コミットを検索する Fish Plugin 開発](/post/fuzz-fish/) で紹介した [fuzz.fish](https://github.com/jedipunkz/fuzz.fish) は、Fish shell のコマンド履歴・ファイル・Git ブランチなどをファジー検索する Fish plugin です。plugin ですが、検索と TUI の本体は Go で実装していて、Fish 側のスクリプト（`conf.d/fuzz.fish`）はキーバインドの登録と Go バイナリの呼び出しだけを担っています。このツールを自分で毎日使いながら一人で開発・運用しています。最近はコードの大半を Claude Code や opencode といった AI agent に書いてもらっていて、自分はレビューとマージが中心です。

この開発スタイルで一番気になっていたのは、**LLM に何を意識させ続けられるか**でした。具体的には次の 4 つです。

- セキュリティ: シェルに文字列を渡して実行する箇所や、サプライチェーンに穴を開けないこと
- バグ混入: 既存の挙動を壊さないこと、テストを減らさないこと
- パフォーマンス: キー入力のたびに走るフィルタ処理を遅くしないこと
- 設計思想: パッケージの依存方向や Bubble Tea の Model / Update / View の分担を崩さないこと

これらは `CLAUDE.md` に書いてあります。ただ、プロンプトに書いたルールは守られる保証がありませんし、一度守られても次の変更では忘れられます。チームであれば他のメンバーのレビューで拾えることも、一人だと自分が見落とした時点で main に入ってしまいます。

そこで「**ルールは CLAUDE.md で宣言し、違反は linter と CI で機械的に落とす**」という方針でガードレールを 17 件 issue 化して実装しました。この記事はその記録です。

## 方針: 宣言 → 可視化 → gate 化

ガードレールは次の 3 段階で考えました。

1. 宣言: `CLAUDE.md` や `SECURITY.md` にルールを書く
2. 可視化: 守れているかを PR 上で見えるようにする（coverage のコメント、ベンチマークの実行など）
3. gate 化: 守れていなければ CI を fail させ、ruleset でマージをブロックする

実は今回の 17 件より前に、PR への test coverage レポートのコメント、ベンチマークの追加、`SECURITY.md` の作成など、1 と 2 の一部はすでにありました。

順番が大事だと感じたのは、**見えていないものは gate にできない**という点です。coverage レポートを毎回眺めていたから、「何 pp 下がったら落とすか」を決められました。ベンチマークを回していたから、どのクエリでどれだけ allocation が起きているかの実測値を持っていました。

もう 1 つは、gate には**許容値（tolerance）が必要**だという点です。coverage は 0.5pp、alloc 数は実測値の約 10% 増しを上限にしています。許容値なしで gate にすると、誤差で落ちる CI が続き、最終的に CI 自体が無視されるようになります。

## 全体像

17 件を 4 つの関心ごとに分けると次のようになります（1 つの施策が複数に効くものは主なものに入れています）。

| 関心ごと | 施策 |
|---|---|
| セキュリティ | golangci-lint に gosec / errorlint を追加 |
| | govulncheck workflow |
| | actionlint + zizmor で workflow 自体を lint |
| | 全 GitHub Actions を commit SHA に pin |
| | release binary に build provenance attestation |
| | Dependabot auto-merge を patch / minor に限定 |
| バグ混入 | テストを `-race` 付きで実行 |
| | coverage 低下で CI を fail |
| | history parser と glob matcher の fuzz test |
| | `conf.d/fuzz.fish` の fish 構文チェック |
| | Build and Test に macOS を追加 |
| パフォーマンス | filter ホットパスの alloc 数を assert |
| | PR ごとに base と head のベンチ差分をコメント |
| 設計思想 | depguard でパッケージの依存方向を固定 |
| | design checklist 付きの PR テンプレート |
| | CLAUDE.md を基準にした AI review |
| 全体の gate | `make check` と pre-push hook |
| | main の ruleset（直 push 禁止、必須 check） |

以下、関心ごとごとに中身と実測値を書きます。

## セキュリティ

### gosec と「信用しない False Positive」

`.golangci.yml` で gosec を有効にしました。初回の実行で出た指摘のうち、G301 / G306（ディレクトリ・ファイルのパーミッション）はテストフィクスチャを作る箇所でした。こちらは 0750 / 0600 に直して解消しています。

一方で G204（変数を使った subprocess 実行）と G304（変数を使ったファイル読み込み）は exclude にしました。

```yaml
    gosec:
      excludes:
        - G204
        - G304
```

fuzz.fish は git / gh を `exec.Command` で呼び出すのが本業で、読むファイルもアプリ自身が決めたパスだけです。G204 は `exec.Command("git", "switch", branch)` のような**引数リスト渡しでも**変数が入れば指摘します。ここを残すと、毎回 `//nolint` を付けるか、指摘を読み飛ばす習慣がつきます。どちらも linter を信用しなくなる方向なので、除外の理由を PR に書いた上で丸ごと外しました。

代わりに「`exec.Command` は引数リストで渡し、`sh -c` に外部入力を渡さない」というルールは CLAUDE.md の Security セクションと、後述する PR テンプレートと AI review の 3 か所で扱っています。linter が見ない部分を人と LLM のレビューで拾う分担です。

### govulncheck

[govulncheck](https://go.dev/doc/security/vuln/) を週次（月曜）のスケジュールで実行しています。初回の結果は、**呼び出し経路上に到達する（reachable な）脆弱性は 0 件**でした。到達しない脆弱性は import 単位で 3 件、モジュール単位で 6 件ありましたが、govulncheck は実際に呼んでいる関数まで解析するので、アラートの大半を「関係ない」と判断する手間が省けます。

### workflow 自体を lint する（actionlint + zizmor）

ガードレールを CI に寄せると、今度は **CI の定義そのものが攻撃面**になります。そこで [actionlint](https://github.com/rhysd/actionlint) と [zizmor](https://docs.zizmor.sh/) で workflow を lint するようにしました。

zizmor の指摘のうちすぐに直せないものは `.github/zizmor.yml` で ignore していますが、**ignore には必ず理由と追跡 issue を書く**ルールにしています。

```yaml
  # dependabot-auto-merge.yml is under parallel maintenance; the spoofable
  # github.actor check should become github.event.pull_request.user.login,
  # tracked in a separate issue.
  bot-conditions:
    ignore:
      - dependabot-auto-merge.yml
```

理由なしの ignore は、LLM が「エラーが消えるから」という理由で追加しがちな変更です。理由を書く欄があるだけで、レビュー時に「この ignore は妥当か」を判断する材料が残ります。

### GitHub Actions を commit SHA に pin

全 9 workflow、30 個の `uses:` を commit SHA に pin しました。

```yaml
      - name: Checkout code
        uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
```

SHA は `git ls-remote` と `gh api /repos/.../git/tags` の 2 通りで取得して一致を確認しています。agent が書いた SHA を目視で正しいと判断するのは難しいので、取得経路を 2 つにして機械的に照合しました。あわせて zizmor の `unpinned-uses` ポリシーを `hash-pin` に強化し、**新しく追加した workflow が tag 参照に戻ったら lint で落ちる**ようにしました。

### release の provenance と Dependabot

release job に `actions/attest-build-provenance` を追加し、配布する `*.tar.gz` に build provenance を付けました。`id-token: write` と `attestations: write` は release job にだけ付けています。利用者は次のコマンドで、バイナリがこのリポジトリの workflow でビルドされたことを確認できます。

```sh
gh attestation verify fuzz_linux_amd64.tar.gz --repo jedipunkz/fuzz.fish
```

Dependabot の auto-merge は、`dependabot/fetch-metadata` が返す `update-type` を見て patch / minor のときだけ有効にしました。major update は破壊的変更を含む前提なので、手動でマージします。

## バグ混入

### `-race` と macOS matrix

CI の Build and Test と Makefile の `test` を `go test -race ./...` にしました。fuzz.fish は Bubble Tea の `tea.Cmd` で履歴・ファイル・Git の読み込みを非同期に行うので、goroutine をまたぐ変更が入りやすい構造です。導入時点では全 8 パッケージで race は検出されませんでしたが、今後の変更で入ったときに落とすのが目的です。

あわせて Build and Test を ubuntu と macOS の matrix にしました。自分の手元は macOS なので、Linux だけの CI では「CI は通るが手元で壊れる」が起こりえます。導入時点で macOS 固有の失敗はありませんでした。

### coverage 低下で fail

もともと PR に coverage をコメントしていたものを、低下したら fail する gate に昇格させました。ポイントは **base と head を同じ runner 上で測る**ことです。

```yaml
      - name: Run tests with coverage (base)
        run: |
          set -o pipefail
          git worktree add "$RUNNER_TEMP/base" "${{ github.event.pull_request.base.sha }}"
          cd "$RUNNER_TEMP/base"
          go test -coverprofile="$RUNNER_TEMP/coverage-base.out" ./...
```

main の coverage を artifact に保存して PR から参照する方法も考えましたが、artifact の保持期限や、main の最新 commit と PR の base がずれる問題があります。`git worktree add` で base の commit をその場に展開して測るほうが、仕組みが単純で比較も正確です。

判定は 0.5pp の許容値付きです。

```yaml
      - name: Fail when total coverage drops
        run: |
          if awk -v h="${{ steps.totals.outputs.head }}" -v b="${{ steps.totals.outputs.base }}" \
            'BEGIN { exit (h + 0.5 < b) ? 0 : 1 }'; then
            echo "::error::Total coverage dropped from ${{ steps.totals.outputs.base }}% to ${{ steps.totals.outputs.head }}% (tolerance 0.5 pp)"
            exit 1
          fi
```

導入した PR では base 73.2%、head 73.2%、delta 0.0pp でした。LLM はテストが落ちるとテスト側を消して通そうとすることがあるので、「テストを減らすと CI が落ちる」状態は効果が大きいと考えています。

### fuzz test

任意の入力を受ける 2 つの関数に Go 標準の fuzz test を追加しました。fish の履歴ファイルをパースする `parseReader` と、`*.go` のような glob でマッチさせる `globMatch` です。

```go
	f.Fuzz(func(t *testing.T, data []byte) {
		entries := parseReader(bytes.NewReader(data))
		if entries == nil {
			t.Fatal("parseReader returned nil, want an empty slice")
		}
		for _, e := range entries {
			if e.Count < 1 {
				t.Fatalf("entry %q has Count %d, want >= 1", e.Cmd, e.Count)
			}
		}
	})
```

panic しないことだけでなく、**不変条件**を確認しています。parser は「結果が nil でない」「重複排除後の各エントリの Count が 1 以上」、glob matcher は「マッチ位置が文字列の範囲内で、単調増加している」です。

ローカルで各 30 秒実行し、`FuzzParseReader` は約 10.6 万回、`FuzzGlobMatch` は約 250 万回の入力で crash はありませんでした。実際のバグも見つかっていません。CI ではシードコーパス（既存のユニットテストの入力から取ったもの）が通常の `go test` の一部として実行されるだけで、fuzzing そのものは回していません。

### fish スクリプトの構文チェック

fuzz.fish は Go のバイナリだけでなく、`conf.d/fuzz.fish` という fish スクリプトも配布しています。Go の CI はここを一切見ないので、`fish --no-execute conf.d/fuzz.fish` で構文だけ確認する workflow を追加しました。`conf.d/**` と workflow の変更時にだけ動きます。

## パフォーマンス

fuzz.fish は 1 キー入力ごとに数千〜数万件の履歴をフィルタし直します。ここで allocation が増えると GC が走り、入力の体感が悪くなります。CLAUDE.md には「filter.go のホットパスで per-keystroke の allocation を増やさない」と書いていますが、LLM はこの手のルールを一番忘れやすいと感じています。`append` で新しいスライスを作るのは、普通の Go のコードとしては自然な書き方だからです。

### alloc 数を assert する

ベンチマークの実行時間は CI の runner によってぶれるので、gate にするには向きません。一方で **allocation の回数は決定的**です。そこで `testing.AllocsPerRun` で `updateFilter` の alloc 数を測り、上限を超えたら通常の `go test` が fail するようにしました。

```go
// TestUpdateFilter_AllocCount asserts the allocation count of the filter hot
// path: CLAUDE.md requires updateFilter to avoid per-keystroke allocations on
// a warmed-up model, so a regression must fail go test. Unlike benchmark
// timings, allocation counts are deterministic and CI-safe. Thresholds are the
// measured values plus ~10% headroom; counts scale with the match set, so each
// query/size pair carries its own cap.
func TestUpdateFilter_AllocCount(t *testing.T) {
	queries := []struct {
		name  string
		query string
		maxAllocs [2]float64
	}{
		{name: "empty", query: "", maxAllocs: [2]float64{2, 2}},
		{name: "single", query: "gpl", maxAllocs: [2]float64{310, 2800}},
		{name: "multi", query: "git pull", maxAllocs: [2]float64{1300, 12500}},
		{name: "glob", query: "nvim *.go", maxAllocs: [2]float64{155, 1400}},
	}
	sizes := []int{1000, 10000}
	// ...
}
```

履歴 1,000 件での実測値は次のとおりで、上限はそれぞれ約 10% の余裕を持たせています。

| クエリ | 実測 alloc 数（n=1000） | 上限 |
|---|---|---|
| 空 | 1 | 2 |
| 単一 token（`gpl`） | 275 | 310 |
| 複数 token（`git pull`） | 1173 | 1300 |
| glob（`nvim *.go`） | 138 | 155 |

テストのコメントに「なぜこのテストがあるか」と「なぜ実行時間ではなく alloc 数なのか」を書いているのは、LLM がこのテストを読んだときに、上限を引き上げて通すのではなく実装側を直す判断をしてほしいからです。

### ベンチマーク差分を PR にコメントする

実行時間は gate にはしませんが、見えるようにはしておきたいので、PR ごとに base と head を同じ runner でベンチマークし、[benchstat](https://pkg.go.dev/golang.org/x/perf/cmd/benchstat) の結果を sticky comment で投稿するようにしました。

```yaml
      - name: Run benchmarks on PR head
        run: |
          (cd head && go test -run '^$' -bench . -benchmem -count 10 -benchtime=100x ./internal/app/ ./internal/history/) > bench-head.txt

      - name: Run benchmarks on base branch
        run: |
          (cd base && go test -run '^$' -bench . -benchmem -count 10 -benchtime=100x ./internal/app/ ./internal/history/) > bench-base.txt
```

coverage と同じく、別の runner で測った値と比べると環境差がそのまま差分に出るので、同じ runner で両方を測っています。初回のコメントでは geomean +1.17% で、誤差の範囲でした。

つまりパフォーマンスについては、**決定的な指標（alloc 数）は gate、ぶれる指標（実行時間）は可視化**と使い分けています。

## 設計思想

### depguard で依存方向を固定する

fuzz.fish のパッケージ構成は次のとおりです。

```
cmd/fuzz/main.go     # エントリポイント
internal/app/        # TUI（Bubble Tea の Model / Update / View）
internal/git/        # Git ブランチ等の取得
internal/history/    # fish 履歴のパース
internal/files/      # ディレクトリの走査
internal/config/     # 設定ファイルの読み込み
internal/scoring/    # frecency スコア
internal/ui/         # スタイル・色・整形
```

意図している依存方向は「`cmd/fuzz` → `app` → データ層（`git` / `history` / `files`） → `ui`」で、`config` / `scoring` / `ui` は他の internal パッケージに依存しない葉です。LLM は「ここで `app` の型を使えば早い」という理由で逆向きの import を平気で足すので、[depguard](https://github.com/OpenPeeDeeP/depguard) のルール 3 本で固定しました。

| ルール | 内容 |
|---|---|
| internal-leaf-no-internal-imports | `config` / `scoring` / `ui` は他の internal パッケージを import しない |
| data-layer-imports-ui-only | `files` / `git` / `history` は internal のうち `ui` だけを import できる |
| app-only-from-cmd-fuzz | `internal/app` を import できるのは `cmd/fuzz` だけ |

```yaml
        app-only-from-cmd-fuzz:
          files:
            - "!**/cmd/fuzz/**"
          deny:
            - pkg: github.com/jedipunkz/fuzz.fish/internal/app
              desc: only cmd/fuzz may import internal/app
```

`desc` に書いた文言は lint のエラーメッセージとしてそのまま出ます。LLM はこのメッセージを読んで修正するので、**何が禁止されているかだけでなく、どこからなら良いのかを書く**ようにしています。

### PR テンプレートの design checklist

PR テンプレートに、この記事で扱っている論点を 4 行のチェックリストとして入れました。

```markdown
## Design Checklist

- [ ] No new per-keystroke allocations in `internal/app/filter.go`.
- [ ] `exec.Command` uses argument lists, never `sh -c` with external input.
- [ ] Package dependency direction is preserved.
- [ ] Tests added or updated.
```

1 行目は alloc assert、2 行目は gosec と CLAUDE.md の Security、3 行目は depguard に対応しています。機械で落とせる部分は CI が担い、チェックリストは「この PR でそれを意識したか」を LLM 自身に PR 本文で確認させるためのものです。

### CLAUDE.md を基準にした AI review

最後に、[anthropics/claude-code-action](https://github.com/anthropics/claude-code-action) で PR を CLAUDE.md に照らしてレビューする workflow を追加しました。linter では表現しにくい「Bubble Tea の Model / Update / View をファイルごとに分ける」「推測で抽象化を足さない」といった規約を読ませるためです。

```yaml
          prompt: |
            ...
            3. Report ONLY concrete violations of the `Code Conventions` and `Security` sections of CLAUDE.md. Do not report style preferences, generic advice, or anything covered by other sections of CLAUDE.md.
            4. For each violation, cite the exact file and line number and quote the CLAUDE.md rule it violates.
            5. Post each finding as an inline PR review comment. If there are no violations, do not post any comments.
          claude_args: |
            --max-turns 20
            --allowedTools "Read,Grep,Glob,Bash(gh pr diff:*),Bash(gh pr view:*),mcp__github_inline_comment__create_inline_comment"
```

気をつけたのは次の 3 点です。

- 指摘の範囲を CLAUDE.md の `Code Conventions` と `Security` に限定し、根拠となるルールの引用を必須にした。一般論のレビューコメントが並ぶと、本当の違反が埋もれるため
- `allowedTools` を読み取り系と `gh pr diff` / `gh pr view`、インラインコメントの投稿だけに絞った。PR の差分は外部から入る入力なので、そこに書かれた指示に従ってコードを書き換えたり任意のコマンドを実行したりできないようにするため
- action 自体も SHA で pin し、fork からの PR では secrets が渡らないので自動的に skip される

## gate をすり抜けさせない

### `make check` と pre-push hook

CI で落ちてから直すと、LLM とのやりとりが 1 往復増えます。そこで CI と同じ内容（build + vet + golangci-lint + `go test -race`）をローカルで実行する `make check` を用意し、CLAUDE.md に「PR を出す前に `make check` を実行する」と書きました。

```makefile
# Same checks as CI: build, vet, golangci-lint (v2.14.0), tests with -race.
check: build lint test
```

さらに `.githooks/pre-push` で push のたびに `make check` を実行します。`git config core.hooksPath .githooks` で有効になります。CLAUDE.md には `--no-verify` で hook を飛ばすことも禁止と書いています。

### ruleset で main を守る

ここまでの CI は、main に直接 push されたら意味がありません。一人で開発していると、自分で「ちょっとだけ」と直 push しがちですし、権限を持った agent も同じことができます。そこで main の ruleset を作り直しました。

- main への直接 push を禁止し、PR を必須にする
- ブランチが base に追従している（up-to-date）ことを必須にする
- 必須 check を 5 件にする: Build and Test（ubuntu / macOS）、Lint、CodeQL、govulncheck
- admin の bypass は PR 経由に限定する

ruleset が最後の gate になることで、ここまでのガードレールが「実行されているが無視できる」状態から「通らないとマージできない」状態になります。

## 導入して分かったこと

### 変化検知の範囲は workflow 自体も含める

以前、CI を Go 関連のファイル（`**.go`、`go.mod`、`Makefile` など）が変わったときだけ動くようにしていました。ところが今回のように **workflow 自体を変更する PR** では、Go のファイルが変わっていないため CI が動かず、変更した workflow が正しく動くかを確認できません。`.github/workflows/ci.yml` を paths filter に追加して解消しました。ガードレールを増やす作業そのものが、ガードレールの外側で行われる点には注意が必要です。

### 同じ環境で比べる

coverage とベンチマークの両方で、base と head を同じ runner で測る形にしました。別々の環境で測った値の差には、コードの変化と環境の差が混ざります。少し CI の実行時間は伸びますが、gate や判断の根拠にする値は同じ条件で取るべきだと考えています。

### 1 PR が通るまでの流れ

ガードレールを入れる直前の機能追加（F5 で読み込み済みのデータソースを再読み込みする refresh key）は「PR → CI（build / vet / test / lint）→ squash merge」という流れでした。今は同じ流れの中に、次の順で関門が並んでいます。

1. agent が実装し、`make check` と pre-push hook を通して push する
2. PR テンプレートの design checklist を埋める
3. CI が build / vet / lint（depguard・gosec）/ `-race` 付きテスト（alloc assert・fuzz のシードを含む）を ubuntu と macOS で実行する
4. coverage の差分とベンチマークの差分が PR にコメントされる
5. AI review が CLAUDE.md に照らして違反があればインラインでコメントする
6. ruleset の必須 check がすべて通ったら squash merge する

自分がレビューで見るのは、この結果と差分そのものです。「依存方向は崩れていないか」「alloc を増やしていないか」を目で追う必要がなくなったので、仕様として正しいかどうかに集中できるようになりました。

## 残っている課題

- AI review は `ANTHROPIC_API_KEY` を repo の Secrets に登録するまで skip する作りにしているため、まだ実際には動いていません
- provenance attestation は次回の release（`workflow_dispatch` による手動実行）で初めて動くので、まだ検証できていません
- zizmor で理由付き ignore にしている項目（Dependabot auto-merge の `github.actor` 判定を `github.event.pull_request.user.login` に変える、など）が残っています
- fuzz test は CI でシードコーパスを回しているだけなので、定期的に fuzzing そのものを回す仕組みはまだありません

## まとめ

- 一人で LLM と開発していると、CLAUDE.md に書いたルールが守られているかを確認する人がいない。そこでルールを linter・テスト・CI・ruleset に落とし、違反を機械的に落とすようにした
- 進め方は「宣言 → 可視化 → gate 化」。coverage やベンチマークが先に見えていたから、許容値を決めて gate にできた
- セキュリティは gosec・govulncheck・zizmor・SHA pin・provenance、バグ混入は `-race`・coverage gate・fuzz・macOS matrix、パフォーマンスは alloc 数の assert とベンチ差分、設計思想は depguard・PR テンプレート・AI review で担っている
- ぶれる指標は gate にせず可視化に留め、決定的な指標だけを gate にする。比較は同じ runner で行う
- 最後の gate は ruleset。main への直 push を禁止して、全部の check を通らないとマージできないようにした

LLM に「気をつけて」とお願いするのではなく、気をつけなくても違反できない状態にしておく、というのが今回の結論です。次は AI review を実際に動かし、どのくらいの頻度で CLAUDE.md 違反を拾えるのかを見てみたいと思っています。
