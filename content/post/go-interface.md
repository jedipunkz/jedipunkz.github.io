---
title: "Go の interface を理解する"
date: 2026-04-12T00:00:00+09:00
Categories: ["go"]
draft: false
description: "Go の interface の基本から実践的なパターンまで、サンプルコードを交えて解説する"
---
Go の学習を進める中で、interface は最初のうち「なんとなくわかるが使いこなせない」という感覚を持ちやすい機能の1つだと思います。この記事では基本的な定義から実務でよく登場するパターンまでをサンプルコードとともに整理しました。

コードは以下のレポジトリにあります。

https://github.com/jedipunkz/go-tips

## interface とは

interface はメソッドのシグネチャの集合を定義する型です。Go の interface は「暗黙的な実装」が特徴で、Java や C# のように `implements` キーワードを書く必要がありません。ある型が interface に定義されたメソッドをすべて持っていれば、自動的にその interface を満たします。

この設計により、既存のコードを変更せずに後から interface に適合させることができます。

## パターン1: 基本的な interface

最もシンプルな interface の定義と利用です。`Shape` interface を定義し、`Circle` と `Rectangle` がそれを実装します。

### 使い所

図形の面積や周長を計算する処理を書く場合、`Circle` や `Rectangle` ごとに別々の関数を用意すると、新しい図形が増えるたびに呼び出し側の修正が必要になります。`Shape` interface を定義して関数が `Shape` を受け取るようにすると、新しい図形を追加しても既存の関数はそのまま使え、拡張が容易になります。

```go
package main

import (
	"fmt"
	"math"
)

// Shape インターフェースを定義する
// メソッドセットを持つ型は暗黙的にこのインターフェースを満たす
type Shape interface {
	Area() float64
	Perimeter() float64
}

type Circle struct {
	Radius float64
}

func (c Circle) Area() float64 {
	return math.Pi * c.Radius * c.Radius
}

func (c Circle) Perimeter() float64 {
	return 2 * math.Pi * c.Radius
}

type Rectangle struct {
	Width, Height float64
}

func (r Rectangle) Area() float64 {
	return r.Width * r.Height
}

func (r Rectangle) Perimeter() float64 {
	return 2 * (r.Width + r.Height)
}

// インターフェース型を引数に取ることで、どの Shape 実装でも受け付ける
func printShapeInfo(s Shape) {
	fmt.Printf("面積: %.2f, 周長: %.2f\n", s.Area(), s.Perimeter())
}

func main() {
	c := Circle{Radius: 5}
	r := Rectangle{Width: 4, Height: 6}

	fmt.Print("Circle: ")
	printShapeInfo(c)

	fmt.Print("Rectangle: ")
	printShapeInfo(r)
}
```

`printShapeInfo` は `Shape` を受け取るだけで、`Circle` か `Rectangle` かを意識しません。新たに `Triangle` を追加したとしても、`Area()` と `Perimeter()` を実装するだけで既存コードの変更なく動きます。

### 実行結果

```
Circle: 面積: 78.54, 周長: 31.42
Rectangle: 面積: 24.00, 周長: 20.00
```

## パターン2: ポリモーフィズム

複数の実装を同じ interface でまとめて扱うパターンです。`Notifier` interface を Email・Slack・SMS の3種類で実装し、一括送信します。

### 使い所

通知機能を拡張する際、新しい通知手段（例: LINE や PagerDuty）を追加するたびに `broadcast` 関数を修正するのは保守コストが高くなります。`Notifier` interface に対して実装を追加するだけで済む設計にしておくと、コードの変更箇所を新しい struct の定義だけに限定できます。

