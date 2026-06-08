# Agent Assetization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert existing Mockingbird prompts and articles into structured, reusable agent assets before adding smarter vector search.

**Architecture:** Keep the existing Agent Search MVP as the retrieval layer, then add an asset contract layer that normalizes prompt/article metadata, media URLs, usage notes, and quality signals. Search results expose lightweight asset signals; detail endpoints return complete text-first asset packages without downloading or proxying media.

**Tech Stack:** Next.js App Router route handlers, TypeScript, mysql2, Vitest, Node ESM skill scripts, existing R2/CDN media URLs.

---

## Why This Is A New Plan

The existing `2026-06-06-agent-search-and-skills.md` plan can support the search/indexing MVP, but it should not absorb all assetization work.

It already covers:

- Agent-facing search and detail APIs.
- MySQL search index tables.
- Article and prompt indexing triggers.
- External read-only `mockingbird-agent-assets` skill shell.

It does not fully cover:

- A stable asset contract for prompts and articles.
- Structured image/video media metadata.
- Prompt-specific usage packaging.
- Media-aware search filters.
- Data completeness audits for every existing prompt/article.
- Skill behavior that helps another agent choose, cite, and use assets correctly.

This plan builds on the existing MVP without replacing it.

## File Structure

- Create `lib/services/agent-asset-types.ts`: shared asset contract types for articles, prompts, media, usage guidance, and quality signals.
- Create `lib/services/agent-asset-normalizer.ts`: converts existing `Prompt` and `ArticleDetail` objects into agent asset shapes.
- Modify `lib/services/agent-search-types.ts`: add lightweight asset summary fields to search result items.
- Modify `lib/services/agent-search-indexer.ts`: store media and asset metadata in `MetadataJson` during prompt/article indexing.
- Modify `lib/services/agent-search-service.ts`: expose asset summaries in search results and full asset packages in detail endpoints.
- Modify `app/api/agent/search/route.ts`: accept `media=image|video|any`, `assetType=prompt|article`, and `useCase` query filters where supported by the index.
- Modify `app/api/agent/prompts/[id]/route.ts`: return prompt asset contract fields.
- Modify `app/api/agent/articles/[slug]/route.ts`: return article asset contract fields.
- Create `scripts/agent-assets-audit.mjs`: audits all active prompts and published articles for asset completeness.
- Modify `skills/mockingbird-agent-assets/SKILL.md`: document media-aware search and asset usage rules.
- Modify `skills/mockingbird-agent-assets/references/api.md`: document the asset contract.
- Modify `skills/mockingbird-agent-assets/scripts/search.mjs`: pass through `--media`, `--useCase`, and `--category`.
- Modify `skills/mockingbird-agent-assets/scripts/get-prompt.mjs`: no route change, but output now includes asset fields.
- Modify `/Users/grank/.codex/skills/mockingbird-agent-assets/*`: sync installed skill from repo package after verification.
- Test `tests/unit/agent-asset-normalizer.test.ts`.
- Test `tests/unit/agent-search-assets.test.ts`.
- Test `tests/unit/agent-assets-audit.test.ts`.
- Test `tests/unit/mockingbird-agent-assets-skill.test.ts`.

## Asset Contract

All agent-facing assets should follow this shape at the API boundary:

```ts
export type AgentAssetKind = 'prompt' | 'article';
export type AgentMediaType = 'image' | 'video';
export type AgentMediaRole =
    | 'cover'
    | 'example'
    | 'input-reference'
    | 'output-preview'
    | 'video-preview'
    | 'thumbnail';

export interface AgentMediaAsset {
    type: AgentMediaType;
    role: AgentMediaRole;
    url: string;
    thumbnailUrl: string | null;
    alt: string | null;
    width: number | null;
    height: number | null;
    durationSeconds: number | null;
}

export interface AgentAssetSummary {
    assetKind: AgentAssetKind;
    mediaTypes: AgentMediaType[];
    useCases: string[];
    outputFormats: string[];
    qualitySignals: {
        hasCover: boolean;
        hasVideo: boolean;
        hasExamples: boolean;
        copyCount: number | null;
        updatedAt: string | null;
    };
}

export interface AgentPromptAsset extends AgentAssetSummary {
    assetKind: 'prompt';
    inputsRequired: string[];
    promptText: string;
    usageNotes: string[];
    media: AgentMediaAsset[];
}

export interface AgentArticleAsset extends AgentAssetSummary {
    assetKind: 'article';
    content: string;
    truncated: boolean;
    media: AgentMediaAsset[];
}
```

