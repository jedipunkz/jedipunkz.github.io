---
title: "Sysdig + ECS Fargate でコンテナランタイムセキュリティ実践"
date: 2022-08-10T09:11:04+09:00
Categories: ["infrastructure"]
draft: true
---
こんにちは [@jedipunkz](https://twitter.com/jedipunkz) 🚀 です。

今、仕事で Sysdig の検証をしています。まだ導入できる目処は立っていないのですがある程度ノウハウ蓄積出来てきたので記事にしようかと思っています。

Sysdig は幾つかのサービスが存在するのですが今回検証したのは Sysdig Serverless Security と呼ばれるモノで ECS Fargate 上のコンテナランタイムセキュリティを実践することができるサービスです。

AWS のサービスにも脅威検知を行うことができるサービスが揃っているのはご存知と思います

| 対象 | 目的 | 技術・サービス |(
|---|---|---|
| AWS リソース | 驚異検知 | AWS GuardDuty |

また予防の観点で脆弱性診断が出来るサービスもありあす

| 対象 | 目的 | 技術・サービス |
|---|---|---|
| AWS リソース | セキュリティ診断 | AWS Trusted Advisor |
| ECS コンテナ | 脆弱性診断 | ECR Image Scan |
| EC2 上のソフトウェア | 脆弱性診断 | AWS Inspector |

## Sysdig とは

ここで気がつくと思うのですがコンテナ上の驚異検知を行うサービスが AWS には無いと思っています。 (2022/09 時点)

Sysdig Serverless Security は ECS Fargate コンテナ上の驚異検知を行うサービスです。ECS Fargate 利用時にコンテナ上の異常検知を行うサービスは他にも幾つかありますが、Sysdig は System Call を利用したコンテナランタイムセキュリティを実践して驚異検知・通知が行えるものにまります。



