// デコレーター（Decorators）
// 注意: デコレーターを使用するには tsconfig.json で experimentalDecorators を有効にする必要があります

// クラスデコレーター
function sealed(constructor: Function) {
  console.log(`Sealing the constructor: ${constructor.name}`);
  Object.seal(constructor);
  Object.seal(constructor.prototype);
}

@sealed
class SealedClass {
  constructor(public name: string) {}
}

// const obj = new SealedClass("Test");
// console.log(obj.name);

// メソッドデコレーター
function log(target: any, propertyKey: string, descriptor: PropertyDescriptor) {
  const originalMethod = descriptor.value;

  descriptor.value = function (...args: any[]) {
    console.log(`Calling ${propertyKey} with args:`, args);
    const result = originalMethod.apply(this, args);
    console.log(`Result:`, result);
    return result;
  };

  return descriptor;
}

class Calculator {
  @log
  add(a: number, b: number): number {
    return a + b;
  }
}

// const calc = new Calculator();
// calc.add(5, 3);

// プロパティデコレーター
function readonly(target: any, propertyKey: string) {
  console.log(`Making ${propertyKey} readonly`);
}

class Person {
  @readonly
  name: string = "Alice";
}

// デコレーターファクトリ
function enumerable(value: boolean) {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    descriptor.enumerable = value;
  };
}

class Example {
  @enumerable(false)
  hiddenMethod() {
    console.log("This method is not enumerable");
  }

  @enumerable(true)
  visibleMethod() {
    console.log("This method is enumerable");
  }
}

console.log("Decorator examples are commented out to avoid runtime errors.");
console.log("Please enable experimentalDecorators in tsconfig.json to use decorators.");
