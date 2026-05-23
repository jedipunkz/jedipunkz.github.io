# Source Policy

Use this policy when researching updates for `content/post/sre-ai-2026.md`.

## Prefer

- Standards and ecosystem sources: OpenTelemetry, CNCF, Kubernetes, SREcon, USENIX, IEEE, ACM, IETF, W3C.
- Official engineering or product sources from observability, incident management, CI/CD, and cloud vendors.
- Survey and report pages with clear methodology, publication date, and named publisher.
- Conference agendas, speaker pages, and session descriptions that show what practitioners are discussing.
- Engineering blogs describing implemented systems, operational lessons, or measured outcomes.

## Treat Carefully

- Vendor thought leadership about market-wide adoption.
- "Predictions" pages, unless used only as evidence of a vendor's framing of the market.
- Startup landing pages without technical detail.
- Aggregated listicles that cite no primary sources.
- Claims about percentages, ROI, toil reduction, or autonomous remediation without methodology.

## Reject

- Pages with no publication date when the timing is central to the claim.
- SEO pages that restate generic AI benefits without concrete SRE, incident, observability, or reliability details.
- Sources that require inventing details not present in the page.
- Content that appears to be copied from another source without attribution.

## Citation Style

Use inline Markdown links near the relevant claim:

```markdown
OpenTelemetry の GenAI Semantic Conventions は、LLM 呼び出しや agent 実行を trace するための語彙を整備している ([OpenTelemetry](https://...))。
```

Do not add a separate bibliography unless the article already has one or the user asks for it.
