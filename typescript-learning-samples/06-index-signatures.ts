// インデックスシグネチャ（Index Signatures）

// 基本的なインデックスシグネチャ
interface StringDictionary {
  [key: string]: string;
}

const dictionary: StringDictionary = {
  hello: "こんにちは",
  goodbye: "さようなら",
  thanks: "ありがとう",
};

console.log(dictionary.hello);    // 出力: こんにちは
console.log(dictionary["thanks"]); // 出力: ありがとう

// 数値インデックスシグネチャ
interface NumberArray {
  [index: number]: string;
}

const animals: NumberArray = {
  0: "Dog",
  1: "Cat",
  2: "Bird",
};

console.log(animals[0]);  // 出力: Dog
console.log(animals[2]);  // 出力: Bird

// 読み取り専用インデックスシグネチャ
interface ReadonlyDictionary {
  readonly [key: string]: number;
}

const scores: ReadonlyDictionary = {
  math: 95,
  english: 88,
  science: 92,
};

console.log(scores.math);  // 出力: 95
// scores.math = 100; // エラー: 読み取り専用プロパティ

// 固定プロパティとインデックスシグネチャの組み合わせ
interface Config {
  apiUrl: string;
  timeout: number;
  [key: string]: string | number; // その他のプロパティ
}

const config: Config = {
  apiUrl: "https://api.example.com",
  timeout: 3000,
  retries: 3,
  debug: "enabled",
};

console.log(config.apiUrl);  // 出力: https://api.example.com
console.log(config.retries);  // 出力: 3

// Record を使った代替案
type UserRoles = Record<string, boolean>;

const roles: UserRoles = {
  admin: true,
  editor: true,
  viewer: false,
};

console.log(roles.admin);  // 出力: true
console.log(roles.viewer); // 出力: false
