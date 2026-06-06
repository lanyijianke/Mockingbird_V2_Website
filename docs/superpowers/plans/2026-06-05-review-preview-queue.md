# Review Preview Queue Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a protected review queue and review preview flow so Console handoff articles staged in R2 `review` can be inspected, verified against source metadata, and approved later without entering the public `ai/manifest.json`.

**Architecture:** Keep published article behavior unchanged: public pages still read only `ai/manifest.json`. Add a separate admin-only review service that reads R2 state files, review Markdown, review metadata, and assets directly from `ai/state/articles/*` and `ai/articles/review/*`. Expose it through authenticated API routes and a client-side admin UI that asks for an admin token and sends it as `x-admin-token`, avoiding tokenized public URLs.

**Tech Stack:** Next.js App Router, TypeScript, R2 through S3-compatible AWS SDK, existing `verifyAdminHeaders()`, `unified` Markdown rendering, Vitest.

---

## File Structure

- Create `lib/articles/review-directory.ts`
  - Lists review article state documents from R2.
  - Reads one review article by slug.
  - Reads optional review metadata from `ai/articles/review/<slug>/review.json`.
  - Rewrites relative Markdown images to the configured R2 public asset URL.

- Modify `lib/articles/r2-client.ts`
  - Add `listR2ObjectKeys(bucket, prefix)` using `ListObjectsV2Command`.

- Create `lib/articles/render-markdown.ts`
  - Move Markdown rendering logic shared by public article detail pages and review preview.

- Modify `app/ai/articles/[slug]/page.tsx`
  - Use `renderArticleMarkdown()` instead of duplicating `unified()` setup.

- Create `app/api/admin/articles/review/route.ts`
  - Authenticated `GET`.
  - Returns all review-state articles.

- Create `app/api/admin/articles/review/[slug]/route.ts`
  - Authenticated `GET`.
  - Returns review article detail, rendered HTML, TOC, and evidence metadata.

- Create `app/admin/articles/review/page.tsx`
  - Noindex server page shell for the review queue.

- Create `app/admin/articles/review/ReviewQueueClient.tsx`
  - Token input.
  - Fetches `/api/admin/articles/review`.
  - Lists review articles with title, slug, updated time, source URL, review method, and link to detail.

- Create `app/admin/articles/review/[slug]/page.tsx`
  - Noindex server page shell for one review article.

- Create `app/admin/articles/review/[slug]/ReviewArticleClient.tsx`
  - Token input.
  - Fetches `/api/admin/articles/review/[slug]`.
  - Shows evidence panel: source URL, handoff locator, source content id, exportedAt, state version, checksum, updatedBy, review method, checker report.
  - Renders translated article preview using the same article reader style.
  - Does not include any publish button in this plan.

- Modify `scripts/console-knowledge-handoff-core.mjs`
  - Add optional `sourceLocator`, `translationReview`, and `checkerReport` input fields.
  - Write review metadata to `ai/articles/review/<slug>/review.json`.

- Modify `tests/unit/console-knowledge-handoff-importer.test.ts`
  - Assert review metadata is written for staged handoffs.

- Create `tests/unit/article-review-directory.test.ts`
  - Unit tests for listing and reading review R2 state.

- Create `tests/unit/article-review-api.test.ts`
  - Unit tests for auth and successful API payloads.

- Create `tests/unit/article-review-pages.test.ts`
  - Smoke tests that admin pages render token-gated UI and are noindex.

---

## Task 1: Add R2 Listing Support

**Files:**
- Modify: `lib/articles/r2-client.ts`
- Test: `tests/unit/r2-article-client.test.ts`

- [ ] **Step 1: Write failing tests for object listing**

Add to `tests/unit/r2-article-client.test.ts`:

```ts
it('lists R2 object keys under a prefix', async () => {
    process.env.KNOWLEDGE_R2_ACCOUNT_ID = 'account-id';
    process.env.KNOWLEDGE_R2_ACCESS_KEY_ID = 'access-key';
    process.env.KNOWLEDGE_R2_SECRET_ACCESS_KEY = 'secret-key';

    const send = vi
        .fn()
        .mockResolvedValueOnce({
            Contents: [
                { Key: 'ai/state/articles/one.json' },
                { Key: 'ai/state/articles/two.json' },
            ],
            IsTruncated: true,
            NextContinuationToken: 'next-page',
        })
        .mockResolvedValueOnce({
            Contents: [{ Key: 'ai/state/articles/three.json' }],
            IsTruncated: false,
        });

    vi.mocked(S3Client).mockImplementation(function mockS3Client() {
        return { send } as unknown as S3Client;
    } as unknown as typeof S3Client);

    const { listR2ObjectKeys } = await import('@/lib/articles/r2-client');
    await expect(listR2ObjectKeys('knowledge-articles', 'ai/state/articles/')).resolves.toEqual([
        'ai/state/articles/one.json',
        'ai/state/articles/two.json',
        'ai/state/articles/three.json',
    ]);

    expect(send).toHaveBeenCalledTimes(2);
});
```

- [ ] **Step 2: Run the focused test and confirm it fails**

Run:

```bash
npm test -- tests/unit/r2-article-client.test.ts
```

Expected: FAIL because `listR2ObjectKeys` is not exported.

- [ ] **Step 3: Implement `listR2ObjectKeys`**

Modify `lib/articles/r2-client.ts`:

```ts
import { GetObjectCommand, ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3';
```

Append:

