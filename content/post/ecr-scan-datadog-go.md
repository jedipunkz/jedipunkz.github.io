---
title: "ECR 脆弱性スキャン結果表示 CLI の開発と Datadog プロット"
date: 2022-04-30T13:56:56+09:00
Categories: ["infrastructure"]
draft: false
---
こんにちは。[jedipunkz🚀](https://twitter.com/jedipunkz) です。

引き続き Go を学習しています。前回の記事 [ECS コンテナにログインする CLI を Go 言語で作った話](http://localhost:1313/post/ecs-login-cli/) のまとめにも記したのですが Go のコードを書くアイデアとして下記をぼんやり考えていました。

- ECR 脆弱性スキャンのパッケージを開発
  - そのパッケージを利用して Datadog のカスタムメトリクスとして送信
  - 同様にそのパッケージを利用して ECR スキャンの CLI を作成

その紹介を軽くしたいと思います。

### 開発した ECR 脆弱性スキャンの Go パッケージ

開発したパッケージは https://github.com/jedipunkz/ecrscan になります。

下記のように Ecr 構造体を初期化します。

```go
	e := myecr.Ecr{}
	e.Repositories = [][]string{
		{"image-to-scan", "latest"},
	}
	e.Resion = "ap-northeast-1"
	finding, vulFindings, _ := e.ListFindings()
```

その後 `ListFindings()` メソッドでスキャンします。結果、`finding.FindingSeverityCounts` には下記の深刻度毎のイメージに含まれている脆弱性の数が入ります。

- INFORMATIONAL
- LOW
- MEDIUM
- HIGH
- CRITICAL
- UNDEFINED

また、`vulFindings` には含まれている脆弱性の

- CVE 名
- 深刻度レベル (INFORMATIONAL, LOW, MEDIUM, HIGH, CRITICAL, UNDEFINED)
- CVE URI
- 説明

が入ります。

### CLI の開発

このパッケージを利用して開発したのが https://github.com/jedipunkz/evs という CLI です。利用方法は下記のように `--image` でイメージとタグを指定、`--region` でリージョンを指定して実行するだけです。

結果、下記のように含まれている脆弱性の深刻度レベル毎のカウント数が一覧表示されます。

```shell
$ evs scan --image image-to-scan:latest --region ap-northeast-1
+----------------+--------+
| SEVERITY LEVEL | COUNTS |
+----------------+--------+
| MEDIUM         |      2 |
| LOW            |     12 |
| INFORMATIONAL  |      4 |
+----------------+--------+
```

また `list` サブコマンドを利用すると、下記のように CVE 名や深刻度、URI、説明の一覧が出力されます。

```shell
$ evs list --image testimage:latest --region ap-northeast-1
+------------------+---------------+----------------------------------------------------------------+---------------------------------+
|     CVE NAME     |   SEVERITY    |                              URI                               |           DESCRIPTION           |
+------------------+---------------+----------------------------------------------------------------+---------------------------------+
| CVE-2021-20305   | MEDIUM        | http://people.ubuntu.com/~ubuntu-security/cve/CVE-2021-20305   | A flaw was found in Nettle      |
|                  |               |                                                                | in versions before 3.7.2,       |
|                  |               |                                                                | where several Nettle signature  |
|                  |               |                                                                | verification functions          |
|                  |               |                                                                | (GOST DSA, EDDSA & ECDSA)       |

<snip>

| CVE-2020-14155   | INFORMATIONAL | http://people.ubuntu.com/~ubuntu-security/cve/CVE-2020-14155   | libpcre in PCRE before 8.44     |
|                  |               |                                                                | allows an integer overflow      |
|                  |               |                                                                | via a large number after a (?C  |
|                  |               |                                                                | substring.                      |
| CVE-2017-11164   | INFORMATIONAL | http://people.ubuntu.com/~ubuntu-security/cve/CVE-2017-11164   | In PCRE 8.41, the OP_KETRMAX    |
|                  |               |                                                                | feature in the match function   |
|                  |               |                                                                | in pcre_exec.c allows stack     |
|                  |               |                                                                | exhaustion (uncontrolled        |
|                  |               |                                                                | recursion) when processing a    |
|                  |               |                                                                | crafted regular expression.     |
+------------------+---------------+----------------------------------------------------------------+---------------------------------+
```

単純な CLI なのでもうひと工夫欲しいところですが、今のところアイデアが無いです...。

### ECR スキャン結果を Datadog カスタムメトリクスにサブミット

同様に紹介した Go パッケージを利用して複数のイメージの脆弱性スキャン結果を Datadog に送ることを検討していました。日々、開発者はアプリケーションのコンテナイメージを CI/CD の中でビルドしているのですがそのイメージのセキュリティ意識を持つという点において課題があると感じていたからです。元々、Slack に週次でイメージに含まれている脆弱性の一覧を出力していたのですが、ただ流れているだけで開発者がそれらについて深堀りして追う作業をする傾向はほとんどありませんでした。この課題に対して、脆弱性のカウント数の推移が Datadog ダッシュボードとして可視化されれば何かしらアクションを起こして下さるのでは？という仮説の元に開発してみた次第です。(結果はこれから分かると思います ...)

こちらは業務で開発したものなのでコードをお見せすることが出来ませんが、AWS Lambda 関数を用いて1時間に一度、複数のイメージの脆弱性スキャンを先程の Go パッケージで行い、Datadog のカスタムメトリクスにサブミットする事で、Datadog ダッシュボードをプロットしています。

※ イメージ名はマスクしています。

<img src="/pix/ecr-scan-datadog.png">

見ての通り、長いスパンで見ないと変化が見られません😷。 この Lambda で用いた Datadog API は下記に公式の情報があります。
https://docs.datadoghq.com/ja/api/latest/metrics/

### まとめ

CLI の方は前述したとおり、追加でサブコマンドを開発したいところですが、何かいいアイデアあるかなぁ...。思い浮かばない。また、Datadog ダッシュボードの方は誰か見てくれているかな...。不安。

仕事では今、GitHub の [Dependabot Alerts](https://docs.github.com/ja/code-security/dependabot/dependabot-alerts/about-dependabot-alerts), [Security Updates](https://docs.github.com/ja/code-security/dependabot/dependabot-security-updates/about-dependabot-security-updates), [ersion Updates](https://docs.github.com/ja/code-security/dependabot/dependabot-version-updates/about-dependabot-version-updates) 等導入したり、[GitHub CodeQL](https://docs.github.com/ja/code-security/code-scanning/automatically-scanning-your-code-for-vulnerabilities-and-errors/about-code-scanning-with-codeql) 検証したり、その他のセキュリティ対策ソフトウェアを検証したりと、色々頑張っています。また運用も回ってきて、良き。

また Go の方も引き続きアイデアが乏しいながらも何かしら積極的に開発していきたいところです。
