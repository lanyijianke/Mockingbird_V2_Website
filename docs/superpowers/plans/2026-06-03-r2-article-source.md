# R2 Article Source Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move website article storage from the local Git-backed content repository to Cloudflare R2, with public R2 URLs for article images.

**Architecture:** Keep the current article service API stable for pages and route handlers. Replace the storage-specific internals in `lib/articles/` with a source abstraction that supports local sources for tests/development and R2 sources for production. Server-side code reads `manifest.json` and markdown from R2 through the S3-compatible API; cover images and markdown image assets resolve to the configured public R2 base URL.

**Tech Stack:** Next.js App Router, TypeScript, Vitest, `@aws-sdk/client-s3`, Cloudflare R2 S3-compatible API, existing in-memory cache manager.

---

## Target R2 Content Contract

R2 object layout:

```text
knowledge-articles/
  ai/
    manifest.json
    articles/
      prompt-caching/
        index.md
        images/
          cover.jpg
  finance/
    manifest.json
    articles/
      fed-notes/
        index.md
        images/
          cover.jpg
```

Production environment:

```env
ARTICLE_R2_SOURCES=[{"site":"ai","source":"web-article","bucket":"knowledge-articles","prefix":"ai","manifestPath":"manifest.json","publicBaseUrl":"https://assets.zgnknowledge.online/ai"}]
R2_ACCOUNT_ID=...
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
```

Rules:

- `manifestPath` is relative to `prefix`.
- `contentPath` and `coverImage` in `manifest.json` keep the existing manifest shape.
- Relative markdown images are resolved relative to the article markdown directory and rewritten to `publicBaseUrl`.
- `ARTICLE_R2_SOURCES` is the production source config. `ARTICLE_LOCAL_SOURCES` remains supported for local tests and emergency development only.

## File Structure

- Modify `package.json` and `package-lock.json`: add `@aws-sdk/client-s3`.
- Modify `lib/articles/source-types.ts`: define local and R2 article source config types, plus source locator fields.
- Modify `lib/articles/source-config.ts`: load and validate `ARTICLE_R2_SOURCES` and `ARTICLE_LOCAL_SOURCES`.
- Create `lib/articles/r2-client.ts`: create a cached R2 S3 client and read object bodies as UTF-8 or bytes.
- Modify `lib/articles/article-directory.ts`: map both source types into directory entries, fetch manifests and markdown through source-aware readers, and build public R2 asset URLs.
- Modify `app/api/article-assets/[site]/[slug]/[...assetPath]/route.ts`: keep local-source asset serving, return 404 for non-local entries.
- Modify `lib/cache/keys.ts`: rename markdown cache key input from local file path to a generic content locator.
- Modify `next.config.ts`: allow the configured R2 public asset host for `next/image`.
- Add `app/api/articles/cache/route.ts`: protected endpoint to clear article caches after uploads.
- Modify docs in `docs/运维/Mockingbird_web部署与迁移指南.md`: replace production article source instructions with R2 instructions.
- Add/update unit tests in `tests/unit/`.

---

### Task 1: Add R2 SDK Dependency

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`

- [ ] **Step 1: Install the S3 client**

Run:

```bash
npm install @aws-sdk/client-s3
```

Expected: `package.json` includes `@aws-sdk/client-s3`, and `package-lock.json` is updated.

- [ ] **Step 2: Verify dependency install**

Run:

```bash
npm ls @aws-sdk/client-s3
```

Expected: PASS with an installed `@aws-sdk/client-s3` version.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add r2 s3 client dependency"
```

---

### Task 2: Extend Article Source Config Types

**Files:**
- Modify: `lib/articles/source-types.ts`
- Test: `tests/unit/article-source-config.test.ts`

- [ ] **Step 1: Write failing config tests**

Add tests to `tests/unit/article-source-config.test.ts`:

```ts
it('loads R2 article sources from ARTICLE_R2_SOURCES', () => {
    process.env.ARTICLE_R2_SOURCES = JSON.stringify([
        {
            site: 'ai',
            source: 'web-article',
            bucket: 'knowledge-articles',
            prefix: 'ai',
            manifestPath: 'manifest.json',
            publicBaseUrl: 'https://assets.zgnknowledge.online/ai',
        },
    ]);

    expect(loadArticleSourceConfigs()).toEqual([
        {
            type: 'r2',
            site: 'ai',
            source: 'web-article',
            bucket: 'knowledge-articles',
            prefix: 'ai',
            manifestPath: 'manifest.json',
            publicBaseUrl: 'https://assets.zgnknowledge.online/ai',
        },
    ]);
});

it('rejects duplicate site/source pairs across local and R2 sources', () => {
    process.env.ARTICLE_LOCAL_SOURCES = JSON.stringify([
        {
            site: 'ai',
            source: 'web-article',
            rootPath: '/data/content/web-article',
            manifestPath: 'manifest.json',
        },
    ]);
    process.env.ARTICLE_R2_SOURCES = JSON.stringify([
        {
            site: 'ai',
            source: 'web-article',
            bucket: 'knowledge-articles',
            prefix: 'ai',
            manifestPath: 'manifest.json',
            publicBaseUrl: 'https://assets.zgnknowledge.online/ai',
        },
    ]);

    expect(() => loadArticleSourceConfigs()).toThrow(/duplicate article source/i);
});
```

