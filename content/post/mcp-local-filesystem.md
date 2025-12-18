+++
title = "MCP の理解: Platform Enabler/SRE での活用"
date = "2025-04-06"
Categories = ["infrastructure", "AI"]
description = "Model Context Protocol (MCP) の概要と Platform Enabler/SRE における活用方法の考察"
aliases = [
  "/blog/2025/04/06/local-filesystem-mcp-server",
  "/post/2025/04/06/local-filesystem-mcp-server"
]
+++

自分は Platform Enabler/SRE として従事しています。また AI 関連のアップデートは2025年に入っても属に更新されています。2025年初頭においては自分たちの分野でも AI 関連の利用に関して様々な模索がある状況だと思われますが、Ahthoropic 社が提唱した MCP (Model Context Protocol) がもたらすインパクトはアプリケーションに限定されずインフラ領域のソフトウェアにも大きなメリットをもたらすと思って観測しています。

この記事では、MCP の概要とどう実装するのかの学習、またどう我々のような Platform Enabler/SRE にとっての活用例があるかを考察していきたいと思っています。

## MCP の概要
MCP (Model Context Protocol) は、AI モデルと外部システム間のやり取りを効率化するプロトコルで JSON-RPC でやりとりします。ユーザーの自然言語入力を基に、AI アシスタントが MCP サーバーを通じてファイル操作やデータ処理を実行します。

最近 OpenAI 社もこの Anthropic 社の MCP をサポートするというニュースが流れ、途端に注目を集める状況になってきました。

### 処理の流れ

ここはあくまでの一例です。Assistant の実装でいかようにも出来ると思います。

```
+-------------+          +-----------+      +------------+   +--------+
| User Prompt | <----->  | Assistant | ---> | MCP Server |   | AI API |
+-------------+ (1),(5)  +-----------+  (3) +------------+   +--------+
                               |                                  ^
                               |             (2),(4)              |
                               +----------------------------------+
```

- (1) ユーザからの入力を Assistant が受け取る
- (2) Assistant はユーザからの自然言語を LLM に問い合わせ。その際に LLM に外部機能を定義 (JSON-RPC(MCP サーバが受け取る))
- (3) Aasistant は MCP Server に JSON-RPC でクエリ送信しレスポンスを得る
- (4) Assistant は MCP Server から得たレスポンスを再び LLM に送信し自然言語としてユーザに返す内容を生成してもらう
- (5) Assistant はユーザに自然言語で結果を応答する

## 前提

MCP 学習を目的にしているので、ここでは話を簡潔にするため Linux Filesystem を操作する MCP Server を書き、理解していきます。

## MCP Server の実装

言語は問いませんが自分は Go で書きました。前述どおり、まず学習目的でローカルファイルシステムを操作する MCP Server を実装しました。

