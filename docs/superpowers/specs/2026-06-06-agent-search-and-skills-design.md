# Agent Search And Skills Design

## Goal

Expose Mockingbird Knowledge articles and prompts to other agents through a reliable skill interface without making R2 the live search backend.

The system should let agents find recent and useful prompts or articles by natural-language intent, then fetch detail only when needed. Search requests should read a prebuilt index, not article markdown or media objects from R2.

## Scope

In scope:

- A backend Agent search index for published articles and active prompts.
- Agent-facing read APIs for search, prompt detail, and article detail.
- Protected indexing APIs and jobs that refresh the index after prompt sync and article publish.
- A small update to the internal `console-knowledge-handoff` skill so article publishing triggers and verifies indexing.
- A new external read-only `mockingbird-agent-assets` skill with scripts that call the Agent APIs.
- R2 pressure control through indexing, caching, result limits, and media access rules.

Out of scope:

- Replacing the existing article pages, prompt pages, or public browsing UI.
- Moving article storage out of R2.
- Letting external agents write, stage, review, publish, or mutate content.
- Making the internal handoff skill public.
- Building a dedicated vector database in the first implementation pass.

## Current State

Prompts live in the MySQL `Prompts` table. `getPagedPrompts` currently filters with `Title LIKE ? OR Description LIKE ?`, then orders by `CreatedAt DESC`.

Articles are loaded from article source manifests. For R2 sources, the site reads `manifest.json` to build the article directory and reads article markdown only on detail access through `fetchArticleMarkdown`.

This is already a good R2 boundary for the website, but it is not enough for agent search. If agents searched by reading R2 markdown on each request, common semantic queries would be slow and would create unnecessary R2 read operations.

## Architecture

The system has four layers:

```text
Content sources
Prompts table + R2 article manifest and markdown
        ↓
Indexing jobs
Read changed content, normalize text, chunk, embed
        ↓
Agent search index
MySQL document and chunk tables
        ↓
Agent APIs and skills
Search index first, fetch detail only on demand
```

R2 remains the source of truth for article markdown and media assets. The Agent search index is a derived read model.

## Data Model

Add `AgentSearchDocuments` for one searchable content item:

| Field | Purpose |
| --- | --- |
| `Id` | Internal primary key |
| `ContentType` | `prompt` or `article` |
| `ContentId` | Prompt id as string or article slug |
| `Site` | Article site such as `ai`; prompts can use `ai` |
| `Title` | Display title |
| `Summary` | Short display summary |
| `Category` | Category code |
| `PublicUrl` | Canonical public URL |
| `CoverUrl` | Cover image URL, returned as URL only |
| `SearchableText` | Normalized text used for keyword retrieval |
| `MetadataJson` | Tags, author, source, copy count, source platform |
| `SourceUpdatedAt` | Source content update time |
| `ContentHash` | Hash of indexed source content |
| `IndexedAt` | Last successful indexing time |

Add `AgentSearchChunks` for semantic and snippet retrieval:

| Field | Purpose |
| --- | --- |
| `Id` | Internal primary key |
| `DocumentId` | Foreign key to `AgentSearchDocuments` |
| `ChunkIndex` | Stable chunk order |
| `ChunkText` | Text used for snippet and embedding |
| `ChunkHash` | Hash for idempotent updates |
| `EmbeddingJson` | Vector stored as JSON in the first pass |
| `EmbeddingModel` | Embedding model name |
| `EmbeddedAt` | Last embedding time |

Indexes:

- Unique key on `(ContentType, Site, ContentId)`.
- Normal indexes on `ContentType`, `Site`, `Category`, `SourceUpdatedAt`, and `IndexedAt`.
- Full-text index on `Title`, `Summary`, and `SearchableText` where MySQL configuration supports it.

The first implementation can store embeddings as JSON and compute cosine similarity in application code for the candidate set. This keeps the schema simple and preserves the option to move chunks into a vector database later.

## Indexing Flow

### Prompt Indexing

Prompt indexing reads active rows from `Prompts`.

For each prompt, build `SearchableText` from:

- title
- description
- category
- author
- source URL host or source name
- prompt content, truncated or summarized when very long
- optional usage tags inferred from title and description

Prompt chunks should prioritize the title, description, and useful prompt body sections. Long prompt content should be chunked to avoid diluting the purpose signal.

Prompt sync should trigger indexing after it writes new or changed prompt rows. If indexing fails, prompt sync can still complete, but logs and job output must report the indexing failure and affected ids.

### Article Indexing

Article indexing reads the article directory from the manifest, then reads R2 markdown only for articles whose source hash or update timestamp changed.

For each article:

1. Load the manifest entry.
2. Compare `ContentHash` or `updatedAt` against the current index row.
3. If unchanged, skip the R2 markdown read.
4. If changed, read markdown from R2 or local source.
5. Strip frontmatter and normalize markdown text.
6. Build the document row.
7. Chunk the body by headings and paragraph boundaries.
8. Generate embeddings for changed chunks.
9. Replace stale chunks for that document.

The preferred future improvement is adding a content hash to the R2 manifest for each article. Until then, indexing can use `updatedAt` plus an indexed content hash computed after reading changed markdown.

## Agent APIs

### `GET /api/agent/search`

Query parameters:

- `q`: required search query, trimmed and length-limited.
- `type`: `prompt`, `article`, or `all`; default `all`.
- `site`: default `ai`.
- `category`: optional category code.
- `limit`: default 10, max 20.
- `includeContent`: default `false`; when false, return snippets only.

Response shape:

```json
{
  "success": true,
  "data": {
    "query": "产品海报提示词",
    "items": [
      {
        "type": "prompt",
        "id": "123",
        "title": "Product poster prompt",
        "summary": "A reusable image prompt...",
        "category": "gpt-image-2",
        "url": "https://zgnknowledge.online/ai/prompts/123",
        "coverUrl": "https://...",
        "score": 0.87,
        "matchedText": "Relevant snippet...",
        "updatedAt": "2026-06-06T00:00:00.000Z"
      }
    ]
  }
}
```

Search should use hybrid retrieval:

1. Keyword candidates from title, summary, category, and searchable text.
2. Semantic candidates from query embedding against chunk embeddings.
3. Merge by document id.
4. Rerank by semantic score, keyword score, prompt copy count, updated time, and category match.

### `GET /api/agent/prompts/:id`

Returns prompt detail for an active prompt. The response should be compact and text-first:

- id
- title
- description
- content
- category
- author
- source URL
- public URL
- media URLs as metadata only
- created and updated time

The endpoint should not download or proxy prompt media.

### `GET /api/agent/articles/:slug`

Returns article detail for a published article.

Defaults:

- `site=ai`
- return title, summary, metadata, public URL, and normalized markdown text
- media URLs remain URLs
- optional `maxChars` limits response size

This endpoint may read R2 markdown, but it should use server-side caching. Search should not call this endpoint internally for every result.

### `POST /api/agent/index`

Protected endpoint for indexing.

Payload examples:

```json
{ "type": "article", "site": "ai", "slug": "agent-workflow" }
```

```json
{ "type": "prompt", "id": 123 }
```

```json
{ "type": "all", "site": "ai" }
```

Authentication should use the existing admin-token pattern, preferably `KNOWLEDGE_ADMIN_TOKEN` or `ADMIN_API_TOKEN`. The endpoint should return indexing status and affected ids.

## R2 Pressure Control

The main rule is simple: search never reads R2.

Controls:

- Article indexing reads R2 only for new or changed articles.
- Article detail responses are cached.
- Search responses return snippets and URLs, not image or video bytes.
- Skill scripts do not download media by default.
- `limit` and `maxChars` have strict upper bounds.
- Repeated query embeddings can be cached.
- Index jobs log R2 reads so unusual spikes are visible.

CDN caching should remain responsible for public image and video URL access. Agent APIs should avoid proxying those assets unless a future feature explicitly requires it.

## Internal Skill Update

Update the internal `console-knowledge-handoff` skill without changing its core purpose.

It remains responsible for:

- reading Console handoff JSON
- staging review drafts
- generating article covers
- waiting for user approval
- publishing into the R2 article state machine
- revalidating the public site

Add one post-publish responsibility:

```text
After manifest update and public revalidation succeed,
call POST /api/agent/index with type=article, site=ai, slug=<slug>.
```

Update `SKILL.md` and the publish script so the publish verification also checks that Agent search can find the article by title or slug.

Indexing failure should not automatically roll back article publishing. Publishing has already mutated R2 and the manifest. Instead, the skill must report:

```text
Published successfully. Agent indexing failed for <slug>. Retry POST /api/agent/index.
```

This keeps publishing and search freshness related but not transactionally coupled.

## External Skill

Create a separate read-only skill named `mockingbird-agent-assets`.

Suggested structure:

```text
mockingbird-agent-assets/
├── SKILL.md
├── agents/
│   └── openai.yaml
├── scripts/
│   ├── search.mjs
│   ├── get-prompt.mjs
│   └── get-article.mjs
└── references/
    └── api.md
```

The external skill should:

- search prompts and articles by user intent
- fetch prompt detail by id
- fetch article detail by slug
- cite returned public URLs
- avoid downloading media unless the user explicitly asks for visual inspection

The external skill must not:

- use R2 credentials
- call publish or indexing endpoints
- require admin tokens
- mutate prompts or articles
- know about internal review or state-machine paths

Scripts should accept a base URL from environment, defaulting to the production site:

```text
MOCKINGBIRD_AGENT_ASSETS_BASE_URL=https://zgnknowledge.online
```

Example script use:

```bash
node scripts/search.mjs "适合生成产品海报的提示词" --type prompt --limit 5
node scripts/get-prompt.mjs 123
node scripts/get-article.mjs agent-workflow --site ai --maxChars 8000
```

## Error Handling

Search API:

- Return `400` for missing or invalid query.
- Return empty results for valid queries with no match.
- Return `503` when the search index is unavailable.
- Include concise errors; do not expose database or R2 credentials.

Index API:

- Return per-item status for bulk indexing.
- Mark skipped items separately from failed items.
- Log content id, content type, and reason.
- Do not delete an existing index row until replacement chunks are ready.

Skill scripts:

- Print compact JSON by default.
- Exit non-zero on API errors.
- Include the endpoint and status code in error output.
- Never print tokens.

## Testing

Backend tests:

- Schema migration creates document and chunk tables.
- Prompt indexing upserts a changed prompt and skips unchanged content.
- Article indexing skips unchanged manifest entries and reads changed article markdown.
- Search endpoint enforces query, type, and limit validation.
- Search endpoint returns prompt and article results without calling `fetchArticleMarkdown`.
- Article detail endpoint can still fetch and cache article markdown.
- Protected index endpoint rejects missing or invalid admin token.

Skill tests:

- External `search.mjs` formats a valid search response.
- External detail scripts handle 404 and non-JSON API errors.
- Internal handoff publish flow calls the Agent index endpoint after revalidation.
- Internal handoff reports indexing failure without pretending the article was unpublished.

Operational verification:

- Publish one article through `console-knowledge-handoff`.
- Confirm `/api/articles?action=slugs&site=ai` includes the slug.
- Confirm `/api/agent/search?q=<title keyword>&type=article` includes the slug.
- Sync one prompt source.
- Confirm `/api/agent/search?q=<prompt use case>&type=prompt` returns the prompt.

## Rollout

1. Add search index schema and indexing services.
2. Implement keyword-only Agent search MVP.
3. Hook prompt indexing into prompt sync.
4. Hook article indexing into protected index API.
5. Update `console-knowledge-handoff` publish flow to trigger and verify article indexing.
6. Add embeddings and hybrid reranking.
7. Create the external `mockingbird-agent-assets` read-only skill.
8. Add monitoring for index freshness, indexing failures, and R2 reads during indexing.

The first production release can ship with keyword search and indexing hooks before embeddings are enabled. The API shape should stay stable so the external skill does not need to change when semantic search is added.