## Task 1: Asset Types And Normalizer

**Files:**
- Create: `lib/services/agent-asset-types.ts`
- Create: `lib/services/agent-asset-normalizer.ts`
- Test: `tests/unit/agent-asset-normalizer.test.ts`

- [ ] **Step 1: Write failing normalizer tests**

Create tests that prove prompt media becomes structured assets:

```ts
it('normalizes prompt images and videos into media assets', () => {
    const asset = normalizePromptAsset({
        id: 7,
        title: 'Product poster prompt',
        description: 'Create ecommerce posters.',
        content: 'Use the uploaded product photo...',
        category: 'gpt-image-2',
        coverImageUrl: 'https://assets.example/cover.jpg',
        videoPreviewUrl: 'https://assets.example/full.mp4',
        cardPreviewVideoUrl: 'https://assets.example/card.mp4',
        imagesJson: JSON.stringify(['https://assets.example/example-1.jpg']),
        copyCount: 42,
        isActive: true,
        createdAt: '2026-06-01T00:00:00.000Z',
        updatedAt: '2026-06-02T00:00:00.000Z',
    });

    expect(asset.mediaTypes).toEqual(['image', 'video']);
    expect(asset.media).toEqual(expect.arrayContaining([
        expect.objectContaining({ type: 'image', role: 'cover', url: 'https://assets.example/cover.jpg' }),
        expect.objectContaining({ type: 'image', role: 'example', url: 'https://assets.example/example-1.jpg' }),
        expect.objectContaining({ type: 'video', role: 'video-preview', url: 'https://assets.example/full.mp4' }),
    ]));
    expect(asset.qualitySignals).toMatchObject({ hasCover: true, hasVideo: true, hasExamples: true, copyCount: 42 });
});
```

Run:

```bash
npm test -- tests/unit/agent-asset-normalizer.test.ts
```

Expected: FAIL because the normalizer does not exist.

- [ ] **Step 2: Implement asset type definitions**

Create `lib/services/agent-asset-types.ts` with the contract from the Asset Contract section. Keep fields URL-only for media; do not add binary media handling.

- [ ] **Step 3: Implement prompt media normalization**

Create `normalizePromptAsset(prompt)` in `lib/services/agent-asset-normalizer.ts`.

Rules:

- `coverImageUrl` becomes `{ type: 'image', role: 'cover' }`.
- `imagesJson` string array becomes `{ type: 'image', role: 'example' }`.
- `videoPreviewUrl` becomes `{ type: 'video', role: 'video-preview' }`.
- `cardPreviewVideoUrl` becomes an additional video asset with role `thumbnail` only if it differs from `videoPreviewUrl`.
- Invalid `imagesJson` becomes an empty example list.
- `mediaTypes` is unique and ordered as `image`, then `video`.
- `useCases` starts with category and inferred title/description keywords.
- `outputFormats` starts with `image` when image media exists, `video` when video media exists, and `text` for articles.

- [ ] **Step 4: Implement article normalization**

Create `normalizeArticleAsset(article, options)`:

- `coverUrl` becomes image cover media.
- `assetKind` is `article`.
- `mediaTypes` is `['image']` only when a cover exists.
- `useCases` includes category and source platform when present.
- `outputFormats` includes `text`.
- It accepts already-truncated article content and preserves `truncated`.

- [ ] **Step 5: Run tests**

Run:

```bash
npm test -- tests/unit/agent-asset-normalizer.test.ts
```

Expected: PASS.

## Task 2: Index Asset Metadata

**Files:**
- Modify: `lib/services/agent-search-indexer.ts`
- Test: `tests/unit/agent-search-indexer.test.ts`

- [ ] **Step 1: Write failing index metadata tests**

Extend existing prompt indexer tests to assert `MetadataJson` contains:

```json
{
  "assetKind": "prompt",
  "mediaTypes": ["image", "video"],
  "useCases": ["gpt-image-2"],
  "outputFormats": ["image", "video"],
  "qualitySignals": {
    "hasCover": true,
    "hasVideo": true,
    "hasExamples": true,
    "copyCount": 8
  }
}
```

Run:

```bash
npm test -- tests/unit/agent-search-indexer.test.ts
```

Expected: FAIL until indexer stores asset metadata.

- [ ] **Step 2: Use normalizer in prompt indexing**

