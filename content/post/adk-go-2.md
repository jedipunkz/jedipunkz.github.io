---
title: "ADK Go 2.0 のグラフワークフローを読んで SRE Agent への応用を考える"
description: "Google が公開した ADK Go 2.0 の新しいグラフワークフローエンジンを公式サンプルコードを実際に動かしながら読み解き、Datadog MCP・Cloud Run・Slack を使ったインシデント対応エージェントに応用してみます"
date: 2026-07-31T12:00:00+09:00
Categories: ["AI", "Go", "SRE", "Agent"]
draft: false
---

こんにちは。[ジェダイパンくず☁️](https://x.com/jedipunkz) です。

2026年6月30日に [ADK (Agent Development Kit) for Go の 2.0](https://developers.googleblog.com/announcing-adk-go-20/) がリリースされました。目玉は「グラフベースのワークフローエンジン」で、エージェントアプリケーションを**ノードとエッジのグラフとして記述する**という方向に大きく舵を切っています。

自分がこのリリースで一番興味を持ったのは、公式サンプルの `examples/workflow/routing/llm/` に書かれていたこのコメントでした。

```go
// This is the canonical "LLM as the brain, engine does the routing" pattern.
```

LLM は「脳」であって「ルータ」ではない、分岐そのものはエンジン（＝決定的なコード）が担う、という設計思想です。これは SRE のインシデント対応エージェントを考える上でかなり本質的な話に見えたので、リポジトリを実際に clone して公式サンプルを読み、さらに自分でインシデントトリアージのワークフローを書いてビルド・実行するところまでやってみました。観測は Datadog の公式 MCP サーバ、デプロイ先は Google Cloud Run、承認は Slack という構成にしています。

この記事は以下の三本柱で構成します。

1. ADK の基本（そもそも ADK でエージェントをどう書くのか）
2. 2.0 の新機能（グラフワークフローエンジンを中心に）
3. SRE Agent における応用（Datadog MCP / Cloud Run / Slack で実際に動くコードを書いてみた）

なお、記事中のコードはすべて [google/adk-go](https://github.com/google/adk-go) の実際のサンプルか、自分で書いて `go vet` とビルド・実行を通したものです。

## ADK の基本

### インストール

2.0 からモジュールパスが `google.golang.org/adk/v2` に変わりました。Go 1.25 以上が必要です。

```bash
go get google.golang.org/adk/v2
```

### 最小のエージェント

ADK の世界観は「エージェント = モデル + 指示 + ツール」です。公式の `examples/quickstart/main.go` がその最小形です。

```go
model, err := gemini.NewModel(ctx, "gemini-flash-latest", &genai.ClientConfig{
	APIKey: os.Getenv("GOOGLE_API_KEY"),
})
if err != nil {
	log.Fatalf("Failed to create model: %v", err)
}

a, err := llmagent.New(llmagent.Config{
	Name:        "weather_time_agent",
	Model:       model,
	Description: "Agent to answer questions about the time and weather in a city.",
	Instruction: "Your SOLE purpose is to answer questions about the current time and weather in a specific city. You MUST refuse to answer any questions unrelated to time or weather.",
	Tools: []tool.Tool{
		geminitool.GoogleSearch{},
	},
})
if err != nil {
	log.Fatalf("Failed to create agent: %v", err)
}

config := &launcher.Config{
	AgentLoader: agent.NewSingleLoader(a),
}

l := full.NewLauncher()
if err = l.Execute(ctx, config, os.Args[1:]); err != nil {
	log.Fatalf("Run failed: %v\n\n%s", err, l.CommandLineSyntax())
}
```

登場人物を整理すると以下です。

| 要素 | 役割 |
|------|------|
| `model` | LLM のバックエンド。Gemini 以外も差し替え可能 |
| `llmagent.Config.Instruction` | いわゆるシステムプロンプト |
| `Tools` | エージェントが呼べる関数群 |
| `launcher` | CLI (`console`)、Web UI、REST サーバなどの実行形態を提供するランナー |

`full.NewLauncher()` は便利で、同じバイナリを `console` で起動すればターミナル対話、`web` で起動すれば Dev UI が立ち上がります。エージェントのロジックと実行形態が分離されているのが Go らしいところです。

### ツールを自分で書く

ツールは Go の関数をそのまま登録できます。`examples/tools/multipletools/main.go` から抜粋します。

```go
type Input struct {
	LineCount int `json:"lineCount"`
}
type Output struct {
	Poem string `json:"poem"`
}
handler := func(ctx agent.Context, input Input) (Output, error) {
	return Output{
		Poem: strings.Repeat("A line of a poem,", input.LineCount) + "\n",
	}, nil
}
poemTool, err := functiontool.New(functiontool.Config{
	Name:        "poem",
	Description: "Returns poem",
}, handler)
```

入出力の JSON Schema は Go の型から自動生成されます。ここが Python 版と比べたときの Go 版の気持ちよさで、ツールの引数スキーマを手で書く必要がありません。

ここまでが 1.x 系から変わらない「ADK の基本」です。ここから 2.0 の話に入ります。

## 2.0 の新機能

### グラフワークフローエンジン

2.0 の中心は `workflow` パッケージです。アプリケーションを「ノードをエッジでつないだグラフ」として宣言し、スケジューラが実行します。

最小の例が `examples/workflow/basic/main.go` です。

```go
// 1. Define functions for nodes
upperFn := func(ctx agent.Context, input string) (string, error) {
	if input == "" {
		return "No input received", nil
	}
	return strings.ToUpper(input), nil
}

suffixFn := func(ctx agent.Context, input string) (string, error) {
	return input + " IS AWESOME!", nil
}

// 2. Create Nodes
nodeConfig := workflow.NodeConfig{
	RetryConfig: workflow.DefaultRetryConfig(),
}
nodeA := workflow.NewFunctionNode("upper", upperFn, nodeConfig)
nodeB := workflow.NewFunctionNode("suffix", suffixFn, nodeConfig)

// 3. Define flow (Edges)
edges := workflow.Chain(workflow.Start, nodeA, nodeB)

// 4. Create Workflow Agent
myWorkflow, err := workflowagent.New(workflowagent.Config{
	Name:        "simple_sequence_workflow",
	Description: "Converts string to uppercase and appends a suffix",
	Edges:       edges,
})
```

注目したいのは `NewFunctionNode` がジェネリクスで、**ノードの入出力の型が Go の関数シグネチャからそのまま推論される**点です。`upperFn` は `string` を受けて `string` を返すので、このノードの入力型・出力型は `string` になります。グラフのつなぎ間違いがある程度型で守られます。

このワークフロー全体が `workflowagent.New` で「1つのエージェント」になるので、`launcher` に渡す使い方は quickstart とまったく同じです。

### ノードの種類

2.0 では用途別にノードのコンストラクタが用意されています。実際にリポジトリの `workflow/` 配下を grep すると以下が確認できます。

| コンストラクタ | 用途 |
|---------------|------|
| `NewFunctionNode` | Go の関数をノード化。型推論が効く |
| `NewEmittingFunctionNode` | イベントを自分で emit できる。ストリーミングや分岐、HITL に使う |
| `NewAgentNode` | `LlmAgent` などのエージェントをノード化 |
| `NewToolNode` | ツールをそのままグラフの1ステップにする |
| `NewJoinNode` | fan-in の同期バリア |
| `NewDynamicNode` | 実行順序を Go のコードとして書く動的オーケストレーション |
| `NewWorkflowNode` | サブワークフローを1ノードとして埋め込む |
| `NewParallelWorker` | リスト入力に対して並列に実行 |

### ルーティング：LLM に全部やらせない

ここが個人的に一番刺さった部分です。冒頭に挙げた `examples/workflow/routing/llm/main.go` を見ていきます。

このサンプルは、ユーザの発言を question / statement / exclamation に分類して、それぞれ別のハンドラに振り分けます。LLM に渡されるプロンプトはこれだけです。

```go
const classifierInstruction = `Classify the user's message into one of three categories:
- "question": ends with '?' or asks for information
- "exclamation": expresses strong emotion, often ends with '!'
- "statement": a neutral declarative sentence

Answer with EXACTLY one word, lowercase, no punctuation: question, exclamation, or statement.`
```

LLM の仕事は「1単語を返す」ことだけです。**どこに分岐するかは LLM に決めさせません**。分岐はこの下流のノードが決定的に行います。

```go
// routeByClassification turns the classifier's one-word output into a
// routing event; returning nil suppresses the default terminal event.
func routeByClassification(ctx agent.Context, input any, emit func(*session.Event) error) (any, error) {
	// Normalise defensively in case the LLM ignored the one-word
	// instruction; off-script replies fall through to "statement".
	category := strings.TrimRight(strings.ToLower(strings.TrimSpace(fmt.Sprint(input))), ".")
	if category != "question" && category != "exclamation" && category != "statement" {
		category = "statement"
	}
	ev := session.NewEvent(ctx, ctx.InvocationID())
	ev.Routes = []string{category}
	if err := emit(ev); err != nil {
		return nil, err
	}
	return nil, nil
}
```

そしてグラフのエッジ側で、ルート値と遷移先の対応を静的に宣言します。

```go
edges := workflow.Concat(
	workflow.Chain(workflow.Start, classifyNode, routeNode),
	[]workflow.Edge{
		{From: routeNode, To: question, Route: workflow.StringRoute("question")},
		{From: routeNode, To: statement, Route: workflow.StringRoute("statement")},
		{From: routeNode, To: exclamation, Route: workflow.StringRoute("exclamation")},
	},
)
```

この構造の何が良いかというと、

- LLM が指示を無視して "this is a question" などと返しても、`routeByClassification` の正規化で `statement` にフォールバックする。**壊れ方が予測可能**になる
- グラフを見れば「起こりうる遷移の全集合」が読める。LLM が勝手に未知の状態に飛ぶことがない
- ルーティングのロジックが Go の関数なので、LLM 抜きで単体テストできる

ちなみに `Route` インタフェースの実装はこれだけです。エッジは「イベントに付いた `Routes` に自分の値が入っているか」しか見ません。

```go
type Route interface {
	Matches(event *session.Event) bool
}

func matchRoute(routeValue string, event *session.Event) bool {
	for _, v := range event.Routes {
		if v == routeValue {
			return true
		}
	}
	return false
}
```

`StringRoute` のほかに `IntRoute`、`BoolRoute`、複数値をまとめて受ける `MultiRoute[T]` があります。`examples/workflow/routing/int/` ではサイコロの目 1〜10 を `MultiRoute[int]{1, 2, 3}` のようにレンジで振り分けています。

そして重要なのは、**分類そのものに LLM が要らないなら使わなくていい**ということです。同じ構造で LLM を完全に外した `examples/workflow/routing/string/` が用意されていて、`classifyAndRoute` の中身は単なる Go の switch です。

```go
trimmed := strings.TrimSpace(msg)
switch {
case strings.HasSuffix(trimmed, "?"):
	return "question"
case strings.HasSuffix(trimmed, "!"):
	return "exclamation"
default:
	return "statement"
}
```

グラフの形は LLM 版とまったく同じで、判断主体だけが差し替わっています。「この判断は LLM が要るのか、要らないのか」をノード単位で選べる。これが 2.0 の設計で一番効いている部分だと思います。

### fan-out / fan-in（並列とバリア）

`examples/workflow/complex/main.go` は3つのリサーチャーエージェントを並列に走らせ、`JoinNode` で待ち合わせて統合します。

```
START ─┬─> RenewableEnergyResearcher ─┐
       ├─> EVResearcher ──────────────┼─> gather ─> format ─> SynthesisAgent
       └─> CarbonCaptureResearcher ───┘   (Join)   (func)      (LLM)
```

ノードのつなぎ方は `EdgeBuilder` の fluent API で書けます。

```go
eb := workflow.NewEdgeBuilder()
eb.AddFanOut(workflow.Start, renewableNode, electricVehicleNode, carbonNode)
eb.AddFanIn(gatherNode, renewableNode, electricVehicleNode, carbonNode)
eb.Add(gatherNode, formatNode)
eb.Add(formatNode, synthNode)
```

`JoinNode` は全ての先行ノードが終わってから1回だけ発火し、後続に `map[ノード名]出力` を渡します。受け取る側はこうなります。

```go
func formatSummaries(_ agent.Context, gathered map[string]any) (string, error) {
	sections := []struct{ label, key string }{
		{"Renewable Energy", renewableResearcher},
		{"Electric Vehicles", electricVehicleResearcher},
		{"Carbon Capture", carbonResearcher},
	}
	// ...
}
```

サンプルのコメントに「マップを range せず固定スライスを回すことでプロンプトを決定的に保つ」と書かれているのが細かいですが良いです。並列実行の結果をそのまま LLM に食わせると順序が非決定になるので、ここも決定的なコードで整形しています。

### Human-in-the-Loop

2.0 では任意のノードが実行を止めて人間の入力を要求できます。しかもこの中断はプロセス再起動を跨いで復帰できます（セッション履歴から再構成される）。

再開モードは2種類あります。

- **handoff**: 人間の回答が次のノードの入力として流れる（`RerunOnResume: &false`。nil の場合もエンジンは現状 handoff として扱う）
- **re-entry**: 中断したノードが最初から再実行され、回答は `ResumedInput` から読める（`RerunOnResume: &true`）

re-entry パターンが `examples/workflow/hitl_rerun/main.go` です。`ResumeOrRequestInput` が「1回目は質問して中断、2回目は回答を返す」を1つの呼び出しにまとめてくれます。

```go
rerun := true
greet := workflow.NewEmittingFunctionNode[any, any]("greet",
	func(nc agent.Context, _ any, emit func(*session.Event) error) (any, error) {
		reply, err := workflow.ResumeOrRequestInput(nc, emit, session.RequestInput{
			InterruptID: "ask_name-" + nc.InvocationID(),
			Message:     "What's your name?",
		})
		if err != nil {
			return nil, err
		}

		name, _ := reply.(string)
		if name == "" {
			name = "stranger"
		}
		return fmt.Sprintf("Hello, %s!", name), nil
	},
	workflow.NodeConfig{RerunOnResume: &rerun},
)
```

実装は拍子抜けするほど素直です。

```go
func ResumeOrRequestInput(ctx agent.Context, emit func(*session.Event) error, req session.RequestInput) (any, error) {
	if reply, ok := ctx.ResumedInput(req.InterruptID); ok {
		return reply, nil
	}
	if err := emit(NewRequestInputEvent(ctx, req)); err != nil {
		return nil, err
	}
	return nil, ErrNodeInterrupted
}
```

`InterruptID` に `nc.InvocationID()` を混ぜているのがポイントで、これは同一実行内では安定して回答を対応付けられる一方、実行ごとにはユニークになるためです。ここを固定文字列にすると Dev UI が「その ID はもう回答済み」と判断して次回以降プロンプトを出さなくなります。ソースのコメントにわざわざ書いてあるので、実際に踏んだ人がいるのでしょう。

### 動的オーケストレーション

グラフを静的に宣言するのではなく、実行順序を Go のコードとして書きたい場合は `NewDynamicNode` を使います。

```go
myWorkflow := workflow.NewDynamicNode[string, string]("greeter_workflow",
	func(nc agent.Context, in string, _ func(*session.Event) error) (string, error) {
		return workflow.RunNode[string](nc, greeterNode, in)
	},
	workflow.NodeConfig{},
)
```

`workflow.RunNode` で任意のノードをその場で呼べます。for ループや if 分岐をそのまま書けるので、静的グラフでは表現しづらい制御フローはこちらに逃がせます。動的ノードは既定で `RerunOnResume=&true` なので、HITL と組み合わせるとオーケストレータの本体が頭から再実行され、回答は `nc.ResumedInput(...)` で拾う形になります。

### リトライとタイムアウト

`NodeConfig` にスケジューラレベルの信頼性設定が入りました。

```go
type NodeConfig struct {
	ParallelWorker bool
	RerunOnResume  *bool
	WaitForOutput  *bool
	RetryConfig    *RetryConfig
	Timeout        time.Duration
	EmitsOwnSpan   bool
}
```

`RetryConfig` は `MaxAttempts` / `InitialDelay` / `MaxDelay` / `BackoffFactor` / `Jitter` / `ShouldRetry` を持つフラットな構造体です。推奨は `DefaultRetryConfig()` を起点に上書きする書き方で、構造体リテラルで作ると未設定フィールドがゼロ値（＝リトライなし）になるので注意、とドキュメントに明記されています。

```go
rc := workflow.DefaultRetryConfig()
rc.MaxAttempts = 10
cfg := workflow.NodeConfig{RetryConfig: rc}
```

### そのほかの改善と破壊的変更

グラフエンジン以外では以下が入っています。

- **`agent.Context` の統一**: これまで別物だった `ToolContext` と `CallbackContext` が1つの `agent.Context` に統合されました
- **LlmAgent のモード**: `ModeChat` / `ModeTask` / `ModeSingleTurn` の3つ。既定値はサブエージェントとしては `ModeChat`、ワークフローのノードとしては `ModeSingleTurn` になります。つまり `NewAgentNode` で包んだ LLM エージェントは、チャット履歴ではなく**先行ノードの出力を入力として消費する**モードになります
- **テレメトリの一貫性**: 単体エージェントでもグラフでも同じ span ツリーになる

破壊的変更としては [README-v2.md](https://github.com/google/adk-go/blob/main/README-v2.md) に以下が挙がっています。

1. モジュールパスが `google.golang.org/adk/v2` に変更
2. `session.NewEvent` が第1引数に `context.Context` を要求するようになった

```go
// Before
ev := session.NewEvent(ctx.InvocationID())
// After
ev := session.NewEvent(ctx, ctx.InvocationID())
```

これはイベント ID とタイムスタンプを `platform` パッケージ経由で取得するようになったためで、`platform.WithTimeProvider` などを ctx に載せることで**決定的でリプレイ可能なイベント**を作れるようになっています。ワークフローエンジンが再開可能である以上、必然の変更に見えます。

3. コンテキスト統合に伴い、テストのモックが壊れる。手で足りないメソッドを生やす代わりに `agent.StrictContextMock` を埋め込む方法が推奨されています。未実装メソッドを呼ぶと黙ってゼロ値を返さず panic するので、想定外の呼び出しがテストで顕在化します

```go
type fakeContext struct {
	agent.StrictContextMock
}

var _ agent.Context = (*fakeContext)(nil)
```

## SRE Agent における応用

ここからが本題です。前置きした「LLM は脳、ルーティングはエンジン」という思想が、SRE のインシデント対応エージェントにどう効くのかを考えます。

### なぜこの分割が SRE で効きそうなのか

以前 [Google が提唱する AI in SRE とは何か](/post/ai-sre-google/) という記事で、SRE 自律性の5段階モデル（L0〜L4）を紹介しました。L2 は「AI が実行前に人間の明示的承認を必要とする」段階、L3 は「十分に定義されたシナリオで AI が独立実行する」段階です。

このモデルを実装に落とすときに困るのが、**「十分に定義されたシナリオ」をどこに書くのか**という問題です。全部プロンプトに書いて LLM に任せると、同じアラートで毎回違う判断が出うるし、「このエージェントは何をしうるのか」をレビューできないし、昇格ゲート（L2→L3）の判定に必要な統計も取れません。

ADK Go 2.0 のグラフは、この境界を**構造として**引けます。LLM は大量の非構造データを読んで所見を書き、Go のコードがどの Runbook を実行するか決める。実行しうる操作の全集合はグラフのエッジとして静的に宣言されているので、コードレビューで確認できます。

### インシデントトリアージのワークフローを書いてみた

観測は Datadog、デプロイ先は Google Cloud Run、承認は Slack という構成で書いてみました。以下のコードは `go vet` とビルドを通しています。

```mermaid
flowchart LR
  S((START)) --> M[datadog_metrics]
  S --> L[datadog_logs]
  S --> D[cloudrun_revisions]
  M --> G[gather<br/>JoinNode]
  L --> G
  D --> G
  G --> E[build_evidence<br/>Go]
  E --> X[diagnose<br/>LLM: 仮説を3つ]
  X --> C[decide_action<br/>Go: 最終判断]
  C -->|rollback| R[rollback<br/>Slack 承認]
  C -->|scale_out| SC[scale_out]
  C -->|escalate| P[page_oncall]
```

**LLM ノード `diagnose` は分岐の手前にいるが、分岐の判断材料そのものではない**、というのがこのグラフの読みどころです。

#### 収集：Datadog 公式 MCP をグラフのノードから直接呼ぶ

Datadog は[マネージドのリモート MCP サーバ](https://docs.datadoghq.com/mcp_server/)を提供していて、`get_datadog_metric` や `analyze_datadog_logs` といったツールが使えます。当初は Datadog の Go SDK を直接叩いていたのですが、MCP に寄せたら SDK 依存がまるごと不要になりました。

ここで悩ましいのは、MCP は本来「LLM にツールを使わせる」ための仕組みだという点です。素直に `llmagent.Config.Tools` に渡すと、いつどのツールをどんな引数で呼ぶかは LLM 任せになります。それはこの記事で書いてきた設計方針と正面から衝突します。

結論から言うと、**MCP ツールを LLM に渡さずグラフのノードから直接呼ぶ**ことができました。ADK の MCP ツールは `Run(ctx agent.Context, args any) (map[string]any, error)` を実装しているので、そこを直接叩けばいいだけです。

```go
const datadogMCPEndpoint = "https://mcp.datadoghq.com/v1/mcp"

// これを LlmAgent に渡すと「LLM が好きに Datadog を叩く」形になるが、
// 今回は渡さない。グラフのノードから直接呼ぶ。
func newDatadogToolset() (tool.Toolset, error) {
	return mcptoolset.New(mcptoolset.Config{
		Endpoint: datadogMCPEndpoint,
		Auth:     auth.StaticToken(os.Getenv("DD_MCP_TOKEN")),
	})
}

// callMCP は toolset から名前でツールを引き当てて、その場で実行する。
// LLM は一切関与しない。呼ぶツールも引数も Go のコードが決める。
func callMCP(ctx agent.Context, ts tool.Toolset, name string, args map[string]any) (map[string]any, error) {
	tools, err := ts.Tools(ctx)
	if err != nil {
		return nil, fmt.Errorf("listing datadog mcp tools: %w", err)
	}
	for _, t := range tools {
		if t.Name() != name {
			continue
		}
		r, ok := t.(runnableTool) // Run(agent.Context, any) (map[string]any, error)
		if !ok {
			return nil, fmt.Errorf("mcp tool %q is not directly runnable", name)
		}
		return r.Run(ctx, args)
	}
	return nil, fmt.Errorf("datadog mcp tool %q not found", name)
}
```

あとは普通の `FunctionNode` の中から呼ぶだけです。

```go
out, err := callMCP(ctx, ts, "get_datadog_metric", map[string]any{
	"query": fmt.Sprintf("sum:trace.http.request.errors{service:%s}.as_rate()", service),
	"from":  from,
	"to":    to,
})
```

MCP 経由にすると認証も接続管理も ADK 側が持ってくれる一方、戻り値が `map[string]any` になって型が失われます。なので**ノードの境界で型付き構造体に落とし**、以降は `Evidence` として扱う形にしました。ADK には `workflow.NewToolNode` というツールをそのままノード化するコンストラクタもあり、生の出力を素通しでよければそちらのほうが短く書けます。今回は「証拠は型で持ちたい」ので `FunctionNode` の中で呼ぶ形を選びました。

なお、各ツールの引数スキーマはサーバが公開しているものに従う必要があります。`Toolset.Tools()` で取れる `Declaration()` を起動時にダンプして確認するのが確実です。

デプロイ情報は Cloud Run のリビジョン一覧から取ります。最新リビジョンの作成時刻から「デプロイ後何分か」、2番目から「ロールバック先」を得ます。この2つが後の判断の要になります。

```go
resp, err := run.NewProjectsLocationsServicesRevisionsService(svc).List(parent).Context(ctx).Do()
// resp.Revisions は作成時刻の新しい順。[0] が現行、[1] がロールバック先。
```

3つの収集を `JoinNode` で待ち合わせ、`build_evidence` で1つの `Evidence` にまとめます。ここで **session state に生データを保存しておく**のが後で効きます。

```go
// 決定ノードが後から読めるように state に置く。LLM の出力ではなく
// この生データが、あとで分岐を決める唯一の根拠になる。
if err := ctx.State().Set(stateEvidence, ev); err != nil {
	return "", fmt.Errorf("saving evidence: %w", err)
}
```

#### 診断：仮説を3つ立てさせる

人間の SRE がインシデント時にやっていることを言語化すると、「証拠を見て、ありうる原因をいくつか思い浮かべて、証拠と照らして絞り込む」という作業になります。いきなり結論を1つ出させるより、明示的に複数の仮説を立てさせてから絞り込ませるほうが、思考の過程が残るぶん人間がレビューしやすい。

`llmagent.Config` には `OutputSchema` があるので、出力形式を強制できます。

```go
"hypotheses": {
	Type:     genai.TypeArray,
	MinItems: genai.Ptr(int64(3)),
	MaxItems: genai.Ptr(int64(3)),
	Items: &genai.Schema{
		Type: genai.TypeObject,
		Properties: map[string]*genai.Schema{
			"id":    {Type: genai.TypeString},
			"title": {Type: genai.TypeString},
			"category": {
				Type: genai.TypeString,
				Enum: []string{catBadDeploy, catResource, catDependency, catUnknown},
			},
			"confidence": {Type: genai.TypeNumber},
			"evidence":   {Type: genai.TypeString},
		},
		Required: []string{"id", "title", "category", "confidence", "evidence"},
	},
},
```

`category` を enum で縛っているのが地味に重要で、これによって LLM の出力が**下流の Go コードが理解できる語彙の中に必ず収まります**。自由記述だと後段で文字列マッチする羽目になり、routing/llm サンプルと同じ「正規化とフォールバック」の問題が発生します。スキーマで縛れるならそちらのほうが確実です。

プロンプト側では3つ立てて最後に絞り込む手順を明示し、最後にこう書いています。

```
Do NOT propose a remediation action. The runbook is chosen by the workflow, not by you.
```

**対処の提案は LLM の仕事ではない**。LLM がやるのは「原因の候補を3つ挙げて1つに絞る」ところまでです。

#### 判断：ポリシー判定とその検証、という二段構え

決定ノードが全体で一番重要な部分です。1段目で証拠だけを見た決定的なポリシー判定を行い、2段目で LLM の仮説を「検証」として使います。

```go
// policyRoute は証拠だけを見て候補となる対処を決める。LLM は一切関与しない。
// 併せて「その対処が前提としている障害カテゴリ」を返す。
func policyRoute(ev Evidence) (route, assumedCategory string) {
	switch {
	case ev.Deploy.MinutesSinceDeploy <= 30 && ev.Deploy.PreviousRevision != "" && ev.Metrics.ErrorRate > 0.05:
		return routeRollback, catBadDeploy
	case ev.Metrics.CPUSaturation > 0.85 && ev.Metrics.ErrorRate <= 0.05:
		return routeScaleOut, catResource
	default:
		return routeEscalate, catUnknown
	}
}
```

```go
// 1段目：証拠だけを見た決定的なポリシー判定。
route, assumed := policyRoute(ev)

// 2段目：LLM の仮説を「検証」に使う。ポリシーの前提と最有力仮説が
// 食い違う、あるいは確信度が低い場合は自動実行せず人間に上げる。
if top, ok := d.Top(); ok && route != routeEscalate {
	switch {
	case top.Category != assumed:
		route = routeEscalate
		reason = fmt.Sprintf("policy assumed %s but top hypothesis is %s", assumed, top.Category)
	case top.Confidence < minTopConfidence:
		route = routeEscalate
		reason = fmt.Sprintf("top hypothesis confidence %.2f below %.2f", top.Confidence, minTopConfidence)
	}
}

out := session.NewEvent(ctx, ctx.InvocationID())
out.Routes = []string{route}
out.Output = ev
```

診断 JSON のパースに失敗した場合や `topId` がどの仮説にも一致しない場合も `escalate` に落としています。

LLM の出力が影響しうるのは **「自動実行するか、人間に上げるか」の一方向だけ**です。LLM が「新しい対処を思いつく」ことはできませんし、LLM が壊れても最悪 `escalate`（人を呼ぶ）に倒れます。

グラフの組み立ては `EdgeBuilder` で書きます。`AddRoutes` を使うとルート値と遷移先の対応がマップで一望できます。

```go
eb := workflow.NewEdgeBuilder()
eb.AddFanOut(workflow.Start, metricsNode, logsNode, deploysNode)
eb.AddFanIn(gatherNode, metricsNode, logsNode, deploysNode)
eb.Add(gatherNode, evidenceNode)
eb.Add(evidenceNode, diagnoseNode)
eb.Add(diagnoseNode, decideNode)
eb.AddRoutes(decideNode, map[string]workflow.Node{
	routeRollback: rollbackNode,
	routeScaleOut: scaleNode,
	routeEscalate: escalateNode,
})
```

### 承認を Slack で取る

ロールバックは本番のトラフィックを動かすので、L2（実行前に人間の承認が必要）として承認を挟みます。ただし実際のインシデント対応は Slack で回っているので、承認もそこで完結させたい。

`cmd/launcher/console/hitl.go` を読むと、ADK の中断・再開が汎用的な形に落ちていることが分かります。

1. ノードが `workflow.NewRequestInputEvent` を emit すると、`adk_request_input`（= `workflow.WorkflowInputFunctionCallName`）という名前の **FunctionCall パート**を持つイベントが流れ、ワークフローが停止する
2. **同じ ID を持つ FunctionResponse** をユーザメッセージとして `Runner.Run` に流し込むと、待っていたノードが再開する

コンソールランチャーがやっているのは「1 を標準出力に出す」「標準入力を 2 に変換する」だけです。ここを Slack に差し替えます。中断側は Block Kit のボタンを投稿し、その `value` に「どのセッションのどの中断か」を JSON で埋め込んでおきます。再開側は Slack の Interactivity Request URL でそれを受け取り、署名を検証してから `FunctionResponse` に変換します。

```go
msg := &genai.Content{
	Role: string(genai.RoleUser),
	Parts: []*genai.Part{{
		FunctionResponse: &genai.FunctionResponse{
			// ID は中断時の InterruptID と一致させる。ADK は
			// この ID で待機中のノードを引き当てる。
			ID:   ref.InterruptID,
			Name: workflow.WorkflowInputFunctionCallName,
			Response: map[string]any{
				"payload": map[string]any{
					"answer":   ref.Answer,
					"approver": approver,
				},
			},
		},
	}},
}

// あとは中断していたセッションに流し込むだけ。
for ev, err := range s.runner.Run(ctx, ref.UserID, ref.SessionID, msg, agent.RunConfig{}) { /* ... */ }
```

ノード側で1つだけ注意点があります。re-entry モードではノードが頭から再実行されるので、素直に書くと承認依頼が Slack に二重投稿されます。`ResumedInput` で「もう回答済みか」を見て弾きます。

```go
// 1回目は Slack に承認を投げてから中断する。2回目（再開後）は
// ResumedInput から回答が返るので Slack には投げない。
if _, answered := ctx.ResumedInput(interruptID); !answered {
	if err := approver.Ask(ctx.Session().ID(), ctx.Session().UserID(), interruptID, headline, details); err != nil {
		return "", err
	}
}

reply, err := workflow.ResumeOrRequestInput(ctx, emit, session.RequestInput{
	InterruptID: interruptID,
	Message:     "...",
})
```

#### ハマった点：`payload` は単独キーにする

実際に動かして引っかかったので書いておきます。最初 `Response` をこう書いていました。

```go
Response: map[string]any{
	"payload":  ref.Answer,   // "yes"
	"approver": approver,     // "jedipunkz"
},
```

ワークフローは再開するのですが、ノード側で `reply.(string)` が外れて `answer != "yes"` となり、**承認したのに `declined` に倒れました**。原因は `workflow/persistence.go` の `unwrapResponse` です。

```go
// A sole single-key wrapper — {"result": v} (adk-python),
// {"response": v} or {"payload": v} (adk-go) — is unwrapped
func unwrapResponse(data map[string]any) any {
	if len(data) != 1 {
		return data
	}
	// ...
}
```

**キーが1個のときしかアンラップしない**仕様でした。2キー以上にすると map がそのままノードに渡り、型アサーションが静かに外れます。エラーにならないのが厄介で、承認したのに拒否扱いになる。承認者名も一緒に運びたい場合は上のコードのように `payload` の中に入れ子にします。

なお Slack で承認を取る以上、`console` の対話ループは使いません。アラート受信（`/alerts`）とボタン押下（`/slack/interactions`）の2つの入口を持つ常駐サーバとして `runner.New` を直接使います。セッションサービスも `session.InMemoryService()` ではなく `session/database` を使います。ADK の中断がプロセス再起動を跨いで復帰できるのは永続化されている場合の話で、逆に言えば永続セッションさえあれば**深夜3時に承認待ちのままプロセスが死んでも、朝に誰かがボタンを押した時点で続きから再開できる**。承認待ちが数時間になりうる SRE の HITL では、これはかなり大きい性質だと思います。

### 動作確認

Datadog と Slack の実アカウントがないと通しでは動かせないので、設計の要である「FunctionResponse を送れば中断が再開するのか」だけを切り出して検証しました。ワークフローを1ノードにして、Slack ハンドラが送るのと同じ形の `FunctionResponse` を `Runner.Run` に流し込みます。

```
PAUSED  name=adk_request_input id=approve_rollback-e-5f2626af-... message=Roll back checkout-api?
RESUMED output="rolled back, approved by jedipunkz"
OK: FunctionResponse-by-interrupt-ID resumes the paused node
```

中断 ID をボタンに埋めて、押されたら同じ ID の `FunctionResponse` を投げ返す。Slack 連携で書くべきコードは本質的にこれだけでした。ADK が「中断は FunctionCall、再開は FunctionResponse」という汎用的な形に落としてくれているので、PagerDuty でも自前の Web UI でも同じ構造で書けるはずです。

### 応用を考えるうえで気になっている点

いくつか、まだ自分の中で答えが出ていないところを正直に書いておきます。

**閾値をどこで管理するか。** 上の `decideAction` は閾値がハードコードされています。実際には「サービスごとにエラー率の閾値が違う」「エラーバジェットの消費速度で判断したい」という話になるので、ポリシーは外部設定に出したくなります。ただし外部設定にすると今度は「レビューできる」という利点が薄れる可能性があり、どこで線を引くかは考えどころです。

**「仮説が一致したら実行してよい」と言えるのか。** 今回の `decideAction` は、ポリシーの前提と LLM の最有力仮説が一致したときだけ自動実行に進みます。安全側に倒れる設計にはなっていますが、LLM の仮説が「証拠から素直に導ける結論」をなぞっているだけなら、検証としてはほとんど機能していない可能性があります（ポリシーも仮説も同じ証拠を見ているので、相関して当然とも言える）。本当に検証として効いているかは、過去インシデントを流して「ポリシーは rollback と言ったが LLM が別カテゴリを挙げた」ケースがどれだけ出るかを測らないと分かりません。ここは L2→L3 の昇格判断に使う統計とセットで見るべきところだと思っています。

**確信度の閾値をどう決めるか。** `minTopConfidence = 0.6` も完全に勘です。LLM が返す confidence がキャリブレートされている保証はどこにもないので、この数字に意味を持たせるには実データでの分布を見る必要があります。

**動的ノードとのバランス。** インシデント対応は「調べて、分からなかったらもう少し調べる」という反復が本質なので、完全に静的なグラフでは表現しきれない部分があります。`NewDynamicNode` で調査ループを書き、確定した対処だけを静的グラフに戻す、というハイブリッドが現実解な気がしていますが、そうすると動的ノードの中身が結局ブラックボックスになるジレンマがあります。

このあたりは実際に運用してみないと分からないので、もう少し手を動かしてみるつもりです。

## まとめ

ADK Go 2.0 のグラフワークフローエンジンを、公式サンプルを読みながら追いかけてみました。

- ADK の基本は「モデル + 指示 + ツール」で、Go の型からツールのスキーマが自動生成されるのが気持ちいい
- 2.0 の中心はグラフワークフローエンジン。ノードとエッジで書き、fan-out / fan-in / 条件分岐 / HITL / リトライがフレームワーク側の機能になった
- ルーティングは LLM ではなくエンジンが行う。LLM は分類結果を1単語返すだけで、どこに飛ぶかはエッジの静的な宣言で決まる
- この分割は SRE のインシデント対応エージェントにそのまま効きそう。「LLM は仮説を3つ立てるところまで、Go が最終判断」に分けると、実行しうる操作がレビューでき、判断が再現でき、自律性レベルがノード設定として表現できる
- HITL は「中断は FunctionCall、再開は同じ ID の FunctionResponse」という汎用的な形なので、Slack のボタンに橋渡しするコードはごく短い。永続セッションと組み合わせると、承認待ちのままプロセスが死んでも復帰できる
- MCP ツールは LLM に渡さずグラフのノードから直接呼べる。`Run(ctx, args)` を叩くだけで、呼ぶツールも引数も Go のコードが決められる

「LLM に全部任せない」というのは一見後退に見えますが、本番環境に手を入れるエージェントを作る文脈では、むしろこれが前に進むための条件だと思います。LLM に任せる範囲を絞れば絞るほど、その範囲について統計が取れて、安心して自律度を上げられる。ADK Go 2.0 のグラフは、その「絞る」作業をフレームワークの構造として支援してくれている、というのが読んでみた感想でした。

## 参考

- [Announcing ADK Go 2.0](https://developers.googleblog.com/announcing-adk-go-20/)
- [google/adk-go](https://github.com/google/adk-go)
- [ADK Go v2.0.0 Release](https://github.com/google/adk-go/releases/tag/v2.0.0)
- [ADK Go 2.0 migration guide (README-v2.md)](https://github.com/google/adk-go/blob/main/README-v2.md)
- [ADK Documentation](https://google.github.io/adk-docs/)
- [Google が提唱する AI in SRE とは何か](/post/ai-sre-google/)
- [Datadog MCP Server](https://docs.datadoghq.com/mcp_server/)
- [Datadog MCP Server Tools](https://docs.datadoghq.com/mcp_server/tools/)
- [Cloud Run Admin API v2](https://cloud.google.com/run/docs/reference/rest)
- [Slack: Handling user interaction in your Slack apps](https://api.slack.com/interactivity/handling)
