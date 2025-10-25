// 型アサーション（Type Assertions）

// as 構文
let someValue: unknown = "Hello TypeScript";
let strLength: number = (someValue as string).length;
console.log(strLength);  // 出力: 16

// HTMLElement の型アサーション例
interface HTMLInputElement {
  value: string;
}

function getElementById(id: string): unknown {
  return { value: "Sample Input" };
}

const input = getElementById("username") as HTMLInputElement;
console.log(input.value);  // 出力: Sample Input

// as const アサーション（リテラル型として推論）
const config = {
  endpoint: "https://api.example.com",
  timeout: 3000,
} as const;

// config.endpoint = "other"; // エラー: 読み取り専用プロパティ

const colors = ["red", "green", "blue"] as const;
type Color = typeof colors[number]; // "red" | "green" | "blue"

console.log(config.endpoint);  // 出力: https://api.example.com
console.log(colors[0]);        // 出力: red

// Non-null アサーション演算子 (!)
function processValue(value: string | null): void {
  // value が null でないことが確実な場合
  console.log(value!.toUpperCase());
}

processValue("hello");  // 出力: HELLO
