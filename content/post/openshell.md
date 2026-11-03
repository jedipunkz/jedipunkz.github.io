---
title: "NVIDIA OpenShell で AI エージェントを閉じ込める仕組みを動かして理解する"
description: "NVIDIA が公開した AI エージェント向けランタイム OpenShell を macOS + Docker Desktop で動かし、default deny、L7 制御、credential placeholder、窃取スクリプトの模擬、policy prover による boundary check をサンプル環境で確認しました"
date: 2026-11-03T13:40:00+09:00
tags: ["OpenShell", "AI Agent", "Sandbox", "Security"]
categories: ["AI", "SRE", "Security"]
draft: false
---
こんにちは。[ジェダイパンくず🍞](https://x.com/jedipunkz) です。

以前の記事 [自作 Go ツールに導入したガードレール策](/post/fuzz-fish-guardrails/) や [Google ADK Go 2.x の Dynamic Workflow とその為のガードレール](/post/adk-go-dynamic-loop/) では、AI エージェントに作業させるときのガードレールをコードやワークフローの側で考えていました。一方で最近は [LiteLLM 1.107.0 の PyPI パッケージ侵害](https://safedep.io/litellm-pypi-compromise-credential-stealer-backdoor/) や、[Cursor Marketplace で配布された Claude Code 拡張にバックドアが仕込まれた件](https://phorion.io/blog/offical-claude-code-vsx-compromise/) など、エージェントが動く開発環境そのものが狙われる事件が続いています。

そんな中で、NVIDIA の [OpenShell](https://github.com/NVIDIA/OpenShell) が 0.1.x で安定したリリースサイクルに入り、Hacker News でも話題になっていました。「自律 AI エージェントのための安全でプライベートなランタイム」をうたうもので、エージェントが触れるファイル・ネットワーク・API をポリシーで宣言し、カーネルレベルで強制します。README を読むだけでは実際にどこまで止まるのかが分からなかったので、サンプル環境を作って手を動かしてみました。

コードは下記に置いてあります。

https://github.com/jedipunkz/openshell-playground

検証したバージョンは OpenShell v0.1.6、環境は macOS (Apple Silicon) + Docker Desktop です。

## 結論

| 試したこと | 結果 |
|---|---|
| ポリシー無しで外へ通信 | TCP も DNS もすべて拒否される |
| GitHub API を GET のみ許可 | GET は通り、POST は L7 で 403 になる。ルール追加は再起動不要 |
| credential を provider 経由で渡す | エージェントには placeholder しか見えず、紐付けた宛先にだけ本物の値が送られる |
| 窃取スクリプトの模擬 | 外部送信・許可ホストへの POST・別バイナリからの通信・metadata 参照・許可外パスへの読み書きは止まる。書き込み可能な workspace への永続化は止まらない |
| policy prover | 上限ポリシーを超える変更を反例付きで検出できる。CI に組み込める |

「エージェントが何を持ち出せて、どこに送れるか」をホスト・メソッド・バイナリ単位で絞り込め、その判断がすべてログに残るのが OpenShell の価値だと感じました。逆に、許可した範囲の中で何が起きるかまでは面倒を見てくれないので、workspace の扱いは別途考える必要があります。

## アーキテクチャ

OpenShell は gateway、supervisor、sandbox の 3 つで構成されます。

```mermaid
flowchart LR
  CLI[openshell CLI] --> GW[gateway<br/>制御プレーン]
  GW <-- policy / credential / log --> SV[supervisor<br/>信頼される側]
  subgraph boundary[sandbox boundary]
    SB[sandbox] --> AG[agent]
  end
  SV <-- Sandbox Protocol<br/>mTLS + JWT --> SB
  SV --> NET((Internet))
```

| コンポーネント | 役割 |
|---|---|
| gateway | sandbox のライフサイクル管理、ポリシーと provider (credential) の保持、認可 |
| supervisor | ポリシー判定、credential の付与、DNS 解決、許可された接続の中継 |
| sandbox | エージェントと同じ側にいて、エージェントのプロセスを管理する。判定はしない |

ポイントは、エージェントと同じ側にいる sandbox が何も判断せず、盗まれて困るもの (gateway の署名鍵、provider の credential など) を持たないことです。sandbox はエージェントの TCP 接続と DNS クエリを seccomp user notification で横取りし、`/proc` から呼び出し元のバイナリを特定して supervisor に渡します。supervisor がポリシーを見て許可すれば、supervisor 自身が本当の接続を張って中継します。ファイルアクセスは Landlock で制限されます。

Docker ランタイムの場合、エージェントが動くコンテナはネットワークが無効 (`network=none`) で、supervisor との Unix socket だけが外への経路になります。ポリシーを迂回して直接外へ出る経路そのものが無い、という作りです。

## サンプル環境の構成

| パス | 内容 |
|---|---|
| `Dockerfile` | sandbox 用イメージ。デフォルトイメージに curl と python3 を足しただけ |
| `lib.sh` | sandbox の作成、`sandbox exec` での実行、ログからポリシー判定だけを抜き出すヘルパ |
| `policies/` | sandbox 用ポリシーと、prover 用の boundary / candidate |
| `profiles/echo.yaml` | シナリオ 03 用の provider profile |
| `scenarios/` | 各シナリオのスクリプト。sandbox を作って試し、終了時に削除する |
| `.github/workflows/prover.yml` | policy の変更を prover で検査する CI |

### インストールと Docker Desktop での注意点

公式の install.sh で入れます。macOS では NVIDIA の Homebrew tap が作られ、gateway が brew services として `https://localhost:17670` で起動し、CLI への登録まで行われます。

```shell
curl -LsSf https://raw.githubusercontent.com/NVIDIA/OpenShell/main/install.sh | sh
```

ここで 2 点ハマりました。

1 点目は homebrew-core にも `openshell` formula があることです。こちらは gateway が telemetry 無しでビルドされている一方、service 定義も TLS 証明書の生成も無いため、そのままでは gateway を起動できませんでした。公式の手順通り install.sh を使うのが無難です。なお install.sh 版は匿名 telemetry がデフォルトで有効です。無効化は gateway の環境変数 `OPENSHELL_TELEMETRY_ENABLED=false` で行い、Homebrew の service は起動時に `~/.config/openshell/gateway.env` を読み込むので、そこに書いておくのが手軽です。

2 点目は sandbox の作成が `ControlSupervisorStartFailed` で失敗したことです。gateway のログを見ると次のようになっていました。

```text
Selected Docker supervisor networking ... network_mode=Host endpoint=https://127.0.0.1:17670
```

Docker driver はデフォルトで supervisor コンテナを host network で動かし、`127.0.0.1` の gateway へ接続しにいきます。しかし Docker Desktop の host network は Linux VM 側のものなので、macOS 側の loopback で待っている gateway には届きません。bridge mode に切り替えると、supervisor は `host.docker.internal` 経由で接続するようになり解決しました。

```toml
# $(brew --prefix)/var/openshell/gateway.toml
[openshell.drivers.docker]
supervisor_network_mode = "bridge"
```

```shell
brew services restart openshell
```

もう 1 つ、デフォルトの sandbox イメージ (`nvcr.io/nvidia/base/ubuntu:24.04`) には curl が入っていません。検証用に curl と python3 を足したイメージを作り、`--from` で指定しています。

```dockerfile
FROM nvcr.io/nvidia/base/ubuntu:24.04@sha256:d9461f428eea54e553add3a5158a0f245c6e1ea73efc59fff8e98e3d4a38e378

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl python3 \
    && rm -rf /var/lib/apt/lists/*
```

各シナリオは次のヘルパを使っています。`sandbox create --detach -- sleep infinity` で待機させておき、`sandbox exec` でコマンドを流し込みます。

```bash
sbx() { openshell sandbox exec -n "$SANDBOX" --no-tty --timeout 30 -- sh -c "$*" 2>&1; }

create_sandbox() {
  local name=$1; shift
  openshell sandbox create --name "$name" --from "$IMAGE" --no-auto-providers --no-tty --detach "$@" -- sleep infinity
  for _ in $(seq 1 30); do
    openshell sandbox exec -n "$name" --no-tty -- true >/dev/null 2>&1 && return 0
    sleep 2
  done
  echo "sandbox $name did not become ready" >&2
  return 1
}
```

## シナリオ 01: default deny

ポリシーを指定せずに sandbox を作ると、ネットワークルールを 1 つも持たないデフォルトポリシーが適用されます。

```text
▸ curl https://api.github.com/zen (expect: denied)
curl: (7) Failed to connect to api.github.com port 443 after 1 ms: Couldn't connect to server
▸ DNS lookup (expect: denied)
198.18.0.3      example.com
```

curl は接続できずに失敗します。面白いのは DNS で、`getent` は `198.18.0.3` というベンチマーク用アドレス帯の値を返しました。名前解決自体は supervisor が代わりに応答していて、実際のアドレスは渡していないようです。ログには判定結果がすべて残ります。

```text
NET:REFUSE [MED] DENIED api.github.com [reason:policy_dns_ineligible]
NET:OPEN [MED] DENIED /usr/bin/curl(0) -> api.github.com:443 [reason:transparent_tcp_policy_denied]
```

ログは OCSF (Open Cybersecurity Schema Framework) 形式で、どのバイナリがどこへ接続しようとして、なぜ拒否されたかが分かります。なお公式 example (`examples/sandbox-policy-quickstart`) の README では、拒否時に `Received HTTP code 403 from proxy after CONNECT` が返ると書かれています。今回の環境では sandbox 内に `HTTPS_PROXY` などの proxy 環境変数は無く、curl は proxy を経由せずに直接接続しようとし、それが透過的に横取りされて拒否されました (`transparent_tcp_policy_denied`)。docs の Observability ページに載っているログ例もこの形式なので、example の README の方が古いのだと思います。

## シナリオ 02: L7 で GET だけを許可する

curl に GitHub API への読み取りだけを許可するポリシーです。

```yaml
network_policies:
  github_api:
    name: github-api-readonly
    endpoints:
      - host: api.github.com
        port: 443
        protocol: rest      # TLS を終端して HTTP リクエストを検査する
        enforcement: enforce
        access: read-only   # GET, HEAD, OPTIONS のみ
    binaries:
      - { path: /usr/bin/curl }
```

`protocol: rest` を指定すると supervisor が TLS を終端し、HTTP のメソッドとパスまで検査します。

```text
▸ GET https://api.github.com/zen (expect: allowed)
Half measures are as bad as nothing at all.
▸ POST https://api.github.com/user/repos (expect: 403 policy_denied)
{"error":"policy_denied","policy":"github_api","rule":"POST /user/repos","detail":"POST /user/repos not permitted by policy","layer":"l7",...}
```

接続先としては許可されている `api.github.com` でも、POST は L7 で 403 になります。レスポンスの JSON にはどのルールが足りないか (`rule_missing`) が入っていて、エージェントが「何が足りないか」を機械的に読み取れるようになっています。

次に、ルールが無い npm registry へのアクセスが拒否されることを確認してから、sandbox を動かしたままルールを追加します。

```shell
openshell policy update "$SANDBOX" \
  --rule-name npm \
  --binary /usr/bin/curl \
  --add-endpoint registry.npmjs.org:443:read-only:rest:enforce \
  --wait
```

```text
✓ Policy version 2 submitted (hash: 146a3829ebec)
✓ Policy version 2 loaded (active version: 2)
▸ GET https://registry.npmjs.org/ (expect: 200)
200
```

ネットワークルールは再起動なしで反映されます。ファイルシステムとプロセスの設定は sandbox 起動時に固定されるので、変えられるのはネットワーク側だけです。

## シナリオ 03: credential placeholder

OpenShell では API key などの credential を provider として gateway に登録し、sandbox に紐付けます。このときエージェントには本物の値ではなく placeholder が渡り、許可された宛先へのリクエストでだけ supervisor が本物の値に差し替えます。

確認のため、リクエストヘッダをそのまま返してくれる httpbin.org にだけ credential を紐付けた provider profile を作りました。値はダミーです。

```yaml
id: echo
display_name: Echo
category: other
credentials:
  - name: token
    env_vars: [ECHO_TOKEN]
    required: true
    auth_style: bearer
    header_name: authorization
endpoints:
  - host: httpbin.org
    port: 443
    path: /anything/**
    protocol: rest
    access: read-only
    enforcement: enforce
binaries: [/usr/bin/curl]
```

さらに sandbox のポリシーで、似たようなエコーサービスである postman-echo.com への GET も許可しておきます。こちらには credential を紐付けません。

```shell
openshell profile import -f profiles/echo.yaml
openshell provider create --name echo --type echo --credential ECHO_TOKEN=dummy-not-a-real-secret
```

```text
▸ what the agent sees in its environment
ECHO_TOKEN=openshell:resolve:env:v460554092086405377_ECHO_TOKEN
▸ send the placeholder to httpbin.org (bound endpoint: proxy resolves it)
    "Authorization": "Bearer dummy-not-a-real-secret",
▸ send the placeholder to postman-echo.com (allowed by policy, not bound: expect 403)
{"error":"credential_endpoint_mismatch","message":"Credential is not authorized for this request endpoint"}
```

sandbox の環境変数には `openshell:resolve:env:...` という placeholder しか入っていません。httpbin.org に送ると、返ってきたヘッダには本物の値が入っていて、supervisor が差し替えたことが分かります。一方、ネットワークポリシー上は許可されている postman-echo.com に同じ placeholder を送ると `credential_endpoint_mismatch` で拒否されました。

```text
HTTP:GET [INFO] ALLOWED GET https://postman-echo.com/get [policy:postman_echo engine:l7]
HTTP:GET [HIGH] DENIED GET  [policy:postman_echo engine:credential-binding] [reason:credential_endpoint_mismatch]
```

ネットワークの許可と credential の紐付けが独立して判定されていて、「通信は許可しているが、その宛先に credential を送ってよいとは言っていない」という区別ができます。エージェントに渡した token を別のサービスに送らせる、という攻撃はこの層で止まります。

## シナリオ 04: 窃取スクリプトを模擬する

冒頭で触れた LiteLLM や VS Code 拡張の事件では、悪意あるコードが環境変数や認証情報を集めて外部へ送り、さらに `authorized_keys` や起動スクリプトに永続化の仕掛けを残していました。これを無害な形で真似て、OpenShell の sandbox 内で実行してみます。ポリシーはシナリオ 02 と同じ GitHub API 読み取りのみです。

| # | 試したこと | 結果 | 止めた層 |
|---|---|---|---|
| 1 | 環境変数から token / key を探す | 何も見つからない | (provider を付けていない) |
| 2 | 未許可ホストへ POST で送信 | 拒否 | L4 (`transparent_tcp_policy_denied`) |
| 3 | 許可ホスト api.github.com に gist を作って送信 | 403 | L7 (`POST /gists not permitted`) |
| 4 | python3 から api.github.com へ接続 | 拒否 | バイナリ単位の判定 |
| 5 | クラウドの metadata (169.254.169.254) を参照 | 拒否 | L4 |
| 6a | `/etc/profile.d` にスクリプトを置く | 拒否 | Unix パーミッション (非 root のため) |
| 6b | `/var/tmp` に書き込む | 拒否 | Landlock |
| 6c | `/var/lib/dpkg/status` を読む | 拒否 | Landlock |
| 7 | `~/.ssh/authorized_keys` に鍵を追記 | 成功 | 止まらない |

3 と 4 が特に効いていると感じました。許可したホストであっても、許可していないメソッドでは送れず、許可していないバイナリからは接続すらできません。ログにも `python3.12` が拒否されたことが残ります。

```text
HTTP:POST [MED] DENIED POST https://api.github.com/gists [policy:github_api engine:l7] [reason:L7_REQUEST deny POST api.github.com:443/gists ...]
NET:OPEN [MED] DENIED /usr/bin/python3.12(0) -> api.github.com:443 [reason:transparent_tcp_policy_denied]
```

6a は非 root ユーザーなので Unix のパーミッションだけでも拒否されるケースです。Landlock が効いていることを確かめるために、6b と 6c ではパーミッション上は誰でも読み書きできるパスを選びました。

```text
▸ 6b. write to /var/tmp: world-writable (1777) but not in read_write (expect: Landlock denies)
drwxrwxrwt 2 root root 4096 Sep 30 14:26 /var/tmp
sh: 1: cannot create /var/tmp/zz-persist: Permission denied
▸ 6c. read /var/lib/dpkg/status: world-readable but not in read_only (expect: Landlock denies)
-rw-r--r-- 1 root root 116307 Nov  3 04:34 /var/lib/dpkg/status
head: cannot open '/var/lib/dpkg/status' for reading: Permission denied
```

`/var/tmp` は 1777、`/var/lib/dpkg/status` は 644 なのに拒否されており、ポリシーの `read_only` / `read_write` に無いパスへのアクセスは Landlock で止まっています。

一方で 7 は成功しました。sandbox のホームディレクトリ `/sandbox` は workspace として読み書き可能なので、そこに何を書き込むかは OpenShell の関知するところではありません。今回の検証ではこの鍵で sandbox に入れるかどうかまでは確認していませんが、workspace に残ったファイルを後で別の環境に持ち出すような運用をしていると、永続化の足がかりになりえます。sandbox を使い捨てにする (`--no-keep`) か、workspace の中身を信用しない運用が必要です。

## シナリオ 05: policy prover で boundary check する

OpenShell には SMT ソルバでポリシーを検査する `openshell-prover` が付いています。gateway は不要で、ポリシーファイル同士を比較できます。「この環境で許す最大の範囲」を boundary として書いておき、candidate がそれを超えていないかを調べます。

boundary はシナリオ 02 と同じ GitHub API の読み取りのみとし、candidate を 3 つ用意しました。

| candidate | 内容 |
|---|---|
| `ok.yaml` | boundary から `/var/log` の読み取りを外したもの |
| `too-wide.yaml` | GitHub API を `read-write` にし、metadata へのルールを足したもの |
| `metadata.yaml` | boundary に metadata (169.254.169.254) へのルールだけを足したもの |

```text
▸ candidates/metadata.yaml
result: within_boundary
▸ candidates/ok.yaml
result: within_boundary
▸ candidates/too-wide.yaml
result: exceeds_boundary
counterexample: network ... host=api.github.com:443 ... protocol=rest method=POST path=/
```

`too-wide.yaml` は boundary を超えていると判定され、反例として「api.github.com への POST」が示されました。反例は 1 つだけ示される仕様なので、metadata の方は出てきません。

意外だったのは `metadata.yaml` が `within_boundary` になったことです。ドキュメントを確認すると、OpenShell はループバック・リンクローカル・クラウドの metadata アドレスへの接続をポリシーに関わらず常に拒否する仕様でした。ポリシーに書いても実際には何も許可されないので、boundary を超えていないという判定は正しいことになります。

prover は Linux 用の静的バイナリが GitHub Releases にあるので、CI にも簡単に組み込めます。

```yaml
      - name: install openshell-prover
        run: |
          curl -sSfLO "https://github.com/NVIDIA/OpenShell/releases/download/${PROVER_VERSION}/${PROVER_ASSET}"
          echo "${PROVER_SHA256}  ${PROVER_ASSET}" | sha256sum -c -
          tar xzf "${PROVER_ASSET}" -C "${RUNNER_TEMP}" openshell-prover
          echo "${RUNNER_TEMP}" >> "${GITHUB_PATH}"

      - name: boundary check
        working-directory: policies
        run: openshell-prover check candidates/ok.yaml --boundary boundary.yaml
```

終了コードは `within_boundary` が 0、`exceeds_boundary` が 1、エラーが 2、検査できない (`unsupported`) か時間切れ (`inconclusive`) が 3 です。以前 [Conftest OPA で Terraform コード開発に制約を設ける](/post/conftest/) で Terraform に対してやったことを、エージェントのポリシーに対して形式検証でやれるイメージです。ただし GraphQL や MCP のルールは今のところ検査対象外で、`unsupported` が返ります。0 以外はすべて失敗として扱うのが安全です。

## 気になった点

- v0.1.x で、毎週 stable がリリースされています。Experimental と書かれたインターフェースは patch リリースで変わる可能性があります。
- install.sh 版は匿名 telemetry がデフォルトで有効です。
- Docker Desktop では前述の `supervisor_network_mode = "bridge"` の設定が必要でした。
- 公式 example の README にある出力例 (CONNECT 時の 403) と、実際の挙動 (透過 TCP での拒否) が異なっていました。example と docs で記載が揃っていない箇所があるので、実際に動かして確かめるのが確実です。
- 今回はエージェント自体を動かしていません。OpenShell には、拒否された通信からルールを下書きし、prover でリスクを検査してから人が承認する policy advisor という仕組みもあり、OpenCode などのエージェントと組み合わせて使うのが本来の使い方です。

## まとめ

OpenShell を macOS + Docker Desktop で動かし、default deny、L7 制御、credential placeholder、窃取スクリプトの模擬、policy prover を試しました。エージェントの通信を「どのバイナリが・どのホストに・どのメソッドで」の単位で絞れること、credential がエージェントに渡らないこと、そしてその判定がすべて OCSF のログに残ることは、エージェントに広い権限を渡すときの安心材料になると感じました。

一方で、許可した workspace の中で何が起きるかまでは守ってくれません。OpenShell は「外に出す経路」を絞るためのもので、workspace を使い捨てにする運用や、コード側のガードレールと組み合わせて使うものだと理解しました。次は policy advisor を使って、実際のエージェントが要求してくるルールを承認していく流れを試してみたいと思います。
