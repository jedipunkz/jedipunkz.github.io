---
title: "[Go 再学習] Go の interface を理解する"
date: 2026-04-13T00:00:00+09:00
Categories: ["go"]
draft: false
description: "Go の interface の基本から実践的なパターンまで、サンプルコードを交えて解説する"
---
Go の再学習をしている最中なのですが、学習当初 Go Interface は「なんとなく分かるが使いこなせない」という感覚を持っていました。自分のコードでも使っているのですが、どのようなパターンで使えるのかを網羅的には知っていない状態だったのでこれを機に調べてみました。この記事では基本的な定義から実務でよく登場するパターンまでをサンプルコードと共に整理しました。

コードは以下のレポジトリにあります。

https://github.com/jedipunkz/go-tips

## interface とは

interface はメソッドのシグネチャの集合を定義する型です。ある型が interface に定義されたメソッドをすべて持っていれば、自動的にその interface を満たします。

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
// メソッドセットを持つ型はこのインターフェースを満たす
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

複数の実装を同じ interface でまとめて扱うパターンです。同じ関数で異なる型を扱えます。


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

小さな interface を組み合わせて大きな interface を作る「埋め込み」パターンです。

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

interface を使って依存関係を外から注入するパターンです。


### 使い所

`UserService` はリポジトリの具体的な実装を知らず、`UserRepository` interface だけに依存します。

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


## まとめ

パターンごとに整理すると以下のようになります。

| パターン | 用途 |
|---|---|
| 基本 | 複数の実装を同じ関数で扱う |
| ポリモーフィズム | 実装を追加しても呼び出し側を変えない |
| 埋め込み | 最小限の能力だけを要求する |
| 型アサーション | interface から具体型を安全に取り出す |
| 依存性注入 | 具体的な実装をコンストラクタで差し替える |

interface を小さく保つことで、テスト時のモック差し替えや新しい実装の追加が容易になると考えると良さそうです。
