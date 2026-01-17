---
title: "Fish Shell 向けファジーファインダープラグインを作った話"
description: "Fish Shell のコマンド履歴や Git ブランチをファジー検索できるプラグイン fuzz.fish を開発しました。Go と Bubble Tea で構築した TUI ベースのツールです"
date: 2026-01-17T12:00:00+09:00
tags: ["Fish", "Go"]
categories: ["Application", "go"]
draft: false
---
こんにちは。[jedipunkz](https://x.com/jedipunkz) です。

今回は自作した Fish Shell プラグイン fuzz.fish について紹介します。

fuzz.fish は Fish Shell のコマンド履歴や Git ブランチをファジー検索できるプラグインです。Go と charmbracelet/bubbletea を使って TUI を実装しており、Fisher でインストールすると自動的にバイナリがビルドされます。

GitHub: https://github.com/jedipunkz/fuzz.fish

## 開発動機

普段から Fish Shell を使っていますが、コマンド履歴の検索や Git ブランチの切り替えをより効率的に行いたいと思っていました。既存のツールもありますが、以下の点を満たすものを作りたいと考えました。

- Fish Shell にネイティブに統合できる
- コマンド履歴と Git ブランチ検索を一つのツールで切り替えられる
- Fisher でシンプルにインストールできる
- Go で書いて高速に動作する

## 主な機能

fuzz.fish は以下の機能を提供します。

- コマンド履歴のファジー検索
- Git ブランチのファジー検索と切り替え
- ファイル・ディレクトリのファジー検索
- キーボードショートカットによる操作

## インストール方法

Fisher を使ってインストールします。Go 1.21 以上が必要です。

```fish
fisher install jedipunkz/fuzz.fish
```

インストール時に自動的に GitHub からソースをクローンし、Go でバイナリをビルドします。

## 使い方

### コマンド履歴検索 (Ctrl+R)

`Ctrl+R` を押すとコマンド履歴のファジー検索が起動します。

- 文字を入力してインクリメンタル検索
- 矢印キーまたは `Ctrl+N/P` で上下移動
- `Enter` で選択したコマンドをコマンドラインに挿入
- `Ctrl+Y` でクリップボードにコピー
- `ESC` でキャンセル

Git リポジトリ内では `Ctrl+R` を再度押すと Git ブランチ検索モードに切り替わります。

### Git ブランチ検索

Git 管理のディレクトリで履歴検索モードで `Ctrl+R` を更に押すと Git ブランチ検索に切り替わります。ローカルブランチとリモートブランチの両方が表示されます。リモートブランチを選択しローカルに対応するブランチがない場合はローカルブランチを新たに checkout し遷移します。



## アーキテクチャ

### ディレクトリ構成

```
fuzz.fish/
├── conf.d/
│   └── fuzz.fish      # Fish Shell の設定とキーバインド
├── cmd/fuzz/
│   ├── main.go        # エントリーポイント
│   ├── app/           # TUI アプリケーション
│   ├── history/       # 履歴パーサー
│   ├── git/           # Git ブランチ操作
│   └── files/         # ファイル検索
```

### Fish Shell との連携

`conf.d/fuzz.fish` でキーバインドと関数を定義しています。

```fish
# コマンド履歴検索関数
function fh --description 'Fish History viewer with context (TUI)'
    set -l bin_path (_fuzz_ensure_binary_or_error); or return 1

    set -l result ($bin_path </dev/tty 2>/dev/tty)

    if test -n "$result"
        if string match -q "CMD:*" -- "$result"
            set -l cmd (string replace "CMD:" "" -- "$result")
            commandline -r -- "$cmd"
            commandline -f repaint
        else if string match -q "BRANCH:*" -- "$result"
            set -l branch (string replace "BRANCH:" "" -- "$result")
            fish -c "git switch --quiet '$branch'" >/dev/null 2>&1
            commandline -f repaint
        end
    end
end

# キーバインド設定
function __fuzz_fish_key_bindings
    bind \cr fh
    bind \e\cf ff
    if test "$fish_key_bindings" = fish_vi_key_bindings
        bind -M insert \cr fh
        bind -M default \cr fh
    end
end
```

TUI バイナリの出力は `CMD:` または `BRANCH:` のプレフィックス付きで返され、Fish 側でそれを判別して適切な処理を行います。

### 履歴のパース

Fish Shell の履歴ファイル (`~/.local/share/fish/fish_history`) をパースしています。

```go
// Parse reads and parses the Fish shell history file
func Parse() []Entry {
    histPath := GetPath()
    file, err := os.Open(histPath)
    if err != nil {
        return []Entry{}
    }
    defer file.Close()

    var entries []Entry
    var current *Entry
    scanner := bufio.NewScanner(file)

    for scanner.Scan() {
        line := scanner.Text()

        if strings.HasPrefix(line, "- cmd: ") {
            if current != nil {
                entries = append(entries, *current)
            }
            current = &Entry{
                Cmd: strings.TrimPrefix(line, "- cmd: "),
            }
        } else if current != nil {
            if strings.HasPrefix(line, "  when: ") {
                whenStr := strings.TrimPrefix(line, "  when: ")
                when, _ := strconv.ParseInt(whenStr, 10, 64)
                current.When = when
            }
        }
    }
    // ...重複排除処理
    return deduplicated
}
```

履歴ファイルは YAML 形式で、コマンド、実行時刻、パスなどの情報が含まれています。新しいコマンドを優先して表示し、重複するコマンドは最新のもののみを残します。

### Git ブランチの取得

`git for-each-ref` コマンドを使ってローカルとリモートのブランチを取得しています。

```go
func CollectBranches() []Branch {
    var branches []Branch
    currentBranch := getCurrentBranch()

    cmd := exec.Command("git", "for-each-ref", "--sort=-committerdate",
        "--format=%(refname)|%(refname:short)|%(objectname:short)|%(subject)|%(committerdate:iso8601)",
        "refs/heads/", "refs/remotes/")
    output, err := cmd.Output()
    if err != nil {
        return branches
    }

    lines := strings.Split(strings.TrimSpace(string(output)), "\n")
    for _, line := range lines {
        parts := strings.SplitN(line, "|", 5)
        if len(parts) != 5 {
            continue
        }
        // ブランチ情報を構造体に格納
        branches = append(branches, Branch{
            Name:              parts[1],
            IsCurrent:         parts[1] == currentBranch,
            IsRemote:          strings.HasPrefix(parts[0], "refs/remotes/"),
            LastCommit:        parts[2],
            LastCommitMessage: parts[3],
            CommitDate:        formatDate(parts[4]),
        })
    }
    return branches
}
```

コミット日時でソートされているため、最近作業したブランチが上位に表示されます。

### TUI の実装

TUI は charmbracelet/bubbletea を使用しています。Model-Update-View パターンで実装されており、モードの切り替えやフィルタリングを管理しています。

```go
func Run() {
    entries := history.Parse()

    ti := textinput.New()
    ti.Placeholder = "Search history... (Ctrl+R to switch)"
    ti.Focus()

    m := model{
        mode:           ModeHistory,
        input:          ti,
        historyEntries: entries,
        viewport:       viewport.New(0, 0),
    }

    m.loadItemsForMode()
    m.updateFilter("")

    p := tea.NewProgram(m, tea.WithInput(tty), tea.WithOutput(tty), tea.WithAltScreen())
    finalModel, _ := p.Run()

    if m, ok := finalModel.(model); ok && m.choice != nil {
        if m.mode == ModeHistory {
            fmt.Printf("CMD:%s", *m.choice)
        } else {
            fmt.Printf("BRANCH:%s", *m.choice)
        }
    }
}
```

## 今後の改善点

現時点で考えている改善点は以下の通りです。

- プレビュー機能の強化
- カスタマイズ可能な設定ファイル
- 検索アルゴリズムの改善

## まとめ

fuzz.fish は Fish Shell のワークフローを効率化するためのプラグインです。Go と Bubble Tea による TUI 実装で高速に動作し、Fisher で簡単にインストールできます。

普段の作業で頻繁にコマンド履歴を検索したり Git ブランチを切り替えたりする方には便利なツールになると思います。