Also update the test cleanup to restore/delete both `ARTICLE_LOCAL_SOURCES` and `ARTICLE_R2_SOURCES`.

- [ ] **Step 2: Run test to verify failure**

Run:

```bash
npm test -- tests/unit/article-source-config.test.ts
```

Expected: FAIL because R2 config is not supported yet.

- [ ] **Step 3: Update source types**

Change `lib/articles/source-types.ts` to use a discriminated union:

```ts
export interface LocalArticleSourceConfig {
    type: 'local';
    site: ArticleSite;
    source: string;
    rootPath: string;
    manifestPath: string;
}

export interface R2ArticleSourceConfig {
    type: 'r2';
    site: ArticleSite;
    source: string;
    bucket: string;
    prefix: string;
    manifestPath: string;
    publicBaseUrl: string;
}

export type ArticleSourceConfig = LocalArticleSourceConfig | R2ArticleSourceConfig;
```

Keep the existing manifest interfaces unchanged.

- [ ] **Step 4: Update `loadArticleSourceConfigs`**

Modify `lib/articles/source-config.ts`:

```ts
export function loadArticleSourceConfigs(
    rawLocalConfig: string | undefined = process.env.ARTICLE_LOCAL_SOURCES,
    rawR2Config: string | undefined = process.env.ARTICLE_R2_SOURCES,
): ArticleSourceConfig[] {
    const configs = [
        ...loadLocalArticleSourceConfigs(rawLocalConfig),
        ...loadR2ArticleSourceConfigs(rawR2Config),
    ];
    rejectDuplicateSourcePairs(configs);
    return configs;
}
```

Local entries should be normalized with `type: 'local'`. R2 entries should require non-empty `site`, `source`, `bucket`, `manifestPath`, and `publicBaseUrl`; `prefix` may be empty but should be normalized by trimming leading and trailing slashes.

- [ ] **Step 5: Run config tests**

Run:

```bash
npm test -- tests/unit/article-source-config.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/articles/source-types.ts lib/articles/source-config.ts tests/unit/article-source-config.test.ts
git commit -m "feat: support r2 article source config"
```

---

### Task 3: Add R2 Object Reader

**Files:**
- Create: `lib/articles/r2-client.ts`
- Test: `tests/unit/r2-article-client.test.ts`

- [ ] **Step 1: Write failing R2 client tests**

Create `tests/unit/r2-article-client.test.ts`:

```ts
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@aws-sdk/client-s3', async () => {
    const actual = await vi.importActual<typeof import('@aws-sdk/client-s3')>('@aws-sdk/client-s3');
    return {
        ...actual,
        S3Client: vi.fn(),
    };
});

describe('r2 article client', () => {
    const originalAccountId = process.env.R2_ACCOUNT_ID;
    const originalAccessKeyId = process.env.R2_ACCESS_KEY_ID;
    const originalSecretAccessKey = process.env.R2_SECRET_ACCESS_KEY;

    afterEach(() => {
        if (originalAccountId === undefined) delete process.env.R2_ACCOUNT_ID;
        else process.env.R2_ACCOUNT_ID = originalAccountId;
        if (originalAccessKeyId === undefined) delete process.env.R2_ACCESS_KEY_ID;
        else process.env.R2_ACCESS_KEY_ID = originalAccessKeyId;
        if (originalSecretAccessKey === undefined) delete process.env.R2_SECRET_ACCESS_KEY;
        else process.env.R2_SECRET_ACCESS_KEY = originalSecretAccessKey;
        vi.clearAllMocks();
        vi.resetModules();
    });

    it('reads an R2 object as UTF-8 text', async () => {
        process.env.R2_ACCOUNT_ID = 'account-id';
        process.env.R2_ACCESS_KEY_ID = 'access-key';
        process.env.R2_SECRET_ACCESS_KEY = 'secret-key';

        const send = vi.fn(async (command: GetObjectCommand) => {
            expect(command.input).toMatchObject({
                Bucket: 'knowledge-articles',
                Key: 'ai/manifest.json',
            });
            return {
                Body: {
                    transformToString: vi.fn(async () => '{"articles":[]}'),
                },
            };
        });

        vi.mocked(S3Client).mockImplementation(() => ({ send }) as unknown as S3Client);

        const { readR2ObjectText } = await import('@/lib/articles/r2-client');
        await expect(readR2ObjectText('knowledge-articles', 'ai/manifest.json')).resolves.toBe('{"articles":[]}');
    });

    it('fails clearly when R2 credentials are missing', async () => {
        delete process.env.R2_ACCOUNT_ID;
        delete process.env.R2_ACCESS_KEY_ID;
        delete process.env.R2_SECRET_ACCESS_KEY;

        const { readR2ObjectText } = await import('@/lib/articles/r2-client');
        await expect(readR2ObjectText('bucket', 'key')).rejects.toThrow(/R2 credentials/i);
    });
});
```