```go
package main

import "fmt"

// 通知の送信手段を抽象化するインターフェース
type Notifier interface {
	Send(message string) error
}

type EmailNotifier struct {
	Address string
}

func (e EmailNotifier) Send(message string) error {
	fmt.Printf("[Email -> %s] %s\n", e.Address, message)
	return nil
}

type SlackNotifier struct {
	Channel string
}

func (s SlackNotifier) Send(message string) error {
	fmt.Printf("[Slack #%s] %s\n", s.Channel, message)
	return nil
}

type SMSNotifier struct {
	PhoneNumber string
}

func (s SMSNotifier) Send(message string) error {
	fmt.Printf("[SMS -> %s] %s\n", s.PhoneNumber, message)
	return nil
}

// 複数の Notifier に一括送信する
// 新しい通知手段を追加しても、この関数は変更不要
func broadcast(notifiers []Notifier, message string) {
	for _, n := range notifiers {
		if err := n.Send(message); err != nil {
			fmt.Printf("送信エラー: %v\n", err)
		}
	}
}

func main() {
	notifiers := []Notifier{
		EmailNotifier{Address: "user@example.com"},
		SlackNotifier{Channel: "alerts"},
		SMSNotifier{PhoneNumber: "090-1234-5678"},
	}

	broadcast(notifiers, "システムメンテナンスのお知らせ")
}
```

`[]Notifier` のスライスに異なる具体型を混在させることができます。`broadcast` はループで `Send` を呼ぶだけで、呼び出す実装の違いを意識しません。

### 実行結果

```
[Email -> user@example.com] システムメンテナンスのお知らせ
[Slack #alerts] システムメンテナンスのお知らせ
[SMS -> 090-1234-5678] システムメンテナンスのお知らせ
```

## パターン3: interface の埋め込み

小さな interface を組み合わせて大きな interface を作る「埋め込み」パターンです。インターフェース分離の原則（ISP）を実践する際に有効です。

### 使い所

「読み込みだけ必要な関数」と「書き込みだけ必要な関数」に同じ大きな interface を要求するのは過剰です。`Reader`・`Writer`・`Closer` を小さな単位で定義しておき、必要な組み合わせで `ReadWriter` や `ReadWriteCloser` を作ることで、各関数が最小限の能力だけを要求できます。

```go
package main

import (
	"fmt"
	"strings"
)

type Reader interface {
	Read() string
}

type Writer interface {
	Write(data string)
}

type Closer interface {
	Close()
}

// 埋め込みで合成する
type ReadWriter interface {
	Reader
	Writer
}

type ReadWriteCloser interface {
	Reader
	Writer
	Closer
}

type Buffer struct {
	data   strings.Builder
	closed bool
}

func (b *Buffer) Write(data string) {
	if b.closed {
		fmt.Println("書き込みエラー: バッファは閉じられています")
		return
	}
	b.data.WriteString(data)
}

func (b *Buffer) Read() string {
	if b.closed {
		return ""
	}
	return b.data.String()
}

func (b *Buffer) Close() {
	b.closed = true
	fmt.Println("バッファをクローズしました")
}

// 書き込みのみ行う関数 - Writer だけを要求する（最小権限の原則）
func writeAll(w Writer, items []string) {
	for _, item := range items {
		w.Write(item)
	}
}

// 読み取りのみ行う関数 - Reader だけを要求する
func readAndPrint(r Reader) {
	fmt.Printf("内容: %s\n", r.Read())
}

func main() {
	buf := &Buffer{}

	writeAll(buf, []string{"Hello, ", "Go ", "Interface!"})
	readAndPrint(buf)

	buf2 := &Buffer{}
	buf2.Write("処理済みデータ")
	fmt.Printf("読み取り: %s\n", buf2.Read())
	buf2.Close()

	// クローズ後の操作
	buf2.Write("追記しようとしています")
}
```

`Buffer` は `ReadWriteCloser` を満たすため、`Writer` のみ受け取る `writeAll` にも `Reader` のみ受け取る `readAndPrint` にも渡せます。Go 標準ライブラリの `io.Reader` / `io.Writer` / `io.Closer` も同じ思想で設計されています。

### 実行結果

```
内容: Hello, Go Interface!
読み取り: 処理済みデータ
バッファをクローズしました
書き込みエラー: バッファは閉じられています
```

## パターン4: 型アサーションと type switch

interface 値から具体的な型を取り出すパターンです。`switch v := a.(type)` で各型に対して処理を分岐できます。

### 使い所

ログや監視の処理で、共通の `Animal` interface として扱いながら特定の型だけ追加情報を出力したい場合に有効です。型アサーションを直接使う (`a.(Dog)`) とパニックのリスクがあるため、`ok` パターンか type switch を使うのが安全です。

