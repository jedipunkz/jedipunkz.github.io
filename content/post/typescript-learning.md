---
title: "TypeScript 入門: 構文集"
date: 2025-10-19T12:00:00+09:00
Categories: ["tools"]
draft: false
---
こんにちは [@jedipunkz](https://x.com/jedipunkz) です。

TypeScript の学習を進める中で構文を体系的に網羅的に理解する必要性を感じてサンプルコード集を作成しました。この記事では TypeScript の主要な構文をまとめたいと思います。

※  気が向いたときに新しい構文が出てきた際に更新し続ける記事にしようと思っています。

## 基本的な型システム


### プリミティブ型

プリミティブ型は JavaScript の基本的なデータ型です。TypeScript ではこれらに型注釈を付けることで型安全性を確保できます。

- boolean 型 - 真偽値を表します。`true` または `false` のいずれかの値を持ちます。
- number 型 - 数値を表します。整数・小数・16 進数・2 進数・8 進数すべてこの型で扱います。JavaScript と同様に内部的にはすべて浮動小数点数として扱われます。
- string 型 - 文字列を表します。ダブルクォート、シングルクォート、バッククォート（テンプレートリテラル）で記述できます。
- null 型と undefined 型 - 値が存在しないことを表します。`null` は明示的に値がないことを示し、`undefined` は値が未定義であることを示します。
- bigint 型 - `Number.MAX_SAFE_INTEGER` を超える大きな整数を扱えます。末尾に `n` を付けて記述します。
- symbol 型 - 一意で不変の値を作成します。オブジェクトのプロパティキーとして使用されることが多いです。

```typescript
// 基本的な型
const dogName: string = "Buddy";
const dogAge: number = 3;
const isDogHungry: boolean = true;

console.log(dogName);      // 出力: Buddy
console.log(dogAge);       // 出力: 3
console.log(isDogHungry);  // 出力: true

// null と undefined
const location: null = null;
let age: undefined = undefined;

console.log(location);  // 出力: null
console.log(age);       // 出力: undefined

// bigint と symbol
const weight: bigint = 9007199254740991n;
const id: symbol = Symbol("unique");

console.log(weight);  // 出力: 9007199254740991n
console.log(id);      // 出力: Symbol(unique)
```

プリミティブ型を理解することで、TypeScript の型システムの基礎を固められます。特に `null` と `undefined` の使い分けは重要で、意図的に値がないことを示す場合は `null`、未初期化や未定義を示す場合は `undefined` を使用するとコードの意図が明確になります。

### 型注釈と型推論

型注釈 (Type Annotation) は変数や関数に明示的に型を指定する機能です。`: 型名` の形式で記述します。型注釈によりその変数や関数が扱える値の種類を明確にできます。

型推論 (Type Inference) は TypeScript が自動的に型を判断する機能です。初期値から型を推測するため多くの場合は型注釈を省略できます。ただし、関数のパラメータは型推論されないため型注釈が必要です。

```typescript
// 型注釈
let catName: string = "Whiskers";
console.log(catName);  // 出力: Whiskers

// 型推論（TypeScriptが自動的に型を推論）
let lionName = "Simba"; // string型と推論される
console.log(lionName);  // 出力: Simba

// 関数の型注釈
function greetDog(name: string): string {
  return `Hello, ${name}!`;
}

console.log(greetDog("Buddy"));  // 出力: Hello, Buddy!
// greetDog(123);  // エラー: 型 'number' の引数を型 'string' のパラメーターに割り当てることはできません
```

型推論を活用することでコード量を削減しつつ、型安全性を保てます。ただし、関数のパラメータや複雑な型の場合は明示的に型注釈を付けることで、コードの意図がより明確になり保守性が向上します。

### TypeScript 拡張型

TypeScript は JavaScript にはない独自の型を提供しています。これらは型システムをより強力にし、さまざまな状況に対応できるようにします。

- any 型 - すべての型を受け入れます。型チェックを無効化するため、既存の JavaScript コードを移行する際などに使用しますが、型安全性が失われるため多用は避けるべきです。
- unknown 型 - any と同様にすべての型を受け入れますが、使用前に型チェックが必要です。型安全な any として推奨されます。
- void 型 - 関数が値を返さないことを示します。副作用のみを行う関数で使用します。
- never 型 - 決して値を返さない関数に使用します。例外を投げる関数や無限ループの関数などが該当します。また、起こりえないケースを表現する際にも使用されます。

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

複合型は複数の値や型を組み合わせて使用する型です。

### 配列とタプル

配列型は同じ型の要素を複数持つデータ構造です。`型名[]` または `Array<型名>` の 2 つの記法があります。

タプル型は固定長で各要素の型が決まっている配列です。配列と異なり、各位置の要素の型が固定されます。関数から複数の値を返す際などに便利です。

読み取り専用配列は `readonly` キーワードを使用することで、配列の変更を防ぎます。不変性を保証したい場合に使用します。

```typescript
// 配列
const animals: string[] = ["Dog", "Cat", "Bird"];
const ages: Array<number> = [3, 5, 2];

console.log(animals[0]);  // 出力: Dog
console.log(ages.length); // 出力: 3

// タプル（固定長で各要素の型が決まっている配列）
const pet: [string, number, boolean] = ["Buddy", 3, true];
console.log(pet[0]);  // 出力: Buddy (string型)
console.log(pet[1]);  // 出力: 3 (number型)
console.log(pet[2]);  // 出力: true (boolean型)

// 読み取り専用配列
const endangered: readonly string[] = ["Panda", "Tiger"];
console.log(endangered[0]);  // 出力: Panda
// endangered.push("Lion");  // エラー: 読み取り専用プロパティのため変更不可
```

配列は同じ型の値を複数扱う際に使用し、タプルは異なる型の値を順序付きで扱う際に便利です。関数から複数の値を返す場合や、座標 `[x: number, y: number]` のような固定構造のデータに適しています。

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
petId = "DOG-001";
console.log(petId);  // 出力: DOG-001

petId = 123;
console.log(petId);  // 出力: 123

// リテラル型との組み合わせ
type AnimalType = "dog" | "cat" | "bird";
let myPet: AnimalType = "dog";
console.log(myPet);  // 出力: dog
// myPet = "fish";  // エラー: 型 '"fish"' を型 'AnimalType' に割り当てることはできません

// インターセクション型（複数の型を結合）
type WildAnimal = { species: string; habitat: string };
type Dangerous = { dangerLevel: number };
type WildDangerous = WildAnimal & Dangerous;

const bear: WildDangerous = {
  species: "Grizzly",
  habitat: "Forest",
  dangerLevel: 9,
};

console.log(bear.species);      // 出力: Grizzly
console.log(bear.dangerLevel);  // 出力: 9
```

ユニオン型により柔軟な型定義が可能になり、API レスポンスのように複数の形式を取りうるデータを型安全に扱えます。インターセクション型は既存の型を組み合わせて拡張する際に便利で、コードの再利用性が高まります。

## 関数

TypeScript では関数のパラメータと戻り値に型を指定できます。これにより、関数の使い方を明確にし、誤った使用を防げます。

### 関数の型定義

関数の型定義では、パラメータの型と戻り値の型を指定します。 オプショナルパラメータは `?` を付けることで省略可能なパラメータを定義できます。オプショナルパラメータは必須パラメータの後に配置する必要があります。デフォルトパラメータは値が渡されなかった場合に使用されるデフォルト値を設定できます。レストパラメータは `...` を使用して可変長の引数を受け取れます。配列として扱われます。

```typescript
// 基本的な関数
function calculateSpeed(distance: number, time: number): number {
  return distance / time;
}

console.log(calculateSpeed(100, 10));  // 出力: 10

// オプショナルパラメータ
function describePet(name: string, age: number, breed?: string): string {
  return breed ? `${name} is ${age} years old ${breed}` : `${name} is ${age} years old`;
}

console.log(describePet("Buddy", 3, "Labrador"));  // 出力: Buddy is 3 years old Labrador
console.log(describePet("Max", 2));                 // 出力: Max is 2 years old

// デフォルトパラメータ
function createProfile(name: string, species: string = "Unknown"): string {
  return `Name: ${name}, Species: ${species}`;
}

console.log(createProfile("Whiskers", "Cat"));  // 出力: Name: Whiskers, Species: Cat
console.log(createProfile("Mystery"));          // 出力: Name: Mystery, Species: Unknown

// レストパラメータ
function listAnimals(zoo: string, ...animals: string[]): void {
  console.log(`Animals in ${zoo}:`, animals);
}

listAnimals("Tokyo Zoo", "Lion", "Elephant", "Giraffe");
// 出力: Animals in Tokyo Zoo: [ 'Lion', 'Elephant', 'Giraffe' ]
```

関数に型を付けることで、IDEの補完機能が強化され、誤った引数の渡し方をコンパイル時に検出できます。オプショナルパラメータとデフォルトパラメータを使い分けることで、柔軟な関数設計が可能になります。

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

console.log(identifyAnimal(123));              // 出力: ID: 123
console.log(identifyAnimal("Buddy"));          // 出力: Name: Buddy
console.log(identifyAnimal(456, "Dog"));       // 出力: ID: 456, Species: Dog
```

オーバーロードは API の型定義を正確に表現する際に有用です。引数の組み合わせによって戻り値の型が変わる場合、型安全性を保ちながら柔軟な関数設計ができます。

## インターフェース

インターフェースはオブジェクトの形状（構造）を定義する機能です。

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

インターフェースは `extends` キーワードを使用して他のインターフェースを継承できます。継承により、既存のインターフェースを拡張して新しいインターフェースを作成できます。複数のインターフェースを同時に継承することも可能です。

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

クラスはプロパティとメソッドをカプセル化し再利用可能なコードを作成できます。

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

  getInfo(): string {
    return `${this.name} is ${this.age} years old`;
  }
}

