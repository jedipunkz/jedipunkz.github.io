---
title: "agentgateway で A2A・MCP・LLM のトラフィックを 1 つの Gateway に通す"
description: "AI エージェントの通信 (エージェント間の A2A、tool 呼び出しの MCP、LLM API) を OSS の agentgateway に通し、Agent Card の書き換え、JWT による tool 単位の認可、引数を見た guardrail、token 単位の rate limit、エージェントをまたいだ trace を Go のサンプル環境で確認しました"
date: 2026-11-14T12:00:00+09:00
tags: ["agentgateway", "A2A", "MCP", "AI Agent", "Go"]
categories: ["AI", "SRE", "Security"]
draft: true
---
こんにちは。[ジェダイパンくず🍞](https://x.com/jedipunkz) です。

以前の記事 [NVIDIA OpenShell を使った AI Agent 環境のガードレイル策](/post/openshell/) ではエージェントが「外に出す経路」をサンドボックスで絞り、[OpenTelemetry GenAI で Claude Code / OpenCode / ADK Go の可観測性向上](/post/otel-genai-agents/) ではエージェントごとの telemetry を 1 つの backend に集めました。どちらもエージェント 1 体を単位にした話でしたが、エージェントが別のエージェントを呼び、MCP server の tool を呼び、LLM を呼ぶ構成になると、その間を流れるトラフィックをどこで認可し、どこで制限し、どこで観測するのかが気になってきます。

ちょうど 2026 年は、この「エージェントの通信をまとめて扱う gateway」が製品カテゴリとして立ち上がってきた年でした。Kong は 4 月に AI Gateway 3.14 で Agent-to-Agent (A2A) のトラフィックに対応し、API7 は 8 月に A2A 1.0 を gateway でどう扱うかの記事を出し、Maxim の Bifrost も 10 月に Agent Gateway を出しています。そこで今回は OSS の [agentgateway](https://github.com/agentgateway/agentgateway) を使って、A2A・MCP・LLM の 3 種類のトラフィックを 1 つの gateway に通すサンプル環境を作り、手を動かしてみました。

コードは下記に置いてあります。

https://github.com/jedipunkz/agent-gateway-playground

検証したバージョンは agentgateway v1.7.0、[a2a-go](https://github.com/a2aproject/a2a-go) v2.8.0 (A2A v1.0)、[MCP Go SDK](https://github.com/modelcontextprotocol/go-sdk) v1.8.0 です。環境は Linux (WSL2) で、Docker は使っていません。

## 結論

| 試したこと | 結果 |
|---|---|
| A2A エージェントを gateway の配下に並べる | Agent Card の URL が gateway の URL に書き換わり、以降の呼び出しが gateway を迂回しない。ログに A2A のメソッド名や context ID が出る |
| MCP server 2 つを 1 endpoint に束ね、JWT で tool を絞る | 許可されない tool は `tools/list` から消え、呼んでも拒否される。ただし認可ルールでは tool の引数を参照できない |
| tool の引数を見て拒否する | `mcpGuardrails` の expression で書ける。`restart_service` の対象が `payments` のときだけ拒否できた |
| LLM に API key 認証と token rate limit をかける | key なしは 401、team ごとの token 上限を超えると 429。上限は事後に差し引かれるので 1 リクエスト分はみ出す |
| エージェントをまたいだ trace | client → planner → worker → MCP / LLM が gateway の span を挟んで 1 本の trace になった (39 span) |

エージェントの通信がどの経路を通っても gateway を経由するようにできれば、「誰が・どのエージェントや tool を・どの引数で呼んだか」を 1 か所で判定し、同じ形式のログと trace に残せます。これが agentgateway を使う一番の価値だと感じました。一方で、認可ルールで引数を参照できないことや、設定ファイルへの自動書き込みなど、ドキュメントを読むだけでは分からない挙動もいくつかありました。

## Agent Gateway とは

AI エージェントが外とやりとりする通信は、大きく次の 3 種類に分けられます。

| 通信 | プロトコル | gateway が中身として見るもの |
|---|---|---|
| エージェント → LLM | OpenAI / Anthropic などの API | モデル名、入出力の token 数、プロンプト |
| エージェント → tool | MCP (JSON-RPC) | `tools/list` や `tools/call` などのメソッド、tool 名、引数 |
| エージェント → エージェント | A2A (JSON-RPC / REST / gRPC) | Agent Card、`SendMessage` などのメソッド、task の状態、context ID |

普通の API gateway は HTTP のパスやヘッダしか見ませんが、どれも本文が JSON-RPC や独自の JSON なので、パスだけでは「どの tool を呼んだか」「どのエージェントのどの task か」が分かりません。Agent Gateway と呼ばれている製品は、これらのプロトコルを解釈して、その単位で認可・制限・観測をするものです。

参考にした各社の記事やドキュメントを読んで、A2A の扱いを比べると次のようになります。agentgateway 以外はドキュメントを読んだだけで、動かしてはいません。

| 製品 | A2A の扱い |
|---|---|
| [agentgateway](https://agentgateway.dev/docs/targets/a2a) | OSS (Apache-2.0、Rust)。route に `a2a` policy を付けると Agent Card の URL を書き換え、メソッドや task 状態をログに出す。A2A v0.3 と v1.0 の両方の形式を解釈する。MCP と LLM も同じバイナリで扱う |
| [Kong AI Gateway](https://developer.konghq.com/plugins/ai-a2a-proxy/) | 3.14 で AI A2A Proxy plugin が追加された。A2A のリクエストを検出して task のメタデータを抜き出し、Agent Card の URL を書き換える。認証は既存の認証 plugin を使う |
| [API7 AISIX](https://docs.api7.ai/ai-gateway/agent-gateway/overview) | エージェントごとに `/a2a/<agent>` の endpoint を作る。エージェントごとに A2A 1.0 か 0.3 を固定し、バージョン間の変換はしない。既定は拒否 |
| [Bifrost (Maxim)](https://www.getmaxim.ai/articles/a2a-protocol-gateway/) | 2026 年 10 月に Agent Gateway を追加。Agent Card をリクエストごとにエージェントから取り直し、endpoint と認証の情報を書き換えて返す |

どの製品も「Agent Card の URL を gateway に書き換えて、以降の呼び出しを gateway に向けさせる」という同じ発想で作られています。API7 の記事 [A2A Protocol 1.0 at the Gateway](https://api7.ai/blog/a2a-protocol-gateway-layer) では、A2A 1.0 で署名付き Agent Card やテナントのルーティングが仕様に入った一方で、「どの署名者を信頼するか」「どの入力でテナントを決めるか」は運用者が決めることで、その決定を強制する場所が gateway だと書かれていました。

## サンプル環境の構成

エージェント、MCP server、LLM はすべて Go で書いた小さな偽物です。LLM も OpenAI 互換の API を返す偽物 (fake LLM) なので、API key は要りません。

```mermaid
flowchart LR
  C[client] -->|A2A :3000| GW
  subgraph GW[agentgateway]
    A2A[routes<br/>a2a policy]
    MCP[mcp<br/>jwtAuth / mcpAuthorization / mcpGuardrails]
    LLM[llm<br/>apiKey / localRateLimit]
  end
  A2A --> P[planner agent]
  P -->|A2A :3000| A2A
  A2A --> W[worker agent]
  W -->|MCP :3001| MCP
  W -->|OpenAI API :4000| LLM
  MCP --> D[mcpserver docs]
  MCP --> O[mcpserver ops]
  LLM --> F[fakellm]
  GW -. OTLP/HTTP .-> T[traceview :4318]
```

planner は受け取ったメッセージを worker に転送するだけのエージェントで、worker は MCP の tool と LLM を呼んで返事を作ります。planner から worker への呼び出しも gateway を経由させています。

| パス | 内容 |
|---|---|
| `cmd/agent` | A2A v1.0 (JSON-RPC) エージェント。`-peer` で転送役、`-mcp` / `-llm` で tool と LLM を呼ぶ役になる。`-send` で client として動く |
| `cmd/mcpserver` | Streamable HTTP の MCP server。`-name docs` は `search_docs`、`-name ops` は `get_status` / `restart_service` を提供する |
| `cmd/fakellm` | OpenAI 互換の `/v1/chat/completions` を返す fake LLM |
| `cmd/jwt` | シナリオ用の ES256 鍵と JWT を作る |
| `cmd/mcpcall` | MCP の `tools/list` と `tools/call` を行う client |
| `cmd/traceview` | OTLP/HTTP で受けた span をツリー表示する簡易 backend |
| `scenarios/` | シナリオごとの gateway 設定と実行スクリプト |

agentgateway は GitHub Releases のバイナリをそのまま使います。`scripts/setup.sh` がバイナリの取得 (sha256 の検証付き) と Go のビルドを行い、各シナリオは `run.sh` を実行するだけで再現できます。

```sh
./scripts/setup.sh
./scenarios/01-a2a/run.sh
```

### 設定ファイルの形式

agentgateway の設定ファイルには、listener と route を入れ子で書く `binds` 形式と、gateway・route・MCP・LLM をトップレベルに並べる `gateways` 形式があります。公式の example には `binds` 形式のものも多いのですが、`binds` には待ち受けアドレスを指定する項目が無く、全インターフェースで listen します。今回は `gateways.*.bindAddress` で `127.0.0.1` を指定できる `gateways` 形式に統一しました。readiness (`:15021`) と metrics (`:15020`) も既定では全インターフェースで listen するので、`config` で loopback に寄せています。

```yaml
config:
  # 未指定だと agentgateway が鍵を生成してこのファイルに書き込むため、環境変数で渡す
  session:
    key: $SESSION_KEY
  readinessAddr: 127.0.0.1:15021
  statsAddr: 127.0.0.1:15020
gateways:
  a2a:
    port: 3000
    bindAddress: 127.0.0.1
```

`config.session.key` はセッション ID の暗号化に使う鍵で、未指定のまま起動すると agentgateway が鍵を生成して設定ファイルに追記します (`--validate-only` では書き込まれません)。気付かずに commit すると鍵がリポジトリに入ります。値に `$SESSION_KEY` と書けば環境変数から読まれ、ファイルは書き換えられません。環境変数が無い場合は起動時にエラーになります。

## シナリオ 01: A2A エージェントを gateway の配下に並べる

planner と worker の 2 体を、1 つの gateway (`:3000`) の配下に `/planner` と `/worker` のパスで並べます。route に `a2a: {}` を付けると、その route は A2A のトラフィックとして扱われます。

```yaml
routes:
- name: planner
  gateways: a2a
  matches:
  - path:
      pathPrefix: /planner
  policies:
    urlRewrite:
      path:
        prefix: /
    a2a: {}
  backends:
  - host: 127.0.0.1:9302
- name: worker
  gateways: a2a
  matches:
  - path:
      pathPrefix: /worker
  policies:
    urlRewrite:
      path:
        prefix: /
    a2a: {}
  backends:
  - host: 127.0.0.1:9301
```

エージェントの実装は a2a-go の JSON-RPC handler に、受け取ったテキストを処理する関数を渡すだけです。Agent Card には自分自身の URL (`http://127.0.0.1:9302/invoke`) を書いています。

```go
card := &a2a.AgentCard{
	Name:        *name,
	Description: *name + " agent",
	// gateway はこの URL を自分の URL に書き換えて返す (agent card rewrite)
	SupportedInterfaces: []*a2a.AgentInterface{
		a2a.NewAgentInterface("http://"+*addr+"/invoke", a2a.TransportProtocolJSONRPC),
	},
	// ...
}

mux := http.NewServeMux()
mux.Handle("/invoke", a2asrv.NewJSONRPCHandler(a2asrv.NewHandler(exec)))
mux.Handle(a2asrv.WellKnownAgentCardPath, a2asrv.NewStaticAgentCardHandler(card))
```

### Agent Card の書き換え

backend から直接取った Agent Card と、gateway 経由で取った Agent Card を比べます。

```sh
$ curl -s http://127.0.0.1:9302/.well-known/agent-card.json | jq '.supportedInterfaces'
[
  {
    "url": "http://127.0.0.1:9302/invoke",
    "protocolBinding": "JSONRPC",
    "protocolVersion": "1.0"
  }
]

$ curl -s http://127.0.0.1:3000/planner/.well-known/agent-card.json | jq '.supportedInterfaces'
[
  {
    "url": "http://127.0.0.1:3000/planner/invoke",
    "protocolBinding": "JSONRPC",
    "protocolVersion": "1.0"
  }
]
```

gateway 経由では `url` が `http://127.0.0.1:3000/planner/invoke` に書き換わっています。A2A の client は Agent Card に書かれた URL にメッセージを送るので、最初に gateway から Agent Card を取りさえすれば、以降の呼び出しも gateway を通ります。A2A v1.0 の `supportedInterfaces[].url` と v0.3 の `url` の両方に対応していて、`urlRewrite` でパスを書き換えている場合も、それを考慮した URL に直してくれます。

### メッセージを送る

client から planner にメッセージを送ると、planner が gateway 経由で worker に転送し、worker の返事が返ってきます。

```sh
$ bin/agent -name client -send http://127.0.0.1:3000/planner "checkout"
[planner] [worker] received "checkout"
```

gateway のアクセスログです (読みやすいように一部の項目を削っています)。

```plain
route=default/planner http.method=GET http.path=/planner/.well-known/agent-card.json http.status=200 protocol=a2a duration=0ms
route=default/worker http.method=GET http.path=/worker/.well-known/agent-card.json http.status=200 protocol=a2a duration=0ms
route=default/worker http.method=POST http.path=/worker/invoke http.status=200 protocol=a2a a2a.method=SendMessage a2a.response.outcome=success a2a.result.kind=message a2a.context.id=01a1d56f-d37b-7d59-a75a-092092397b75 duration=0ms
route=default/planner http.method=POST http.path=/planner/invoke http.status=200 protocol=a2a a2a.method=SendMessage a2a.response.outcome=success a2a.result.kind=message a2a.context.id=01a1d56f-d37a-7a99-b1f4-4f1d5f1237de duration=1ms
```

`a2a.method=SendMessage` が A2A v1.0 のメソッド名です (v0.3 では `message/send`)。返事の種類 (`message` か `task`)、task の状態、エラーコード、context ID もログに出ます。

ただし context ID は planner と worker で別の値になっています。A2A の context ID は会話の単位で、planner が worker に新しいメッセージを送ると、worker 側では別の会話として扱われるためです。エージェントをまたいで 1 つのリクエストを追うには、後述のシナリオ 04 の trace を使います。

### a2a-go で path 付きの URL を扱う

gateway の配下にパスで並べたエージェントを a2a-go の client から呼ぶとき、一点つまずきました。`agentcard.Resolver.Resolve()` に `http://127.0.0.1:3000/planner` を渡すと 404 になります。a2a-go は base URL のパスが空か `/` のときだけ `/.well-known/agent-card.json` を付け、パスがあればその URL を Agent Card の URL そのものとみなすためです。`WithPath` で明示すれば解決します。

```go
card, err := agentcard.NewResolver(hc).Resolve(ctx, cardURL, agentcard.WithPath(a2asrv.WellKnownAgentCardPath))
```

## シナリオ 02: MCP server を束ねて tool 単位で認可する

docs と ops の 2 つの MCP server を、1 つの endpoint (`:3001/mcp`) に束ねます。agentgateway は複数の MCP server を 1 つの MCP server に見せる multiplex の機能を持っていて、tool 名には `<target 名>_<tool 名>` の prefix が付きます。

認可は JWT の claim を使います。JWT は `cmd/jwt` で作り、`role` claim に `viewer` か `operator` を入れています。読み取り系の tool (`search_docs`、`get_status`) は誰でも使え、`restart_service` は operator だけが使える、というルールです。

```yaml
mcp:
  gateways: mcp
  policies:
    jwtAuth:
      mode: strict
      providers:
      - issuer: agent-gateway-playground
        audiences: [playground]
        jwks:
          file: ./jwt/jwks.json
    # tool 単位の認可。判定に使えるのは tool 名・target・JWT claim など (引数は見えない)
    mcpAuthorization:
      rules:
      # 有効な JWT があれば読み取り系 tool は使える
      - allow: 'mcp.tool.name in ["search_docs", "get_status"]'
      # restart_service は operator だけ
      - allow: 'jwt.role == "operator" && mcp.tool.name == "restart_service"'
  targets:
  - name: docs
    mcp:
      host: http://127.0.0.1:9201/mcp
  - name: ops
    mcp:
      host: http://127.0.0.1:9202/mcp
```

`run.sh` の出力です。

```plain
## token なし
connect: calling "initialize": sending "initialize": Unauthorized

## viewer: tools/list と restart_service
tool: docs_search_docs
tool: ops_get_status
call: calling "tools/call": sending "tools/call": unknown resource: rejected by transport: Bad Request

## operator: restart_service (checkout)
tool: docs_search_docs
tool: ops_get_status
tool: ops_restart_service
result (isError=false): checkout: restarted
```

viewer の `tools/list` には `ops_restart_service` が出てきません。許可されない tool は一覧から消えるので、エージェント (の LLM) はそもそも呼べる tool として認識しません。それでも名前を指定して呼ぶと 400 で拒否されます。ログには誰が (`jwt.sub`) どの target のどの tool を呼んで、なぜ拒否されたのかが残ります。

```plain
http.status=401 protocol=http error="authentication failure: no bearer token found" reason=JwtAuth
http.status=400 jwt.sub=alice protocol=mcp mcp.method.name=tools/call mcp.target=ops mcp.resource.type=tool gen_ai.tool.name=restart_service error="mcp: authorization denied for tool: ops_restart_service" reason=Authorization
http.status=200 jwt.sub=bob protocol=mcp mcp.method.name=tools/call mcp.target=ops mcp.resource.type=tool gen_ai.tool.name=restart_service
```

### 認可ルールでは tool の引数を参照できない

次に「operator でも `payments` の再起動はさせない」という、tool の引数を見たルールを足そうとしました。CEL のリファレンス (`schema/cel.md`) には `mcp.tool.arguments` という変数が載っているので、最初は認可ルールに書きました。

```yaml
- allow: 'jwt.role == "operator" && mcp.tool.name == "restart_service" && mcp.tool.arguments.service != "payments"'
```

ところがこのルールでは、operator の `tools/list` からも `ops_restart_service` が消え、`checkout` の再起動も拒否されました。`has(mcp.tool.arguments)` で存在を確認する書き方にすると、今度は `payments` の再起動も通ります。認可ルールの評価時には引数が渡されていないということです。agentgateway のソース (`crates/agentgateway/src/mcp/rbac.rs`) を読むと、MCP の認可で使われる tool の情報は target 名と tool 名だけでした。v1.7.0 の時点では、`mcpAuthorization` で判定できるのは「どの tool か」までで、「どの引数か」は判定できません。

### 引数を見た拒否は guardrail で書く

引数を見るには `mcpGuardrails` を使います。guardrail は MCP のリクエストやレスポンスを CEL 式で検査し、拒否 (`reject`) や書き換え (`transform`) ができる機能です。

```yaml
    # 引数を見た制御は guardrail で行う。payments の再起動は operator でも拒否する
    mcpGuardrails:
      processors:
      - kind: expression
        methods: {"tools/call": request}
        condition: >-
          mcp.tool.target == "ops" &&
          mcp.params.name == "restart_service" &&
          has(mcp.params.arguments.service) &&
          mcp.params.arguments.service == "payments"
        reject: "restarting payments requires a change request"
```

```plain
## operator: restart_service (payments) -> guardrail
result (isError=true): restarting payments requires a change request
```

```plain
http.status=200 jwt.sub=bob protocol=mcp mcp.method.name=tools/call mcp.target=ops mcp.resource.type=tool gen_ai.tool.name=restart_service error="mcp: mcpGuardrails rejected: restarting payments requires a change request" reason=MCP
```

認可で拒否された場合は HTTP 400 で、client 側では `tools/call` 自体の失敗になりましたが、guardrail で拒否された場合は HTTP 200 で、tool の結果として `isError: true` とメッセージが返ります。エージェントから見ると「tool を呼んだら失敗した」という扱いになるので、LLM は理由を読んで別の手を考えられます。

guardrail の式を書くときにも 2 点はまりました。

- `mcp.params.name` に入っているのは target の prefix を外した tool 名 (`restart_service`) で、`ops_restart_service` と書くと一致しません。同じ名前の tool が別の target にあると両方に一致するので、`mcp.tool.target` で target を絞ります。
- 最初は target を `mcp.target.name` で絞ろうとしました。この変数は guardrail では評価エラーになり、`payments` の呼び出しは `guardrail check failed` で拒否されました。一方、`checkout` の呼び出しは通りました。CEL の `&&` は片方が false なら、もう片方がエラーでも false を返すため、`service == "payments"` が false になる呼び出しではエラーが表に出ません。エラーのときに拒否側に倒れるのは安全ですが、式の誤りに気付きにくいです。

### prefix を付けずに tool を呼ぶと

最後に、prefix を付けずに `get_status` を呼んでみました。

```plain
http.status=400 jwt.sub=bob protocol=mcp mcp.method.name=tools/call mcp.target=get mcp.resource.type=tool gen_ai.tool.name=status error="mcp: authorization denied for tool: get_status" reason=Authorization
```

最初の `_` で区切られ、target `get` の tool `status` と解釈されています。tool 名に `_` を含む MCP server は多いので、multiplex するときは prefix を付けた名前で呼ぶ前提になります。

## シナリオ 03: LLM に API key 認証と token rate limit をかける

fake LLM を OpenAI 互換の custom provider として登録し、team ごとの API key と、team ごとの token 上限 (1 分あたり 40 token) をかけます。API key は設定ファイルに直接書かず、環境変数から読みます。

```yaml
llm:
  gateways: llm
  policies:
    apiKey:
      mode: strict
      location:
        header:
          name: authorization
          prefix: 'Bearer '
      keys:
      - key: $TEAM_A_KEY
        metadata:
          team: team-a
      - key: $TEAM_B_KEY
        metadata:
          team: team-b
    # team ごとに 1 分あたり 40 token まで
    localRateLimit:
    - type: tokens
      maxTokens: 40
      tokensPerFill: 40
      fillInterval: 60s
      key: apiKey.team
  models:
  - name: fake
    provider:
      custom:
        formats:
        - type: completions
    params:
      baseUrl: http://127.0.0.1:9100/v1
      model: fake-1
```

key に付けた `metadata` は CEL から `apiKey.team` として参照できるので、rate limit の bucket を team 単位にしています。client は `model: fake` を指定し、gateway が `fake-1` に置き換えて fake LLM に送ります。

```plain
## key なし
401 authentication failed

## team-a を 5 回 (上限 40 token/分)
200 {"prompt_tokens":5,"completion_tokens":7,"total_tokens":12}
200 {"prompt_tokens":5,"completion_tokens":7,"total_tokens":12}
200 {"prompt_tokens":5,"completion_tokens":7,"total_tokens":12}
200 {"prompt_tokens":5,"completion_tokens":7,"total_tokens":12}
429 rate limit exceeded

## team-b (別 bucket)
200 {"prompt_tokens":5,"completion_tokens":7,"total_tokens":12}
```

1 回 12 token なので、上限が 40 token なら 3 回で止まりそうですが、実際には 4 回目まで通って 5 回目で 429 になりました。token 数はレスポンスを受け取るまで分からないので、リクエストの時点では残りがあるかだけを見て通し、レスポンスの token 数を後から差し引いているようです (ソースまでは確認していません)。上限は「1 リクエスト分はみ出しうる目安」として設定する必要があります。

アクセスログと metrics には、OTel GenAI semantic conventions の名前で token 数が出ます。[前回の記事](/post/otel-genai-agents/) ではエージェントごとに token 数の属性名がばらばらでしたが、LLM の呼び出しを gateway に通せば、どのエージェントから呼んでも同じ名前で集計できます。

```plain
http.status=200 protocol=llm gen_ai.operation.name=chat gen_ai.provider.name=custom gen_ai.request.model=fake-1 gen_ai.response.model=fake-1 agw.ai.original_model=fake gen_ai.usage.input_tokens=5 gen_ai.usage.output_tokens=7
http.status=429 protocol=llm agw.ai.original_model=fake error="rate limit exceeded" reason=RateLimit
```

```plain
agentgateway_gen_ai_client_token_usage_sum{gen_ai_token_type="input",gen_ai_operation_name="chat",gen_ai_system="custom",gen_ai_request_model="fake-1",gen_ai_response_model="fake-1"} 25.0
agentgateway_gen_ai_client_token_usage_sum{gen_ai_token_type="output",gen_ai_operation_name="chat",gen_ai_system="custom",gen_ai_request_model="fake-1",gen_ai_response_model="fake-1"} 35.0
```

## シナリオ 04: エージェントをまたいだ trace

最後に、01〜03 の設定を 1 つの gateway プロセスにまとめ、client → planner → worker → MCP / LLM の流れを 1 本の trace で見ます。gateway の設定には trace の送り先を足すだけです。

```yaml
config:
  tracing:
    otlpEndpoint: http://127.0.0.1:4318
    otlpProtocol: http
    randomSampling: "true"
```

エージェント側は、受けるリクエストを `otelhttp.NewHandler` で包み、送るリクエストを `otelhttp.NewTransport` を通すようにして、`traceparent` ヘッダを伝搬させます。A2A の client にも MCP の client にも `*http.Client` を渡せるので、エージェントのコードに trace の処理はほとんど入りません。

```go
func Client(header, value string) *http.Client {
	var rt http.RoundTripper = otelhttp.NewTransport(http.DefaultTransport)
	if value != "" {
		rt = headerRT{rt, header, value}
	}
	return &http.Client{Transport: rt}
}
```

trace の backend には、OTLP/HTTP で受けた span をツリー表示するだけの `cmd/traceview` を書いて使いました。実行結果です。

```plain
trace 060470cb44a14a16e8ec4c68974468c4 (39 spans)
  - [client] send http://127.0.0.1:3000/planner
    - [client] HTTP GET
      - [agentgateway] GET /planner/*
        - [agentgateway] GET
          - [planner] GET /.well-known/agent-card.json
    - [client] HTTP POST
      - [agentgateway] POST /planner/* a2a.method=SendMessage
        - [agentgateway] POST
          - [planner] POST /invoke
            - [planner] HTTP GET
              - [agentgateway] GET /worker/*
                - [agentgateway] GET
                  - [worker] GET /.well-known/agent-card.json
            - [planner] HTTP POST
              - [agentgateway] POST /worker/* a2a.method=SendMessage
                - [agentgateway] POST
                  - [worker] POST /invoke
                    - [worker] HTTP POST
                      - [agentgateway] server/discover
                        - [agentgateway] server/discover docs
                        - [agentgateway] server/discover ops
                    - [worker] HTTP POST
                      - [agentgateway] initialize
                        - [agentgateway] initialize docs
                        - [agentgateway] initialize ops
                    - [worker] HTTP POST
                      - [agentgateway] notifications/initialized
                        - [agentgateway] notifications/initialized docs
                        - [agentgateway] notifications/initialized ops
                    - [worker] HTTP POST
                      - [agentgateway] tools/call gen_ai.tool.name=get_status
                        - [agentgateway] tools/call ops_get_status gen_ai.tool.name=get_status
                    - [worker] HTTP DELETE
                      - [agentgateway] DELETE /mcp/*
                        - [agentgateway] DELETE docs
                        - [agentgateway] DELETE ops
                    - [worker] HTTP POST
                      - [agentgateway] POST /v1/chat/completions gen_ai.operation.name=chat gen_ai.usage.input_tokens=8 gen_ai.usage.output_tokens=10
                        - [agentgateway] POST
```

client から LLM の呼び出しまでが 1 本の trace につながりました。gateway は受けた `traceparent` を引き継いで自分の span を作り、backend に転送するときにも `traceparent` を付けています。A2A の span には `a2a.method`、MCP の span には `gen_ai.tool.name`、LLM の span には token 数が付くので、trace を見るだけで「planner がどのエージェントを呼び、そのエージェントがどの tool を呼び、LLM に何 token 使ったか」が分かります。シナリオ 01 で見たとおり context ID はエージェントごとに別になるので、エージェントをまたいだ追跡は trace ID で行うことになります。

trace からは multiplex のコストも見えます。worker は `ops_get_status` を 1 回呼んだだけですが、`server/discover`、`initialize`、`notifications/initialized`、セッション終了の `DELETE` は docs と ops の両方に送られています。束ねる MCP server が増えると、セッションを張るたびのリクエストもその数だけ増えます。

## 気になった点

- 設定ファイルに `config.session.key` が無いと、agentgateway が起動時に鍵を生成して設定ファイルに書き込みます。
- `binds` 形式の設定では待ち受けアドレスを指定できず、全インターフェースで listen します。readiness と metrics の port も既定では全インターフェースです。
- CEL のリファレンスに載っている変数でも、使える場所が限られているものがあります (`mcp.tool.arguments` は認可では使えず、`mcp.target.name` は guardrail で評価エラーになる)。ルールを書いたら、許可されるケースと拒否されるケースの両方を実際に呼んで確かめる必要があると思いました。
- gateway は経路上の判定点なので、エージェントが gateway を迂回して backend を直接呼べると意味がありません。今回は全部 `127.0.0.1` で動かしているので、planner から worker の port を直接叩くこともできます。本番では、backend にネットワーク的に gateway からしか届かないようにするか、[OpenShell](/post/openshell/) のようなサンドボックスで外向きの通信を gateway だけに絞る必要があります。

## まとめ

agentgateway を使って、A2A・MCP・LLM の 3 種類のトラフィックを 1 つの gateway に通してみました。Agent Card の書き換えでエージェント間の呼び出しを gateway に寄せられること、MCP の tool を JWT の claim で絞ると一覧からも消えること、LLM の token を team 単位で制限できること、そしてそれらがすべて同じ形式のログと 1 本の trace に残ることを確認できました。エージェントが増えても「誰が何を呼んだか」を 1 か所で答えられるのは、運用する側として安心材料になると感じました。

一方で、認可ルールでは tool の引数を参照できず guardrail で補う必要があることや、CEL の変数が使える場所の違いなど、まだ v1.x らしい粗さもありました。次は Kubernetes の Gateway API 経由で agentgateway を動かし、エージェントを Pod として並べたときに、迂回できない経路をどう作るかを試してみたいと思います。