```go
package main

import "fmt"

type Animal interface {
	Sound() string
}

type Dog struct{ Name string }
type Cat struct{ Name string }
type Bird struct {
	Name   string
	CanFly bool
}

func (d Dog) Sound() string  { return "ワン" }
func (c Cat) Sound() string  { return "ニャン" }
func (b Bird) Sound() string { return "チュン" }

func describeAnimal(a Animal) {
	fmt.Printf("鳴き声: %s", a.Sound())

	switch v := a.(type) {
	case Dog:
		fmt.Printf(" -> 犬の名前は %s\n", v.Name)
	case Cat:
		fmt.Printf(" -> 猫の名前は %s\n", v.Name)
	case Bird:
		canFly := "飛べない"
		if v.CanFly {
			canFly = "飛べる"
		}
		fmt.Printf(" -> 鳥の名前は %s (%s)\n", v.Name, canFly)
	default:
		fmt.Printf(" -> 未知の動物\n")
	}
}

// ok パターンによる単一の型アサーション
func tryGetDog(a Animal) {
	if dog, ok := a.(Dog); ok {
		fmt.Printf("犬を発見: %s\n", dog.Name)
	} else {
		fmt.Println("犬ではありませんでした")
	}
}

func main() {
	animals := []Animal{
		Dog{Name: "ポチ"},
		Cat{Name: "タマ"},
		Bird{Name: "ピーちゃん", CanFly: true},
		Bird{Name: "ペンギン", CanFly: false},
	}

	fmt.Println("=== type switch ===")
	for _, a := range animals {
		describeAnimal(a)
	}

	fmt.Println("\n=== ok パターン ===")
	tryGetDog(Dog{Name: "ハチ"})
	tryGetDog(Cat{Name: "ミケ"})
}
```

`a.(Dog)` のような単純な型アサーションは、型が一致しない場合にパニックします。`dog, ok := a.(Dog)` の2値形式にすれば `ok` が `false` になるだけで安全です。type switch はパニックなしに複数の型を安全に分岐できます。

### 実行結果

```
=== type switch ===
鳴き声: ワン -> 犬の名前は ポチ
鳴き声: ニャン -> 猫の名前は タマ
鳴き声: チュン -> 鳥の名前は ピーちゃん (飛べる)
鳴き声: チュン -> 鳥の名前は ペンギン (飛べない)

=== ok パターン ===
犬を発見: ハチ
犬ではありませんでした
```

## パターン5: 依存性注入 (Dependency Injection)

interface を使って依存関係を外から注入するパターンです。`UserService` はリポジトリの具体的な実装を知らず、`UserRepository` interface だけに依存します。

### 使い所

`UserService` が `MySQLUserRepository` を直接参照していると、テスト時に DB が必要になります。`UserRepository` interface を定義してコンストラクタで受け取るようにすれば、テスト時はインメモリ実装を、本番は MySQL 実装を渡すだけで差し替えができます。コードの修正なしに依存先を切り替えられるのが DI の強みです。

```go
package main

import (
	"fmt"
	"strings"
)

type UserRepository interface {
	FindByID(id int) (string, error)
	Save(id int, name string) error
}

// インメモリ実装（テスト・開発用）
type InMemoryUserRepository struct {
	store map[int]string
}

func NewInMemoryUserRepository() *InMemoryUserRepository {
	return &InMemoryUserRepository{store: make(map[int]string)}
}

func (r *InMemoryUserRepository) FindByID(id int) (string, error) {
	name, ok := r.store[id]
	if !ok {
		return "", fmt.Errorf("ユーザー %d が見つかりません", id)
	}
	return name, nil
}

func (r *InMemoryUserRepository) Save(id int, name string) error {
	r.store[id] = name
	return nil
}

// UserService はビジネスロジックを担う
// リポジトリの具体的な実装に依存しない
type UserService struct {
	repo UserRepository
}

func NewUserService(repo UserRepository) *UserService {
	return &UserService{repo: repo}
}

func (s *UserService) Register(id int, name string) error {
	name = strings.TrimSpace(name)
	if name == "" {
		return fmt.Errorf("名前は空にできません")
	}
	return s.repo.Save(id, name)
}

func (s *UserService) Greet(id int) (string, error) {
	name, err := s.repo.FindByID(id)
	if err != nil {
		return "", err
	}
	return fmt.Sprintf("こんにちは、%s さん！", name), nil
}

func main() {
	repo := NewInMemoryUserRepository()
	svc := NewUserService(repo)

	_ = svc.Register(1, "Alice")
	_ = svc.Register(2, "Bob")

	for _, id := range []int{1, 2, 3} {
		msg, err := svc.Greet(id)
		if err != nil {
			fmt.Printf("エラー: %v\n", err)
			continue
		}
		fmt.Println(msg)
	}
}
```

