---
title: "[Go 再学習] Go のテストを理解する 後編: 性能・堅牢性を確かめる"
date: 2026-10-11T12:30:00+09:00
Categories: ["go"]
draft: false
description: "Go 1.27 を前提に、b.Loop を使ったベンチマーク、サブベンチマークと benchstat、Fuzzing、testing/synctest による時間の絡むテストをサンプルコードと実行結果で解説する"
---
[前編](/post/go-testing-1/) では、テーブル駆動テストからカバレッジまで、コードが正しく動くことを確かめるテストの書き方を整理しました。後編では、正しさ以外のことを確かめるテストを扱います。

- 性能: ベンチマーク、サブベンチマーク
- 堅牢性: Fuzzing
- 時間: testing/synctest

前編と同じく Go 1.27 を前提にしていて、実行結果は Go 1.27.1 で実行したものです。ベンチマークの数値は実行環境によって変わります。

コードは以下のレポジトリにあります。

https://github.com/jedipunkz/go-playground/tree/main/testing

## パターン9: ベンチマーク

`func BenchmarkXxx(b *testing.B)` という関数を書き、`go test -bench` で処理時間とメモリ割り当てを計測するパターンです。

### 使い所

「`+` で文字列を連結するより `strings.Builder` の方が速い」とよく言われますが、自分のユースケースでどれくらい差があるのかは、測ってみないと分かりません。ベンチマークを書いておけば、実装を選ぶときや性能改善をしたときに、効果を数値で確認できます。

テスト対象として、文字列を連結する 2 つの実装を用意しました。

```go
package concat

import "strings"

// Plus は + 演算子で文字列を連結する
func Plus(words []string) string {
	s := ""
	for _, w := range words {
		s += w
	}
	return s
}

// Builder は strings.Builder で文字列を連結する
func Builder(words []string) string {
	var sb strings.Builder
	for _, w := range words {
		sb.WriteString(w)
	}
	return sb.String()
}
```

ベンチマークは `for b.Loop() { ... }` の中に計測したい処理を書きます。

```go
package concat

import (
	"fmt"
	"testing"
)

func makeWords(n int) []string {
	words := make([]string, n)
	for i := range words {
		words[i] = "go"
	}
	return words
}

func BenchmarkPlus(b *testing.B) {
	words := makeWords(100) // ループの外で準備する
	for b.Loop() {
		Plus(words)
	}
}

func BenchmarkBuilder(b *testing.B) {
	words := makeWords(100)
	b.ReportAllocs() // -benchmem なしでもメモリ割り当てを出力する
	for b.Loop() {
		Builder(words)
	}
}
```

`b.Loop()` には次の性質があります。

- 最初に呼ばれたときにタイマーをリセットするので、ループの前に書いた準備 (`makeWords`) は計測に含まれない
- 十分な計測ができるまで `true` を返し続ける。繰り返し回数は `testing` パッケージが決める
- ループ内の関数呼び出しの引数と戻り値は保持されるので、結果を使っていない `Plus(words)` がコンパイラの最適化で消されることがない

### 実行結果

`-bench` にはベンチマーク名にマッチする正規表現を指定します。`-run='^$'` は、通常のテストを実行しないための指定です。

```
$ go test -bench='^Benchmark(Plus|Builder)$' -run='^$' ./concat/
goos: darwin
goarch: arm64
pkg: github.com/jedipunkz/go-playground/testing/concat
cpu: Apple M3
BenchmarkPlus-8      	  473866	      2335 ns/op
BenchmarkBuilder-8   	 3261914	       367.2 ns/op	     504 B/op	       6 allocs/op
PASS
ok  	github.com/jedipunkz/go-playground/testing/concat	2.528s
```

各列の意味は以下です。

| 列 | 意味 |
|---|---|
| `BenchmarkPlus-8` | ベンチマーク名。`-8` は実行時の GOMAXPROCS |
| `473866` | 計測に使った繰り返し回数 |
| `2335 ns/op` | 1 回あたりの処理時間 |
| `504 B/op` | 1 回あたりに割り当てたメモリのバイト数 |
| `6 allocs/op` | 1 回あたりのメモリ割り当て回数 |

