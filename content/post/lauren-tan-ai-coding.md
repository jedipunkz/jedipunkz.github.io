---
title: "Lauren Tan 氏は AI コーディングで何をしているのか: 決定性の逆ピラミッドと pstack"
description: "月に数千本の PR をエージェントに書かせている Lauren Tan (poteto) 氏の AI コーディングの方法を、講演・ワークショップの二次記事と pstack の解説から整理しました。プロンプトにルールを足さずコードで縛る、トークンの大半を検証に使う、信頼ができてから並列化する、という 3 点を中心に、自分たちの現場で何を真似できるかも考えます"
date: 2026-11-17T12:00:00+09:00
tags: ["AI Coding", "Coding Agent", "Claude Code", "Cursor", "pstack"]
categories: ["AI", "Development"]
draft: false
---
こんにちは。[ジェダイパンくず🍞](https://x.com/jedipunkz) です。

ここ数週間、Lauren Tan 氏 (GitHub / X では [poteto](https://x.com/poteto)) の AI コーディングの話をよく見かけます。「チームで月 11,000 本の PR をエージェントが書き、revert されたのは約 0.5%」という数字が一人歩きしていて、中国語圏のフォーラムでは「各位的代码都是垃圾 (みなさんのコードは全部ゴミ)」という題で講演動画が回っていました。

数字だけ見ると「トークンが無制限な AI ラボだからできる話」で終わってしまいそうですが、中身を読むと、やっていることはかなり地味でした。エージェントに守ってほしいことはプロンプトに書かずに lint や型やディレクトリ構成で強制する、エージェントの「できました」は信用せず実際に動いているアプリで確かめる、その確かめる仕組みにトークンの大半を使う、という話です。本記事ではこの方法を順に整理し、最後に自分たちの現場で何を真似できるかを考えます。

以前 [Claude Agent SDK](/post/claude-agent-sdk/) や [zellij で Claude Code を並列に動かす話](/post/zellij-swarm-claude-code/) を書きましたが、今回は道具の話ではなく、エージェントにコードを書かせる側の「仕組みの作り方」の話です。

## 情報源

| 情報源 | 内容 | 日付 |
|---|---|---|
| [cursor/plugins の pstack](https://github.com/cursor/plugins/tree/2f87c854fe3e/pstack) | pstack 本体。本記事の skill・playbook・原則の数と一覧、モデルの既定値はこの commit を基準にしている | 2026-11-16 |
| [BigGo の記事](https://finance.biggo.com/news/5a6129233f489c0e) | AI Engineer カンファレンスでの発言のまとめ。逆ピラミッド、禁止事項、検証、数値 | 2026-11-14 |
| [Superbash の記事](https://www.superbash.ai/articles/lauren-tan-ai-coding-agents-trust-curve/) | X で拡散した 57 分のワークショップ動画の検証記事。強制の 5 層、control-glass、eval | 2026-10-28 |
| [The Neuron の記事](https://www.theneuron.ai/explainer-articles/pstack-explained-lauren-tans-system-for-trustworthy-ai-agents/) | 本人の X スレッド「pstack guide」の解説 | 2026-09-10 |
| [Flavio Copes の pstack 解説](https://flaviocopes.com/pstack.md) と [poteto-mode 解説](https://flaviocopes.com/poteto-mode.md) | pstack の使い方と、2026 年 8〜10 月時点の構成 | 2026-08〜10 |

数値を読むときの注意が 2 点あります。

- 本人の月間 PR 数は、記事によって「月約 2,000 本」「8 月に 2,462 本」「先月約 1,000 本」「前月 3,000 本」と異なります。期間も数え方も違うので、比べたり合計したりはできません。
- 拡散した動画に付いていた「50 体のエージェントで 20 人分の仕事」「採用率 97%」「75 万ドル以上のオファー」などのキャプションは、Superbash の検証によると動画の中では話されていません。

---

## 全体像: 決定性の逆ピラミッド

BigGo の記事によると、講演の中心にあったのは「エージェントの振る舞いを何で縛るか」を、決定的なものから順に並べた逆ピラミッドの図です。

| 層 | 中身 | 性質 |
|---|---|---|
| 1. コード | API 設計、アーキテクチャ、リファクタリング、lint ルール、型システム、コンパイラ、テスト | 最も決定的。一番厚くする |
| 2. 検証 | runtime 検証、形式検証、property-based testing | 結果を機械的に確かめる |
| 3. 文章 | rules、skills、ドキュメント | 判断が要る部分だけ。一番薄くする |

ポイントは、CLAUDE.md や AGENTS.md のような prose の層を一番薄くすることです。エージェントが間違えたときに、その場で直すルールについて講演では次のように話しています。

> "don't write another rule in a prompt file"

エージェントを直すたびにプロンプトファイルにルールを 1 行足すのではなく、その修正を決定的なチェックにするか、API 設計やアーキテクチャの側で間違えようがない形にする、という方針です。プロンプトに書いたルールは、守られるかどうかがモデルの気分次第です。lint エラーは毎回必ず出ます。

### 強制の 5 層

ワークショップ側 (Superbash の記事) では同じ考え方を、弱い順に 5 段に分けて説明しています。

| 段 | 手段 | 破られやすさ |
|---|---|---|
| 1 | style guide | 読まれなければ終わり |
| 2 | skills | 呼ばれれば効く |
| 3 | rules / Bugbot (レビューボット) | PR の段階で指摘される |
| 4 | 静的解析 (lint、コンパイラ、CI) | 通らないとマージできない |
| 5 | コードベースのアーキテクチャ | そもそも間違った書き方ができない |

下に行くほど強く、エージェントが「うっかり」で破れなくなります。新しい禁止事項を見つけたら、できるだけ下の段で実装する、というのが基本動作のようです。

---

## コードで縛る: 禁止 API とディレクトリ分離

逆ピラミッドの 1 層目を具体的にどう作っているか。講演とワークショップで挙がっていた禁止事項を並べます。いずれも Grokbot というプロジェクト固有の判断で、本人も一般論として勧めているわけではない点には注意が必要です。

| 禁止対象 | 範囲 | 強制方法 | 理由 (要旨) |
|---|---|---|---|
| React の `useEffect` | プロダクトコード全体。社内フレームワーク Dune の一部の API の内部だけ許可 | lint | 副作用の置き場所を Dune の API に集約するため |
| `setTimeout` / `requestAnimationFrame` / `requestIdleCallback` | Grokbot 全体 | lint (直し方を書いたエラーメッセージ付き) | 命令的なタイマーはタイミング依存のバグの温床 |
| main プロセスのコードを renderer から import | `electron-main` と `electron-renderer` をトップレベルで分離 | 依存グラフの解析と lint | Electron の main / renderer の分離を守る (renderer は 1 フレーム約 16ms の予算) |
| コードコメント | 99% 禁止 | 専用の subagent (後述の no-comments) | 腐る、人間は読まない、エージェントの逃げ道になる、強制できない |

### lint のエラーメッセージはエージェント向けのプロンプトになる

ここで面白いのは、lint ルールに「直し方を書いたエラーメッセージ」を付けている点です。エージェントは lint エラーを読んで自分で直すので、エラーメッセージがそのまま「その場で必ず表示されるプロンプト」になります。プロンプトファイルに「setTimeout は使わないで、代わりに X を使って」と書くと、読まれるかどうか分かりません。lint のメッセージに書けば、違反したときに必ず読まれます。

### コメント禁止の理由

コメントの 99% 禁止は一番反発を呼びそうな項目ですが、挙げられている理由は 4 つあります。

1. コメントはコードが変わっても更新されず、すぐ古くなる
2. 人間は実際にはコメントを読まない
3. エージェントにとって「説明を書いて済ませる」逃げ道になる
4. コメントの正しさは機械的に検査できない

3 つ目が AI コーディングならではの理由です。エージェントは型で表現しづらい制約に当たると、コメントで言い訳を書いて先に進みがちです。コメントを禁止すると、その制約を型や関数名やテストで表すしかなくなります。逆ピラミッドの「文章の層を薄くする」をコードの中でもやっている、と読めます。

### 「醜いコード」はアーキテクチャが間違っている証拠

pstack の解説 (The Neuron) では、設計についての考え方として「現実は設計を拒否できる」が紹介されています。余計な state、無理なキャスト、`any`、何度も出てくる escape hatch は、エージェントの書き方の問題ではなく、アーキテクチャが間違っている証拠として扱う、という考え方です。lint で `any` を禁止するだけでなく、`any` が必要になった時点で設計を見直すきっかけにしている、ということだと理解しました。

---

## 検証に投資する: トークンの約 70%

逆ピラミッドの 2 層目が検証です。BigGo の記事によると、本人は「エンジニア 1 人が 1 日に使うトークンの約 70% が検証に使われている」という同僚の発言を紹介し、自分の感覚とも一致すると話しています。コードを書く量より、書いたものを確かめる量のほうが多いわけです。

pstack の原則の 1 つに「Prove It Works」があり、The Neuron の解説ではこう要約されています。

- タスクの完了は、エージェントの自己申告やコンパイルが通ったことではなく、実際の成果物で確認する
- エージェントは実際にプロダクトを操作し、結果を見て、うまくいっていなければ直し、成功を示せるまで続ける

### runtime 検証: Chrome DevTools Protocol でアプリを操作する

Grokbot は Electron アプリなので、開発ビルドを Chrome DevTools Protocol (CDP) 経由で操作できます。ワークショップでは「Control Glass via Playwright」という control-glass skill が紹介されていて、次の操作ができるそうです。

| カテゴリ | できること |
|---|---|
| 観察 | DOM と accessibility tree の取得、スクリーンショット、console と network のログ |
| 操作 | クリック、文字入力 |
| 計測 | CPU trace、heap snapshot |
| 隔離 | git worktree ごとに別のアプリインスタンスを起動 |

エージェントは修正を入れたあと、この skill でアプリを起動して該当の画面を操作し、スクリーンショットや DOM で結果を確かめます。性能の修正なら CPU trace を取って修正前と比べます。

### Feature Map: エージェントと共有する語彙

検証で地味に効いているのが Feature Map です。機能ごとに次の情報を短くまとめた参照ファイルです。

- UI 上の名前
- route
- 安定したセレクタ
- コードの入口
- その機能の state を持っている場所

The Neuron の解説では「materialized memory」と呼ばれています。エージェントは毎回コードベースを探し回らなくても「設定画面の通知トグル」がどのファイルのどのコンポーネントで、どのセレクタで操作できるかが分かります。バグ報告に書かれた人間の言葉 (UI 上の名前) とコードをつなぐ辞書でもあります。

### 形式検証と property-based testing

BigGo の記事によると、runtime 検証のほかに次のものも使っています。記事は形式検証の部分を「実験的」と書いているので、全面的に使っているわけではなさそうです。

| 手法 | 対象 | 例 |
|---|---|---|
| TLA+ | 主要なフローのモデル検査 | 複数デバイスにまたがる通知 |
| Lean | アルゴリズムの証明 | 自作の仮想スクロールライブラリで、ちらつきやガタつきが起きないこと |
| Bombadil | property-based な UI テスト | UI のバグを実際に見つけている |
| state chart skill | state machine の可視化 | pstack に含まれる |

エージェントがコードを書くコストが下がったので、以前なら割に合わなかった TLA+ のモデルや Lean の証明もエージェントに書かせられる、という逆転が起きています。

### バグ修正の手順

pstack の Bug fix playbook と The Neuron の解説から、バグ報告を受けたときの手順を抜き出すと次のとおりです。

1. Slack のバグ報告を、エージェントに自分の言葉で言い直させる (誤読をここで潰す)
2. コードに触る前に再現する
3. 根本原因を見つけて直す (原則「Fix Root Causes」)
4. 実際のアプリで直ったことを確認する

ワークショップでは、バグ報告を受けたエージェントが古いビルドで再現し、「main ではもう直っている」と報告した例が紹介されていました。再現を先にやらせることで、存在しないバグを「直す」無駄を防げます。性能の問題でも同じで、最適化の前に必ず計測させます。

### 検証の仕組みも検証する: eval

skill 自体の品質は eval で測っています。ワークショップで紹介された手順は次のとおりです。

1. coordinator がルーブリック (採点基準) を決める
2. 隔離した subagent が各ケースを実行する
3. 別のモデルの judge が結果を採点する
4. 評価対象だと気づかれないよう、ディレクトリ名は中立なものにする

Cursor の `/loop` で「この eval を回し続けて」と指示し、10/10 になるまで skill を直させることもあるそうです。

---

## pstack: 方法を skill にまとめたもの

ここまでの方法は、pstack という Cursor 向けのプラグインにまとめて公開されています。2026-11-16 時点 (commit `2f87c854fe3e`) の構成は次のとおりです。

| 種類 | 数 | 中身 |
|---|---|---|
| skill | 58 | うち原則 (`principle-*`) が 24、ルーターの `poteto-mode` が 1 |
| playbook | 22 | `poteto-mode/playbooks/` の下にある、タスクの種類ごとの手順書 |
| subagent | 2 | `poteto-agent`、`comment-sicko` |
| automation | - | Benny など。`automations/` の下にある |

The Neuron の記事によると、Cursor 社内ではこの skill 群が 1 週間で 10,000 回使われたそうです (Flavio Copes の記事では 9,000 回)。

### 入口は /poteto-mode

58 本の skill のうち 57 本には `disable-model-invocation: true` が付いています。モデルが自分の判断でこれらの skill を呼ぶことはなく、ルーターの `/poteto-mode` が playbook と原則のファイルをパスで読みに行く構造です。使い方は `/poteto-mode <タスク>` だけで、`/poteto-mode` は次のことをします。

1. タスクの種類に合う playbook を選ぶ
2. playbook の手順をタスクリストにコピーする
3. 必要な skill を読む
4. subagent に仕事を振る
5. 最後に検証を要求する

Cursor では次の手順で導入します。

1. Cursor のチャットで `/add-plugin pstack` を実行する
2. `/setup-pstack` を実行し、推論の予算と使うモデルを選ぶ (`~/.cursor/rules/pstack-models.mdc` に書かれる)
3. 新しいチャットを開いて `/poteto-mode <タスク>` を実行する

Claude Code にも README に公式の手順があります。

```
/plugin marketplace add cursor/plugins
/plugin install pstack@cursor-plugins
```

Claude Code ではプラグインのコマンドに接頭辞が付くので、入口は `/pstack:poteto-mode` になります。`Task` ツールやモデルの slug のような Cursor 固有の名前は、同梱の [Claude Code 用の対応表](https://github.com/cursor/plugins/blob/2f87c854fe3e/pstack/docs/harness/claude-code.md) で読み替えます。Bugbot や Automations のように Cursor にしかない機能を使う手順は、1 行の注記を出して飛ばします。サードパーティの marketplace は自動更新が既定で無効なので、更新するときは `claude plugin update pstack@cursor-plugins` を実行します。

### 主な skill

| skill | 役割 |
|---|---|
| `/how` | サブシステムがどう動いているかを追う。コードは変更しない |
| `/why` | なぜそうなっているかを Git 履歴、PR、MCP でつないだ Linear / Notion / Slack / Datadog / Sentry などから探す |
| `/recall` | 過去のエージェントのセッションを検索し、Git や PR の状態と合わせて思い出す |
| `/teach` | 仕組みと経緯を合わせて説明する |
| `/architect` | 型やインタフェースの形を先にスケッチし、合意してから実装する。実装中に摩擦が続いたらスケッチを捨てる |
| `/arena` | 同じタスクを複数のモデルに別々の worktree でやらせ、別のモデルの judge が比較して土台を選び、他の案の良い部分を取り込む |
| `/swarm` | タスクを独立した部分に分けて複数のエージェントに振る。各 worker は PASS / ISSUES / BLOCKED で返す |
| `/interrogate` | 複数のモデルで diff をレビューし、指摘を「対応する / 検討 / 記録のみ / 却下」に分ける。変更は適用しない |
| `/tdd` | 失敗するテストから始める |
| `/create-verification-skill` | プロジェクト専用の `verify-<app>` skill を作る |
| `/maintain-verification-skill` | 上の skill を保守する (少なくとも毎日実行する) |
| `/automate-me` | 自分のセッションの記録から `<name>-mode` の SKILL.md を下書きする |
| `/reflect` | セッションの記録をレビューに回す。承認するまで何も変わらない |
| `/correct` | エージェントが繰り返す間違いを、アーキテクチャ、型、lint、テストの順に、できるだけ上の段で起きなくする。文章のルールは最後の手段 |
| `/no-comments` | Comment Sicko という subagent を起動して不要なコメントを洗い出し、採用した指摘を直す |
| `unslop` | 文章から AI っぽさを取り除く |

`/create-verification-skill` が独立した skill になっていることからも、検証の仕組みをプロジェクトごとに作って育てることを重視しているのが分かります。

### playbook

`/poteto-mode` が選ぶ playbook は 22 本あります。

| playbook | 内容 |
|---|---|
| Investigation | 読むだけの調査。出典付きで答える |
| Bug fix | 再現、根本原因の特定、修正 |
| Perf issue | 計測された遅さを追い、baseline を超える |
| Hillclimb | 1 つの指標を何度も計測しながら改善する |
| Runtime forensics | 動いているアプリの症状を診断する (修正はしない) |
| Trace forensics | 取得済みのプロファイルや trace を診断する (修正はしない) |
| Feature | 名前の付いたデータの形から新しい振る舞いを作る |
| Refactoring | 振る舞いを固定したまま構造を変える |
| Prototype | 設計の疑問を決着させるための使い捨てのスケッチ |
| Visual parity | 2 つの UI をピクセル単位で一致させる |
| Authoring a skill | SKILL.md を書く・直す |
| Eval | skill やプロンプトの変更がエージェントにどう効くかを試す |
| Babysit | PR や stack をマージできる状態まで持っていく |
| Shipping | green の stack を独立に検証し、通った PR を land する |
| Autonomous run | 長いタスク 1 つを確認できる完了まで進める |
| Autopilot-full | 独立した PR のキューをマージされるまで回す |
| Autopilot-stack | キューを 1 つの stack としてレビューと land に回す |
| Session pickup | 他のエージェントの未完了の作業を引き継ぐ |
| Pause safely | 再開できる形で安全に止める |
| Multi-phase plan | 複数フェーズの作業の計画を書いて止まる |
| Worktree cleanup | マージ済み・放棄された worktree と古い iOS シミュレータを片付ける |
| Opening a PR | コードを変える playbook の最後の手順 |

タスクの種類ごとに「何をもって完了とするか」が決まっているのが特徴です。Perf issue なら baseline を超えること、Refactoring なら振る舞いが変わらないこと、Investigation なら出典があること、が完了条件になります。Runtime forensics と Trace forensics のように「診断だけして直さない」playbook が分かれているのも、エージェントが勝手に修正まで進むのを防ぐためだと思います。

### 原則

原則は 24 本あり、`/poteto-mode` の中では 5 つに分類されています。

| 分類 | 原則 | 要旨 |
|---|---|---|
| Core | Laziness Protocol | 削除と、問題を解く最小の変更を優先する |
| Core | Foundational Thinking | ロジックを書く前に、中心になる型とデータ構造、並行に動くものが共有するものを決める |
| Core | Redesign from First Principles | 新しい要件は、最初からあった前提で設計し直して取り込む |
| Core | Attack the Premise | 同じ前提に立つ修正が 2 回失敗したら、次の修正の前にその前提を検証する |
| Core | Subtract Before You Add | 足す前に不要なものを消す |
| Core | Minimize Reader Load | 層と隠れた state を数えて減らす。呼び出し元が 1 つのラッパーはつぶす |
| Core | Outcome-Oriented Execution | 移行では目標のアーキテクチャに向かい、使い捨ての互換状態を残さない |
| Core | Experience First | 実装の都合よりユーザー体験を選ぶ |
| Core | Exhaust the Design Space | 前例のない設計判断は、2〜3 個のプロトタイプを比べてから決める |
| Core | Build the Lever | 手作業で済ませず、作業をこなす道具や証明する道具 (codemod、スクリプト) を作る |
| Architecture | Model the Domain | 散らばった条件分岐ではなく、state machine や型付きのモデルでドメインを表す |
| Architecture | Boundary Discipline | 検査はシステムの境界で行い、内部の型は信用する |
| Architecture | Type System Discipline | 不正な状態を表現できない型にする。外部のデータは境界で parse する |
| Architecture | Make Operations Idempotent | クラッシュや再試行があっても同じ最終状態に収束させる |
| Architecture | Migrate Callers Then Delete Legacy APIs | 新しい API を入れたら、呼び出し元の移行と古い API の削除を一度に行う |
| Architecture | Separate Before Serializing Shared State | 共有 state を直列化する前に、共有そのものをなくす |
| Verification | Prove It Works | プロキシや「コンパイルが通った」ではなく、実物で確かめる |
| Verification | Fix Root Causes | 症状をたどり、最初におかしくなった場所で直す |
| Verification | Sequence Work into Verifiable Units | 作業を、それぞれ検査で終わる小さな単位に分けて並べる |
| Verification | Test Behavior, Not Implementation | 利用者から見える振る舞いをテストする |
| Verification | Explain the Number | 計測した数値を信じる前に、その値を何が決めているかを説明する |
| Delegation | Guard the Context Window | 大きな出力は subagent に回し、メインの会話には要約だけを残す |
| Delegation | Never Block on the Human | 元に戻せる作業は確認せずに進め、結果を見せる |
| Meta | Encode Lessons in Structure | 同じ指示を 2 回書いたら、lint やメタデータやスクリプトにする |

最後の Encode Lessons in Structure は、逆ピラミッドの「プロンプトにルールを足さない」をそのまま原則にしたものです。どれも AI 以前からあるソフトウェア設計の原則ですが、人間向けのコーディング規約ではなく、エージェントが読む skill として 1 原則 1 ファイルで持っている点が新しいところです。

### モデルの使い分け

2026-11-16 時点の `poteto-mode` の既定値は次のとおりです。

| 役割 | 既定のモデル |
|---|---|
| コード、文章、判断 | `claude-opus-5-5-xhigh-fast` |
| 単純な機械的な編集 | `claude-opus-5-5-high-fast` |
| レビューや設計の panel、`/arena` の runner | `claude-fable-5-2-high`、`claude-opus-5-5-high-fast`、`gemini-4-carbon-high` を 1 本ずつ |

Fable 5.2 を panel 以外で使うのは、ユーザーが指名したときか、Opus 5.5 xhigh が同じ依頼で 2 回失敗したときだけです。`/arena` の judge には、親と別のベンダーのモデルを選びます。これらの既定値は `/setup-pstack` で役割ごとに上書きできます。Flavio Copes の 10 月時点の記事では Grok 4.7 にコードを書かせる構成が紹介されていたので、既定値はかなり頻繁に変わっています。

---

## 並列化は信頼ができてから

本数の多さから「エージェントを大量に並列で走らせている」という印象を持たれがちですが、話の順番は逆です。ワークショップで描かれた「信頼曲線」は計測データではなく概念図ですが、信頼を積み上げる要素として次の 3 つが挙げられています。

1. 実際に動いているアプリでの検証
2. eval で改善した skill
3. 悪い変更をはじくアーキテクチャ

この 3 つがそろってから並列度を上げます。順番は次のとおりです。

1. ローカルで 1 本ずつエージェントを動かし、結果を確かめる
2. 検証の仕組みが信用できるようになったら、同じ作業をクラウドのエージェントに移す
3. ローカルで git worktree を大量に並べるより、クラウドのエージェントを使う

### outer loop: リリースごとに自動で fuzz して直す

BigGo の記事で紹介されている Grokbot の outer loop は次のように動きます。

1. リリースのたびに、定期実行の routine が Cursor のクラウドエージェントを起動する
2. エージェントがアプリとビルドを fuzz し、ユーザーのようにアプリを使う
3. 見つけたバグ 1 件ごとに修正 PR を作る
4. 検証を通った PR を自動でマージする

Benny という automation pack もあり、Slack に来たバグ報告の振り分けに使われていたようです (The Neuron の記事では、pstack に同梱された版は「休止中」とされています)。

### PR レビューの量の変化

講演では、2024 年には同僚の PR を 1 日に 3 本ほどレビューしていたのが、今はエンジニア 1 人あたり「300 本近く」の PR を生み出し、途切れずに流れてくる、と話しています。これだけの本数を人間が 1 本ずつ丁寧に読むのは無理です。だからこそ、レビューの大部分を lint・型・アーキテクチャ・検証の側に移している、というのが逆ピラミッドの動機だと読めます。

### 数値

BigGo の記事が伝える数値をまとめます。いずれも本人の自己申告で、記事自身も revert 率には比較対象の絶対値がないと注記しています。

| 項目 | 値 | 期間・範囲 |
|---|---|---|
| チームの PR 数 | 11,000 本 | 講演の前月 (2026 年 10 月ごろ) |
| 本人の PR 数 | 3,000 本 | 講演の前月 |
| コントリビュータ数 | 227 人 | 2026 年 10 月 |
| revert された PR の割合 | 約 0.5% | 相対的に改善しているとの説明 |
| 安定版のリリース頻度 | 約 1 日 1 回 | |
| 検証に使うトークンの割合 | 約 70% | エンジニア 1 人の 1 日あたり |

---

## 自分たちの現場での実践方法考案

ここからは私の考察です。自分たちの現場は Google Cloud + Datadog + AWS の構成で、Grokbot のチームほどの規模もトークンの予算もありません。そのうえで、真似できそうなものとできなさそうなものを分けてみます。

### そのまま真似できるもの

| Lauren Tan 氏のやり方 | 自分たちの現場での置き換え |
|---|---|
| エージェントを直すたびにプロンプトファイルにルールを足さない | CLAUDE.md / AGENTS.md に 1 行足したくなったら、先に lint・型・CI で書けないか考える |
| lint のエラーメッセージに直し方を書く | ESLint の `no-restricted-syntax` / `no-restricted-imports`、Go なら golangci-lint の `forbidigo`、Terraform なら tflint や OPA/Conftest のメッセージに代わりの書き方を書く |
| ディレクトリ構成で依存方向を強制する | 依存方向は `depguard` や dependency-cruiser で CI に入れる |
| 再現してから直す | バグ修正を頼むときは「最初に再現手順とその結果を報告して止まる」を手順に入れる |
| 診断と修正を分ける | 障害調査では「読むだけで直さない」と明示したエージェントのセッションを別に用意する |

一番効果が大きそうなのは 1 つ目です。CLAUDE.md は放っておくとどんどん長くなり、長くなるほど守られなくなります。新しいルールを書く前に「これは機械的にチェックできるか」を一度考えるだけでも、prose の層は薄く保てると思います。

### 形を変えて真似するもの

runtime 検証はアプリの種類によって作り方が変わります。Electron なら CDP で済みますが、自分たちの現場で多いのは API サーバーやインフラのコードです。

| 対象 | 「実際に動いているもの」での検証 |
|---|---|
| Web フロントエンド | Playwright で画面を操作し、スクリーンショットと DOM で確かめる skill |
| API サーバー | ローカルか検証環境に立てて、実際にリクエストを投げてレスポンスを確かめる skill |
| Terraform | `terraform plan` の差分を読ませて、意図しないリソースの変更や削除がないかを確かめる |
| 本番の振る舞い | Datadog の MCP server 経由でメトリクスや trace を読ませて、デプロイ前後を比べる |

Feature Map も、フロントエンドに限らず作れそうです。API サーバーなら「エンドポイント、ハンドラの場所、使っているテーブル、関連する Datadog のダッシュボードとモニタ」を 1 機能ずつ短く書いておけば、エージェントが毎回コードベースを探し回るのを減らせます。障害対応の調査用エージェントにとっても辞書になります。

### 真似しにくいもの

- トークンの約 70% を検証に回す: 予算に上限がある以上、そのままは無理です。まずは検証の対象をリスクの高い変更 (認証、課金、データ削除、インフラ) に絞ることになると思います。
- 複数モデルの `/arena` や `/interrogate` を日常的に回す: 1 つの変更に 2〜3 倍のトークンを使うので、設計の分かれ目になる変更だけに使うのが現実的だと思います。
- TLA+ や Lean: 書くコストはエージェントで下がっても、モデルが正しいかを人間が判断するコストは残ります。分散ロックやジョブの重複実行のように、実際に事故が起きた箇所から試すのが良さそうです。
- 自動マージ: 検証の仕組みが信用できるようになる前に真似すると事故になります。本人も「並列化は信頼の後」と言っているとおり、ここは最後に考えるものです。

---

## 自分の dotfiles に取り込んだ

前の章で考えたことを、自分の [dotfiles](https://github.com/jedipunkz/dotfiles) に実際に取り込みました ([PR #350](https://github.com/jedipunkz/dotfiles/pull/350))。変更の概要は次のとおりです。

| 対象 | 内容 |
|---|---|
| pstack の skill 49 本と `comment-sicko` | `cursor/plugins@2f87c854fe3e` から原文のまま `.claude/skills/` と `.claude/agents/` にコピーし、MIT の著作権表示を `PSTACK_NOTICE.md` に置いた |
| `poteto-mode` と `poteto-agent` | `tachikoma` と `tachikoma-agent` に名前を変え、Claude Code 向けに書き換えた |
| `go-best-practices`、`terraform-best-practices` | 自作。pstack の `typescript-best-practices` と同じ表形式 |
| 既存の `systematic-debugging`、`test-driven-development`、`verification-before-completion` | 本文を、pstack の Bug fix の playbook、`tdd`、Prove It Works への誘導に置き換えた |

### plugin で入れずにコピーした理由

Claude Code には公式のインストール手順がありますが、plugin として入れると Claude Code からしか見えません。私の dotfiles は skill の実体を `~/.claude/skills/` の 1 か所に置き、Claude Code、Codex、Gemini が同じファイルを読む構成なので、ファイルをコピーしました。

書き直さずに原文のままコピーしたのは、設計の練度を落とさないためと、upstream の更新を差分で取り込めるようにするためです。最初の commit を原文そのままにし、改変は後続の commit に分けました。最初の commit から `HEAD` までの差分を見れば、upstream から何を変えたかだけが分かります。

### ルーターを中心に据える

前述のとおり、pstack の skill はほとんどが `disable-model-invocation: true` です。原則の skill だけをコピーしても、モデルがそれを呼ぶことはありません。そこでルーターの `poteto-mode` を中心に据え、`/tachikoma` という名前にしました。

```
/tachikoma users API が id 未指定のとき 500 を返す。直して
```

と頼むと、次の順に進みます。

1. 目標と、それを満たす最小の変更を言い直す
2. 依頼の種類から playbook を選ぶ (この例では Bug fix)
3. playbook の手順を todo に写す
4. 必要な原則の skill を読んで適用する
5. 必要なら `tachikoma-agent` や言語別の writer / reviewer の subagent に任せる
6. 実物で確かめてから報告する。報告には、どの原則がどの判断を変えたかを書く

pstack の Never Block on the Human に合わせて、元に戻せる作業は確認せずに進めます。ただしこの方針は `/tachikoma` の中だけに効かせ、グローバルの CLAUDE.md にある「迷ったら確認する」というルールは変えていません。force push、deploy、データ削除、外部への送信の前では止まります。

### Cursor 固有の部分を読み替える

pstack の本文には、`Task` ツール、`subagent_type`、モデルの slug、Bugbot、cloud agent、`/loop` といった Cursor の語彙が出てきます。読み替えは自分で書かず、pstack に同梱されている Claude Code 用の対応表を `tachikoma/references/claude-code.md` に移して使っています。対応表への改変は、パスの定義、agent 名、`setup-pstack` を入れていない場合の扱いだけです。

ただし、この対応表は `/tachikoma` を経由したときにしか読まれません。`/create-verification-skill` などを直接呼ぶと、Cursor のパスのまま `.cursor/skills/` に書き出してしまいます。そこで、単体で呼べる skill の冒頭に「Claude Code では先に `../tachikoma/references/claude-code.md` を読む」という 1 行を足しました。

`tachikoma` の本文でも、Cursor にしかないものを次のように置き換えています。

| 元の記述 | 置き換え後 | 理由 |
|---|---|---|
| `cursor-team-kit` の `/deslop` | リポジトリの formatter と linter | Cursor の plugin がないため |
| `control-ui` / `control-cli` | プロジェクトの `verify-<app>` skill | 同上 |
| PR の見出しと形式 | 自分の commit と PR のルール | PR のテンプレートは自分のルールを優先するため |
| `unslop` / `technical-writing` を常に適用 | 英語の文章だけに適用 | 日本語の文章は自分の文体ルールに従わせるため |
| `tachikoma-agent` のモデルの slug | `opus` | Claude Code の Agent ツールが Cursor の slug を受け付けないため |

あわせて、subagent が Go、TypeScript、Terraform、shell のファイルを編集したら、言語別の reviewer agent に diff を見せてから受け取る、という条件を足しました。

### 取り込まなかったもの

| 対象 | 理由 |
|---|---|
| playbook 7 本 (Visual parity、Eval、Babysit、Shipping、Autopilot-full、Autopilot-stack、Worktree cleanup) | Bugbot、cloud agent、iOS シミュレータ、複数ベンダーのモデルの panel が前提のため |
| `setup-pstack`、`poteto-help` | pstack 自体の設定と案内のため |
| `make-bot-ui`、Benny | Grokbot、Cursor Automations、Slack 連携が前提のため |
| `automate-me`、`ketchup-video` | Cursor のセッション記録や動画の生成が前提のため |
| `statechart`、形式検証の skill 2 本 | TLA+ と Lean は、Go、TypeScript、Terraform の日常の作業では使う機会が少ないため保留 |

### Go と Terraform のルールを足す

pstack には `typescript-best-practices` しかないので、同じ表形式で Go 版と Terraform 版を書きました。原則の Type System Discipline、Boundary Discipline、Make Operations Idempotent を、各言語の書き方に落としたものです。

| 言語 | 主なルール |
|---|---|
| Go | 意味を持つ primitive は named type にする。境界で parse する。閉じた列挙は `exhaustive` linter で網羅を強制する。エラーは `errors.Is` / `errors.As` で判定する。越えてはいけない import は `internal/` で遮断する |
| Terraform | 入力は `validation` で境界で検査する。前提は `precondition` で表明する。リネームは `moved` / `removed` で行う。再実行したら差分 0 になるようにする。`terraform plan -out` と `terraform show -json` の結果を完了の証拠にする |

どちらにも「新しいルールは golangci-lint (`forbidigo`、`depguard`、`exhaustive`) や tflint に入れ、エラーメッセージに代わりの書き方を書く」という行を入れました。逆ピラミッドの考え方を、言語ごとの具体的な置き場所に落としたものです。

### 確認できたことと未確認のこと

Claude Code では、`claude -p "/tachikoma ..."` を実行すると、ルーターが Investigation の playbook を選び、対応表を読むところまで確認しました。Codex と Gemini から `$tachikoma` で呼んだときの動きと、両者が `disable-model-invocation` をどう扱うかは未確認です。

### 最初の一歩

新しいリポジトリで使い始めるときは、次の順に進めます。

1. `/correct` で、エージェントが繰り返している間違いを lint、型、CI に移し、CLAUDE.md / AGENTS.md の文章からは消す
2. `/create-verification-skill` でそのリポジトリ用の `verify-<app>` skill を作り、完了と言う前に必ず実行させる
3. バグ修正は `/tachikoma` に頼み、Bug fix の playbook (再現する → 原因を絞り込む → 直す → 同じ環境で確かめる) に乗せる

## まとめ

Lauren Tan 氏の AI コーディングを、講演・ワークショップの二次記事と pstack の解説から整理しました。月に数千本という数字の裏でやっていることは、次の 3 点に集約できると思います。

- エージェントに守ってほしいことはプロンプトに書かず、lint・型・アーキテクチャで強制する (決定性の逆ピラミッド)
- エージェントの「できました」は信じず、実際に動いているアプリで確かめる。その仕組みにトークンの大半を使う
- 検証を信用できるようになってから、並列化と自動化を進める

AI コーディングの話は「どのツールを使うか」「どう並列化するか」に寄りがちですが、ここで紹介した方法は、エージェントが間違えにくいコードベースと、間違えたらすぐ分かる検証の仕組みに投資するという、かなり古典的なソフトウェアエンジニアリングの話でした。トークンの予算が違っても、1 つ目の「プロンプトにルールを足さない」は明日からでも真似できそうです。

なお、本記事の内容は二次情報が中心です。本人の X のスレッドや講演動画を見られる方は、そちらもあわせて確認してください。
