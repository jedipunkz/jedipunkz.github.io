---
title: "[Go 再学習] Go のテストを理解する 前編: 正しさを確かめる"
date: 2026-10-11T12:00:00+09:00
Categories: ["go"]
draft: false
description: "Go 1.27 を前提に、テーブル駆動テスト、サブテスト、並列実行、テストヘルパー、テストダブル、httptest、Example テスト、カバレッジをサンプルコードと実行結果で解説する"
---
Go の再学習を続けています。今回はテストです。テーブル駆動テストやサブテスト、ベンチマークは普段から書いているのですが、それ以外にどんな書き方や機能があるのかを網羅的には把握できていませんでした。そこで標準の `testing` パッケージ周りを一通り調べ直し、前編・後編の 2 本にまとめることにしました。

- 前編 (この記事): 正しさを確かめる。テーブル駆動テスト、サブテスト、並列実行、テストヘルパー、テストダブル、httptest、Example テスト、カバレッジ
- [後編](/post/go-testing-2/): 性能・堅牢性を確かめる。ベンチマーク、サブベンチマーク、Fuzzing、testing/synctest

Go 1.27 を前提にしていて、古いバージョンとの違いには触れません。実行結果は Go 1.27.1 で実行したものです。

コードは以下のレポジトリにあります。

https://github.com/jedipunkz/go-playground/tree/main/testing

## Go のテストの基本

Go のテストは標準の `testing` パッケージと `go test` コマンドだけで書けます。ルールは次の 3 つです。

- テストコードは `xxx_test.go` という名前のファイルに書く
- テスト関数は `func TestXxx(t *testing.T)` という形にする
- 失敗を報告するには `t.Error` / `t.Errorf` か `t.Fatal` / `t.Fatalf` を呼ぶ

`t.Error` と `t.Fatal` の違いは重要です。`t.Error` は失敗を記録してテスト関数の実行を続けますが、`t.Fatal` は失敗を記録した時点でそのテスト関数を終了します。この違いがパターン 2 の話につながります。

この記事では、次の割り算の関数をテスト対象にして説明を始めます。

```go
package calc

import "errors"

var ErrDivideByZero = errors.New("divide by zero")

// Div は a を b で割った結果を返す
func Div(a, b int) (int, error) {
	if b == 0 {
		return 0, ErrDivideByZero
	}
	return a / b, nil
}
```

よく使う `go test` のオプションは以下です。

| コマンド | 内容 |
|---|---|
| `go test ./...` | カレントディレクトリ配下の全パッケージのテストを実行する |
| `go test -v ./...` | テストごとの結果とログを表示する |
| `go test -run 'TestDiv$' ./calc/` | 正規表現にマッチするテストだけを実行する |
| `go test -count=1 ./...` | テスト結果のキャッシュを使わずに実行する |

## パターン1: テーブル駆動テスト

入力と期待値の組をテーブル (構造体のスライス) として定義し、同じ検証ロジックをループで全ケースに適用するパターンです。

### 使い所

`Div` のテストを書く場合、「割り切れる」「切り捨て」「負の数」「ゼロ除算」とケースごとにテスト関数を書くと、同じ検証コードが何度も並びます。テーブルにしておくと、ケースの追加はテーブルに 1 行足すだけで済み、どんな入力を検証しているかも一覧で読めます。

```go
package calc

import (
	"errors"
	"testing"
)

func TestDiv(t *testing.T) {
	// テストケースをテーブル (構造体のスライス) として定義する
	tests := []struct {
		a, b    int
		want    int
		wantErr error
	}{
		{a: 10, b: 2, want: 5},
		{a: 7, b: 2, want: 3},
		{a: -9, b: 3, want: -3},
		{a: 1, b: 0, wantErr: ErrDivideByZero},
	}

	// 同じ検証ロジックを全ケースに適用する
	for _, tt := range tests {
		got, err := Div(tt.a, tt.b)
		if !errors.Is(err, tt.wantErr) {
			t.Errorf("Div(%d, %d) error = %v, want %v", tt.a, tt.b, err, tt.wantErr)
		}
		if got != tt.want {
			t.Errorf("Div(%d, %d) = %d, want %d", tt.a, tt.b, got, tt.want)
		}
	}
}
```

エラーの比較には `errors.Is` を使っています。`wantErr` が `nil` のケースでは `err` も `nil` であることを、`ErrDivideByZero` のケースではそのエラーが返ることを、同じ 1 行で検証できます。

