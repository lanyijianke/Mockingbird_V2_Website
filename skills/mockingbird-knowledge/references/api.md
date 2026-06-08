# Mockingbird Knowledge API

Base URL defaults to:

```text
https://zgnknowledge.online
```

Override with:

```text
MOCKINGBIRD_KNOWLEDGE_BASE_URL=https://example.com
```

`MOCKINGBIRD_AGENT_ASSETS_BASE_URL` is accepted as a legacy alias.

## Search

```text
GET /api/agent/search?q=<query>&type=prompt|article|all&site=ai&limit=10&media=image|video|any&useCase=<intent>
```

Returns compact results with `type`, `id`, `title`, `summary`, `category`, `url`, `coverUrl`, `score`, `matchedText`, `updatedAt`, `mediaTypes`, `outputFormats`, `useCases`, and `qualitySignals`.

## Prompt Detail

```text
GET /api/agent/prompts/:id
```

Returns prompt text, usage metadata, and asset fields. Media fields are URLs only.

Important fields:

- `promptText`: full reusable prompt text.
- `mediaTypes`: `image` and/or `video` when media exists.
- `outputFormats`: expected outputs such as `image` or `video`.
- `qualitySignals`: cover/example/video/copy-count freshness signals.
- `mediaAssets`: structured media URL records with `type`, `role`, `url`, and `thumbnailUrl`.

## Article Detail

```text
GET /api/agent/articles/:slug?site=ai&maxChars=8000
```

Returns normalized markdown text and metadata. `truncated` is true when `maxChars` shortened the article.

Article detail also returns `mediaTypes`, `outputFormats`, `qualitySignals`, and `mediaAssets`.

## Safety

This skill must not call:

- `/api/agent/index`
- `/api/revalidate/content`
- `/api/jobs`
- any R2 URL requiring credentials
