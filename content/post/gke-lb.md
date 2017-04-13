+++
author = ""
categories = ["infrastructure"]
date = "2017-04-13T14:53:37+09:00"
description = "GCP ロードバランサと GKE クラスタを Terraform を使って構築自動化"
featured = ""
featuredalt = ""
featuredpath = ""
linktitle = ""
title = "GCP ロードバランサと GKE クラスタを Terraform を使って構築する"

+++

こんにちは。<a href="https://twitter.com/jedipunkz">@jedipunkz</a> です。

少し前まで Google Cloud Platform (GCP) を使っていたのですが、今回はその時に得たノウハウを記事にしようと思います。

Google Container Engine (GKE) とロードバランサを組み合わせてサービスを立ち上げていました。手動でブラウザ上からポチポチして構築すると人的ミスや情報共有という観点でマズイと思ったので Terraform を使って GCP の各リソースを構築するよう仕掛けたのですが、まだまだ Terraform を使って GCP インフラを構築されている方が少ないため情報が無く情報収集や検証に時間が掛かりました。よって今回はまだネット上に情報が少ない GKE とロードバランサの構築を Terraform を使って行う方法を共有します。

構築のシナリオ
----

構築するにあたって2パターンの構築の流れがあると思います。

* 1) GKE クラスタとロードバランサを同時に構築する
* 2) GKE クラスタを予め構築しそのクラスタ向けにロードバランサを構築する

両方の方法を記していきます。

1) GKE クラスタとロードバランサを同時に構築する
----

GKE クラスタとロードバランサを同時に作る方法です。

早速ですが下記に terraform ファイルを記しました。それぞれのシンタックスの意味については Terraform の公式ドキュメントをご覧になってください。

  公式ドキュメント : https://www.terraform.io/docs/providers/google/

ここで特筆すべき点としては下記が挙げられます。

### ロードバランサに紐付けるバックエンドの ID 取得のため "${replace(element..." 的なことをしている

ロードバランサのバックエンドサービスに対して GKE クラスタを作成した際に自動で作成されるインスタンスグループの URI を紐付ける必要があります。ユーザとしては URI ではなく "インスタンスグループ名" であると扱いやすいのですが、URI が必要になります。この情報は下記のサイトを参考にさせていただきました。

* 参考サイト : GKEでkubernetesのnodesをロードバランサーのバックエンドとして使いたいとき with terraform
* URL : http://qiita.com/techeten/items/b2ec5f11f4a70dd21d70

### ロードバランサ一つ作るために 6 個ものインフラリソースを作っている

一つのロードバランサを作るために6つのインフラリソースが必要になるというのも驚きですが公式ドキュメントを読むとなかなかその感覚がつかめませんでした。それぞれの簡単な意味を下記に記しておきます。

* google_compute_http_health_check : ヘルスチェック
* google_compute_backend_service : バックエンドサービス
* google_compute_url_map : ロードバランサ名となるリソース
* google_compute_target_http_proxy : プロキシ
* google_compute_global_address : グローバル IP アドレス
* google_compute_global_forwarding_rule : ポートマッピングによるフォワーディングルール

それでは実際の Terraform コードです