`b.ReportAllocs()` を呼んだ `BenchmarkBuilder` だけ、メモリ割り当ての列が出ています。全ベンチマークで出すには `-benchmem` を付けます。

```
$ go test -bench='^Benchmark(Plus|Builder)$' -benchmem -run='^$' ./concat/
goos: darwin
goarch: arm64
pkg: github.com/jedipunkz/go-playground/testing/concat
cpu: Apple M3
BenchmarkPlus-8      	  484014	      2258 ns/op	   10736 B/op	      99 allocs/op
BenchmarkBuilder-8   	 3260055	       367.4 ns/op	     504 B/op	       6 allocs/op
PASS
ok  	github.com/jedipunkz/go-playground/testing/concat	2.355s
```

100 個の文字列を連結する場合、`+` は `strings.Builder` の約 6 倍遅く、メモリ割り当ても 99 回対 6 回です。`+` は連結のたびに新しい文字列を作るので、要素数とほぼ同じ回数の割り当てが発生しています。

計測時間はデフォルトで 1 ベンチマークあたり 1 秒です。`-benchtime=3s` で時間を、`-benchtime=100x` で繰り返し回数を指定できます。

## パターン10: サブベンチマーク

`b.Run` を使って、1 つのベンチマーク関数の中で条件を変えた複数のベンチマークを実行するパターンです。

### 使い所

パターン 9 では要素数を 100 に固定していましたが、実装の差は入力のサイズによって変わることがあります。サイズごとにベンチマーク関数を書くと同じコードが並ぶので、テストのサブテストと同じように、条件をループで回して `b.Run` で実行します。

```go
func BenchmarkConcat(b *testing.B) {
	for _, n := range []int{10, 100, 1000} {
		words := makeWords(n)
		b.Run(fmt.Sprintf("impl=Plus/n=%d", n), func(b *testing.B) {
			for b.Loop() {
				Plus(words)
			}
		})
		b.Run(fmt.Sprintf("impl=Builder/n=%d", n), func(b *testing.B) {
			for b.Loop() {
				Builder(words)
			}
		})
	}
}
```

サブベンチマークの名前を `impl=Plus/n=10` のように `キー=値` の形にしているのは、後で benchstat で集計しやすくするためです。

### 実行結果

```
$ go test -bench=BenchmarkConcat -benchmem -run='^$' ./concat/
goos: darwin
goarch: arm64
pkg: github.com/jedipunkz/go-playground/testing/concat
cpu: Apple M3
BenchmarkConcat/impl=Plus/n=10-8         	 7697257	       152.2 ns/op	     128 B/op	       9 allocs/op
BenchmarkConcat/impl=Builder/n=10-8      	19721880	        62.06 ns/op	      56 B/op	       3 allocs/op
BenchmarkConcat/impl=Plus/n=100-8        	  509649	      2336 ns/op	   10736 B/op	      99 allocs/op
BenchmarkConcat/impl=Builder/n=100-8     	 2803192	       438.0 ns/op	     504 B/op	       6 allocs/op
BenchmarkConcat/impl=Plus/n=1000-8       	   13396	     88106 ns/op	 1063866 B/op	     999 allocs/op
BenchmarkConcat/impl=Builder/n=1000-8    	  305379	      3934 ns/op	    5368 B/op	      10 allocs/op
PASS
ok  	github.com/jedipunkz/go-playground/testing/concat	7.254s
```

要素数が 10 倍になるごとに、`+` の処理時間は約 15 倍、約 38 倍と増えていますが、`strings.Builder` はほぼ要素数に比例して増えています。

### benchstat で比較する