- [ ] **Step 2: Run test to verify failure**

Run:

```bash
npm test -- tests/unit/r2-article-client.test.ts
```

Expected: FAIL because `lib/articles/r2-client.ts` does not exist.

- [ ] **Step 3: Implement R2 client**

Create `lib/articles/r2-client.ts`:

```ts
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';

let cachedClient: S3Client | null = null;
let cachedSignature = '';

function getR2Client(): S3Client {
    const accountId = process.env.R2_ACCOUNT_ID?.trim();
    const accessKeyId = process.env.R2_ACCESS_KEY_ID?.trim();
    const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY?.trim();

    if (!accountId || !accessKeyId || !secretAccessKey) {
        throw new Error('R2 credentials are not configured');
    }

    const signature = `${accountId}:${accessKeyId}:${secretAccessKey}`;
    if (cachedClient && cachedSignature === signature) {
        return cachedClient;
    }

    cachedClient = new S3Client({
        region: 'auto',
        endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
        credentials: {
            accessKeyId,
            secretAccessKey,
        },
    });
    cachedSignature = signature;
    return cachedClient;
}

export async function readR2ObjectText(bucket: string, key: string): Promise<string> {
    const client = getR2Client();
    const response = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));

    if (!response.Body) {
        throw new Error(`R2 object has no body: ${bucket}/${key}`);
    }

    return response.Body.transformToString('utf-8');
}
```

- [ ] **Step 4: Run R2 client tests**

Run:

```bash
npm test -- tests/unit/r2-article-client.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/articles/r2-client.ts tests/unit/r2-article-client.test.ts
git commit -m "feat: add r2 article object reader"
```

---

### Task 4: Make Article Directory Source-Aware

**Files:**
- Modify: `lib/articles/article-directory.ts`
- Modify: `lib/cache/keys.ts`
- Test: `tests/unit/local-article-directory.test.ts`
- Test: `tests/unit/r2-article-directory.test.ts`

- [ ] **Step 1: Write failing R2 directory tests**

