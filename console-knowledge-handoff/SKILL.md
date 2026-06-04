---
name: console-knowledge-handoff
description: Use when the user provides a Console-generated R2 handoff locator or handoff JSON URL, asks to put a Console longform article into the Knowledge Website, or mentions 中台长文入知识库, R2 handoff, knowledge-imports/console, review draft, or publishing after manual confirmation.
---

# Console Knowledge Handoff

Import a Console longform article handoff package into the Knowledge Website R2 article state machine. This skill is only for Console-generated handoff JSON, not generic webpage fetching or WeChat publishing.

## Accepted Input

Use this skill when the user provides:
- `r2://<bucket>/knowledge-imports/console/...json`
- `https://.../knowledge-imports/console/...json`
- A local JSON file containing the same handoff schema

The handoff JSON must include:
- `schemaVersion: 1`
- `source.sourceType`
- `source.sourceContentId`
- `article.content`
- `article.language`

## Workflow

1. Read the handoff JSON. For `r2://bucket/key`, use local S3/R2-compatible credentials. For HTTPS, fetch the URL directly.
2. Validate the required fields. Stop if `schemaVersion` is not `1` or article content is empty.
3. If `article.language` is `zh`, keep the article in Chinese and normalize Markdown only.
4. If `article.language` is `en`, load `references/terminology.json` and translate title, summary, and body into Chinese.
5. Generate article metadata: `slug`, Chinese `title`, Chinese `summary`, `category`, `author`, `originalUrl`, `sourcePlatform`, `type`, and `tags`.
6. Prefer metadata from `analysis.categoryHints`, `analysis.qualityScore`, `source.sourceUrl`, `source.sourcePlatform`, `article.authorHandle`, and `article.authorName`.
7. Process images from `mediaAssets`: only use assets with `assetType === "image"`, `processingStatus === "completed"`, and `publicUrl`.
8. Download images to the article folder as `images/cover.jpg`, `images/01.jpg`, `images/02.jpg`, and rewrite Markdown links to relative paths.
9. Stage the article to `ai/articles/review/<slug>/index.md` and upload images under `ai/articles/review/<slug>/images/`.
10. Write `ai/state/articles/<slug>.json` with `status: "review"`.
11. Write `ai/events/<timestamp>-review-<slug>.json`.
12. Report the review draft to the user with title, slug, category, summary, original URL, and R2 review key.
13. Stop and ask for explicit user confirmation before publishing.
14. After confirmation, promote to `ai/articles/published/<slug>/`, update state to `status: "published"`, update `ai/manifest.json`, write `ai/manifests/<revision>.json`, write `ai/events/<timestamp>-publish-<slug>.json`, refresh article cache, and verify `/api/articles?action=slugs&site=ai`.

## Hard Rules

- Never publish before explicit user confirmation.
- Never update `ai/manifest.json` during review staging.
- Never use the legacy GitHub `articles/drafts` flow for Console handoffs.
- Never re-fetch Console internals; the handoff JSON is the source of truth.
- If English translation is needed, use `references/terminology.json`.

## R2 Article Layout

```text
ai/
  manifest.json
  manifests/{revision}.json
  state/articles/{slug}.json
  events/{timestamp}-{action}-{slug}.json
  articles/review/{slug}/index.md
  articles/review/{slug}/images/
  articles/published/{slug}/index.md
  articles/published/{slug}/images/
```