ベンチマークの結果は実行ごとにばらつくので、1 回の結果だけで「速くなった」と判断するのは危険です。`-count` で複数回実行し、[benchstat](https://pkg.go.dev/golang.org/x/perf/cmd/benchstat) で統計的に比較します。

```
$ go test -bench=BenchmarkConcat -benchmem -run='^$' -count=6 ./concat/ > bench.txt
$ go run golang.org/x/perf/cmd/benchstat@latest -col /impl bench.txt
goos: darwin
goarch: arm64
pkg: github.com/jedipunkz/go-playground/testing/concat
cpu: Apple M3
                │     Plus     │              Builder               │
                │    sec/op    │   sec/op     vs base               │
Concat/n=10-8     151.60n ± 0%   60.85n ± 1%  -59.86% (p=0.002 n=6)
Concat/n=100-8    2257.5n ± 4%   420.0n ± 1%  -81.39% (p=0.002 n=6)
Concat/n=1000-8   84.252µ ± 3%   3.925µ ± 6%  -95.34% (p=0.002 n=6)
geomean            3.066µ        464.7n       -84.85%

                │      Plus       │               Builder               │
                │      B/op       │     B/op      vs base               │
Concat/n=10-8         128.00 ± 0%     56.00 ± 0%  -56.25% (p=0.002 n=6)
Concat/n=100-8       10736.0 ± 0%     504.0 ± 0%  -95.31% (p=0.002 n=6)
Concat/n=1000-8   1038.933Ki ± 0%   5.242Ki ± 0%  -99.50% (p=0.002 n=6)
geomean              11.08Ki          533.1       -95.30%

                │    Plus     │              Builder              │
                │  allocs/op  │ allocs/op   vs base               │
Concat/n=10-8      9.000 ± 0%   3.000 ± 0%  -66.67% (p=0.002 n=6)
Concat/n=100-8    99.000 ± 0%   6.000 ± 0%  -93.94% (p=0.002 n=6)
Concat/n=1000-8   999.00 ± 0%   10.00 ± 0%  -99.00% (p=0.002 n=6)
geomean            96.19        5.646       -94.13%
```

`-col /impl` は、サブベンチマーク名の `impl=` の値 (`Plus` と `Builder`) を列にして比較する指定です。`Plus` を基準 (base) に、`Builder` がどれだけ変化したかが表示されています。

- `± 0%` は 6 回の計測のばらつき
- `p=0.002` は差が偶然である確率の目安。小さいほど、差が統計的に有意と言える
- `n=6` は比較に使った計測回数

改修前後の比較では、改修前の結果を `old.txt`、改修後の結果を `new.txt` に保存し、`benchstat old.txt new.txt` と 2 つのファイルを渡すのが一般的な使い方です。

## パターン11: Fuzzing

`func FuzzXxx(f *testing.F)` という関数を書き、ランダムに生成した入力でテスト対象を呼び出して、想定外の入力で壊れないかを確かめるパターンです。

### 使い所

テーブル駆動テストでは、テストを書く人が思いついた入力しか検証できません。Fuzzing は、seed (起点となる入力) を少しずつ変化させた入力を大量に生成し、コードを壊す入力を探してくれます。特に、文字列やバイト列をパースする処理のように入力の組み合わせが膨大なコードで効果を発揮します。

Fuzzing では「この入力ならこの出力」という期待値を書けないので、代わりに「どんな入力でも成り立つべき性質」を検証します。前編のパターン 2 で直した `Reverse` (rune 単位で反転する版) を対象に、次の 2 つの性質を検証します。

1. 2 回反転すると元の文字列に戻る
2. 正しい UTF-8 の文字列を反転した結果も、正しい UTF-8 である

```go
package strutil

import (
	"testing"
	"unicode/utf8"
)

func FuzzReverse(f *testing.F) {
	// seed corpus: 入力を生成するときの起点になる値
	for _, s := range []string{"abc", "あいう", "", "héllo"} {
		f.Add(s)
	}

	f.Fuzz(func(t *testing.T, s string) {
		rev := Reverse(s)
		// 性質 1: 2 回反転すると元に戻る
		if got := Reverse(rev); got != s {
			t.Errorf("Reverse(Reverse(%q)) = %q", s, got)
		}
		// 性質 2: 正しい UTF-8 を反転しても正しい UTF-8 のまま
		if utf8.ValidString(s) && !utf8.ValidString(rev) {
			t.Errorf("Reverse(%q) = %q is not valid UTF-8", s, rev)
		}
	})
}
```

`f.Add` で登録した値と `f.Fuzz` に渡す関数の引数 (`*testing.T` の後ろ) は、型を一致させる必要があります。

### 実行結果

`-fuzz` を付けずに実行すると、seed だけを入力にした通常のテストとして動きます。

```
$ go test -run FuzzReverse -v ./strutil/
=== RUN   FuzzReverse
=== RUN   FuzzReverse/seed#0
=== RUN   FuzzReverse/seed#1
=== RUN   FuzzReverse/seed#2
=== RUN   FuzzReverse/seed#3
--- PASS: FuzzReverse (0.00s)
    --- PASS: FuzzReverse/seed#0 (0.00s)
    --- PASS: FuzzReverse/seed#1 (0.00s)
    --- PASS: FuzzReverse/seed#2 (0.00s)
    --- PASS: FuzzReverse/seed#3 (0.00s)
PASS
ok  	github.com/jedipunkz/go-playground/testing/strutil	0.265s
```

`-fuzz` を付けると、入力を生成しながら実行し続けます。`-fuzztime` で実行時間を指定できます (指定しないと失敗が見つかるか Ctrl+C で止めるまで続きます)。

```
$ go test -fuzz=FuzzReverse -fuzztime=30s ./strutil/
fuzz: elapsed: 0s, gathering baseline coverage: 0/4 completed
fuzz: elapsed: 0s, gathering baseline coverage: 4/4 completed, now fuzzing with 8 workers
fuzz: minimizing 45-byte failing input file
fuzz: elapsed: 0s, minimizing
--- FAIL: FuzzReverse (0.02s)
    --- FAIL: FuzzReverse (0.00s)
        fuzz_test.go:18: Reverse(Reverse("\xbf")) = "�"
    
    Failing input written to testdata/fuzz/FuzzReverse/9783172430fa24ae
    To re-run:
    go test -run=FuzzReverse/9783172430fa24ae
FAIL
exit status 1
FAIL	github.com/jedipunkz/go-playground/testing/strutil	0.292s
```

一瞬で失敗する入力が見つかりました。最初に見つかったのは 45 バイトの入力でしたが、Fuzzing のエンジンが失敗を再現できる最小の入力 (minimizing) まで縮めて、`"\xbf"` という 1 バイトを報告しています。

`\xbf` は UTF-8 として不正なバイトです。`[]rune(s)` で rune のスライスに変換すると、不正なバイトは置換文字 `U+FFFD` (`�`) に置き換えられます。そのため、反転して元に戻すと `"\xbf"` ではなく `"�"` になり、性質 1 が崩れていました。前編のテーブル駆動テストでは思いつかなかった入力です。

失敗した入力は `testdata/fuzz/FuzzReverse/` に保存されています。

```
$ cat testdata/fuzz/FuzzReverse/9783172430fa24ae
go test fuzz v1
string("\xbf")
```

このファイルは以後 seed として扱われるので、`-fuzz` を付けない通常の `go test` でも実行されます。つまり、見つかったバグは自動で回帰テストになります。

```
$ go test ./strutil/
--- FAIL: FuzzReverse (0.00s)
    --- FAIL: FuzzReverse/9783172430fa24ae (0.00s)
        fuzz_test.go:18: Reverse(Reverse("\xbf")) = "�"
FAIL
FAIL	github.com/jedipunkz/go-playground/testing/strutil	0.078s
FAIL
```

`Reverse` の仕様を「不正な UTF-8 を含む場合は反転せずにそのまま返す」と決めて修正します。

```go
package strutil

import "unicode/utf8"

// Reverse は文字列を rune 単位で反転する
// 不正な UTF-8 を含む場合は反転せずにそのまま返す
func Reverse(s string) string {
	if !utf8.ValidString(s) {
		return s
	}
	r := []rune(s)
	for i, j := 0, len(r)-1; i < j; i, j = i+1, j-1 {
		r[i], r[j] = r[j], r[i]
	}
	return string(r)
}
```

保存された入力を含めてテストが通るようになり、再度 Fuzzing しても失敗は見つからなくなりました。

```
$ go test -run FuzzReverse -v ./strutil/
=== RUN   FuzzReverse
...
--- PASS: FuzzReverse (0.00s)
    --- PASS: FuzzReverse/seed#0 (0.00s)
    --- PASS: FuzzReverse/seed#1 (0.00s)
    --- PASS: FuzzReverse/seed#2 (0.00s)
    --- PASS: FuzzReverse/seed#3 (0.00s)
    --- PASS: FuzzReverse/9783172430fa24ae (0.00s)
PASS
ok  	github.com/jedipunkz/go-playground/testing/strutil	0.220s

$ go test -fuzz=FuzzReverse -fuzztime=20s ./strutil/
...
fuzz: elapsed: 18s, execs: 2984458 (714817/sec), new interesting: 37 (total: 42)
fuzz: elapsed: 21s, execs: 3089971 (35181/sec), new interesting: 40 (total: 45)
fuzz: elapsed: 21s, execs: 3089971 (0/sec), new interesting: 40 (total: 45)
PASS
ok  	github.com/jedipunkz/go-playground/testing/strutil	21.283s
```

`execs` は実行した入力の数、`new interesting` はコードの新しい経路を通った (カバレッジを広げた) 入力の数です。Fuzzing のエンジンはこうした入力を優先して変化させることで、効率よく未知の経路を探します。

`-fuzz` には 1 つの Fuzz テストにだけマッチする正規表現を指定し、パッケージも 1 つだけ指定する必要があります。

## パターン12: testing/synctest

`testing/synctest` パッケージを使って、時間や goroutine が絡むコードを、偽の時計の上で決定的にテストするパターンです。

### 使い所

TTL 付きのキャッシュや、一定間隔で動くバックグラウンド処理、タイムアウト処理をテストしようとすると、困ることが 2 つあります。

- 実際に時間が経つのを待つと、テストが遅くなる (TTL が 5 分なら 5 分以上かかる)
- 待ち時間を短くすると、goroutine のスケジューリング次第で成功したり失敗したりする (flaky になる)

`synctest.Test` の中 (bubble と呼ばれます) では、`time` パッケージが偽の時計を使います。偽の時計は、bubble 内のすべての goroutine がブロックしたときにだけ進みます。そのため、何分待つテストでも実時間では一瞬で終わり、しかも毎回同じ順序で実行されます。

| API | 内容 |
|---|---|
| `synctest.Test(t, f)` | `f` を bubble の中で実行する。偽の時計は 2000-01-01 00:00 UTC から始まる |
| `synctest.Wait()` | bubble 内の他の goroutine がすべてブロックするまで待つ |
| `synctest.Sleep(d)` | `time.Sleep(d)` と `synctest.Wait()` を続けて呼ぶのと同じ |

### TTL のテスト

TTL 付きのキャッシュと、期限切れのエントリを定期的に削除する goroutine を用意しました。

```go
package cache

import (
	"context"
	"sync"
	"time"
)

type entry struct {
	value     string
	expiresAt time.Time
}

// Cache は TTL 付きのインメモリキャッシュ
type Cache struct {
	mu    sync.Mutex
	ttl   time.Duration
	items map[string]entry
}

func New(ttl time.Duration) *Cache {
	return &Cache{ttl: ttl, items: map[string]entry{}}
}

func (c *Cache) Set(key, value string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.items[key] = entry{value: value, expiresAt: time.Now().Add(c.ttl)}
}

func (c *Cache) Get(key string) (string, bool) {
	c.mu.Lock()
	defer c.mu.Unlock()
	e, ok := c.items[key]
	if !ok || time.Now().After(e.expiresAt) {
		return "", false
	}
	return e.value, true
}

func (c *Cache) Len() int {
	c.mu.Lock()
	defer c.mu.Unlock()
	return len(c.items)
}

// StartCleanup は interval ごとに期限切れのエントリを削除する goroutine を起動する
func (c *Cache) StartCleanup(ctx context.Context, interval time.Duration) {
	go func() {
		ticker := time.NewTicker(interval)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case now := <-ticker.C:
				c.mu.Lock()
				for k, e := range c.items {
					if now.After(e.expiresAt) {
						delete(c.items, k)
					}
				}
				c.mu.Unlock()
			}
		}
	}()
}
```

テストコードです。キャッシュ側のコードには、テストのための仕掛け (時計の差し替えなど) を何も入れていない点に注目してください。

```go
package cache

import (
	"context"
	"testing"
	"testing/synctest"
	"time"
)

func TestCacheTTL(t *testing.T) {
	synctest.Test(t, func(t *testing.T) {
		c := New(5 * time.Minute)
		c.Set("user:1", "jedi")
		start := time.Now()

		// bubble 内では偽の時計が使われるので、実時間では一瞬で終わる
		time.Sleep(4 * time.Minute)
		if _, ok := c.Get("user:1"); !ok {
			t.Fatal("期限切れ前にエントリが消えている")
		}

		time.Sleep(2 * time.Minute)
		if _, ok := c.Get("user:1"); ok {
			t.Fatal("期限切れ後もエントリが残っている")
		}
		t.Logf("start = %v, elapsed = %v", start, time.Since(start))
	})
}

func TestCacheCleanup(t *testing.T) {
	synctest.Test(t, func(t *testing.T) {
		ctx, cancel := context.WithCancel(t.Context())
		defer cancel()

		c := New(time.Minute)
		c.StartCleanup(ctx, 10*time.Second)
		c.Set("user:1", "jedi")

		// 時間を進め、cleanup goroutine が処理を終えて待機状態になるまで待つ
		synctest.Sleep(time.Minute + 10*time.Second)
		if n := c.Len(); n != 0 {
			t.Fatalf("Len() = %d, want 0", n)
		}
	})
}
```

`TestCacheCleanup` で `time.Sleep` ではなく `synctest.Sleep` を使っているのには理由があります。70 秒後の時点で、テストの goroutine と cleanup の goroutine (ticker が発火) が同時に動き出せる状態になるので、`time.Sleep` だけだとどちらが先に動くかは決まりません。`synctest.Sleep` は時間を進めた後、cleanup の goroutine が削除を終えて再び ticker を待つ状態になるまで待ってくれるので、結果が決定的になります。

待つ時間が TTL ちょうどの 1 分ではなく 1 分 10 秒なのは、1 分の時点では `now.After(e.expiresAt)` が false (同時刻) なので削除されず、次の ticker (70 秒) で削除されるためです。偽の時計は完全に決定的なので、こうした境界の挙動も正確にテストできます。

### 実行結果

```
$ go test -run TestCache -v ./cache/
=== RUN   TestCacheTTL
    cache_test.go:27: start = 2000-01-01 09:00:00 +0900 JST, elapsed = 6m0s
--- PASS: TestCacheTTL (0.00s)
=== RUN   TestCacheCleanup
--- PASS: TestCacheCleanup (0.00s)
PASS
ok  	github.com/jedipunkz/go-playground/testing/cache	0.244s
```

テストの中では 6 分経過していますが、実際の実行時間は 0.00s です。偽の時計が 2000-01-01 00:00 UTC (JST で 09:00) から始まっていることも確認できます。

### タイムアウトのテスト

前編のパターン 6 で作った天気 API のクライアントについて、API の応答が遅いときにタイムアウトすることをテストします。`httptest.NewTestServer` は、インメモリの偽ネットワーク上でテスト用サーバを立てる関数で、synctest の bubble の中で使えます。

```go
package weather

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"testing/synctest"
	"time"
)

func TestClientTimeout(t *testing.T) {
	synctest.Test(t, func(t *testing.T) {
		// 応答に 10 秒かかる外部 API を、インメモリの偽ネットワーク上に立てる
		srv := httptest.NewTestServer(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			select {
			case <-time.After(10 * time.Second):
				json.NewEncoder(w).Encode(Forecast{City: "tokyo", Weather: "sunny"})
			case <-r.Context().Done(): // クライアントが諦めたら終了する
			}
		}))

		hc := srv.Client()
		hc.Timeout = 3 * time.Second
		c := &Client{BaseURL: srv.URL, HTTPClient: hc}

		start := time.Now()
		_, err := c.Get(t.Context(), "tokyo")
		if err == nil {
			t.Fatal("Get() error = nil, want timeout")
		}
		t.Logf("err = %v, elapsed (fake clock) = %v", err, time.Since(start))
	})
}
```

`NewTestServer` はテストの終了時に自動でサーバを閉じるので、`defer srv.Close()` は不要です。

### 実行結果

```
$ go test -run TestClientTimeout -v ./weather/
=== RUN   TestClientTimeout
    timeout_test.go:32: err = Get "http://example.com/forecast?city=tokyo": context deadline exceeded, elapsed (fake clock) = 3s
--- PASS: TestClientTimeout (0.00s)
PASS
ok  	github.com/jedipunkz/go-playground/testing/weather	0.255s
```

偽の時計でちょうど 3 秒後にタイムアウトしています。偽ネットワーク上のサーバの URL は `http://example.com` になっていて、実際のネットワークには一切出ていません。

最初に書いたハンドラは `time.Sleep(10 * time.Second)` で単純に待つだけでしたが、そうするとクライアントがタイムアウトした後もハンドラが動き続け、サーバを閉じるときに「接続が残っている」という警告が出ました。ハンドラ側も `r.Context()` でキャンセルを受け取るようにしておくのは、本番のコードでも大事なことです。

## まとめ

後編では、性能・堅牢性・時間を確かめるテストを整理しました。

- ベンチマークは `for b.Loop()` で書く。ループ前の準備は計測されず、ループ内の処理が最適化で消されることもない
- `-benchmem` か `b.ReportAllocs()` でメモリ割り当ても計測する
- サブベンチマークで入力サイズごとに比較し、`-count` で複数回実行した結果を benchstat で統計的に比較する
- Fuzzing では期待値の代わりに「どんな入力でも成り立つ性質」を書く。見つかった失敗入力は `testdata/fuzz` に保存され、そのまま回帰テストになる
- `testing/synctest` の bubble の中では偽の時計が使われ、時間の絡むテストが一瞬で、しかも決定的に終わる。`httptest.NewTestServer` と組み合わせれば、タイムアウトのテストもネットワークなしで書ける

前編と合わせて、標準の `testing` パッケージだけでかなりのことができると分かりました。特に Fuzzing と synctest は、自分では書いたことがなかったのですが、実際に動かしてみると Fuzzing は数十秒でテーブル駆動テストの見落としを見つけてくれましたし、synctest はテスト対象のコードに手を入れずに TTL やタイムアウトをテストできました。どちらも今後は積極的に使っていきたいと思います。

## 参考

- [[Go 再学習] Go のテストを理解する 前編: 正しさを確かめる](/post/go-testing-1/)
- [testing package](https://pkg.go.dev/testing)
- [testing/synctest package](https://pkg.go.dev/testing/synctest)
- [net/http/httptest package](https://pkg.go.dev/net/http/httptest)
- [Go Fuzzing](https://go.dev/doc/security/fuzz/)
- [benchstat](https://pkg.go.dev/golang.org/x/perf/cmd/benchstat)
- [Go 1.27 Release Notes](https://go.dev/doc/go1.27)
