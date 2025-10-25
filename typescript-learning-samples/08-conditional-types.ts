// 条件付き型（Conditional Types）

// 基本的な条件付き型
type IsString<T> = T extends string ? "yes" : "no";

type Test1 = IsString<string>;  // "yes"
type Test2 = IsString<number>;  // "no"

const test1: Test1 = "yes";
const test2: Test2 = "no";
console.log(test1, test2);  // 出力: yes no

// 分配的条件型（Distributive Conditional Types）
type ToArray<T> = T extends any ? T[] : never;

type StringOrNumberArray = ToArray<string | number>;
// string[] | number[] (分配される)

const arr1: StringOrNumberArray = ["hello"];
const arr2: StringOrNumberArray = [1, 2, 3];
console.log(arr1, arr2);  // 出力: [ 'hello' ] [ 1, 2, 3 ]

// infer キーワードで型を推論
type ReturnType<T> = T extends (...args: any[]) => infer R ? R : never;

function getUser() {
  return { name: "Alice", age: 25 };
}

type UserType = ReturnType<typeof getUser>;
const user: UserType = { name: "Bob", age: 30 };
console.log(user);  // 出力: { name: 'Bob', age: 30 }

// 配列の要素の型を抽出
type ElementType<T> = T extends (infer E)[] ? E : never;

type Numbers = ElementType<number[]>;  // number
type Strings = ElementType<string[]>;  // string

const num: Numbers = 42;
const str: Strings = "hello";
console.log(num, str);  // 出力: 42 hello

// Promise の中身の型を抽出
type Unwrap<T> = T extends Promise<infer U> ? U : T;

type UnwrappedString = Unwrap<Promise<string>>;  // string
type UnwrappedNumber = Unwrap<number>;           // number

const unwrappedStr: UnwrappedString = "async result";
console.log(unwrappedStr);  // 出力: async result

// ネストした条件付き型
type TypeName<T> = T extends string
  ? "string"
  : T extends number
  ? "number"
  : T extends boolean
  ? "boolean"
  : T extends undefined
  ? "undefined"
  : T extends Function
  ? "function"
  : "object";

type T1 = TypeName<string>;    // "string"
type T2 = TypeName<number>;    // "number"
type T3 = TypeName<boolean>;   // "boolean"

const t1: T1 = "string";
const t2: T2 = "number";
console.log(t1, t2);  // 出力: string number

// 複雑な型の推論
type FunctionArguments<T> = T extends (...args: infer A) => any ? A : never;

function example(a: string, b: number, c: boolean) {
  return { a, b, c };
}

type ExampleArgs = FunctionArguments<typeof example>;
// [string, number, boolean]

const args: ExampleArgs = ["test", 42, true];
console.log(args);  // 出力: [ 'test', 42, true ]