```ts
export async function listR2ObjectKeys(bucket: string, prefix: string): Promise<string[]> {
    const client = getR2Client();
    const keys: string[] = [];
    let continuationToken: string | undefined;

    do {
        const response = await client.send(new ListObjectsV2Command({
            Bucket: bucket,
            Prefix: prefix,
            ContinuationToken: continuationToken,
        }));

        for (const object of response.Contents || []) {
            if (object.Key) keys.push(object.Key);
        }

        continuationToken = response.IsTruncated ? response.NextContinuationToken : undefined;
    } while (continuationToken);

    return keys;
}
```

- [ ] **Step 4: Re-run the focused test**

Run:

```bash
npm test -- tests/unit/r2-article-client.test.ts
```

Expected: PASS.

---

## Task 2: Add Review Directory Service

**Files:**
- Create: `lib/articles/review-directory.ts`
- Test: `tests/unit/article-review-directory.test.ts`

- [ ] **Step 1: Write failing service tests**

Create `tests/unit/article-review-directory.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/articles/r2-client', () => ({
    listR2ObjectKeys: vi.fn(),
    readR2ObjectText: vi.fn(),
}));

describe('article review directory', () => {
    beforeEach(() => {
        vi.resetModules();
        vi.clearAllMocks();
        process.env.KNOWLEDGE_ARTICLE_R2_SOURCES = JSON.stringify([
            {
                site: 'ai',
                source: 'web-article',
                bucket: 'knowledge-articles',
                prefix: 'ai',
                manifestPath: 'manifest.json',
                publicBaseUrl: 'https://assets.zgnknowledge.online/ai',
            },
        ]);
    });

    it('lists only review state documents', async () => {
        const { listR2ObjectKeys, readR2ObjectText } = await import('@/lib/articles/r2-client');
        vi.mocked(listR2ObjectKeys).mockResolvedValue([
            'ai/state/articles/review-one.json',
            'ai/state/articles/published-one.json',
        ]);
        vi.mocked(readR2ObjectText)
            .mockResolvedValueOnce(JSON.stringify({
                schemaVersion: 1,
                site: 'ai',
                source: 'web-article',
                slug: 'review-one',
                state: 'review',
                version: 2,
                contentKey: 'ai/articles/review/review-one/index.md',
                assetPrefix: 'ai/articles/review/review-one',
                checksum: 'sha256:review',
                updatedAt: '2026-06-05T10:45:00.000Z',
                updatedBy: 'unit-test',
            }))
            .mockResolvedValueOnce(JSON.stringify({
                schemaVersion: 1,
                site: 'ai',
                source: 'web-article',
                slug: 'published-one',
                state: 'published',
                version: 1,
                contentKey: 'ai/articles/published/published-one/index.md',
                assetPrefix: 'ai/articles/published/published-one',
                checksum: 'sha256:published',
                updatedAt: '2026-06-04T10:45:00.000Z',
                updatedBy: 'unit-test',
            }));

        const { listReviewArticles } = await import('@/lib/articles/review-directory');
        await expect(listReviewArticles('ai')).resolves.toEqual([
            expect.objectContaining({
                slug: 'review-one',
                state: 'review',
                updatedBy: 'unit-test',
            }),
        ]);
    });

    it('reads review markdown, metadata, and rewrites relative images', async () => {
        const { readR2ObjectText } = await import('@/lib/articles/r2-client');
        vi.mocked(readR2ObjectText)
            .mockResolvedValueOnce(JSON.stringify({
                schemaVersion: 1,
                site: 'ai',
                source: 'web-article',
                slug: 'review-one',
                state: 'review',
                version: 2,
                contentKey: 'ai/articles/review/review-one/index.md',
                assetPrefix: 'ai/articles/review/review-one',
                checksum: 'sha256:review',
                updatedAt: '2026-06-05T10:45:00.000Z',
                updatedBy: 'unit-test',
            }))
            .mockResolvedValueOnce('# 标题\n\n![封面](images/cover.jpg)\n\n正文')
            .mockResolvedValueOnce(JSON.stringify({
                schemaVersion: 1,
                sourceLocator: 'r2://content-hub-r2/knowledge-imports/console/item.json',
                originalUrl: 'https://example.com/source',
                sourceContentId: 'source-1',
                exportedAt: '2026-06-05T10:00:00.000Z',
                translationReview: {
                    method: 'parallel-subagents-maker-checker',
                    checkerReport: 'PASS',
                },
            }));

        const { getReviewArticleBySlug } = await import('@/lib/articles/review-directory');
        const article = await getReviewArticleBySlug('review-one', 'ai');

        expect(article?.contentMarkdown).toContain(
            '![封面](https://assets.zgnknowledge.online/ai/articles/review/review-one/images/cover.jpg)'
        );
        expect(article?.metadata.sourceLocator).toBe('r2://content-hub-r2/knowledge-imports/console/item.json');
        expect(article?.metadata.translationReview?.checkerReport).toBe('PASS');
    });
});
```

- [ ] **Step 2: Run the failing test**

Run:

```bash
npm test -- tests/unit/article-review-directory.test.ts
```

Expected: FAIL because `lib/articles/review-directory.ts` does not exist.

- [ ] **Step 3: Implement review directory types and helpers**

Create `lib/articles/review-directory.ts`:

```ts
import matter from 'gray-matter';
import { loadArticleSourceConfigs } from './source-config';
import { listR2ObjectKeys, readR2ObjectText } from './r2-client';
import type { ArticleSite, ArticleStateDocument, R2ArticleSourceConfig } from './source-types';

export interface ReviewMetadata {
    schemaVersion: 1;
    sourceLocator?: string | null;
    originalUrl?: string | null;
    sourcePlatform?: string | null;
    sourceType?: string | null;
    sourceContentId?: string | null;
    exportedAt?: string | null;
    title?: string | null;
    summary?: string | null;
    category?: string | null;
    language?: string | null;
    translationReview?: {
        method?: string;
        translatedChunks?: number;
        checkerReport?: string;
        checkerStatus?: string;
    } | null;
}

export interface ReviewArticleListItem {
    site: ArticleSite;
    source: string;
    slug: string;
    state: 'review';
    version: number;
    title: string;
    summary: string;
    originalUrl: string | null;
    sourceLocator: string | null;
    reviewMethod: string | null;
    contentKey: string;
    assetPrefix: string;
    checksum: string;
    updatedAt: string;
    updatedBy: string;
}

export interface ReviewArticleDetail extends ReviewArticleListItem {
    contentMarkdown: string;
    metadata: ReviewMetadata;
}

function normalizePrefix(prefix: string): string {
    return prefix.replace(/^\/+|\/+$/g, '');
}

function joinKey(...parts: string[]): string {
    return parts
        .map((part) => part.replace(/^\/+|\/+$/g, ''))
        .filter(Boolean)
        .join('/');
}

function joinPublicUrl(baseUrl: string, relativePath: string): string {
    return `${baseUrl.replace(/\/+$/g, '')}/${relativePath.replace(/^\/+/, '')}`;
}

function getReviewConfig(site: ArticleSite): R2ArticleSourceConfig {
    const config = loadArticleSourceConfigs().find((candidate) => (
        candidate.type === 'r2' && candidate.site === site
    ));
    if (!config || config.type !== 'r2') {
        throw new Error(`R2 review source is not configured for site: ${site}`);
    }
    return config;
}

function metadataKeyForState(config: R2ArticleSourceConfig, state: ArticleStateDocument): string {
    const prefix = normalizePrefix(config.prefix);
    const relativeAssetPrefix = state.assetPrefix.startsWith(`${prefix}/`)
        ? state.assetPrefix.slice(prefix.length + 1)
        : state.assetPrefix;
    return joinKey(prefix, relativeAssetPrefix, 'review.json');
}

function rewriteReviewMarkdownAssets(markdown: string, config: R2ArticleSourceConfig, state: ArticleStateDocument): string {
    const prefix = normalizePrefix(config.prefix);
    const assetPrefix = state.assetPrefix.startsWith(`${prefix}/`)
        ? state.assetPrefix.slice(prefix.length + 1)
        : state.assetPrefix;
    const assetBaseUrl = joinPublicUrl(config.publicBaseUrl, assetPrefix);

    return markdown.replace(
        /!\[([^\]]*)\]\((?!https?:\/\/|data:|mailto:|#)([^)]+)\)/g,
        (_match, alt: string, relativePath: string) => {
            const sanitizedPath = relativePath.trim().replace(/^\.\/+/, '');
            return `![${alt}](${joinPublicUrl(assetBaseUrl, sanitizedPath)})`;
        }
    );
}

function parseTitleAndSummary(markdown: string, metadata: ReviewMetadata): { title: string; summary: string } {
    const parsed = matter(markdown);
    const title = metadata.title
        || (typeof parsed.data.title === 'string' ? parsed.data.title : '')
        || markdown.match(/^#\s+(.+)$/m)?.[1]
        || '未命名审阅文章';
    const summary = metadata.summary
        || (typeof parsed.data.summary === 'string' ? parsed.data.summary : '')
        || markdown.match(/^>\s+(.+)$/m)?.[1]
        || '';
    return { title, summary };
}

async function readState(config: R2ArticleSourceConfig, slug: string): Promise<ArticleStateDocument> {
    const key = joinKey(config.prefix, 'state/articles', `${slug}.json`);
    return JSON.parse(await readR2ObjectText(config.bucket, key)) as ArticleStateDocument;
}

async function readMetadata(config: R2ArticleSourceConfig, state: ArticleStateDocument): Promise<ReviewMetadata> {
    try {
        return JSON.parse(await readR2ObjectText(config.bucket, metadataKeyForState(config, state))) as ReviewMetadata;
    } catch {
        return { schemaVersion: 1 };
    }
}

function mapListItem(
    config: R2ArticleSourceConfig,
    state: ArticleStateDocument,
    markdown: string,
    metadata: ReviewMetadata,
): ReviewArticleListItem {
    const { title, summary } = parseTitleAndSummary(markdown, metadata);
    return {
        site: state.site,
        source: state.source,
        slug: state.slug,
        state: 'review',
        version: state.version,
        title,
        summary,
        originalUrl: metadata.originalUrl || null,
        sourceLocator: metadata.sourceLocator || null,
        reviewMethod: metadata.translationReview?.method || null,
        contentKey: state.contentKey,
        assetPrefix: state.assetPrefix,
        checksum: state.checksum,
        updatedAt: state.updatedAt,
        updatedBy: state.updatedBy,
    };
}

export async function listReviewArticles(site: ArticleSite = 'ai'): Promise<ReviewArticleListItem[]> {
    const config = getReviewConfig(site);
    const stateKeys = await listR2ObjectKeys(config.bucket, joinKey(config.prefix, 'state/articles/'));
    const items: ReviewArticleListItem[] = [];

    for (const key of stateKeys.filter((value) => value.endsWith('.json'))) {
        const state = JSON.parse(await readR2ObjectText(config.bucket, key)) as ArticleStateDocument;
        if (state.state !== 'review') continue;
        const metadata = await readMetadata(config, state);
        const markdown = await readR2ObjectText(config.bucket, state.contentKey);
        items.push(mapListItem(config, state, markdown, metadata));
    }

    return items.sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime());
}

export async function getReviewArticleBySlug(slug: string, site: ArticleSite = 'ai'): Promise<ReviewArticleDetail | null> {
    const config = getReviewConfig(site);
    const state = await readState(config, slug);
    if (state.state !== 'review') return null;

    const metadata = await readMetadata(config, state);
    const markdown = await readR2ObjectText(config.bucket, state.contentKey);
    return {
        ...mapListItem(config, state, markdown, metadata),
        contentMarkdown: rewriteReviewMarkdownAssets(matter(markdown).content.trim(), config, state),
        metadata,
    };
}
```