### 実行結果

```
$ go test -run 'TestDiv$' -v ./calc/
=== RUN   TestDiv
--- PASS: TestDiv (0.00s)
PASS
ok  	github.com/jedipunkz/go-playground/testing/calc	0.219s
```

全ケースが通っていますが、出力からはどのケースを実行したのかが分かりません。これもパターン 2 で解決します。

## パターン2: サブテスト

`t.Run` を使って、テーブルの各ケースを独立したサブテストとして実行するパターンです。

### 使い所

テーブル駆動テストのループの中で `t.Fatal` を使うと、1 つのケースが失敗した時点でテスト関数全体が終了し、残りのケースが実行されません。何件失敗しているのかが分からず、1 件直しては再実行する、を繰り返すことになります。

例として、文字列を反転する関数をテストします。この実装はバイト単位で反転しているので、マルチバイト文字を含む文字列で壊れるバグがあります。

```go
package strutil

// Reverse は文字列を反転する (バイト単位で反転するバグを含む)
func Reverse(s string) string {
	b := []byte(s)
	for i, j := 0, len(b)-1; i < j; i, j = i+1, j-1 {
		b[i], b[j] = b[j], b[i]
	}
	return string(b)
}
```

まずループの中で `t.Fatalf` を使った場合です。

```go
func TestReverseLoop(t *testing.T) {
	tests := []struct {
		in, want string
	}{
		{"abc", "cba"},
		{"あいう", "ういあ"},
		{"", ""},
		{"héllo", "olléh"},
	}

	for _, tt := range tests {
		got := Reverse(tt.in)
		if got != tt.want {
			t.Fatalf("Reverse(%q) = %q, want %q", tt.in, got, tt.want)
		}
	}
}
```

```
$ go test -run TestReverseLoop -v ./strutil/
=== RUN   TestReverseLoop
    loop_test.go:18: Reverse("あいう") = "\x86\x81㄁め\xe3", want "ういあ"
--- FAIL: TestReverseLoop (0.00s)
FAIL
FAIL	github.com/jedipunkz/go-playground/testing/strutil	0.237s
FAIL
```

2 件目の `"あいう"` で止まってしまい、4 件目の `"héllo"` も失敗することが分かりません。

次に、各ケースを `t.Run` でサブテストにします。`t.Run` に渡した関数の中で `t.Fatal` を呼んでも、終了するのはそのサブテストだけです。

```go
func TestReverseSubtest(t *testing.T) {
	tests := []struct {
		name, in, want string
	}{
		{"ascii", "abc", "cba"},
		{"japanese", "あいう", "ういあ"},
		{"empty", "", ""},
		{"accent", "héllo", "olléh"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := Reverse(tt.in)
			if got != tt.want {
				t.Fatalf("Reverse(%q) = %q, want %q", tt.in, got, tt.want)
			}
		})
	}
}
```

### 実行結果

```
$ go test -run TestReverseSubtest -v ./strutil/
=== RUN   TestReverseSubtest
=== RUN   TestReverseSubtest/ascii
=== RUN   TestReverseSubtest/japanese
    subtest_test.go:19: Reverse("あいう") = "\x86\x81㄁め\xe3", want "ういあ"
=== RUN   TestReverseSubtest/empty
=== RUN   TestReverseSubtest/accent
    subtest_test.go:19: Reverse("héllo") = "oll\xa9\xc3h", want "olléh"
--- FAIL: TestReverseSubtest (0.00s)
    --- PASS: TestReverseSubtest/ascii (0.00s)
    --- FAIL: TestReverseSubtest/japanese (0.00s)
    --- PASS: TestReverseSubtest/empty (0.00s)
    --- FAIL: TestReverseSubtest/accent (0.00s)
FAIL
FAIL	github.com/jedipunkz/go-playground/testing/strutil	0.076s
FAIL
```

4 件すべてが実行され、`japanese` と `accent` の 2 件が失敗していることが一度で分かります。

サブテストには `テスト名/サブテスト名` という名前が付くので、`-run` で 1 ケースだけを実行することもできます。