const dog = new Dog("Buddy", 3);
console.log(dog.bark());     // 出力: Buddy says: Woof!
console.log(dog.getInfo());  // 出力: Buddy is 3 years old
```

クラスを使用することで、関連するデータ（プロパティ）と振る舞い（メソッド）をひとまとめにでき、オブジェクト指向プログラミングの恩恵を受けられます。再利用可能なコードを書く際に非常に便利です。

### アクセス修飾子

アクセス修飾子はプロパティやメソッドへのアクセス範囲を制御します。

- public - どこからでもアクセス可能（デフォルト）
- private - クラス内部からのみアクセス可能
- protected - クラス内部と継承先のクラスからアクセス可能

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

ジェネリクスは型を変数のように扱う機能です。

### ジェネリクスの基本

ジェネリクスは `<T>` のような型パラメータを使用して定義します。`T` は慣習的に使われますが任意の名前を使用できます。関数やクラス、インターフェースでジェネリクスを使用することで、さまざまな型に対応したコードを一度だけ記述できます。型パラメータは実際に使用する際に具体的な型に置き換えられます。

```typescript
// ジェネリック関数
function identity<T>(value: T): T {
  return value;
}

const name = identity<string>("Buddy");
const age = identity<number>(3);

console.log(name);  // 出力: Buddy
console.log(age);   // 出力: 3

