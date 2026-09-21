#!/usr/bin/env bash
# Upsert the single status comment on a pull request.
#
# The body is read from stdin and prefixed with a hidden marker. A comment
# carrying that marker is edited in place, so repeated pushes update one
# comment instead of appending a new one per commit.
#
# Usage: gh-authenticated environment, GH_REPO set to <owner>/<repo>
#   ./pr-comment.sh <pr-number> < body.md
set -euo pipefail

pr="$1"
marker="<!-- pr-status -->"
body="$marker
$(cat)"

# --paginate applies --jq per page, so a PR with many comments prints one id
# per matching page; take the first.
id="$(gh api --paginate "repos/${GH_REPO}/issues/${pr}/comments" \
  --jq "[.[] | select(.body | startswith(\"${marker}\"))] | first | .id // empty" | head -1)"

if [ -n "$id" ]; then
  gh api -X PATCH "repos/${GH_REPO}/issues/comments/${id}" -f "body=${body}" --jq .html_url
else
  gh api -X POST "repos/${GH_REPO}/issues/${pr}/comments" -f "body=${body}" --jq .html_url
fi