Create `tests/unit/r2-article-directory.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearArticleDirectoryCache, fetchAggregatedArticleDirectory, fetchArticleMarkdown } from '@/lib/articles/article-directory';

vi.mock('@/lib/articles/r2-client', () => ({
    readR2ObjectText: vi.fn(),
}));

const ORIGINAL_R2_SOURCES = process.env.ARTICLE_R2_SOURCES;
const ORIGINAL_LOCAL_SOURCES = process.env.ARTICLE_LOCAL_SOURCES;

describe('R2 article directory', () => {
    afterEach(() => {
        clearArticleDirectoryCache();
        if (ORIGINAL_R2_SOURCES === undefined) delete process.env.ARTICLE_R2_SOURCES;
        else process.env.ARTICLE_R2_SOURCES = ORIGINAL_R2_SOURCES;
        if (ORIGINAL_LOCAL_SOURCES === undefined) delete process.env.ARTICLE_LOCAL_SOURCES;
        else process.env.ARTICLE_LOCAL_SOURCES = ORIGINAL_LOCAL_SOURCES;
        vi.clearAllMocks();
    });

    it('aggregates published articles from an R2 manifest and builds public asset URLs', async () => {
        process.env.ARTICLE_R2_SOURCES = JSON.stringify([
            {
                site: 'ai',
                source: 'web-article',
                bucket: 'knowledge-articles',
                prefix: 'ai',
                manifestPath: 'manifest.json',
                publicBaseUrl: 'https://assets.zgnknowledge.online/ai',
            },
        ]);
        delete process.env.ARTICLE_LOCAL_SOURCES;

        const { readR2ObjectText } = await import('@/lib/articles/r2-client');
        vi.mocked(readR2ObjectText).mockResolvedValueOnce(JSON.stringify({
            site: 'ai',
            source: 'web-article',
            categories: [{ code: 'ai-tech', name: 'AI技术' }],
            articles: [
                {
                    id: 'ai-1',
                    slug: 'prompt-caching',
                    title: 'Prompt Caching',
                    summary: 'summary',
                    category: 'ai-tech',
                    author: '@author',
                    originalUrl: 'https://example.com/prompt-caching',
                    sourcePlatform: 'website',
                    type: 'article',
                    coverImage: 'images/cover.jpg',
                    contentPath: 'articles/prompt-caching/index.md',
                    publishedAt: '2026-04-20T12:20:00+08:00',
                    updatedAt: '2026-04-20T12:20:00+08:00',
                    status: 'published',
                },
            ],
        }));

        const directory = await fetchAggregatedArticleDirectory({ forceRefresh: true });

        expect(readR2ObjectText).toHaveBeenCalledWith('knowledge-articles', 'ai/manifest.json');
        expect(directory.entries[0]).toMatchObject({
            site: 'ai',
            source: 'web-article',
            slug: 'prompt-caching',
            coverUrl: 'https://assets.zgnknowledge.online/ai/articles/prompt-caching/images/cover.jpg',
            contentPath: 'articles/prompt-caching/index.md',
        });
    });

    it('reads article markdown from R2 using the entry locator', async () => {
        process.env.ARTICLE_R2_SOURCES = JSON.stringify([
            {
                site: 'ai',
                source: 'web-article',
                bucket: 'knowledge-articles',
                prefix: 'ai',
                manifestPath: 'manifest.json',
                publicBaseUrl: 'https://assets.zgnknowledge.online/ai',
            },
        ]);
        delete process.env.ARTICLE_LOCAL_SOURCES;

        const { readR2ObjectText } = await import('@/lib/articles/r2-client');
        vi.mocked(readR2ObjectText)
            .mockResolvedValueOnce(JSON.stringify({
                site: 'ai',
                source: 'web-article',
                articles: [
                    {
                        id: 'ai-1',
                        slug: 'prompt-caching',
                        title: 'Prompt Caching',
                        summary: 'summary',
                        category: 'ai-tech',
                        author: '@author',
                        originalUrl: 'https://example.com/prompt-caching',
                        sourcePlatform: 'website',
                        type: 'article',
                        coverImage: 'images/cover.jpg',
                        contentPath: 'articles/prompt-caching/index.md',
                        publishedAt: '2026-04-20T12:20:00+08:00',
                        status: 'published',
                    },
                ],
            }))
            .mockResolvedValueOnce('# Prompt Caching\n\nhello');

        const directory = await fetchAggregatedArticleDirectory({ forceRefresh: true });
        await expect(fetchArticleMarkdown(directory.entries[0], { forceRefresh: true })).resolves.toBe('# Prompt Caching\n\nhello');

        expect(readR2ObjectText).toHaveBeenLastCalledWith('knowledge-articles', 'ai/articles/prompt-caching/index.md');
    });
});
```

- [ ] **Step 2: Run test to verify failure**

Run:

```bash
npm test -- tests/unit/r2-article-directory.test.ts
```

Expected: FAIL because directory reading is still local-only.

- [ ] **Step 3: Update cache key naming**

Modify `lib/cache/keys.ts`:

```ts
articles: {
    directory: (): CacheKeyPart[] => ['directory'],
    markdown: (contentLocator: string): CacheKeyPart[] => ['markdown', contentLocator],
},
```

Keep tag names compatible:

```ts
articleContent: (contentLocator: string): string => `articles:content:${contentLocator}`,
```

- [ ] **Step 4: Update directory entry fields**

In `lib/articles/article-directory.ts`, change `ArticleDirectoryEntry` to use generic locator fields:

```ts
sourceType: ArticleSourceConfig['type'];
contentLocator: string;
contentFilePath?: string;
contentBucket?: string;
contentKey?: string;
assetPublicBaseUrl?: string;
```

Keep `contentPath`, `assetBasePath`, `coverImagePath`, and `coverUrl` for existing consumers.

- [ ] **Step 5: Add source-aware helpers**

Add helpers in `lib/articles/article-directory.ts`:

```ts
function joinR2Key(prefix: string, relativePath: string): string {
    return [prefix.replace(/^\/+|\/+$/g, ''), relativePath.replace(/^\/+/, '')]
        .filter(Boolean)
        .join('/');
}

function joinPublicUrl(baseUrl: string, relativePath: string): string {
    return `${baseUrl.replace(/\/+$/g, '')}/${relativePath.replace(/^\/+/, '')}`;
}
```

