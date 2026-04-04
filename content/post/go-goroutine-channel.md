---
title: "Go の goroutine と channel を理解する"
date: 2026-04-04T00:00:00+09:00
Categories: ["go"]
draft: false
description: "Go の並行処理の基本である goroutine と channel を、実践的なパターンとサンプルコードで解説する"
---
再び Go の学習を再開していて、以前理解が曖昧だった点を重点的に学び直しています。そのうちの1つ goroutine, channel について記事にしょうと思います。

Go の並行処理は goroutine と channel という2つの仕組みを中心に設計されています。channel を通じてデータをやり取りすることで安全な並行処理を実現できます。この記事ではサンプルコードを交えて解説します。

コードは以下のレポジトリにあります。

https://github.com/jedipunkz/go-tips

## goroutine とは

goroutine は Go のランタイムが管理する軽量なスレッドです。`go` キーワードをつけて関数を呼び出すだけで並行実行できます。

通常の関数呼び出しは呼び出し元が処理完了を待ちますが、`go` をつけると呼び出し元はすぐに次の処理へ進み、関数は別の goroutine で並行して動きます。


## channel とは

channel は goroutine 間でデータを安全にやり取りするためのパイプです。`make(chan T)` で作成し、`<-` 演算子で送受信します。

- 送信: `ch <- value`
- 受信: `value := <-ch`

channel を使うと goroutine 間で双方向にデータをやり取りできます。

channel にはバッファなしとバッファありの2種類があります。バッファなし channel は送受信が揃うまでブロックするため、goroutine 間の同期点として機能します。バッファあり channel はバッファに空きがある限り送信側はブロックせず先へ進めます。

## パターン1: 基本的な channel の使い方

まずは最もシンプルなパターンです。producer goroutine が値を送信し、main goroutine が受信します。

### 使い所

Web から複数のファイルをダウンロードして DB に保存するような処理を考えると、ネットワーク待ちや DB への書き込み待ちがほとんどで CPU はほぼ遊んでいます。こういった I/O バウンドな処理では、1件ずつ順番に処理するより goroutine と channel でパイプライン化するほうが効率的です。たとえば「URL リストを読み込む goroutine」と「その URL から HTTP GET する goroutine」を分離し、channel でつなぐことで取得と後続処理を並行して進められます。

```go
package main

import "fmt"

func producer(ch chan<- int) {
	for i := 1; i <= 5; i++ {
		fmt.Printf("送信: %d\n", i)
		ch <- i
	}
	close(ch)
}

func main() {
	ch := make(chan int)

	go producer(ch)

	for v := range ch {
		fmt.Printf("受信: %d\n", v)
	}
}
```

`chan<- int` は送信専用 channel を表す型です。関数の引数でこのように型を絞ることで、誤った方向での操作をコンパイル時に防げます。`close(ch)` を呼ぶと `for range` ループが終了します。

### 実行結果

```
送信: 1
送信: 2
受信: 1
受信: 2
送信: 3
送信: 4
受信: 3
受信: 4
送信: 5
受信: 5
```

送信と受信が交互に出力されているのは、バッファなし channel のため送信側が受信側の準備を待つためです。

## パターン2: 並行処理

複数の goroutine で並列にタスクを実行し、結果を収集するパターンです。`sync.WaitGroup` を使って全 worker の完了を待ちます。

### 使い所

Web から N 件のファイルをダウンロードして DB に保存する処理は、1件あたりの時間のほとんどがネットワーク待ちと DB 書き込み待ちです。CPU はほぼ使わないため、goroutine で並列化しても CPU の奪い合いにならず、単純にスループットが上がります。このパターンでは各 URL をワーカーに割り当て、全件完了を `WaitGroup` で待ちつつ結果を channel で収集することで、順次処理に比べて大幅に処理時間を短縮できます。

