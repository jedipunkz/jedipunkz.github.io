---
title: "Zig 入門: 構文集"
description: "Zig 言語の主要な構文を網羅的にまとめた入門記事。基本構文、制御構文、エラーハンドリング、メモリアロケータなど、サンプルコードとともに解説"
date: 2025-10-24T21:29:24+09:00
Categories: ["infrastructure"]
draft: false
---
こんにちは [@jedipunkz](https://x.com/jedipunkz) です。

コーディングを学習する機会を増やしている最中なのですが、自分は底レイヤが好きなのを思い出し、またたまに Mitchell Hashimoto 氏が Zig のことを呟いてるのを覚えていたので、突然 Zig に入門したくなりました。

ということで後に自分でも読み返せる形にしようと思い Zig の構文集を記します。

# NOTICE

※  現時点で Stable な 0.15.1 を前提に記します。
※  気が向いたときに言語仕様の変化に対応して修正していこうと思います。

# はじめに

このドキュメントは、Zig 言語の主要な構文を網羅的にまとめたチュートリアルです。すべてのサンプルコードは記事の修正時点で Stable なリリースバージョンの Zig で動作確認しています。

## 目次

1. [基本構文](#1-基本構文)
2. [演算子](#2-演算子)
3. [制御構文](#3-制御構文)
4. [関数](#4-関数)
5. [配列とスライス](#5-配列とスライス)
6. [構造体](#6-構造体)
7. [列挙型とユニオン](#7-列挙型とユニオン)
8. [ポインタ](#8-ポインタ)
9. [エラーハンドリング](#9-エラーハンドリング)
10. [オプショナル型](#10-オプショナル型)
11. [コンパイル時計算](#11-コンパイル時計算)
12. [メモリアロケータ](#12-メモリアロケータ)
13. [テスト](#13-テスト)
14. [モジュール](#14-モジュール)

---

## 1. 基本構文

### 変数宣言

Zig には 2 種類の変数宣言があります。`const` は不変変数（再代入不可）、`var` は可変変数（再代入可能）を表します。

```zig
const cat: i32 = 5;  // const: 不変変数（再代入不可）
var dog: i32 = 10;   // var: 可変変数（再代入可能）

dog = 15;  // OK
// cat = 10;  // エラー: const は変更不可
```

### 型推論

型を明示的に指定しなくても、コンパイラが自動的に型を推論してくれます。

```zig
const rabbit = 20;    // i32 と推論される
const fox = 3.14;     // f64 と推論される
```

整数リテラルはデフォルトで `i32` 型、浮動小数点リテラルは `f64` 型として推論されます。

### 基本的なデータ型

Zig にはさまざまな基本的なデータ型があります。

```zig
const bear: u8 = 255;        // 符号なし 8bit 整数 (0〜255)
const wolf: i64 = -1000;     // 符号付き 64bit 整数
const eagle: f32 = 2.718;    // 32bit 浮動小数点数
const shark: bool = true;    // 真偽値
const tiger: u8 = 'A';       // 文字（u8 として扱われる）
```

整数型:
- 符号付き: `i8`, `i16`, `i32`, `i64`, `i128`, `isize`
- 符号なし: `u8`, `u16`, `u32`, `u64`, `u128`, `usize`

浮動小数点型:
- `f16`, `f32`, `f64`, `f128`

整数型の数字はビット幅を表します。例えば `i32` は 32 ビットの符号付き整数です。`isize` と `usize` はポインタのサイズと同じで、プラットフォームによって変わります。

### undefined（未初期化値）

`undefined` は変数が未初期化であることを明示的に示します。値は不定なので、使用前に必ず初期化する必要があります。

```zig
var snake: i32 = undefined;  // 未初期化（値は不定）
snake = 99;  // 使用前に必ず初期化

// 配列の undefined
var array: [5]i32 = undefined;
for (&array, 0..) |*item, i| {
    item.* = @intCast(i);
}
```

デバッグモードでは、Zig は `undefined` の領域を `0xaa` バイトで埋めます。これはバグの早期発見に役立ちます。`undefined` を使うことで、初期化が不要な場合にパフォーマンスを向上できます。

### 型変換

Zig では明示的な型変換が必要です。様々なビルトイン関数が用意されています。

```zig
// @as: コンパイル時型変換
const num_u8 = @as(u8, 50);

// @intCast: 整数型間の変換
const large_num: i64 = 42;
const small_num: i32 = @intCast(large_num);

// @floatCast: 浮動小数点型間の変換
const double: f64 = 3.14159265;
const single: f32 = @floatCast(double);

// @floatFromInt: 整数から浮動小数点
const int_val: i32 = 42;
const float_val: f32 = @floatFromInt(int_val);

// @intFromFloat: 浮動小数点から整数（切り捨て）
const pi: f32 = 3.14;
const pi_int: i32 = @intFromFloat(pi);  // 3
```

型変換は明示的に行う必要があります。これにより、意図しない型変換によるバグを防げます。`@as` はコンパイル時に型を指定し、他の関数は実行時の型変換を行います。

---

## 2. 演算子

### 算術演算子

数値の計算を行う演算子です。加算、減算、乗算は一般的ですが、除算と剰余は Zig のビルトイン関数を使います。

```zig
const lion: i32 = 10;
const leopard: i32 = 3;

lion + leopard     // 13  加算
lion - leopard     // 7   減算
lion * leopard     // 30  乗算
@divTrunc(lion, leopard)  // 3   整数除算（切り捨て）
@rem(lion, leopard)       // 1   剰余
```

注意: Zig では整数の除算や剰余にビルトイン関数を使用します。これはオーバーフローや未定義動作を防ぐためです。`@divTrunc` は切り捨て除算、`@rem` は剰余を計算します。

### 比較演算子

2 つの値を比較する演算子です。結果は `bool` 型（真または偽）になります。

```zig
panda == koala    // 等しい
panda != lion     // 等しくない
panda < lion      // より小さい
panda > leopard   // より大きい
panda <= koala    // 以下
panda >= leopard  // 以上
```

これらの演算子は条件分岐（`if` 文など）でよく使われます。

### 論理演算子

真偽値（`bool` 型）を操作する演算子です。

```zig
const monkey: bool = true;
const gorilla: bool = false;

monkey and gorilla    // false (論理積)
monkey or gorilla     // true  (論理和)
!monkey              // false (否定)
```

`and` は両方が真のときだけ真、`or` はどちらかが真なら真、`!` は真偽を反転させます。

### ビット演算子

整数のビット単位で操作を行う演算子です。2 進数で考えるとわかりやすいです。

```zig
const zebra: u8 = 0b1010;    // 10 (2進数)
const giraffe: u8 = 0b1100;  // 12 (2進数)

zebra & giraffe     // 0b1000  (AND)
zebra | giraffe     // 0b1110  (OR)
zebra ^ giraffe     // 0b0110  (XOR)
~zebra             // 0b11110101 (NOT)
zebra << 1         // 0b00010100 (左シフト)
zebra >> 1         // 0b0101     (右シフト)
```

`&` はビット AND、`|` はビット OR、`^` はビット XOR、`~` はビット NOT、`<<` は左シフト、`>>` は右シフトを行います。

---

## 3. 制御構文

### if 文

条件によって処理を分岐させる構文です。条件は `()` で囲み、実行するコードは `{}` で囲みます。

```zig
const elephant: i32 = 15;

if (elephant > 10) {
    std.debug.print("elephant is large\n", .{});
} else if (elephant > 5) {
    std.debug.print("elephant is medium\n", .{});
} else {
    std.debug.print("elephant is small\n", .{});
}
```

`else if` で複数の条件を書けます。上から順に評価されて、最初に真になった条件のブロックが実行されます。

### if 式（値を返す）

Zig の `if` は式として値を返すことができます。

```zig
const rhino: i32 = 8;
const hippo = if (rhino > 10) "large" else "small";
```

条件によって異なる値を変数に代入したいときに、コードが簡潔に書けます。

### while 文

条件が真の間、繰り返し処理を実行します。

```zig
var mouse: i32 = 0;
while (mouse < 5) {
    std.debug.print("{} ", .{mouse});
    mouse += 1;
}
// 出力: 0 1 2 3 4
```

ループの中で変数を変更して、最終的に条件が偽になるようにします。無限ループに注意しましょう。

### while 文（continue 式付き）

ループの最後に毎回実行される式を指定できます。`: ()` の部分に書きます。

```zig
var hamster: i32 = 0;
while (hamster < 5) : (hamster += 1) {
    std.debug.print("{} ", .{hamster});
}
// 出力: 0 1 2 3 4
```


### for 文（配列のイテレーション）

配列やスライスの要素を順番に処理します。

```zig
const animals = [_][]const u8{ "snake", "lizard", "turtle" };

// 要素のみ
for (animals) |animal| {
    std.debug.print("{s} ", .{animal});
}

// インデックス付き
for (animals, 0..) |animal, i| {
    std.debug.print("[{}]{s} ", .{i, animal});
}
```

`|animal|` で各要素を取り出します。インデックスも必要なら、`0..` と組み合わせて `|animal, i|` のように書けます。

### switch 文

値に応じて処理を分岐させます。Zig の `switch` は式として値を返すことができます。すべてのケースを網羅する必要があります。

```zig
const penguin: i32 = 2;
const result = switch (penguin) {
    1 => "one",
    2 => "two",
    3 => "three",
    else => "many",
};
```

`=>` の左側が条件、右側が対応する値や処理です。`else` ですべてのケースを網羅できます。

### break と continue

ループの流れを制御する構文です。

```zig
// break: ループを抜ける
var crow: i32 = 0;
while (true) {
    if (crow >= 3) break;
    std.debug.print("{} ", .{crow});
    crow += 1;
}

// continue: 次のイテレーションへ
var sparrow: i32 = 0;
while (sparrow < 5) : (sparrow += 1) {
    if (sparrow == 2) continue;  // 2 をスキップ
    std.debug.print("{} ", .{sparrow});
}
// 出力: 0 1 3 4
```

`break` でループを抜け出し、`continue` で次のループに進みます。特定の条件でループを制御したいときに使います。

### ラベル付きブロック

ブロックにラベルを付けて、`break` で値を返すことができます。

```zig
const swan = blk: {
    const x = 10;
    const y = 20;
    break :blk x + y;  // ブロックから値を返す
};
// swan は 30
```

ブロックを式として使い、計算結果を返せます。複雑な初期化処理を書くときに便利です。

### ラベル付きループ

ネストされたループで外側のループを制御できます。

```zig
var peacock: i32 = 0;
outer: while (peacock < 3) : (peacock += 1) {
    var inner: i32 = 0;
    while (inner < 3) : (inner += 1) {
        if (peacock == 1 and inner == 1) {
            break :outer;  // 外側のループを抜ける
        }
    }
}
```

`break :outer` で外側のループを抜けることができます。ラベルを使うことで、どのループを制御するかを明確に指定できます。

### unreachable

到達不可能なコードパスを明示的に示します。

```zig
const owl: i32 = 5;
const owl_status = if (owl > 0) "positive"
                   else if (owl < 0) "negative"
                   else unreachable;  // owl は 5 なので到達しない

// switch での使用
const falcon: u8 = 2;
const falcon_name = switch (falcon) {
    1 => "peregrine",
    2 => "gyrfalcon",
    3 => "merlin",
    else => unreachable,  // 1-3 以外は来ないと仮定
};
```

デバッグモードでは `unreachable` に到達すると panic を発生させます。ReleaseFast モードでは、コンパイラがこのコードパスに到達しないと仮定して最適化を行います。論理的に到達不可能な箇所を明示することで、バグを早期発見できます。

---

## 4. 関数

### 基本的な関数

`fn` キーワードで関数を定義します。引数と戻り値の型を明示的に指定します。

```zig
fn addDolphins(dolphin1: i32, dolphin2: i32) i32 {
    return dolphin1 + dolphin2;
}

const result = addDolphins(5, 3);  // 8
```

関数名の後の `()` に引数、その後に戻り値の型を書きます。`return` で値を返します。

### 複数の戻り値（構造体を使用）

複数の値を返したいときは、構造体を使います。

```zig
fn getWhaleInfo() struct { age: i32, weight: f32 } {
    return .{ .age = 50, .weight = 30000.5 };
}

const whale_info = getWhaleInfo();
std.debug.print("age: {}, weight: {d:.1}\n", .{whale_info.age, whale_info.weight});
```

無名構造体を戻り値の型として使えます。`.{}` で構造体リテラルを作成して返します。

### void 関数

何も返さない関数は `void` 型を使います。

```zig
fn printSeal() void {
    std.debug.print("Seal!\n", .{});
}
```

`return` 文を書かなくても、関数の最後まで実行されたら自動的に戻ります。

### エラーを返す関数

`!` を使ってエラーを返す可能性があることを示します。

```zig
fn divideOtters(otter1: i32, otter2: i32) !i32 {
    if (otter2 == 0) {
        return error.DivisionByZero;
    }
    return @divTrunc(otter1, otter2);
}

// 使用例
const result = divideOtters(10, 2) catch |err| {
    std.debug.print("Error: {}\n", .{err});
    return;
};
```

`!i32` は「エラーまたは `i32` を返す」という意味です。エラーが発生する可能性がある処理に便利です。

### オプショナル型を返す関数

`?` を使って null を返す可能性があることを示します。

```zig
fn findBadger(badger_id: i32) ?i32 {
    if (badger_id < 0) {
        return null;
    }
    return badger_id * 2;
}

// 使用例
if (findBadger(5)) |badger| {
    std.debug.print("found: {}\n", .{badger});
} else {
    std.debug.print("not found\n", .{});
}
```

`?i32` は「null または `i32` を返す」という意味です。値が存在しないかもしれない状況で使います。

### スライスを使った関数

配列やスライスを引数として受け取る関数です。

```zig
fn sumRaccoons(raccoons: []const i32) i32 {
    var total: i32 = 0;
    for (raccoons) |raccoon| {
        total += raccoon;
    }
    return total;
}

const array = [_]i32{ 1, 2, 3, 4, 5 };
const sum = sumRaccoons(&array);  // 15
```

`[]const i32` は「`i32` の読み取り専用スライス」を表します。配列のポインタを渡すとスライスに変換されます。

### ジェネリック関数

`comptime` パラメータを使って型をパラメータ化できます。

```zig
fn maxMammal(comptime T: type, mammal1: T, mammal2: T) T {
    return if (mammal1 > mammal2) mammal1 else mammal2;
}

const max_int = maxMammal(i32, 10, 20);      // 20
const max_float = maxMammal(f32, 3.14, 2.71); // 3.14
```

`comptime` はコンパイル時に値が決定されることを意味します。型をパラメータとして受け取り、様々な型で動作する関数を作れます。

### inline 関数

`inline` キーワードで関数をインライン展開します。通常関数呼出しには「引数をスタックに積む」「関数にジャンプする」「戻る」というコストが掛かるそうですが、inline 関数を使うとコストがゼロになるそうです。

ただし呼び出し箇所が多い場合は同じコードが何度も展開されバイナリサイズが大きくなり、また大きな関数には向かないそうです。

```zig
inline fn squareChipmunk(chipmunk: i32) i32 {
    return chipmunk * chipmunk;
}
```

関数呼び出しのオーバーヘッドをなくし、呼び出し箇所に直接コードを埋め込みます。小さな関数のパフォーマンス向上に役立ちます。

---

## 5. 配列とスライス

### 配列の宣言

配列は固定長のデータ構造です。`[N]T` の形で型を表します（N は要素数、T は型）。

```zig
// 固定長配列
const parrots = [5]i32{ 1, 2, 3, 4, 5 };

// 長さを推論
const owls = [_]i32{ 10, 20, 30 };  // [3]i32

// 同じ値で初期化
const hawks = [_]i32{0} ** 4;  // [4]i32{ 0, 0, 0, 0 }
```

`[_]` を使うと、初期化子から要素数を自動的に推論してくれます。`**` 演算子で同じ値を繰り返せます。

### 配列の操作

配列の要素にアクセスしたり、長さを取得したりできます。

```zig
// 長さの取得
const length = owls.len;  // 3

// 要素へのアクセス
const first = parrots[0];  // 1

// ループ
for (parrots) |parrot| {
    std.debug.print("{} ", .{parrot});
}
```

`.len` で配列の長さが取得できます。インデックスは 0 から始まります。

### 多次元配列

配列の配列を作ることができます。

```zig
const falcons = [2][3]i32{
    [_]i32{ 1, 2, 3 },
    [_]i32{ 4, 5, 6 },
};

const element = falcons[0][1];  // 2
```

`[2][3]i32` は「3 要素の配列を 2 つ持つ配列」を表します。

### スライス

スライスは配列の一部を参照する動的なビューです。`[]T` の形で型を表します。

```zig
const doves = [_]i32{ 1, 2, 3, 4, 5 };
const dove_slice: []const i32 = doves[1..4];  // [2, 3, 4]

// スライスの長さ
const slice_len = dove_slice.len;  // 3
```

`[start..end]` で範囲を指定します（end は含まれません）。スライスは元の配列を参照するだけで、コピーは作りません。

### 可変配列

`var` で宣言した配列は要素を変更できます。

```zig
var pigeons = [_]i32{ 1, 2, 3, 4, 5 };
pigeons[2] = 30;  // 要素を変更
// pigeons は [1, 2, 30, 4, 5]
```

配列自体のサイズは固定ですが、個々の要素は書き換え可能です。

### 文字列（u8 の配列）

Zig では文字列は `u8` の配列またはスライスとして扱われます。

```zig
const canary: []const u8 = "Hello, Canary!";
const length = canary.len;  // 14

// センチネル終端文字列（null 終端）
const finch: [:0]const u8 = "Finch";
```

文字列リテラルは UTF-8 でエンコードされた `u8` のスライスです。`[:0]` は null 終端（C 言語スタイル）の文字列を表します。

---

## 6. 構造体

### 基本的な構造体

構造体は関連するデータをまとめるデータ構造です。`struct` キーワードで定義します。

```zig
const Cheetah = struct {
    speed: f32,
    age: i32,
    name: []const u8,

    // メソッド
    pub fn introduce(self: Cheetah) void {
        std.debug.print("I'm {s}, speed: {d:.1} km/h\n", .{self.name, self.speed});
    }

    // 初期化関数
    pub fn init(name: []const u8, speed: f32, age: i32) Cheetah {
        return Cheetah{
            .name = name,
            .speed = speed,
            .age = age,
        };
    }
};

// 使用例
const cheetah = Cheetah{
    .name = "Lightning",
    .speed = 120.0,
    .age = 3,
};
cheetah.introduce();

// init 関数を使用
const cheetah2 = Cheetah.init("Thunder", 115.0, 4);
```

フィールドとメソッドを持てます。メソッドの第一引数に `self` を書くことで、インスタンスのデータにアクセスできます。

### デフォルト値を持つ構造体

フィールドにデフォルト値を設定できます。

```zig
const Gazelle = struct {
    speed: f32 = 80.0,
    age: i32 = 5,
    is_wild: bool = true,
};

const gazelle = Gazelle{};  // すべてデフォルト値
const gazelle2 = Gazelle{ .speed = 90.0 };  // 一部を上書き
```

初期化時に値を省略すると、デフォルト値が使われます。一部だけ指定することもできます。

### ジェネリック構造体

型をパラメータとして受け取る構造体です。

```zig
fn Herd(comptime T: type) type {
    return struct {
        animals: []T,
        count: usize,

        pub fn init(animals: []T) @This() {
            return .{
                .animals = animals,
                .count = animals.len,
            };
        }
    };
}

// 使用例
const speeds = [_]f32{ 80.0, 85.0, 90.0 };
const herd = Herd(f32).init(@constCast(&speeds));
```

関数が型を返すことで、ジェネリックな構造体を作れます。`@This()` は現在の型を表します。

### ネストされた構造体

構造体の中に構造体を含めることができます。

```zig
const Enclosure = struct {
    capacity: i32,
    animal_count: i32,
};

const Zoo = struct {
    name: []const u8,
    enclosure: Enclosure,
};

const zoo = Zoo{
    .name = "Safari Zoo",
    .enclosure = Enclosure{
        .capacity = 50,
        .animal_count = 30,
    },
};
```

複雑なデータ構造を表現するときに便利です。

---

## 7. 列挙型とユニオン

### 列挙型（enum）

列挙型は名前付きの定数の集合を定義します。

```zig
const Habitat = enum {
    forest,
    ocean,
    desert,
    mountain,

    // メソッド
    pub fn describe(self: Habitat) []const u8 {
        return switch (self) {
            .forest => "trees and vegetation",
            .ocean => "salt water",
            .desert => "sand and heat",
            .mountain => "high altitude",
        };
    }
};

// 使用例
const habitat = Habitat.forest;
const name = @tagName(habitat);  // "forest"
const desc = habitat.describe();
```

列挙型もメソッドを持てます。`@tagName` で列挙値の名前を文字列として取得できます。

### 整数値を持つ列挙型

各列挙値に整数を割り当てることができます。

```zig
const DangerLevel = enum(u8) {
    safe = 0,
    caution = 1,
    danger = 2,
    extreme = 3,
};

const level = DangerLevel.danger;
const value = @intFromEnum(level);  // 2
```

`enum(u8)` で基底型を指定し、`@intFromEnum` で整数値を取得します。

### タグ付きユニオン

ユニオンは複数の型のうち 1 つを保持できるデータ構造です。

```zig
const Animal = union(enum) {
    leopard: struct { spots: i32 },
    jaguar: struct { territory: f32 },
    cougar: struct { age: i32 },

    pub fn print_info(self: Animal) void {
        switch (self) {
            .leopard => |l| std.debug.print("Leopard with {} spots\n", .{l.spots}),
            .jaguar => |j| std.debug.print("Jaguar with {d:.1} km² territory\n", .{j.territory}),
            .cougar => |c| std.debug.print("Cougar aged {} years\n", .{c.age}),
        }
    }
};

// 使用例
const animal1 = Animal{ .leopard = .{ .spots = 50 } };
const animal2 = Animal{ .jaguar = .{ .territory = 120.5 } };

animal1.print_info();  // 出力: Leopard with 50 spots
animal2.print_info();  // 出力: Jaguar with 120.5 km² territory

// タグのチェック
switch (animal1) {
    .leopard => std.debug.print("This is a leopard\n", .{}),  // 出力: This is a leopard
    .jaguar => std.debug.print("This is a jaguar\n", .{}),
    .cougar => std.debug.print("This is a cougar\n", .{}),
}
```

`union(enum)` でタグ付きユニオンを作ります。`switch` で現在のタグをチェックし、対応する値を取り出せます。

---

## 8. ポインタ

### 基本的なポインタ

ポインタはメモリ上のアドレスを保持します。`&` でアドレスを取得し、`.*` で値にアクセスします。

```zig
var deer: i32 = 10;
const deer_ptr: *i32 = &deer;  // ポインタを取得

// ポインタ経由で値を読む
const value = deer_ptr.*;  // 10

// ポインタ経由で値を変更
deer_ptr.* = 20;
// deer は 20 になる
```

`*i32` は「`i32` へのポインタ」を表します。ポインタを使うと、関数間でデータを共有したり変更したりできます。

### const ポインタ

読み取り専用のポインタです。

```zig
const moose: i32 = 100;
const moose_ptr: *const i32 = &moose;

// 読み取り専用
const value = moose_ptr.*;  // OK
// moose_ptr.* = 200;  // エラー: 変更不可
```

`*const i32` は「`i32` への読み取り専用ポインタ」を表します。

### 関数にポインタを渡す

関数の引数としてポインタを渡すと、呼び出し元の変数を変更できます。

```zig
fn incrementFox(fox: *i32) void {
    fox.* += 1;
}

var fox: i32 = 5;
incrementFox(&fox);
// fox は 6 になる
```

値渡しだとコピーが作られますが、ポインタ渡しだと元の変数を直接操作できます。

### 配列へのポインタ

配列全体へのポインタです。

```zig
const rabbits = [5]i32{ 1, 2, 3, 4, 5 };
const rabbits_ptr: *const [5]i32 = &rabbits;

// ポインタ経由で配列要素にアクセス
const element = rabbits_ptr[2];  // 3
```

配列のサイズもポインタの型の一部になります。

### スライスポインタ

配列のポインタはスライスに変換できます。

```zig
var squirrels = [_]i32{ 10, 20, 30, 40, 50 };
const squirrel_slice: []i32 = &squirrels;

// スライスの一部を取得
const sub_slice = squirrel_slice[1..3];  // [20, 30]
```

スライスはポインタと長さの情報を持つので、柔軟に配列を扱えます。

### マルチポインタ

複数の要素を指すポインタです。長さの情報は持ちません。

```zig
var beavers = [_]i32{ 1, 2, 3, 4, 5 };
const beaver_multi_ptr: [*]i32 = &beavers;

const first = beaver_multi_ptr[0];   // 1
const second = beaver_multi_ptr[1];  // 2
```

`[*]i32` は「複数の `i32` へのポインタ」を表します。C 言語との互換性のためによく使われます。

### nullable ポインタ

`?` を使って null になり得るポインタを表現します。

```zig
var raccoon: i32 = 42;
var raccoon_ptr: ?*i32 = &raccoon;

if (raccoon_ptr) |ptr| {
    std.debug.print("value: {}\n", .{ptr.*});
}

raccoon_ptr = null;  // null に設定
```

ポインタが有効かどうかわからない場合に使います。

---

## 9. エラーハンドリング

### defer

`defer` はスコープを抜けるときに式を実行します。リソースの解放などに便利です。

```zig
fn deferExample() void {
    std.debug.print("Start\n", .{});
    defer std.debug.print("End (deferred)\n", .{});
    std.debug.print("Middle\n", .{});
    // スコープを抜けるときに defer が実行される
    // 出力順: Start -> Middle -> End (deferred)
}
```

`defer` はスコープの終わりで必ず実行されます。関数から return しても、エラーが発生しても実行されます。

### 複数の defer

複数の `defer` は LIFO（後入れ先出し）の順で実行されます。

```zig
fn multipleDeferExample() void {
    defer std.debug.print("1st defer\n", .{});
    defer std.debug.print("2nd defer\n", .{});
    defer std.debug.print("3rd defer\n", .{});
    std.debug.print("Function body\n", .{});
    // 出力順: Function body -> 3rd -> 2nd -> 1st
}
```

後に書かれた `defer` が先に実行されます。これはリソースの確保と解放の順序を逆にするのに便利です。

### defer とエラーの組み合わせ

`defer` はエラーが発生しても必ず実行されます。

```zig
fn deferWithError(should_fail: bool) !void {
    defer std.debug.print("Cleanup always happens\n", .{});

    if (should_fail) {
        return error.Failed;
    }
    std.debug.print("Success\n", .{});
}
```

エラーの有無に関わらず、スコープを抜けるときに `defer` が実行されます。これにより、確実にリソースを解放できます。

### エラーセットの定義

Zig では、エラーをエラーセットとして明示的に定義します。

```zig
const AnimalError = error{
    TooYoung,
    TooOld,
    NotFound,
    InvalidSize,
};
```

エラーセットは、発生する可能性のあるエラーを列挙したものです。型安全なエラーハンドリングができます。

### エラーを返す関数

関数がエラーを返す可能性がある場合、`!` を使います。

```zig
fn checkHorseAge(age: i32) AnimalError!void {
    if (age < 0) {
        return error.TooYoung;
    }
    if (age > 30) {
        return error.TooOld;
    }
    // 正常終了
}
```

`AnimalError!void` は「AnimalError のエラーまたは void を返す」という意味です。

### エラーハンドリング: catch

`catch` でエラーを捕捉して処理します。

```zig
checkHorseAge(35) catch |err| {
    std.debug.print("Error: {}\n", .{err});
};
```

エラーが発生したら `catch` のブロックが実行されます。`|err|` でエラーの値を取得できます。

### エラーハンドリング: デフォルト値

エラー時にデフォルト値を返すこともできます。

```zig
const camel = findCamelById(-1) catch 0;  // エラー時は 0
```

シンプルにエラーを処理したいときに便利です。

### エラーハンドリング: if

`if` でエラーか正常値かを判定できます。

```zig
if (findCamelById(5)) |camel_id| {
    std.debug.print("found: {}\n", .{camel_id});
} else |err| {
    std.debug.print("error: {}\n", .{err});
}
```

正常値は `|camel_id|`、エラーは `else |err|` で取得します。

### エラーハンドリング: try

`try` はエラーを呼び出し元に伝播させます。

```zig
fn processGoat(age: i32) !void {
    try checkHorseAge(age);  // エラーがあれば即座に return
    std.debug.print("Age is valid\n", .{age});
}
```

`try` は以下のように展開されます：

```zig
// try checkHorseAge(age); は以下と同じ意味
checkHorseAge(age) catch |err| return err;
```

つまり、`try` はエラーが発生したら自動的に `return` します。エラーハンドリングを簡潔に書けます。

```zig
// 使用例
processGoat(10);   // 成功: "Age is valid" と出力
processGoat(35);   // error.TooOld を返す（呼び出し元にエラーが伝播）
```

`catch` でエラーを処理する場合との違い：
- `try`: エラーを上に投げる（伝播）
- `catch`: エラーをその場で処理する

### エラーハンドリング: errdefer

エラー時のクリーンアップに使用します。

```zig
var yak: i32 = 0;
blk: {
    errdefer yak = -1;  // エラー発生時に実行
    const value = findCamelById(-1) catch break :blk;
    yak = value;
}
```

`errdefer` はブロックがエラーで終了するときだけ実行されます。リソースの解放などに便利です。

### 複数のエラーセット

`||` で複数のエラーセットを結合できます。

```zig
const FileError = error{
    FileNotFound,
    PermissionDenied,
};

fn loadData(filename: []const u8) (AnimalError || FileError)![]const u8 {
    if (filename.len == 0) {
        return error.NotFound;  // AnimalError のエラー
    }
    if (filename[0] == '/') {
        return error.PermissionDenied;  // FileError のエラー
    }
    return "data";
}

// 使用例
const data1 = loadData("") catch |err| {
    // err は AnimalError.NotFound
    std.debug.print("Error: {}\n", .{err});  // 出力: Error: error.NotFound
};

const data2 = loadData("/secret") catch |err| {
    // err は FileError.PermissionDenied
    std.debug.print("Error: {}\n", .{err});  // 出力: Error: error.PermissionDenied
};

const data3 = loadData("file.txt") catch "default";
// 成功: data3 = "data"
```

複数の種類のエラーを返す可能性がある関数で使います。`(AnimalError || FileError)` は両方のエラーセットのエラーを返せることを意味します。

### エラーの切り替え

`switch` でエラーの種類ごとに処理を分けられます。

```zig
checkHorseAge(35) catch |err| switch (err) {
    error.TooYoung => std.debug.print("Too young\n", .{}),
    error.TooOld => std.debug.print("Too old\n", .{}),
    error.NotFound => std.debug.print("Not found\n", .{}),
    error.InvalidSize => std.debug.print("Invalid size\n", .{}),
};
```

エラーの種類に応じて異なる処理をしたいときに便利です。

---

## 10. オプショナル型

### オプショナル型の宣言

`?` を使って null になり得る値を表現します。

```zig
const seal: ?i32 = 42;
const empty_seal: ?i32 = null;
```

`?i32` は「null または `i32`」を表します。値が存在しないかもしれない状況を型で表現できます。

### オプショナル型のアンラップ: if

`if` で null かどうかをチェックして、値を取り出せます。

```zig
if (seal) |value| {
    std.debug.print("has value: {}\n", .{value});
} else {
    std.debug.print("is null\n", .{});
}
```

値が存在すれば `|value|` で取り出し、null なら `else` ブロックが実行されます。

### オプショナル型のアンラップ: orelse

null のときにデフォルト値を使えます。

```zig
const whale = empty_seal orelse 999;  // null なら 999
```


### オプショナル型を返す関数

値が見つからない可能性がある関数でよく使われます。

```zig
fn findPenguinById(id: i32) ?i32 {
    if (id < 0 or id > 100) {
        return null;
    }
    return id * 2;
}

// 使用例
const penguin1 = findPenguinById(10);   // ?i32 = 20
const penguin2 = findPenguinById(-5);   // ?i32 = null
```

エラーではないけど値がない状況を表すのに適しています。

### オプショナル型のポインタ

ポインタも null になり得ます。

```zig
var otter: i32 = 100;
var otter_ptr: ?*i32 = &otter;

if (otter_ptr) |ptr| {
    ptr.* = 200;  // 値を変更
}

otter_ptr = null;  // null に設定
```

ポインタが有効かどうかをチェックできます。

### オプショナルと while ループ

null になるまでループを続けることができます。

```zig
var narwhal: ?i32 = 5;
while (narwhal) |value| {
    std.debug.print("{}\n", .{value});
    if (value <= 1) {
        narwhal = null;
    } else {
        narwhal = value - 1;
    }
}
// 出力: 5 4 3 2 1
```

条件を柔軟に書けて便利です。

### .? operator（強制アンラップ）

null でないことが確実な場合に使用します。

```zig
const certain_seal: ?i32 = 777;
const unwrapped = certain_seal.?;  // 777
// null の場合はパニックになる
```

`.?` で強制的に値を取り出します。null だったらプログラムが停止するので、確実に値があるときだけ使いましょう。

---

## 11. コンパイル時計算

Zig の強力な機能の 1 つは、コンパイル時に計算を実行できることです。実行時のコストをゼロにできます。

### コンパイル時定数

コンパイル時に値が確定する定数です。

```zig
const lynx = 42;  // コンパイル時に値が決定
const bobcat = comptime 10;  // 明示的にコンパイル時定数
```

`const` で宣言した値は基本的にコンパイル時定数ですが、`comptime` で明示的に指定することもできます。

### コンパイル時関数

関数をコンパイル時に実行できます。

```zig
fn factorialTiger(comptime n: i32) i32 {
    if (n <= 1) return 1;
    return n * factorialTiger(n - 1);
}

const tiger_fact = comptime factorialTiger(5);  // 120（コンパイル時に計算）
```

`comptime` 引数を受け取る関数は、コンパイル時に評価されます。実行時のオーバーヘッドがありません。

### ジェネリック関数

型をパラメータとして受け取る関数です。

```zig
fn maxLion(comptime T: type, a: T, b: T) T {
    return if (a > b) a else b;
}

const max_int = maxLion(i32, 10, 20);
const max_float = maxLion(f32, 3.14, 2.71);
```

`comptime T: type` で型をパラメータとして受け取ります。様々な型で動作する汎用的な関数を書けます。

### コンパイル時に配列を生成

配列をコンパイル時に生成できます。

```zig
fn createPandasArray(comptime size: usize) [size]i32 {
    var pandas: [size]i32 = undefined;
    for (&pandas, 0..) |*panda, i| {
        panda.* = @intCast(i * 10);
    }
    return pandas;
}

const pandas = createPandasArray(5);  // [0, 10, 20, 30, 40]
```

配列のサイズもコンパイル時に決定されます。

### コンパイル時条件分岐

条件によって異なるコードを生成できます。

```zig
fn processJaguar(comptime is_large: bool, value: i32) i32 {
    if (is_large) {
        return value * 2;
    } else {
        return value + 10;
    }
}

const jaguar1 = processJaguar(true, 5);   // 10
const jaguar2 = processJaguar(false, 5);  // 15
```

`comptime` の条件分岐は、コンパイル時に評価されて不要なコードは削除されます。

### 型を返す関数

関数が型を返すことができます。これでジェネリックな構造体を作れます。

```zig
fn PairOfAnimals(comptime T: type) type {
    return struct {
        first: T,
        second: T,

        pub fn swap(self: *@This()) void {
            const temp = self.first;
            self.first = self.second;
            self.second = temp;
        }
    };
}

// 使用例
var bear_pair = PairOfAnimals(i32){
    .first = 10,
    .second = 20,
};
bear_pair.swap();  // first=20, second=10
```

`@This()` は現在の型を返します。型を動的に生成できるのが Zig の特徴です。

### ビルトイン型情報

型に関する情報をコンパイル時に取得できます。

```zig
// 型のサイズ
const size_i32 = @sizeOf(i32);  // 4

// 型の名前
const name = @typeName(i32);  // "i32"

// 型情報
const info = @typeInfo(i32);
switch (info) {
    .int => |int_info| {
        // int_info.signedness, int_info.bits
    },
    else => {},
}
```

リフレクションのような機能をコンパイル時に使えます。

### inline for

コンパイル時にループを展開します。

```zig
const numbers = [_]i32{ 1, 2, 3, 4, 5 };
var sum: i32 = 0;
inline for (numbers) |num| {
    sum += num;
}
```

ループが展開されて、実行時にはループのオーバーヘッドがなくなります。

---

## 12. メモリアロケータ

Zig では明示的にメモリアロケータを管理します。メモリの確保と解放を意識的に行います。

### GeneralPurposeAllocator

推奨される汎用アロケータです。

```zig
var gpa = std.heap.GeneralPurposeAllocator(.{}){};
defer _ = gpa.deinit();
const allocator = gpa.allocator();
```

`defer` でスコープを抜けるときに自動的にメモリを解放します。メモリリークを防げます。

### 単一の値をアロケート

単一の値をヒープに確保します。

```zig
const elephant = try allocator.create(i32);
defer allocator.destroy(elephant);
elephant.* = 42;
```

`create` で確保、`destroy` で解放します。

### 配列をアロケート

動的サイズの配列を確保します。

```zig
const tigers = try allocator.alloc(i32, 5);
defer allocator.free(tigers);

for (tigers, 0..) |*tiger, i| {
    tiger.* = @intCast(i * 10);
}
```

`alloc` で配列を確保、`free` で解放します。実行時にサイズが決まる配列に便利です。

### ArrayList

動的配列を使用します。要素数が増えたり減ったりする配列です。

```zig
var leopards = try std.ArrayList(i32).initCapacity(allocator, 0);
defer leopards.deinit(allocator);

try leopards.append(allocator, 10);
try leopards.append(allocator, 20);
try leopards.append(allocator, 30);

// アクセス
for (leopards.items) |leopard| {
    std.debug.print("{} ", .{leopard});
}
```

`append` で要素を追加できます。自動的にサイズが拡張されます。

### ArenaAllocator

まとめて解放するアロケータです。

```zig
var arena = std.heap.ArenaAllocator.init(allocator);
defer arena.deinit();  // すべてのメモリを一度に解放
const arena_allocator = arena.allocator();

const bears = try arena_allocator.alloc(i32, 10);
const wolves = try arena_allocator.alloc(i32, 20);
// 個別の free は不要
```

`arena.deinit()` で一括解放できます。個別に `free` しなくていいので楽ちんです。

### FixedBufferAllocator

固定サイズバッファを使用するアロケータです。

```zig
var buffer: [1024]u8 = undefined;
var fba = std.heap.FixedBufferAllocator.init(&buffer);
const fba_allocator = fba.allocator();

const rabbits = try fba_allocator.alloc(i32, 5);
```

スタックに確保したバッファを使います。ヒープ確保が不要な場合に便利です。

### HashMap

ハッシュマップの使用例です。

```zig
var deer_map = std.StringHashMap(i32).init(allocator);
defer deer_map.deinit();

try deer_map.put("red_deer", 150);
try deer_map.put("roe_deer", 50);

// 値の取得
if (deer_map.get("red_deer")) |weight| {
    std.debug.print("weight: {}\n", .{weight});
}

// イテレーション
var iterator = deer_map.iterator();
while (iterator.next()) |entry| {
    std.debug.print("{s}={}\n", .{entry.key_ptr.*, entry.value_ptr.*});
}
```

キーと値のペアを管理します。`put` で追加、`get` で取得、`iterator` で全要素を走査できます。

### 文字列の複製

文字列をコピーします。

```zig
const original_seal = "Seal";
const copied_seal = try allocator.dupe(u8, original_seal);
defer allocator.free(copied_seal);
```

`dupe` で複製を作ります。元の文字列とは別のメモリ領域に確保されます。

---

## 13. テスト

Zig には組み込みのテストフレームワークがあります。`test` キーワードでテストを書けます。

### 基本的なテスト

`test` ブロックでテストを定義します。

```zig
const std = @import("std");

pub fn add(a: i32, b: i32) i32 {
    return a + b;
}

test "basic addition" {
    const result = add(2, 3);
    try std.testing.expectEqual(5, result);
}
```

`zig test filename.zig` でテストを実行できます。`std.testing.expectEqual` で値が等しいかをチェックします。

### テストアサーション

様々なアサーション関数が用意されています。

```zig
test "various assertions" {
    // 等価性チェック
    try std.testing.expectEqual(42, 42);

    // 真偽値チェック
    try std.testing.expect(true);
    try std.testing.expect(!false);

    // 文字列の等価性
    try std.testing.expectEqualStrings("hello", "hello");
}
```

`expect` は真偽値を、`expectEqual` は値の等価性を、`expectEqualStrings` は文字列の等価性をチェックします。

### エラーのテスト

エラーが正しく返されるかをテストできます。

```zig
pub fn divide(a: i32, b: i32) !i32 {
    if (b == 0) {
        return error.DivisionByZero;
    }
    return @divTrunc(a, b);
}

test "divide success" {
    const result = try divide(10, 2);
    try std.testing.expectEqual(5, result);
}

test "divide by zero error" {
    const result = divide(10, 0);
    try std.testing.expectError(error.DivisionByZero, result);
}
```

`expectError` で特定のエラーが返されることを確認できます。

### 構造体のテスト

構造体のメソッドもテストできます。

```zig
pub const Animal = struct {
    name: []const u8,
    age: i32,

    pub fn isAdult(self: Animal) bool {
        return self.age >= 18;
    }
};

test "Animal struct" {
    const cat = Animal{
        .name = "Whiskers",
        .age = 3,
    };

    try std.testing.expectEqualStrings("Whiskers", cat.name);
    try std.testing.expectEqual(3, cat.age);
    try std.testing.expect(!cat.isAdult());
}
```

構造体のフィールドやメソッドを個別にテストできます。

### メモリアロケーションのテスト

`std.testing.allocator` を使ってメモリアロケーションをテストできます。

```zig
test "allocator test" {
    const allocator = std.testing.allocator;

    const numbers = try allocator.alloc(i32, 5);
    defer allocator.free(numbers);

    for (numbers, 0..) |*num, i| {
        num.* = @intCast(i * 10);
    }

    try std.testing.expectEqual(0, numbers[0]);
    try std.testing.expectEqual(10, numbers[1]);
}
```

`std.testing.allocator` はメモリリークを検出してくれます。`defer` で確実に解放することが重要です。


## 14. モジュール

モジュールを呼び出すコードです。

```zig
// lib.zig
pub fn greet() void {
    stg.debug.print("Hello\n", .{});
}
```

```zig
// main.zig
const lib = @import("lib.zig");
lib.greet();
```

## 備考

zig にはその他 C 言語連携、アセンブリ埋め込み、非同期処理、クロスコンパイル等の機能を持っているそうです。

## さらに学ぶために

- [Zig 言語リファレンス](https://ziglang.org/documentation/master/#Zig-Language-Reference)
- [Zig 標準ライブラリ](https://ziglang.org/documentation/master/std/)

公式ドキュメントには詳しい情報が載っています。標準ライブラリのドキュメントも充実しているので、ぜひチェックしてみてください。