```go
package main

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"sort"
)

// MCPRequest はクライアントからのリクエストの構造体
type MCPRequest struct {
	Action    string          `json:"action"`
	Path      string          `json:"path"`
	Content   string          `json:"content,omitempty"`
	Recursive bool            `json:"recursive,omitempty"`
	Data      json.RawMessage `json:"data,omitempty"`
}

// MCPResponse はクライアントへのレスポンスの構造体
type MCPResponse struct {
	Status  string      `json:"status"`
	Message string      `json:"message,omitempty"`
	Data    interface{} `json:"data,omitempty"`
}

// FileInfo はファイル情報の構造体
type FileInfo struct {
	Name    string `json:"name"`
	Size    int64  `json:"size"`
	Mode    string `json:"mode"`
	ModTime string `json:"modTime"`
	IsDir   bool   `json:"isDir"`
	Path    string `json:"path"`
}

func main() {
	http.HandleFunc("/mcp", handleMCP)
	port := "8080"
	fmt.Printf("Starting MCP server on port %s...\n", port)
	log.Fatal(http.ListenAndServe(":"+port, nil))
}

func handleMCP(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type")

	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	}

	if r.Method != "POST" {
		sendError(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	body, err := io.ReadAll(r.Body)
	if err != nil {
		sendError(w, "Failed to read request body", http.StatusBadRequest)
		return
	}
	defer r.Body.Close()

	var req MCPRequest
	if err := json.Unmarshal(body, &req); err != nil {
		sendError(w, "Invalid JSON", http.StatusBadRequest)
		return
	}

	switch req.Action {
	case "list":
		handleList(w, req)
	case "read":
		handleRead(w, req)
	case "write":
		handleWrite(w, req)
	case "delete":
		handleDelete(w, req)
	case "mkdir":
		handleMkdir(w, req)
	default:
		sendError(w, "Unknown action", http.StatusBadRequest)
	}
}

func handleList(w http.ResponseWriter, req MCPRequest) {
	path := sanitizePath(req.Path)
	entries, err := os.ReadDir(path)
	if err != nil {
		sendError(w, fmt.Sprintf("Failed to read directory: %v", err), http.StatusInternalServerError)
		return
	}

	var fileInfos []FileInfo
	for _, entry := range entries {
		info, err := entry.Info()
		if err != nil {
			continue
		}

		fileInfos = append(fileInfos, FileInfo{
			Name:    entry.Name(),
			Size:    info.Size(),
			Mode:    info.Mode().String(),
			ModTime: info.ModTime().Format("2006-01-02 15:04:05"),
			IsDir:   entry.IsDir(),
			Path:    filepath.Join(path, entry.Name()),
		})
	}

	sort.Slice(fileInfos, func(i, j int) bool {
		if fileInfos[i].IsDir && !fileInfos[j].IsDir {
			return true
		}
		if !fileInfos[i].IsDir && fileInfos[j].IsDir {
			return false
		}
		return fileInfos[i].Name < fileInfos[j].Name
	})

	sendSuccess(w, "Directory listed successfully", fileInfos)
}

func handleRead(w http.ResponseWriter, req MCPRequest) {
	path := sanitizePath(req.Path)
	content, err := os.ReadFile(path)
	if err != nil {
		sendError(w, fmt.Sprintf("Failed to read file: %v", err), http.StatusInternalServerError)
		return
	}

	sendSuccess(w, "File read successfully", string(content))
}

func handleWrite(w http.ResponseWriter, req MCPRequest) {
	path := sanitizePath(req.Path)

	dir := filepath.Dir(path)
	if err := os.MkdirAll(dir, 0755); err != nil {
		sendError(w, fmt.Sprintf("Failed to create directory: %v", err), http.StatusInternalServerError)
		return
	}

	err := os.WriteFile(path, []byte(req.Content), 0644)
	if err != nil {
		sendError(w, fmt.Sprintf("Failed to write file: %v", err), http.StatusInternalServerError)
		return
	}

	sendSuccess(w, "File written successfully", nil)
}

func handleDelete(w http.ResponseWriter, req MCPRequest) {
	path := sanitizePath(req.Path)
	var err error

	if req.Recursive {
		err = os.RemoveAll(path)
	} else {
		err = os.Remove(path)
	}

	if err != nil {
		sendError(w, fmt.Sprintf("Failed to delete: %v", err), http.StatusInternalServerError)
		return
	}

	sendSuccess(w, "Deleted successfully", nil)
}

func handleMkdir(w http.ResponseWriter, req MCPRequest) {
	path := sanitizePath(req.Path)
	var err error

	if req.Recursive {
		err = os.MkdirAll(path, 0755)
	} else {
		err = os.Mkdir(path, 0755)
	}

	if err != nil {
		sendError(w, fmt.Sprintf("Failed to create directory: %v", err), http.StatusInternalServerError)
		return
	}

	sendSuccess(w, "Directory created successfully", nil)
}

func sanitizePath(path string) string {
    // セキュリティ対策の実装はこちらに書くそうです
    // - 特定のパスは応答させない
    // など
	return path
}

func sendError(w http.ResponseWriter, message string, statusCode int) {
	w.WriteHeader(statusCode)
	resp := MCPResponse{
		Status:  "error",
		Message: message,
	}
	json.NewEncoder(w).Encode(resp)
}

func sendSuccess(w http.ResponseWriter, message string, data interface{}) {
	resp := MCPResponse{
		Status:  "success",
		Message: message,
		Data:    data,
	}
	json.NewEncoder(w).Encode(resp)
}
```

### コードの解説

#### 構造体定義:

- MCPRequest: クライアントからのリクエストデータを表す構造体。
- MCPResponse: サーバーからのレスポンスデータを表す構造体。
- FileInfo: ファイルやディレクトリの情報を表す構造体。

#### エントリーポイント:

- /mcp エンドポイントをハンドリングする handleMCP を登録。
- ポート 8080 でHTTPサーバーを起動。

#### リクエスト処理:

- CORS対応とHTTPメソッドの検証（OPTIONSとPOSTのみ許可）。
- リクエストボディを読み取り、MCPRequest にパース。
- action フィールドに基づいて適切な処理関数を呼び出す。

#### アクションごとの処理:

- handleList: 指定されたディレクトリの内容をリスト化。
- handleRead: 指定されたファイルの内容を読み取る。
- handleWrite: 指定されたパスにファイルを書き込む。
- handleDelete: ファイルまたはディレクトリを削除（再帰的削除対応）。
- handleMkdir: ディレクトリを作成（再帰的作成対応）。

#### 補助関数:

- sanitizePath: パスのサニタイズ（セキュリティ対策）。
- sendError: エラーレスポンスを送信。
- sendSuccess: 成功レスポンスを送信。

### MCP Server の動作確認

動作確認を行います。JSON-RPC で下記の要素を含めて POST します。

- action: ファイル操作のアクション
- path: ファイル・ディレクトリの指定
- content: ファイルを作成する場合のファイル内容

またレスポンスには下記の要素が返されます。

- status: ステータス
- message: ファイル操作の結果

#### MCP Server の起動

先ほど書いた main.go を起動します。これにより localhost の 8080 番ポートでリスンします。

```bash
go run ./main.go
```

#### ファイルの書き込み

`/tmp/file.txt` というファイル名を指定しファイル内容 'Hello World' として保存してみます。

```bash
curl -X POST http://localhost:8080/mcp -H "Content-Type: application/json" -d '{"action":"write","path":"/tmp/file.txt","content":"Hello World"}'
{"status":"success","message":"File written successfully"}
```

status: success が表示されました。

#### ファイルの一覧表示

`/tmp/foo` ディレクトリ配下のファイル一覧を表示しています。

```bash
curl -X POST http://localhost:8080/mcp -H "Content-Type: application/json" -d '{"action":"list","path":"/tmp/foo"}'
{"status":"success","message":"Directory listed successfully","data":[{"name":"bar","size":0,"mode":"-rw-r--r--","modTime":"2025-04-06 11:13:42","isDir":false,"path":"/tmp/foo/bar"}]}
```

`/tmp/foo` ディレクトリ配下に `bar` というファイルだけがあることを確認できました。

#### ファイルの読み込み

`/tmp/foo/bar` というファイルの内容を読み込んで出力しています。

```bash
 curl -X POST http://localhost:8080/mcp -H "Content-Type: application/json" -d '{"action":"read","path":"/tmp/foo/bar"}'
{"status":"success","message":"File read successfully","data":"bar\n"}
```

ファイル内容 `bar` を確認できました。

## Assistant の実装

ここも言語は問いませんが自分は Python で記しました。上記構成図の処理 (1)-(5) 全てをこのコードで行います。