// 型推論も可能
const animal = identity("Cat");  // stringと推論される
console.log(animal);  // 出力: Cat

// ジェネリッククラス
class Box<T> {
  constructor(private content: T) {}

  getContent(): T {
    return this.content;
  }

  setContent(content: T): void {
    this.content = content;
  }
}

const stringBox = new Box<string>("Dog");
console.log(stringBox.getContent());  // 出力: Dog

const numberBox = new Box<number>(42);
console.log(numberBox.getContent());  // 出力: 42

// stringBox.setContent(123);  // エラー: 型 'number' を型 'string' に割り当てることはできません
```

### 型制約とユーティリティ型

型制約は `extends` キーワードを使用してジェネリクスで受け入れる型に条件を付けられます。

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

型エイリアスは `type` キーワードを使用して既存の型に別名を付ける機能です。インターフェースと似ていますが、型エイリアスはユニオン型やタプル型、プリミティブ型にも使用できる点が異なります。一方、インターフェースは拡張や実装に優れています。用途に応じて使い分けるとよいでしょう。

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

TypeScript の高度な型機能によりより厳密で柔軟な型定義が可能になります。

### 型ガード

型ガードはユニオン型の値を特定の型に絞り込む機能です。型の安全性を保ちながら、それぞれの型固有の操作を行えます。

- typeof 型ガード - `typeof` 演算子を使用してプリミティブ型を判定します。
- instanceof 型ガード - `instanceof` 演算子を使用してクラスのインスタンスを判定します。
- カスタム型ガード - `is` キーワードを使用して独自の型判定関数を定義できます。

```typescript
// typeof 型ガード
function process(data: string | number): void {
  if (typeof data === "string") {
    console.log(data.toUpperCase());
  } else {
    console.log(data * 2);
  }
}

