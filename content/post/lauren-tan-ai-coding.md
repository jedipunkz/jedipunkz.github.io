---
title: "Lauren Tan 氏は AI コーディングで何をしているのか: 決定性の逆ピラミッドと pstack"
description: "月に数千本の PR をエージェントに書かせている Lauren Tan (poteto) 氏の AI コーディングの方法と、その方法をまとめた pstack を調べ、自分の dotfiles に取り込んでみました"
date: 2026-11-17T12:00:00+09:00
tags: ["AI Coding", "Coding Agent", "Claude Code", "Cursor", "pstack", "dotfiles"]
categories: ["AI", "Development"]
draft: false
---
こんにちは。[ジェダイパンくず🍞](https://x.com/jedipunkz) です。

最近 Lauren Tan 氏 (GitHub / X では [poteto](https://x.com/poteto)) の AI コーディングの話をよく見かけます。React core team のメンバーで、今は Grokbot という Electron 製のデスクトップアプリを開発しているチームにいる方です。講演では「チームで先月 11,000 本の PR をエージェントが書き、revert されたのは約 0.5%」という数字が出ていて、これがよく引用されています。

数字だけ見ると「トークンが使い放題の AI ラボだからできる話」に見えるのですが、講演の内容や、本人が公開している pstack という skill 集を読んでみると、やっていることはかなり地味でした。気になったので内容をまとめつつ、pstack を自分の dotfiles にも取り込んでみたので、その際に考えたことも記します。

## 決定性の逆ピラミッド

講演の中心にあったのは、エージェントの振る舞いを何で縛るかを、決定的なものから順に並べた逆ピラミッドの図です。

1. コード: API 設計、アーキテクチャ、lint、型、コンパイラ、テスト。一番厚くする
2. 検証: runtime での検証、形式検証、property-based testing
3. 文章: rules、skills、ドキュメント。一番薄くする

CLAUDE.md や AGENTS.md のような文章の層を一番薄くする、という考え方です。エージェントが間違えたときのことを、講演では次のように話していました。

> "don't write another rule in a prompt file"

エージェントを直すたびにプロンプトファイルへルールを 1 行足すのではなく、lint などの決定的なチェックにするか、そもそも間違えようがない API やディレクトリ構成にする、ということです。プロンプトに書いたルールは守られないことがありますが、lint のエラーは違反すれば必ず出ます。

自分も CLAUDE.md にルールを足し続けて、長くなるほど守られなくなる経験をしていたので、ここは刺さりました。

### lint のエラーメッセージに直し方を書く

具体例として、Grokbot では次のようなものを禁止しているそうです。どれもこのプロジェクト固有の判断で、本人も一般論として勧めているわけではありません。

- React の `useEffect`。副作用を社内フレームワークの API に集めるため、そこ以外では lint で禁止
- `setTimeout` や `requestAnimationFrame`。タイミング依存のバグの元になるため lint で禁止
- renderer から main プロセスのコードを import すること。ディレクトリをトップレベルで分け、依存グラフを lint で検査
- コードコメントの 99%

面白いと思ったのは、lint のエラーメッセージに「代わりに何を使えばいいか」を書いている点です。エージェントは lint エラーを読んで自分で直すので、エラーメッセージが「違反したときに必ず読まれるプロンプト」になります。

コメントの禁止は乱暴に見えますが、理由の 1 つが「エージェントの逃げ道になるから」というのは納得しました。エージェントは型で表しにくい制約に当たると、コメントで言い訳を書いて先に進むことがあります。コメントを書けなければ、型や関数名やテストで表すしかなくなります。

## トークンの約 7 割を検証に使う

逆ピラミッドの 2 層目が検証です。講演では「エンジニア 1 人が 1 日に使うトークンの約 70% が検証に使われている」という同僚の話を紹介していて、本人の感覚とも合うそうです。書く量より、書いたものを確かめる量のほうが多いということですね。

pstack の原則にも Prove It Works というものがあり、「コンパイルが通った」やエージェントの自己申告ではなく、実際に動いているもので確かめるよう求めています。

Grokbot は Electron アプリなので、開発ビルドを Chrome DevTools Protocol 経由で操作できます。ワークショップで紹介されていた skill を使うと、エージェントは修正後にアプリを起動し、画面を操作して、スクリーンショットや DOM、console のログで結果を確かめます。性能の修正なら CPU trace を取って修正前と比べます。git worktree ごとに別のアプリのインスタンスを起動できるので、複数のエージェントが同時に検証できます。

あわせて Feature Map という参照ファイルも用意していて、機能ごとに UI 上の名前、route、セレクタ、コードの入口、state を持っている場所が短く書かれています。バグ報告に書かれた「設定画面の通知トグル」のような人間の言葉から、エージェントがコードの場所とセレクタにすぐたどり着けるようにするためのものです。

バグ修正では、コードに触る前に必ず再現させます。ワークショップでは、バグ報告を受けたエージェントが再現を試みた結果「main ではもう直っている」と報告した例が紹介されていました。存在しないバグを「直す」無駄がなくなるわけです。

ほかにも、TLA+ で主要なフローをモデル検査したり、Lean で自作の仮想スクロールにちらつきが起きないことを証明したりしているそうです (この辺りはまだ実験的とのこと)。エージェントのおかげで書くコストが下がったので、以前なら割に合わなかった手法も使えるようになった、という話でした。

## 並列化は信頼ができてから

PR の本数を見ると、エージェントを大量に並列で走らせているように思えますが、話の順番は逆でした。まずローカルで 1 本ずつエージェントを動かして結果を確かめ、検証の仕組みを信用できるようになってから、同じ作業をクラウドのエージェントに移していく、という順番です。

今では、リリースのたびに定期実行のクラウドエージェントがアプリを fuzz し、見つけたバグごとに修正 PR を作り、検証を通ったものを自動でマージしているそうです。2024 年には同僚の PR を 1 日 3 本ほどレビューしていたのが、今はエンジニア 1 人あたり 300 本近い PR が途切れずに流れてくると話していました。この本数を人間が丁寧に読むのは無理なので、レビューを lint や型や検証の側に移すしかない、というのが逆ピラミッドの背景にあるのだと思います。

## pstack の中身

ここまでの方法は、[cursor/plugins の pstack](https://github.com/cursor/plugins/tree/2f87c854fe3e/pstack) として公開されています。2026-11-16 時点では skill が 58 本 (うち原則が 24 本)、playbook が 22 本、subagent が 2 本入っています。

入口は `/poteto-mode <タスク>` だけです。`/poteto-mode` はタスクの種類に合う playbook (Bug fix、Refactoring、Perf issue など) を選び、その手順を todo に写し、必要な原則の skill を読みながら進め、最後に検証を求めます。playbook ごとに完了条件が決まっていて、たとえば Refactoring なら「振る舞いが変わっていないこと」、Perf issue なら「計測して baseline を超えたこと」です。

読んでいて気づいたのは、58 本のうち 57 本の skill に `disable-model-invocation: true` が付いていることです。モデルが自分の判断でこれらを呼ぶことはなく、`/poteto-mode` が必要なファイルをパスで読みに行く作りになっています。原則の skill だけを入れても動かない、ということです。

単体で使える skill で気になったのは次のものです。

- `/correct`: エージェントが繰り返す間違いを探し、アーキテクチャ、型、lint、テストの順に、できるだけ上の段で起きなくする。文章のルールは最後の手段。逆ピラミッドをそのまま skill にしたもの
- `/create-verification-skill`: そのプロジェクト用の `verify-<app>` skill を作る
- `/arena`: 同じタスクを複数のモデルに別々の worktree でやらせ、別のモデルに比べさせる
- `/interrogate`: 複数のモデルで diff をレビューし、再現できた指摘だけを残す
- `/no-comments`: Comment Sicko という subagent に不要なコメントを洗い出させる

Claude Code でも、README にある下記の手順でインストールできます。コマンドに接頭辞が付くので、入口は `/pstack:poteto-mode` になります。

```
/plugin marketplace add cursor/plugins
/plugin install pstack@cursor-plugins
```

## 自分の dotfiles に取り込んでみた

自分の [dotfiles](https://github.com/jedipunkz/dotfiles) にも pstack を取り込みました ([PR #350](https://github.com/jedipunkz/dotfiles/pull/350))。

### plugin ではなくファイルをコピーした

Claude Code 向けの plugin はあるのですが、plugin として入れると Claude Code からしか使えません。自分の dotfiles では skill を `~/.claude/skills/` の 1 か所に置いて、Claude Code、Codex、Gemini で同じファイルを読ませているので、pstack の skill をファイルごとコピーしました (MIT ライセンスなので著作権表示を同梱しています)。

書き直さずに原文のままコピーしたのは、upstream が更新されたときに差分を取り込みやすくするためです。最初の commit は原文そのままにして、自分の改変は後の commit に分けました。

### ルーターを /tachikoma にした

前述のとおり、pstack はルーターがないと動かないので、`poteto-mode` を中心に据えて `/tachikoma` という名前に変えました。使い方は下記のような感じです。

```
/tachikoma users API が id 未指定のとき 500 を返す。直して
```

こう頼むと、目標を言い直し、Bug fix の playbook を選び、再現、原因の絞り込み、修正、同じ環境での確認と進んでいきます。報告には、どの原則がどの判断に効いたかも書かれます。

pstack は「元に戻せる作業は確認せずに進める」方針 (原則の Never Block on the Human) なのですが、自分のグローバルの CLAUDE.md には「迷ったら確認する」と書いています。ここは `/tachikoma` を使っているときだけ pstack の方針に従うようにしました。force push や deploy、データ削除の前では止まります。

### Cursor 固有の部分の読み替え

pstack の本文には `Task` ツールやモデルの slug、Bugbot など、Cursor の名前が出てきます。この読み替えは自分では書かず、pstack に同梱されている Claude Code 用の対応表をそのまま使っています。

ただ、対応表は `/tachikoma` を経由したときにしか読まれないので、`/create-verification-skill` などを直接呼ぶと、Cursor のパスのまま `.cursor/skills/` に書き出してしまいます。そのため、単体で呼べる skill の冒頭に「Claude Code では先に対応表を読む」という 1 行を足しました。

Bugbot やクラウドエージェント、iOS シミュレータが前提の playbook (Babysit、Shipping、Autopilot など 7 本) は取り込んでいません。

### Go と Terraform のルールを足した

pstack には TypeScript 用の `typescript-best-practices` しかないので、同じ形式で Go 版と Terraform 版を書きました。Go なら named type や `internal/` による import の遮断、Terraform なら `validation` や `precondition`、`moved` ブロック、「再実行したら差分 0」といった内容です。

どちらにも「新しいルールは golangci-lint (`forbidigo`、`depguard` など) や tflint に入れ、エラーメッセージに代わりの書き方を書く」という行を入れています。逆ピラミッドの考え方を、自分がよく書く言語に当てはめたものです。

なお、Claude Code では `/tachikoma` がルーターとして動くところまで確認しましたが、Codex と Gemini から `$tachikoma` で呼んだときの動きはまだ確かめていません。

## 自分たちの現場で真似できそうなこと

自分たちの現場は Google Cloud、AWS、Datadog の構成で、Grokbot のチームほどのトークンの予算はありません。それでも真似できそうだと思ったのは次の 3 つです。

1. CLAUDE.md / AGENTS.md に 1 行足したくなったら、先に lint や CI で書けないか考える。ESLint の `no-restricted-syntax`、golangci-lint の `forbidigo`、tflint や Conftest など、エラーメッセージを書ける道具は既にあります。`/correct` を使えば、既存のルールの棚卸しから始められます
2. リポジトリごとに `verify-<app>` skill を作り、完了と言う前に必ず実行させる。API サーバーなら実際にリクエストを投げてレスポンスを見る、Terraform なら `terraform plan` の差分に意図しない削除や作り直しがないか確かめる、といった形になると思います
3. バグ修正は、再現してから直させる

逆に、トークンの約 70% を検証に回すことや、`/arena` のように複数モデルを毎回走らせることはそのままは無理なので、認証や課金、データ削除、インフラのようにリスクの高い変更に絞って使うことになりそうです。本人も「トークンが無制限の AI ラボで働いている」と前置きしたうえで、自分のやり方をそのまま真似しないよう話していました。自動マージも、検証の仕組みを信用できるようになるまでは手を出さないほうが良さそうです。

## まとめ

Lauren Tan 氏の AI コーディングの方法と pstack について調べ、自分の dotfiles に取り込んでみました。月に数千本という数字の裏でやっていることは、エージェントが間違えにくいコードベースを作ることと、間違えたらすぐ分かる検証の仕組みに投資することで、かなり古典的なソフトウェアエンジニアリングの話だと感じました。

トークンの予算は違っても、「プロンプトにルールを足さず、lint や型で強制する」はすぐに始められます。まずは手元のリポジトリで `/correct` から試してみようと思います。

## 参考

- [cursor/plugins の pstack (commit 2f87c854fe3e)](https://github.com/cursor/plugins/tree/2f87c854fe3e/pstack)
- [BigGo: AI Engineer カンファレンスでの講演のまとめ](https://finance.biggo.com/news/5a6129233f489c0e)
- [Superbash: ワークショップ動画の検証記事](https://www.superbash.ai/articles/lauren-tan-ai-coding-agents-trust-curve/)
- [The Neuron: pstack の解説](https://www.theneuron.ai/explainer-articles/pstack-explained-lauren-tans-system-for-trustworthy-ai-agents/)
- [Flavio Copes: pstack の解説](https://flaviocopes.com/pstack.md)
- [jedipunkz/dotfiles PR #350](https://github.com/jedipunkz/dotfiles/pull/350)
