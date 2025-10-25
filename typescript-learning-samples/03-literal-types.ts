// リテラル型（Literal Types）

// 文字列リテラル型
type Direction = "north" | "south" | "east" | "west";

function move(direction: Direction): void {
  console.log(`Moving ${direction}`);
}

move("north");  // 出力: Moving north
move("east");   // 出力: Moving east
// move("up");  // エラー: 型 '"up"' を型 'Direction' に割り当てることはできません

// 数値リテラル型
type DiceValue = 1 | 2 | 3 | 4 | 5 | 6;

function rollDice(): DiceValue {
  return 4;
}

console.log(rollDice());  // 出力: 4

// 真偽値リテラル型
type Yes = true;
type No = false;

let confirmed: Yes = true;
console.log(confirmed);  // 出力: true

// 複合リテラル型
type Status = "success" | "error" | "loading";
type StatusCode = 200 | 404 | 500;

interface Response {
  status: Status;
  code: StatusCode;
}

const response: Response = {
  status: "success",
  code: 200,
};

console.log(response);  // 出力: { status: 'success', code: 200 }

// let による型の絞り込み
let x = "hello" as const;  // "hello" 型
let y = "hello";           // string 型

console.log(typeof x, typeof y);  // 出力: string string