`NewUserService(repo UserRepository)` でコンストラクタインジェクションを実現しています。`UserService` は `InMemoryUserRepository` の存在を知りません。後から DB 実装を追加しても `UserService` を一切変更せずに差し替えられます。

### 実行結果

```
こんにちは、Alice さん！
こんにちは、Bob さん！
エラー: ユーザー 3 が見つかりません
```

## パターン6: 空の interface (any)

`any`（`interface{}` の別名）はあらゆる型を受け取れます。型情報が失われるため取り出す際に型アサーションが必要になります。

### 使い所

複数の異なる型の値を同じコンテナに格納したい場合（設定値のキー・バリューストアなど）に使います。ただし型安全性が失われるため、型が一致する場合はジェネリクスを使う方が望ましいです。`any` は「どうしても型を決められない」ときの最後の手段と考えるのがよいでしょう。

```go
package main

import "fmt"

func printValue(v any) {
	switch x := v.(type) {
	case int:
		fmt.Printf("int: %d\n", x)
	case float64:
		fmt.Printf("float64: %.2f\n", x)
	case string:
		fmt.Printf("string: %q\n", x)
	case bool:
		fmt.Printf("bool: %v\n", x)
	case []int:
		fmt.Printf("[]int: %v\n", x)
	case nil:
		fmt.Println("nil")
	default:
		fmt.Printf("その他(%T): %v\n", x, x)
	}
}

type Store struct {
	data map[string]any
}

func NewStore() *Store {
	return &Store{data: make(map[string]any)}
}

func (s *Store) Set(key string, value any) {
	s.data[key] = value
}

func (s *Store) Get(key string) (any, bool) {
	v, ok := s.data[key]
	return v, ok
}

func main() {
	fmt.Println("=== any の型アサーション ===")
	values := []any{42, 3.14, "hello", true, []int{1, 2, 3}, nil}
	for _, v := range values {
		printValue(v)
	}

	fmt.Println("\n=== 汎用ストア ===")
	store := NewStore()
	store.Set("age", 30)
	store.Set("name", "Gopher")

	if v, ok := store.Get("name"); ok {
		if name, ok := v.(string); ok {
			fmt.Printf("名前: %s\n", name)
		}
	}

	if v, ok := store.Get("age"); ok {
		if age, ok := v.(int); ok {
			fmt.Printf("年齢: %d\n", age)
		}
	}
}
```

`any` を使うと取り出す際に必ず型アサーションが必要になり、型ミスマッチは実行時まで検出されません。Go 1.18 以降はジェネリクス (`[T any]`) でより安全に書けるケースが多いです。

### 実行結果

```
=== any の型アサーション ===
int: 42
float64: 3.14
string: "hello"
bool: true
[]int: [1 2 3]
nil

=== 汎用ストア ===
名前: Gopher
年齢: 30
```

## パターン7: io.Reader / io.Writer

Go 標準ライブラリを代表する interface です。ファイル・ネットワーク・バッファなど、あらゆる I/O を同じ関数で扱えます。

### 使い所

「ファイルから読み込む」「HTTP レスポンスから読み込む」「メモリ上のバッファから読み込む」という処理は本来すべて異なる具体型です。`io.Reader` を受け取るように書いておけば、同じ関数でどの入力元にも対応できます。ログの出力先を `os.Stderr` にするか `bytes.Buffer` にするかをテスト時だけ差し替える、といったことが簡単にできます。