```
$ go test -run 'TestReverseSubtest/japanese' -v ./strutil/
=== RUN   TestReverseSubtest
=== RUN   TestReverseSubtest/japanese
    subtest_test.go:19: Reverse("あいう") = "\x86\x81㄁め\xe3", want "ういあ"
--- FAIL: TestReverseSubtest (0.00s)
    --- FAIL: TestReverseSubtest/japanese (0.00s)
FAIL
FAIL	github.com/jedipunkz/go-playground/testing/strutil	0.072s
FAIL
```

なお、サブテスト名に含まれるスペースは `_` に置き換えられます (`"DB エラー"` は `DB_エラー` になります)。

バグは rune 単位で反転するように直しておきます。この `Reverse` はパターン 7 と後編でも使います。

```go
// Reverse は文字列を rune 単位で反転する
func Reverse(s string) string {
	r := []rune(s)
	for i, j := 0, len(r)-1; i < j; i, j = i+1, j-1 {
		r[i], r[j] = r[j], r[i]
	}
	return string(r)
}
```

## パターン3: t.Parallel による並列実行

サブテストの中で `t.Parallel()` を呼ぶと、そのサブテストは他の並列サブテストと同時に実行されます。

### 使い所

外部 API の呼び出しを待つテストや、1 件ごとに時間のかかるテストが多い場合、順番に実行すると全体の時間が積み上がります。互いに状態を共有しないテストであれば、並列に実行することで全体の時間を短縮できます。また、並列に実行しても壊れないことを確認するのは、テスト同士が隠れた共有状態に依存していないことの確認にもなります。

```go
func TestDivParallel(t *testing.T) {
	tests := []struct {
		name    string
		a, b    int
		want    int
		wantErr error
	}{
		{name: "割り切れる", a: 10, b: 2, want: 5},
		{name: "切り捨て", a: 7, b: 2, want: 3},
		{name: "負の数", a: -9, b: 3, want: -3},
		{name: "ゼロ除算", a: 1, b: 0, wantErr: ErrDivideByZero},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel() // このサブテストを並列実行の対象にする
			got, err := Div(tt.a, tt.b)
			if !errors.Is(err, tt.wantErr) {
				t.Fatalf("Div(%d, %d) error = %v, want %v", tt.a, tt.b, err, tt.wantErr)
			}
			if got != tt.want {
				t.Errorf("Div(%d, %d) = %d, want %d", tt.a, tt.b, got, tt.want)
			}
		})
	}
}
```

`for` 文のループ変数 `tt` はイテレーションごとに別の変数になるので、並列実行するクロージャからそのまま参照して問題ありません。

### 実行結果

```
$ go test -run TestDivParallel -v ./calc/
=== RUN   TestDivParallel
=== RUN   TestDivParallel/割り切れる
=== PAUSE TestDivParallel/割り切れる
=== RUN   TestDivParallel/切り捨て
=== PAUSE TestDivParallel/切り捨て
=== RUN   TestDivParallel/負の数
=== PAUSE TestDivParallel/負の数
=== RUN   TestDivParallel/ゼロ除算
=== PAUSE TestDivParallel/ゼロ除算
=== CONT  TestDivParallel/割り切れる
=== CONT  TestDivParallel/切り捨て
=== CONT  TestDivParallel/ゼロ除算
=== CONT  TestDivParallel/負の数
--- PASS: TestDivParallel (0.00s)
    --- PASS: TestDivParallel/割り切れる (0.00s)
    --- PASS: TestDivParallel/切り捨て (0.00s)
    --- PASS: TestDivParallel/ゼロ除算 (0.00s)
    --- PASS: TestDivParallel/負の数 (0.00s)
PASS
ok  	github.com/jedipunkz/go-playground/testing/calc	0.080s
```

`PAUSE` は `t.Parallel()` を呼んだサブテストが一時停止したこと、`CONT` は並列実行が再開されたことを表しています。親のテスト関数 (ここではループ) が終わってから、一時停止していたサブテストがまとめて並列に実行されます。同時に実行する数の上限は `-parallel` フラグで指定でき、デフォルトは GOMAXPROCS の値です。

## パターン4: テストヘルパー

`testing.T` には、テストの準備と後片付けを助けるメソッドがいくつかあります。

| メソッド | 内容 |
|---|---|
| `t.Helper()` | 失敗時に報告される行番号を、ヘルパー関数の中ではなく呼び出し元にする |
| `t.TempDir()` | テスト終了時に自動で削除される一時ディレクトリを作る |
| `t.Setenv(key, value)` | 環境変数を設定し、テスト終了時に元の値へ戻す |
| `t.Chdir(dir)` | カレントディレクトリを変更し、テスト終了時に元へ戻す |
| `t.Context()` | テスト終了直前 (Cleanup の前) にキャンセルされる context を返す |
| `t.Cleanup(f)` | テスト終了時に実行する関数を登録する |

