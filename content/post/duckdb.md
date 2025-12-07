---
title: "DuckDB に入門してみた"
description: "DuckDB 入門記事。JSON や CSV、Parquet などのファイルを直接クエリできる。Node.js 環境での基本的な使用方法と、AWS WAFv2 ログ解析の具体例を紹介"
date: 2025-11-02T22:56:17+09:00
Categories: ["infrastructure", "database", "data-analysis"]
draft: false
---
こんにちは。[jedipunkz🚀](https://x.com/jedipunkz) です。

今回は DuckDB について理解したことをまとめようと思います。

DuckDB は PostgreSQL 互換の SQL を使って、JSON や CSV、Parquet などのファイルを直接クエリできるデータベースエンジンです。サーバーのセットアップが不要で、Node.js や Python などのアプリケーションに組み込んで使えるため、データ分析やログ解析の用途で注目されています。

## DuckDB の特徴

DuckDB は以下の特徴を持ちます。

- 組み込み型データベース: サーバー不要で、プロセス内で動作
- 高速な分析処理: 列指向ストレージとベクトル化実行により OLAP に最適化
- 多様なフォーマット対応: JSON、CSV、Parquet などを直接読み込み
- PostgreSQL 互換 SQL: 標準的な SQL で操作可能
- 軽量: SQLite のように単一バイナリで動作

## 環境セットアップ

今回は Node.js (TypeScript) で DuckDB を使用します。

基本的なセットアップコードは以下の通りです。
`:memory:` を指定することで、メモリ上にデータベースを作成します。永続化が必要な場合は、ファイルパスを指定することもできます。

```typescript
import duckdb from "duckdb";
import { promisify } from "util";

const db = new duckdb.Database(":memory:");
const dbAll = promisify(db.all.bind(db));
const dbClose = promisify(db.close.bind(db));
```


## 基本的な SELECT 操作

まずは基本的な SELECT 操作から見ていきます。

### サンプルデータ

従業員データを JSON ファイルで用意します (employees.json)。

```json
[
  {"id": 1, "name": "Alice", "age": 28, "department": "Sales", "salary": 50000},
  {"id": 2, "name": "Bob", "age": 35, "department": "Engineering", "salary": 75000},
  {"id": 3, "name": "Charlie", "age": 42, "department": "Sales", "salary": 65000},
  {"id": 4, "name": "Diana", "age": 31, "department": "Engineering", "salary": 80000},
  {"id": 5, "name": "Eve", "age": 29, "department": "HR", "salary": 55000}
]
```

### クエリ実行

DuckDB では、JSON ファイルを直接 FROM 句で指定できます。
ポイントは、CREATE TABLE などの事前準備なしに、ファイルパスを指定するだけでクエリを実行できる点です。DuckDB が自動的にスキーマを推論し、データを読み込みます。

```typescript
// 1. WHERE 句でフィルタリング
const engineering = await dbAll(
  "SELECT name, salary FROM 'basic/employees.json' WHERE department = 'Engineering'"
);
console.table(engineering);
```

実行結果
```
┌─────────┬─────────┬────────┐
│ (index) │ name    │ salary │
├─────────┼─────────┼────────┤
│ 0       │ 'Bob'   │ 75000  │
│ 1       │ 'Diana' │ 80000  │
└─────────┴─────────┴────────┘
```

次もシンプルなクエリ例です。

```typescript
// 2. ORDER BY で並び替え
const ordered = await dbAll(
  "SELECT name, salary FROM 'basic/employees.json' ORDER BY salary DESC"
);
console.table(ordered);
```

実行結果

```
┌─────────┬───────────┬────────┐
│ (index) │ name      │ salary │
├─────────┼───────────┼────────┤
│ 0       │ 'Diana'   │ 80000n │
│ 1       │ 'Bob'     │ 75000n │
│ 2       │ 'Charlie' │ 65000n │
│ 3       │ 'Eve'     │ 55000n │
│ 4       │ 'Alice'   │ 50000n │
└─────────┴───────────┴────────┘
```


## ETL 処理の例

ETL 処理でよくある、複数のデータソースを結合するパターンを見ていきます。

### サンプルデータ

3つのファイルを用意します。

customers.json
```json
[
  {"customer_id": 1, "name": "Alice Smith", "email": "alice@example.com", "country": "US"},
  {"customer_id": 2, "name": "Bob Johnson", "email": "bob@example.com", "country": "UK"},
  {"customer_id": 3, "name": "Charlie Brown", "email": "charlie@example.com", "country": "US"},
  {"customer_id": 4, "name": "Diana Prince", "email": "diana@example.com", "country": "CA"}
]
```

orders.json
```json
[
  {"order_id": 101, "customer_id": 1, "product": "Laptop", "amount": 1200, "order_date": "2024-01-15"},
  {"order_id": 102, "customer_id": 2, "product": "Mouse", "amount": 25, "order_date": "2024-01-16"},
  {"order_id": 103, "customer_id": 1, "product": "Keyboard", "amount": 75, "order_date": "2024-01-17"},
  {"order_id": 104, "customer_id": 3, "product": "Monitor", "amount": 350, "order_date": "2024-01-18"},
  {"order_id": 105, "customer_id": 2, "product": "Laptop", "amount": 1200, "order_date": "2024-01-19"},
  {"order_id": 106, "customer_id": 4, "product": "Keyboard", "amount": 75, "order_date": "2024-01-20"},
  {"order_id": 107, "customer_id": 1, "product": "Mouse", "amount": 25, "order_date": "2024-01-21"}
]
```

products.json
```json
[
  {"product_name": "Laptop", "category": "Electronics", "cost": 800},
  {"product_name": "Mouse", "category": "Accessories", "cost": 10},
  {"product_name": "Keyboard", "category": "Accessories", "cost": 30},
  {"product_name": "Monitor", "category": "Electronics", "cost": 200}
]
```

### JOIN クエリ

```typescript
const enrichedOrders = await dbAll(
  `SELECT
    o.order_id,
    o.order_date,
    c.customer_id,
    c.name as customer_name,
    c.email,
    c.country,
    o.product,
    p.category,
    o.amount as sale_price,
    p.cost,
    o.amount - p.cost as profit
  FROM 'etl/orders.json' o
  INNER JOIN 'etl/customers.json' c ON o.customer_id = c.customer_id
  INNER JOIN 'etl/products.json' p ON o.product = p.product_name
  ORDER BY o.order_date DESC`
);
console.table(enrichedOrders);
```

実行結果

```
┌─────────┬──────────┬──────────────────────────┬─────────────┬─────────────────┬───────────────────────┬─────────┬────────────┬───────────────┬────────────┬──────┬────────┐
│ (index) │ order_id │ order_date               │ customer_id │ customer_name   │ email                 │ country │ product    │ category      │ sale_price │ cost │ profit │
├─────────┼──────────┼──────────────────────────┼─────────────┼─────────────────┼───────────────────────┼─────────┼────────────┼───────────────┼────────────┼──────┼────────┤
│ 0       │ 107n     │ 2024-01-21T00:00:00.000Z │ 1n          │ 'Alice Smith'   │ 'alice@example.com'   │ 'US'    │ 'Mouse'    │ 'Accessories' │ 25n        │ 10n  │ 15n    │
│ 1       │ 106n     │ 2024-01-20T00:00:00.000Z │ 4n          │ 'Diana Prince'  │ 'diana@example.com'   │ 'CA'    │ 'Keyboard' │ 'Accessories' │ 75n        │ 30n  │ 45n    │
│ 2       │ 105n     │ 2024-01-19T00:00:00.000Z │ 2n          │ 'Bob Johnson'   │ 'bob@example.com'     │ 'UK'    │ 'Laptop'   │ 'Electronics' │ 1200n      │ 800n │ 400n   │
│ 3       │ 104n     │ 2024-01-18T00:00:00.000Z │ 3n          │ 'Charlie Brown' │ 'charlie@example.com' │ 'US'    │ 'Monitor'  │ 'Electronics' │ 350n       │ 200n │ 150n   │
│ 4       │ 103n     │ 2024-01-17T00:00:00.000Z │ 1n          │ 'Alice Smith'   │ 'alice@example.com'   │ 'US'    │ 'Keyboard' │ 'Accessories' │ 75n        │ 30n  │ 45n    │
│ 5       │ 102n     │ 2024-01-16T00:00:00.000Z │ 2n          │ 'Bob Johnson'   │ 'bob@example.com'     │ 'UK'    │ 'Mouse'    │ 'Accessories' │ 25n        │ 10n  │ 15n    │
│ 6       │ 101n     │ 2024-01-15T00:00:00.000Z │ 1n          │ 'Alice Smith'   │ 'alice@example.com'   │ 'US'    │ 'Laptop'   │ 'Electronics' │ 1200n      │ 800n │ 400n   │
└─────────┴──────────┴──────────────────────────┴─────────────┴─────────────────┴───────────────────────┴─────────┴────────────┴───────────────┴────────────┴──────┴────────┘
```



## AWS WAFv2 ログフォーマットを用いたクエリ例

次に、SRE 業務でよくある AWS WAF のログ分析の例を見ていきます。

### サンプルデータ

AWS WAFv2 のログは JSON Lines 形式 (1行1レコード) で出力されます。

```json
{"timestamp":1698765433000,"formatVersion":1,"webaclId":"arn:aws:...","terminatingRuleId":"SQLi_BLOCK","terminatingRuleType":"REGULAR","action":"BLOCK","terminatingRuleMatchDetails":[{"conditionType":"SQL_INJECTION","sensitivityLevel":"HIGH","location":"QUERY_STRING","matchedData":["admin","OR","1"]}],"httpRequest":{"clientIp":"198.51.100.42","country":"CN","uri":"/api/login","httpMethod":"POST"},"labels":[{"name":"awswaf:managed:aws:sql-database:SQLi"}]}
{"timestamp":1698765434000,"formatVersion":1,"webaclId":"arn:aws:...","terminatingRuleId":"RateLimit","terminatingRuleType":"RATE_BASED","action":"BLOCK","terminatingRuleMatchDetails":[],"httpRequest":{"clientIp":"192.0.2.100","country":"RU","uri":"/api/products","httpMethod":"GET"},"labels":[{"name":"awswaf:managed:aws:rate-limit"}]}
...
```

### 全体統計の取得

ポイントとしては `format='newline_delimited'` を指定して JSON Lines 形式を読み込みし、ネストした JSON フィールド (`httpRequest.clientIp`) をドット記法でアクセス。CASE 式を使った条件付き集計、です。

```typescript
const overall = await dbAll(
  `SELECT
    COUNT(*) as total_requests,
    SUM(CASE WHEN action = 'BLOCK' THEN 1 ELSE 0 END) as blocked,
    SUM(CASE WHEN action = 'ALLOW' THEN 1 ELSE 0 END) as allowed,
    ROUND(100.0 * SUM(CASE WHEN action = 'BLOCK' THEN 1 ELSE 0 END) / COUNT(*), 2) as block_rate_pct,
    COUNT(DISTINCT httpRequest.clientIp) as unique_ips
  FROM read_json('wafv2/waf_logs.json', format='newline_delimited')`
);
console.table(overall);
```

実行結果:

```
┌─────────┬────────────────┬─────────┬─────────┬────────────────┬────────────┐
│ (index) │ total_requests │ blocked │ allowed │ block_rate_pct │ unique_ips │
├─────────┼────────────────┼─────────┼─────────┼────────────────┼────────────┤
│ 0       │ 10n            │ 6n      │ 4n      │ 60             │ 9n         │
└─────────┴────────────────┴─────────┴─────────┴────────────────┴────────────┘
```


### 国別トラフィック分析

次に書きのクエリ例では、国別にリクエスト数、ブロック数、許可数、ブロック率を集計しています。

```typescript
const byCountry = await dbAll(
  `SELECT
    httpRequest.country as country,
    COUNT(*) as total_requests,
    SUM(CASE WHEN action = 'BLOCK' THEN 1 ELSE 0 END) as blocked,
    SUM(CASE WHEN action = 'ALLOW' THEN 1 ELSE 0 END) as allowed,
    ROUND(100.0 * SUM(CASE WHEN action = 'BLOCK' THEN 1 ELSE 0 END) / COUNT(*), 2) as block_rate_pct
  FROM read_json('wafv2/waf_logs.json', format='newline_delimited')
  GROUP BY httpRequest.country
  ORDER BY total_requests DESC`
);
console.table(byCountry);
```

実行結果:

```
┌─────────┬─────────┬────────────────┬─────────┬─────────┬────────────────┐
│ (index) │ country │ total_requests │ blocked │ allowed │ block_rate_pct │
├─────────┼─────────┼────────────────┼─────────┼─────────┼────────────────┤
│ 0       │ 'RU'    │ 2n             │ 2n      │ 0n      │ 100            │
│ 1       │ 'JP'    │ 2n             │ 0n      │ 2n      │ 0              │
│ 2       │ 'US'    │ 2n             │ 0n      │ 2n      │ 0              │
│ 3       │ 'CN'    │ 2n             │ 2n      │ 0n      │ 100            │
│ 4       │ 'KP'    │ 1n             │ 1n      │ 0n      │ 100            │
│ 5       │ 'BR'    │ 1n             │ 1n      │ 0n      │ 100            │
└─────────┴─────────┴────────────────┴─────────┴─────────┴────────────────┘
```


## パターン6: ネストした配列の展開

AWS WAF ログには、攻撃の詳細情報が配列として格納されています。この配列を展開して分析するには UNNEST を使います。

### クエリ実行

```typescript
const attackPatterns = await dbAll(
  `WITH attack_details AS (
    SELECT
      timestamp,
      terminatingRuleId,
      httpRequest.clientIp as client_ip,
      httpRequest.country as country,
      httpRequest.uri as uri,
      UNNEST(terminatingRuleMatchDetails) as detail
    FROM read_json('wafv2/waf_logs.json', format='newline_delimited')
    WHERE array_length(terminatingRuleMatchDetails) > 0
  )
  SELECT
    to_timestamp(timestamp / 1000) as datetime,
    terminatingRuleId as rule,
    detail.conditionType as attack_type,
    detail.sensitivityLevel as severity,
    detail.location as location,
    client_ip as attacker_ip,
    country,
    uri as target_endpoint
  FROM attack_details
  ORDER BY timestamp DESC`
);
console.table(attackPatterns);
```

実行結果:

```
┌─────────┬──────────────────────────┬──────────────┬──────────────────────┬──────────┬────────────────┬─────────────────┬─────────┬─────────────────┐
│ (index) │ datetime                 │ rule         │ attack_type          │ severity │ location       │ attacker_ip     │ country │ target_endpoint │
├─────────┼──────────────────────────┼──────────────┼──────────────────────┼──────────┼────────────────┼─────────────────┼─────────┼─────────────────┤
│ 0       │ 2023-10-31T15:17:19.000Z │ 'SQLi_BLOCK' │ 'SQL_INJECTION'      │ 'HIGH'   │ 'QUERY_STRING' │ '192.0.2.50'    │ 'CN'    │ '/api/users'    │
│ 1       │ 2023-10-31T15:17:18.000Z │ 'BadBot'     │ 'REGEX_PATTERN_SETS' │ null     │ 'HEADER'       │ '192.0.2.200'   │ 'KP'    │ '/admin'        │
│ 2       │ 2023-10-31T15:17:16.000Z │ 'XSS_BLOCK'  │ 'XSS'                │ 'HIGH'   │ 'QUERY_STRING' │ '198.51.100.99' │ 'BR'    │ '/search'       │
│ 3       │ 2023-10-31T15:17:13.000Z │ 'SQLi_BLOCK' │ 'SQL_INJECTION'      │ 'HIGH'   │ 'QUERY_STRING' │ '198.51.100.42' │ 'CN'    │ '/api/login'    │
└─────────┴──────────────────────────┴──────────────┴──────────────────────┴──────────┴────────────────┴─────────────────┴─────────┴─────────────────┘
```


## まとめと考察

DuckDB は列指向ストレージを採用しているため、以下のような特徴があるそうです。

- 集計クエリが高速: 必要な列のみを読み込むため、大量データでも効率的
- 自動並列化: マルチコアを自動的に活用
- メモリ効率: メモリを超えるデータもディスクを使って処理可能

また他の DuckDB 記事で読んだのですが、スケールアウトシステムの複雑さの問題を回避するためスケールアップモデルを提唱している、という思想的な話もありそうです。その辺りは自分はなんとも言えないですが、非常にシンプルな構成で高速に分析出来るのは効果高いなと感じました。

また、まだあまり調べていないですが下記の DuckDB Wasm というモノもありそうです。軽く動かしてみましたがオブジェクトストレージにアクセスする認証情報はどうするのだろう？等まだ疑問があり且つ調べきれていないので、次回にでも調べて記事に出来たら良いなと思いました。
https://duckdb.org/docs/stable/clients/wasm/overview

