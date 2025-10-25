// Discriminated Unions（識別可能なユニオン型）

// タグ付きユニオン型
interface Circle {
  kind: "circle";
  radius: number;
}

interface Square {
  kind: "square";
  sideLength: number;
}

interface Rectangle {
  kind: "rectangle";
  width: number;
  height: number;
}

type Shape = Circle | Square | Rectangle;

// kind プロパティで型を識別
function getArea(shape: Shape): number {
  switch (shape.kind) {
    case "circle":
      return Math.PI * shape.radius ** 2;
    case "square":
      return shape.sideLength ** 2;
    case "rectangle":
      return shape.width * shape.height;
  }
}

const circle: Circle = { kind: "circle", radius: 10 };
const square: Square = { kind: "square", sideLength: 5 };
const rectangle: Rectangle = { kind: "rectangle", width: 10, height: 20 };

console.log(getArea(circle));     // 出力: 314.1592653589793
console.log(getArea(square));     // 出力: 25
console.log(getArea(rectangle));  // 出力: 200

// API レスポンスの例
interface Success {
  status: "success";
  data: string;
}

interface Error {
  status: "error";
  message: string;
}

type ApiResponse = Success | Error;

function handleResponse(response: ApiResponse): void {
  if (response.status === "success") {
    console.log("Data:", response.data);
  } else {
    console.log("Error:", response.message);
  }
}

handleResponse({ status: "success", data: "Hello" });      // 出力: Data: Hello
handleResponse({ status: "error", message: "Not found" }); // 出力: Error: Not found
