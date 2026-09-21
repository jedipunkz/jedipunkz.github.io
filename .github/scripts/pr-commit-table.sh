#!/usr/bin/env bash
# Print the pull request's commits as a markdown table.
#
# Usage: gh-authenticated environment, GH_REPO set to <owner>/<repo>
#   ./pr-commit-table.sh <pr-number>
set -euo pipefail

pr="$1"

echo "| 日付 | コミット | 内容 |"
echo "|---|---|---|"
gh pr view "$pr" --json commits \
  --jq '.commits[] | "| \(.authoredDate[0:10]) | `\(.oid[0:7])` | \(.messageHeadline | gsub("\\|"; "\\\\|")) |"'