- [ ] **Step 4: Run the service tests**

Run:

```bash
npm test -- tests/unit/article-review-directory.test.ts
```

Expected: PASS.

---

## Task 3: Share Markdown Rendering

**Files:**
- Create: `lib/articles/render-markdown.ts`
- Modify: `app/ai/articles/[slug]/page.tsx`
- Test: `tests/unit/article-markdown-render.test.ts`

- [ ] **Step 1: Write a renderer test**

Create `tests/unit/article-markdown-render.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

describe('article markdown renderer', () => {
    it('renders markdown and extracts heading ids', async () => {
        const { renderArticleMarkdown } = await import('@/lib/articles/render-markdown');

        const result = await renderArticleMarkdown('# 标题\n\n## 小节\n\n正文');

        expect(result.renderedHtml).toContain('<h1 id="');
        expect(result.renderedHtml).toContain('loading="lazy"');
        expect(result.toc.map((item) => item.text)).toContain('标题');
        expect(result.toc.map((item) => item.text)).toContain('小节');
    });
});
```

- [ ] **Step 2: Run the failing test**

Run:

```bash
npm test -- tests/unit/article-markdown-render.test.ts
```

Expected: FAIL because `renderArticleMarkdown` is missing.

- [ ] **Step 3: Create shared renderer**

Create `lib/articles/render-markdown.ts`:

```ts
import { extractToc, rehypeUniqueHeadingIds } from '@/lib/articles/markdown-headings';

export interface RenderedArticleMarkdown {
    renderedHtml: string;
    toc: ReturnType<typeof extractToc>;
}

export async function renderArticleMarkdown(content: string): Promise<RenderedArticleMarkdown> {
    const { unified } = await import('unified');
    const remarkParse = (await import('remark-parse')).default;
    const remarkGfm = (await import('remark-gfm')).default;
    const remarkRehype = (await import('remark-rehype')).default;
    const rehypeHighlight = (await import('rehype-highlight')).default;
    const rehypeStringify = (await import('rehype-stringify')).default;

    const toc = extractToc(content);
    const result = await unified()
        .use(remarkParse)
        .use(remarkGfm)
        .use(remarkRehype)
        .use(rehypeUniqueHeadingIds)
        .use(rehypeHighlight, { detect: true, ignoreMissing: true })
        .use(rehypeStringify)
        .process(content);

    return {
        toc,
        renderedHtml: String(result).replace(/<img /g, '<img loading="lazy" '),
    };
}
```

- [ ] **Step 4: Replace duplicated renderer in public article page**

Modify `app/ai/articles/[slug]/page.tsx`:

```ts
import { renderArticleMarkdown } from '@/lib/articles/render-markdown';
```

Replace the local `extractToc`, `unified`, and processor block with:

```ts
const { toc, renderedHtml } = await renderArticleMarkdown(content);
```

Keep `extractToc` import only if still used. Expected final imports remove:

```ts
import { extractToc, rehypeUniqueHeadingIds } from '@/lib/articles/markdown-headings';
```

- [ ] **Step 5: Run renderer and article detail tests**

Run:

```bash
npm test -- tests/unit/article-markdown-render.test.ts tests/unit/ai-article-detail-page.test.ts
```

Expected: PASS.

---

## Task 4: Add Authenticated Review APIs

**Files:**
- Create: `app/api/admin/articles/review/route.ts`
- Create: `app/api/admin/articles/review/[slug]/route.ts`
- Test: `tests/unit/article-review-api.test.ts`

- [ ] **Step 1: Write API tests**

Create `tests/unit/article-review-api.test.ts`:

```ts
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const listReviewArticles = vi.fn();
const getReviewArticleBySlug = vi.fn();
const renderArticleMarkdown = vi.fn(async (content: string) => ({
    renderedHtml: `<p>${content}</p>`,
    toc: [],
}));

vi.mock('@/lib/articles/review-directory', () => ({
    listReviewArticles,
    getReviewArticleBySlug,
}));

vi.mock('@/lib/articles/render-markdown', () => ({
    renderArticleMarkdown,
}));

describe('article review admin API', () => {
    const originalToken = process.env.KNOWLEDGE_ADMIN_TOKEN;

    beforeEach(() => {
        vi.resetModules();
        vi.clearAllMocks();
        process.env.KNOWLEDGE_ADMIN_TOKEN = 'secret-token';
    });

    afterEach(() => {
        if (originalToken === undefined) delete process.env.KNOWLEDGE_ADMIN_TOKEN;
        else process.env.KNOWLEDGE_ADMIN_TOKEN = originalToken;
    });

    it('rejects list requests without admin token', async () => {
        const { GET } = await import('@/app/api/admin/articles/review/route');
        const response = await GET(new NextRequest('http://localhost:5046/api/admin/articles/review'));

        expect(response.status).toBe(401);
        expect(listReviewArticles).not.toHaveBeenCalled();
    });

    it('lists review articles with admin token', async () => {
        listReviewArticles.mockResolvedValue([
            { slug: 'review-one', title: 'Review One', state: 'review' },
        ]);

        const { GET } = await import('@/app/api/admin/articles/review/route');
        const response = await GET(new NextRequest('http://localhost:5046/api/admin/articles/review?site=ai', {
            headers: { 'x-admin-token': 'secret-token' },
        }));
        const payload = await response.json();

        expect(response.status).toBe(200);
        expect(payload.data.items).toEqual([
            { slug: 'review-one', title: 'Review One', state: 'review' },
        ]);
        expect(listReviewArticles).toHaveBeenCalledWith('ai');
    });

    it('returns rendered review article detail with evidence metadata', async () => {
        getReviewArticleBySlug.mockResolvedValue({
            slug: 'review-one',
            title: 'Review One',
            contentMarkdown: '正文',
            metadata: { sourceLocator: 'r2://bucket/key.json' },
        });

        const { GET } = await import('@/app/api/admin/articles/review/[slug]/route');
        const response = await GET(new NextRequest('http://localhost:5046/api/admin/articles/review/review-one', {
            headers: { 'x-admin-token': 'secret-token' },
        }), {
            params: Promise.resolve({ slug: 'review-one' }),
        });
        const payload = await response.json();

        expect(response.status).toBe(200);
        expect(payload.data.article.slug).toBe('review-one');
        expect(payload.data.renderedHtml).toBe('<p>正文</p>');
        expect(payload.data.article.metadata.sourceLocator).toBe('r2://bucket/key.json');
    });

    it('returns 404 for missing review articles', async () => {
        getReviewArticleBySlug.mockResolvedValue(null);

        const { GET } = await import('@/app/api/admin/articles/review/[slug]/route');
        const response = await GET(new NextRequest('http://localhost:5046/api/admin/articles/review/missing', {
            headers: { 'x-admin-token': 'secret-token' },
        }), {
            params: Promise.resolve({ slug: 'missing' }),
        });

        expect(response.status).toBe(404);
    });
});
```

- [ ] **Step 2: Run the failing API tests**

Run:

```bash
npm test -- tests/unit/article-review-api.test.ts
```

Expected: FAIL because routes do not exist.

- [ ] **Step 3: Implement list route**

Create `app/api/admin/articles/review/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { listReviewArticles } from '@/lib/articles/review-directory';
import { verifyAdminHeaders } from '@/lib/utils/admin-auth';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
    const authResult = verifyAdminHeaders(request.headers);
    if (!authResult.ok) {
        return NextResponse.json({ error: authResult.error }, { status: authResult.status });
    }

    const site = request.nextUrl.searchParams.get('site') || 'ai';
    const items = await listReviewArticles(site);
    return NextResponse.json({ success: true, data: { items } });
}
```

- [ ] **Step 4: Implement detail route**

Create `app/api/admin/articles/review/[slug]/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { getReviewArticleBySlug } from '@/lib/articles/review-directory';
import { renderArticleMarkdown } from '@/lib/articles/render-markdown';
import { verifyAdminHeaders } from '@/lib/utils/admin-auth';

export const runtime = 'nodejs';

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ slug: string }> },
) {
    const authResult = verifyAdminHeaders(request.headers);
    if (!authResult.ok) {
        return NextResponse.json({ error: authResult.error }, { status: authResult.status });
    }

    const { slug } = await params;
    const site = request.nextUrl.searchParams.get('site') || 'ai';
    const article = await getReviewArticleBySlug(slug, site);
    if (!article) {
        return NextResponse.json({ error: 'Review article not found' }, { status: 404 });
    }

    const rendered = await renderArticleMarkdown(article.contentMarkdown);
    return NextResponse.json({
        success: true,
        data: {
            article,
            renderedHtml: rendered.renderedHtml,
            toc: rendered.toc,
        },
    });
}
```

- [ ] **Step 5: Run API tests**

Run:

```bash
npm test -- tests/unit/article-review-api.test.ts
```

Expected: PASS.

---

## Task 5: Add Review Queue UI

**Files:**
- Create: `app/admin/articles/review/page.tsx`
- Create: `app/admin/articles/review/ReviewQueueClient.tsx`
- Test: `tests/unit/article-review-pages.test.ts`

- [ ] **Step 1: Write page smoke test**

Create or append to `tests/unit/article-review-pages.test.ts`:

```ts
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

describe('article review admin pages', () => {
    it('renders the review queue token gate', async () => {
        const { default: ReviewQueuePage, metadata } = await import('@/app/admin/articles/review/page');

        const html = renderToStaticMarkup(React.createElement(await ReviewQueuePage()));

        expect(metadata.robots).toEqual({ index: false, follow: false });
        expect(html).toContain('审阅队列');
        expect(html).toContain('管理 Token');
        expect(html).toContain('/api/admin/articles/review');
    });
});
```

- [ ] **Step 2: Run the failing smoke test**

Run:

```bash
npm test -- tests/unit/article-review-pages.test.ts
```

Expected: FAIL because page does not exist.

- [ ] **Step 3: Create page shell**

Create `app/admin/articles/review/page.tsx`:

```tsx
import type { Metadata } from 'next';
import ReviewQueueClient from './ReviewQueueClient';

export const runtime = 'nodejs';

export const metadata: Metadata = {
    title: '文章审阅队列',
    robots: { index: false, follow: false },
};

export default function ReviewQueuePage() {
    return <ReviewQueueClient />;
}
```

- [ ] **Step 4: Create queue client**

Create `app/admin/articles/review/ReviewQueueClient.tsx`:

```tsx
'use client';

import Link from 'next/link';
import { useCallback, useState } from 'react';

interface ReviewListItem {
    slug: string;
    title: string;
    summary: string;
    originalUrl: string | null;
    sourceLocator: string | null;
    reviewMethod: string | null;
    updatedAt: string;
    updatedBy: string;
    version: number;
}

interface ReviewListResponse {
    success: boolean;
    data: { items: ReviewListItem[] };
}

export default function ReviewQueueClient() {
    const [token, setToken] = useState('');
    const [items, setItems] = useState<ReviewListItem[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    const loadQueue = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const response = await fetch('/api/admin/articles/review?site=ai', {
                headers: { 'x-admin-token': token },
            });
            if (!response.ok) throw new Error(`加载失败：${response.status}`);
            const payload = await response.json() as ReviewListResponse;
            setItems(payload.data.items);
        } catch (err) {
            setError(err instanceof Error ? err.message : '加载失败');
        } finally {
            setLoading(false);
        }
    }, [token]);

    return (
        <main className="min-h-screen bg-background px-6 py-8 text-foreground">
            <div className="mx-auto flex max-w-5xl flex-col gap-6">
                <header className="flex flex-col gap-2">
                    <p className="text-sm text-muted-foreground">Knowledge Admin</p>
                    <h1 className="text-3xl font-bold">审阅队列</h1>
                    <p className="max-w-2xl text-sm text-muted-foreground">
                        这里直接读取 R2 review 状态，不依赖公开 manifest。文章在这里可见不代表已经发布。
                    </p>
                </header>

                <section className="flex flex-col gap-3 rounded-lg border border-border p-4">
                    <label className="text-sm font-medium" htmlFor="admin-token">管理 Token</label>
                    <div className="flex flex-col gap-2 sm:flex-row">
                        <input
                            id="admin-token"
                            className="min-h-10 flex-1 rounded-md border border-input bg-background px-3 text-sm"
                            value={token}
                            type="password"
                            onChange={(event) => setToken(event.target.value)}
                            placeholder="输入 KNOWLEDGE_ADMIN_TOKEN"
                        />
                        <button
                            className="min-h-10 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50"
                            disabled={!token || loading}
                            onClick={() => void loadQueue()}
                        >
                            {loading ? '加载中' : '加载审阅队列'}
                        </button>
                    </div>
                    <code className="text-xs text-muted-foreground">/api/admin/articles/review</code>
                    {error && <p className="text-sm text-destructive">{error}</p>}
                </section>

                <section className="grid gap-3">
                    {items.map((item) => (
                        <article key={item.slug} className="rounded-lg border border-border p-4">
                            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                                <div className="flex flex-col gap-2">
                                    <h2 className="text-xl font-semibold">{item.title}</h2>
                                    <p className="text-sm text-muted-foreground">{item.summary}</p>
                                    <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                                        <span>version {item.version}</span>
                                        <span>{new Date(item.updatedAt).toLocaleString('zh-CN')}</span>
                                        <span>{item.updatedBy}</span>
                                        {item.reviewMethod && <span>{item.reviewMethod}</span>}
                                    </div>
                                </div>
                                <Link
                                    className="rounded-md border border-border px-3 py-2 text-sm font-medium"
                                    href={`/admin/articles/review/${encodeURIComponent(item.slug)}`}
                                >
                                    打开审阅
                                </Link>
                            </div>
                        </article>
                    ))}
                    {items.length === 0 && !loading && (
                        <p className="rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground">
                            输入管理 Token 后加载待审阅文章。
                        </p>
                    )}
                </section>
            </div>
        </main>
    );
}
```

- [ ] **Step 5: Run page smoke test**

Run:

```bash
npm test -- tests/unit/article-review-pages.test.ts
```

Expected: PASS.

---

## Task 6: Add Review Detail UI

**Files:**
- Create: `app/admin/articles/review/[slug]/page.tsx`
- Create: `app/admin/articles/review/[slug]/ReviewArticleClient.tsx`
- Modify: `tests/unit/article-review-pages.test.ts`

- [ ] **Step 1: Add detail page smoke test**

Append:

```ts
it('renders the review detail token gate', async () => {
    const { default: ReviewArticlePage, metadata } = await import('@/app/admin/articles/review/[slug]/page');

    const html = renderToStaticMarkup(React.createElement(await ReviewArticlePage({
        params: Promise.resolve({ slug: 'review-one' }),
    })));

    expect(metadata.robots).toEqual({ index: false, follow: false });
    expect(html).toContain('审阅文章');
    expect(html).toContain('review-one');
    expect(html).toContain('/api/admin/articles/review/review-one');
});
```

- [ ] **Step 2: Run failing smoke test**

Run:

```bash
npm test -- tests/unit/article-review-pages.test.ts
```

Expected: FAIL because detail page does not exist.

- [ ] **Step 3: Create detail page shell**

Create `app/admin/articles/review/[slug]/page.tsx`:

```tsx
import type { Metadata } from 'next';
import ReviewArticleClient from './ReviewArticleClient';

export const runtime = 'nodejs';

export const metadata: Metadata = {
    title: '审阅文章',
    robots: { index: false, follow: false },
};

export default async function ReviewArticlePage({
    params,
}: {
    params: Promise<{ slug: string }>;
}) {
    const { slug } = await params;
    return <ReviewArticleClient slug={slug} />;
}
```

- [ ] **Step 4: Create detail client**

Create `app/admin/articles/review/[slug]/ReviewArticleClient.tsx`:

```tsx
'use client';

import Link from 'next/link';
import { useCallback, useState } from 'react';

interface TocItem {
    id: string;
    text: string;
    level: number;
}

interface ReviewArticleResponse {
    success: boolean;
    data: {
        article: {
            slug: string;
            title: string;
            summary: string;
            originalUrl: string | null;
            sourceLocator: string | null;
            reviewMethod: string | null;
            contentKey: string;
            assetPrefix: string;
            checksum: string;
            version: number;
            updatedAt: string;
            updatedBy: string;
            metadata: {
                sourceContentId?: string | null;
                exportedAt?: string | null;
                language?: string | null;
                translationReview?: {
                    method?: string;
                    checkerReport?: string;
                    checkerStatus?: string;
                    translatedChunks?: number;
                } | null;
            };
        };
        renderedHtml: string;
        toc: TocItem[];
    };
}

export default function ReviewArticleClient({ slug }: { slug: string }) {
    const [token, setToken] = useState('');
    const [payload, setPayload] = useState<ReviewArticleResponse['data'] | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    const endpoint = `/api/admin/articles/review/${encodeURIComponent(slug)}?site=ai`;

    const loadArticle = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const response = await fetch(endpoint, {
                headers: { 'x-admin-token': token },
            });
            if (!response.ok) throw new Error(`加载失败：${response.status}`);
            const body = await response.json() as ReviewArticleResponse;
            setPayload(body.data);
        } catch (err) {
            setError(err instanceof Error ? err.message : '加载失败');
        } finally {
            setLoading(false);
        }
    }, [endpoint, token]);

    return (
        <main className="min-h-screen bg-background px-6 py-8 text-foreground">
            <div className="mx-auto flex max-w-6xl flex-col gap-6">
                <div className="flex items-center justify-between gap-4">
                    <div>
                        <p className="text-sm text-muted-foreground">审阅文章</p>
                        <h1 className="break-words text-3xl font-bold">{slug}</h1>
                    </div>
                    <Link className="rounded-md border border-border px-3 py-2 text-sm" href="/admin/articles/review">
                        返回队列
                    </Link>
                </div>

                <section className="flex flex-col gap-3 rounded-lg border border-border p-4">
                    <label className="text-sm font-medium" htmlFor="admin-token">管理 Token</label>
                    <div className="flex flex-col gap-2 sm:flex-row">
                        <input
                            id="admin-token"
                            className="min-h-10 flex-1 rounded-md border border-input bg-background px-3 text-sm"
                            value={token}
                            type="password"
                            onChange={(event) => setToken(event.target.value)}
                            placeholder="输入 KNOWLEDGE_ADMIN_TOKEN"
                        />
                        <button
                            className="min-h-10 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50"
                            disabled={!token || loading}
                            onClick={() => void loadArticle()}
                        >
                            {loading ? '加载中' : '加载审阅文章'}
                        </button>
                    </div>
                    <code className="text-xs text-muted-foreground">{endpoint}</code>
                    {error && <p className="text-sm text-destructive">{error}</p>}
                </section>

                {payload && (
                    <>
                        <section className="grid gap-3 rounded-lg border border-border p-4 md:grid-cols-2">
                            <Evidence label="标题" value={payload.article.title} />
                            <Evidence label="原文 URL" value={payload.article.originalUrl} href={payload.article.originalUrl} />
                            <Evidence label="Handoff locator" value={payload.article.sourceLocator} />
                            <Evidence label="Source content id" value={payload.article.metadata.sourceContentId} />
                            <Evidence label="Exported at" value={payload.article.metadata.exportedAt} />
                            <Evidence label="Language" value={payload.article.metadata.language} />
                            <Evidence label="Review method" value={payload.article.reviewMethod || payload.article.metadata.translationReview?.method} />
                            <Evidence label="Translated chunks" value={String(payload.article.metadata.translationReview?.translatedChunks ?? '')} />
                            <Evidence label="State version" value={String(payload.article.version)} />
                            <Evidence label="Checksum" value={payload.article.checksum} />
                            <Evidence label="Content key" value={payload.article.contentKey} />
                            <Evidence label="Updated by" value={payload.article.updatedBy} />
                        </section>

                        {payload.article.metadata.translationReview?.checkerReport && (
                            <section className="rounded-lg border border-border p-4">
                                <h2 className="mb-2 text-lg font-semibold">Checker 报告</h2>
                                <pre className="whitespace-pre-wrap break-words text-sm text-muted-foreground">
                                    {payload.article.metadata.translationReview.checkerReport}
                                </pre>
                            </section>
                        )}

                        <section className="rounded-lg border border-border p-4">
                            <div className="mb-4 flex flex-col gap-1">
                                <p className="text-sm text-muted-foreground">译文预览</p>
                                <h2 className="text-2xl font-bold">{payload.article.title}</h2>
                                <p className="text-sm text-muted-foreground">{payload.article.summary}</p>
                            </div>
                            <article
                                className="prose max-w-none dark:prose-invert"
                                dangerouslySetInnerHTML={{ __html: payload.renderedHtml }}
                            />
                        </section>
                    </>
                )}
            </div>
        </main>
    );
}

function Evidence({ label, value, href }: { label: string; value?: string | null; href?: string | null }) {
    const display = value?.trim() || '-';
    return (
        <div className="flex min-w-0 flex-col gap-1">
            <p className="text-xs text-muted-foreground">{label}</p>
            {href ? (
                <a className="break-words text-sm text-primary underline" href={href} target="_blank" rel="noreferrer">
                    {display}
                </a>
            ) : (
                <p className="break-words text-sm">{display}</p>
            )}
        </div>
    );
}
```

- [ ] **Step 5: Run page tests**

Run:

```bash
npm test -- tests/unit/article-review-pages.test.ts
```

Expected: PASS.

---

## Task 7: Persist Review Metadata From Console Handoff

**Files:**
- Modify: `scripts/console-knowledge-handoff-core.mjs`
- Modify: `tests/unit/console-knowledge-handoff-importer.test.ts`
- Modify: `console-knowledge-handoff/SKILL.md`