- [ ] **Step 6: Fetch manifests by source type**

Modify `fetchSourceManifest(config)`:

```ts
async function fetchSourceManifest(config: ArticleSourceConfig): Promise<ArticleSourceManifest> {
    if (config.type === 'r2') {
        const manifestKey = joinR2Key(config.prefix, config.manifestPath);
        return JSON.parse(await readR2ObjectText(config.bucket, manifestKey)) as ArticleSourceManifest;
    }

    const manifestFilePath = buildAbsoluteSourcePath(config, config.manifestPath);
    return JSON.parse(await fs.readFile(manifestFilePath, 'utf-8')) as ArticleSourceManifest;
}
```

- [ ] **Step 7: Map entries by source type**

In `mapManifestArticle`, build:

```ts
const contentLocator = config.type === 'r2'
    ? `r2:${config.bucket}/${joinR2Key(config.prefix, article.contentPath)}`
    : `local:${buildAbsoluteSourcePath(config, article.contentPath)}`;
```

For R2 entries:

```ts
const assetBasePath = joinPublicUrl(config.publicBaseUrl, path.posix.dirname(article.contentPath));
const coverUrl = joinPublicUrl(config.publicBaseUrl, toAssetRelativePath(article.contentPath, article.coverImage));
```

For local entries, keep the existing `/api/article-assets/${site}/${slug}` behavior.

- [ ] **Step 8: Fetch markdown by source type**

Modify `fetchArticleMarkdown`:

```ts
export async function fetchArticleMarkdown(
    entry: Pick<ArticleDirectoryEntry, 'sourceType' | 'contentLocator' | 'contentFilePath' | 'contentBucket' | 'contentKey'>,
    options?: { forceRefresh?: boolean }
): Promise<string> {
    return getCacheManager().getOrLoad(
        cachePolicies.articlesMarkdown,
        cacheKeys.articles.markdown(entry.contentLocator),
        async () => {
            if (entry.sourceType === 'r2') {
                if (!entry.contentBucket) throw new Error('R2 article entry is missing contentBucket');
                if (!entry.contentKey) throw new Error('R2 article entry is missing contentKey');
                return readR2ObjectText(entry.contentBucket, entry.contentKey);
            }
            if (!entry.contentFilePath) throw new Error('Local article entry is missing contentFilePath');
            return fs.readFile(entry.contentFilePath, 'utf-8');
        },
        {
            forceRefresh: options?.forceRefresh,
            tags: [cacheTags.articles, cacheTags.articleContent(entry.contentLocator)],
        }
    );
}
```

- [ ] **Step 9: Run directory tests**

Run:

```bash
npm test -- tests/unit/local-article-directory.test.ts tests/unit/r2-article-directory.test.ts
```

Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add lib/articles/article-directory.ts lib/cache/keys.ts tests/unit/local-article-directory.test.ts tests/unit/r2-article-directory.test.ts
git commit -m "feat: read article directory from r2"
```

---

### Task 5: Rewrite Markdown Assets to Public R2 URLs

**Files:**
- Modify: `lib/articles/article-directory.ts`
- Modify: `lib/services/article-service.ts`
- Test: `tests/unit/article-service-github.test.ts`
- Test: `tests/unit/article-service-r2.test.ts`

- [ ] **Step 1: Write failing R2 article service test**

Create `tests/unit/article-service-r2.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/articles/article-directory', () => ({
    fetchAggregatedArticleDirectory: vi.fn(),
    fetchArticleMarkdown: vi.fn(),
    buildArticleAssetUrl: vi.fn((entry, relativePath) => {
        if (typeof entry === 'object' && entry.assetPublicBaseUrl) {
            return `${entry.assetPublicBaseUrl.replace(/\/+$/g, '')}/${relativePath.replace(/^\/+/, '')}`;
        }
        return `/api/article-assets/${entry.site}/${entry.slug}/${relativePath}`;
    }),
}));

