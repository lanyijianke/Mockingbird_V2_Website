---
name: mockingbird-knowledge
description: Use when the user wants Mockingbird curated AI articles, prompts, examples, templates, or reusable knowledge assets for another agent workflow.
---

# Mockingbird Knowledge

Use this skill to search and read public Mockingbird prompts and articles as reusable knowledge assets.

## Rules

- Use the bundled scripts before guessing content.
- Use `--media=image` when the user asks for visual prompts, image examples, posters, product images, or other image assets.
- Use `--media=video` when the user asks for video prompts, motion examples, previews, or video assets.
- Prefer results with `qualitySignals.hasExamples=true` when the user asks for assets worth collecting or reusing.
- Fetch prompt or article detail before giving final prompt text or detailed article claims.
- Do not call publish, review, staging, R2, admin, or indexing endpoints.
- Do not use or ask for R2 credentials.
- Do not download images or videos unless the user explicitly asks for visual inspection.
- Cite public URLs returned by the API when using article or prompt content.

## Scripts

Search:

```bash
node /Users/grank/.codex/skills/mockingbird-knowledge/scripts/search.mjs "产品海报提示词" --type=prompt --limit=5
node /Users/grank/.codex/skills/mockingbird-knowledge/scripts/search.mjs "视频生成提示词" --type=prompt --media=video --limit=5
node /Users/grank/.codex/skills/mockingbird-knowledge/scripts/search.mjs "电商海报" --type=prompt --media=image --useCase=poster --limit=5
```

Get prompt detail:

```bash
node /Users/grank/.codex/skills/mockingbird-knowledge/scripts/get-prompt.mjs 123
```

Get article detail:

```bash
node /Users/grank/.codex/skills/mockingbird-knowledge/scripts/get-article.mjs agent-workflow --site=ai --maxChars=8000
```

Set `MOCKINGBIRD_KNOWLEDGE_BASE_URL` to use a non-production site. `MOCKINGBIRD_AGENT_ASSETS_BASE_URL` is still accepted as a legacy alias. Default:

```text
https://zgnknowledge.online
```

## Reference

Read `references/api.md` only when you need endpoint details or response shapes.