### 使い所

ファイルや環境変数を扱うコードのテストでは、テストごとにファイルを作り、環境変数を書き換え、終わったら元に戻す、という準備と後片付けが必要になります。これを自前で書くと、後片付けの漏れで他のテストに影響が出ることがあります。上記のメソッドを使うと、後片付けは `testing` パッケージが確実に行ってくれます。

テスト対象として、ファイルから設定を読み込み、環境変数で上書きする関数を用意しました。

```go
package config

import (
	"context"
	"os"
	"strings"
)

type Config struct {
	Env  string
	Port string
}

// Load は path のファイルから設定を読み込む
// 環境変数 APP_ENV が設定されていれば Env を上書きする
func Load(ctx context.Context, path string) (*Config, error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	b, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	cfg := &Config{}
	for line := range strings.Lines(string(b)) {
		k, v, ok := strings.Cut(strings.TrimSpace(line), "=")
		if !ok {
			continue
		}
		switch k {
		case "env":
			cfg.Env = v
		case "port":
			cfg.Port = v
		}
	}
	if env := os.Getenv("APP_ENV"); env != "" {
		cfg.Env = env
	}
	return cfg, nil
}
```

テストコードです。

```go
package config

import (
	"os"
	"path/filepath"
	"testing"
)

// writeConfig はテスト用の設定ファイルを一時ディレクトリに作成するヘルパー
func writeConfig(t *testing.T, content string) string {
	t.Helper() // 失敗時の行番号を呼び出し元にする

	// テスト終了時に自動で削除される一時ディレクトリ
	path := filepath.Join(t.TempDir(), "app.conf")
	if err := os.WriteFile(path, []byte(content), 0o600); err != nil {
		t.Fatalf("write config: %v", err)
	}
	return path
}

func TestLoad(t *testing.T) {
	path := writeConfig(t, "env=dev\nport=8080\n")

	// テストが終わる直前にキャンセルされる context
	cfg, err := Load(t.Context(), path)
	if err != nil {
		t.Fatalf("Load() error = %v", err)
	}
	if cfg.Env != "dev" || cfg.Port != "8080" {
		t.Errorf("Load() = %+v, want Env=dev Port=8080", cfg)
	}
}

func TestLoadEnvOverride(t *testing.T) {
	// テスト終了時に元の値へ戻る環境変数
	t.Setenv("APP_ENV", "prod")
	path := writeConfig(t, "env=dev\nport=8080\n")

	cfg, err := Load(t.Context(), path)
	if err != nil {
		t.Fatalf("Load() error = %v", err)
	}
	if cfg.Env != "prod" {
		t.Errorf("Env = %q, want %q", cfg.Env, "prod")
	}
}

func TestLoadRelativePath(t *testing.T) {
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "app.conf"), []byte("port=9090\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	// テスト終了時に元のディレクトリへ戻る
	t.Chdir(dir)

	cfg, err := Load(t.Context(), "app.conf")
	if err != nil {
		t.Fatalf("Load() error = %v", err)
	}
	t.Cleanup(func() {
		t.Log("cleanup: テスト終了後に実行される")
	})
	if cfg.Port != "9090" {
		t.Errorf("Port = %q, want %q", cfg.Port, "9090")
	}
}
```

`t.Setenv` と `t.Chdir` はプロセス全体の状態を変えるため、`t.Parallel()` と一緒には使えません (使うと panic します)。

### 実行結果

```
$ go test -v ./config/
=== RUN   TestLoad
--- PASS: TestLoad (0.00s)
=== RUN   TestLoadEnvOverride
--- PASS: TestLoadEnvOverride (0.00s)
=== RUN   TestLoadRelativePath
    config_test.go:61: cleanup: テスト終了後に実行される
--- PASS: TestLoadRelativePath (0.00s)
PASS
ok  	github.com/jedipunkz/go-playground/testing/config	0.251s
```

`t.Helper()` の効果は、テストが失敗したときに分かります。`t.Helper()` を呼ぶヘルパーと呼ばないヘルパーで、同じ失敗を起こしてみました。