- [ ] **Step 1: Add failing importer test expectations**

In `tests/unit/console-knowledge-handoff-importer.test.ts`, inside the English handoff test, pass metadata:

```ts
reviewMetadata: {
    sourceLocator: 'r2://content-hub-r2/knowledge-imports/console/sample.json',
    translationReview: {
        method: 'parallel-subagents-maker-checker',
        translatedChunks: 3,
        checkerReport: 'PASS',
        checkerStatus: 'pass',
    },
},
```

Then assert:

```ts
const reviewMetadata = JSON.parse(store.getText('ai/articles/review/twitter-tweet-en-42/review.json'));
expect(reviewMetadata).toMatchObject({
    schemaVersion: 1,
    sourceLocator: 'r2://content-hub-r2/knowledge-imports/console/sample.json',
    originalUrl: 'https://x.com/example/status/4242',
    sourceContentId: 'tweet-en-42',
    language: 'en',
    translationReview: {
        method: 'parallel-subagents-maker-checker',
        checkerReport: 'PASS',
    },
});
```

- [ ] **Step 2: Run failing importer test**

Run:

```bash
npm test -- tests/unit/console-knowledge-handoff-importer.test.ts
```

Expected: FAIL because `review.json` is not written.

- [ ] **Step 3: Implement metadata writing**

In `scripts/console-knowledge-handoff-core.mjs`, add `reviewMetadata = {}` to options destructuring.

After `reviewImageKey`:

```js
const reviewMetadataKey = joinKey(prefix, 'articles', 'review', slug, 'review.json');
```

After image upload:

```js
await store.writeJson(siteConfig.bucket, reviewMetadataKey, {
    schemaVersion: 1,
    sourceLocator: reviewMetadata.sourceLocator || null,
    originalUrl: handoff.source?.sourceUrl || null,
    sourcePlatform: inferSourcePlatform(handoff),
    sourceType: handoff.source?.sourceType || null,
    sourceContentId: handoff.source?.sourceContentId || null,
    exportedAt: handoff.exportedAt || null,
    title: content.title,
    summary: content.summary,
    category: inferCategory(handoff),
    language: handoff.article.language,
    translationReview: reviewMetadata.translationReview || null,
});
```

Return `reviewMetadataKey` from `stageConsoleHandoffReview()`.

- [ ] **Step 4: Update skill instructions**

In `console-knowledge-handoff/SKILL.md`, add to the review staging workflow:

```md
11. 写入 `ai/articles/review/<slug>/review.json`，包含 source locator、原文 URL、sourceContentId、exportedAt、语言、翻译方式和 Checker 报告。
```

Renumber the following workflow items.

- [ ] **Step 5: Run importer and skill tests**

Run:

```bash
npm test -- tests/unit/console-knowledge-handoff-importer.test.ts tests/unit/console-knowledge-handoff-skill.test.ts
```

Expected: PASS.

---

## Task 8: End-To-End Verification

**Files:**
- No new files.

- [ ] **Step 1: Run focused unit tests**

Run:

```bash
npm test -- tests/unit/r2-article-client.test.ts tests/unit/article-review-directory.test.ts tests/unit/article-markdown-render.test.ts tests/unit/article-review-api.test.ts tests/unit/article-review-pages.test.ts tests/unit/console-knowledge-handoff-importer.test.ts tests/unit/console-knowledge-handoff-skill.test.ts tests/unit/ai-article-detail-page.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run lint**

Run:

```bash
npm run lint
```

Expected: PASS.

- [ ] **Step 3: Run build**

Run:

```bash
npm run build
```

Expected: PASS.

- [ ] **Step 4: Start dev server**

Run:

```bash
npm run dev
```

Expected: Next.js dev server starts on port `5046`.

- [ ] **Step 5: Manually verify review queue**

Open:

```text
http://localhost:5046/admin/articles/review
```

Expected:

- Page shows token input.
- Without token, no review data loads.
- With `KNOWLEDGE_ADMIN_TOKEN`, review queue loads R2 review articles.
- Current Claude Code skills article appears with slug `other-https-claude-com-blog-lessons-from-building-claude-code-how-we-use-skills`.

- [ ] **Step 6: Manually verify review detail**

Open:

```text
http://localhost:5046/admin/articles/review/other-https-claude-com-blog-lessons-from-building-claude-code-how-we-use-skills
```

Expected:

- Page shows token input.
- After loading with admin token, evidence panel shows original URL, R2 content key, checksum, state version, and updatedBy.
- Translated Markdown renders with `images/cover.jpg` resolved to the public R2 asset URL.
- Page does not expose a publish button.

- [ ] **Step 7: Verify manifest is untouched by review preview**

Run:

```bash
node scripts/r2-article-state.mjs verify --bucket=knowledge-articles --prefix=ai
```

Expected: existing published manifest verifies; review preview did not mutate `ai/manifest.json`.

---

## Self-Review

**Spec coverage:** The plan creates a protected review queue, a protected review detail preview, direct R2 review-state reads independent of `ai/manifest.json`, evidence metadata for authenticity checks, shared Markdown rendering, and future Console handoff metadata persistence.

**Out of scope:** Publishing controls, approve/reject workflow, deleting archived review drafts, and inline translation editing are intentionally excluded. This plan only makes review visible and verifiable.

**Placeholder scan:** No TODO/TBD placeholders remain. Each task lists concrete files, tests, code, commands, and expected outcomes.

**Type consistency:** API payloads use `ReviewArticleListItem`, `ReviewArticleDetail`, and `ReviewMetadata` from `lib/articles/review-directory.ts`. UI clients consume the same field names returned by the API routes.
