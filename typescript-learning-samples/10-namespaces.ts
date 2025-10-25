// 名前空間（Namespaces）
// 注意: 現代のTypeScriptではモジュールの使用が推奨されています

// 基本的な名前空間
namespace Animals {
  export interface Animal {
    name: string;
    makeSound(): void;
  }

  export class Dog implements Animal {
    constructor(public name: string) {}

    makeSound(): void {
      console.log(`${this.name} says: Woof!`);
    }
  }

  export class Cat implements Animal {
    constructor(public name: string) {}

    makeSound(): void {
      console.log(`${this.name} says: Meow!`);
    }
  }
}

const dog = new Animals.Dog("Buddy");
dog.makeSound();  // 出力: Buddy says: Woof!

const cat = new Animals.Cat("Whiskers");
cat.makeSound();  // 出力: Whiskers says: Meow!

// ネストした名前空間
namespace Company {
  export namespace HR {
    export class Employee {
      constructor(public name: string, public salary: number) {}

      getInfo(): string {
        return `${this.name}: $${this.salary}`;
      }
    }
  }

  export namespace IT {
    export class Developer {
      constructor(public name: string, public language: string) {}

      getInfo(): string {
        return `${this.name} develops in ${this.language}`;
      }
    }
  }
}

const employee = new Company.HR.Employee("Alice", 50000);
console.log(employee.getInfo());  // 出力: Alice: $50000

const developer = new Company.IT.Developer("Bob", "TypeScript");
console.log(developer.getInfo());  // 出力: Bob develops in TypeScript

// エイリアス
import Dev = Company.IT.Developer;
const dev = new Dev("Charlie", "JavaScript");
console.log(dev.getInfo());  // 出力: Charlie develops in JavaScript

console.log("注意: 現代のTypeScriptではモジュール（import/export）の使用が推奨されています");