```
# 共通変数
variable "credentials" {default = "/path/to/credentials.json"}
variable "project" {default = "test01"}
variable "region" {default = "asia-northeast"}
variable "zone" {default = "asia-northeast1-b"}
# GKE クラスタ用の変数
variable "gke_name" {default = "gke-terraform-test"}
variable "machine_type" {default = "n1-standard-1"}
variable "disk_size_gb" {default = "50"}
variable "node_count" {default = "2"}
variable "network" {default = "default"}
variable "subnetwork" {default = "default"}
variable "cluster_ipv4_cidr" {default = "10.0.10.0/14"}
variable "username" {default = "username"}
variable "password" {default = "password"}
# ロードバランサ用の変数
variable "lb_name" {default = "lb-terraform-test"}
variable "healthcheck_name" {default = "healthcheck-terraform-test"}
variable "healthcheck_host" {default = "test.example.com"}
variable "healthcheck_port" {default = "30300"}
variable "backend_name" {default = "backend-terraform-test"}
variable "http_proxy_name" {default = "terraform-proxy"}
variable "global_address_name" {default = "terraform-global-address"}
variable "global_forwarding_rule_name" {default = "terraform-global-forwarding-rule"}
variable "global_forwarding_rule_port" {default ="80"}
variable "port_name" {default = "port-test"}
variable "enable_cdn" {default = false}

provider "google" {
  credentials = "${file("${var.credentials}")}"
  project     = "${var.project}"
  region      = "${var.region}"
}

resource "google_container_cluster" "cluster-terraform" {
  name                = "${var.gke_name}"
  zone                = "${var.zone}"
  initial_node_count  = "${var.node_count}"
  network             = "${var.network}"
  subnetwork          = "${var.subnetwork}"
  cluster_ipv4_cidr   = "${var.cluster_ipv4_cidr}"

  master_auth {
    username = "${var.username}"
    password = "${var.password}"
  }

  node_config {
	machine_type = "${var.machine_type}"
	disk_size_gb = "${var.disk_size_gb}"
    oauth_scopes = [
      "https://www.googleapis.com/auth/compute",
      "https://www.googleapis.com/auth/devstorage.read_only",
      "https://www.googleapis.com/auth/logging.write",
      "https://www.googleapis.com/auth/monitoring"
    ]
  }
  addons_config {
    http_load_balancing {
      disabled = true
    }
    horizontal_pod_autoscaling {
      disabled = true
    }
  }
}

resource "google_compute_http_health_check" "healthcheck-terraform" {
  name                = "${var.healthcheck_name}"
  project             = "${var.project}"
  request_path        = "/"
  host                = "${var.healthcheck_host}"
  check_interval_sec  = 5
  timeout_sec         = 5
  port                = "${var.healthcheck_port}"
}
resource "google_compute_backend_service" "backend-terraform" {
  name          = "${var.backend_name}"

  port_name     = "${var.port_name}"
  protocol      = "HTTP"
  timeout_sec   = 10
  enable_cdn    = "${var.enable_cdn}"
  region        = "${var.region}"
  project       = "${var.project}"
  backend {
    group = "${replace(element(google_container_cluster.cluster-terraform.instance_group_urls, 1), "Manager","")}"
  }
  health_checks = ["${google_compute_http_health_check.healthcheck-terraform.self_link}"]
}
resource "google_compute_url_map" "lb-terraform" {
  name            = "${var.lb_name}"
  default_service = "${google_compute_backend_service.backend-terraform.self_link}"
  project         = "${var.project}"
}
resource "google_compute_target_http_proxy" "http_proxy-terraform" {
  name        = "${var.http_proxy_name}"
  url_map     = "${google_compute_url_map.lb-terraform.self_link}"
}
resource "google_compute_global_address" "ip-terraform" {
  name    = "${var.global_address_name}"
  project = "${var.project}"
}
resource "google_compute_global_forwarding_rule" "forwarding_rule-terraform" {
  name        = "${var.global_forwarding_rule_name}"
  target      = "${google_compute_target_http_proxy.http_proxy-terraform.self_link}"
  ip_address  = "${google_compute_global_address.ip-terraform.address}"
  port_range  = "${var.global_forwarding_rule_port}"
  project     = "${var.project}"
}
```

2) GKE クラスタを予め構築しそのクラスタ向けにロードバランサを構築する
----

次に GKE クラスタとロードバランサを別々のタイミングに構築する方法です。
実際には GKE クラスタの上には多数のコンテナが起動されるのですでにクラスタが存在する状態でロードバランサを別サービスのために作成したいというケースが一般的なように思います。

### GKE クラスタのインスタンスグループ URI を取得し設定

既存 GKE クラスタを用いる場合、インスタンスグループ URI がいずれにせよ必要になります。
インスタンスグループ URI を取得するには gcloud CLI を使って下記のように知ることができます。

```shell
$ gcloud compute instance-groups managed describe | grep -rin URI
```

