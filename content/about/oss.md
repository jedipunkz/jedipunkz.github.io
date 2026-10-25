---
title: "Open Source Tools"
date: 2026-10-11T12:00:00+09:00
Categories: ["profile"]
draft: false
---

Open source tools I have built and published on GitHub.

## gm

https://github.com/jedipunkz/gm

A [ghq](https://github.com/x-motemen/ghq)-style repository manager with a built-in fuzzy finder. Written in Rust.

- Keeps every clone in one `host/user/repo` tree. An existing ghq tree works as is.
- Press `Ctrl-G`, type, and hit `Enter`: the shell `cd`s to the repository. Results are ranked by match quality, then by frecency (how often and how recently you opened it).
- From the finder you can also list a repository's worktrees (`Ctrl-W`), branches (`Ctrl-L`) and pull requests (`Ctrl-J`). Picking a branch or pull request creates its worktree on demand.
- Slash commands such as `/create`, `/remove`, `/expire`, `/dirty` and `/unpushed` create or remove repositories and worktrees, and find uncommitted or unpushed work, without leaving the finder.
- Sub commands (`gm get`, `gm list`, `gm status`, `gm wt create`, `gm migrate`, ...) cover the same operations from scripts.

```sh
brew install jedipunkz/gm/gm
```

Related post (in Japanese): [ghq の気になる点を改善した Rust 製ツール開発](/post/gm/)

## fuzz.fish

https://github.com/jedipunkz/fuzz.fish

A fuzzy finder plugin for the Fish shell. Written in Go and shipped as a single binary, so `fzf`, `fd`, `ripgrep` or `bat` are not needed.

- `Ctrl-R` opens the finder. `Ctrl-S`, `Ctrl-W`, `Ctrl-G`, `Ctrl-X` and `Ctrl-J` switch between six modes: command history, files, git worktrees, git branches, git commits and GitHub pull requests.
- `Enter` inserts the selected command or path into the prompt, `cd`s into a directory or worktree, switches branches, or checks out a pull request into a worktree.
- Every mode has a preview: when and where a command ran, syntax-highlighted file content, or the last commits of a branch.
- Command history is ranked by frecency, so commands you actually repeat come first.
- In commit mode, `Enter` puts `git show` / `git diff` / `git revert` / `git cherry-pick` for the commit on the prompt without running it.

```fish
fisher install jedipunkz/fuzz.fish
```

Related post (in Japanese): [Go によるコマンド履歴・ファイル・Git ブランチ/Worktree/コミットを検索する Fish Plugin 開発](/post/fuzz-fish/)

## agx

https://github.com/jedipunkz/agx

Runs multiple AI coding agents in parallel, each isolated in its own git worktree, and monitors them all from a single terminal dashboard. Supports Claude Code, Codex CLI, Gemini CLI and OpenCode. Written in Go.

- `agx agent new` creates a worktree on a new `agx/<id>` branch from `HEAD` and starts the agent inside it, so each agent's changes stay separate from your working tree.
- `agx dash` shows every agent with its status (`running`, `waiting`, `success`, `failed`, `killed`). You can open an agent's log, or a live diff of its worktree that reloads every 2 seconds.
- From any terminal, `agx agent logs -f` follows an agent's output, `agx agent input` answers an agent waiting at a prompt, and `agx agent wait` blocks until it finishes, for use in shell pipelines.
- Worktrees of finished agents are removed automatically after a configurable period (default: 30 days).

```sh
brew tap jedipunkz/agx && brew install agx
```

Related post (in Japanese): [複数の AI コーディングエージェントを1つのターミナルから起動・監視するツールを作った](/post/cco/)

## miniecs

https://github.com/jedipunkz/miniecs

A CLI tool to search Amazon ECS containers incrementally with a fuzzy finder and log in to the selected one. Written in Go.

- `miniecs login` discovers the clusters in the region, lets you pick a container with the fuzzy finder, and opens a shell in it (default: `sh`) through the Session Manager plugin.
- `miniecs list` prints the clusters, services, task definitions and containers in the region as a table.

```sh
brew tap jedipunkz/miniecs
brew install jedipunkz/miniecs/miniecs
```

Related post (in Japanese): [ECS コンテナにログインする CLI を Go 言語で作った話](/post/ecs-login-cli/)

## scomp

https://github.com/jedipunkz/scomp

Lists known vulnerabilities in the dependencies of a Git repository and lets you browse and filter them in a TUI. Written in Go.

- Reads the repository's lockfiles with an embedded [osv-scanner](https://github.com/google/osv-scanner) and shows one row per package and vulnerability, with OSV and CVE IDs.
- Filter with a query such as `severity:>=high`, `ecosystem:go`, `fixed:true` or free text, or cycle severity and ecosystem filters with a single key.
- `alt+o` opens the vulnerability on osv.dev, and `alt+i` creates a GitHub issue for it through `gh`.
- Results are cached for 24 hours. `--json` prints the findings as JSON instead of starting the TUI, and `--offline` scans without sending package names to osv.dev.

```sh
go install github.com/jedipunkz/scomp@latest
```

## rebind

https://github.com/jedipunkz/rebind

A Windows tray application that adds Emacs-like keybindings to ordinary Windows apps. Written in Rust and Tauri.

- Runs in the system tray without a main window. From the tray menu you can enable or disable remapping, reload the config, or open the config file.
- Default bindings include `ctrl-a` / `ctrl-e` for beginning / end of line, `ctrl-b` / `ctrl-f` / `ctrl-p` / `ctrl-n` for cursor movement, `ctrl-k` to cut to end of line, and `ctrl-g` for Escape.
- Bindings and apps to ignore (e.g. `Code.exe`, `WindowsTerminal.exe`, `emacs.exe`) are set in `rebind.yaml` next to the executable.

Download the binary from GitHub Releases.

## UnNatural

https://github.com/jedipunkz/UnNatural

A macOS menu bar application that reverses the scroll direction separately for the mouse and the trackpad. Written in Swift.

- Toggle `Mouse` and `Trackpad` independently, for example to keep natural scrolling on the trackpad and reverse it on the mouse.
- Supports launch at login, and opens the Accessibility permission screen from its settings.

```sh
git clone https://github.com/jedipunkz/UnNatural.git
cd UnNatural
make install
```
