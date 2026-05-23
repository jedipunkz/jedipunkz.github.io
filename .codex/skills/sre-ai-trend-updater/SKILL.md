---
name: sre-ai-trend-updater
description: Research current SRE x AI, AI SRE, AIOps, incident automation, LLM observability, and reliability engineering trends on the web, then update this repository's Japanese article content/post/sre-ai-2026.md with sourced, restrained prose. Use when asked to refresh, crawl, investigate, or reflect recent SRE x AI developments in the blog post.
---

# SRE AI Trend Updater

## Overview

Update `content/post/sre-ai-2026.md` by researching recent SRE x AI developments and folding only defensible findings into the existing Japanese article.

Keep the article as an authored blog post, not a news dump. Preserve the current voice, heading hierarchy, section order, paragraph-level structure, front matter keys, and Japanese prose style unless the user explicitly asks for a larger rewrite.

## Workflow

1. Read `content/post/sre-ai-2026.md` before researching.
2. Identify which sections need updates: new examples, changed dates, stronger sources, outdated claims, or missing caveats.
3. Browse the web for current primary or high-quality sources. Use multiple targeted queries, including English terms such as `AI SRE`, `SRE AI`, `AIOps`, `incident automation`, `autonomous remediation`, `LLM observability`, `GenAI observability`, `OpenTelemetry GenAI`, and `reliability engineering AI`.
4. Prefer sources listed in `references/source-policy.md`. Read that file before accepting sources.
5. Compare source dates against the current date and the article's stated timing.
6. Update the front matter `title` and any visible article wording like `xxxx年yy月現時点` or `xxxx年yy月時点` to the year and month when the skill is being executed. Use the execution date's local year and month, for example `2026年5月現時点`.
7. Edit the article with scoped changes. Do not rewrite unrelated sections just because wording can be improved.
8. Keep source URLs in Markdown links close to the claims they support.
9. Verify the final article is internally consistent: title, visible timing phrases, dates, section numbering, source claims, and summary bullets should agree.

## Research Rules

- Treat vendor claims as evidence of positioning or product direction, not as neutral proof of broad industry adoption.
- Do not cite pages that appear AI-generated, link-farm-like, or unsupported by concrete dates, authorship, product docs, reports, or named examples.
- Prefer official docs, standards bodies, conference pages, survey reports, engineering blogs, and product release notes.
- Cross-check surprising numbers, maturity claims, or market-wide claims with at least one independent source when possible.
- If a source is useful but weak, either omit it or phrase the claim as limited to that source.
- Do not fabricate publication dates, survey details, company participation, or product capabilities.

## Editing Rules

- Write in Japanese and match the existing casual but technical blog tone.
- Maintain the current heading structure, section order, and overall article composition. Do not add, remove, merge, split, or rename headings unless the user explicitly asks for a structural rewrite.
- Preserve front matter keys. Update the front matter `title` to the execution year and month, but avoid changing `date` unless the user explicitly asks to republish the article.
- Update matching visible timing phrases in the body, such as `2026年4月現時点において`, to the execution year and month.
- Make additions concise. Prefer one or two high-signal paragraphs over long lists of vendor examples.
- Use English technical terms where the article already does, such as `Observability`, `Post-Mortem`, `Stage`, and `Change-Centric`.
- Add caveats where AI adoption claims are broad, early, or vendor-led.
- Keep the final `まとめ` aligned with the body.

## Verification

After editing, run a local diff and review:

```bash
git diff -- content/post/sre-ai-2026.md
```

If the repository has a build or lint command and dependencies are already installed, run the narrowest relevant check. If no check is available, state that the article was verified by source review and diff inspection.