describe('article service backed by R2 sources', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('rewrites relative markdown images to the R2 public base URL', async () => {
        const { fetchAggregatedArticleDirectory, fetchArticleMarkdown } = await import('@/lib/articles/article-directory');
        vi.mocked(fetchAggregatedArticleDirectory).mockResolvedValue({
            categoriesBySite: { ai: [{ code: 'ai-tech', name: 'AI技术' }] },
            entries: [
                {
                    id: 'ai-1',
                    site: 'ai',
                    source: 'web-article',
                    sourceType: 'r2',
                    slug: 'prompt-caching',
                    title: 'Prompt Caching',
                    summary: 'summary',
                    category: 'ai-tech',
                    categoryName: 'AI技术',
                    author: '@author',
                    originalUrl: 'https://example.com/prompt-caching',
                    sourcePlatform: 'website',
                    type: 'article',
                    assetBasePath: 'https://assets.zgnknowledge.online/ai/articles/prompt-caching',
                    assetPublicBaseUrl: 'https://assets.zgnknowledge.online/ai/articles/prompt-caching',
                    coverImagePath: 'images/cover.jpg',
                    coverUrl: 'https://assets.zgnknowledge.online/ai/articles/prompt-caching/images/cover.jpg',
                    contentPath: 'articles/prompt-caching/index.md',
                    contentLocator: 'r2:knowledge-articles/ai/articles/prompt-caching/index.md',
                    contentKey: 'ai/articles/prompt-caching/index.md',
                    publishedAt: '2026-04-20T12:20:00+08:00',
                    updatedAt: null,
                },
            ],
        });
        vi.mocked(fetchArticleMarkdown).mockResolvedValue('---\ntitle: test\n---\n\n![封面](images/cover.jpg)');

        const { getArticleBySlug } = await import('@/lib/services/article-service');
        const article = await getArticleBySlug('prompt-caching', { site: 'ai' });

        expect(article?.content).toContain('![封面](https://assets.zgnknowledge.online/ai/articles/prompt-caching/images/cover.jpg)');
    });
});
```

- [ ] **Step 2: Run test to verify failure**

Run:

```bash
npm test -- tests/unit/article-service-r2.test.ts
```

Expected: FAIL because `buildArticleAssetUrl` still takes `(site, slug, relativePath)`.

- [ ] **Step 3: Change asset URL helper signature**

In `lib/articles/article-directory.ts`, change:

```ts
export function buildArticleAssetUrl(
    entry: Pick<ArticleDirectoryEntry, 'site' | 'slug' | 'assetBasePath' | 'sourceType'>,
    relativePath: string,
): string {
    const sanitizedPath = relativePath.replace(/^\/+/, '');
    if (entry.sourceType === 'r2') {
        return `${entry.assetBasePath.replace(/\/+$/g, '')}/${sanitizedPath}`;
    }
    return `/api/article-assets/${entry.site}/${entry.slug}/${sanitizedPath}`.replace(/\/+/g, '/');
}
```

- [ ] **Step 4: Update article service rewrite**

In `lib/services/article-service.ts`, update `rewriteRelativeMarkdownAssets`:

```ts
return `![${alt}](${buildArticleAssetUrl(entry, sanitizedRelativePath)})`;
```

- [ ] **Step 5: Update existing GitHub/local article service test mock**

In `tests/unit/article-service-github.test.ts`, update the mock:

```ts
buildArticleAssetUrl: vi.fn((entry, relativePath) =>
    `/api/article-assets/${entry.site}/${entry.slug}/${relativePath}`,
),
```

- [ ] **Step 6: Run article service tests**

Run:

```bash
npm test -- tests/unit/article-service-github.test.ts tests/unit/article-service-r2.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add lib/articles/article-directory.ts lib/services/article-service.ts tests/unit/article-service-github.test.ts tests/unit/article-service-r2.test.ts
git commit -m "feat: serve article image urls from r2"
```

---

### Task 6: Keep Local Asset API Compatible But R2-Free

**Files:**
- Modify: `app/api/article-assets/[site]/[slug]/[...assetPath]/route.ts`
- Test: `tests/unit/article-assets-route.test.ts`

- [ ] **Step 1: Write route tests**

Create `tests/unit/article-assets-route.test.ts`:

```ts
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/articles/article-directory', () => ({
    getArticleDirectoryEntry: vi.fn(),
    resolveEntryAssetFilePath: vi.fn(),
}));

vi.mock('fs/promises', () => ({
    default: {
        readFile: vi.fn(),
    },
}));

