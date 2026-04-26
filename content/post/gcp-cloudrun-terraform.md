---
title: "初学: Google Cloud の Cloud Run ベストプラクティス構成を組んで学ぶ"
description: "Cloud Run、Cloud Deploy、Cloud Build、Load Balancer、Cloud Armor を組み合わせた本番グレードの Google Cloud インフラを Terraform で実装する手順と設計のポイント"
date: 2026-04-25T00:00:00+09:00
Categories: ["infrastructure", "google cloud", "terraform"]
draft: false
---

[jedipunkz🚀](https://x.com/jedipunkz) です。

もともと自分は AWS ECS を使ってコンテナシステムを組むことが多かったのですが Google Cloud を扱う環境に変化したので Cloud Run をベースとした環境構築について調べてみました。今回作った環境は Cloud Run を利用する際に必須になってくる CI/CD パイプライン、WAF、Load Balancer を組み合わせています。

今回は下記のリポジトリに置いた Terraform コードをベースに、ベストプラクティスに沿った Cloud Run 本番構成の設計と実装のポイントを紹介します。

https://github.com/jedipunkz/gcp-playground/tree/main/cloudrun

## 概要

今回構築する構成の主な技術要素は次のとおりです。

- **Cloud Run**: ステージング・本番の 2 環境をサーバーレスで運用
- **Cloud Deploy**: ステージング → 本番への段階的デプロイ（手動承認ゲート付き）
- **Cloud Build**: GitHub リポジトリへの push をトリガーにしたビルドパイプライン
- **Cloud Load Balancing**: グローバル HTTPS ロードバランサーと HTTP → HTTPS リダイレクト
- **Cloud Armor**: OWASP WAF ルール + レートリミットによるエッジ防御
- **Artifact Registry**: Docker イメージのライフサイクル管理付きレジストリ
- **VPC / Subnet**: Cloud Run Direct VPC Egress 用のカスタムネットワーク
- **IAM**: Cloud Run / Cloud Build / Cloud Deploy のサービスアカウント分離

CI/CD の流れとしては、開発者が GitHub にコードを push すると Cloud Build がコンテナイメージをビルドして Artifact Registry に格納し、Cloud Deploy がステージング環境へ自動デプロイします。ステージングでの確認後、手動承認を経て本番環境へプロモートされます。本番の Cloud Run へのアクセスは Load Balancer 経由のみに制限し、Cloud Armor で WAF とレートリミットを適用します。

## 構成図・リソース関係図とその特徴

### 構成図

<img src="/pix/cloudrun-diagram.png" width="100%">

構成図から読み取れる主な設計のポイントは以下のとおりです。

**インターネット → Cloud Armor → Load Balancer → Cloud Run (本番)** という経路になっており、本番の Cloud Run は `INGRESS_TRAFFIC_INTERNAL_LOAD_BALANCER` に設定されているため、Load Balancer を経由しないリクエストは直接届きません。これにより Cloud Armor の WAF を必ず通過させることができます。

ステージング環境はすべての Ingress を許可しており、開発者が直接アクセスして動作確認できる構成です。

Cloud Run から外部への通信は **Direct VPC Egress** を利用しており、従来の Serverless VPC Connector と比べてレイテンシが低く、追加のコンピューティングコストがかかりません。

### Terraform リソース関係図

<img src="/pix/cloudrun-tf-resource-graph.png" width="100%">

リソース関係図を見ると、`google_cloud_run_v2_service`・`google_clouddeploy_delivery_pipeline`・`google_cloudbuild_trigger` という 3 つの主要リソースがそれぞれ独立したサービスアカウントを持ちつつ、Artifact Registry と VPC を共有していることがわかります。各コンポーネントの責務が明確に分離されており、IAM の最小権限原則が徹底されています。

## コード紹介

### Cloud Run (`cloudrun.tf`)

```hcl
resource "google_cloud_run_v2_service" "app" {
  name     = var.service_name
  location = var.region
  ingress  = "INGRESS_TRAFFIC_INTERNAL_LOAD_BALANCER"

  template {
    service_account = google_service_account.cloudrun.email

    vpc_access {
      network_interfaces {
        network    = google_compute_network.vpc.id
        subnetwork = google_compute_subnetwork.subnet.id
      }
      egress = "PRIVATE_RANGES_ONLY"
    }

    containers {
      image = "${local.image_prefix}:latest"

      resources {
        limits = {
          cpu    = var.cpu_limit
          memory = var.memory_limit
        }
      }

      startup_probe {
        http_get { path = "/healthz" }
      }
      liveness_probe {
        http_get { path = "/healthz" }
      }
    }

    scaling {
      min_instance_count = var.min_instances
      max_instance_count = var.max_instances
    }
  }

  lifecycle {
    ignore_changes = [template[0].containers[0].image]
  }
}
```

ここで注目すべきポイントがいくつかあります。

**`ingress = "INGRESS_TRAFFIC_INTERNAL_LOAD_BALANCER"`**: 本番サービスは Load Balancer 経由のトラフィックのみを受け付けます。インターネットから Cloud Run のエンドポイントへ直接アクセスすることができないため、Cloud Armor を必ず通過させることが保証されます。

**Direct VPC Egress**: `vpc_access` ブロックで `egress = "PRIVATE_RANGES_ONLY"` を指定し、VPC 内向けの通信のみ VPC 経由にしています。Serverless VPC Connector を使わないため、追加の VM インスタンスが不要でコストと管理オーバーヘッドが削減できます。

**ヘルスチェック**: `startup_probe` と `liveness_probe` の両方を `/healthz` エンドポイントに設定しています。起動時と稼働中の両方を監視することで、デプロイ時の問題と実行中の異常の両方を検出できます。

**`lifecycle { ignore_changes = [...image] }`**: コンテナイメージは Cloud Deploy が管理するため、Terraform が apply を実行しても image の変更を上書きしません。インフラ管理とデプロイ管理の責務を明確に分離するパターンです。

ステージング環境の Cloud Run は `ingress = "INGRESS_TRAFFIC_ALL"` で全トラフィックを受け付け、スケールは最大 3 インスタンスに制限しています。

### Cloud Deploy + Cloud Build (`cicd.tf`)

```hcl
resource "google_clouddeploy_delivery_pipeline" "pipeline" {
  name     = var.service_name
  location = var.region

  serial_pipeline {
    stages {
      target_id = google_clouddeploy_target.staging.name
      profiles   = ["staging"]
    }
    stages {
      target_id = google_clouddeploy_target.prod.name
      profiles   = ["prod"]
    }
  }
}

resource "google_clouddeploy_target" "staging" {
  name     = "${var.service_name}-staging"
  location = var.region

  run {
    location = "projects/${var.project_id}/locations/${var.region}"
  }

  execution_configs {
    usages          = ["RENDER", "DEPLOY"]
    service_account = google_service_account.clouddeploy.email
  }
}

resource "google_clouddeploy_target" "prod" {
  name              = "${var.service_name}-prod"
  location          = var.region
  require_approval  = true

  run {
    location = "projects/${var.project_id}/locations/${var.region}"
  }

  execution_configs {
    usages          = ["RENDER", "DEPLOY"]
    service_account = google_service_account.clouddeploy.email
  }
}
```

Cloud Deploy のパイプラインは `serial_pipeline` で staging → prod の順番に直列実行します。本番ターゲットには `require_approval = true` を設定しており、Cloud Console または gcloud コマンドで明示的に承認しないと本番へのデプロイが進みません。

Cloud Build トリガーは指定した GitHub ブランチへの push を検知してビルドを開始し、Artifact Registry へイメージを push した後に Cloud Deploy のリリースを作成します。`substitutions` ブロックで region や Artifact Registry の URL、パイプライン名を Terraform 変数から注入しているため、環境ごとの設定変更も Terraform 側だけで完結します。

### Load Balancer (`loadbalancer.tf`)

```hcl
resource "google_compute_backend_service" "backend" {
  name                  = "${var.service_name}-backend"
  protocol              = "HTTPS"
  security_policy       = google_compute_security_policy.armor.id

  backend {
    group = google_compute_region_network_endpoint_group.neg.id
  }
}

resource "google_compute_region_network_endpoint_group" "neg" {
  name                  = "${var.service_name}-neg"
  network_endpoint_type = "SERVERLESS"
  region                = var.region

  cloud_run {
    service = google_cloud_run_v2_service.app.name
  }
}
```

Load Balancer の構成は次の流れになっています。

```
HTTP (port 80) → HTTP Proxy → URL Map (redirect) → HTTPS
HTTPS (port 443) → HTTPS Proxy → URL Map → Backend Service → Serverless NEG → Cloud Run
```

**Serverless NEG** (Network Endpoint Group) を使って Load Balancer と Cloud Run を接続します。これにより Cloud Run のエンドポイントを直接インターネットに公開せずにグローバル Load Balancer の配下に置くことができます。

**HTTP → HTTPS リダイレクト** は URL Map のリダイレクト設定で実装しており、クエリパラメータも保持したまま 301 リダイレクトを返します。

**Google マネージド SSL 証明書** を使用しているため、証明書の更新管理が不要です。

### Cloud Armor / WAF (`cloudarmor.tf`)

```hcl
resource "google_compute_security_policy" "armor" {
  name = "${var.service_name}-armor"

  # XSS 対策
  rule {
    priority = 1000
    action   = "deny(403)"
    match {
      expr {
        expression = "evaluatePreconfiguredExpr('xss-stable')"
      }
    }
  }

  # SQLi 対策
  rule {
    priority = 1001
    action   = "deny(403)"
    match {
      expr {
        expression = "evaluatePreconfiguredExpr('sqli-stable')"
      }
    }
  }

  # RCE 対策
  rule {
    priority = 1002
    action   = "deny(403)"
    match {
      expr {
        expression = "evaluatePreconfiguredExpr('rce-stable')"
      }
    }
  }

  # LFI 対策
  rule {
    priority = 1003
    action   = "deny(403)"
    match {
      expr {
        expression = "evaluatePreconfiguredExpr('lfi-stable')"
      }
    }
  }

  # レートリミット
  rule {
    priority = 2000
    action   = "throttle"
    match {
      versioned_expr = "SRC_IPS_V1"
      config {
        src_ip_ranges = ["*"]
      }
    }
    rate_limit_options {
      conform_action = "allow"
      exceed_action  = "deny(429)"
      enforce_on_key = "IP"
      rate_limit_threshold {
        count        = var.cloud_armor_rate_limit_count
        interval_sec = var.cloud_armor_rate_limit_interval_sec
      }
    }
  }

  # デフォルト許可
  rule {
    priority = 2147483647
    action   = "allow"
    match {
      versioned_expr = "SRC_IPS_V1"
      config {
        src_ip_ranges = ["*"]
      }
    }
  }
}
```

Cloud Armor では `evaluatePreconfiguredExpr()` を使って OWASP Top 10 に対応した WAF ルールを適用しています。今回の設定では次の 4 つを有効化しています。

- **XSS (Cross-Site Scripting)**: `xss-stable`
- **SQL インジェクション**: `sqli-stable`
- **Remote Code Execution**: `rce-stable`
- **Local File Inclusion**: `lfi-stable`

`-stable` サフィックスのルールセットは Google が安定版として管理しているものなので、誤検知が少なく本番導入しやすいです。

レートリミットは IP アドレスごとに `cloud_armor_rate_limit_count` リクエスト / `cloud_armor_rate_limit_interval_sec` 秒の閾値を設けており、超過した場合は 429 を返します。デフォルト値は 100 リクエスト / 60 秒です。これらの値は variables.tf から Terraform 変数として注入しているため、環境に応じてチューニングしやすくなっています。

Cloud Armor のセキュリティポリシーは Backend Service の `security_policy` に紐付けることで、Load Balancer のエッジで評価されます。

## まとめ

所感としては AWS ECS ではオートスケールやタスク定義等のリソース管理が必要ですが Cloud Run はそれが無く良さそうに感じました。また調べた感じ、ゼロスケール(リクエストがない場合はコンピュートリソースがゼロになる)やスケールの高速さがメリットのように感じました。このスケールの高速さについては別途調べてみたいなと思いました。

また、今回紹介した構成は、Cloud Run を本番で使う際に必要になる要素をひと通り揃えたものになっています。特に意識したベストプラクティスをまとめると次のとおりです。

| 項目 | 設計の選択 |
|---|---|
| Cloud Run の Ingress 制限 | 本番は LB 経由のみ、ステージングは全許可 |
| VPC 接続 | Serverless VPC Connector ではなく Direct VPC Egress |
| デプロイ管理 | `lifecycle ignore_changes` で Terraform と Cloud Deploy の責務分離 |
| 本番承認フロー | Cloud Deploy の `require_approval = true` |
| WAF | Cloud Armor + OWASP stable ルールセット |
| レートリミット | IP 単位の throttle ルール |
| イメージ管理 | Artifact Registry のクリーンアップポリシー（最新 10 件保持・30 日超は削除） |
| IAM | Cloud Run / Cloud Build / Cloud Deploy のサービスアカウント分離、最小権限 |
| SSL | Google マネージド証明書で更新管理レス |

Terraform コードは下記に公開しています。実際に試してみる際の参考にしてください。
https://github.com/jedipunkz/gcp-playground/tree/main/cloudrun

