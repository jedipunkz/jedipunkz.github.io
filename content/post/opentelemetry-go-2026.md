---
title: "[再入門] OpenTelemetry を Go で学び直す"
description: "OpenTelemetry の基本概念から Go での計装、Collector の役割、サンプリングまでを動くコードで整理しつつ、CNCF graduation 後の 2026 年時点の状況をまとめます"
date: 2026-09-18T00:00:00+09:00
Categories: ["OpenTelemetry", "Go", "observability", "SRE"]
draft: false
---
[jedipunkz🚀](https://x.com/jedipunkz) です。

この記事では OpenTelemetry の概念を整理し、Go で traces / metrics / logs の 3 シグナルを計装して、Collector 経由で Grafana スタックに送るまでを書きます。2026 年 9 月時点の情報です。

OpenTelemetry は仕事で使っていましたが、体系的に学んでいませんでした。トレースが出れば良いという使い方で、Resource と Attribute の違いを説明できない状態でした。CNCF graduation のニュースを機に基礎から整理し直しました。

以前 [Go, OpenTelemetry で AWS にログ・トレースを計装してみる](/post/opentelemetry-aws/) という記事を書きましたが、こちらは AWS X-Ray への送信に絞った内容でした。今回は特定のバックエンドに依存しない基礎の部分を扱います。

コードは以下のリポジトリの `go-otel-2026` ディレクトリにあります。

https://github.com/jedipunkz/opentelemetry-playground

## OpenTelemetry とは何か

### 解決する課題

従来のオブザーバビリティは計装コードがベンダーに紐づいていました。Datadog なら `dd-trace-go`、New Relic なら `newrelic-go` を使います。バックエンドを変えると、アプリケーションの計装コードを書き換える必要がありました。

OpenTelemetry はこの計装の部分を標準化します。アプリが吐くのは OTLP (OpenTelemetry Protocol) という共通フォーマットで、どのバックエンドに送るかは設定で決めます。送り先を変えてもアプリのコードは変わりません。

### 4 つの構成要素

OpenTelemetry の実体は 4 つに分かれます。

| 要素 | 内容 |
|---|---|
| 仕様 (Specification) | API・SDK・OTLP プロトコルの言語非依存な定義 |
| SDK | 各言語の実装。Go なら `go.opentelemetry.io/otel` |
| Collector | テレメトリを受け取り、加工し、転送する独立したプロセス |
| Semantic Conventions | 属性の名前の取り決め。`http.request.method` などの語彙 |

この 4 つのうち Semantic Conventions が、バックエンドの汎用ダッシュボードが成立する前提になっています。全員が同じ属性名を使うため、バックエンドは「HTTP リクエストのレイテンシ」を共通の方法で集計できます。属性名を自分で決めるのは、規約に無いものに限ります。

### データモデルと用語

計装する前に、最低限おさえる用語を整理します。

| 用語 | 意味 |
|---|---|
| Signal | テレメトリの種類。traces / metrics / logs / profiles の 4 つ |
| Span | トレースを構成する 1 つの処理単位。開始時刻・終了時刻・属性を持つ |
| Trace | 同じ Trace ID を共有する Span の木構造 |
| Resource | テレメトリを出している主体の情報。`service.name` など |
| Attribute | Span やメトリクスに付けるキーバリュー |
| Context propagation | Trace ID をプロセス間で引き継ぐ仕組み |
| Instrumentation Scope | どのライブラリ・パッケージが出したテレメトリか |

Resource と Attribute の区別が紛らわしい箇所です。Resource は「誰が出したか」で、プロセスが生きている間は変わりません。Attribute は「何が起きたか」で、リクエストごとに変わります。`service.name` は Resource、`http.response.status_code` は Attribute です。

## 2026 年時点のステータス

OpenTelemetry は 2026 年 5 月に CNCF を graduate しました。ただしコンポーネントごとに成熟度は異なります。

| コンポーネント | ステータス |
|---|---|
| 仕様: traces / metrics / logs | Stable |
| 仕様: profiles | public alpha（2026-03〜） |
| Go SDK: traces / metrics | Stable |
| Go SDK: logs | Release candidate |
| Go SDK: profiles | 未提供 |
| Collector | v0.161.0。まだ 1.0 に達していない |
| 宣言的設定 (Declarative Configuration) | Stable |
| Semantic Conventions | コアは stable な属性が中心。GenAI / MCP は Development |

graduation はプロジェクト全体の成熟度を示すもので、個々のコンポーネントの安定性とは別です。traces と metrics は stable、Go の logs は RC、profiles は alpha なので、採用の判断はシグナルごとに分けます。

## Go で計装する

ここからコードです。題材は注文 API という体の小さな HTTP サーバにします。使うバージョンは以下です。

| モジュール | バージョン |
|---|---|
| `go.opentelemetry.io/otel`（traces / metrics） | v1.46.0 |
| `go.opentelemetry.io/otel/log`, `sdk/log` | v0.22.0 |
| `go.opentelemetry.io/contrib/instrumentation/...` | v0.71.0 |
| `go.opentelemetry.io/contrib/bridges/otelslog` | v0.20.1 |
| semconv | v1.43.0 |

### SDK の初期化

OpenTelemetry の Go SDK は、API と SDK が分離されています。アプリのコードが触るのは API で、実際にテレメトリを生成・送信するのが SDK です。`main` で SDK をセットアップしてグローバルに登録し、以降のコードは API 越しに使う、という形になります。

初期化のコードは公式のサンプルに倣って `setupOTelSDK` という 1 つの関数にまとめます。ポイントは、3 つの provider をまとめて止める shutdown 関数を返すことです。

```go
// setupOTelSDK は traces / metrics / logs の 3 シグナルを初期化し、
// すべての provider をまとめて止める shutdown 関数を返す。
//
// エクスポート先は OTEL_EXPORTER_OTLP_ENDPOINT 環境変数で指定する。
// 例: OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4317
// スキームが http の場合、gRPC エクスポーターは TLS なしで接続する。
func setupOTelSDK(ctx context.Context) (func(context.Context) error, error) {
	var shutdownFuncs []func(context.Context) error

	// 初期化済みの provider を逆順に止める。
	// 途中で失敗しても、それまでに作った provider は必ず止める。
	shutdown := func(ctx context.Context) error {
		var err error
		for i := len(shutdownFuncs) - 1; i >= 0; i-- {
			err = errors.Join(err, shutdownFuncs[i](ctx))
		}
		shutdownFuncs = nil
		return err
	}

	res, err := newResource(ctx)
	if err != nil {
		return nil, err
	}

	// W3C Trace Context と Baggage を伝播させる。
	// 設定を忘れるとサービスをまたいだ時点でトレースが分断される。
	otel.SetTextMapPropagator(propagation.NewCompositeTextMapPropagator(
		propagation.TraceContext{},
		propagation.Baggage{},
	))

	tp, err := newTracerProvider(ctx, res)
	if err != nil {
		return nil, errors.Join(err, shutdown(ctx))
	}
	shutdownFuncs = append(shutdownFuncs, tp.Shutdown)
	otel.SetTracerProvider(tp)

	mp, err := newMeterProvider(ctx, res)
	if err != nil {
		return nil, errors.Join(err, shutdown(ctx))
	}
	shutdownFuncs = append(shutdownFuncs, mp.Shutdown)
	otel.SetMeterProvider(mp)

	lp, err := newLoggerProvider(ctx, res)
	if err != nil {
		return nil, errors.Join(err, shutdown(ctx))
	}
	shutdownFuncs = append(shutdownFuncs, lp.Shutdown)
	global.SetLoggerProvider(lp)

	return shutdown, nil
}
```

エクスポーターは `OTEL_EXPORTER_OTLP_ENDPOINT` を自動で読むため、エンドポイントをコードに書く必要はありません。gRPC エクスポーターはスキームが `http` なら TLS なしで接続します。

```go
func newTracerProvider(ctx context.Context, res *resource.Resource) (*sdktrace.TracerProvider, error) {
	exporter, err := otlptracegrpc.New(ctx)
	if err != nil {
		return nil, err
	}

	// ParentBased でラップすることで、親がサンプルされたトレースの子スパンは
	// 必ずサンプルされる。ラップしないとトレースが虫食いになる。
	sampler := sdktrace.ParentBased(sdktrace.TraceIDRatioBased(samplingRatio()))

	return sdktrace.NewTracerProvider(
		sdktrace.WithBatcher(exporter),
		sdktrace.WithResource(res),
		sdktrace.WithSampler(sampler),
	), nil
}
```

`WithBatcher` はスパンをバッファに溜めてまとめて送ります。1 スパンごとに同期送信する `WithSyncer` もありますが、スパンごとに送信が発生するためテスト用途に限ります。

### Resource を作る

Resource はバックエンドがサービスを識別するための情報です。`service.name` は必須で、これが無いと `unknown_service` として記録されます。

```go
// newResource は「このテレメトリを出しているのは誰か」を表す Resource を作る。
// service.name はバックエンドがサービスを識別する主キーになるため必ず設定する。
func newResource(ctx context.Context) (*resource.Resource, error) {
	env := os.Getenv("DEPLOYMENT_ENV")
	if env == "" {
		env = "local"
	}

	// resource.Default() には telemetry.sdk.* が含まれる。
	// Merge には両者の SchemaURL が一致している必要がある。
	return resource.Merge(
		resource.Default(),
		resource.NewWithAttributes(
			semconv.SchemaURL,
			semconv.ServiceName(serviceName),
			semconv.ServiceVersion(serviceVersion),
			semconv.DeploymentEnvironmentNameKey.String(env),
		),
	)
}
```

`resource.Merge` は 2 つの Resource の SchemaURL が違うとエラーを返します。`semconv.SchemaURL` を使っていれば、import している semconv のバージョンと `resource.Default()` のバージョンが揃うので問題ありません。

semconv は import パスにバージョンが入ります。

```go
import semconv "go.opentelemetry.io/otel/semconv/v1.43.0"
```

バージョンを上げると属性名が変わることがあります。例えば `deployment.environment` は `deployment.environment.name` に変わりました。移行のタイミングを自分で決められるように、こういう形になっています。

### HTTP サーバを計装する

自分でスパンを作る前に、まずライブラリ計装を入れます。`otelhttp` を使うと、HTTP ハンドラを包むだけでサーバスパンが作られ、semantic conventions に従った属性が付きます。

```go
func newRouter() http.Handler {
	mux := http.NewServeMux()

	// パスごとに otelhttp でラップし、span 名にルートパターンを使う。
	// span 名に実際の URL（/orders/12345）を使うとカーディナリティが爆発する。
	handle := func(pattern string, h http.HandlerFunc) {
		mux.Handle(pattern, otelhttp.NewHandler(h, pattern))
	}

	handle("GET /orders", handleCreateOrder)
	handle("GET /orders/error", handleFailingOrder)
	handle("GET /chain", handleChain)

	// ヘルスチェックは計装しない。数が多く、トレースとして価値がない。
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, r *http.Request) {
		io.WriteString(w, "ok\n")
	})

	return mux
}
```

ここで 1 つ注意点があります。ネット上の記事でよく見る `otelhttp.WithRouteTag` は、contrib v0.71.0 では既に存在しません。`mux` 全体を 1 回ラップして `WithRouteTag` でルート名を付ける、という書き方は今は使えないので、上記のようにハンドラごとにラップしてルートパターンを渡します。

送信側も計装できます。`http.Client` の Transport を差し替えるだけです。

```go
// 計装済みの HTTP クライアント。
// Transport を差し替えるだけで、送信リクエストに traceparent ヘッダが付く。
var httpClient = &http.Client{
	Transport: otelhttp.NewTransport(http.DefaultTransport),
	Timeout:   5 * time.Second,
}
```

これで送信リクエストに `traceparent` ヘッダが付き、呼び出し先のサービスが同じトレースの続きとしてスパンを作れます。ただし `http.NewRequestWithContext` で ctx を渡すことが条件です。ctx を渡し忘れるとトレースはそこで切れます。

### 手動でスパンを作る

ライブラリ計装だけではアプリ内部の処理が見えません。時間がかかっている箇所には自分でスパンを作ります。

```go
// chargePayment は外部の決済サービス呼び出しを模した子スパンを作る。
func chargePayment(ctx context.Context, orderID string, amount float64) error {
	ctx, span := tracer.Start(ctx, "chargePayment",
		// 外部サービス呼び出しなので Client として記録する。
		trace.WithSpanKind(trace.SpanKindClient),
	)
	defer span.End()

	span.SetAttributes(
		attribute.String("order.id", orderID),
		attribute.Float64("order.amount", amount),
	)

	time.Sleep(time.Duration(50+rand.IntN(150)) * time.Millisecond)

	// 10 回に 1 回失敗させ、エラーのトレースも観測できるようにする。
	if rand.IntN(10) == 0 {
		return errors.New("payment declined")
	}

	logger.DebugContext(ctx, "payment charged", slog.String("order.id", orderID))
	return nil
}
```

`tracer.Start` が返す ctx を以降の処理に渡すのが肝心です。返り値の ctx を捨てて元の ctx を使い続けると、その先で作られるスパンは親子関係を持ちません。

SpanKind は、そのスパンがどういう役割かを表します。`Server`（リクエストを受けた）、`Client`（外部を呼んだ）、`Internal`（内部処理）などがあり、バックエンドがサービスマップを描くときの手がかりになります。

### エラーを記録する

エラーの記録には落とし穴があります。`RecordError` だけではスパンはエラー扱いになりません。

```go
// recordFailure はエラーをスパン・ログ・メトリクスの 3 箇所に記録する。
func recordFailure(ctx context.Context, w http.ResponseWriter, err error, status int) {
	span := trace.SpanFromContext(ctx)
	// RecordError は例外イベントを追加するだけ。
	// SetStatus を呼ばないとスパンはエラー扱いにならない。
	span.RecordError(err)
	span.SetStatus(codes.Error, err.Error())

	ordersCreated.Add(ctx, 1, metric.WithAttributes(
		attribute.String("order.status", "failed"),
	))

	logger.ErrorContext(ctx, "order failed", slog.String("error", err.Error()))
	http.Error(w, err.Error(), status)
}
```

`RecordError` はスパンにイベントを 1 つ足すだけです。エラーで絞り込めるようにするには `SetStatus(codes.Error, ...)` が必要です。エラー時は 2 つとも呼びます。

`trace.SpanFromContext(ctx)` は ctx に入っている現在のスパンを取り出します。ここでは `otelhttp` が作ったサーバスパンが取れるので、新しくスパンを作らずに属性を足せます。

### メトリクス

メトリクスの計測器 (Instrument) は、リクエストごとではなく起動時に 1 度だけ作ります。

```go
func initInstruments() error {
	meter := otel.Meter(scopeName)

	var err error
	// 計測器の名前は semantic conventions に倣って . 区切りにする。
	ordersCreated, err = meter.Int64Counter(
		"app.orders.created",
		metric.WithDescription("作成された注文の件数"),
		metric.WithUnit("{order}"),
	)
	if err != nil {
		return err
	}

	orderAmount, err = meter.Float64Histogram(
		"app.order.amount",
		metric.WithDescription("注文金額の分布"),
		metric.WithUnit("JPY"),
	)
	return err
}
```

記録側はこうなります。

```go
	ordersCreated.Add(ctx, 1, metric.WithAttributes(
		// メトリクスの属性は取りうる値が有限のものだけにする。
		attribute.String("order.status", "created"),
	))
	orderAmount.Record(ctx, amount)
```

属性の付け方はスパンと同じ書き方ですが、扱いは正反対です。スパンの属性には注文 ID のような値を入れて構いません。1 スパン 1 レコードなので、値の種類が増えても問題ないからです。メトリクスの属性は時系列のキーになるため、値の種類だけ時系列が増えます。注文 ID を入れると時系列が注文の数だけ生まれ、バックエンドのコストが跳ねます。

Go ランタイムのメトリクスは contrib のパッケージで取れます。

```go
	// Go ランタイムのメトリクス（GC, goroutine 数, ヒープ）を自動収集する。
	if err := runtime.Start(runtime.WithMinimumReadMemStatsInterval(time.Second)); err != nil {
		log.Fatalf("failed to start runtime instrumentation: %v", err)
	}
```

### ログと slog を繋ぐ

3 つ目のシグナルがログです。Go には標準の `log/slog` があるので、OpenTelemetry には slog のブリッジが用意されています。

```go
logger = otelslog.NewLogger(scopeName)
```

これで `*slog.Logger` が手に入り、書き込みは OTLP で送られます。重要なのは ctx を渡すことです。

```go
	// InfoContext に ctx を渡すと、otelslog がログに trace_id と span_id を埋める。
	// Info（ctx なし）ではトレースと紐づかない。
	logger.InfoContext(ctx, "order created",
		slog.String("order.id", orderID),
		slog.Float64("order.amount", amount),
	)
```

`Info` ではなく `InfoContext` を使うと、ctx から Trace ID と Span ID を取り出してログレコードに埋め込みます。これがトレースとログの相関の正体です。バックエンド側では、ログから該当のトレースに 1 クリックで飛べるようになります。

なお Go の Logs API / SDK は 2026 年 9 月時点で RC です。2026-08-27 に `v1.47.0-rc.1` が出ていますが、プレリリースなので `go get @latest` では降ってきません。今回は beta の v0.22.0 を使っています。

## Collector を挟む

### なぜアプリから直接送らないのか

SDK からバックエンドへ直接 OTLP を送ることもできます。それでも Collector を挟むのは、以下の理由からです。

- 送信先を変えるのにアプリの再デプロイが要らない。設定の反映だけで済む
- 属性の追加・削除・マスキングをアプリの外でやれる
- バックエンドが落ちている間のリトライとバッファリングを肩代わりできる
- 複数のバックエンドに同じデータを送れる（移行期に効く）

検証段階では直接送っても動きます。運用に入ると上のいずれかが必要になるため、最初から挟んでおくと移行の手間が減ります。

### パイプラインの構成要素

Collector の設定は 4 種類のコンポーネントの組み合わせです。

| 種類 | 役割 |
|---|---|
| Receiver | データを受け取る。OTLP、Prometheus scrape、fluentd など |
| Processor | データを加工する。バッチ、属性の書き換え、メモリ制限 |
| Exporter | データを送る。OTLP、各種 SaaS |
| Connector | パイプライン同士を繋ぐ。トレースからメトリクスを生成するなど |

これらを signal ごとのパイプラインに並べます。

### 設定ファイル

今回の構成です。

```yaml
receivers:
  otlp:
    protocols:
      grpc:
        endpoint: 0.0.0.0:4317
      http:
        endpoint: 0.0.0.0:4318

processors:
  # memory_limiter は必ず先頭に置く。
  # 流量が跳ねたときに Collector 自身が OOM で落ちるのを防ぐ。
  memory_limiter:
    check_interval: 1s
    limit_mib: 512
    spike_limit_mib: 128

  # アプリを再ビルドせずに属性を足せるのが Collector を挟む利点。
  resource/env:
    attributes:
      - key: deployment.environment.name
        value: local
        action: upsert

  # OTTL でスパン属性を加工する。ここでは機密情報になりうるキーを落とす。
  transform/redact:
    error_mode: ignore
    trace_statements:
      - delete_key(span.attributes, "user.email")

  # batch は最後に置く。送信回数を減らしスループットを上げる。
  batch:
    timeout: 1s
    send_batch_size: 1024

exporters:
  # v0.161.0 時点で otlp は otlp_grpc のエイリアス扱いになり、非推奨警告が出る。
  otlp_grpc/lgtm:
    endpoint: lgtm:4317
    tls:
      insecure: true

  # 受信した内容を Collector のログに出す。設定の切り分けに使う。
  debug:
    verbosity: normal

extensions:
  health_check:
    endpoint: 0.0.0.0:13133

service:
  extensions: [health_check]
  pipelines:
    traces:
      receivers: [otlp]
      processors: [memory_limiter, resource/env, transform/redact, batch]
      exporters: [otlp_grpc/lgtm, debug]
    metrics:
      receivers: [otlp]
      processors: [memory_limiter, resource/env, batch]
      exporters: [otlp_grpc/lgtm]
    logs:
      receivers: [otlp]
      processors: [memory_limiter, resource/env, batch]
      exporters: [otlp_grpc/lgtm]
```

processor の順番には意味があります。`memory_limiter` を先頭に置いて過負荷時にデータを落とし、`batch` を最後に置いてまとめて送ります。この 2 つは実質必須です。

`transform` は OTTL (OpenTelemetry Transformation Language) でテレメトリを書き換える processor です。上の例ではスパン属性から `user.email` を消しています。アプリ側の実装を変えずに、Collector の設定だけで機密情報の流出を止められます。

なお exporter の `otlp` は v0.161.0 で `otlp_grpc` のエイリアス扱いになり、使うと非推奨警告が出ます。新規に書くなら `otlp_grpc` です。

### agent + gateway

本番では Collector を 2 段構成にすることが多いです。

```
  [Pod]  [Pod]  [Pod]
    |      |      |
  agent  agent  agent      <- 各ノード / 各 Pod に 1 つ (DaemonSet / sidecar)
    |      |      |
    +------+------+
           |
        gateway            <- 集約する Deployment
           |
       バックエンド
```

agent はノードのメタデータ付与など、そのノードでしかできない処理を担当します。gateway はテールサンプリングのような、トレース全体を見ないとできない処理と、バックエンドごとの送信を担当します。

## サンプリング

全リクエストのトレースを保存するとコストが見合わなくなります。サンプリングには 2 種類あります。

| 方式 | タイミング | 特徴 |
|---|---|---|
| Head sampling | トレース開始時に決める | 実装が単純。エラーのトレースも同じ確率で捨てる |
| Tail sampling | トレース完了後に決める | エラーや遅いトレースだけ残せる。Collector にトレース全体を溜める必要がある |

SDK 側でやるのが head sampling です。

```go
	// ParentBased でラップすることで、親がサンプルされたトレースの子スパンは
	// 必ずサンプルされる。ラップしないとトレースが虫食いになる。
	sampler := sdktrace.ParentBased(sdktrace.TraceIDRatioBased(samplingRatio()))
```

`TraceIDRatioBased` を単体で使ってはいけません。各サービスが独立に確率判定をするため、トレースの一部だけがサンプルされた虫食い状態になります。`ParentBased` で包むと、親の判定を引き継ぐので、トレースは丸ごと残るか丸ごと捨てられるかのどちらかになります。

エラーだけは必ず残したい、という要求は head sampling では満たせません。トレースが始まった時点ではエラーになるかどうか分からないからです。この場合は Collector の `tail_sampling` processor を使います。

## 動かす

### 構成

```
                 OTLP/gRPC                 OTLP/gRPC
+-----------+   (4317)    +----------------+   (4317)   +------------------------+
| order-api | ----------> | OTel Collector | ---------> | grafana/otel-lgtm      |
|  (Go)     |             |  memory_limiter|            |  Tempo  (traces)       |
|           |             |  resource      |            |  Prometheus (metrics)  |
|           |             |  transform     |            |  Loki   (logs)         |
|           |             |  batch         |            |  Grafana (UI :3000)    |
+-----------+             +----------------+            +------------------------+
```

バックエンドには `grafana/otel-lgtm` を使います。Tempo・Prometheus・Loki・Grafana が 1 つのイメージに入っていて、OTLP をそのまま受けられるので、検証用としては最短です。

```yaml
services:
  # Go アプリ。OTLP/gRPC で Collector にのみ送る。
  app:
    build: ./app
    ports:
      - "8080:8080"
    environment:
      OTEL_EXPORTER_OTLP_ENDPOINT: http://otel-collector:4317
      # 0.0〜1.0。0.1 にすると 10% だけサンプルされる。
      OTEL_TRACES_SAMPLER_ARG: "1.0"
      DEPLOYMENT_ENV: local
    depends_on:
      - otel-collector

  # OTTL を使うため contrib ディストリビューションを使う。
  otel-collector:
    image: otel/opentelemetry-collector-contrib:0.161.0
    command: ["--config=/etc/otelcol/config.yaml"]
    volumes:
      - ./otel-collector-config.yaml:/etc/otelcol/config.yaml:ro
    ports:
      - "13133:13133" # health_check
    depends_on:
      - lgtm

  lgtm:
    image: grafana/otel-lgtm:0.33.0
    ports:
      - "3000:3000" # Grafana
```

### 実行結果

起動してリクエストを投げます。`/chain` は計装済みクライアントで自分自身の `/orders` を呼ぶエンドポイントで、context 伝播の確認用です。

```
$ docker compose up -d --build

$ curl http://localhost:8080/orders
order ord-68442 created: 7089.5 JPY

$ curl http://localhost:8080/chain
upstream responded: order ord-25460 created: 5980.3 JPY

$ curl http://localhost:8080/orders/error
payment gateway timeout
```

Collector の debug exporter が受信したスパンをログに出します。`/chain` のリクエストで作られたスパンを抜き出すと、こうなります。

```
GET /chain     071676a4e6776058aa82369886b92a10 b2e33ad7b9909beb  http.route=/chain
HTTP GET       071676a4e6776058aa82369886b92a10 cc1527fc2fc73434  url.full=http://localhost:8080/orders
GET /orders    071676a4e6776058aa82369886b92a10 d7bd3eabedf7a3df  http.route=/orders order.id=ord-25460
validateOrder  071676a4e6776058aa82369886b92a10 3b7b0599351b6f4d  order.amount=5980.3
chargePayment  071676a4e6776058aa82369886b92a10 b1c729025eec6c11  order.id=ord-25460
```

5 つのスパンが同じ Trace ID `071676a4...` を共有しています。`otelhttp` が作ったサーバスパン、クライアントスパン、呼び出された側のサーバスパン、自分で作った子スパン 2 つが 1 本のトレースに繋がっていることが確認できます。

メトリクスは Prometheus に届いています。

```
$ curl -s 'http://localhost:9090/api/v1/query?query=app_orders_created_total'

app_orders_created_total{service_name="order-api", order_status="created"} 9
app_orders_created_total{service_name="order-api", order_status="failed"} 2
```

ログは Loki に届いていて、Trace ID と Span ID が付いています。

```
$ curl -s -G 'http://localhost:3100/loki/api/v1/query_range' \
    --data-urlencode 'query={service_name="order-api"} |= "order created"'

message      : order created
severity_text: INFO
service_name : order-api
order_id     : ord-25460
order_amount : 5980.3
trace_id     : 071676a4e6776058aa82369886b92a10
span_id      : d7bd3eabedf7a3df
scope_name   : github.com/jedipunkz/opentelemetry-playground/go-otel-2026/app
```

この `trace_id` は先ほどのトレースと同じ値で、`span_id` は `GET /orders` のサーバスパンと一致しています。ログの 1 行からトレースへ、トレースからメトリクスへと辿れる状態になりました。3 つのシグナルを同じ Resource で出すことの意味がここで効いてきます。

## 2026 年のトピック

基礎から離れて、今の OpenTelemetry で動きがある部分をまとめます。

宣言的設定が stable になりました。環境変数を並べる代わりに、YAML 1 枚で SDK の構成を書けます。`OTEL_CONFIG_FILE` でファイルを指定する形で、実験段階の `OTEL_EXPERIMENTAL_CONFIG_FILE` から改名されています。言語ごとに初期化コードを書く部分が減っていく方向です。

4 つ目のシグナルである profiles が 2026 年 3 月に public alpha になりました。継続的プロファイリングをトレースと同じ枠組みで扱います。Go SDK には実装がないため、2026 年 9 月時点で Go から試す手段はありません。

ゼロコード計装は OBI (OpenTelemetry eBPF Instrumentation) に集約されました。eBPF でプロセスを外から観測するため、アプリの再ビルドが不要です。Go は Auto SDK 経由で、eBPF による自動計装と手動で書いたスパンを混在させられる唯一の言語になっています。1.0 が 2026 年の目標に掲げられています。

Semantic Conventions では、GenAI と MCP の規約が 2026 年 6 月にコアのリポジトリから分離され、`semantic-conventions-genai` に移りました。コアの安定性の基準に縛られず速く回すためです。LLM を使ったアプリの計装は、まだ Development ステータスの規約を追いかける必要があります。

Collector はまだ 1.0 に達していません。2026 年は設定スキーマの安定化が焦点です。プレリリース版の使用を禁じるポリシーを持つ組織があるため、1.0 到達は導入可否に直結します。

## つまづきポイント

計装で発生しやすい問題を、症状と原因の対で挙げます。

| 症状 | 原因 |
|---|---|
| 終了時のテレメトリが欠ける | `Shutdown` を呼んでいない。シグナルを受けてから provider を止める導線が要る |
| トレースが途中で切れる | ctx を引き回していない。`tracer.Start` の返り値の ctx を使う |
| サービスをまたぐとトレースが分断される | propagator を設定していない |
| スパンが出るのにエラーで絞れない | `RecordError` だけで `SetStatus` を呼んでいない |
| メトリクスのコストが跳ねる | 属性に ID など値の種類が多いものを入れている |
| `unknown_service` になる | Resource に `service.name` が無い |
| トレースが虫食いになる | `TraceIDRatioBased` を `ParentBased` で包んでいない |

Shutdown については、サーバを止めてから SDK を止める順番も大事です。逆にすると、処理中のリクエストが出したスパンを送れません。

```go
	// サーバを止めてから SDK を止める。順番を逆にすると
	// 処理中のリクエストが出したスパンを送れない。
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	if err := srv.Shutdown(shutdownCtx); err != nil {
		log.Printf("server shutdown error: %v", err)
	}
	if err := shutdown(shutdownCtx); err != nil {
		log.Printf("otel shutdown error: %v", err)
	}
```

## まとめ

整理すると以下のようになります。

| 項目 | 要点 |
|---|---|
| 構成要素 | 仕様 / SDK / Collector / Semantic Conventions の 4 つに分かれる |
| Resource と Attribute | 誰が出したか (Resource) と何が起きたか (Attribute) |
| ライブラリ計装 | `otelhttp` でサーバもクライアントも包める。まずこれを入れる |
| 手動スパン | `tracer.Start` の返り値の ctx を引き回す |
| エラー | `RecordError` と `SetStatus` の両方を呼ぶ |
| メトリクス | 計測器は起動時に 1 度だけ作る。属性は低カーディナリティに保つ |
| ログ | `otelslog` + `InfoContext` でトレースと相関する |
| Collector | `memory_limiter` を先頭、`batch` を最後に置く |
| サンプリング | `ParentBased` で包む。エラーだけ残すなら tail sampling |

整理して曖昧だと分かったのは、Resource と Attribute の区別、サンプリングを `ParentBased` で包む理由の 2 点でした。3 シグナルを同じ Resource で出して相関させるところまで動かすと、この 2 点の理由を確認できます。

profiles と OBI は 2026 年 9 月時点で production に投入できる段階にありません。profiles は alpha かつ Go SDK 未実装、OBI は 1.0 前です。評価する場合はステータスの再確認が必要です。

## 参考

- [OpenTelemetry Docs — Go](https://opentelemetry.io/docs/languages/go/)
- [OpenTelemetry Status](https://opentelemetry.io/status/)
- [OpenTelemetry Has Graduated… Now what?](https://opentelemetry.io/blog/2026/otel-grad-now-what/)
- [OpenTelemetry Go Logs API and SDK reach release candidate status](https://opentelemetry.io/blog/2026/go-logs-api-sdk-rc/)
- [Declarative configuration is stable!](https://opentelemetry.io/blog/2026/stable-declarative-config/)
- [OpenTelemetry Profiles Enters Public Alpha](https://opentelemetry.io/blog/2026/profiles-alpha/)
- [OpenTelemetry eBPF Instrumentation 2026 Goals](https://opentelemetry.io/blog/2026/obi-goals/)
- [OpenTelemetry Collector](https://opentelemetry.io/docs/collector/)