```go
func assertEqual(t *testing.T, got, want int) {
	t.Helper()
	if got != want {
		t.Errorf("got %d, want %d", got, want) // 8 行目
	}
}

func assertEqualNoHelper(t *testing.T, got, want int) {
	if got != want {
		t.Errorf("got %d, want %d", got, want) // 14 行目
	}
}

func TestWithHelper(t *testing.T) {
	assertEqual(t, 1+1, 3) // 19 行目
}

func TestWithoutHelper(t *testing.T) {
	assertEqualNoHelper(t, 1+1, 3) // 23 行目
}
```

```
$ go test ./helperdemo/
--- FAIL: TestWithHelper (0.00s)
    h_test.go:19: got 2, want 3
--- FAIL: TestWithoutHelper (0.00s)
    h_test.go:14: got 2, want 3
FAIL
FAIL	github.com/jedipunkz/go-playground/testing/helperdemo	0.222s
FAIL
```

`t.Helper()` を呼んだ方はテスト関数の中の 19 行目が、呼ばなかった方はヘルパー関数の中の 14 行目が報告されています。ヘルパーを複数のテストから呼ぶ場合、14 行目と言われてもどのテストのどの呼び出しで失敗したのか分かりません。ヘルパーには `t.Helper()` を入れておくのが定石です。

## パターン5: interface を使ったテストダブル

テスト対象が依存しているもの (DB や外部サービス) を interface で受け取るようにし、テストではその interface を満たす偽物 (テストダブル) を渡すパターンです。[Go の interface を理解する](/post/go-interface/) のパターン 5 (依存性注入) の続きにあたります。

### 使い所

DB からユーザーを引いて挨拶文を作るサービスをテストしたいとき、本物の DB を用意するのは手間がかかり、テストも遅くなります。また「DB が接続エラーを返したとき」のような異常系は、本物の DB では再現しにくいです。依存を interface にしておけば、テストでは任意の結果やエラーを返す偽物に差し替えられます。

```go
package user

import (
	"context"
	"errors"
	"fmt"
)

var ErrNotFound = errors.New("user not found")

type User struct {
	ID   int
	Name string
}

// UserRepository はユーザーの永続化を抽象化する
type UserRepository interface {
	FindByID(ctx context.Context, id int) (*User, error)
}

type Service struct {
	repo UserRepository
}

func NewService(repo UserRepository) *Service {
	return &Service{repo: repo}
}

// Greeting はユーザー名入りの挨拶文を返す
func (s *Service) Greeting(ctx context.Context, id int) (string, error) {
	u, err := s.repo.FindByID(ctx, id)
	if errors.Is(err, ErrNotFound) {
		return "こんにちは、ゲストさん", nil
	}
	if err != nil {
		return "", fmt.Errorf("find user %d: %w", id, err)
	}
	return fmt.Sprintf("こんにちは、%sさん", u.Name), nil
}
```

テストでは、map からユーザーを返す `fakeRepo` を作ります。`err` フィールドに値を入れておくと、そのエラーを返すようにしています。

```go
package user

import (
	"context"
	"errors"
	"testing"
)

// fakeRepo はテスト用の UserRepository 実装
type fakeRepo struct {
	users map[int]*User
	err   error // 返したいエラーを差し込む
}

func (f *fakeRepo) FindByID(ctx context.Context, id int) (*User, error) {
	if f.err != nil {
		return nil, f.err
	}
	u, ok := f.users[id]
	if !ok {
		return nil, ErrNotFound
	}
	return u, nil
}

func TestGreeting(t *testing.T) {
	errDB := errors.New("connection refused")

	tests := []struct {
		name    string
		repo    *fakeRepo
		id      int
		want    string
		wantErr error
	}{
		{
			name: "存在するユーザー",
			repo: &fakeRepo{users: map[int]*User{1: {ID: 1, Name: "jedi"}}},
			id:   1,
			want: "こんにちは、jediさん",
		},
		{
			name: "存在しないユーザー",
			repo: &fakeRepo{users: map[int]*User{}},
			id:   2,
			want: "こんにちは、ゲストさん",
		},
		{
			name:    "DB エラー",
			repo:    &fakeRepo{err: errDB},
			id:      1,
			wantErr: errDB,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			s := NewService(tt.repo)
			got, err := s.Greeting(t.Context(), tt.id)
			if !errors.Is(err, tt.wantErr) {
				t.Fatalf("error = %v, want %v", err, tt.wantErr)
			}
			if got != tt.want {
				t.Errorf("got %q, want %q", got, tt.want)
			}
		})
	}
}
```