ここで得たインスタンスグループ URI は下記のように variable "backend_group" に記します。

### Port マッピングを手動で設定

ここは残念なのですが 2017/04 現在、Port マッピングの設定を WebUI 上から行う必要があります。UI から GKE クラスタのインスタンスグループを選択し、Port マッピングの設定を行い名前を記します。ここでは "port-test" として作成したとし説明します。

### Terraform のコードを記述

ここでロードバランサ単独で構築する際の Terraform コードを見てみます。

```
variable "credentials" {default = "/path/to/credentials.json"}
variable "project" {default = "test01"}
variable "region" {default = "asia-northeast1"}
variable "lb_name" {default = "lb-terraform-test"}
variable "healthcheck_name" {default = "healthcheck-terraform-test"}
variable "healthcheck_host" {default = "test.example.com"}
variable "healthcheck_port" {default = "30300"}
variable "backend_name" {default = "backend-terraform-test"}
variable "backend_group" {default = "https://www.googleapis.com/compute/v1/projects/test01/zones/asia-northeast1-b/instanceGroups/gke-gke-terraform-test-default-pool-c001020e-grp"}
variable "http_proxy_name" {default = "terraform-proxy"}
variable "global_address_name" {default = "terraform-global-address"}
variable "global_forwarding_rule_name" {default = "terraform-global-forwarding-rule"}
variable "global_forwarding_rule_port" {default ="80"}
variable "port_name" {default = "port-test"}
variable "enable_cdn" {default = false}

provider "google" {
  credentials = "${file("${var.credentials}")}"
  project     = "${var.project}"
  region      = "${var.region}"
}
resource "google_compute_http_health_check" "healthcheck-terraform-test" {
  name                = "${var.healthcheck_name}"
  project             = "${var.project}"
  request_path        = "/"
  host                = "${var.healthcheck_host}"
  check_interval_sec  = 5
  timeout_sec         = 5
  port                = "${var.healthcheck_port}"
}
resource "google_compute_backend_service" "backend-terraform-test" {
  name          = "${var.backend_name}"
  port_name     = "${var.port_name}"
  protocol      = "HTTP"
  timeout_sec   = 10
  enable_cdn    = "${var.enable_cdn}"
  region        = "${var.region}"
  project       = "${var.project}"
  backend {
    group = "${var.backend_group}"
  }
  health_checks = ["${google_compute_http_health_check.healthcheck-terraform-test.self_link}"]
}
resource "google_compute_url_map" "lb-terraform-test" {
  name            = "${var.lb_name}"
  default_service = "${google_compute_backend_service.backend-terraform-test.self_link}"
  project         = "${var.project}"
}
resource "google_compute_target_http_proxy" "http_proxy-terraform-test" {
  name        = "${var.http_proxy_name}"
  url_map     = "${google_compute_url_map.lb-terraform-test.self_link}"
}
resource "google_compute_global_address" "ip-terraform-test" {
  name    = "${var.global_address_name}"
  project = "${var.project}"
}
resource "google_compute_global_forwarding_rule" "forwarding_rule-terraform-test" {
  name        = "${var.global_forwarding_rule_name}"
  target      = "${google_compute_target_http_proxy.http_proxy-terraform-test.self_link}"
  ip_address  = "${google_compute_global_address.ip-terraform-test.address}"
  port_range  = "${var.global_forwarding_rule_port}"
  project     = "${var.project}"
```

まとめ
----

GCP のロードバランサが特徴的な構築方法が必要になることが分かったと思います。将来的に URI で記す箇所を名前で記せれば構築がもっと簡単になると思いますので GCP 側の API バージョンアップを期待します。また今回は記しませんでしたが SSL (HTTPS) 証明書をロードバランサに紐付けることも Terraform を使えば容易に出来ます。試してみてください。一旦 Terraform 化すればパラメータを変更するだけで各ロードバランサが一発で構築できるので自動化は是非しておきたいところです。私は以前、この構築を Terraform + Hubot により ChatOps 化していました。作業の見える化と、メンバ間のコードレビューが可能になるからです。