In `indexPrompt`, call `normalizePromptAsset(prompt)` and merge the returned summary into `metadata`.

The stored metadata should include:

- `assetKind`
- `mediaTypes`
- `useCases`
- `outputFormats`
- `qualitySignals`
- existing `author`, `sourceUrl`, `copyCount`

- [ ] **Step 3: Use normalizer in article indexing**

In `indexArticle`, call `normalizeArticleAsset(...)` with directory-entry data and merge summary fields into `metadata`.

Do not read or download media. Only use existing URLs from manifest/directory entries.

- [ ] **Step 4: Run tests**

Run:

```bash
npm test -- tests/unit/agent-search-indexer.test.ts tests/unit/agent-asset-normalizer.test.ts
```

Expected: PASS.

## Task 3: Asset-Aware Search Results

**Files:**
- Modify: `lib/services/agent-search-types.ts`
- Modify: `lib/services/agent-search-service.ts`
- Modify: `app/api/agent/search/route.ts`
- Test: `tests/unit/agent-search-assets.test.ts`

- [ ] **Step 1: Write failing search response tests**

Create `tests/unit/agent-search-assets.test.ts` to verify search maps metadata into result fields:

```ts
expect(payload.data.items[0]).toMatchObject({
    type: 'prompt',
    assetKind: 'prompt',
    mediaTypes: ['image', 'video'],
    useCases: ['gpt-image-2'],
    outputFormats: ['image', 'video'],
    qualitySignals: {
        hasCover: true,
        hasVideo: true,
        hasExamples: true,
        copyCount: 20,
    },
});
```

Also add a media filter test:

```ts
await GET(new NextRequest('http://localhost:5046/api/agent/search?q=poster&type=prompt&media=video'));
expect(mockQuery.mock.calls[0][0]).toContain('MetadataJson LIKE ?');
expect(mockQuery.mock.calls[0][1]).toEqual(expect.arrayContaining(['%"video"%']));
```

Run:

```bash
npm test -- tests/unit/agent-search-assets.test.ts
```

Expected: FAIL.

- [ ] **Step 2: Extend `AgentSearchResultItem`**

Add optional asset fields:

```ts
assetKind: AgentAssetKind;
mediaTypes: AgentMediaType[];
useCases: string[];
outputFormats: string[];
qualitySignals: AgentAssetQualitySignals;
```

Default missing metadata to safe empty values.

- [ ] **Step 3: Parse asset metadata in `mapSearchRow`**

Parse `MetadataJson` defensively. Invalid JSON should not fail search. Use defaults:

```ts
{
    assetKind: row.ContentType,
    mediaTypes: [],
    useCases: [],
    outputFormats: row.ContentType === 'article' ? ['text'] : [],
    qualitySignals: {
        hasCover: Boolean(row.CoverUrl),
        hasVideo: false,
        hasExamples: false,
        copyCount: null,
        updatedAt: toIso(row.SourceUpdatedAt),
    },
}
```

- [ ] **Step 4: Add media filter parsing**

In `app/api/agent/search/route.ts`, accept:

```text
media=image|video|any
useCase=<string>
```

In `searchAgentIndex`, add conditions:

- `media=image` -> `d.MetadataJson LIKE '%"image"%'`
- `media=video` -> `d.MetadataJson LIKE '%"video"%'`
- `useCase=poster` -> escaped LIKE against `SearchableText` and `MetadataJson`

Keep these as MVP filters. Do not add a new table in this task.

- [ ] **Step 5: Run tests**

Run:

```bash
npm test -- tests/unit/agent-search-assets.test.ts tests/unit/agent-search-api.test.ts
```

Expected: PASS.

## Task 4: Asset Detail Endpoints

**Files:**
- Modify: `lib/services/agent-search-service.ts`
- Modify: `app/api/agent/prompts/[id]/route.ts`
- Modify: `app/api/agent/articles/[slug]/route.ts`
- Test: `tests/unit/agent-search-api.test.ts`

- [ ] **Step 1: Write failing detail tests**

Extend prompt detail tests so `payload.data` includes:

```ts
expect(payload.data).toMatchObject({
    type: 'prompt',
    assetKind: 'prompt',
    mediaTypes: ['image'],
    promptText: 'Prompt body',
    usageNotes: expect.any(Array),
    media: [
        expect.objectContaining({ type: 'image', role: 'cover' }),
    ],
});
```

Extend article detail tests so `payload.data` includes:

```ts
expect(payload.data).toMatchObject({
    type: 'article',
    assetKind: 'article',
    outputFormats: ['text'],
    media: [],
});
```

Run:

```bash
npm test -- tests/unit/agent-search-api.test.ts
```

Expected: FAIL.

- [ ] **Step 2: Return normalized prompt asset fields**

In `getAgentPromptDetail`, call `normalizePromptAsset(prompt)` and merge its fields into the existing response.

Keep existing response fields for compatibility:

- `content`
- `media.coverImageUrl`
- `media.videoPreviewUrl`
- `media.cardPreviewVideoUrl`
- `media.imagesJson`

Add new fields:

- `assetKind`
- `mediaTypes`
- `useCases`
- `outputFormats`
- `qualitySignals`
- `promptText`
- `usageNotes`
- `mediaAssets`

Use `mediaAssets` for structured media to avoid conflicting with the existing `media` object.

- [ ] **Step 3: Return normalized article asset fields**

In `getAgentArticleDetail`, call `normalizeArticleAsset(...)` and merge:

- `assetKind`
- `mediaTypes`
- `useCases`
- `outputFormats`
- `qualitySignals`
- `mediaAssets`

Keep `coverUrl` and `content` unchanged.

- [ ] **Step 4: Run tests**

Run:

```bash
npm test -- tests/unit/agent-search-api.test.ts tests/unit/agent-asset-normalizer.test.ts
```

Expected: PASS.

## Task 5: Asset Completeness Audit

**Files:**
- Create: `scripts/agent-assets-audit.mjs`
- Test: `tests/unit/agent-assets-audit.test.ts`

- [ ] **Step 1: Write failing audit tests**

Test a pure helper exported by the script:

```js
const report = summarizeAssetCompleteness([
    { type: 'prompt', id: '1', title: 'A', mediaTypes: ['image'], qualitySignals: { hasCover: true, hasVideo: false, hasExamples: true } },
    { type: 'prompt', id: '2', title: 'B', mediaTypes: [], qualitySignals: { hasCover: false, hasVideo: false, hasExamples: false } },
]);

expect(report).toMatchObject({
    total: 2,
    prompts: 2,
    withCover: 1,
    withImage: 1,
    withVideo: 0,
    missingMedia: [{ type: 'prompt', id: '2', title: 'B' }],
});
```

Run:

```bash
npm test -- tests/unit/agent-assets-audit.test.ts
```

Expected: FAIL.

- [ ] **Step 2: Implement audit script**

The script should:

- Read active prompts via `/api/agent/search?q=<broad query>&type=prompt` is not reliable enough for full audit.
- Instead import DB/article helpers when run inside the repo.
- Build normalized prompt/article assets using `agent-asset-normalizer`.
- Print JSON summary by default.
- Accept `--format=markdown` for human review.
- Never fetch media bytes.

Command:

```bash
node scripts/agent-assets-audit.mjs --site=ai --format=markdown
```

- [ ] **Step 3: Report completeness buckets**

Report:

- total prompts
- total articles
- prompts with cover
- prompts with examples
- prompts with video
- articles with cover
- missing media
- invalid media JSON
- missing description/summary
- empty content

- [ ] **Step 4: Run tests**

Run:

```bash
npm test -- tests/unit/agent-assets-audit.test.ts
```

Expected: PASS.

## Task 6: Skill Package Upgrade

**Files:**
- Modify: `skills/mockingbird-agent-assets/SKILL.md`
- Modify: `skills/mockingbird-agent-assets/references/api.md`
- Modify: `skills/mockingbird-agent-assets/scripts/search.mjs`
- Modify: `/Users/grank/.codex/skills/mockingbird-agent-assets/SKILL.md`
- Modify: `/Users/grank/.codex/skills/mockingbird-agent-assets/references/api.md`
- Modify: `/Users/grank/.codex/skills/mockingbird-agent-assets/scripts/search.mjs`
- Test: `tests/unit/mockingbird-agent-assets-skill.test.ts`

- [ ] **Step 1: Write failing skill tests**

Extend the existing skill test to require:

```ts
expect(skill).toContain('--media=image');
expect(skill).toContain('--media=video');
expect(apiReference).toContain('mediaAssets');
expect(searchScript).toContain("url.searchParams.set('media'");
expect(searchScript).toContain("url.searchParams.set('useCase'");
```

Run:

```bash
npm test -- tests/unit/mockingbird-agent-assets-skill.test.ts
```

Expected: FAIL.

