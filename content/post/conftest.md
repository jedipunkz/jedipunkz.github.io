---
title: "Conftest に入門してみた"
description: "Conftest と Terraform を使い基本的な構文を理解しつつ実際に Rego ポリシを書いて動作させてみた記事です"
date: 2025-12-07T10:42:32+09:00
Categories: ["infrastructure", "IaC"]
draft: false
---
こんにちは。[jedipunkz🚀](https://x.com/jedipunkz) です。

Conftest と Open Policy Agent (OPA) を使った Terraform のポリシー検証を行ったのでそれを記事にしたいと思います。ポリシを書くことで Terraform コードに制約を加え、セキュリティ要件(例えば暗号化要件やポート開放要件等) を満たしたりベストプラクティスにそったインフラを構築できます。毎回レビューで人にチェックさせるよりも確実に制約を守れるようになるのでおすすめです。

この記事では、Conftest と OPA を使って、Terraform コードに自動的にポリシーチェックを適用する方法をチュートリアル形式で解説します。

---

## 1. Conftest 概要と基本チュートリアル

### 1.1 Conftest とは？

Conftest は、構造化された設定データに対してポリシーをテストするためのツールです。Open Policy Agent (OPA) の Rego 言語を使用してポリシーを記述し、さまざまな設定ファイルを検証できます。

#### Conftest の特徴

1. 汎用性が高い
   - Terraform（.tf、tfplan.json）
   - Kubernetes（YAML、JSON）
   - Dockerfile
   - その他の JSON/YAML ファイル

2. シンプルで軽量
   - 単一のバイナリで動作
   - 外部依存なし
   - CI/CD に簡単に統合可能

3. OPA の Rego 言語を採用
   - 宣言的なポリシー記述
   - 強力なパターンマッチング
   - テスト可能なポリシーコード

#### なぜ Conftest が必要なのか？

従来のインフラ管理では、以下のような課題がありました。

- レビューで毎回同じ指摘（「暗号化を有効にしてください」など）
- 人的ミスによるセキュリティホール
- 環境間での設定の不整合
- コンプライアンス違反の見落とし

Conftest を使うことで、これらの課題を解決できます。

- ポリシーをコードで自動チェック
- デプロイ前に問題を検出
- 一貫したガバナンスの実現
- レビュー負荷の軽減

### 1.2 セットアップ

#### 1.2.1 Conftest のインストール

macOS の場合：

```bash
brew install conftest
```

Linux の場合：

```bash
LATEST_VERSION=$(curl -s https://api.github.com/repos/open-policy-agent/conftest/releases/latest | grep '"tag_name"' | sed -E 's/.*"v([^"]+)".*/\1/')
wget "https://github.com/open-policy-agent/conftest/releases/download/v${LATEST_VERSION}/conftest_${LATEST_VERSION}_Linux_x86_64.tar.gz"
tar xzf conftest_${LATEST_VERSION}_Linux_x86_64.tar.gz
sudo mv conftest /usr/local/bin/
```

### 1.3 最初のポリシーを書いてみる

では、最初のポリシーを作成します。

#### プロジェクトディレクトリの作成

作業用のディレクトリを作成します。

```bash
mkdir conftest-tutorial
cd conftest-tutorial
mkdir policy
```

ディレクトリ構造：

```
conftest-tutorial/
├── policy/        # ポリシーファイルを配置
└── (Terraform ファイル)
```

#### 簡単な Terraform コードを用意

`example.tf` を作成します。

```hcl
# S3 バケット（命名規則違反の例）
resource "aws_s3_bucket" "example" {
  bucket = "my-test-bucket"
}

# EC2 インスタンス（古い世代の例）
resource "aws_instance" "web" {
  ami           = "ami-0c55b159cbfafe1f0"
  instance_type = "t2.micro"
}
```

このコードの問題点：

- S3 バケット名が `mycompany-` で始まっていない（命名規則違反）
- EC2 インスタンスが t2 世代を使用（t3 への移行を推奨）

これらの問題をポリシーで自動検出します。

#### 最初のポリシーを作成

`policy/basic.rego` を作成します：

```rego
package main

import future.keywords.contains
import future.keywords.if

# t2 インスタンスは非推奨
deny contains msg if {
    # aws_instance リソースが存在するかチェック
    input.resource.aws_instance

    # インスタンス名を取得（"web" など）
    instance_name := [name | input.resource.aws_instance[name]][_]

    # リソースの詳細を取得
    resource := input.resource.aws_instance[instance_name][_]
    instance_type := resource.instance_type

    # 静的な値のみチェック（変数参照は除外）
    is_string(instance_type)
    startswith(instance_type, "t2.")

    msg := sprintf(
        "EC2 instance '%s' uses t2 generation. Migration to t3 is recommended",
        [instance_name]
    )
}

# S3 バケット名には会社プレフィックスが必要
deny contains msg if {
    # aws_s3_bucket リソースが存在するかチェック
    input.resource.aws_s3_bucket

    # バケット名を取得（"example" など）
    bucket_name := [name | input.resource.aws_s3_bucket[name]][_]

    # バケットの詳細を取得
    resource := input.resource.aws_s3_bucket[bucket_name][_]
    bucket := resource.bucket

    # 静的な値のみチェック
    is_string(bucket)
    not startswith(bucket, "mycompany-")

    msg := sprintf(
        "S3 bucket '%s' must start with 'mycompany-'",
        [bucket]
    )
}
```

ポリシーの解説:

1. `package main`: Conftest のデフォルトパッケージ
2. `import future.keywords.*`: モダンな Rego 構文を使用
3. `deny contains msg if { ... }`: ポリシー違反を定義（テスト失敗）
4. `sprintf()`: フォーマット済みエラーメッセージの生成

#### テスト実行

作成したポリシーでテストを実行します：

```bash
$ conftest test example.tf --parser hcl2
```

実行結果:
```
FAIL - example.tf - main - EC2 instance 'web' uses t2 generation. Migration to t3 is recommended
FAIL - example.tf - main - S3 bucket 'my-test-bucket' must start with 'mycompany-'

5 tests, 3 passed, 0 warnings, 2 failures, 0 exceptions
```

2つのポリシー違反を正しく検出しました。

オプション解説:
- `--parser hcl2`: HCL2 形式で Terraform ファイルをパース
- `--policy policy/`: ポリシーファイルのディレクトリ（デフォルトで `policy/` を参照）

#### コードを修正してみる

ポリシー違反を修正します：

```hcl
# 修正後: example.tf
resource "aws_s3_bucket" "example" {
  bucket = "mycompany-test-bucket"  # プレフィックスを追加
}

resource "aws_instance" "web" {
  ami           = "ami-0c55b159cbfafe1f0"
  instance_type = "t3.micro"  # t3 世代に変更
}
```

再度テストを実行：

```bash
$ conftest test example-fixed.tf --parser hcl2
```

実行結果:
```
5 tests, 5 passed, 0 warnings, 0 failures, 0 exceptions
```

すべてのポリシーをクリアしました。


### 1.4 Rego の基本構文

Rego は宣言的なポリシー言語です。ここでは、Conftest でよく使う構文をに解説します。

#### 1.4.1 変数とデータアクセス

基本的なデータアクセス

```rego
# 直接アクセス
input.resource.aws_instance["web"][0].instance_type

# 変数への代入
instance := input.resource.aws_instance["web"][0]
instance_type := instance.instance_type  # "t2.micro"
```

配列内包表記(リスト生成)

```rego
# すべてのインスタンス名を取得
instance_names := [name | input.resource.aws_instance[name]]
# 結果: ["web", "app", "db"]

# すべてのインスタンスタイプを取得
instance_types := [type |
    instance := input.resource.aws_instance[_][_]
    type := instance.instance_type
]
# 結果: ["t2.micro", "t3.small", "m5.large"]
```

アンダースコア `_` の使用

```rego
# 配列の各要素を取得（インデックスは不要）
instance := input.planned_values.root_module.resources[_]

# すべてのインスタンス名を取得
instance_name := [name | input.resource.aws_instance[name]][_]
```

`_` は「任意の値」を意味し、イテレーションに使用します。

#### 1.4.2 条件分岐と論理演算

AND 条件（改行で接続）:

```rego
deny contains msg if {
    instance := input.resource.aws_instance[_][_]
    instance.instance_type == "t2.micro"    # 条件1
    not instance.tags                       # 条件2 (AND)

    msg := "t2.micro でタグなしは禁止"
}
```

すべての条件が真の場合のみルールが適用されます。

OR 条件(セットで実現)

```rego
# 方法1 セットメンバーシップ
deny contains msg if {
    instance := input.resource.aws_instance[_][_]
    instance_type := instance.instance_type

    # t2.micro または t2.small の場合
    {"t2.micro", "t2.small"}[instance_type]

    msg := "t2 シリーズは非推奨"
}

# 方法2 複数のルール
deny contains msg if {
    instance := input.resource.aws_instance[_][_]
    instance.instance_type == "t2.micro"
    msg := "t2.micro は非推奨"
}

deny contains msg if {
    instance := input.resource.aws_instance[_][_]
    instance.instance_type == "t2.small"
    msg := "t2.small は非推奨"
}
```

NOT 条件:

```rego
deny contains msg if {
    bucket := input.resource.aws_s3_bucket[_][_]

    # タグが存在しない
    not bucket.tags

    msg := "S3 bucket requires tags"
}

deny contains msg if {
    bucket := input.resource.aws_s3_bucket[_][_]
    bucket.tags

    # Environment タグが存在しない
    not bucket.tags.Environment

    msg := "Environment tag is required"
}
```

#### 1.4.3 組み込み関数

文字列操作:

```rego
# 文字列の開始チェック
startswith("t2.micro", "t2.")      # true

# 文字列の包含チェック
contains("t2.micro", "micro")      # true

# 文字列の連結
concat("-", ["my", "bucket"])      # "my-bucket"

# 文字列の分割
split("10.0.0.0/16", "/")          # ["10.0.0.0", "16"]

# 大文字・小文字変換
upper("test")                      # "TEST"
lower("TEST")                      # "test"
```

型チェック:

```rego
is_string("hello")                 # true
is_number(42)                      # true
is_boolean(true)                   # true
is_array([1, 2, 3])                # true
is_object({"key": "value"})        # true
```

数値操作:

```rego
# 配列のカウント
count([1, 2, 3])                   # 3

# 数値の変換
to_number("42")                    # 42

# 最大値・最小値
max([1, 5, 3])                     # 5
min([1, 5, 3])                     # 1
```

セット操作:

```rego
# セット定義
allowed_types := {"t3.micro", "t3.small", "t3.medium"}

# メンバーシップチェック
allowed_types["t3.micro"]          # true
allowed_types["t2.micro"]          # false

# セットの結合
union({1, 2}, {2, 3})             # {1, 2, 3}

# セットの差集合
set1 := {1, 2, 3}
set2 := {2, 3, 4}
diff := set1 - set2                # {1}
```

#### 1.4.4 sprintf によるメッセージフォーマット

`sprintf` は、変数を含むエラーメッセージを生成する際に非常に便利です。

```rego
# 基本的な使用
msg := sprintf("EC2 instance '%s' is not allowed", ["web"])
# 結果: "EC2 instance 'web' is not allowed"

# 複数の変数
msg := sprintf(
    "EC2 instance '%s' instance type '%s' is not allowed",
    ["web", "t2.micro"]
)
# 結果: "EC2 instance 'web' instance type 't2.micro' is not allowed"

# 数値のフォーマット
msg := sprintf("Volume size is too large: %d GB", [1000])
# 結果: "Volume size is too large: 1000 GB"

# 複雑な例
msg := sprintf(
    "%s '%s' has issues:\n" +
    "  - Type: %s (Allowed: %v)\n" +
    "  - Region: %s",
    ["EC2", "web", "t2.micro", allowed_types, "us-west-2"]
)
```

フォーマット指定子:
- `%s`: 文字列
- `%d`: 整数
- `%v`: 任意の値（デバッグ用）

#### 1.4.5 ヘルパー関数の定義

繰り返し使用するロジックは、ヘルパー関数として定義できます。

```rego
# 特定タイプのリソースを取得するヘルパー
get_resources(resource_type) := resources if {
    resources := [resource |
        resource := input.planned_values.root_module.resources[_]
        resource.type == resource_type
    ]
}

# 使用例
deny contains msg if {
    instance := get_resources("aws_instance")[_]
    instance.values.instance_type == "t2.micro"

    msg := sprintf("EC2 instance '%s' uses t2.micro", [instance.name])
}

# 複数の条件を持つヘルパー
is_production(resource) if {
    resource.values.tags.Environment == "production"
}

# 使用例
deny contains msg if {
    instance := get_resources("aws_instance")[_]
    is_production(instance)
    instance.values.instance_type == "t2.micro"

    msg := "本番環境で t2.micro は禁止"
}
```

#### 1.4.6 object.get による安全なアクセス

存在しないキーにアクセスするとエラーになります。`object.get` を使うとデフォルト値を指定できます。

```rego
# 通常のアクセス（キーが存在しない場合はエラー）
env := instance.values.tags.Environment  # tags が存在しない場合エラー

# 安全なアクセス（デフォルト値を指定）
env := object.get(instance.values.tags, "Environment", "unknown")
# tags が存在しない場合: "unknown"

# 実践例
warn contains msg if {
    db := get_resources("aws_db_instance")[_]

    # backup_retention_period が設定されていない場合は 0
    period := object.get(db.values, "backup_retention_period", 0)
    period < 7

    msg := sprintf(
        "RDS '%s' のバックアップ保持期間が短すぎます: %d日",
        [db.name, period]
    )
}
```


#### 1.4.7 複合条件のチェック

複数の条件を組み合わせた実践的なポリシーの例

```rego
# 本番環境の EC2 は厳格にチェック
deny contains msg if {
    instance := get_resources("aws_instance")[_]

    # 本番環境かチェック
    instance.values.tags.Environment == "production"

    # いずれかの条件を満たさない場合
    violations := [v |
        # IMDSv2 が無効
        not instance.values.metadata_options
        v := "IMDSv2 が設定されていない"
    ]

    violations2 := [v |
        # ルートボリュームが暗号化されていない
        instance.values.root_block_device
        instance.values.root_block_device[_].encrypted == false
        v := "ルートボリュームが暗号化されていない"
    ]

    violations3 := [v |
        # t2 世代を使用
        startswith(instance.values.instance_type, "t2.")
        v := "t2 世代のインスタンスを使用"
    ]

    # すべての違反を結合
    all_violations := array.concat(
        violations,
        array.concat(violations2, violations3)
    )

    # 1つ以上の違反がある
    count(all_violations) > 0

    msg := sprintf(
        "Production EC2 instance '%s' has the following issues:\n%v",
        [instance.name, all_violations]
    )
}
```

実行結果の例:
```
FAIL - Production EC2 instance 'web' has the following issues:
["IMDSv2 is not configured", "Root volume is not encrypted"]
```

#### 1.4.8 パターン集

パターン1: すべてのリソースをチェック

```rego
deny contains msg if {
    # すべての aws_instance を取得
    instance_name := [name | input.resource.aws_instance[name]][_]
    instance := input.resource.aws_instance[instance_name][_]

    # 各インスタンスをチェック
    not instance.tags

    msg := sprintf("EC2 instance '%s' has no tags set", [instance_name])
}
```

パターン2: 特定の条件に一致するリソースのみチェック

```rego
deny contains msg if {
    instance := get_resources("aws_instance")[_]

    # 本番環境のリソースのみ
    instance.values.tags.Environment == "production"

    # 条件チェック
    instance.values.instance_type == "t2.micro"

    msg := sprintf("本番環境で t2.micro は禁止: '%s'", [instance.name])
}
```

パターン3: 関連リソースの存在チェック

```rego
# S3 バケットに暗号化設定があるかチェック
deny contains msg if {
    bucket := get_resources("aws_s3_bucket")[_]
    bucket_address := bucket.address

    # 暗号化設定が存在しない
    not has_encryption(bucket_address)

    msg := sprintf("S3 bucket '%s' requires encryption configuration", [bucket.name])
}

# ヘルパー関数: 暗号化設定の存在チェック
has_encryption(bucket_address) if {
    encryption := get_resources(
        "aws_s3_bucket_server_side_encryption_configuration"
    )[_]
    encryption.values.bucket == bucket_address
}
```

これで Rego の基本構文は理解できました。次は、実際の HCL ファイルテストに進みましょう。

---

## 2. tfplan.json をもとにするテスト

HCL ファイルのテストは高速ですが変数の値や動的な設定は評価できません。そこで `tfplan.json` を使ったテストを紹介します。

### 2.1 なぜ tfplan.json なのか？

#### HCL テストの限界

```hcl
variable "instance_type" {
  default = "t2.micro"
}

resource "aws_instance" "web" {
  instance_type = var.instance_type  # ← この値は HCL テストでは分からない
  count         = var.enable ? 1 : 0  # ← 動的な値も評価できない
}
```

#### tfplan.json の強み

`terraform show -json tfplan` で生成される tfplan.json には下記が含まれます。

- 変数展開後の実際の値
- count/for_each の結果
- モジュール展開後の状態
- 計算されたすべての値


### 2.2 tfplan.json の生成

```bash
terraform init
terraform plan -out=tfplan
terraform show -json tfplan > tfplan.json
```

### 2.3 tfplan.json の構造

```json
{
  "format_version": "1.2",
  "terraform_version": "1.6.0",
  "planned_values": {
    "root_module": {
      "resources": [
        {
          "address": "aws_instance.web",
          "type": "aws_instance",
          "name": "web",
          "values": {
            "ami": "ami-0c55b159cbfafe1f0",
            "instance_type": "t2.micro",
            "tags": {
              "Name": "web-server",
              "Environment": "production"
            }
          }
        }
      ]
    }
  }
}
```

アクセス方法

```rego
# リソースの取得
resource := input.planned_values.root_module.resources[_]
resource.type == "aws_instance"
resource.values.instance_type  # "t2.micro"
```

## 3 ポリシー例

### 3.1 インスタンスタイプ

```rego
package main

import future.keywords.contains
import future.keywords.if

# ヘルパー関数: リソース取得
get_resources(resource_type) := resources if {
    resources := [resource |
        resource := input.planned_values.root_module.resources[_]
        resource.type == resource_type
    ]
}

# EC2 インスタンスタイプのチェック
deny contains msg if {
    resource := get_resources("aws_instance")[_]

    # 実際の値をチェック（変数展開済み）
    resource.values.instance_type == "t2.micro"

    msg := sprintf(
        "EC2 instance '%s' must be t2.micro. Current: %s",
        [resource.name, resource.values.instance_type]
    )
}
```

### 3.2 セキュリティポリシー

#### S3 暗号化の必須化

```rego
# S3 バケットには暗号化が必須
deny contains msg if {
    bucket := get_resources("aws_s3_bucket")[_]
    bucket_address := bucket.address

    # 暗号化設定の有無を確認
    not has_encryption(bucket_address)

    msg := sprintf(
        "S3 bucket '%s' requires encryption configuration",
        [bucket.name]
    )
}

# 暗号化設定の存在確認
has_encryption(bucket_address) if {
    encryption := get_resources("aws_s3_bucket_server_side_encryption_configuration")[_]
    encryption.values.bucket == bucket_address
}
```

#### IMDSv2 の必須化

```rego
# EC2 インスタンスは IMDSv2 を必須とする
deny contains msg if {
    instance := get_resources("aws_instance")[_]

    # metadata_options が設定されていない
    not instance.values.metadata_options

    msg := sprintf(
        "EC2 instance '%s' は IMDSv2 を設定する必要があります",
        [instance.name]
    )
}

deny contains msg if {
    instance := get_resources("aws_instance")[_]
    instance.values.metadata_options

    # http_tokens が required でない
    instance.values.metadata_options[_].http_tokens != "required"

    msg := sprintf(
        "EC2 instance '%s' の IMDSv2 が有効ではありません",
        [instance.name]
    )
}
```

### 3.3 セキュリティグループの厳格なチェック

```rego
# 危険なポートの全公開を禁止
deny contains msg if {
    sg := get_resources("aws_security_group")[_]
    ingress := sg.values.ingress[_]

    # 0.0.0.0/0 からのアクセス
    cidr := ingress.cidr_blocks[_]
    cidr == "0.0.0.0/0"

    # 危険なポート
    dangerous_ports := {22, 3389, 3306, 5432}
    port := dangerous_ports[_]
    ingress.from_port <= port
    ingress.to_port >= port

    port_names := {
        22: "SSH",
        3389: "RDP",
        3306: "MySQL",
        5432: "PostgreSQL"
    }

    msg := sprintf(
        "Security group '%s' exposes %s (port %d) to 0.0.0.0/0",
        [sg.name, port_names[port], port]
    )
}
```

### 3.4 タグポリシー

```rego
# 必須タグの定義
required_tags := {"Environment", "Owner", "Project"}
allowed_environments := {"production", "staging", "development", "test"}

# タグ付け可能なリソースタイプ
taggable_resources := {
    "aws_instance",
    "aws_s3_bucket",
    "aws_db_instance",
    "aws_vpc"
}

# 必須タグの存在確認
deny contains msg if {
    resource_type := taggable_resources[_]
    resource := get_resources(resource_type)[_]

    # タグが設定されていない
    not resource.values.tags

    msg := sprintf(
        "%s '%s' has no tags set. Required tags: %v",
        [resource_type, resource.name, required_tags]
    )
}

# 特定のタグが欠落している場合
deny contains msg if {
    resource_type := taggable_resources[_]
    resource := get_resources(resource_type)[_]
    resource.values.tags

    # 必須タグが欠落
    required_tag := required_tags[_]
    not resource.values.tags[required_tag]

    msg := sprintf(
        "%s '%s' is missing required tag '%s'",
        [resource_type, resource.name, required_tag]
    )
}

# Environment タグの値検証
deny contains msg if {
    resource_type := taggable_resources[_]
    resource := get_resources(resource_type)[_]
    resource.values.tags.Environment

    env := resource.values.tags.Environment
    not allowed_environments[env]

    msg := sprintf(
        "%s '%s' Environment tag value '%s' is invalid. Allowed values: %v",
        [resource_type, resource.name, env, allowed_environments]
    )
}
```

### 3.5 コスト最適化ポリシー

```rego
# 許可されたインスタンスタイプ
allowed_instance_types := {
    "t3.micro", "t3.small", "t3.medium",
    "m5.large", "m5.xlarge"
}

# インスタンスタイプの制限
deny contains msg if {
    instance := get_resources("aws_instance")[_]
    instance_type := instance.values.instance_type

    not allowed_instance_types[instance_type]

    msg := sprintf(
        "EC2 instance '%s' instance type '%s' is not allowed. Allowed types: %v",
        [instance.name, instance_type, allowed_instance_types]
    )
}

# 開発環境で Multi-AZ は不要
warn contains msg if {
    db := get_resources("aws_db_instance")[_]
    db.values.tags.Environment == "development"
    db.values.multi_az == true

    msg := sprintf(
        "RDS instance '%s' has Multi-AZ enabled in development. Multi-AZ is usually unnecessary for development and wastes cost",
        [db.name]
    )
}
```

### 3.6 複雑なポリシー（リソース間の関係）

```rego
# EC2 が VPC 内にあることを確認
warn contains msg if {
    instance := get_resources("aws_instance")[_]

    # subnet_id が指定されていない
    not instance.values.subnet_id

    msg := sprintf(
        "EC2 instance '%s' が VPC 内に配置されていません",
        [instance.name]
    )
}

# 本番環境のリソースは適切な設定を持つべき
deny contains msg if {
    instance := get_resources("aws_instance")[_]
    instance.values.tags.Environment == "production"

    # セキュリティ設定のチェック
    violations := [v |
        not instance.values.metadata_options
        v := "IMDSv2 が設定されていない"
    ]

    violations2 := [v |
        instance.values.root_block_device
        instance.values.root_block_device[_].encrypted == false
        v := "ルートボリュームが暗号化されていない"
    ]

    all_violations := array.concat(violations, violations2)
    count(all_violations) > 0

    msg := sprintf(
        "Production EC2 instance '%s' has issues: %v",
        [instance.name, all_violations]
    )
}
```

### 3.7 実行例

```bash
# Terraform プラン生成
$ terraform init
$ AWS_PROFILE="" AWS_EC2_METADATA_DISABLED=true AWS_ACCESS_KEY_ID="test" AWS_SECRET_ACCESS_KEY="test" AWS_DEFAULT_REGION="us-west-2" terraform plan -out=tfplan
$ terraform show -json tfplan > tfplan.json

# Conftest 実行
$ conftest test tfplan.json --policy policy/

FAIL - tfplan.json - EC2 instance 'web' uses t2.micro. Current: t2.micro
FAIL - tfplan.json - S3 bucket 'data' requires encryption configuration
FAIL - tfplan.json - Security group 'web' exposes SSH (port 22) to 0.0.0.0/0

5 tests, 2 passed, 0 warnings, 3 failures, 0 exceptions
```

---

## 参考資料

### 公式ドキュメント
- [Conftest 公式サイト](https://www.conftest.dev/)
- [Open Policy Agent ドキュメント](https://www.openpolicyagent.org/docs/latest/terraform/)
- [Terraform 公式ドキュメント](https://developer.hashicorp.com/terraform)

### チュートリアル・ガイド
- [OPA & Terraform: The Definitive Guide (2025 Edition)](https://policyascode.dev/guides/opa-terraform-policy-guide/)
- [Beyond terraform plan: Policy as Code with OPA](https://www.vroble.com/2025/11/beyond-terraform-plan-how-policy-as.html)
- [Securing Terraform Pipelines with Conftest and OPA](https://dev.to/prince_of_pasta/securing-your-terraform-pipelines-with-conftest-regula-and-opa-4hkh)

### サンプルコード
- この記事のサンプルコード全体は [GitHub](https://github.com/your-repo/conftest-tutorial) で公開しています

---

## おわりに

IaC コード開発に対して Rego ポリシの制約を加えることで、より安全に開発が行える事が分かりました。特に複数名で開発を行う場合や、セキュリティ要件が社内的にある場合に人のレビューでは漏れる恐れがあるので、機械的に制約を加えられる事はメリット大きいと思っています。

また、Conftest と OPA は学習コストが低くすぐに始められるのもメリットが大きいです。。小さなポリシーから始めて、段階的に拡大していくのが良いのではないでしょうか。

