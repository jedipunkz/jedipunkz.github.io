---
title: "TypeScript 入門: 構文集"
date: 2025-10-19T12:00:00+09:00
Categories: ["tools"]
draft: false
---
こんにちは [@jedipunkz](https://x.com/jedipunkz) です。

TypeScript を学習するためのサンプルコード集を作成しました。実行可能なコードとして整理しています。本記事では TypeScript の主要な構文を網羅的に紹介していきます。

※  継続的にメンテする記事にしようと思います。新しい構文等出てきたら追記していきます。


## 基本的な型システム

TypeScript の型システムは JavaScript に静的型付けを追加し、コンパイル時に型エラーを検出できます。これにより実行前にバグを発見でき、開発効率と品質が向上します。

### プリミティブ型

プリミティブ型は JavaScript の基本的なデータ型です。TypeScript ではこれらに型注釈を付けることで型安全性を確保できます。

boolean 型 - 真偽値を表します。`true` または `false` のいずれかの値を持ちます。

number 型 - 数値を表します。整数・小数・16 進数・2 進数・8 進数すべてこの型で扱います。JavaScript と同様に内部的にはすべて浮動小数点数として扱われます。

string 型 - 文字列を表します。ダブルクォート、シングルクォート、バッククォート（テンプレートリテラル）で記述できます。

null 型と undefined 型 - 値が存在しないことを表します。`null` は明示的に値がないことを示し、`undefined` は値が未定義であることを示します。

bigint 型 - `Number.MAX_SAFE_INTEGER` を超える大きな整数を扱えます。末尾に `n` を付けて記述します。

symbol 型 - 一意で不変の値を作成します。オブジェクトのプロパティキーとして使用されることが多いです。

```typescript
// 基本的な型
const dogName: string = "Buddy";
const dogAge: number = 3;
const isDogHungry: boolean = true;

// null と undefined
const location: null = null;
let age: undefined = undefined;

// bigint と symbol
const weight: bigint = 9007199254740991n;
const id: symbol = Symbol("unique");
```

### 型注釈と型推論

型注釈 (Type Annotation) は変数や関数に明示的に型を指定する機能です。`: 型名` の形式で記述します。型注釈により、その変数や関数が扱える値の種類を明確にできます。

型推論 (Type Inference) は TypeScript が自動的に型を判断する機能です。初期値から型を推測するため、多くの場合は型注釈を省略できます。ただし、関数のパラメータは型推論されないため型注釈が必要です。

型注釈と型推論を適切に使い分けることで、冗長さを避けつつ型安全性を保てます。

```typescript
// 型注釈
let catName: string = "Whiskers";

// 型推論（TypeScriptが自動的に型を推論）
let lionName = "Simba"; // string型と推論される

// 関数の型注釈
function greetDog(name: string): string {
  return `Hello, ${name}!`;
}
```

### TypeScript 拡張型

TypeScript は JavaScript にはない独自の型を提供しています。これらは型システムをより強力にし、さまざまな状況に対応できるようにします。

any 型 - すべての型を受け入れます。型チェックを無効化するため、既存の JavaScript コードを移行する際などに使用しますが、型安全性が失われるため多用は避けるべきです。

unknown 型 - any と同様にすべての型を受け入れますが、使用前に型チェックが必要です。型安全な any として推奨されます。

void 型 - 関数が値を返さないことを示します。副作用のみを行う関数で使用します。

never 型 - 決して値を返さない関数に使用します。例外を投げる関数や無限ループの関数などが該当します。また、起こりえないケースを表現する際にも使用されます。

```typescript
// any型 - すべての型を許容（型チェック無効）
let mystery: any = "Dragon";
mystery = 42; // OK

// unknown型 - 型安全なany
let creature: unknown = "Phoenix";
if (typeof creature === "string") {
  console.log(creature.length); // 型チェック後のみ使用可能
}

// void型 - 値を返さない関数
function feedCat(name: string): void {
  console.log(`Feeding ${name}`);
}

// never型 - 決して値を返さない
function throwError(): never {
  throw new Error("Error occurred");
}
```

## 複合型

複合型は複数の値や型を組み合わせて使用する型です。実際のアプリケーション開発では複合型を多用します。

### 配列とタプル

配列型は同じ型の要素を複数持つデータ構造です。`型名[]` または `Array<型名>` の 2 つの記法があります。配列の要素にアクセスする際、TypeScript は自動的に要素の型を推論します。

タプル型は固定長で各要素の型が決まっている配列です。配列と異なり、各位置の要素の型が固定されます。関数から複数の値を返す際などに便利です。

読み取り専用配列は `readonly` キーワードを使用することで、配列の変更を防ぎます。不変性を保証したい場合に使用します。

```typescript
// 配列
const animals: string[] = ["Dog", "Cat", "Bird"];
const ages: Array<number> = [3, 5, 2];

// タプル（固定長で各要素の型が決まっている配列）
const pet: [string, number, boolean] = ["Buddy", 3, true];

// 読み取り専用配列
const endangered: readonly string[] = ["Panda", "Tiger"];
```

### オブジェクト型

オブジェクト型はプロパティ名と型のペアを持つ構造です。JavaScript のオブジェクトに型情報を付加できます。

オプショナルプロパティはプロパティ名の後ろに `?` を付けることで、そのプロパティが省略可能であることを示します。

読み取り専用プロパティは `readonly` キーワードを使用することで、一度設定した値の変更を防ぎます。

```typescript
// 基本的なオブジェクト型
const dog: { name: string; age: number; breed: string } = {
  name: "Max",
  age: 4,
  breed: "Golden Retriever",
};

// オプショナルプロパティ
const cat: { name: string; age: number; color?: string } = {
  name: "Luna",
  age: 2,
};

// 読み取り専用プロパティ
const lion: { readonly name: string; age: number } = {
  name: "Simba",
  age: 5,
};
```

### ユニオン型とインターセクション型

ユニオン型は `|` を使って複数の型のいずれかであることを表現します。例えば `string | number` は文字列または数値のどちらかを受け入れます。柔軟な型定義が可能になりますが、使用時には型を絞り込む必要があります。

インターセクション型は `&` を使って複数の型を結合します。すべての型のプロパティを持つ新しい型を作成できます。既存の型を組み合わせて新しい型を定義する際に便利です。

```typescript
// ユニオン型（複数の型のいずれか）
let petId: string | number;
petId = "DOG-001"; // OK
petId = 123; // OK

type AnimalType = "dog" | "cat" | "bird";

// インターセクション型（複数の型を結合）
type WildAnimal = { species: string; habitat: string };
type Dangerous = { dangerLevel: number };
type WildDangerous = WildAnimal & Dangerous;

const bear: WildDangerous = {
  species: "Grizzly",
  habitat: "Forest",
  dangerLevel: 9,
};
```

## 関数

TypeScript では関数のパラメータと戻り値に型を指定できます。これにより、関数の使い方を明確にし、誤った使用を防げます。

### 関数の型定義

関数の型定義では、パラメータの型と戻り値の型を指定します。戻り値の型は省略可能ですが、明示的に記述することでコードの可読性が向上します。

オプショナルパラメータは `?` を付けることで省略可能なパラメータを定義できます。オプショナルパラメータは必須パラメータの後に配置する必要があります。

デフォルトパラメータは値が渡されなかった場合に使用されるデフォルト値を設定できます。

レストパラメータは `...` を使用して可変長の引数を受け取れます。配列として扱われます。

```typescript
// 基本的な関数
function calculateSpeed(distance: number, time: number): number {
  return distance / time;
}

// オプショナルパラメータ
function describePet(name: string, age: number, breed?: string): string {
  return breed ? `${name} is ${age} years old ${breed}` : `${name} is ${age} years old`;
}

// デフォルトパラメータ
function createProfile(name: string, species: string = "Unknown"): string {
  return `Name: ${name}, Species: ${species}`;
}

// レストパラメータ
function listAnimals(zoo: string, ...animals: string[]): void {
  console.log(`Animals in ${zoo}:`, animals);
}
```

### 関数のオーバーロード

関数のオーバーロードは、同じ関数名で異なる型のパラメータを受け取れるようにする機能です。引数の型や数によって異なる戻り値の型を定義できます。オーバーロードシグネチャを複数定義し、その後に実装を記述します。

```typescript
// オーバーロードシグネチャ
function identifyAnimal(id: number): string;
function identifyAnimal(name: string): string;
function identifyAnimal(id: number, species: string): string;

// 実装
function identifyAnimal(idOrName: number | string, species?: string): string {
  if (typeof idOrName === "number" && species) {
    return `ID: ${idOrName}, Species: ${species}`;
  } else if (typeof idOrName === "number") {
    return `ID: ${idOrName}`;
  } else {
    return `Name: ${idOrName}`;
  }
}
```

## インターフェース

インターフェースはオブジェクトの形状（構造）を定義する TypeScript の機能です。再利用可能な型定義として、コードの可読性と保守性を向上させます。

### 基本的なインターフェース

インターフェースは `interface` キーワードを使用して定義します。オブジェクトが持つべきプロパティとメソッドを記述できます。インターフェースを実装したオブジェクトは、定義されたすべてのプロパティとメソッドを持つ必要があります。

オプショナルプロパティや読み取り専用プロパティも定義できます。

```typescript
interface Dog {
  name: string;
  breed: string;
  age: number;
}

const myDog: Dog = {
  name: "Buddy",
  breed: "Labrador",
  age: 3,
};

// オプショナルプロパティ
interface Cat {
  name: string;
  age: number;
  color?: string; // オプショナル
}

// メソッドを持つインターフェース
interface Animal {
  name: string;
  makeSound(): string;
}
```

### インターフェースの継承

インターフェースは `extends` キーワードを使用して他のインターフェースを継承できます。継承により、既存のインターフェースを拡張して新しいインターフェースを作成できます。

複数のインターフェースを同時に継承することも可能です。これにより、複数の特性を組み合わせた型を簡潔に定義できます。

```typescript
interface Animal {
  name: string;
  age: number;
}

// 単一の継承
interface Dog extends Animal {
  breed: string;
  bark(): string;
}

// 複数の継承
interface Swimmer {
  swimSpeed: number;
}

interface Flyer {
  flyHeight: number;
}

interface Duck extends Animal, Swimmer, Flyer {
  quack(): string;
}
```

## クラス

クラスは TypeScript のオブジェクト指向プログラミングの中心的な機能です。プロパティとメソッドをカプセル化し、再利用可能なコードを作成できます。

### クラスの基本

クラスは `class` キーワードで定義します。コンストラクタでインスタンス生成時の初期化処理を記述し、メソッドで振る舞いを定義します。

```typescript
class Dog {
  name: string;
  age: number;

  constructor(name: string, age: number) {
    this.name = name;
    this.age = age;
  }

  bark(): string {
    return `${this.name} says: Woof!`;
  }
}

const dog = new Dog("Buddy", 3);
console.log(dog.bark()); // Buddy says: Woof!
```

### アクセス修飾子

アクセス修飾子はプロパティやメソッドへのアクセス範囲を制御します。

public - どこからでもアクセス可能（デフォルト）
private - クラス内部からのみアクセス可能
protected - クラス内部と継承先のクラスからアクセス可能

パラメータプロパティはコンストラクタのパラメータにアクセス修飾子を付けることで、プロパティの宣言と初期化を同時に行える簡潔な記法です。

```typescript
class Cat {
  public name: string;      // 公開（デフォルト）
  private age: number;      // 非公開
  protected species: string; // 継承先からアクセス可能

  constructor(name: string, age: number) {
    this.name = name;
    this.age = age;
    this.species = "Cat";
  }
}

// パラメータプロパティ（簡潔な記法）
class Bird {
  constructor(
    public name: string,
    private age: number
  ) {}
}
```

### 継承と抽象クラス

クラスは `extends` キーワードで他のクラスを継承できます。継承により、既存のクラスの機能を引き継ぎつつ、新しい機能を追加できます。

抽象クラスは `abstract` キーワードで定義します。抽象クラスは直接インスタンス化できず、継承して使用します。抽象メソッドは継承先のクラスで必ず実装する必要があります。

```typescript
// 継承
class Animal {
  constructor(public name: string) {}

  makeSound(): void {
    console.log(`${this.name} makes a sound`);
  }
}

class Dog extends Animal {
  bark(): void {
    console.log(`${this.name} barks: Woof!`);
  }
}

// 抽象クラス
abstract class Bird {
  constructor(public name: string) {}

  abstract fly(): void;    // 継承先で実装必須
  abstract makeSound(): void;
}

class Eagle extends Bird {
  fly(): void {
    console.log(`${this.name} soars high`);
  }

  makeSound(): void {
    console.log("Screech!");
  }
}
```

## ジェネリクス

ジェネリクスは型を変数のように扱う機能です。型の安全性を保ちながら、汎用的で再利用可能なコードを書けます。

### ジェネリクスの基本

ジェネリクスは `<T>` のような型パラメータを使用して定義します。`T` は慣習的に使われますが、任意の名前を使用できます。

関数やクラス、インターフェースでジェネリクスを使用することで、さまざまな型に対応したコードを一度だけ記述できます。型パラメータは実際に使用する際に具体的な型に置き換えられます。

```typescript
// ジェネリック関数
function identity<T>(value: T): T {
  return value;
}

const name = identity<string>("Buddy");
const age = identity<number>(3);

// ジェネリッククラス
class Box<T> {
  constructor(private content: T) {}

  getContent(): T {
    return this.content;
  }
}

const stringBox = new Box<string>("Dog");
const numberBox = new Box<number>(42);
```

### 型制約とユーティリティ型

型制約は `extends` キーワードを使用して、ジェネリクスで受け入れる型に条件を付けられます。これにより、特定のプロパティやメソッドを持つ型のみを受け入れるようにできます。

ユーティリティ型は TypeScript が標準で提供する型変換の型です。既存の型から新しい型を生成できます。

- `Partial<T>` - すべてのプロパティをオプショナルに
- `Pick<T, K>` - 特定のプロパティのみを選択
- `Omit<T, K>` - 特定のプロパティを除外
- `Record<K, T>` - キーと値の型を指定したオブジェクト型を生成

```typescript
// 型制約
function printName<T extends { name: string }>(obj: T): void {
  console.log(obj.name);
}

// ユーティリティ型
interface Animal {
  name: string;
  age: number;
  species: string;
}

// Partial - すべてのプロパティをオプショナルに
type PartialAnimal = Partial<Animal>;

// Pick - 特定のプロパティのみ選択
type AnimalName = Pick<Animal, "name" | "species">;

// Omit - 特定のプロパティを除外
type AnimalWithoutAge = Omit<Animal, "age">;

// Record - キーと値の型を指定
type AnimalCount = Record<"dog" | "cat" | "bird", number>;

const petShop: AnimalCount = {
  dog: 5,
  cat: 8,
  bird: 12,
};
```

## 型エイリアス

型エイリアスは `type` キーワードを使用して既存の型に別名を付ける機能です。複雑な型を読みやすくし、再利用性を高めます。

インターフェースと似ていますが、型エイリアスはユニオン型やタプル型、プリミティブ型にも使用できる点が異なります。一方、インターフェースは拡張や実装に優れています。用途に応じて使い分けるとよいでしょう。

```typescript
// 基本的な型エイリアス
type AnimalName = string;
type AnimalAge = number;

// ユニオン型のエイリアス
type PetType = "dog" | "cat" | "bird";

// オブジェクト型のエイリアス
type Dog = {
  name: string;
  breed: string;
  age: number;
};

// 関数型のエイリアス
type Greeter = (name: string) => string;

const greet: Greeter = (name) => `Hello, ${name}!`;
```

## モジュール

モジュールはコードを複数のファイルに分割し、再利用可能にする仕組みです。`export` と `import` を使用して、型や関数、クラスを他のファイルで利用できます。

### エクスポートとインポート

```typescript
// animals.ts - エクスポート側
export interface Animal {
  name: string;
  age: number;
}

export class Dog implements Animal {
  constructor(
    public name: string,
    public age: number
  ) {}
}

export function greet(animal: Animal): string {
  return `Hello, ${animal.name}!`;
}

export default class Zoo {
  private animals: Animal[] = [];

  addAnimal(animal: Animal): void {
    this.animals.push(animal);
  }
}
```

```typescript
// main.ts - インポート側
import Zoo from "./animals";                    // デフォルトインポート
import { Dog, greet } from "./animals";         // 名前付きインポート
import type { Animal } from "./animals";        // 型のみインポート
import * as AnimalModule from "./animals";      // 名前空間インポート

const zoo = new Zoo();
const dog = new Dog("Buddy", 3);
zoo.addAnimal(dog);
```

## 高度な型機能

TypeScript の高度な型機能により、より厳密で柔軟な型定義が可能になります。

### 型ガード

型ガードはユニオン型の値を特定の型に絞り込む機能です。型の安全性を保ちながら、それぞれの型固有の操作を行えます。

typeof 型ガード - `typeof` 演算子を使用してプリミティブ型を判定します。

instanceof 型ガード - `instanceof` 演算子を使用してクラスのインスタンスを判定します。

カスタム型ガード - `is` キーワードを使用して独自の型判定関数を定義できます。

```typescript
// typeof 型ガード
function process(data: string | number): void {
  if (typeof data === "string") {
    console.log(data.toUpperCase());
  } else {
    console.log(data * 2);
  }
}

// instanceof 型ガード
class Dog {
  bark() {}
}

class Cat {
  meow() {}
}

function makeSound(animal: Dog | Cat): void {
  if (animal instanceof Dog) {
    animal.bark();
  } else {
    animal.meow();
  }
}

// カスタム型ガード
interface Fish {
  swim(): void;
}

interface Bird {
  fly(): void;
}

function isFish(animal: Fish | Bird): animal is Fish {
  return (animal as Fish).swim !== undefined;
}
```

### 高度な型演算子

TypeScript は型を操作するための強力な演算子を提供しています。

keyof - オブジェクトの型からプロパティ名をユニオン型として取得します。

typeof - 値から型を取得します。既存の値の型を再利用する際に便利です。

インデックスアクセス型 - オブジェクトの特定のプロパティの型を取得します。

条件付き型 - 三項演算子のように、条件に基づいて型を切り替えます。

テンプレートリテラル型 - 文字列リテラル型を組み合わせて新しい型を生成します。

```typescript
interface Dog {
  name: string;
  breed: string;
  age: number;
}

// keyof - オブジェクトのキーをユニオン型として取得
type DogKeys = keyof Dog; // "name" | "breed" | "age"

// typeof - 値から型を取得
const cat = { name: "Whiskers", age: 2 };
type Cat = typeof cat;

// インデックスアクセス型
type DogName = Dog["name"]; // string

// 条件付き型
type IsString<T> = T extends string ? "yes" : "no";
type Test = IsString<string>; // "yes"

// テンプレートリテラル型
type AnimalType = "dog" | "cat";
type AnimalEvent = `${AnimalType}Born`; // "dogBorn" | "catBorn"
```

