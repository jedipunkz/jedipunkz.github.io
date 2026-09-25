---
title: "Rust 入門: 構文集"
description: "Rust の主要な構文を網羅的にまとめた入門記事。型システム、所有権と借用、構造体と列挙型、トレイト、ジェネリクス、エラーハンドリング、並行処理など、サンプルコードとともに解説"
date: 2026-09-25T12:00:00+09:00
Categories: ["tools"]
draft: false
---
こんにちは [@jedipunkz](https://x.com/jedipunkz) です。

自作ツールの [gm](https://jedipunkz.rocks/post/gm/) を Go から Rust に書き換えたことをきっかけに、Rust の構文を網羅的に理解する必要性を感じてサンプルコードを作成し動作確認した上で構文集を作成しました。この記事では Rust の主要な構文をまとめたいと思います。

サンプルコードは Rust 1.98 / Edition 2024 で動作確認しています。各コードは `fn main()` を含む単体のプログラムなので、`rustc --edition 2024 main.rs` でそのまま実行できます (非同期の節のみ tokio クレートを使います)。

※  気が向いたときに新しい構文が出てきた際に更新し続ける記事にしようと思っています。

## 目次

### 1. [基本的な型システム](#基本的な型システム)
- [スカラー型](#スカラー型)
- [変数と可変性](#変数と可変性)
- [型注釈と型推論](#型注釈と型推論)
- [型変換](#型変換)
- [型エイリアス](#型エイリアス)

### 2. [複合型](#複合型)
- [タプルと配列](#タプルと配列)
- [文字列](#文字列)
- [構造体](#構造体)
- [列挙型](#列挙型)
- [Option と Result](#option-と-result)

### 3. [制御フロー](#制御フロー)
- [条件分岐とループ](#条件分岐とループ)
- [パターンマッチ](#パターンマッチ)
- [if let と let else と let チェーン](#if-let-と-let-else-と-let-チェーン)

### 4. [所有権と借用](#所有権と借用)
- [所有権とムーブ](#所有権とムーブ)
- [参照と借用](#参照と借用)
- [ライフタイム](#ライフタイム)

### 5. [関数とクロージャ](#関数とクロージャ)
- [関数の定義](#関数の定義)
- [クロージャ](#クロージャ)

### 6. [メソッドとトレイト](#メソッドとトレイト)
- [impl ブロック](#impl-ブロック)
- [トレイトの定義と実装](#トレイトの定義と実装)
- [スーパートレイトとトレイトオブジェクト](#スーパートレイトとトレイトオブジェクト)
- [derive と標準トレイト](#derive-と標準トレイト)
- [演算子オーバーロード](#演算子オーバーロード)

### 7. [ジェネリクス](#ジェネリクス)
- [ジェネリクスの基本](#ジェネリクスの基本)
- [トレイト境界](#トレイト境界)
- [関連型と const ジェネリクス](#関連型と-const-ジェネリクス)

### 8. [エラーハンドリング](#エラーハンドリング)
- [独自のエラー型と ? 演算子](#独自のエラー型と--演算子)
- [main から Result を返す](#main-から-result-を返す)

### 9. [コレクションとイテレータ](#コレクションとイテレータ)
- [Vec](#vec)
- [HashMap と HashSet](#hashmap-と-hashset)
- [イテレータ](#イテレータ)
- [独自のイテレータ](#独自のイテレータ)

### 10. [スマートポインタ](#スマートポインタ)
- [Box と Rc と RefCell](#box-と-rc-と-refcell)

### 11. [並行処理と非同期](#並行処理と非同期)
- [スレッド](#スレッド)
- [async と await](#async-と-await)

### 12. [モジュール](#モジュール)
- [モジュールと可視性](#モジュールと可視性)
- [クレートと Cargo](#クレートと-cargo)

### 13. [高度な機能](#高度な機能)
- [マクロ](#マクロ)
- [属性](#属性)
- [テスト](#テスト)
- [unsafe](#unsafe)

## 基本的な型システム

Rust は静的型付け言語で、すべての値の型がコンパイル時に決まります。型推論が強力なため、多くの場合は型を書かずに済みます。

### スカラー型

スカラー型は単一の値を表す型です。

- 整数型 - 符号付きの `i8` `i16` `i32` `i64` `i128` `isize` と、符号なしの `u8` `u16` `u32` `u64` `u128` `usize` があります。数字はビット数で、`isize` / `usize` は実行環境のポインタサイズ (64 bit 環境なら 64 bit) です。型を指定しない整数リテラルは `i32` になります。配列のインデックスや長さには `usize` を使います。
- 浮動小数点型 - `f32` と `f64` があります。型を指定しない小数リテラルは `f64` になります。
- bool 型 - 真偽値を表します。`true` または `false` のいずれかの値を持ちます。
- char 型 - 1 つの Unicode スカラー値を表す 4 バイトの型です。シングルクォートで記述します。日本語や絵文字も 1 文字として扱えます。
- ユニット型 `()` - 値が無いことを表します。値を返さない関数の戻り値の型です。

整数のオーバーフローは、debug ビルドでは panic し、release ビルドでは折り返します。どちらにも依存しないように、`checked_*` `wrapping_*` `saturating_*` などのメソッドで挙動を明示できます。

```rust
fn main() {
    // 整数型と浮動小数点型
    let dog_age: u8 = 3;
    let distance: i64 = -1_000_000; // _ で桁を区切れる
    let weight: f64 = 12.5;

    println!("{dog_age}");   // 出力: 3
    println!("{distance}");  // 出力: -1000000
    println!("{weight}");    // 出力: 12.5

    // 16 進数・8 進数・2 進数・バイトリテラル
    let hex = 0xff;
    let octal = 0o17;
    let binary = 0b1010;
    let byte = b'A';
    println!("{hex} {octal} {binary} {byte}"); // 出力: 255 15 10 65

    // 真偽値と文字
    let is_dog_hungry: bool = true;
    let emoji: char = '🐕';
    println!("{is_dog_hungry}"); // 出力: true
    println!("{emoji}");         // 出力: 🐕

    // ユニット型
    let unit: () = ();
    println!("{unit:?}"); // 出力: ()

    // 型ごとの最大値・最小値
    println!("{}", u8::MAX);  // 出力: 255
    println!("{}", i32::MIN); // 出力: -2147483648

    // オーバーフローの扱いを明示するメソッド
    let max = u8::MAX;
    println!("{:?}", max.checked_add(1));  // 出力: None
    println!("{}", max.wrapping_add(1));   // 出力: 0
    println!("{}", max.saturating_add(1)); // 出力: 255
}
```

### 変数と可変性

変数は `let` で宣言します。Rust の変数はデフォルトで不変 (immutable) で、再代入するには `mut` を付けて宣言する必要があります。

- シャドーイング - 同じ名前で `let` をもう一度書くと、新しい変数で前の変数を覆い隠せます。`mut` と違い、型を変えることもできます。
- const - コンパイル時に値が決まる定数です。型注釈が必須で、名前は大文字のスネークケースにする慣習があります。使った箇所にインライン展開されます。
- static - プログラムの実行中ずっと同じアドレスに存在する値です。const と違いメモリ上に 1 つだけ存在します。

```rust
const MAX_DOGS: u32 = 100;
static SHELTER_NAME: &str = "Happy Paws";

fn main() {
    let name = "Buddy";
    // name = "Max"; // エラー[E0384]: cannot assign twice to immutable variable `name`

    let mut age = 3;
    age += 1;
    println!("{name} is {age}"); // 出力: Buddy is 4

    // シャドーイング（同じ名前で新しい変数を宣言する）
    let weight = "12";
    let weight: u32 = weight.parse().unwrap(); // &str から u32 に型が変わる
    println!("{}", weight * 2); // 出力: 24

    println!("{MAX_DOGS}");     // 出力: 100
    println!("{SHELTER_NAME}"); // 出力: Happy Paws
}
```

不変がデフォルトなので、`mut` が付いている変数だけを見れば値が変わる箇所が分かります。

### 型注釈と型推論

型注釈 (Type Annotation) は `: 型名` の形式で変数に明示的に型を指定する機能です。

型推論 (Type Inference) は Rust が型を自動的に判断する機能です。初期値だけでなく、その後の使われ方からも型を推論します。ただし、関数の引数と戻り値は型推論されないため型注釈が必要です。

`parse()` や `collect()` のように戻り値の型が複数ありえるメソッドは、変数の型注釈か、ターボフィッシュ `::<>` で型を指定します。

```rust
fn greet_dog(name: &str) -> String {
    format!("Hello, {name}!")
}

fn main() {
    // 型注釈
    let cat_name: &str = "Whiskers";
    println!("{cat_name}"); // 出力: Whiskers

    // 型推論
    let lion_age = 5;   // i32 と推論される
    let weight = 190.5; // f64 と推論される
    println!("{lion_age} {weight}"); // 出力: 5 190.5

    // 後の使われ方から推論される
    let mut animals = Vec::new(); // この時点では要素の型が決まっていない
    animals.push("Dog");          // Vec<&str> と推論される
    println!("{animals:?}");      // 出力: ["Dog"]

    // 推論できない場合は型注釈かターボフィッシュ (::<>) が必要
    let count: u32 = "42".parse().unwrap();
    let total = "8".parse::<u32>().unwrap();
    println!("{}", count + total); // 出力: 50

    println!("{}", greet_dog("Buddy")); // 出力: Hello, Buddy!
    // greet_dog(123); // エラー[E0308]: mismatched types
}
```

関数のシグネチャに型を必ず書くルールにより、関数の中身を読まなくても使い方が分かり、型推論の範囲が関数の中に閉じます。

### 型変換

Rust は暗黙の型変換をほとんど行いません。`i32` と `i64` の足し算もそのままではコンパイルエラーになるため、変換を明示します。

- `as` - プリミティブ型同士のキャストです。範囲外の値は切り捨てられるなど、情報が失われることがあります。
- `From` / `Into` - 失敗しない変換です。`From` を実装すると `Into` も自動的に使えるようになります。
- `TryFrom` / `TryInto` - 失敗しうる変換です。`Result` を返します。
- `parse` / `to_string` - 文字列との相互変換です。

```rust
fn main() {
    // as によるプリミティブ型のキャスト
    let age: i32 = 300;
    println!("{}", age as f64 / 2.0); // 出力: 150
    println!("{}", age as u8);        // 出力: 44
    // u8 に収まらない値は上位ビットが切り捨てられる (300 - 256 = 44)
    println!("{}", 3.99_f64 as i32);  // 出力: 3

    // From / Into（失敗しない変換）
    let small: u8 = 42;
    let big: u64 = u64::from(small);
    let bigger: i128 = small.into();
    println!("{big} {bigger}"); // 出力: 42 42

    // TryFrom / TryInto（失敗しうる変換）
    let result = u8::try_from(300_i32);
    println!("{result:?}"); // 出力: Err(TryFromIntError(PosOverflow))
    let ok: Result<u8, _> = 200_i32.try_into();
    println!("{ok:?}"); // 出力: Ok(200)

    // 文字列との相互変換
    let n: i32 = "123".parse().unwrap();
    let s = n.to_string();
    println!("{} {}", n + 1, s + "!"); // 出力: 124 123!
}
```

### 型エイリアス

型エイリアスは `type` キーワードで既存の型に別名を付ける機能です。長い型を短く書けます。別名なので元の型と互換性があり、取り違えを防ぐ効果はありません。取り違えを防ぎたい場合は `struct DogId(u32);` のように 1 要素のタプル構造体で包む newtype パターンを使います。

```rust
type DogId = u32;
type Kennel = Vec<(DogId, String)>;
type Callback = Box<dyn Fn(&str) -> String>;

fn main() {
    let kennel: Kennel = vec![(1, String::from("Buddy")), (2, String::from("Max"))];
    println!("{:?}", kennel[1]); // 出力: (2, "Max")

    let greet: Callback = Box::new(|name| format!("Hello, {name}!"));
    println!("{}", greet("Luna")); // 出力: Hello, Luna!

    // 別名なので元の型と互換性がある
    let id: DogId = 5;
    let raw: u32 = id;
    println!("{raw}"); // 出力: 5
}
```

標準ライブラリの `std::io::Result<T>` のように、エラー型を固定した `type Result<T> = std::result::Result<T, MyError>;` という形もよく使われます。

## 複合型

複合型は複数の値を 1 つにまとめる型です。

### タプルと配列

タプルは異なる型の値を固定個数まとめる型です。`.0` `.1` のようにインデックスでアクセスするか、パターンで分解して使います。

配列は同じ型の値を固定個数持つ型で、型は `[型; 要素数]` と書きます。要素数も型の一部なので、`[i32; 3]` と `[i32; 4]` は別の型です。長さが実行時に変わる場合は後述の `Vec` を使います。

スライス `&[T]` は配列や `Vec` の連続した一部分への参照です。関数の引数を `&[T]` にすると、配列と `Vec` のどちらも受け取れます。

```rust
fn main() {
    // タプル
    let pet: (&str, u8, bool) = ("Buddy", 3, true);
    println!("{}", pet.0); // 出力: Buddy
    let (name, age, vaccinated) = pet; // 分解
    println!("{name} {age} {vaccinated}"); // 出力: Buddy 3 true

    // 配列（固定長・同じ型）
    let animals: [&str; 3] = ["Dog", "Cat", "Bird"];
    let zeros = [0; 5]; // 0 を 5 個並べる
    println!("{}", animals[0]);    // 出力: Dog
    println!("{}", animals.len()); // 出力: 3
    println!("{zeros:?}");         // 出力: [0, 0, 0, 0, 0]

    // スライス（配列や Vec の一部への参照）
    let ages = [3, 5, 2, 8];
    let middle: &[i32] = &ages[1..3];
    println!("{middle:?}"); // 出力: [5, 2]
}
```

範囲外のインデックスへのアクセスは、定数で分かる場合はコンパイルエラー、実行時に決まる場合は panic になります。未定義動作にはなりません。

### 文字列

Rust の文字列には主に 2 つの型があります。どちらも中身は UTF-8 です。

- `String` - ヒープに確保される、所有権を持つ可変な文字列です。
- `&str` - 文字列スライスです。`String` や文字列リテラルの一部を借用して参照します。文字列リテラルの型は `&'static str` です。

関数の引数は `&str` にしておくと、`&String` も自動的に `&str` に変換されて (Deref 型強制) 受け取れます。

`len()` はバイト数を返します。文字数は `chars().count()` で数えます。スライスの範囲が文字の境界に一致しないと panic します。

書式指定は `println!` や `format!` で共通です。`{}` は `Display`、`{:?}` は `Debug` で表示し、`{name}` のように変数名を直接書けます。

```rust
fn main() {
    // &str: 文字列スライス（借用）
    let greeting: &str = "Hello";

    // String: ヒープ上の可変な文字列（所有）
    let mut name = String::from("Bud");
    name.push_str("dy");
    name.push('!');
    println!("{name}"); // 出力: Buddy!

    // 連結
    let message = format!("{greeting}, {name}");
    println!("{message}"); // 出力: Hello, Buddy!
    let joined = String::from("Dog") + "-" + "Cat";
    println!("{joined}"); // 出力: Dog-Cat

    // String から &str へは & で借用できる
    let slice: &str = &name;
    println!("{}", slice.len()); // 出力: 6

    // UTF-8 なので文字数とバイト数は一致しない
    let japanese = "こんにちは";
    println!("{}", japanese.len());           // 出力: 15
    println!("{}", japanese.chars().count()); // 出力: 5
    println!("{}", &japanese[0..3]);          // 出力: こ
    // &japanese[0..1]; // panic: 文字の境界ではない

    // よく使うメソッド
    println!("{}", "  Max  ".trim());               // 出力: Max
    println!("{}", "dog".to_uppercase());           // 出力: DOG
    println!("{}", "Buddy".contains("dd"));         // 出力: true
    println!("{}", "cat".replace('c', "b"));        // 出力: bat
    println!("{:?}", "a,b,c".split(',').collect::<Vec<_>>()); // 出力: ["a", "b", "c"]

    // 生文字列リテラル（エスケープしない）
    let path = r"C:\animals\dog.txt";
    println!("{path}"); // 出力: C:\animals\dog.txt

    // 書式指定
    let pi = 3.14159;
    println!("{pi:.2}");        // 出力: 3.14
    println!("[{:>6}]", "Dog"); // 出力: [   Dog]
    println!("[{:<6}]", "Dog"); // 出力: [Dog   ]
    println!("{:05}", 42);      // 出力: 00042
    println!("{:#x}", 255);     // 出力: 0xff
}
```

### 構造体

構造体は名前付きのフィールドをまとめる型で、`struct` キーワードで定義します。TypeScript のオブジェクト型やクラスのデータ部分に相当します。

- 名前付きフィールドの構造体 - 最も一般的な形です。
- タプル構造体 - フィールドに名前が無く、`.0` `.1` でアクセスします。newtype パターンにも使います。
- ユニット構造体 - フィールドを持ちません。トレイトを実装するための目印などに使います。

フィールド名と同じ名前の変数があれば `name: name` を `name` と省略できます。構造体更新記法 `..既存の値` を使うと、残りのフィールドを既存の値から取り込めます。

可変性はフィールド単位では指定できません。インスタンス全体を `mut` で宣言します。

```rust
#[derive(Debug)]
struct Dog {
    name: String,
    age: u8,
    breed: String,
}

// タプル構造体
struct Point(i32, i32);

// ユニット構造体
struct Marker;

fn main() {
    let name = String::from("Max");
    let dog = Dog {
        name, // フィールド名と変数名が同じなら省略できる
        age: 4,
        breed: String::from("Golden Retriever"),
    };
    println!("{} is {}", dog.name, dog.age); // 出力: Max is 4

    // 構造体更新記法（breed は dog からムーブされる）
    let puppy = Dog {
        name: String::from("Charlie"),
        age: 1,
        ..dog
    };
    println!("{puppy:?}"); // 出力: Dog { name: "Charlie", age: 1, breed: "Golden Retriever" }

    // 変更するにはインスタンス全体を mut にする
    let mut luna = Dog {
        name: String::from("Luna"),
        age: 2,
        breed: String::from("Shiba"),
    };
    luna.age += 1;
    println!("{} {}", luna.age, luna.breed); // 出力: 3 Shiba

    let p = Point(10, 20);
    println!("{} {}", p.0, p.1); // 出力: 10 20

    let _marker = Marker;
}
```

`#[derive(Debug)]` を付けると `{:?}` で中身を表示できるようになります。derive については[後述](#derive-と標準トレイト)します。

### 列挙型

列挙型 (enum) は取りうる値 (バリアント) を列挙する型です。Rust の enum はバリアントごとに異なるデータを持てます。TypeScript の Discriminated Unions に相当するものが言語機能として組み込まれていて、`match` でバリアントを判別すると、そのバリアントのデータを安全に取り出せます。

`match` はすべてのバリアントを網羅していないとコンパイルエラーになるため、バリアントを追加したときに処理の漏れをコンパイラが検出します。

```rust
// データを持たない列挙型
#[derive(Debug)]
enum Direction {
    North,
    South,
    East,
    West,
}

// 判別値を指定した列挙型
enum HttpStatus {
    Ok = 200,
    NotFound = 404,
    InternalServerError = 500,
}

// バリアントごとに異なるデータを持つ列挙型
enum Shape {
    Circle { radius: f64 },
    Square(f64),
    Rectangle { width: f64, height: f64 },
}

impl Shape {
    fn area(&self) -> f64 {
        match self {
            Shape::Circle { radius } => std::f64::consts::PI * radius * radius,
            Shape::Square(side) => side * side,
            Shape::Rectangle { width, height } => width * height,
        }
    }
}

fn main() {
    let directions = [Direction::North, Direction::South, Direction::East, Direction::West];
    println!("{directions:?}"); // 出力: [North, South, East, West]

    println!(
        "{} {} {}",
        HttpStatus::Ok as i32,
        HttpStatus::NotFound as i32,
        HttpStatus::InternalServerError as i32
    ); // 出力: 200 404 500

    let shapes = [
        Shape::Circle { radius: 10.0 },
        Shape::Square(5.0),
        Shape::Rectangle { width: 10.0, height: 20.0 },
    ];
    for shape in &shapes {
        println!("{:.2}", shape.area());
    }
    // 出力: 314.16
    // 出力: 25.00
    // 出力: 200.00
}
```

### Option と Result

Rust には `null` がありません。値が無いかもしれないことは `Option<T>` で、失敗するかもしれないことは `Result<T, E>` で表します。どちらも標準ライブラリで定義された列挙型です。

- `Option<T>` - 値がある `Some(T)` か、値が無い `None` のどちらかです。
- `Result<T, E>` - 成功した `Ok(T)` か、失敗した `Err(E)` のどちらかです。

型として区別されるため、値が無い場合やエラーの処理を忘れるとコンパイルエラーになります。中身の取り出しには `match` や `if let` のほか、`unwrap_or` `map` `and_then` `ok_or` などのメソッドを使います。`unwrap()` と `expect()` は `None` や `Err` のときに panic するため、テストや失敗しないことが確実な箇所に限って使います。

```rust
fn find_dog(id: u32) -> Option<&'static str> {
    match id {
        1 => Some("Buddy"),
        2 => Some("Max"),
        _ => None,
    }
}

fn parse_age(input: &str) -> Result<u8, String> {
    input.parse::<u8>().map_err(|e| format!("invalid age: {e}"))
}

fn main() {
    // Option<T>: 値がある (Some) か、ない (None)
    println!("{:?}", find_dog(1)); // 出力: Some("Buddy")
    println!("{:?}", find_dog(9)); // 出力: None

    // 値の取り出し
    println!("{}", find_dog(9).unwrap_or("Unknown"));     // 出力: Unknown
    println!("{:?}", find_dog(2).map(|name| name.len())); // 出力: Some(3)

    if let Some(name) = find_dog(1) {
        println!("Found {name}"); // 出力: Found Buddy
    }

    // Result<T, E>: 成功 (Ok) か、失敗 (Err)
    println!("{:?}", parse_age("3"));   // 出力: Ok(3)
    println!("{:?}", parse_age("abc")); // 出力: Err("invalid age: invalid digit found in string")

    match parse_age("300") {
        Ok(age) => println!("Age: {age}"),
        Err(e) => println!("Error: {e}"), // 出力: Error: invalid age: number too large to fit in target type
    }

    // Option と Result の相互変換
    let as_result: Result<&str, &str> = find_dog(9).ok_or("not found");
    println!("{as_result:?}"); // 出力: Err("not found")
    let as_option: Option<u8> = parse_age("5").ok();
    println!("{as_option:?}"); // 出力: Some(5)
}
```

## 制御フロー

Rust の `if` `match` `loop` はすべて式で、値を返せます。

### 条件分岐とループ

- if - 条件式は `bool` 型である必要があります。数値や `Option` を条件にはできません。式なので三項演算子の代わりに使えます。
- loop - 無限ループです。`break 値` でループから値を返せます。
- while - 条件が `true` の間繰り返します。
- for - イテレータを順に処理します。`1..5` は 5 を含まない範囲、`1..=5` は 5 を含む範囲です。
- ラベル - `'outer:` のようにループに名前を付けると、ネストした内側から外側のループを `break` / `continue` できます。
- while let - パターンに一致する間繰り返します。

```rust
fn main() {
    // if は式なので値を返せる
    let age = 3;
    let stage = if age < 1 { "puppy" } else if age < 8 { "adult" } else { "senior" };
    println!("{stage}"); // 出力: adult

    // loop は break で値を返せる
    let mut count = 0;
    let result = loop {
        count += 1;
        if count == 5 {
            break count * 10;
        }
    };
    println!("{result}"); // 出力: 50

    // while
    let mut treats = 3;
    while treats > 0 {
        treats -= 1;
    }
    println!("{treats}"); // 出力: 0

    // for と範囲
    let mut sum = 0;
    for i in 1..=5 {
        sum += i;
    }
    println!("{sum}"); // 出力: 15

    // インデックス付きで反復する
    let animals = ["Dog", "Cat", "Bird"];
    for (i, animal) in animals.iter().enumerate() {
        println!("{i}: {animal}");
    }
    // 出力: 0: Dog
    // 出力: 1: Cat
    // 出力: 2: Bird

    // ラベル付きループ
    'outer: for x in 0..5 {
        for y in 0..5 {
            if x + y == 6 {
                println!("{x} + {y}"); // 出力: 2 + 4
                break 'outer;
            }
        }
    }

    // while let: パターンに一致する間繰り返す
    let mut stack = vec![1, 2, 3];
    while let Some(top) = stack.pop() {
        println!("{top}");
    }
    // 出力: 3
    // 出力: 2
    // 出力: 1
}
```

### パターンマッチ

`match` は値をパターンと上から順に照合し、最初に一致した腕を実行します。すべての可能性を網羅する必要があり、残りをまとめて扱うには `_` を使います。

- `|` - 複数のパターンのいずれかに一致します。
- `1..=5` - 範囲に一致します。
- ガード `if 条件` - パターンに加えて条件を付けます。
- `名前 @ パターン` - パターンに一致した値に名前を付けます。
- `..` - 構造体やタプル、スライスの残りの要素を無視します。
- `matches!` マクロ - パターンに一致するかを `bool` で返します。

パターンは `match` だけでなく、`let` や関数の引数、`for` でも使えます。

```rust
struct Dog {
    name: String,
    age: u8,
}

fn describe(age: u8) -> &'static str {
    match age {
        0 => "newborn",
        1 | 2 => "puppy",
        3..=7 => "adult",
        _ => "senior",
    }
}

fn main() {
    println!("{}", describe(0));  // 出力: newborn
    println!("{}", describe(2));  // 出力: puppy
    println!("{}", describe(10)); // 出力: senior

    // ガードと @ バインディング
    let weight = 35;
    let size = match weight {
        w @ 0..=10 => format!("small ({w}kg)"),
        w if w > 30 => format!("large ({w}kg)"),
        w => format!("medium ({w}kg)"),
    };
    println!("{size}"); // 出力: large (35kg)

    // タプルの分解
    let point = (0, 7);
    match point {
        (0, y) => println!("on the y axis at {y}"), // 出力: on the y axis at 7
        (x, 0) => println!("on the x axis at {x}"),
        _ => println!("elsewhere"),
    }

    // 構造体の分解
    let dog = Dog { name: String::from("Buddy"), age: 3 };
    let Dog { name, age } = &dog;
    println!("{name} {age}"); // 出力: Buddy 3

    match &dog {
        Dog { age: 0..=1, .. } => println!("young"),
        Dog { name, .. } => println!("{name} is grown up"), // 出力: Buddy is grown up
    }

    // スライスパターン
    let animals = ["Dog", "Cat", "Bird", "Fish"];
    match &animals[..] {
        [] => println!("empty"),
        [only] => println!("only {only}"),
        [first, .., last] => println!("{first} ... {last}"), // 出力: Dog ... Fish
    }

    // matches! マクロ
    println!("{}", matches!(describe(5), "adult" | "senior")); // 出力: true
}
```

### if let と let else と let チェーン

1 つのパターンだけを扱う場合は、`match` より短く書ける構文があります。

- if let - パターンに一致したときだけ処理します。`else` も付けられます。
- let else - パターンに一致しなければ `else` ブロックを実行します。`else` ブロックは `return` や `break` などで必ず抜ける必要があります。一致した場合の変数は後続のコードでそのまま使えるため、早期リターンでネストを浅くできます。
- let チェーン - `if` の条件で `let` パターンと `bool` の条件を `&&` でつなげます。Rust 1.88 以降かつ Edition 2024 で使えます。
- if let ガード - `match` のガードに `if let` を書けます。Rust 1.95 以降で使えます。

```rust
fn parse_pair(input: &str) -> Option<(String, u8)> {
    // let else: パターンに一致しなければ else で早期リターン
    let Some((name, age)) = input.split_once(':') else {
        return None;
    };
    let Ok(age) = age.parse::<u8>() else {
        return None;
    };
    Some((name.to_string(), age))
}

fn main() {
    // if let: 1 つのパターンだけ扱う
    let favorite: Option<&str> = Some("Buddy");
    if let Some(name) = favorite {
        println!("Favorite: {name}"); // 出力: Favorite: Buddy
    } else {
        println!("No favorite");
    }

    println!("{:?}", parse_pair("Max:4")); // 出力: Some(("Max", 4))
    println!("{:?}", parse_pair("Max"));   // 出力: None

    // let チェーン（Rust 1.88 以降、Edition 2024）
    let input = "Luna:2";
    if let Some((name, age)) = parse_pair(input)
        && age < 3
        && let Some(initial) = name.chars().next()
    {
        println!("{name} ({initial}) is a puppy"); // 出力: Luna (L) is a puppy
    }

    // if let ガード（Rust 1.95 以降）
    let entries = ["Buddy:5", "unknown", "Kitty:x"];
    for entry in entries {
        match entry {
            e if let Some((name, age)) = parse_pair(e) => println!("{name}: {age}"),
            e if e.contains(':') => println!("broken: {e}"),
            e => println!("skipped: {e}"),
        }
    }
    // 出力: Buddy: 5
    // 出力: skipped: unknown
    // 出力: broken: Kitty:x
}
```

## 所有権と借用

所有権 (Ownership) は、ガベージコレクタを使わずにメモリ安全性を保証する Rust の中心的な仕組みです。ルールはコンパイル時に検査されるため、実行時のコストはかかりません。

### 所有権とムーブ

所有権には次の 3 つのルールがあります。

- それぞれの値には所有者 (owner) と呼ばれる変数が 1 つだけ存在する。
- 所有者がスコープを抜けると、値は破棄 (drop) される。
- 代入や関数への受け渡しで、所有権は移動 (move) する。移動元の変数はそれ以降使えない。

整数・浮動小数点数・`bool`・`char` など `Copy` トレイトを実装する型は、ムーブではなくコピーされるため、代入後も元の変数を使えます。`String` や `Vec` のようにヒープを使う型を複製したい場合は `clone()` を明示的に呼びます。

```rust
fn take_ownership(name: String) {
    println!("{name} was adopted");
}

fn main() {
    // ムーブ: 所有権が移動する
    let dog = String::from("Buddy");
    let adopted = dog;
    // println!("{dog}"); // エラー[E0382]: borrow of moved value: `dog`
    println!("{adopted}"); // 出力: Buddy

    // 関数に渡してもムーブする
    let cat = String::from("Whiskers");
    take_ownership(cat); // 出力: Whiskers was adopted
    // println!("{cat}"); // エラー[E0382]: borrow of moved value: `cat`

    // clone: 値を複製する（ヒープ上のデータもコピーされる）
    let bird = String::from("Tweety");
    let bird_copy = bird.clone();
    println!("{bird} {bird_copy}"); // 出力: Tweety Tweety

    // Copy トレイトを実装する型はコピーされる
    let age = 3;
    let age_copy = age;
    println!("{age} {age_copy}"); // 出力: 3 3

    // スコープを抜けると値は破棄 (drop) される
    {
        let temp = String::from("temporary");
        println!("{temp}"); // 出力: temporary
    } // ここで temp が drop される
}
```

### 参照と借用

参照 (reference) を使うと、所有権を移さずに値を使えます。参照を作ることを借用 (borrow) と呼びます。

- `&T` - 不変参照です。値を読むことだけができます。
- `&mut T` - 可変参照です。値を変更できます。

借用には「不変参照はいくつでも同時に存在できる」「可変参照は同時に 1 つだけで、不変参照とも共存できない」というルールがあります。このルールによりデータ競合がコンパイル時に防がれます。参照は最後に使われた時点で終わるとみなされるため、使い終わった参照は後の借用を妨げません。

参照先の値を読み書きするには `*` で参照外しします。メソッド呼び出しやフィールドアクセスでは自動的に参照外しされます。

```rust
fn name_length(name: &str) -> usize {
    name.len()
}

fn add_suffix(name: &mut String) {
    name.push_str(" Jr.");
}

fn main() {
    let mut name = String::from("Buddy");

    // 不変参照: 所有権を移さずに値を読む（&String は &str に自動変換される）
    let len = name_length(&name);
    println!("{name} {len}"); // 出力: Buddy 5

    // 可変参照: 所有権を移さずに値を変更する
    add_suffix(&mut name);
    println!("{name}"); // 出力: Buddy Jr.

    // 不変参照は同時にいくつでも作れる
    let r1 = &name;
    let r2 = &name;
    println!("{r1} / {r2}"); // 出力: Buddy Jr. / Buddy Jr.

    // 可変参照は同時に 1 つだけ。不変参照とも共存できない
    let r3 = &mut name;
    // let r4 = &name; // エラー[E0502]: cannot borrow `name` as immutable because it is also borrowed as mutable
    r3.push('!');
    println!("{r3}"); // 出力: Buddy Jr.!

    // * で参照外しして値を変更する
    let mut count = 10;
    let c = &mut count;
    *c += 1;
    println!("{count}"); // 出力: 11
}
```

### ライフタイム

ライフタイム (lifetime) は参照が有効な期間です。Rust は参照先の値より参照が長く生きること (ぶら下がり参照) をコンパイル時に禁止します。

ほとんどの場合ライフタイムは省略規則により推論されますが、関数が複数の参照を受け取って参照を返す場合など、どの引数の参照を返すのかが決まらない場合は `'a` のようなライフタイム注釈で関係を示します。注釈はライフタイムを延ばすものではなく、参照同士の関係をコンパイラに伝えるものです。

参照をフィールドに持つ構造体にもライフタイム注釈が必要です。`'static` はプログラムの終了まで有効なライフタイムで、文字列リテラルがこれに当たります。

```rust
// 戻り値の参照が 2 つの引数と同じ期間だけ有効であることを 'a で示す
fn longer<'a>(a: &'a str, b: &'a str) -> &'a str {
    if a.len() >= b.len() { a } else { b }
}

// 参照をフィールドに持つ構造体にはライフタイム注釈が必要
struct DogTag<'a> {
    name: &'a str,
}

impl DogTag<'_> {
    // 省略規則により戻り値は &self と同じライフタイムになる
    fn name(&self) -> &str {
        self.name
    }
}

fn main() {
    println!("{}", longer("Buddy", "Max")); // 出力: Buddy

    let owner = String::from("Charlie");
    let tag = DogTag { name: &owner };
    println!("{}", tag.name()); // 出力: Charlie

    // 'static: プログラムの終了まで有効な参照
    let s: &'static str = "I live forever";
    println!("{s}"); // 出力: I live forever

    // ぶら下がり参照はコンパイルエラーになる
    // let r;
    // {
    //     let x = 5;
    //     r = &x; // エラー[E0597]: `x` does not live long enough
    // }
    // println!("{r}");
}
```

## 関数とクロージャ

### 関数の定義

関数は `fn` キーワードで定義し、引数と戻り値の型を `->` の後に書きます。関数本体の最後の式 (末尾にセミコロンが無いもの) がそのまま戻り値になります。途中で返す場合は `return` を使います。戻り値の型を省略するとユニット型 `()` を返す関数になります。

Rust には関数のオーバーロード、デフォルト引数、可変長引数がありません。代わりに次の方法を使います。

- 省略可能な引数 - `Option<T>` で受け取る。
- 複数の値を返す - タプルで返す。
- 可変長の引数 - スライス `&[T]` で受け取る。
- 型によって処理を変える - トレイトとジェネリクスを使う (後述)。

`!` (never 型) は決して戻らない関数の戻り値の型です。`panic!` するだけの関数や無限ループの関数が該当します。

```rust
// 最後の式（セミコロンなし）が戻り値になる
fn calculate_speed(distance: f64, time: f64) -> f64 {
    distance / time
}

// return で早期リターン
fn check_age(age: i32) -> &'static str {
    if age < 0 {
        return "invalid";
    }
    "valid"
}

// 戻り値がない関数は () を返す
fn feed(name: &str) {
    println!("Feeding {name}");
}

// 複数の値はタプルで返す
fn min_max(values: &[i32]) -> (i32, i32) {
    let min = *values.iter().min().unwrap();
    let max = *values.iter().max().unwrap();
    (min, max)
}

// デフォルト引数の代わりに Option を使う
fn describe_pet(name: &str, breed: Option<&str>) -> String {
    match breed {
        Some(b) => format!("{name} is a {b}"),
        None => format!("{name} is a mixed breed"),
    }
}

// ! (never 型): 決して戻らない関数
fn fail(message: &str) -> ! {
    panic!("{message}");
}

fn main() {
    println!("{}", calculate_speed(100.0, 10.0)); // 出力: 10
    println!("{}", check_age(-1));                // 出力: invalid
    feed("Buddy");                                // 出力: Feeding Buddy

    let (min, max) = min_max(&[3, 7, 1, 9]);
    println!("{min} {max}"); // 出力: 1 9

    println!("{}", describe_pet("Buddy", Some("Labrador"))); // 出力: Buddy is a Labrador
    println!("{}", describe_pet("Max", None));               // 出力: Max is a mixed breed

    let ready = true;
    if !ready {
        fail("not ready");
    }
}
```

### クロージャ

クロージャは `|引数| 式` の形式で書く無名関数です。引数と戻り値の型は推論されるため、多くの場合は省略できます。周囲のスコープの変数をキャプチャできる点が関数と異なります。

クロージャは変数のキャプチャ方法によって、自動的に次のトレイトのいずれかを実装します。クロージャを受け取る関数は、どのトレイトを要求するかで受け取れるクロージャの範囲を決めます。

- `Fn` - キャプチャした変数を不変借用します。何度でも呼べます。
- `FnMut` - キャプチャした変数を可変借用します。何度でも呼べますが、変数を `mut` にする必要があります。
- `FnOnce` - キャプチャした変数の所有権を奪います。1 回だけ呼べます。

`move` を付けると、キャプチャした変数の所有権をクロージャに移します。クロージャを関数から返す場合や、別スレッドに渡す場合に使います。

```rust
fn apply<F: Fn(i32) -> i32>(f: F, value: i32) -> i32 {
    f(value)
}

fn make_multiplier(factor: i32) -> impl Fn(i32) -> i32 {
    move |x| x * factor
}

fn main() {
    // 基本的なクロージャ
    let add_one = |x: i32| x + 1;
    let square = |x| x * x; // 型は推論される
    println!("{}", add_one(5)); // 出力: 6
    println!("{}", square(4));  // 出力: 16

    // 環境の変数を不変借用でキャプチャする（Fn）
    let bonus = 10;
    let add_bonus = |x| x + bonus;
    println!("{}", apply(add_bonus, 5)); // 出力: 15

    // 可変借用でキャプチャする（FnMut）
    let mut counter = 0;
    let mut increment = || counter += 1;
    increment();
    increment();
    println!("{counter}"); // 出力: 2

    // 所有権を奪うクロージャ（FnOnce）
    let name = String::from("Buddy");
    let consume = move || name;
    let taken = consume();
    // consume(); // エラー[E0382]: use of moved value: `consume`
    println!("{taken}"); // 出力: Buddy

    // クロージャを返す
    let triple = make_multiplier(3);
    println!("{}", triple(7)); // 出力: 21

    // 関数ポインタ（キャプチャしないクロージャは fn 型に変換できる）
    let op: fn(i32) -> i32 = |x| x - 1;
    println!("{}", apply(op, 10)); // 出力: 9
}
```

## メソッドとトレイト

Rust にはクラスと継承がありません。データは構造体や列挙型で定義し、振る舞いは `impl` ブロックのメソッドで、型同士に共通する振る舞いはトレイトで定義します。

### impl ブロック

`impl 型名 { ... }` の中に定義した関数がその型のメソッドになります。第 1 引数の形で、メソッドが値をどう受け取るかが決まります。

- `&self` - 不変借用で受け取ります。値を読むだけのメソッドです。
- `&mut self` - 可変借用で受け取ります。値を変更するメソッドです。
- `self` - 所有権を受け取ります。呼び出し後は元の値を使えなくなります。値を別の型に変換するメソッドなどに使います。

`self` を受け取らない関数は関連関数と呼ばれ、`型名::関数名()` で呼び出します。コンストラクタは `new` という名前の関連関数にする慣習があります。`Self` は `impl` 対象の型を指す別名です。

```rust
#[derive(Debug)]
struct Dog {
    name: String,
    age: u8,
}

impl Dog {
    // 関連定数
    const MAX_AGE: u8 = 30;

    // 関連関数（コンストラクタとして使うのが慣習）
    fn new(name: &str, age: u8) -> Self {
        Self { name: name.to_string(), age }
    }

    // &self: 不変借用で受け取るメソッド
    fn bark(&self) -> String {
        format!("{} says: Woof!", self.name)
    }

    // &mut self: 可変借用で受け取るメソッド
    fn birthday(&mut self) {
        self.age += 1;
    }

    // self: 所有権を受け取るメソッド
    fn into_name(self) -> String {
        self.name
    }
}

fn main() {
    let mut dog = Dog::new("Buddy", 3);
    println!("{}", dog.bark()); // 出力: Buddy says: Woof!

    dog.birthday();
    println!("{dog:?}"); // 出力: Dog { name: "Buddy", age: 4 }
    println!("{}", Dog::MAX_AGE); // 出力: 30

    let name = dog.into_name();
    // dog.bark(); // エラー[E0382]: borrow of moved value: `dog`
    println!("{name}"); // 出力: Buddy
}
```

公開範囲の制御 (TypeScript の `public` / `private` に相当するもの) はモジュール単位で行います。[モジュールと可視性](#モジュールと可視性)で説明します。

### トレイトの定義と実装

トレイト (trait) は型が持つべきメソッドを定義する機能で、TypeScript のインターフェースに相当します。`impl トレイト名 for 型名` で型にトレイトを実装します。TypeScript と違い、構造が一致するだけでは実装したことにならず、明示的な `impl` が必要です。

トレイトのメソッドにはデフォルト実装を書けます。実装側で上書きすることもできます。

自分で定義したトレイトは `i32` のような既存の型にも実装できます。ただし「トレイトか型のどちらかが自分のクレートで定義されていること」という制約 (孤児ルール) があります。

```rust
trait Animal {
    // 実装必須のメソッド
    fn name(&self) -> String;
    fn sound(&self) -> String;

    // デフォルト実装を持つメソッド
    fn speak(&self) -> String {
        format!("{} says {}", self.name(), self.sound())
    }
}

struct Dog {
    name: String,
}

struct Cat {
    name: String,
}

impl Animal for Dog {
    fn name(&self) -> String {
        self.name.clone()
    }
    fn sound(&self) -> String {
        String::from("Woof!")
    }
}

impl Animal for Cat {
    fn name(&self) -> String {
        self.name.clone()
    }
    fn sound(&self) -> String {
        String::from("Meow!")
    }
    // デフォルト実装を上書きする
    fn speak(&self) -> String {
        format!("{} ignores you", self.name)
    }
}

// 既存の型に自分のトレイトを実装する
trait Describe {
    fn describe(&self) -> String;
}

impl Describe for i32 {
    fn describe(&self) -> String {
        format!("number {self}")
    }
}

fn main() {
    let dog = Dog { name: String::from("Buddy") };
    let cat = Cat { name: String::from("Whiskers") };
    println!("{}", dog.speak()); // 出力: Buddy says Woof!
    println!("{}", cat.speak()); // 出力: Whiskers ignores you
    println!("{}", 42.describe()); // 出力: number 42
}
```

### スーパートレイトとトレイトオブジェクト

`trait Pet: Animal` のように書くと、`Pet` を実装する型には `Animal` の実装も要求されます。`Animal` を `Pet` のスーパートレイトと呼びます。インターフェースの継承に相当しますが、実装を引き継ぐわけではありません。

トレイトオブジェクト `dyn トレイト名` を使うと、同じトレイトを実装した異なる型を 1 つの型として扱えます。サイズが型ごとに異なるため `Box<dyn Trait>` や `&dyn Trait` のようにポインタ越しに使います。メソッドは実行時に vtable を通して呼ばれます (動的ディスパッチ)。

Rust 1.86 以降では、`&dyn Pet` を スーパートレイトの `&dyn Animal` に変換できます (トレイトアップキャスト)。

```rust
trait Animal {
    fn name(&self) -> String;
}

// Pet を実装するには Animal の実装も必要（スーパートレイト）
trait Pet: Animal {
    fn owner(&self) -> String;

    fn describe(&self) -> String {
        format!("{} belongs to {}", self.name(), self.owner())
    }
}

struct Dog;
struct Hamster;

impl Animal for Dog {
    fn name(&self) -> String {
        "Buddy".to_string()
    }
}

impl Pet for Dog {
    fn owner(&self) -> String {
        "Alice".to_string()
    }
}

impl Animal for Hamster {
    fn name(&self) -> String {
        "Nibbles".to_string()
    }
}

impl Pet for Hamster {
    fn owner(&self) -> String {
        "Bob".to_string()
    }
}

fn main() {
    // トレイトオブジェクト: 異なる型を同じトレイトとして扱う
    let pets: Vec<Box<dyn Pet>> = vec![Box::new(Dog), Box::new(Hamster)];
    for pet in &pets {
        println!("{}", pet.describe());
    }
    // 出力: Buddy belongs to Alice
    // 出力: Nibbles belongs to Bob

    // トレイトアップキャスト（Rust 1.86 以降）
    let pet: &dyn Pet = &Dog;
    let animal: &dyn Animal = pet;
    println!("{}", animal.name()); // 出力: Buddy
}
```

### derive と標準トレイト

標準ライブラリには多くの型が実装する基本的なトレイトがあります。`#[derive(...)]` 属性を付けると、これらのトレイトの実装をコンパイラが自動生成します。

- `Debug` - `{:?}` で表示できるようにします。
- `Clone` - `clone()` で複製できるようにします。
- `Copy` - 代入時にムーブではなくコピーされるようにします。`Clone` も必要で、すべてのフィールドが `Copy` である必要があります。
- `PartialEq` / `Eq` - `==` で比較できるようにします。
- `PartialOrd` / `Ord` - `<` などで大小比較できるようにします。フィールドの定義順に比較されます。
- `Hash` - `HashMap` のキーにできるようにします。
- `Default` - `Default::default()` でデフォルト値を作れるようにします。

`{}` で表示する形式を決める `Display` は derive できないため、手で実装します。`From` を実装すると、対応する `Into` も自動的に使えるようになります。

```rust
use std::fmt;

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Default)]
struct Point {
    x: i32,
    y: i32,
}

#[derive(Debug, Clone, PartialEq, Default)]
struct Dog {
    name: String,
    age: u8,
}

// Display を実装すると {} で表示でき、to_string() も使える
impl fmt::Display for Dog {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        write!(f, "{} ({} years)", self.name, self.age)
    }
}

// From を実装すると Into も使える
impl From<&str> for Dog {
    fn from(name: &str) -> Self {
        Dog { name: name.to_string(), age: 0 }
    }
}

fn main() {
    let a = Point { x: 1, y: 2 };
    let b = a; // Copy なのでムーブされない
    println!("{:?} {}", a, a == b); // 出力: Point { x: 1, y: 2 } true
    println!("{}", a < Point { x: 1, y: 3 }); // 出力: true
    println!("{:?}", Point::default()); // 出力: Point { x: 0, y: 0 }

    let dog = Dog { name: String::from("Buddy"), age: 3 };
    let twin = dog.clone();
    println!("{dog}");       // 出力: Buddy (3 years)
    println!("{twin:?}");    // 出力: Dog { name: "Buddy", age: 3 }
    println!("{}", dog == twin); // 出力: true

    // Default と構造体更新記法の組み合わせ
    let luna = Dog { name: String::from("Luna"), ..Default::default() };
    println!("{luna}"); // 出力: Luna (0 years)

    let puppy: Dog = "Max".into();
    println!("{}", puppy.to_string()); // 出力: Max (0 years)
}
```

### 演算子オーバーロード

`+` や `*` などの演算子は、`std::ops` モジュールのトレイト (`Add` `Sub` `Mul` `Neg` `Index` など) を実装することで独自の型に使えるようになります。`type Output` で演算結果の型を指定します。

```rust
use std::ops::{Add, Mul};

#[derive(Debug, Clone, Copy, PartialEq)]
struct Vector {
    x: f64,
    y: f64,
}

impl Add for Vector {
    type Output = Vector;

    fn add(self, other: Vector) -> Vector {
        Vector { x: self.x + other.x, y: self.y + other.y }
    }
}

// 右辺の型を変えることもできる
impl Mul<f64> for Vector {
    type Output = Vector;

    fn mul(self, k: f64) -> Vector {
        Vector { x: self.x * k, y: self.y * k }
    }
}

fn main() {
    let a = Vector { x: 1.0, y: 2.0 };
    let b = Vector { x: 3.0, y: 4.0 };
    println!("{:?}", a + b);   // 出力: Vector { x: 4.0, y: 6.0 }
    println!("{:?}", a * 2.0); // 出力: Vector { x: 2.0, y: 4.0 }
}
```

## ジェネリクス

ジェネリクスは型をパラメータとして扱う機能です。

### ジェネリクスの基本

ジェネリクスは `<T>` のような型パラメータを使用して定義します。関数、構造体、列挙型、`impl` ブロックで使えます。標準ライブラリの `Option<T>` `Result<T, E>` `Vec<T>` もジェネリクスで定義されています。

Rust のジェネリクスはコンパイル時に使われた具体的な型ごとにコードが生成される (単相化) ため、実行時のコストはかかりません。

`impl Cage<String>` のように具体的な型を指定した `impl` ブロックを書くと、その型のときだけ使えるメソッドを定義できます。

```rust
// ジェネリック関数
fn identity<T>(value: T) -> T {
    value
}

// ジェネリック構造体
struct Cage<T> {
    content: T,
}

impl<T> Cage<T> {
    fn new(content: T) -> Self {
        Self { content }
    }

    fn get(&self) -> &T {
        &self.content
    }

    fn set(&mut self, content: T) {
        self.content = content;
    }
}

// 特定の型のときだけ使えるメソッド
impl Cage<String> {
    fn shout(&self) -> String {
        self.content.to_uppercase()
    }
}

// ジェネリック列挙型（標準ライブラリの Option と同じ形）
enum Maybe<T> {
    Just(T),
    Nothing,
}

fn main() {
    let name = identity::<&str>("Buddy");
    let age = identity(3); // 型は推論される
    println!("{name} {age}"); // 出力: Buddy 3

    let mut cage = Cage::new(String::from("Dog"));
    println!("{}", cage.get()); // 出力: Dog
    cage.set(String::from("Cat"));
    println!("{}", cage.shout()); // 出力: CAT
    // cage.set(123); // エラー[E0308]: mismatched types

    let number_cage = Cage::new(42);
    println!("{}", number_cage.get()); // 出力: 42
    // number_cage.shout(); // エラー[E0599]: no method named `shout` found for struct `Cage<{integer}>` in the current scope

    for value in [Maybe::Just(1), Maybe::Nothing] {
        match value {
            Maybe::Just(x) => println!("Just {x}"),
            Maybe::Nothing => println!("Nothing"),
        }
    }
    // 出力: Just 1
    // 出力: Nothing
}
```

### トレイト境界

型パラメータには、どのトレイトを実装している必要があるかという条件 (トレイト境界) を付けられます。境界が無い型パラメータに対しては、どの型でもできる操作しか行えません。

- `<T: Trait>` - 型パラメータの宣言と一緒に書きます。`+` で複数のトレイトを要求できます。
- `where` 句 - 境界が長くなる場合にシグネチャの後ろにまとめて書きます。
- 引数位置の `impl Trait` - `<T: Trait>` の省略記法です。
- 戻り値位置の `impl Trait` - 具体的な型を隠して「このトレイトを実装した何か」を返します。クロージャやイテレータを返すときに使います。
- `&dyn Trait` - トレイトオブジェクトで受け取ります。ジェネリクス (静的ディスパッチ) と違い、呼び出しは実行時に解決されます。

`impl<T: Display> Shout for T` のように書くと、境界を満たすすべての型にトレイトを実装できます (ブランケット実装)。

```rust
use std::fmt::Display;

trait Animal {
    fn name(&self) -> String;
}

struct Dog;
struct Cat;

impl Animal for Dog {
    fn name(&self) -> String {
        "Dog".to_string()
    }
}

impl Animal for Cat {
    fn name(&self) -> String {
        "Cat".to_string()
    }
}

// トレイト境界
fn largest<T: PartialOrd + Copy>(items: &[T]) -> T {
    let mut max = items[0];
    for &item in items {
        if item > max {
            max = item;
        }
    }
    max
}

// where 句
fn pair<T, U>(a: T, b: U) -> String
where
    T: Display,
    U: Display + Clone,
{
    format!("{a} & {b}")
}

// 引数位置の impl Trait（静的ディスパッチ）
fn greet(animal: &impl Animal) -> String {
    format!("Hello, {}!", animal.name())
}

// 戻り値位置の impl Trait
fn adopt() -> impl Animal {
    Cat
}

// トレイトオブジェクト（動的ディスパッチ）
fn greet_dyn(animal: &dyn Animal) -> String {
    format!("Hi, {}!", animal.name())
}

// ブランケット実装
trait Shout {
    fn shout(&self) -> String;
}

impl<T: Display> Shout for T {
    fn shout(&self) -> String {
        self.to_string().to_uppercase()
    }
}

fn main() {
    println!("{}", largest(&[3, 7, 2]));   // 出力: 7
    println!("{}", largest(&[1.5, 0.2]));  // 出力: 1.5
    println!("{}", pair("Buddy", 3));      // 出力: Buddy & 3
    println!("{}", greet(&Dog));           // 出力: Hello, Dog!
    println!("{}", adopt().name());        // 出力: Cat
    println!("{}", greet_dyn(&Dog));       // 出力: Hi, Dog!
    println!("{}", "woof".shout());        // 出力: WOOF
}
```

### 関連型と const ジェネリクス

関連型 (associated type) はトレイトの中で宣言し、実装側で具体的な型を決める型です。`type Item;` のように宣言します。型パラメータと違い、1 つの型に対してトレイトの実装は 1 つに決まります。標準ライブラリの `Iterator` トレイトの `type Item` が代表例です。

const ジェネリクスは型ではなく値 (整数・`bool`・`char`) をパラメータにする機能です。配列の長さのように、型の一部になる定数を扱うときに使います。

```rust
// 関連型: トレイトの実装側が型を決める
trait Container {
    type Item;
    fn first(&self) -> Option<&Self::Item>;
}

struct Kennel {
    dogs: Vec<String>,
}

impl Container for Kennel {
    type Item = String;

    fn first(&self) -> Option<&String> {
        self.dogs.first()
    }
}

// const ジェネリクス: 値をパラメータにする
struct Pack<const N: usize> {
    members: [&'static str; N],
}

impl<const N: usize> Pack<N> {
    fn size(&self) -> usize {
        N
    }
}

fn sum<const N: usize>(values: [i32; N]) -> i32 {
    values.iter().sum()
}

fn main() {
    let kennel = Kennel { dogs: vec![String::from("Buddy"), String::from("Max")] };
    println!("{:?}", kennel.first()); // 出力: Some("Buddy")

    let pack = Pack { members: ["Buddy", "Max", "Rex"] };
    println!("{}", pack.size());     // 出力: 3
    println!("{}", pack.members[2]); // 出力: Rex

    println!("{}", sum([1, 2, 3, 4])); // 出力: 10
}
```

## エラーハンドリング

Rust には例外 (try / catch) がありません。エラーは 2 種類に分けて扱います。

- 回復可能なエラー - ファイルが無い、入力が不正など。`Result<T, E>` で返し、呼び出し側が処理します。
- 回復不能なエラー - バグや、続行すると不整合が起きる状態。`panic!` でプログラム (のそのスレッド) を停止します。

### 独自のエラー型と ? 演算子

`?` 演算子は `Result` が `Err` ならその場で関数から `return` し、`Ok` なら中身を取り出します。`Option` に使うと `None` のときに `return` します。エラーの型が違う場合は、戻り値のエラー型に `From` が実装されていれば自動的に変換されます。

アプリケーション独自のエラー型は列挙型で定義し、`Display` と `std::error::Error` を実装するのが一般的です。エラーの種類をまとめて扱うだけでよい場合は `Box<dyn std::error::Error>` を戻り値にします。

実際の開発では、エラー型の定義を derive で生成する `thiserror` クレートや、アプリケーション側でエラーを手軽にまとめる `anyhow` クレートがよく使われます。

```rust
use std::fmt;
use std::num::ParseIntError;

#[derive(Debug)]
enum AdoptError {
    InvalidAge(ParseIntError),
    TooYoung(u8),
}

impl fmt::Display for AdoptError {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        match self {
            AdoptError::InvalidAge(e) => write!(f, "invalid age: {e}"),
            AdoptError::TooYoung(age) => write!(f, "too young: {age}"),
        }
    }
}

impl std::error::Error for AdoptError {}

// From を実装すると ? で ParseIntError から自動変換される
impl From<ParseIntError> for AdoptError {
    fn from(e: ParseIntError) -> Self {
        AdoptError::InvalidAge(e)
    }
}

fn check_age(input: &str) -> Result<u8, AdoptError> {
    let age: u8 = input.trim().parse()?; // Err なら AdoptError に変換して return
    if age < 1 {
        return Err(AdoptError::TooYoung(age));
    }
    Ok(age)
}

// Option にも ? を使える
fn first_initial(name: &str) -> Option<char> {
    let c = name.chars().next()?; // None なら return None
    Some(c.to_ascii_uppercase())
}

// Box<dyn Error> で異なる種類のエラーをまとめて返す
fn total_age(inputs: &[&str]) -> Result<u32, Box<dyn std::error::Error>> {
    let mut total = 0;
    for input in inputs {
        total += check_age(input)? as u32;
    }
    Ok(total)
}

fn main() {
    println!("{:?}", check_age("3")); // 出力: Ok(3)

    match check_age("abc") {
        Ok(age) => println!("{age}"),
        Err(e) => println!("{e}"), // 出力: invalid age: invalid digit found in string
    }

    if let Err(e) = check_age("0") {
        println!("{e}"); // 出力: too young: 0
    }

    println!("{:?}", first_initial("buddy")); // 出力: Some('B')
    println!("{:?}", first_initial(""));      // 出力: None

    println!("{:?}", total_age(&["3", "5"]).ok()); // 出力: Some(8)
    if let Err(e) = total_age(&["3", "x"]) {
        println!("{e}"); // 出力: invalid age: invalid digit found in string
    }

    // unwrap / expect: Err や None なら panic する
    let age = check_age("4").expect("age should be valid");
    println!("{age}"); // 出力: 4
    // check_age("x").unwrap(); // panic: called `Result::unwrap()` on an `Err` value: InvalidAge(...)
}
```

### main から Result を返す

`main` 関数も `Result` を返せます。`main` の中で `?` を使え、`Err` が返ると内容が表示されて終了コード 1 で終了します。

```rust
use std::error::Error;

fn main() -> Result<(), Box<dyn Error>> {
    let age: u8 = "5".parse()?;
    println!("{age}"); // 出力: 5

    let broken: Result<u8, _> = "x".parse::<u8>();
    println!("{}", broken.is_err()); // 出力: true
    Ok(())
}
```

## コレクションとイテレータ

標準ライブラリの `std::collections` には、よく使うデータ構造がそろっています。

- `Vec<T>` - 伸縮する配列です。最もよく使います。
- `HashMap<K, V>` / `BTreeMap<K, V>` - キーと値の組を持つマップです。`BTreeMap` はキーの順に並びます。
- `HashSet<T>` / `BTreeSet<T>` - 重複しない値の集合です。
- `VecDeque<T>` - 両端に対して効率よく追加・削除できるキューです。
- `BinaryHeap<T>` - 最大値を効率よく取り出せる優先度付きキューです。

### Vec

`Vec<T>` は要素数が変わる配列です。`Vec::new()` か `vec![]` マクロで作成します。

インデックスアクセス `v[i]` は範囲外で panic します。範囲外の可能性がある場合は `Option` を返す `get(i)` を使います。

```rust
fn main() {
    // 作成
    let mut dogs: Vec<String> = Vec::new();
    dogs.push(String::from("Buddy"));
    dogs.push(String::from("Max"));
    let mut ages = vec![3, 5, 2];

    println!("{}", dogs.len());      // 出力: 2
    println!("{}", dogs[0]);         // 出力: Buddy
    println!("{:?}", dogs.get(10));  // 出力: None

    // 変更
    ages.insert(0, 1);
    ages.sort();
    println!("{ages:?}"); // 出力: [1, 2, 3, 5]
    let last = ages.pop();
    println!("{last:?}"); // 出力: Some(5)
    ages.retain(|&a| a != 2);
    println!("{ages:?}"); // 出力: [1, 3]
    println!("{}", ages.contains(&3)); // 出力: true

    // 要素を書き換えながら反復する
    for age in ages.iter_mut() {
        *age *= 10;
    }
    println!("{ages:?}"); // 出力: [10, 30]

    // 連結と重複除去
    let mut all = [ages, vec![30, 40]].concat();
    all.dedup();
    println!("{all:?}"); // 出力: [10, 30, 40]
}
```

### HashMap と HashSet

`HashMap<K, V>` はキーから値を引くマップです。`get` は `Option<&V>` を返します。`entry` API を使うと「キーが無ければ挿入し、あれば更新する」を 1 回の検索で書けます。`HashMap` の反復順は実行ごとに変わるため、順序が必要なら `BTreeMap` を使います。

`HashSet<T>` は重複しない値の集合です。`intersection` (積集合) `union` (和集合) `difference` (差集合) などの集合演算ができます。

```rust
use std::collections::{BTreeMap, HashMap, HashSet};

fn main() {
    let mut counts: HashMap<&str, u32> = HashMap::new();
    counts.insert("dog", 5);
    counts.insert("cat", 8);
    println!("{:?}", counts.get("dog"));  // 出力: Some(5)
    println!("{:?}", counts.get("fish")); // 出力: None

    // entry API: キーが無ければ挿入し、あれば更新する
    for animal in ["dog", "bird", "dog"] {
        *counts.entry(animal).or_insert(0) += 1;
    }
    println!("{}", counts["dog"]);  // 出力: 7
    println!("{}", counts["bird"]); // 出力: 1

    // 配列から作る
    let legs = HashMap::from([("dog", 4), ("bird", 2)]);
    println!("{}", legs["bird"]); // 出力: 2

    // 順序が必要なら BTreeMap を使う
    let sorted: BTreeMap<_, _> = counts.iter().collect();
    println!("{sorted:?}"); // 出力: {"bird": 1, "cat": 8, "dog": 7}

    // HashSet: 重複しない値の集合
    let a: HashSet<&str> = ["dog", "cat", "bird", "dog"].into_iter().collect();
    let b: HashSet<&str> = ["cat", "fish"].into_iter().collect();
    println!("{}", a.len());           // 出力: 3
    println!("{}", a.contains("dog")); // 出力: true
    let common: Vec<_> = a.intersection(&b).collect();
    println!("{common:?}"); // 出力: ["cat"]
}
```

### イテレータ

イテレータは値を 1 つずつ取り出す仕組みで、`Iterator` トレイトとして定義されています。`map` や `filter` などのアダプタは新しいイテレータを返すだけで、`collect` `sum` `for` などで消費されるまで処理は実行されません (遅延評価)。

コレクションからイテレータを作るメソッドは 3 種類あります。

- `iter()` - 要素の不変参照 `&T` を返します。
- `iter_mut()` - 要素の可変参照 `&mut T` を返します。
- `into_iter()` - 要素そのもの `T` を返し、コレクションを消費します。`for x in v` はこれを使います。

`collect` は戻り値の型に応じて `Vec` や `HashMap`、`String` などを作ります。そのため型注釈かターボフィッシュで型を指定します。

```rust
fn main() {
    let ages = vec![3, 8, 1, 12, 5];

    // map / filter / collect
    let doubled: Vec<i32> = ages.iter().map(|a| a * 2).collect();
    println!("{doubled:?}"); // 出力: [6, 16, 2, 24, 10]
    let adults: Vec<&i32> = ages.iter().filter(|&&a| a >= 3).collect();
    println!("{adults:?}"); // 出力: [3, 8, 12, 5]

    // 集計
    let total: i32 = ages.iter().sum();
    println!("{total}"); // 出力: 29
    println!("{:?}", ages.iter().max());                   // 出力: Some(12)
    println!("{}", ages.iter().any(|&a| a > 10));          // 出力: true
    println!("{}", ages.iter().all(|&a| a > 0));           // 出力: true
    println!("{:?}", ages.iter().position(|&a| a == 12));  // 出力: Some(3)
    println!("{:?}", ages.iter().find(|&&a| a > 5));       // 出力: Some(8)
    println!("{}", ages.iter().fold(1, |acc, a| acc * a)); // 出力: 1440

    // 組み合わせと加工
    let names = ["Buddy", "Max", "Luna"];
    let pairs: Vec<(&str, i32)> = names.iter().copied().zip(ages.iter().copied()).collect();
    println!("{pairs:?}"); // 出力: [("Buddy", 3), ("Max", 8), ("Luna", 1)]

    let upper = names.iter().map(|n| n.to_uppercase()).collect::<Vec<_>>().join(", ");
    println!("{upper}"); // 出力: BUDDY, MAX, LUNA

    let middle: Vec<i32> = ages.iter().skip(1).take(2).copied().collect();
    println!("{middle:?}"); // 出力: [8, 1]

    let initials: String = names.iter().flat_map(|n| n.chars().take(1)).collect();
    println!("{initials}"); // 出力: BML

    let chunks: Vec<Vec<i32>> = ages.chunks(2).map(|c| c.to_vec()).collect();
    println!("{chunks:?}"); // 出力: [[3, 8], [1, 12], [5]]

    let mut sorted = ages.clone();
    sorted.sort_by(|a, b| b.cmp(a)); // 降順
    println!("{sorted:?}"); // 出力: [12, 8, 5, 3, 1]

    // 遅延評価なので無限のイテレータも扱える
    let evens: Vec<u32> = (1..).filter(|n| n % 2 == 0).take(3).collect();
    println!("{evens:?}"); // 出力: [2, 4, 6]
}
```

### 独自のイテレータ

`Iterator` トレイトを実装すると、独自の型をイテレータにできます。実装が必要なのは関連型 `Item` と `next` メソッドだけで、`map` や `filter`、`sum` などの数十個のメソッドはすべてデフォルト実装として使えるようになります。

```rust
struct Countdown {
    n: u32,
}

impl Iterator for Countdown {
    type Item = u32;

    fn next(&mut self) -> Option<u32> {
        if self.n == 0 {
            return None;
        }
        self.n -= 1;
        Some(self.n + 1)
    }
}

fn main() {
    let values: Vec<u32> = Countdown { n: 3 }.collect();
    println!("{values:?}"); // 出力: [3, 2, 1]

    let even_sum: u32 = Countdown { n: 10 }.filter(|n| n % 2 == 0).sum();
    println!("{even_sum}"); // 出力: 30

    for n in (Countdown { n: 2 }) {
        println!("{n}");
    }
    // 出力: 2
    // 出力: 1

    // std::iter::from_fn: クロージャからイテレータを作る
    let mut count = 0;
    let counter = std::iter::from_fn(|| {
        count += 1;
        (count <= 3).then_some(count * 100)
    });
    println!("{:?}", counter.collect::<Vec<_>>()); // 出力: [100, 200, 300]
}
```

## スマートポインタ

スマートポインタは、参照のように振る舞いつつ追加の機能を持つ構造体です。所有権の基本ルール (所有者は 1 つ、借用は不変複数か可変 1 つ) では表現しにくい構造を扱うために使います。

### Box と Rc と RefCell

- `Box<T>` - 値をヒープに置きます。コンパイル時にサイズが決まらない再帰的な型 (連結リストや木) や、トレイトオブジェクト `Box<dyn Trait>` に使います。
- `Rc<T>` - 参照カウントで 1 つの値を複数の所有者で共有します。最後の所有者が破棄されたときに値も破棄されます。シングルスレッド専用で、スレッド間で共有する場合は `Arc<T>` を使います。
- `RefCell<T>` - 不変参照越しに中身を変更できるようにします (内部可変性)。借用ルールの検査が実行時に行われ、違反すると panic します。`Rc<RefCell<T>>` の組み合わせで「共有しつつ変更できる値」を表します。
- `Cell<T>` - `Copy` な値を差し替える形の内部可変性です。参照を返さないため実行時の借用検査がありません。
- `Weak<T>` - 参照カウントに数えられない `Rc` です。親子で互いを指す構造で、循環参照によるメモリリークを防ぐために使います。

```rust
use std::cell::{Cell, RefCell};
use std::rc::Rc;

// Box: 再帰的な型の定義に必要
#[derive(Debug)]
enum List {
    Cons(i32, Box<List>),
    Nil,
}

impl List {
    fn sum(&self) -> i32 {
        match self {
            List::Cons(value, rest) => value + rest.sum(),
            List::Nil => 0,
        }
    }
}

fn main() {
    let list = List::Cons(1, Box::new(List::Cons(2, Box::new(List::Nil))));
    println!("{list:?}"); // 出力: Cons(1, Cons(2, Nil))
    println!("{}", list.sum()); // 出力: 3

    // Rc: 1 つの値を複数の所有者で共有する
    let shelter = Rc::new(String::from("Happy Paws"));
    let a = Rc::clone(&shelter);
    let b = Rc::clone(&shelter);
    println!("{}", Rc::strong_count(&shelter)); // 出力: 3
    println!("{a} / {b}"); // 出力: Happy Paws / Happy Paws

    // Rc<RefCell<T>>: 共有しつつ変更する
    let dogs = Rc::new(RefCell::new(vec![String::from("Buddy")]));
    let dogs_clone = Rc::clone(&dogs);
    dogs_clone.borrow_mut().push(String::from("Max"));
    println!("{:?}", dogs.borrow()); // 出力: ["Buddy", "Max"]
    // borrow_mut() を同時に 2 回呼ぶと実行時に panic する

    // Cell: Copy な値を差し替える
    let visits = Cell::new(0);
    visits.set(visits.get() + 1);
    println!("{}", visits.get()); // 出力: 1
}
```

## 並行処理と非同期

所有権と型システムにより、Rust ではデータ競合がコンパイル時に防がれます。スレッド間で値を渡せる型は `Send` トレイトを、複数スレッドから参照を共有できる型は `Sync` トレイトを実装しています。どちらもコンパイラが自動的に判定するため、例えば `Send` でない `Rc` を別スレッドに渡そうとするとコンパイルエラーになります。

### スレッド

- `thread::spawn` - OS スレッドを生成します。戻り値の `JoinHandle` の `join()` で終了を待ち、クロージャの戻り値を受け取ります。クロージャは `'static` である必要があるため、使う値は `move` で渡します。
- `Arc<Mutex<T>>` - スレッド間で可変な値を共有します。`Arc` は `Rc` のスレッド安全版、`Mutex` は排他ロックです。`lock()` で得たガードがスコープを抜けると自動的にロックが解放されます。
- チャネル `mpsc::channel` - スレッド間でメッセージを送ります。送信側 (`Sender`) は複製でき、すべての送信側が破棄されると受信側のループが終わります。
- `thread::scope` - スコープ付きスレッドです。スコープを抜ける前にすべてのスレッドが終了することが保証されるため、ローカル変数を借用したまま渡せます。

```rust
use std::sync::{mpsc, Arc, Mutex};
use std::thread;

fn main() {
    // スレッドの生成と join
    let handle = thread::spawn(|| (1..=10).sum::<i32>());
    println!("{}", handle.join().unwrap()); // 出力: 55

    // move で所有権をスレッドに渡す
    let name = String::from("Buddy");
    let handle = thread::spawn(move || format!("{name} is running"));
    println!("{}", handle.join().unwrap()); // 出力: Buddy is running

    // Arc + Mutex: スレッド間で可変な値を共有する
    let counter = Arc::new(Mutex::new(0));
    let mut handles = vec![];
    for _ in 0..10 {
        let counter = Arc::clone(&counter);
        handles.push(thread::spawn(move || {
            *counter.lock().unwrap() += 1;
        }));
    }
    for handle in handles {
        handle.join().unwrap();
    }
    println!("{}", *counter.lock().unwrap()); // 出力: 10

    // チャネル: スレッド間でメッセージを送る
    let (tx, rx) = mpsc::channel();
    for id in 0..3 {
        let tx = tx.clone();
        thread::spawn(move || tx.send(id * 10).unwrap());
    }
    drop(tx); // 送信側をすべて閉じると受信側のループが終わる
    let mut received: Vec<i32> = rx.iter().collect();
    received.sort();
    println!("{received:?}"); // 出力: [0, 10, 20]

    // スコープ付きスレッド: ローカル変数を借用したまま渡せる
    let mut animals = vec!["Dog", "Cat"];
    thread::scope(|s| {
        s.spawn(|| println!("{}", animals.len())); // 出力: 2
    });
    animals.push("Bird");
    println!("{animals:?}"); // 出力: ["Dog", "Cat", "Bird"]
}
```

### async と await

`async fn` は呼び出すと `Future` を返す関数です。`Future` は `.await` されるまで実行されません。標準ライブラリには `Future` を実行するランタイムが含まれていないため、実際には tokio などのランタイムクレートを使います。

- `async fn` / `async { }` ブロック - `Future` を作ります。
- `.await` - `Future` の完了を待ちます。待っている間はスレッドを他のタスクに譲ります。
- トレイトの `async fn` - Rust 1.75 以降、トレイトのメソッドを `async fn` にできます。
- async クロージャ - Rust 1.85 以降、`async |x| ...` の形で書けます。

次のコードは `Cargo.toml` の `[dependencies]` に `tokio = { version = "1", features = ["full"] }` を追加して実行します。

```rust
use std::time::Duration;

async fn fetch_dog(id: u32) -> String {
    tokio::time::sleep(Duration::from_millis(100)).await;
    format!("Dog #{id}")
}

// トレイトの async fn（Rust 1.75 以降）
trait Shelter {
    async fn adopt(&self) -> String;
}

struct HappyPaws;

impl Shelter for HappyPaws {
    async fn adopt(&self) -> String {
        fetch_dog(99).await
    }
}

#[tokio::main]
async fn main() {
    // .await で完了を待つ
    let dog = fetch_dog(1).await;
    println!("{dog}"); // 出力: Dog #1

    // 複数の Future を並行に待つ（合計で約 100ms）
    let (a, b) = tokio::join!(fetch_dog(2), fetch_dog(3));
    println!("{a} {b}"); // 出力: Dog #2 Dog #3

    // タスクを生成してバックグラウンドで実行する
    let handle = tokio::spawn(fetch_dog(4));
    println!("{}", handle.await.unwrap()); // 出力: Dog #4

    // async クロージャ（Rust 1.85 以降）
    let greet = async |name: &str| format!("Hello, {name}!");
    println!("{}", greet("Buddy").await); // 出力: Hello, Buddy!

    println!("{}", HappyPaws.adopt().await); // 出力: Dog #99
}
```

## モジュール

### モジュールと可視性

モジュールはコードを名前空間で区切る仕組みで、`mod` キーワードで定義します。モジュールの中の要素はデフォルトで非公開で、`pub` を付けたものだけが外から使えます。構造体はフィールドごとに公開範囲を指定します。

- `pub` - どこからでも使えます。
- `pub(crate)` - 同じクレートの中からだけ使えます。
- `pub(super)` - 親モジュールからだけ使えます。
- 指定なし - 同じモジュールとその子モジュールからだけ使えます。

パスは `crate::` (クレートのルートから)、`super::` (親モジュールから)、`self::` (現在のモジュールから) で書きます。`use` でパスを短くでき、`as` で別名を付けられます。`pub use` で再公開すると、内部のモジュール構成を隠して利用者向けのパスを整えられます。

```rust
mod shelter {
    pub struct Dog {
        pub name: String, // 公開フィールド
        age: u8,          // 非公開フィールド
    }

    impl Dog {
        pub fn new(name: &str) -> Self {
            Self { name: name.to_string(), age: 0 }
        }

        pub fn age(&self) -> u8 {
            self.age
        }
    }

    pub mod staff {
        pub fn greet() -> String {
            // super: 親モジュール
            format!("Welcome! We have room for {} dogs", super::capacity())
        }
    }

    // pub(crate): クレート内にだけ公開
    pub(crate) fn capacity() -> u32 {
        20
    }
}

// use でパスを短くする
use shelter::Dog;
use shelter::staff::greet as welcome;

fn main() {
    let dog = Dog::new("Buddy");
    println!("{} {}", dog.name, dog.age()); // 出力: Buddy 0
    // println!("{}", dog.age); // エラー[E0616]: field `age` of struct `Dog` is private

    println!("{}", welcome()); // 出力: Welcome! We have room for 20 dogs
    println!("{}", crate::shelter::capacity()); // 出力: 20
}
```

実際のプロジェクトでは、モジュールをファイルに分けます。`mod shelter;` と書くと `shelter.rs` (または `shelter/mod.rs`) がモジュールの中身として読み込まれます。

```text
my_app/
├── Cargo.toml
└── src/
    ├── main.rs        // mod shelter; で shelter モジュールを読み込む
    ├── shelter.rs     // shelter モジュール。pub mod staff; で子モジュールを読み込む
    └── shelter/
        └── staff.rs   // shelter::staff モジュール
```

### クレートと Cargo

クレート (crate) はコンパイルの単位で、実行ファイルを作るバイナリクレート (`src/main.rs`) とライブラリクレート (`src/lib.rs`) があります。Cargo は Rust のビルドツール兼パッケージマネージャです。

- `cargo new my_app` - プロジェクトを作成します。
- `cargo build` / `cargo run` - ビルド / ビルドして実行します。`--release` で最適化ビルドになります。
- `cargo test` - テストを実行します。
- `cargo add serde --features derive` - 依存クレートを追加します。
- `cargo fmt` / `cargo clippy` - コードを整形 / lint します。

依存クレートは [crates.io](https://crates.io/) から取得され、`Cargo.toml` に記述します。

```toml
[package]
name = "my_app"
version = "0.1.0"
edition = "2024"

[dependencies]
serde = { version = "1", features = ["derive"] }
tokio = { version = "1", features = ["full"] }
```

`edition` は言語仕様の版で、2015・2018・2021・2024 があります。版によってキーワードや一部の構文が異なりますが、異なる版のクレート同士を組み合わせて使えます。

## 高度な機能

### マクロ

マクロはコードを生成するコードで、名前の後ろに `!` を付けて呼び出します。関数と違い、可変個の引数を受け取れ、構文の形でパターンマッチできます。

`macro_rules!` で定義する宣言的マクロは、`$x:expr` のようなパターンで引数を受け取ります。`expr` (式) のほか、`ident` (識別子) `ty` (型) `tt` (トークン木) などを指定できます。`$(...),*` で繰り返しを表します。

よく使う標準マクロには `println!` `format!` `vec!` `assert!` `assert_eq!` `panic!` `todo!` `dbg!` `matches!` `write!` があります。

`#[derive(...)]` や `#[tokio::main]` は手続き的マクロ (procedural macro) で、Rust のコードで構文木を変換します。専用のクレートとして定義します。

```rust
// 宣言的マクロ
macro_rules! square {
    ($x:expr) => {
        $x * $x
    };
}

// 可変個の引数を受け取るマクロ
macro_rules! zoo {
    ($($animal:expr),* $(,)?) => {{
        let mut v = Vec::new();
        $(v.push($animal);)*
        v
    }};
}

// 複数のパターンを持つマクロ
macro_rules! greet {
    () => {
        String::from("Hello!")
    };
    ($name:expr) => {
        format!("Hello, {}!", $name)
    };
}

fn main() {
    println!("{}", square!(7)); // 出力: 49
    println!("{:?}", zoo!["Dog", "Cat", "Bird"]); // 出力: ["Dog", "Cat", "Bird"]
    println!("{}", greet!());        // 出力: Hello!
    println!("{}", greet!("Buddy")); // 出力: Hello, Buddy!

    // dbg!: 式と値を標準エラー出力に表示して、値をそのまま返す
    let age = dbg!(3 * 2); // 標準エラー出力: [src/main.rs:34:15] 3 * 2 = 6
    println!("{age}"); // 出力: 6
}
```

### 属性

属性 (attribute) は `#[...]` の形式で要素にメタデータを付ける機能です。`#![...]` と書くと、それを含むモジュールやクレート全体に適用されます。

- `#[derive(...)]` - トレイトの実装を自動生成します。
- `#[cfg(...)]` - 条件付きコンパイルです。OS やフィーチャーによってコードを含めるかを切り替えます。
- `#[allow(...)]` / `#[warn(...)]` / `#[deny(...)]` - lint のレベルを変えます。
- `#[expect(...)]` - lint の警告が出ることを期待します。警告が出なくなると逆に警告されるため、不要になった抑制を検出できます。Rust 1.81 以降で使えます。
- `#[must_use]` - 戻り値を使わないと警告します。
- `#[deprecated]` - 非推奨であることを示し、使うと警告します。
- `#[inline]` - インライン展開のヒントをコンパイラに与えます。

Rust 1.95 以降では、`cfg_select!` マクロで `cfg` の条件によって値やコードを切り替えられます。

```rust
#[must_use]
fn add(a: i32, b: i32) -> i32 {
    a + b
}

#[deprecated(note = "use add instead")]
fn old_add(a: i32, b: i32) -> i32 {
    a + b
}

#[expect(unused_variables)]
fn draft() {
    let unused = 1;
}

#[cfg(target_os = "linux")]
fn platform() -> &'static str {
    "linux"
}

#[cfg(not(target_os = "linux"))]
fn platform() -> &'static str {
    "not linux"
}

fn main() {
    println!("{}", add(1, 2)); // 出力: 3
    // add(1, 2); // 警告: unused return value of `add` that must be used

    #[allow(deprecated)]
    let sum = old_add(1, 2);
    println!("{sum}"); // 出力: 3

    draft();

    // 実行環境によって出力が変わる
    let os = platform();
    let family = cfg_select! {
        unix => "unix",
        windows => "windows",
        _ => "other",
    };
    println!("{os} / {family}"); // 出力 (macOS の場合): not linux / unix
}
```

### テスト

テストは `#[test]` 属性を付けた関数として書き、`cargo test` で実行します。単体テストは同じファイルの `#[cfg(test)]` を付けたモジュールに書く慣習があります。`#[cfg(test)]` によりテストのときだけコンパイルされます。`tests/` ディレクトリに置いたファイルは結合テストとして扱われます。

- `assert!(条件)` - 条件が `true` であることを確認します。
- `assert_eq!(左, 右)` / `assert_ne!(左, 右)` - 値が等しい / 等しくないことを確認します。失敗すると両方の値が表示されます。
- `#[should_panic]` - panic することを確認します。
- テスト関数は `Result<(), E>` を返すこともでき、その場合は中で `?` を使えます。

```rust
pub fn adopt_fee(age: u8) -> u32 {
    if age > 20 {
        panic!("invalid age");
    }
    if age < 2 { 300 } else { 100 }
}

fn main() {
    println!("{}", adopt_fee(1)); // 出力: 300
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn puppy_fee_is_higher() {
        assert_eq!(adopt_fee(1), 300);
        assert!(adopt_fee(1) > adopt_fee(5));
    }

    #[test]
    #[should_panic(expected = "invalid age")]
    fn rejects_invalid_age() {
        adopt_fee(30);
    }

    #[test]
    fn parses_age() -> Result<(), std::num::ParseIntError> {
        let age: u8 = "3".parse()?;
        assert_ne!(adopt_fee(age), 0);
        Ok(())
    }
}
```

```text
$ cargo test
running 3 tests
test tests::parses_age ... ok
test tests::puppy_fee_is_higher ... ok
test tests::rejects_invalid_age - should panic ... ok

test result: ok. 3 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.00s
```

### unsafe

`unsafe` ブロックの中では、コンパイラが安全性を検査できない操作が許されます。`unsafe` は借用チェックを無効にするものではなく、次の操作だけを追加で許可します。安全性を保証する責任はプログラマに移ります。

- 生ポインタ (`*const T` / `*mut T`) の参照外し
- `unsafe fn` の呼び出し (C の関数を含む)
- 可変な `static` 変数へのアクセス
- `unsafe trait` の実装
- `union` のフィールドへのアクセス

生ポインタの作成自体は安全なコードでもでき、`&raw const` / `&raw mut` で作ります。Edition 2024 では、C の関数を宣言する `extern` ブロックに `unsafe` を付ける必要があります。

通常は `unsafe` を直接書かず、`unsafe` を内部に閉じ込めた安全な API (標準ライブラリなど) を使います。

```rust
// Edition 2024 では extern ブロックに unsafe が必要
unsafe extern "C" {
    fn abs(x: i32) -> i32;
}

fn main() {
    let mut value = 10;

    // 生ポインタの作成は安全なコードでできる
    let p = &raw mut value;

    // 参照外しは unsafe ブロックの中でだけできる
    unsafe {
        *p += 1;
    }
    println!("{value}"); // 出力: 11

    // unsafe fn の呼び出し（境界チェックを省略する）
    let v = vec![1, 2, 3];
    let x = unsafe { *v.get_unchecked(1) };
    println!("{x}"); // 出力: 2

    // C の関数の呼び出し
    let n = unsafe { abs(-5) };
    println!("{n}"); // 出力: 5
}
```

## もっと詳しい情報

- [The Rust Programming Language (The Book)](https://doc.rust-lang.org/book/)
- [Rust by Example](https://doc.rust-lang.org/rust-by-example/)
- [The Rust Reference](https://doc.rust-lang.org/reference/)
- [標準ライブラリのドキュメント](https://doc.rust-lang.org/std/)
- [Rust Edition Guide](https://doc.rust-lang.org/edition-guide/)
- [Rust のリリースノート](https://doc.rust-lang.org/stable/releases.html)