`Greeting` は DB エラーを `%w` でラップして返していますが、`errors.Is` はラップされたエラーもたどるので、`errDB` と比較できます。

### 実行結果

```
$ go test -v ./user/
=== RUN   TestGreeting
=== RUN   TestGreeting/存在するユーザー
=== RUN   TestGreeting/存在しないユーザー
=== RUN   TestGreeting/DB_エラー
--- PASS: TestGreeting (0.00s)
    --- PASS: TestGreeting/存在するユーザー (0.00s)
    --- PASS: TestGreeting/存在しないユーザー (0.00s)
    --- PASS: TestGreeting/DB_エラー (0.00s)
PASS
ok  	github.com/jedipunkz/go-playground/testing/user	0.240s
```

## パターン6: net/http/httptest

`net/http/httptest` パッケージを使うと、HTTP のハンドラとクライアントを、実際にポートを公開せずにテストできます。

| 関数 | 用途 |
|---|---|
| `httptest.NewRequest` | ハンドラに渡すリクエストを作る |
| `httptest.NewRecorder` | ハンドラが書き込んだレスポンスを記録する `ResponseWriter` を作る |
| `httptest.NewServer` | テスト用の HTTP サーバをローカルに起動する |

### 使い所

ハンドラのテストでは、サーバを起動しなくても `NewRecorder` にハンドラを直接呼ばせれば、ステータスコードやボディを検証できます。外部 API を呼ぶクライアントのテストでは、本物の API を呼ぶとネットワークや相手の状態に左右されるので、`NewServer` で偽の API を立てて、クライアントの接続先をそこに向けます。

テスト対象のハンドラとクライアントです。

```go
package weather

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
)

// Handler は /hello?name=xxx に JSON で挨拶を返す
func Handler(w http.ResponseWriter, r *http.Request) {
	name := r.URL.Query().Get("name")
	if name == "" {
		http.Error(w, "name is required", http.StatusBadRequest)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"message": "hello " + name})
}

// Client は外部の天気 API を呼び出すクライアント
type Client struct {
	BaseURL    string
	HTTPClient *http.Client
}

type Forecast struct {
	City    string `json:"city"`
	Weather string `json:"weather"`
}

func (c *Client) Get(ctx context.Context, city string) (*Forecast, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.BaseURL+"/forecast?city="+city, nil)
	if err != nil {
		return nil, err
	}
	resp, err := c.HTTPClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("unexpected status: %d", resp.StatusCode)
	}
	var f Forecast
	if err := json.NewDecoder(resp.Body).Decode(&f); err != nil {
		return nil, err
	}
	return &f, nil
}
```

クライアントは接続先を `BaseURL` として外から受け取るようにしておくのがポイントです。これでテストのときだけ接続先を差し替えられます。

```go
package weather

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestHandler(t *testing.T) {
	tests := []struct {
		name       string
		target     string
		wantStatus int
	}{
		{"name あり", "/hello?name=jedi", http.StatusOK},
		{"name なし", "/hello", http.StatusBadRequest},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodGet, tt.target, nil)
			rec := httptest.NewRecorder() // レスポンスを記録する ResponseWriter

			Handler(rec, req)

			if rec.Code != tt.wantStatus {
				t.Errorf("status = %d, want %d", rec.Code, tt.wantStatus)
			}
		})
	}
}

func TestClientGet(t *testing.T) {
	// 外部 API の代わりになるテスト用サーバ
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if got := r.URL.Query().Get("city"); got != "tokyo" {
			t.Errorf("city = %q, want %q", got, "tokyo")
		}
		json.NewEncoder(w).Encode(Forecast{City: "tokyo", Weather: "sunny"})
	}))
	defer srv.Close()

	c := &Client{BaseURL: srv.URL, HTTPClient: srv.Client()}
	f, err := c.Get(t.Context(), "tokyo")
	if err != nil {
		t.Fatalf("Get() error = %v", err)
	}
	if f.Weather != "sunny" {
		t.Errorf("Weather = %q, want %q", f.Weather, "sunny")
	}
}
```