```python
import requests
import json
import os
import argparse
import sys
from openai import OpenAI

MCP_SERVER_URL = "http://localhost:8080/mcp"

class MCPAssistant:
    def __init__(self, model: str = "gpt-4", api_key: str = None):
        """
        Initialize AI assistant

        Args:
            model: Model name to use
            api_key: API key (uses environment variable if not specified)
        """
        self.model = model
        self.api_key = api_key or os.environ.get("OPENAI_API_KEY")

        if not self.api_key:
            raise ValueError("OPENAI_API_KEY environment variable must be set")

        self.client = OpenAI(api_key=self.api_key)
        self.conversation_history = []

        self.tools = [
            {
                "type": "function",
                "function": {
                    "name": "file_system_operation",
                    "description": "Operate on Linux filesystem",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "action": {
                                "type": "string",
                                "enum": ["list", "read", "write", "delete", "mkdir"],
                                "description": "Type of operation to perform"
                            },
                            "path": {
                                "type": "string",
                                "description": "Path to file or directory"
                            },
                            "content": {
                                "type": "string",
                                "description": "Content to write (for write action)"
                            },
                            "recursive": {
                                "type": "boolean",
                                "description": "Whether to perform operation recursively (for delete/mkdir)"
                            }
                        },
                        "required": ["action", "path"]
                    }
                }
            }
        ]

    def call_llm(self, user_input: str):
        """Call LLM and get response"""
        system_message = """You are an AI assistant that can operate on a Linux filesystem.
Understand the user's natural language requests and translate them to appropriate filesystem operations.
You can use the file_system_operation function to access the filesystem.
Available operations: list, read, write, delete, mkdir
"""

        self.conversation_history.append({"role": "user", "content": user_input})

        messages = [{"role": "system", "content": system_message}] + self.conversation_history

        return self.client.chat.completions.create(
            model=self.model,
            messages=messages,
            tools=self.tools,
            tool_choice="auto"
        )

    def call_mcp_server(self, params):
        """Call MCP server"""
        try:
            response = requests.post(
                MCP_SERVER_URL,
                json=params,
                headers={"Content-Type": "application/json"}
            )

            if response.status_code == 200:
                return response.json()
            else:
                return {
                    "status": "error",
                    "message": f"MCP server error: status code {response.status_code}",
                    "data": None
                }
        except Exception as e:
            return {
                "status": "error",
                "message": f"MCP server connection error: {str(e)}",
                "data": None
            }

    def process_response(self, llm_response):
        """Process LLM response and execute tool calls if any"""
        assistant_message = llm_response.choices[0].message

        if hasattr(assistant_message, 'tool_calls') and assistant_message.tool_calls:
            self.conversation_history.append({
                "role": "assistant",
                "content": assistant_message.content or "",
                "tool_calls": [
                    {
                        "id": tool_call.id,
                        "type": tool_call.type,
                        "function": {
                            "name": tool_call.function.name,
                            "arguments": tool_call.function.arguments
                        }
                    }
                    for tool_call in assistant_message.tool_calls
                ]
            })

            for tool_call in assistant_message.tool_calls:
                if tool_call.function.name == "file_system_operation":
                    # Parse parameters
                    params = json.loads(tool_call.function.arguments)
                    print(f"Executing command: {params['action']} {params.get('path', '')}")

                    mcp_response = self.call_mcp_server(params)

                    self.conversation_history.append({
                        "role": "tool",
                        "tool_call_id": tool_call.id,
                        "name": tool_call.function.name,
                        "content": json.dumps(mcp_response)
                    })

            final_response = self.client.chat.completions.create(
                model=self.model,
                messages=[{"role": "system", "content": "Explain the MCP server results in a human-readable way."}] + self.conversation_history
            )

            final_message = final_response.choices[0].message.content
            self.conversation_history.append({
                "role": "assistant",
                "content": final_message
            })

            return final_message
        else:
            content = assistant_message.content or ""
            self.conversation_history.append({
                "role": "assistant",
                "content": content
            })
            return content

def main():
    parser = argparse.ArgumentParser(description="MCP AI Assistant")
    parser.add_argument("--model", default="gpt-4", help="Model to use")
    parser.add_argument("--api-key", help="API key (uses environment variable if not specified)")
    args = parser.parse_args()

    try:
        assistant = MCPAssistant(
            model=args.model,
            api_key=args.api_key
        )

        print("MCP AI Assistant")
        print("===============================")
        print("Operate Linux filesystem using natural language")
        print("Type 'exit' or 'quit' to end")
        print("Example: 'Show files in my home directory'")
        print("===============================")

        while True:
            try:
                user_input = input("\n> ")

                if user_input.lower() in ["exit", "quit"]:
                    print("Exiting.")
                    break

                if not user_input.strip():
                    continue

                llm_response = assistant.call_llm(user_input)

                final_response = assistant.process_response(llm_response)

                print("\n▶ Assistant:")
                print(final_response)

            except KeyboardInterrupt:
                print("\nExiting.")
                break
            except Exception as e:
                print(f"\nError occurred: {str(e)}")

    except Exception as e:
        print(f"Initialization error: {str(e)}")
        sys.exit(1)

if __name__ == "__main__":
    main()
```

### コードの解説