process("hello");  // 出力: HELLO
process(21);       // 出力: 42

// instanceof 型ガード
class Dog {
  bark() {
    console.log("Woof!");
  }
}

class Cat {
  meow() {
    console.log("Meow!");
  }
}

function makeSound(animal: Dog | Cat): void {
  if (animal instanceof Dog) {
    animal.bark();
  } else {
    animal.meow();
  }
}

makeSound(new Dog());  // 出力: Woof!
makeSound(new Cat());  // 出力: Meow!

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

const goldfish: Fish = { swim: () => console.log("Swimming") };
const sparrow: Bird = { fly: () => console.log("Flying") };

if (isFish(goldfish)) {
  goldfish.swim();  // 出力: Swimming
}
```

### 高度な型演算子

TypeScript は型を操作するための強力な演算子を提供しています。

- keyof - オブジェクトの型からプロパティ名をユニオン型として取得します。
- typeof - 値から型を取得します。既存の値の型を再利用する際に便利です。
- インデックスアクセス型 - オブジェクトの特定のプロパティの型を取得します。
- 条件付き型 - 三項演算子のように、条件に基づいて型を切り替えます。
- テンプレートリテラル型 - 文字列リテラル型を組み合わせて新しい型を生成します。

```typescript
interface Dog {
  name: string;
  breed: string;
  age: number;
}

// keyof - オブジェクトのキーをユニオン型として取得
type DogKeys = keyof Dog; // "name" | "breed" | "age"

function getDogProperty(dog: Dog, key: DogKeys) {
  return dog[key];
}

const myDog: Dog = { name: "Buddy", breed: "Labrador", age: 3 };
console.log(getDogProperty(myDog, "name"));  // 出力: Buddy
console.log(getDogProperty(myDog, "age"));   // 出力: 3

// typeof - 値から型を取得
const cat = { name: "Whiskers", age: 2 };
type Cat = typeof cat;

const anotherCat: Cat = { name: "Luna", age: 1 };
console.log(anotherCat);  // 出力: { name: 'Luna', age: 1 }

// インデックスアクセス型
type DogName = Dog["name"]; // string
const dogName: DogName = "Max";
console.log(dogName);  // 出力: Max

// 条件付き型
type IsString<T> = T extends string ? "yes" : "no";
type Test1 = IsString<string>;  // "yes"
type Test2 = IsString<number>;  // "no"

// テンプレートリテラル型
type AnimalType = "dog" | "cat";
type AnimalEvent = `${AnimalType}Born`; // "dogBorn" | "catBorn"

const event1: AnimalEvent = "dogBorn";
const event2: AnimalEvent = "catBorn";
console.log(event1, event2);  // 出力: dogBorn catBorn
```

高度な型演算子を使いこなすことで、型レベルでのプログラミングが可能になり、より厳密で保守性の高いコードを書けます。特に大規模なアプリケーションやライブラリ開発において威力を発揮します。

