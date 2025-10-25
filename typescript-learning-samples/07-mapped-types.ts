// Mapped Types（マップ型）

// 基本的なマップ型
type Readonly<T> = {
  readonly [P in keyof T]: T[P];
};

interface User {
  name: string;
  age: number;
}

type ReadonlyUser = Readonly<User>;
const user: ReadonlyUser = { name: "Alice", age: 25 };
// user.name = "Bob"; // エラー: 読み取り専用プロパティ
console.log(user);  // 出力: { name: 'Alice', age: 25 }

// Optional を作成するマップ型
type Optional<T> = {
  [P in keyof T]?: T[P];
};

type OptionalUser = Optional<User>;
const user2: OptionalUser = { name: "Bob" }; // age は省略可能
console.log(user2);  // 出力: { name: 'Bob' }

// 修飾子の除去（-readonly, -?）
type Mutable<T> = {
  -readonly [P in keyof T]: T[P];
};

type Required<T> = {
  [P in keyof T]-?: T[P];
};

// as を使った再マッピング
type Getters<T> = {
  [P in keyof T as `get${Capitalize<string & P>}`]: () => T[P];
};

interface Person {
  name: string;
  age: number;
}

type PersonGetters = Getters<Person>;
// { getName: () => string; getAge: () => number; }

const personGetters: PersonGetters = {
  getName: () => "Alice",
  getAge: () => 25,
};

console.log(personGetters.getName());  // 出力: Alice
console.log(personGetters.getAge());   // 出力: 25

// 条件付きマップ型
type NonFunctionPropertyNames<T> = {
  [K in keyof T]: T[K] extends Function ? never : K;
}[keyof T];

type NonFunctionProperties<T> = Pick<T, NonFunctionPropertyNames<T>>;

interface Example {
  name: string;
  age: number;
  greet: () => void;
}

type ExampleData = NonFunctionProperties<Example>;
// { name: string; age: number; }

const example: ExampleData = { name: "Bob", age: 30 };
console.log(example);  // 出力: { name: 'Bob', age: 30 }
