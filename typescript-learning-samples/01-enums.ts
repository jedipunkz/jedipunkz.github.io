// 列挙型（Enums）

// 数値列挙型
enum Direction {
  Up,
  Down,
  Left,
  Right,
}

console.log(Direction.Up);    // 出力: 0
console.log(Direction.Down);  // 出力: 1
console.log(Direction[0]);    // 出力: Up (リバースマッピング)

// 文字列列挙型
enum Status {
  Active = "ACTIVE",
  Inactive = "INACTIVE",
  Pending = "PENDING",
}

console.log(Status.Active);   // 出力: ACTIVE
console.log(Status.Pending);  // 出力: PENDING

// const列挙型（コンパイル時にインライン化される）
const enum Color {
  Red = "RED",
  Green = "GREEN",
  Blue = "BLUE",
}

console.log(Color.Red);  // 出力: RED

// カスタム値を持つ数値列挙型
enum HttpStatus {
  OK = 200,
  BadRequest = 400,
  NotFound = 404,
  InternalServerError = 500,
}

console.log(HttpStatus.OK);        // 出力: 200
console.log(HttpStatus.NotFound);  // 出力: 404
