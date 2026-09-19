---
title: "Claude Agent SDK の基本的な使い方を学ぶ"
description: "Claude Code をライブラリとして使う Claude Agent SDK について、agent loop の仕組みから query() の使い方、カスタムツール・hooks・subagent・セッション・構造化出力まで、TypeScript の動くサンプルを並べて解説します"
date: 2026-09-19T00:00:00+09:00
Categories: ["AI", "Claude", "TypeScript"]
draft: false
---

こんにちは。[ジェダイパンくず☁️](https://x.com/jedipunkz) です。

Claude Agent SDK を触ってみたので、基本的な使い方と主要な機能を整理しました。この SDK は Claude Code 本体をライブラリとして使えるようにしたもので、agent loop・組み込みツール・コンテキスト管理・権限制御が最初から入っています。自分でツール呼び出しのループを書く必要がありません。

この記事で使ったコードは下記に置いてあります。

https://github.com/jedipunkz/claude-agent-sdk-playground

検証に使ったバージョンは `@anthropic-ai/claude-agent-sdk` v0.3.278 です。この SDK は Claude Code のネイティブバイナリを同梱していて、バージョンは Claude Code 側に追従します。

## どれを使うべきか

Claude 関連で「エージェントを作る」手段が複数あって最初に混乱したので、先に整理しておきます。

| 手段 | 何をしてくれるか | ホスティング |
|---|---|---|
| Claude Code CLI | 対話的な日常利用。`-p` でヘッドレス実行も出来る | 自分 |
| Client SDK (`@anthropic-ai/sdk`) | API を直接叩く。ツールのループは自分で書く | 自分 |
| Tool Runner (`client.beta.messages.tool_runner`) | 自分で定義したツールのループだけ回してくれる | 自分 |
| Claude Agent SDK | Claude Code のハーネスまるごと。組み込みツール付き | 自分 |
| Managed Agents | Anthropic がループとサンドボックスをホストする | Anthropic |

名前が紛らわしいのは Tool Runner と Agent SDK です。Tool Runner は Anthropic SDK 側の機能で、組み込みツールもファイルアクセスも持ちません。自分が定義したツールを呼ぶループを代わりに回してくれるだけのものです。対して Agent SDK は Read / Write / Edit / Bash / Grep / Glob / WebSearch といったツールを最初から持っていて、実体は Claude Code そのものです。

SDK として提供されているのは TypeScript と Python のみです。

## セットアップ

```bash
npm install @anthropic-ai/claude-agent-sdk zod
export ANTHROPIC_API_KEY=sk-ant-...
```


## 基本的なプロント指示と応

`query()` は async generator を返します。`for await` で回すと、エージェントの進行がメッセージとして流れてきます。

```typescript
import { query } from "@anthropic-ai/claude-agent-sdk";

const response = query({
  prompt: "TypeScript で配列の重複を除く最短のコードを 1 行で。説明は不要。",
  options: {
    tools: [],
    settingSources: [],
    maxTurns: 1,
  },
});

for await (const message of response) {
  if (message.type === "assistant") {
    for (const block of message.message.content) {
      if (block.type === "text") console.log(block.text);
    }
  }
  if (message.type === "result" && message.subtype === "success") {
    console.log("cost:", message.total_cost_usd);
  }
}
```

実行すると下記のようになります。

```
`[...new Set(arr)]`
---
subtype       : success
num_turns     : 1
duration_ms   : 1390
total_cost_usd: 0.209266
```

`message.message` は Anthropic API の Message オブジェクトそのものです。`result` メッセージには `num_turns` / `duration_ms` / `total_cost_usd` / `usage` / `permission_denials` などが入っていて、1回の実行の利用料・コスト等がここで分かります。

## Agent loop の中身

自分が一番気になっていた機能です。`query()` を呼んでから結果が返るまで、中では下記のサイクルが回っています。

1. プロンプトを受け取る。システムプロンプト・ツール定義・会話履歴と一緒にモデルへ渡される
2. モデルが評価して応答する。テキストを返すか、ツール呼び出しを要求するか、その両方
3. SDK が要求されたツールを実行し、結果を集める
4. 2 と 3 を繰り返す。この 1 往復が 1 ターン
5. ツール呼び出しを含まない応答が出たらループが終わり、最後に `result` が流れる

重要なのは、2 と 3 の繰り返しが自分のコードに制御を戻さずに進む点です。`for await` で受け取れるのは進行状況の通知であって、ループを回しているのは SDK 側です。

### 流れてくるメッセージ

ループの各段階がメッセージとして観測できます。

```typescript
for await (const message of response) {
  switch (message.type) {
    case "system":
      // セッション開始時に 1 回だけ。有効なツール一覧とモデルが分かる
      if (message.subtype === "init") {
        console.log(`model=${message.model} tools=${message.tools.length}個`);
      }
      break;

    case "assistant":
      for (const block of message.message.content) {
        if (block.type === "tool_use") {
          console.log(`[tool_use] ${block.name} ${JSON.stringify(block.input)}`);
        }
      }
      break;

    case "user":
      // ツール実行結果はユーザーターンとして戻ってくる
      break;

    case "result":
      console.log(`[result] ${message.subtype}`);
      break;
  }
}
```

### ターンの数え方と上限

`maxTurns` はツールを使ったターンを数え上限に当たるとループが止まり、`result` の `subtype` にエラーの型が帰ります。

| subtype | 意味 | result フィールド |
|---|---|---|
| `success` | 正常終了 | あり |
| `error_max_turns` | `maxTurns` に到達 | なし |
| `error_max_budget_usd` | `maxBudgetUsd` に到達 | なし |
| `error_during_execution` | 実行中のエラーや中断 | なし |
| `error_max_structured_output_retries` | 構造化出力の検証がリトライ上限まで失敗 | なし |

最終テキストが入る `result` フィールドを持つのは `success` だけ。一方で `total_cost_usd` / `usage` / `num_turns` / `session_id` はどの subtype にも入っているので、エラーで終わってもコストの集計とセッションの再開は出来ます。

### 実際に上限へ当ててみる

`maxTurns: 1` を指定して、意図的に止まる側を観測します。

```typescript
const MAX_TURNS = 1;
let toolCalls = 0;
let sessionId = "";

try {
  const response = query({
    prompt: "このディレクトリの .ts ファイルを列挙して、行数の合計を報告して。",
    options: {
      tools: ["Bash", "Read", "Glob"],
      allowedTools: ["Bash", "Read", "Glob"],
      settingSources: [],
      maxTurns: MAX_TURNS,
      maxBudgetUsd: 0.5,
      effort: "low",
    },
  });

  for await (const message of response) {
    if (message.type === "system" && message.subtype === "init") {
      sessionId = message.session_id;
    }

    if (message.type === "assistant") {
      // assistant メッセージは content ブロックごとに 1 通流れてくる
      for (const block of message.message.content) {
        if (block.type === "tool_use") {
          console.log(`[tool_use ${++toolCalls}] ${block.name}`);
        }
      }
    }

    if (message.type === "result") {
      console.log(`[result] subtype=${message.subtype}`);
      console.log(`  num_turns  : ${message.num_turns}`);
      console.log(`  stop_reason: ${message.stop_reason}`);
      console.log(`  cost       : $${message.total_cost_usd.toFixed(4)}`);

      if (message.subtype === "success") {
        console.log(`  result     : ${message.result}`);
      } else if (message.subtype === "error_max_turns") {
        console.log(`  → resume ${sessionId} で続きから再開できる`);
      }
    }
  }
} catch (error) {
  // エラー result を受け取った後に投げられる。上の分岐は既に走っている
  console.log(`[catch] ${error instanceof Error ? error.message : String(error)}`);
}
```

実行結果です。

```
[init] session=87a6144f-4d0d-489d-bd8b-0280e6e6b700 model=claude-sonnet-5
[tool_use 1] Bash
[result] subtype=error_max_turns
  num_turns  : 2
  stop_reason: tool_use
  cost       : $0.0185
  → resume 87a6144f-4d0d-489d-bd8b-0280e6e6b700 で続きから再開できる
[catch] Claude Code returned an error result: Reached maximum number of turns (1)
```

`stop_reason` が `tool_use` なので、モデルはまだ続ける気だったのに上限で打ち切られた、と読めます。`session_id` は残っているので、`resume` に渡せば続きから再開できます。

ここで気づいたのは、`maxTurns: 1` を指定したのに `num_turns` が 2 になる点です。この 2 つは同じ単位を数えていないので、上限の判断を `num_turns` でしない方が良いです。止まったかどうかは `subtype` で見ます。

assistant メッセージは content ブロックごとに 1 通ずつ流れてくるので、メッセージ数を数えてもターン数にはなりません。1 ターンの中で複数のツールが呼ばれることもあります。

### コンテキストは減らない

コンテキストウィンドウはターンをまたいでリセットされません。システムプロンプト・ツール定義・会話履歴・ツールの入出力が全部積み上がります。大きなファイルを読んだり出力の多いコマンドを実行すると、1 ターンで数千トークン消えます。

上限に近づくと SDK が自動で古い履歴を要約して圧縮します。発生すると `system` / `compact_boundary` が流れてきます。

```typescript
if (message.type === "system" && message.subtype === "compact_boundary") {
  const m = message.compact_metadata;
  console.log(`[compact] ${m.trigger} ${m.pre_tokens} -> ${m.post_tokens}`);
}
```

圧縮は古いメッセージを要約で置き換えるので、会話の最初に書いた指示は残らないことがあります。守らせ続けたいルールは初回プロンプトではなく CLAUDE.md に置くべきです。

### ツールの並列実行

1 ターンで複数のツールが要求されたとき、読み取り専用のもの (`Read` / `Glob` / `Grep` など) は並列に走ります。状態を変えるもの (`Edit` / `Write` / `Bash`) は衝突を避けるため逐次です。

カスタムツールは既定で逐次です。並列に走らせたい場合は annotations に `readOnlyHint: true` を付けます。前述のカスタムツールの節で付けていたのはこのためでもあります。

## Options について

設定は全部 `options` に入ります。よく使うものだけ挙げます。

```typescript
options: {
  model: "claude-opus-5",              // "opus" / "sonnet" / "haiku" のエイリアスも可
  effort: "low",                       // low | medium | high | xhigh | max
  thinking: { type: "adaptive", display: "summarized" },

  systemPrompt: {
    type: "preset",
    preset: "claude_code",
    append: "回答は必ず日本語で、3行以内にまとめること。",
  },

  cwd: "/path/to/workdir",
  tools: ["Read", "Write", "Bash"],
  allowedTools: ["Read", "Write"],
  settingSources: [],

  maxTurns: 10,
  maxBudgetUsd: 0.5,
}
```


### settingSources は既定で全部読む

ここが一番ハマりやすいところでした。`settingSources` を省略すると、`~/.claude/settings.json` と `.claude/settings.json` と `.claude/settings.local.json` を全部読み込みます。CLI と同じ挙動です。

つまり手元の Claude Code の設定がそのまま SDK に効きます。アプリに組み込むなら `[]` を渡して切り離すべきです。逆に `CLAUDE.md` を読ませたい場合は `'project'` を含める必要があります。

### env は置き換え

`options.env` を指定すると `process.env` とマージされず丸ごと差し替わります。`PATH` や `ANTHROPIC_API_KEY` が必要なら自分で展開します。

```typescript
env: { ...process.env, CLAUDE_AGENT_SDK_CLIENT_APP: "my-app/1.0" }
```

## 権限制御は 3 層

何を実行させるかの制御は、役割の違う 3 つのレイヤで行います。

1. `tools` — そもそも持たせるツールの集合
2. `allowedTools` / `disallowedTools` — ルールによる静的な許可・拒否
3. `canUseTool` — 呼び出しごとに動的に判断するコールバック

`canUseTool` は 1 回の呼び出しごとに呼ばれます。ここに人間へ問い合わせる UI を挟めます。

```typescript
import type { CanUseTool } from "@anthropic-ai/claude-agent-sdk";

const canUseTool: CanUseTool = async (toolName, input) => {
  if (toolName === "Bash") {
    const command = String((input as { command?: string }).command ?? "");

    if (/\brm\b|\bsudo\b/.test(command)) {
      return {
        behavior: "deny",
        message: "破壊的なコマンドはこのエージェントでは禁止されています。",
        interrupt: true,
      };
    }

    // 入力を書き換えて通すことも出来る
    return {
      behavior: "allow",
      updatedInput: { ...(input as Record<string, unknown>), timeout: 10_000 },
    };
  }
  return { behavior: "allow" };
};
```

`permissionMode` は全体の既定動作で、`default` / `acceptEdits` / `bypassPermissions` / `plan` / `dontAsk` / `auto` から選びます。

## カスタムツール

自前の関数をツールとして渡せます。`tool()` で zod スキーマ付きに定義して、`createSdkMcpServer()` でまとめます。名前に MCP と付いていますが別プロセスは立たず、同じ Node プロセス内で実行されます。

```typescript
import { query, tool, createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";

const getWeather = tool(
  "get_weather",
  "指定した都市の現在の天気を返す",
  {
    city: z.string().describe("都市名。例: Tokyo"),
    unit: z.enum(["celsius", "fahrenheit"]).default("celsius"),
  },
  async ({ city, unit }) => {
    const temp = unit === "celsius" ? 22 : 72;
    return { content: [{ type: "text", text: `${city} は晴れ、${temp}度です。` }] };
  },
  { annotations: { readOnlyHint: true, openWorldHint: true } },
);

const shopServer = createSdkMcpServer({
  name: "shop",
  version: "1.0.0",
  tools: [getWeather],
});

const response = query({
  prompt: "東京の天気を調べて、雨でなければ SKU-123 を 2 個カートに入れて。",
  options: {
    mcpServers: { shop: shopServer },
    tools: [],
    allowedTools: ["mcp__shop__get_weather", "mcp__shop__add_to_cart"],
  },
});
```


## Hooks

`canUseTool` が「許可するか」を決めるものなのに対し、hooks は「イベントが起きたときに任意のコードを走らせる」仕組みです。イベントは `PreToolUse` / `PostToolUse` / `UserPromptSubmit` / `SessionStart` / `SessionEnd` / `Stop` / `SubagentStart` / `PreCompact` など 30 種類以上あります。

例えば `PreToolUse` では `permissionDecision` を返して実行を止められます。

```typescript
const preToolUse: HookCallback = async (input) => {
  if (input.hook_event_name !== "PreToolUse") return {};

  const command = String((input.tool_input as { command?: string })?.command ?? "");
  if (command.includes("curl") || command.includes("wget")) {
    return {
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason: "外部ネットワークアクセスは禁止です。",
      },
    };
  }
  return {};
};

const response = query({
  prompt: "...",
  options: {
    hooks: {
      PreToolUse: [{ matcher: "Bash", hooks: [preToolUse] }],
    },
  },
});
```

拒否したときの挙動を実際に見ると、モデルは失敗を正しく認識して報告してきました。

```
[PreToolUse] Bash
今日の日付は 2026年9月19日（土）でした。

`example.com` への curl は実行できませんでした。フックが「外部ネットワークアクセスは
禁止です」というエラーを返し、ブロックされたためです。
```

`additionalContext` を返すとモデルへ追加情報を注入出来るので、ツール実行の直前に文脈を足す、といった使い方も出来ます。

## Subagent

`agents` で定義すると、メインのエージェントが Task ツール経由で呼び出します。サブエージェントは独立したコンテキストを持つので、出力の多い探索作業を分離してメインの文脈を汚さずに済みます。

```typescript
const agents: Record<string, AgentDefinition> = {
  explorer: {
    description: "コードベースを横断的に検索して、該当箇所のパスと概要だけを返す。",
    prompt: "あなたはコード探索の専門家です。path:line 形式で最大 10 件まで報告してください。",
    tools: ["Read", "Grep", "Glob"],
    model: "haiku",
    effort: "low",
    maxTurns: 10,
  },
  reviewer: {
    description: "変更内容をレビューして、問題点を重大度順に指摘する。",
    prompt: "あなたは厳格なコードレビュアーです。",
    tools: ["Read", "Grep"],
    model: "inherit",
    omitClaudeMd: true,
  },
};
```

`model` には `inherit` を指定するとメインと同じモデルになります。探索のように安いモデルで足りる仕事には `haiku` を割り当てられます。`omitClaudeMd: true` でサブエージェント実行中に CLAUDE.md を読ませない指定も出来ます。


## セッション

`query()` は既定でセッションを JSONL に永続化します。`resume` に session_id を渡すと続きから再開します。

```typescript
// 1 回目
let sessionId = "";
for await (const message of query({ prompt: "私の好きな言語は Go です。" })) {
  if (message.type === "system" && message.subtype === "init") {
    sessionId = message.session_id;
  }
}

// 2 回目: 文脈が残っている
for await (const message of query({
  prompt: "私の好きな言語は何でしたか？",
  options: { resume: sessionId },
})) { /* ... */ }

// 3 回目: 分岐。元のセッションは無傷のまま別ラインを作る
for await (const message of query({
  prompt: "代わりに Rust を使うとしたら、と仮定して続けて。",
  options: { resume: sessionId, forkSession: true },
})) { /* ... */ }
```

`forkSession: true` は再開時に新しい session_id へ分岐します。同じ地点から複数の案を試したいときに使えます。保存したくない場合は `persistSession: false` です。

## 構造化出力

`outputFormat` に JSON Schema を渡すと、result メッセージの `structured_output` にスキーマ準拠のオブジェクトが入ります。テキストをパースする必要がなくなります。

```typescript
const ReportSchema = z.object({
  language: z.string(),
  fileCount: z.number().int(),
  findings: z.array(z.object({
    severity: z.enum(["low", "medium", "high"]),
    summary: z.string(),
  })),
});

const response = query({
  prompt: "src ディレクトリを調べて、構成と気づいた点をレポートして。",
  options: {
    outputFormat: {
      type: "json_schema",
      schema: z.toJSONSchema(ReportSchema) as Record<string, unknown>,
    },
  },
});

for await (const message of response) {
  if (message.type === "result" && message.subtype === "success") {
    const parsed = ReportSchema.safeParse(message.structured_output);
    if (parsed.success) console.log(parsed.data.findings);
  }
}
```


## 実行中の制御

`query()` の返り値は AsyncGenerator であると同時に `Query` オブジェクトでもあり、実行中に割り込めます。

```typescript
await conversation.setPermissionMode("acceptEdits");
await conversation.setModel("claude-sonnet-5");
await conversation.interrupt();
const usage = await conversation.getContextUsage({ detail: "summary" });
conversation.close();
```

`prompt` に `AsyncIterable<SDKUserMessage>` を渡すと 1 セッションで複数ターンを送れるので、チャット UI はこの形になります。

## まとめ

触ってみて一番良いと感じたのは、ツール呼び出しのループを一切書かなくていい点です。Client SDK で同じものを作ると、tool_use を見て実行して tool_result を積んで再送する、という処理を自分で書くことになります。Agent SDK はそこが最初から動いていて、こちらは権限と境界だけ決めれば済みます。

一方で、既定値が Claude Code 寄りになっている点は注意が必要でした。特に `settingSources` を省略すると手元の設定を全部読むので、アプリに組み込むなら明示的に `[]` を渡して切り離すべきです。`tools` も既定では Claude Code の全ツールが入ります。

用途で言えば、コードやファイルを触るエージェントを自前のインフラで動かしたいなら Agent SDK が素直です。自分で定義したツールだけ使う軽いものなら Tool Runner で十分かもしれません。