コードを解説します。

ユーザからの入力を受け、LLM に "MCP サーバと通信するための JSON" を生成してもらい、それを MCP Server へリクエスト。結果を得たら再び LLM に解釈してもらい自然言語の応答を得ます。その結果をユーザに出力して処理は完了です。

#### 定数定義:

- MCP_SERVER_URL: MCPサーバーのURLを定義。

#### MCPAssistantクラス:

##### __init__:
- モデル名とAPIキーを初期化。
- ファイルシステム操作用のツール（file_system_operation）を定義。
##### call_llm:
- ユーザー入力をLLM（GPT-4）に送信し、応答を取得。
- ツール（file_system_operation）を利用可能に設定。
##### call_mcp_server:
- MCPサーバーにリクエストを送信し、レスポンスを取得。
##### process_response:
- LLMの応答を処理。
- 必要に応じてツール呼び出しを実行し、MCPサーバーと連携。
- 最終的な応答を生成。

### 動作確認

では Assistant の動作確認を行っていきます。下記の通り、ユーザの入力はプロンプト越しに自然言語で行います。また最終的な LLM からの応答も自然言語です。

下記は自然言語で /tmp/foo というディレクトリ配下のファイル一覧を得ています。

```
$ python assistant.py
===============================
Operate Linux filesystem using natural language
Type 'exit' or 'quit' to end
Example: 'Show files in my home directory'
===============================

> /tmp/foo の下のファイル一覧を出力して
Executing command: list /tmp/foo

▶ Assistant:
The MCP server has successfully obtained the list of files under `/tmp/foo`. There is one file, named `bar`, with a size of 4 bytes. Its permissions are set to `-rw-r--r--`, which means that the owner can read and write the file, while others can only read it. The last modification date and time is April 6th, 2025 at 11:14:42. This is not a directory.
```

下記は /tmp/foo/buzz というファイルを内容 'buzz' として保存するように指示しています。

```

> 内容'buzz'として/tmp/foo/buzzというファイルを生成して
Executing command: write /tmp/foo/buzz

▶ Assistant:
The MCP server was instructed to create a file named "buzz" located in the "/tmp/foo" directory with the content "buzz". The operation was successful and the file was written without any issues.
```

下記は上記で保存・生成した /tmp/foo/buzz というファイルを読み込んで内容を確認しています。

```
> /tmp/foo/buzzというファイルを読み込んで
Executing command: read /tmp/foo/buzz

▶ Assistant:
The MCP server was asked to read the file named "buzz" located in the "/tmp/foo" directory. The operation was successful and the content of the file is "buzz".
```

## 考察
### Platform エンジニアにおける応用
今回は学習目的だったのでローカルファイルシステムでコードを書き仕組みを理解してきました。

これは自分のような Platform 系のエンジニアにも十分応用できる技術だと思っていて、普段使っているプロダクトやサービスを扱う MCP サーバを実装すれば、LLM を介す事で自然言語でそれらの機能を操作することが出来る様になります。

例えば例を挙げると、

- AWS Athena の MCP Server 実装
  - S3 上のログを自然言語で分析出来るようになる
- Datadog Metrics, Logs の MCP Server 実装
  - Datadog Metrics や Logs の傾向を自然言語で分析出来るようになる

これらを通じて

- 可用性や信頼性に関わる情報の分析
- セキュリティ異常などの分析・検知

などの応用が効くとも思っています。

たとえば、

- Slack Bot に今回の構成の Assitant の実装をする
- Lambda で MCP Server を起動する

という構成を取れば、自然言語で Slack Bot に「昨日一日間の ALB/WAF ログを確認して、セキュリティとアクセス傾向をレポートして」といった指示も出来るようになると思っています。これは Platform 系のエンジニアにとってもとてもインパクトのある機能だと思っています。

### 今後の MCP サーバの開発

当初は自前で MCP サーバを実装するエンジニアが増えると思います。ただこれは MCP サーバの操作先プロダクト・サービス毎に汎用的にも開発出来ると思うので、各プロダクトが公式に MCP Server の実装をして公開するという流れも想定されると思います。実際 2025/04 には AWS が公式で MCP Server を公開したという情報を得ました。
https://awslabs.github.io/mcp/