describe('article asset route', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('returns 404 for R2 entries because assets are served publicly from R2', async () => {
        const { getArticleDirectoryEntry } = await import('@/lib/articles/article-directory');
        vi.mocked(getArticleDirectoryEntry).mockResolvedValue({
            site: 'ai',
            slug: 'prompt-caching',
            sourceType: 'r2',
        } as never);

        const { GET } = await import('@/app/api/article-assets/[site]/[slug]/[...assetPath]/route');
        const response = await GET(new NextRequest('http://localhost/api/article-assets/ai/prompt-caching/images/cover.jpg'), {
            params: Promise.resolve({ site: 'ai', slug: 'prompt-caching', assetPath: ['images', 'cover.jpg'] }),
        });

        expect(response.status).toBe(404);
    });
});
```

- [ ] **Step 2: Run test to verify failure**

Run:

```bash
npm test -- tests/unit/article-assets-route.test.ts
```

Expected: FAIL until route checks `sourceType`.

- [ ] **Step 3: Update route**

In `app/api/article-assets/[site]/[slug]/[...assetPath]/route.ts`, after entry lookup:

```ts
if (!entry || entry.sourceType !== 'local' || assetPath.length === 0) {
    return new NextResponse('Not Found', { status: 404 });
}
```

- [ ] **Step 4: Run route test**

Run:

```bash
npm test -- tests/unit/article-assets-route.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/api/article-assets/[site]/[slug]/[...assetPath]/route.ts tests/unit/article-assets-route.test.ts
git commit -m "fix: limit article asset proxy to local sources"
```

---

### Task 7: Add R2 Image Host Support

**Files:**
- Modify: `next.config.ts`
- Modify: `tests/unit/next-config-images.test.ts`

- [ ] **Step 1: Write failing image config test**

Add to `tests/unit/next-config-images.test.ts`:

```ts
it('allows the configured R2 article asset domain for image assets', async () => {
    vi.resetModules();
    process.env.ARTICLE_R2_PUBLIC_HOST = 'assets.zgnknowledge.online';

    const { default: config } = await import('@/next.config');
    const remotePatterns = config.images?.remotePatterns ?? [];
    const r2Pattern = remotePatterns.find((pattern) => pattern.hostname === 'assets.zgnknowledge.online');

    expect(r2Pattern).toMatchObject({
        protocol: 'https',
        hostname: 'assets.zgnknowledge.online',
        pathname: '/**',
    });
});
```

Add `vi` import if needed:

```ts
import { describe, expect, it, vi } from 'vitest';
```

- [ ] **Step 2: Run test to verify failure**

Run:

```bash
npm test -- tests/unit/next-config-images.test.ts
```

Expected: FAIL because `ARTICLE_R2_PUBLIC_HOST` is not used yet.

- [ ] **Step 3: Update Next image config**

In `next.config.ts`, derive:

```ts
const articleR2PublicHost = process.env.ARTICLE_R2_PUBLIC_HOST?.trim();
const articleR2ImagePattern = articleR2PublicHost
  ? { protocol: 'https' as const, hostname: articleR2PublicHost, pathname: '/**' }
  : null;
```

Add it to `images.remotePatterns`:

```ts
...(articleR2ImagePattern ? [articleR2ImagePattern] : []),
```

- [ ] **Step 4: Run image config tests**

Run:

```bash
npm test -- tests/unit/next-config-images.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add next.config.ts tests/unit/next-config-images.test.ts
git commit -m "feat: allow r2 article image host"
```

---

### Task 8: Add Protected Article Cache Refresh Endpoint

**Files:**
- Create: `app/api/articles/cache/route.ts`
- Test: `tests/unit/article-cache-route-auth.test.ts`

- [ ] **Step 1: Write route auth tests**

Create `tests/unit/article-cache-route-auth.test.ts`:

```ts
import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/articles/article-directory', () => ({
    clearArticleDirectoryCache: vi.fn(),
}));