```go
package main

import (
	"fmt"
	"sync"
)

func worker(id int, wg *sync.WaitGroup, results chan<- string) {
	defer wg.Done()
	result := fmt.Sprintf("worker %d の処理完了", id)
	results <- result
}

func main() {
	const numWorkers = 5
	results := make(chan string, numWorkers)

	var wg sync.WaitGroup
	for i := 1; i <= numWorkers; i++ {
		wg.Add(1)
		go worker(i, &wg, results)
	}

	// 全 worker 完了後にチャンネルをクローズ
	go func() {
		wg.Wait()
		close(results)
	}()

	for r := range results {
		fmt.Println(r)
	}
}
```

`results` をバッファあり channel (`make(chan string, numWorkers)`) にすることで、受信側の準備が整う前に全 worker が送信を完了できます。`wg.Wait()` の後に `close` する goroutine を別途起動することで、`for range` による結果の収集と並行して待機処理が走ります。

### 実行結果

```
worker 1 の処理完了
worker 2 の処理完了
worker 3 の処理完了
worker 4 の処理完了
worker 5 の処理完了
```

goroutine のスケジューリングにより順序は実行ごとに変わる可能性があります。

## パターン3: 複数 channel の合流

複数の channel からのデータを1つの channel に合流させるパターンです。

### 使い所

複数の外部 API に問い合わせて結果をまとめて返す処理に向いています。たとえばユーザー情報サービス・注文サービス・在庫サービスに並列リクエストを送り、全ての応答が揃ったらレスポンスを組み立てるケースです。各サービスへのリクエストはネットワーク待ちなので CPU は使わず、直列に呼ぶと 3 サービス分の待ち時間が積み重なりますが、並列化すれば最も遅いサービスの応答時間だけで済みます。

```go
package main

import (
	"fmt"
	"sync"
)

func generate(id int, vals ...int) <-chan int {
	ch := make(chan int)
	go func() {
		defer close(ch)
		for _, v := range vals {
			fmt.Printf("source %d: 送信 %d\n", id, v)
			ch <- v
		}
	}()
	return ch
}

func merge(channels ...<-chan int) <-chan int {
	merged := make(chan int)
	var wg sync.WaitGroup

	forward := func(ch <-chan int) {
		defer wg.Done()
		for v := range ch {
			merged <- v
		}
	}

	wg.Add(len(channels))
	for _, ch := range channels {
		go forward(ch)
	}

	go func() {
		wg.Wait()
		close(merged)
	}()

	return merged
}

func main() {
	ch1 := generate(1, 1, 2, 3)
	ch2 := generate(2, 4, 5, 6)
	ch3 := generate(3, 7, 8, 9)

	for v := range merge(ch1, ch2, ch3) {
		fmt.Printf("受信: %d\n", v)
	}
}
```

`<-chan int` は受信専用 channel を表します。`generate` 関数は channel を返し、呼び出し側は送信を気にせず受信だけに集中できます。`merge` では各 source channel に対して goroutine を起動し、全て完了したら merged channel を close します。

### 実行結果

```
source 1: 送信 1
source 2: 送信 4
source 1: 送信 2
source 3: 送信 7
source 3: 送信 8
source 1: 送信 3
受信: 1
受信: 7
受信: 2
受信: 3
受信: 8
source 3: 送信 9
受信: 9
受信: 4
source 2: 送信 5
source 2: 送信 6
受信: 5
受信: 6
```

複数の source が並列に動いているため、送信順序と受信順序が一致しない点に注目してください。受信側ではソースを意識せず全データを順次処理できます。

## パターン4: スロットリング

同時実行数を制限したい場合、バッファあり channel をセマフォとして使うパターンが有効です。

### 使い所

Web から大量のファイルをダウンロードして DB に保存する処理を goroutine で並列化した場合、制限なく goroutine を起動すると DB コネクションを使い果たしたり、接続先サーバーのレート制限に引っかかったりします。このパターンではセマフォで同時実行数に上限を設けることで、並列化によるスループット向上と、リソース枯渇や外部制限への抵触を防ぐ安全性を両立できます。`golang.org/x/sync/semaphore` パッケージを使う方法もありますが、channel でシンプルに実装できます。