```go
package main

import (
	"bytes"
	"fmt"
	"io"
	"strings"
)

// CountingWriter は書き込んだバイト数を記録する io.Writer ラッパー
type CountingWriter struct {
	w     io.Writer
	count int64
}

func (cw *CountingWriter) Write(p []byte) (int, error) {
	n, err := cw.w.Write(p)
	cw.count += int64(n)
	return n, err
}

// UpperWriter は書き込み内容を大文字に変換する io.Writer ラッパー
type UpperWriter struct {
	w io.Writer
}

func (uw *UpperWriter) Write(p []byte) (int, error) {
	return uw.w.Write([]byte(strings.ToUpper(string(p))))
}

func main() {
	src := strings.NewReader("Hello, Go Interface!\n")

	var buf bytes.Buffer
	cw := &CountingWriter{w: &buf}
	uw := &UpperWriter{w: cw}

	// io.Reader -> UpperWriter -> CountingWriter -> bytes.Buffer
	n, err := io.Copy(uw, src)
	if err != nil {
		fmt.Printf("エラー: %v\n", err)
		return
	}

	fmt.Printf("書き込み結果: %s", buf.String())
	fmt.Printf("転送バイト数(io.Copy): %d\n", n)
	fmt.Printf("カウント(CountingWriter): %d\n", cw.count)
}
```

`UpperWriter` と `CountingWriter` はどちらも `io.Writer` を受け取って `io.Writer` を実装する「ラッパー」です。このように interface を実装しながら内部に別の interface を持つ構造をデコレーターパターンと呼びます。`io.Copy` は `io.Reader` と `io.Writer` だけを要求するため、どんな組み合わせでも透過的に動きます。

### 実行結果

```
書き込み結果: HELLO, GO INTERFACE!
転送バイト数(io.Copy): 21
カウント(CountingWriter): 21
```

## パターン8: fmt.Stringer

`fmt.Stringer` interface を実装すると、`fmt.Println` などで自動的に `String()` が呼ばれます。

### 使い所

独自の型をデバッグ出力やログに出す際、デフォルトの `{10 20}` のような表示では意味がわかりません。`String()` を実装しておくと `fmt` パッケージが自動的に使ってくれるため、呼び出し側で変換コードを書く必要がなくなります。

```go
package main

import "fmt"

type Direction int

const (
	North Direction = iota
	South
	East
	West
)

func (d Direction) String() string {
	switch d {
	case North:
		return "北"
	case South:
		return "南"
	case East:
		return "東"
	case West:
		return "西"
	default:
		return "不明"
	}
}

type Point struct {
	X, Y int
}

func (p Point) String() string {
	return fmt.Sprintf("(%d, %d)", p.X, p.Y)
}

type Player struct {
	Name     string
	Position Point
	Facing   Direction
}

func (p Player) String() string {
	return fmt.Sprintf("プレイヤー[%s] 位置:%s 向き:%s", p.Name, p.Position, p.Facing)
}

func main() {
	player := Player{
		Name:     "勇者",
		Position: Point{X: 10, Y: 20},
		Facing:   North,
	}

	fmt.Println(player)
	fmt.Printf("向いている方向: %v\n", player.Facing)
	fmt.Printf("現在地: %s\n", player.Position)
}
```

`Player.String()` の中で `p.Position` と `p.Facing` を `%s` でフォーマットしていますが、これらも `Stringer` を実装しているため再帰的に `String()` が呼ばれます。`fmt` パッケージは `Stringer` を自動検出するため、`%v` でも `%s` でも同様に機能します。

### 実行結果

```
プレイヤー[勇者] 位置:(10, 20) 向き:北
向いている方向: 北
現在地: (10, 20)
```

## まとめ

Go の interface は小さく定義して組み合わせる設計が基本です。パターンごとに整理すると以下のようになります。

| パターン | 用途 |
|---|---|
| 基本 | 複数の実装を同じ関数で扱う |
| ポリモーフィズム | 実装を追加しても呼び出し側を変えない |
| 埋め込み | 最小限の能力だけを要求する |
| 型アサーション | interface から具体型を安全に取り出す |
| 依存性注入 | 具体的な実装をコンストラクタで差し替える |
| 空の interface | 型を問わない汎用コンテナ（最後の手段） |
| io.Reader/Writer | ファイル・バッファ・ネットワークを統一的に扱う |
| fmt.Stringer | fmt パッケージによる自動文字列変換 |

interface を小さく保つことで、テスト時のモック差し替えや新しい実装の追加が容易になります。特に依存性注入と io.Reader/Writer のパターンは実務で頻繁に登場するため、早めに慣れておくと Go のコードが読みやすくなると思います。