describe('article cache route auth', () => {
    const originalToken = process.env.KNOWLEDGE_ADMIN_TOKEN;

    afterEach(() => {
        if (originalToken === undefined) delete process.env.KNOWLEDGE_ADMIN_TOKEN;
        else process.env.KNOWLEDGE_ADMIN_TOKEN = originalToken;
        vi.clearAllMocks();
    });

    it('rejects cache refresh without an admin token', async () => {
        process.env.KNOWLEDGE_ADMIN_TOKEN = 'unit-test-token';
        const { POST } = await import('@/app/api/articles/cache/route');

        const response = await POST(new NextRequest('http://localhost:5046/api/articles/cache', { method: 'POST' }));

        expect(response.status).toBe(401);
    });

    it('clears article caches with a valid admin token', async () => {
        process.env.KNOWLEDGE_ADMIN_TOKEN = 'unit-test-token';
        const { clearArticleDirectoryCache } = await import('@/lib/articles/article-directory');
        const { POST } = await import('@/app/api/articles/cache/route');

        const response = await POST(new NextRequest('http://localhost:5046/api/articles/cache', {
            method: 'POST',
            headers: { authorization: 'Bearer unit-test-token' },
        }));
        const body = await response.json();

        expect(response.status).toBe(200);
        expect(body).toEqual({ success: true, message: 'Article cache cleared' });
        expect(clearArticleDirectoryCache).toHaveBeenCalledTimes(1);
    });
});
```

- [ ] **Step 2: Run test to verify failure**

Run:

```bash
npm test -- tests/unit/article-cache-route-auth.test.ts
```

Expected: FAIL because the route does not exist.

- [ ] **Step 3: Implement route**

Create `app/api/articles/cache/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { clearArticleDirectoryCache } from '@/lib/articles/article-directory';
import { verifyAdminHeaders } from '@/lib/utils/admin-auth';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
    const authResult = verifyAdminHeaders(request.headers);
    if (!authResult.ok) {
        return NextResponse.json({ error: authResult.error }, { status: authResult.status });
    }

    clearArticleDirectoryCache();
    return NextResponse.json({ success: true, message: 'Article cache cleared' });
}
```

- [ ] **Step 4: Run route tests**

Run:

```bash
npm test -- tests/unit/article-cache-route-auth.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/api/articles/cache/route.ts tests/unit/article-cache-route-auth.test.ts
git commit -m "feat: add article cache refresh endpoint"
```

---

### Task 9: Update Operations Documentation

**Files:**
- Modify: `docs/运维/Mockingbird_web部署与迁移指南.md`

- [ ] **Step 1: Replace Git content repo instructions**

In section `2.1.1 文章内容仓库`, replace the local Git repository explanation with R2 storage instructions:

```md
### 2.1.1 文章内容存储

生产环境文章内容存储在 Cloudflare R2，不再依赖服务器本地 Git 内容仓库。

- R2 bucket：`knowledge-articles`
- 文章 manifest：`ai/manifest.json`
- 文章正文：`ai/articles/<slug>/index.md`
- 文章图片：`ai/articles/<slug>/images/...`
- 公开图片域名：`https://assets.zgnknowledge.online`
```

- [ ] **Step 2: Update production environment variables**

Replace the `ARTICLE_LOCAL_SOURCES` entry in section `4. 生产环境变量`:

```env
ARTICLE_R2_SOURCES=[{"site":"ai","source":"web-article","bucket":"knowledge-articles","prefix":"ai","manifestPath":"manifest.json","publicBaseUrl":"https://assets.zgnknowledge.online/ai"}]
ARTICLE_R2_PUBLIC_HOST=assets.zgnknowledge.online
R2_ACCOUNT_ID=...
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
```

Add cache refresh command:

```bash
curl -X POST https://zgnknowledge.online/api/articles/cache \
  -H "Authorization: Bearer $KNOWLEDGE_ADMIN_TOKEN"
```

- [ ] **Step 3: Commit**

```bash
git add docs/运维/Mockingbird_web部署与迁移指南.md
git commit -m "docs: document r2 article storage"
```

---

### Task 10: Full Verification

**Files:**
- No new files.

- [ ] **Step 1: Run focused tests**

Run:

```bash
npm test -- tests/unit/article-source-config.test.ts tests/unit/r2-article-client.test.ts tests/unit/local-article-directory.test.ts tests/unit/r2-article-directory.test.ts tests/unit/article-service-github.test.ts tests/unit/article-service-r2.test.ts tests/unit/article-assets-route.test.ts tests/unit/article-cache-route-auth.test.ts tests/unit/next-config-images.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run full unit test suite**

Run:

```bash
npm test
```

Expected: PASS.

- [ ] **Step 3: Run lint**

Run:

```bash
npm run lint
```

Expected: PASS.

- [ ] **Step 4: Run production build**

Run:

```bash
npm run build
```

Expected: PASS.

- [ ] **Step 5: Optional local smoke test with R2 credentials**

Set local environment variables:

```env
ARTICLE_R2_SOURCES=[{"site":"ai","source":"web-article","bucket":"knowledge-articles","prefix":"ai","manifestPath":"manifest.json","publicBaseUrl":"https://assets.zgnknowledge.online/ai"}]
ARTICLE_R2_PUBLIC_HOST=assets.zgnknowledge.online
R2_ACCOUNT_ID=...
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
```

Run:

```bash
npm run dev
```

Open:

```text
http://localhost:5046/ai/articles
```

Expected:

- Article list loads from R2.
- Article detail page renders markdown content.
- Cover images use `https://assets.zgnknowledge.online/...`.
- Relative markdown images render from the same R2 public host.

- [ ] **Step 6: Commit final fixes if any**

```bash
git status --short
git add <changed-files>
git commit -m "fix: finalize r2 article source migration"
```

Only run this commit if verification required additional fixes.