- [ ] **Step 2: Update search script**

Pass through:

```js
if (args.media) url.searchParams.set('media', String(args.media));
if (args.useCase) url.searchParams.set('useCase', String(args.useCase));
```

Keep existing `type`, `site`, `category`, and `limit`.

- [ ] **Step 3: Update skill instructions**

Add rules:

- Use `--media=image` when the user asks for visual/image prompts.
- Use `--media=video` when the user asks for video prompts or examples.
- Prefer search results with `qualitySignals.hasExamples=true` when the user asks for assets worth collecting.
- Do not download media; cite media URLs and public page URLs.
- Fetch detail before giving final prompt text.

- [ ] **Step 4: Update API reference**

Document:

- `media=image|video|any`
- `useCase=<string>`
- `mediaTypes`
- `outputFormats`
- `qualitySignals`
- `mediaAssets`

- [ ] **Step 5: Sync installed skill**

After repo package tests pass:

```bash
rm -rf /Users/grank/.codex/skills/mockingbird-agent-assets
cp -R skills/mockingbird-agent-assets /Users/grank/.codex/skills/mockingbird-agent-assets
```

- [ ] **Step 6: Run tests and script checks**

Run:

```bash
npm test -- tests/unit/mockingbird-agent-assets-skill.test.ts
node --check skills/mockingbird-agent-assets/scripts/search.mjs
node --check /Users/grank/.codex/skills/mockingbird-agent-assets/scripts/search.mjs
```

Expected: PASS.

## Task 7: Real Data Verification

**Files:**
- No required code files.
- Uses local dev server and existing `.env.local`.

- [ ] **Step 1: Run focused tests**

Run:

```bash
npm test -- tests/unit/agent-asset-normalizer.test.ts tests/unit/agent-search-assets.test.ts tests/unit/agent-search-api.test.ts tests/unit/agent-search-indexer.test.ts tests/unit/agent-assets-audit.test.ts tests/unit/mockingbird-agent-assets-skill.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run lint**

Run:

```bash
npm run lint
```

Expected: PASS.

- [ ] **Step 3: Start dev server**

Run:

```bash
npm run dev
```

Expected: server listens on `http://localhost:5046`.

- [ ] **Step 4: Reindex all assets**

Run:

```bash
curl -sS -X POST http://localhost:5046/api/agent/index \
  -H "Authorization: Bearer $KNOWLEDGE_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"type":"all","site":"ai"}'
```

Expected: JSON report with prompt/article items and no failed items.

- [ ] **Step 5: Verify media-aware prompt search**

Run:

```bash
node skills/mockingbird-agent-assets/scripts/search.mjs "产品海报" --type=prompt --media=image --limit=5
node skills/mockingbird-agent-assets/scripts/search.mjs "视频生成" --type=prompt --media=video --limit=5
```

Expected:

- Results contain `mediaTypes`.
- Image search returns at least one item with `mediaTypes` containing `image`.
- Video search returns at least one item with `mediaTypes` containing `video` if video prompts exist.

- [ ] **Step 6: Verify prompt detail package**

Run:

```bash
node skills/mockingbird-agent-assets/scripts/get-prompt.mjs <prompt-id-from-search>
```

Expected:

- Response includes `promptText`.
- Response includes `mediaAssets`.
- Response keeps media as URLs only.

- [ ] **Step 7: Run asset audit**

Run:

```bash
node scripts/agent-assets-audit.mjs --site=ai --format=markdown
```

Expected:

- Report lists completeness totals.
- Missing-media prompts/articles are explicit.
- The report gives enough information for a follow-up cleanup/import pass.

- [ ] **Step 8: Stop dev server**

Stop the dev server cleanly before ending the work session.

## Rollout

1. Merge the Agent Search MVP branch only after current tests/build remain green.
2. Implement this assetization plan on top of the same branch or a follow-up branch.
3. Run the full asset audit before enabling public messaging around `mockingbird-agent-assets`.
4. Fix missing prompt media and malformed `ImagesJson` based on the audit.
5. Only after the asset contract is stable, add vector embeddings and hybrid search reranking.

## Acceptance Criteria

- Every prompt/article detail response has a stable asset contract.
- Prompt media is represented as structured URL metadata, not binary downloads.
- Search results expose media and quality signals.
- `mockingbird-agent-assets` can find image/video prompts intentionally.
- A full-data audit shows which existing assets are complete and which need cleanup.
- Existing API fields remain backward-compatible.

