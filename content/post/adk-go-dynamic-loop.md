---
title: "ADK Go 2.x の dynamic workflow で「分かるまで調べる」エージェントを書き、ガードレールで縛る"
description: "Claude Agent SDK の agent loop や Claude Code の dynamic workflows と同じことを ADK Go 2.x でやるとどうなるか。上限を持たない llmagent のループに、ラウンド上限・進捗なし停止・トークン予算・ツール allowlist を自分で組み込みます"
date: 2026-10-12T12:00:00+09:00
Categories: ["AI", "Go", "SRE", "Agent"]
draft: false
---

こんにちは。[ジェダイパンくず☁️](https://x.com/jedipunkz) です。

前回の記事 [ADK Go 2.0 のグラフワークフローを読んで SRE Agent への応用を考える](/post/adk-go-2/) の最後に、こんな宿題を残していました。

> インシデント対応は「調べて、分からなかったらもう少し調べる」という反復が本質なので、完全に静的なグラフでは表現しきれない部分があります。`NewDynamicNode` で調査ループを書き、確定した対処だけを静的グラフに戻す、というハイブリッドが現実解な気がしていますが、そうすると動的ノードの中身が結局ブラックボックスになるジレンマがあります。

その後、Claude の [Agent SDK](https://code.claude.com/docs/ja/agent-sdk/overview) の agent loop や、Claude Code の [dynamic workflows](https://code.claude.com/docs/en/workflows) を眺めていて、「自律的に、動的に回るループ」を ADK でやるとどうなるのかが気になりました。結論を先に書くと、**ループそのものは ADK でも回せます。ただし止める仕組みは自分で書く必要があります**。この記事はその「止める仕組み」、つまりガードレールの話です。

記事中のコードは [jedipunkz/adk-playground の investigation-loop](https://github.com/jedipunkz/adk-playground/tree/main/investigation-loop) にあり、ADK Go v2.5.0（2026-09-30 リリース）で `go vet` とテストを通しています。

## 「ループ」は 2 種類ある

最初に整理しておきたいのは、「自律的なループ」と言ったときに 2 つの別のものが混ざりがちだという点です。

| | Claude 側 | ADK Go 側 |
|---|---|---|
| agent loop（1 エージェントの中で、モデル → ツール → モデルを繰り返す） | Agent SDK の `query()` | `llmagent` |
| オーケストレーションのループ（エージェントを何度も呼び、結果を見て次を決める） | Claude Code の dynamic workflows（loop until done パターン） | `workflow.NewDynamicNode` |

Claude Code の dynamic workflows は、**Claude 自身が JavaScript のオーケストレーション用スクリプトを書き**、ランタイムがそれをバックグラウンドで実行する機能です。スクリプトの中では `agent()` でサブエージェントを起動し、`parallel()` / `pipeline()` で fan-out します。ループ・分岐・途中結果はスクリプトの変数が持つので、Claude のコンテキストには最終結果しか入りません。

ADK の dynamic workflow も「制御フローをコードに置く」という点は同じです。違いは**そのコードを書くのが人間（開発者）だ**という点です。ADK には LLM がオーケストレーションを書く仕組みは組み込まれていません。

今回はこの 2 つを組み合わせます。外側のループ（何ラウンド回すか、いつ止めるか）を Go の dynamic node に置き、内側の agent loop（1 ラウンドの調査）を `llmagent` に任せます。

## ADK の llmagent は止まらない

まず内側の agent loop です。ADK Go の `llmagent` のループ本体は `internal/llminternal/base_flow.go` の `Flow.Run` にあります（v2.5.0 時点、要点だけ抜粋）。

```go
func (f *Flow) Run(ctx agent.InvocationContext) iter.Seq2[*session.Event, error] {
	return func(yield func(*session.Event, error) bool) {
		thoughtOnlyTurns := 0
		for {
			var lastEvent *session.Event
			for ev, err := range f.runOneStep(ctx) {
				// ... イベントを上流に流す
				lastEvent = ev
			}
			if lastEvent == nil {
				return
			}
			if lastEvent.IsFinalResponse() {
				if !isThoughtOnlyTurn(lastEvent) {
					return
				}
				thoughtOnlyTurns++
				if thoughtOnlyTurns >= maxConsecutiveThoughtOnlyTurns {
					return
				}
			}
			// ...
		}
	}
}
```

`runOneStep` がモデルを 1 回呼び、ツール呼び出しがあればツールを実行します。**ツール呼び出しのない最終応答が返るまで `for {}` が回り続けます**。組み込みの上限は「思考だけのターンが 10 回続いたら諦める」（`maxConsecutiveThoughtOnlyTurns = 10`）だけです。`MaxLLMCalls` という設定は存在しますが、v2.5.0 では live（双方向ストリーミング）用の `LiveRunConfig` のフィールドで、通常の実行では使われていません。

Claude Agent SDK と並べるとこうなります。

| Agent SDK | ADK Go v2.5.0 |
|---|---|
| `max_turns` / `maxTurns` | なし |
| `max_budget_usd` / `maxBudgetUsd` | なし |
| `allowed_tools` / `disallowed_tools` / `permission_mode` | なし（`BeforeToolCallback` で自分で書く） |
| 読み取り系ツールだけ並列実行し、書き込み系は順番に実行 | 1 応答内の複数のツール呼び出しを、既定で goroutine で並列実行（読み書きを区別しない） |
| 自動 compaction | `runner.Config.Compaction`（既定は無効） |

ADK が劣っているという話ではありません。Agent SDK は Claude Code という完成した harness をライブラリとして使うもので、ADK は harness を組み立てるための framework です。ただ、上限がない状態で外側にさらにループを重ねると、暴走の上に暴走を重ねることになります。なので今回は**ガードレールを先に設計しました**。

## 設計

作ったのはインシデント調査のエージェントです。構造は 1 ノードだけのワークフローです。

```
START ─> investigate (dynamic, Go) ──RunNode × N──> investigator (llmagent + tools)
```

- `investigate` は `workflow.NewDynamicNode` で書いた Go のオーケストレータです。ラウンドを回し、ラウンド間で何を引き継ぐか、いつ止めるかを決めます
- `investigator` は read-only のツール（`query_metrics` / `query_logs` / `list_deploys`）を持つ `llmagent` です。1 ラウンドの中で agent loop を回し、新しく分かったことを JSON で返します

ポイントは、`llmagent` をワークフローのノードにすると既定で **single-turn** になることです。investigator には前のラウンドの会話履歴が見えず、オーケストレータが渡したプロンプトだけを見ます。つまり**ラウンドをまたいで何を覚えておくかを Go のコードが決めます**。今回引き継ぐのは確定した findings のリストだけです。

```go
func roundPrompt(question string, round int, known []string) string {
	var sb strings.Builder
	fmt.Fprintf(&sb, "Incident: %s\nRound: %d\n", question, round)
	if len(known) == 0 {
		sb.WriteString("Known findings: none yet.\n")
		return sb.String()
	}
	sb.WriteString("Known findings:\n")
	for _, f := range known {
		fmt.Fprintf(&sb, "- %s\n", f)
	}
	return sb.String()
}
```

これは Claude Code の dynamic workflows が「途中結果はスクリプトの変数に置き、Claude のコンテキストには入れない」としているのと同じ考え方です。ラウンドを重ねてもコンテキストが膨らまず、compaction で指示が要約されて消える心配もありません。

## ガードレールを 4 層で組む

ガードレールは置き場所ごとに 4 層に分けました。

| 層 | ガードレール | 実装 | 既定値 |
|---|---|---|---|
| ループ（Go） | 最大ラウンド数 | `investigate` の for 条件 | 6 |
| ループ（Go） | 進捗なし停止 | 新しい finding が N ラウンド連続で出なければ止める | 2 |
| ループ（Go） | LLM の done 提案 | finding が 1 件以上あるときだけ受け入れる | - |
| ループ（Go） | 不正な出力 | JSON として読めない応答は finding を増やせない | - |
| 両方 | トークン予算 | `AfterModelCallback` で集計し、ラウンド開始前と `BeforeModelCallback` で判定 | 30,000 |
| agent loop | ラウンドあたりのモデル呼び出し上限 | `BeforeModelCallback` | 8 |
| ツール | allowlist と引数の制限 | `BeforeToolCallback` | read-only 3 ツール、時間窓 60 分 |
| スケジューラ | ラウンドのタイムアウト | `NodeConfig.Timeout` | 2 分 |

上限値はひとつの struct にまとめました。

```go
type Limits struct {
	MaxRounds             int
	NoProgressRounds      int
	MaxModelCallsPerRound int
	TokenBudget           int
	MaxWindowMinutes      int
}
```

### ループ層: 止める判断は Go が持つ

オーケストレータの本体です。

```go
func investigate(ctx agent.Context, question string, investigator workflow.Node, g *guard) (report, error) {
	id := ctx.InvocationID()
	defer g.finish(id)

	var (
		findings []string
		seen     = map[string]bool{}
		idle     int
		r        = report{Stop: stopMaxRounds}
	)
	for r.Rounds < g.limits.MaxRounds {
		if g.snapshot(id).tokens >= g.limits.TokenBudget {
			r.Stop = stopBudget
			break
		}
		r.Rounds++
		g.beginRound(id)

		out, err := workflow.RunNode[string](ctx, investigator, roundPrompt(question, r.Rounds, findings))
		if err != nil {
			return report{}, fmt.Errorf("round %d: %w", r.Rounds, err)
		}

		res := parseRound(out)
		added := 0
		for _, f := range res.Findings {
			key := strings.ToLower(strings.TrimSpace(f))
			if key == "" || seen[key] {
				continue
			}
			seen[key] = true
			findings = append(findings, strings.TrimSpace(f))
			added++
		}
		if added == 0 {
			idle++
		} else {
			idle = 0
		}

		if res.Done && len(findings) > 0 {
			r.Stop = stopModelDone
			break
		}
		if idle >= g.limits.NoProgressRounds {
			r.Stop = stopNoProgress
			break
		}
	}
	// ...
}
```

Claude のブログ記事 [A harness for every task](https://claude.com/blog/a-harness-for-every-task-dynamic-workflows-in-claude-code) では loop until done を「作業量が分からないタスクで、固定回数ではなく停止条件（たとえば『新しい発見がない』）が成り立つまでエージェントを起動し続ける」パターンとして紹介しています。ここではその停止条件を Go で書いています。

LLM が `"done": true` を返すことは許していますが、**それだけでは止めません**。finding が 1 件もないのに done を返すのは「調べるのを諦めた」可能性があるためです。逆に、LLM が done を返さなくても、新しい発見が 2 ラウンド続けてなければ Go が止めます。前回の記事と同じく「LLM は提案し、判断はコードがする」形です。

LLM の出力のパースも、ガードレールとして扱っています。

```go
func parseRound(out string) roundResult {
	start, end := strings.Index(out, "{"), strings.LastIndex(out, "}")
	if start < 0 || end <= start {
		return roundResult{}
	}
	var res roundResult
	if err := json.Unmarshal([]byte(out[start:end+1]), &res); err != nil {
		return roundResult{}
	}
	return res
}
```

読めない応答は「新しい発見ゼロ」として扱います。壊れた出力が findings に紛れ込むことはなく、壊れた出力が続けば進捗なし停止でループが終わります。

### agent loop 層: エラーではなく「空の答え」で止める

内側の `llmagent` のループは `BeforeModelCallback` で止めます。このコールバックが `*model.LLMResponse` を返すと、ADK は実際のモデル呼び出しをスキップしてその応答を使います。

```go
const cutoffAnswer = `{"findings": [], "done": false}`

func (g *guard) beforeModel(ctx agent.Context, _ *model.LLMRequest) (*model.LLMResponse, error) {
	g.mu.Lock()
	defer g.mu.Unlock()
	s := g.state(ctx.InvocationID())

	var reason string
	switch {
	case s.tokens >= g.limits.TokenBudget:
		reason = fmt.Sprintf("token budget %d exhausted", g.limits.TokenBudget)
	case s.roundCalls >= g.limits.MaxModelCallsPerRound:
		reason = fmt.Sprintf("%d model calls in one round", g.limits.MaxModelCallsPerRound)
	default:
		s.roundCalls++
		return nil, nil
	}
	s.cutoffs = append(s.cutoffs, reason)
	return &model.LLMResponse{
		Content:      genai.NewContentFromText(cutoffAnswer, genai.RoleModel),
		TurnComplete: true,
	}, nil
}
```

ここで迷ったのは、上限に達したときに error を返すか、応答を返すかです。error を返すとノードが失敗し、`RetryConfig` を付けていればリトライされて、むしろ呼び出しが増えます。そこで**ツール呼び出しを含まない応答**を返すことにしました。先ほどの `Flow.Run` は「ツール呼び出しのない最終応答」でループを抜けるので、これで agent loop は正常に終わります。返す内容は「findings が空のラウンド結果」なので、オーケストレータ側では進捗なしのラウンドとして数えられます。

トークンは `AfterModelCallback` で数えます。

```go
func (g *guard) afterModel(ctx agent.Context, resp *model.LLMResponse, _ error) (*model.LLMResponse, error) {
	if resp == nil || resp.Partial || resp.UsageMetadata == nil {
		return nil, nil
	}
	g.mu.Lock()
	defer g.mu.Unlock()
	g.state(ctx.InvocationID()).tokens += int(resp.UsageMetadata.TotalTokenCount)
	return nil, nil
}
```

ストリーミング時の部分チャンク（`Partial`）は数えないようにしています。数えると同じ応答を二重に数えるためです。

### ツール層: allowlist と引数の制限

`BeforeToolCallback` は結果を返すとツールの実行をスキップし、返した結果をツールの結果としてモデルに渡します。また、`args` を書き換えて `nil, nil` を返すと、書き換えた引数でツールが実行されます。この 2 つの性質を使います。

```go
func (g *guard) beforeTool(ctx agent.Context, t tool.Tool, args map[string]any) (map[string]any, error) {
	if !readOnlyTools[t.Name()] {
		g.mu.Lock()
		s := g.state(ctx.InvocationID())
		s.denied = append(s.denied, t.Name())
		g.mu.Unlock()
		return map[string]any{"error": fmt.Sprintf("tool %q is not allowed: this agent is read-only", t.Name())}, nil
	}
	switch w := args["window_minutes"].(type) {
	case float64:
		if int(w) > g.limits.MaxWindowMinutes {
			args["window_minutes"] = float64(g.limits.MaxWindowMinutes)
		}
	case int:
		if w > g.limits.MaxWindowMinutes {
			args["window_minutes"] = g.limits.MaxWindowMinutes
		}
	}
	return nil, nil
}
```

拒否は Go の error ではなく**ツールの結果**として返しています。こうするとモデルは「このツールは使えない」と知った上で、許可されたツールで調査を続けられます。

サンプルではわざと `restart_pod`（全 Pod を再起動する書き込み系ツール）をツール一覧に入れています。「危険なツールは最初から渡さなければいい」と思うかもしれません。しかし MCP toolset を使うと、サーバが公開しているツールは書き込み系も含めてそのまま入ってきます。**渡していないつもりで渡っている**状況を前提に、allowlist で止める形にしました。Agent SDK の `allowed_tools` / `disallowed_tools` に相当するものです。

### スケジューラ層: タイムアウト

最後はノード単位のタイムアウトです。

```go
investigatorNode, err := workflow.NewAgentNode(investigator, workflow.NodeConfig{Timeout: roundTimeout})
```

これは無限ループではなく、処理が止まったまま返ってこない（ハングする）ケースに備えるものです。モデルやツールが応答しなくなると呼び出し回数もトークンも増えないため、上の 3 層では止められません。

## 動作確認

API キーがなくても動くように、スクリプト化したスタブモデルを用意しました。`INVESTIGATION_SCENARIO` で振る舞いを切り替えると、各ガードレールが発動する様子を見られます。

```bash
git clone https://github.com/jedipunkz/adk-playground
cd adk-playground/investigation-loop
go run . console
```

### converge: 新しい発見がなくなって止まる

3 ラウンドで 3 件見つけ、その後は既知のことしか返さないシナリオです。途中のラウンドで `restart_pod` を呼ぼうとし、4 時間分のログも要求します。

```
Investigation stopped after 5 round(s): no new findings. Tokens used: 13500.

Findings:
- checkout-api error rate rose to 18% at 10:07
- payments-db is refusing connections: too many clients
- v1.42 deployed at 10:00 lowered DB_POOL_SIZE from 50 to 20

Tool calls refused:
- restart_pod
```

ラウンド 4・5 で新しい発見がなかったので、5 ラウンド目で止まりました。`restart_pod` は拒否され、一度も実行されていません。ログの時間窓は 240 分から 60 分に丸められています（どちらもテストで確認しています）。

### runaway-tools: ツールを呼び続けて答えない

```
Investigation stopped after 2 round(s): no new findings. Tokens used: 24000.

Findings:
- none

Rounds cut short by guardrails:
- 8 model calls in one round
- 8 model calls in one round
```

各ラウンドがモデル呼び出し 8 回で打ち切られ、空の結果になります。空のラウンドが 2 回続いたので、オーケストレータが止めました。agent loop 層とループ層が連携して止めている例です。

### endless-findings: 毎ラウンド「新しい」ことを言い続ける

```
Investigation stopped after 5 round(s): token budget exhausted. Tokens used: 30000.

Findings:
- possible anomaly #1 worth a closer look
- possible anomaly #2 worth a closer look
- possible anomaly #3 worth a closer look
- possible anomaly #4 worth a closer look
- possible anomaly #5 worth a closer look
```

一番厄介なのはこれです。毎回違う文言で「何か見つけた」と返されると、進捗なし停止は効きません。最後に止めるのはトークン予算です。文言だけ変えた同じ指摘を同一とみなす判定は、Go の文字列比較ではできません。ここは**予算という、内容を見ないガードレールが必要になる**ところだと思います。

テストは 3 シナリオを ADK の runner で端から端まで実行し、停止理由、`restart_pod` が実行されていないこと、引数が丸められていることを確認しています。

```go
func TestConvergeStopsWhenNothingNewTurnsUp(t *testing.T) {
	restartCalls.Store(0)
	got, windows := run(t, scenarioConverge)
	// ...
	if n := restartCalls.Load(); n != 0 {
		t.Errorf("restart_pod ran %d time(s); the allowlist must refuse it", n)
	}
	if len(windows) != 1 || windows[0] != float64(defaultLimits.MaxWindowMinutes) {
		t.Errorf("query_logs saw window_minutes %v, want it clamped to [%d]", windows, defaultLimits.MaxWindowMinutes)
	}
}
```

前回の記事で「ルーティングのテストは、分岐が LLM の判断だったら書けなかったテスト」と書きました。今回も同じで、**停止条件がコードにあるから停止のテストが書けます**。

## ハマりどころと学び

### ガードレールの状態をどこに持つか

コールバックは `llmagent` に 1 度だけ登録するので、状態は実行ごとに分ける必要があります。今回は `ctx.InvocationID()` をキーにしました。dynamic node の中から `RunNode` で呼んだ子の `llmagent` は、親と同じ InvocationID を持つためです。これにより、オーケストレータが `beginRound` でリセットしたカウンタを、子のコールバックがそのまま参照できます。

ただし状態はプロセスのメモリにあります。ADK のワークフローはセッションの履歴から再開できますが、別のプロセスで再開するとトークン集計は 0 から始まります。厳密にやるなら、session state に置く必要があります。

### オーケストレータは決定的に書く

ADK の dynamic node は再開時に**本体を頭から再実行**し、完了済みの子ノードはチェックポイントから結果を返します（`RerunOnResume` の既定値が `true`）。子の実行 ID は親 ID とカウンタから決まるので、同じ入力から同じ順序で `RunNode` を呼ぶ必要があります。オーケストレータの中で時刻や乱数を使ってはいけません。

Claude Code の dynamic workflows も、スクリプトの中で `Date.now()` や `Math.random()` を呼ぶと例外になります。理由は同じで、再実行したときに同じ `agent()` 呼び出しを再現するためです。言語もランタイムも違いますが、同じ制約にたどり着いているのが面白いところです。

### compaction は root が LLM agent でないと素直に使えない

`runner.Config.Compaction` は、Summarizer を指定しない場合は root agent のモデルで要約します。そのため root が LLM agent である必要があります。今回のように root が workflow agent だとこの前提が満たされないので、Summarizer を自分で渡す必要があります。今回はラウンドごとに single-turn で文脈がリセットされるので、compaction 自体が不要でした。

### ツールの並列実行は読み書きを区別しない

前述のとおり、ADK は 1 応答内の複数のツール呼び出しを並列に実行します。Agent SDK のように「書き込み系は順番に実行する」区別はありません。今回は書き込み系を allowlist で全部止めたので問題になりませんでしたが、書き込み系を許可するなら直列化を自分で考える必要があります。

## Claude Code の dynamic workflows と比べて

一番大きな違いは、やはり**オーケストレーションを書くのが誰か**です。

Claude Code では、Claude がタスクに合わせてスクリプトを書きます。事前に想定していなかった形のタスクにも、その場で専用の harness を作れるのが強みです。その代わり、実行前に人間がスクリプトを承認する（あるいは承認を省略する）運用になります。

ADK では人間が書きます。柔軟性では劣りますが、停止条件・上限・許可されたツールがすべてコードとしてレビューでき、テストで固定できます。本番環境に触れる SRE のエージェントでは、こちらの性質がほしい場面が多いと感じています。

前回の宿題だった「動的ノードの中身がブラックボックスになる」問題について、今回の結論はこうです。**ループの中身（LLM が何を調べるか）は動的なままでよく、ループの外枠（何を引き継ぎ、いつ止め、何を許すか）を静的なコードにすればよい**。中身が読めなくても、外枠が読めてテストできれば、自律度を上げても怖くありません。

## まとめ

- ADK Go の `llmagent` も Claude Agent SDK と同じ agent loop（モデル → ツール → モデル）を回すが、ターン上限・予算上限・ツール許可は持たない
- `NewDynamicNode` で外側のループを Go で書くと、Claude Code の dynamic workflows の loop until done と同じ形になる。違いはスクリプトを書くのが人間であること
- ガードレールは置き場所ごとに 4 層に分けた。ループ層（ラウンド上限・進捗なし停止・done 提案の扱い）、agent loop 層（`BeforeModelCallback` で呼び出し上限と予算）、ツール層（`BeforeToolCallback` で allowlist と引数制限）、スケジューラ層（`Timeout`）
- agent loop を止めるときは error ではなく「ツール呼び出しのない空の答え」を返すと、リトライに化けずに正常に終わる
- 毎回違う文言で発見を言い続けるモデルは、内容で止めることができない。予算のような内容を見ないガードレールが最後の砦になる

次は、実際の Gemini で動かしたときにモデルがどれくらいの頻度で JSON を壊すのか、進捗なし停止がどのくらい効くのかを見てみたいと思っています。

## 参考

- [Agent SDK の概要](https://code.claude.com/docs/ja/agent-sdk/overview)
- [エージェントループの仕組み](https://code.claude.com/docs/ja/agent-sdk/agent-loop)
- [Orchestrate subagents at scale with dynamic workflows](https://code.claude.com/docs/en/workflows)
- [A harness for every task: dynamic workflows in Claude Code](https://claude.com/blog/a-harness-for-every-task-dynamic-workflows-in-claude-code)
- [ADK Dynamic workflows](https://adk.dev/graphs/dynamic/)
- [google/adk-go](https://github.com/google/adk-go)
- [google.golang.org/adk/v2/workflow](https://pkg.go.dev/google.golang.org/adk/v2/workflow)
- [ADK Go 2.0 のグラフワークフローを読んで SRE Agent への応用を考える](/post/adk-go-2/)
- [jedipunkz/adk-playground — investigation-loop](https://github.com/jedipunkz/adk-playground/tree/main/investigation-loop)（この記事で書いたコード）