```go
package main

import (
	"fmt"
	"time"
)

func task(id int, sem chan struct{}, done chan<- struct{}) {
	sem <- struct{}{} // セマフォ取得（空きがなければブロック）
	defer func() {
		<-sem // セマフォ解放
		done <- struct{}{}
	}()

	fmt.Printf("タスク %d 開始\n", id)
	time.Sleep(500 * time.Millisecond) // 処理時間をシミュレート
	fmt.Printf("タスク %d 完了\n", id)
}

func main() {
	const (
		numTasks    = 10
		concurrency = 3 // 同時実行数の上限
	)

	sem := make(chan struct{}, concurrency)
	done := make(chan struct{}, numTasks)

	for i := 1; i <= numTasks; i++ {
		go task(i, sem, done)
	}

	for i := 0; i < numTasks; i++ {
		<-done
	}
	fmt.Println("全タスク完了")
}
```

`make(chan struct{}, concurrency)` でバッファサイズ=同時実行数の上限となるセマフォを作ります。`struct{}` はサイズ0の型なのでメモリ効率が良いです。`sem <- struct{}{}` でセマフォを取得し、バッファが満杯なら空きができるまでブロックします。

### 実行結果

```
タスク 10 開始
タスク 1 開始
タスク 5 開始
タスク 1 完了
タスク 3 開始
タスク 10 完了
タスク 2 開始
タスク 5 完了
タスク 7 開始
タスク 2 完了
タスク 6 開始
タスク 3 完了
タスク 4 開始
タスク 7 完了
タスク 8 開始
タスク 4 完了
タスク 8 完了
タスク 9 開始
タスク 6 完了
タスク 9 完了
全タスク完了
```

10タスクあるにもかかわらず、同時に「開始」が表示されるのは最大3つまでに制限されています。あるタスクが「完了」した直後に次のタスクが「開始」するという動きが確認できます。

## パターン5: タイムアウト処理

`context.WithTimeout` と `select` を組み合わせることで、処理のタイムアウトをシンプルに実装できます。

### 使い所

Web アプリのハンドラーが外部 API や DB に問い合わせる処理は、相手の応答を待つだけで CPU はほぼ使いません。しかし相手が遅延や障害を起こすと、そのままではレスポンスが返らずユーザーを長時間待たせてしまいます。`context.WithTimeout` を使うことで「N 秒以内に応答がなければエラーを返す」という SLA をコードで表現できます。`net/http` のリクエストハンドラーでは `r.Context()` を downstream の呼び出しにそのまま渡すのが定石で、クライアントが接続を切った瞬間に進行中の DB クエリや HTTP リクエストも連鎖してキャンセルされます。

```go
package main

import (
	"context"
	"fmt"
	"time"
)

func slowTask(ctx context.Context, result chan<- string) {
	select {
	case <-time.After(2 * time.Second): // 重い処理をシミュレート
		result <- "処理完了"
	case <-ctx.Done():
		fmt.Println("タスクがキャンセルされました:", ctx.Err())
		return
	}
}

func run(timeout time.Duration) {
	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()

	result := make(chan string, 1)
	go slowTask(ctx, result)

	select {
	case r := <-result:
		fmt.Println("成功:", r)
	case <-ctx.Done():
		fmt.Println("タイムアウト:", ctx.Err())
	}
}

func main() {
	fmt.Println("=== タイムアウトなし (3秒) ===")
	run(3 * time.Second)

	fmt.Println("=== タイムアウトあり (1秒) ===")
	run(1 * time.Second)
}
```

`select` は複数の channel 操作を同時に待機し、最初に準備できたものを実行します。`ctx.Done()` は context がキャンセルまたはタイムアウトした時に close される channel です。`defer cancel()` を忘れずに呼ぶことで、タイムアウト前に処理が完了した場合もリソースが解放されます。

### 実行結果

```
=== タイムアウトなし (3秒) ===
成功: 処理完了
=== タイムアウトあり (1秒) ===
タスクがキャンセルされました: context deadline exceeded
タイムアウト: context deadline exceeded
```

タイムアウトが 3 秒の場合は処理（2秒）が完了して「成功」となります。タイムアウトが 1 秒の場合は処理完了前に deadline を超えるため、goroutine 内でもキャンセルを検知して早期リターンし、呼び出し元でもタイムアウトとして扱われています。