偽の API のハンドラの中で、クライアントが送ってきたクエリパラメータも検証しています。クライアントが正しいリクエストを組み立てているかを、サーバ側から確認できるのも `NewServer` の便利な点です。

### 実行結果

```
$ go test -run 'TestHandler|TestClientGet' -v ./weather/
=== RUN   TestHandler
=== RUN   TestHandler/name_あり
=== RUN   TestHandler/name_なし
--- PASS: TestHandler (0.00s)
    --- PASS: TestHandler/name_あり (0.00s)
    --- PASS: TestHandler/name_なし (0.00s)
=== RUN   TestClientGet
--- PASS: TestClientGet (0.00s)
PASS
ok  	github.com/jedipunkz/go-playground/testing/weather	0.293s
```

## パターン7: Example テスト

`func ExampleXxx()` という関数を書き、標準出力に出した内容を `// Output:` コメントで検証するパターンです。

### 使い所

Example テストは、テストであると同時にドキュメントでもあります。`ExampleReverse` は `Reverse` 関数の使用例として、godoc や pkg.go.dev に表示されます。README やコメントに書いた使用例は、コードを変更したときに古くなりがちですが、Example テストは `go test` で毎回実行されるので、使用例が実際のコードと食い違うことがありません。

パターン 2 で直した `Reverse` の Example です。パッケージ名を `strutil_test` にして、利用者と同じように外からパッケージを import して書いています。

```go
package strutil_test

import (
	"fmt"

	"github.com/jedipunkz/go-playground/testing/strutil"
)

func ExampleReverse() {
	fmt.Println(strutil.Reverse("hello"))
	fmt.Println(strutil.Reverse("あいう"))
	// Output:
	// olleh
	// ういあ
}

func ExampleReverse_unordered() {
	for _, s := range map[string]string{"a": "go", "b": "テスト"} {
		fmt.Println(strutil.Reverse(s))
	}
	// Unordered output:
	// og
	// トステ
}
```

関数名は `Example` + 対象の名前にします。

| 関数名 | 対象 |
|---|---|
| `Example()` | パッケージ全体 |
| `ExampleReverse()` | 関数 `Reverse` |
| `ExampleT_M()` | 型 `T` のメソッド `M` |
| `ExampleReverse_unordered()` | `_` 以降は同じ対象に複数の例を付けるための接尾辞 (小文字で始める) |

map の反復順序は毎回変わるので、2 つ目の例では `// Unordered output:` を使い、行の順序を問わずに比較しています。

### 実行結果

```
$ go test -run Example -v ./strutil/
=== RUN   ExampleReverse
--- PASS: ExampleReverse (0.00s)
=== RUN   ExampleReverse_unordered
--- PASS: ExampleReverse_unordered (0.00s)
PASS
ok  	github.com/jedipunkz/go-playground/testing/strutil	0.246s
```

出力が一致しないと、実際の出力 (`got`) と期待値 (`want`) が表示されて失敗します。カンマの有無だけ違う例です。

```go
func Example() {
	fmt.Println("hello, world")
	// Output:
	// hello world
}
```

```
$ go test ./exdemo/
--- FAIL: Example (0.00s)
got:
hello, world
want:
hello world
FAIL
FAIL	github.com/jedipunkz/go-playground/testing/exdemo	0.221s
FAIL
```

また、存在しない関数名の Example を書くと、`go test` が実行する vet のチェックで失敗します。関数名を変更したのに Example の名前を直し忘れた、という状況を検出してくれます。

```
$ go test ./exdemo/
# github.com/jedipunkz/go-playground/testing/exdemo
# [github.com/jedipunkz/go-playground/testing/exdemo]
exdemo/e_test.go:5:1: ExampleHello refers to unknown identifier: Hello
FAIL	github.com/jedipunkz/go-playground/testing/exdemo [build failed]
FAIL
```

なお、`// Output:` コメントがない Example はコンパイルだけされて実行されません。

## パターン8: カバレッジ

テストがコードのどの部分を実行したかを計測する機能です。

### 使い所

テストを書いたつもりでも、エラー処理の分岐などが一度も実行されていないことがあります。カバレッジを見ると、テストが通っていない行が分かり、テストケースの追加漏れに気付けます。カバレッジの数値そのものを目標にするよりも、「どこが実行されていないか」を見るために使うのがおすすめです。

まず `-cover` でパッケージごとのカバレッジ (実行された文の割合) を表示します。

