// ユーティリティ型の拡張

interface User {
  id: number;
  name: string;
  email: string;
  age?: number;
}

// Required<T> - すべてのプロパティを必須に
type RequiredUser = Required<User>;
const user1: RequiredUser = {
  id: 1,
  name: "Alice",
  email: "alice@example.com",
  age: 25, // age も必須になる
};
console.log(user1);

// Readonly<T> - すべてのプロパティを読み取り専用に
type ReadonlyUser = Readonly<User>;
const user2: ReadonlyUser = {
  id: 2,
  name: "Bob",
  email: "bob@example.com",
};
// user2.name = "Charlie"; // エラー: 読み取り専用プロパティ
console.log(user2);

// Exclude<T, U> - ユニオン型から特定の型を除外
type AllStatus = "active" | "inactive" | "pending" | "deleted";
type ActiveStatus = Exclude<AllStatus, "deleted" | "inactive">;
const status: ActiveStatus = "active";
console.log(status);  // 出力: active

// Extract<T, U> - ユニオン型から特定の型を抽出
type ExtractedStatus = Extract<AllStatus, "active" | "pending">;
const extractedStatus: ExtractedStatus = "pending";
console.log(extractedStatus);  // 出力: pending

// NonNullable<T> - null と undefined を除外
type MaybeString = string | null | undefined;
type DefiniteString = NonNullable<MaybeString>;
const str: DefiniteString = "Hello";
console.log(str);  // 出力: Hello

// ReturnType<T> - 関数の戻り値の型を取得
function getUser() {
  return { id: 1, name: "Alice", email: "alice@example.com" };
}
type UserReturnType = ReturnType<typeof getUser>;
const user3: UserReturnType = { id: 2, name: "Bob", email: "bob@example.com" };
console.log(user3);

// Parameters<T> - 関数の引数の型をタプルとして取得
function createUser(name: string, age: number, email: string) {
  return { name, age, email };
}
type CreateUserParams = Parameters<typeof createUser>;
const params: CreateUserParams = ["Charlie", 30, "charlie@example.com"];
console.log(params);  // 出力: [ 'Charlie', 30, 'charlie@example.com' ]

// ConstructorParameters<T> - コンストラクタの引数の型を取得
class Person {
  constructor(public name: string, public age: number) {}
}
type PersonConstructorParams = ConstructorParameters<typeof Person>;
const personParams: PersonConstructorParams = ["David", 35];
console.log(personParams);  // 出力: [ 'David', 35 ]

// InstanceType<T> - コンストラクタのインスタンス型を取得
type PersonInstance = InstanceType<typeof Person>;
const person: PersonInstance = new Person("Eve", 28);
console.log(person);  // 出力: Person { name: 'Eve', age: 28 }

// 文字列リテラル型の変換
type Greeting = "hello world";
type UpperGreeting = Uppercase<Greeting>;      // "HELLO WORLD"
type LowerGreeting = Lowercase<Greeting>;      // "hello world"
type CapitalGreeting = Capitalize<Greeting>;   // "Hello world"
type UncapitalGreeting = Uncapitalize<Greeting>; // "hello world"

const upper: UpperGreeting = "HELLO WORLD";
const capital: CapitalGreeting = "Hello world";
console.log(upper, capital);  // 出力: HELLO WORLD Hello world