```
$ go test -cover ./...
ok  	github.com/jedipunkz/go-playground/testing/calc	0.239s	coverage: 100.0% of statements
ok  	github.com/jedipunkz/go-playground/testing/config	0.240s	coverage: 81.2% of statements
ok  	github.com/jedipunkz/go-playground/testing/strutil	0.240s	coverage: 100.0% of statements
ok  	github.com/jedipunkz/go-playground/testing/user	0.236s	coverage: 100.0% of statements
ok  	github.com/jedipunkz/go-playground/testing/weather	0.252s	coverage: 78.9% of statements
```

関数単位で見るには、`-coverprofile` で計測結果をファイルに保存し、`go tool cover -func` で集計します。

```
$ go test -coverprofile=cover.out ./...
$ go tool cover -func=cover.out
github.com/jedipunkz/go-playground/testing/calc/calc.go:8:		Div		100.0%
github.com/jedipunkz/go-playground/testing/config/config.go:16:		Load		81.2%
github.com/jedipunkz/go-playground/testing/strutil/strutil.go:4:	Reverse		100.0%
github.com/jedipunkz/go-playground/testing/user/user.go:25:		NewService	100.0%
github.com/jedipunkz/go-playground/testing/user/user.go:30:		Greeting	100.0%
github.com/jedipunkz/go-playground/testing/weather/weather.go:11:	Handler		100.0%
github.com/jedipunkz/go-playground/testing/weather/weather.go:32:	Get		69.2%
total:						(statements)	85.7%
```

`config.Load` と `weather.Client.Get` が 100% になっていません。どちらもエラー時の分岐 (ファイルが読めない、ステータスコードが 200 以外、など) をテストしていないためです。

どの行が実行されていないかは、`go tool cover -html` でブラウザに表示できます。実行された行が緑、実行されていない行が赤で色分けされます。

```
$ go tool cover -html=cover.out
```

その他のオプションです。

| オプション | 内容 |
|---|---|
| `-covermode=set` | 各文が実行されたかどうかを記録する (デフォルト。`-race` 指定時は `atomic`) |
| `-covermode=count` | 各文が実行された回数を記録する |
| `-covermode=atomic` | `count` と同じだが、並列実行でも正確に数える |
| `-coverpkg=pattern` | テスト対象以外のパッケージも計測対象にする。デフォルトはテスト対象のパッケージだけ |

### 実行結果

`cover.out` の中身はテキストで、ファイル名、行と列の範囲、文の数、実行されたかどうか (`set` モードでは 0 か 1) が並んでいます。

```
$ head -5 cover.out
mode: set
github.com/jedipunkz/go-playground/testing/calc/calc.go:9.2,9.12 1 1
github.com/jedipunkz/go-playground/testing/calc/calc.go:10.3,11.1 1 1
github.com/jedipunkz/go-playground/testing/calc/calc.go:12.2,12.19 1 1
github.com/jedipunkz/go-playground/testing/config/config.go:17.2,17.34 1 1
```

## まとめ

前編では、コードが正しく動くことを確かめるためのテストの書き方を整理しました。

- テーブル駆動テストでケースを一覧にし、`t.Run` のサブテストで各ケースを独立させる。サブテストにすれば、`t.Fatal` で他のケースが止まらず、`-run` で 1 ケースだけ実行できる
- 状態を共有しないサブテストは `t.Parallel()` で並列に実行できる
- `t.Helper`、`t.TempDir`、`t.Setenv`、`t.Chdir`、`t.Context`、`t.Cleanup` で、準備と後片付けを `testing` パッケージに任せる
- 依存を interface で受け取れば、テストでは偽物に差し替えて異常系も再現できる
- HTTP のハンドラは `httptest.NewRecorder`、外部 API を呼ぶクライアントは `httptest.NewServer` でテストする
- Example テストは、`go test` で検証される使用例として godoc に載る
- カバレッジは数値よりも、実行されていない行を見つけるために使う

自分が知っていたのはテーブル駆動テストとサブテストくらいでしたが、`t.Helper` の行番号の違いや、Example テストがドキュメントを兼ねる点などは、知っていると日々のテストコードがだいぶ読みやすくなりそうです。

後編では、ベンチマーク、サブベンチマーク、Fuzzing、testing/synctest を扱います。

- [[Go 再学習] Go のテストを理解する 後編: 性能・堅牢性を確かめる](/post/go-testing-2/)
