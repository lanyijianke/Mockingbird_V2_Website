# R2 Article State Machine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Use Cloudflare R2 as the authoritative article storage and publishing state store, replacing the old GitHub repository state with explicit JSON state snapshots, validation, publish, and rollback flows.

**Architecture:** R2 remains a flat object store. The website reads only the current published snapshot at `ai/manifest.json`; publish tooling writes article objects, per-article state files, immutable manifest snapshots, and event logs before atomically switching the current snapshot by overwriting `ai/manifest.json`. Directory-like prefixes are only organization conventions, not state authority.

**Tech Stack:** Next.js App Router, TypeScript, Vitest, Node scripts, `@aws-sdk/client-s3`, Cloudflare R2 S3-compatible API, existing article directory cache.

---

## Target R2 Contract

Bucket:

```text
knowledge-articles
```

Runtime website source:

```text
ai/manifest.json
```

State-machine layout:

```text
ai/
  manifest.json
  manifests/
    2026-06-03T10-00-00-000Z.json
  state/
    articles/
      {slug}.json
  events/
    2026-06-03T10-00-00-000Z-publish-{slug}.json
  articles/
    draft/
      {slug}/
        index.md
        images/cover.jpg
    review/
      {slug}/
        index.md
        images/cover.jpg
    scheduled/
      {slug}/
        index.md
        images/cover.jpg
    published/
      {slug}/
        index.md
        images/cover.jpg
    archived/
      {slug}/
        index.md
        images/cover.jpg
```

Important rule:

```text
ai/manifest.json is the only file the production website treats as current published truth.
```

The other files exist so operations can validate, audit, and roll back publishing state without depending on GitHub history.

## State Model

Article states:

```ts
export type ArticleSourceStatus =
    | 'draft'
    | 'review'
    | 'scheduled'
    | 'published'
    | 'archived';
```

Allowed transitions:

```text
draft -> review
review -> draft
review -> scheduled
review -> published
scheduled -> review
scheduled -> published
published -> archived
archived -> published
```

Per-article state file:

```json
{
  "schemaVersion": 1,
  "site": "ai",
  "source": "web-article",
  "slug": "building-self-improving-tax-agents",
  "state": "published",
  "version": 7,
  "contentKey": "ai/articles/published/building-self-improving-tax-agents/index.md",
  "assetPrefix": "ai/articles/published/building-self-improving-tax-agents/",
  "manifestSnapshotKey": "ai/manifests/2026-06-03T10-00-00-000Z.json",
  "checksum": "sha256:REPLACE_WITH_CONTENT_HASH",
  "updatedAt": "2026-06-03T10:00:00.000Z",
  "updatedBy": "content-bridge"
}
```

Manifest snapshot:

```json
{
  "schemaVersion": 1,
  "site": "ai",
  "source": "web-article",
  "revision": "2026-06-03T10-00-00-000Z",
  "updatedAt": "2026-06-03T10:00:00.000Z",
  "categories": [
    { "code": "ai-tech", "name": "AI技术" }
  ],
  "articles": [
    {
      "id": "ai-1",
      "slug": "building-self-improving-tax-agents",
      "title": "Building Self Improving Tax Agents",
      "summary": "summary",
      "category": "ai-tech",
      "author": "Mockingbird",
      "originalUrl": "https://example.com/source",
      "sourcePlatform": "website",
      "type": "article",
      "coverImage": "images/cover.jpg",
      "contentPath": "articles/published/building-self-improving-tax-agents/index.md",
      "publishedAt": "2026-06-03T10:00:00.000Z",
      "updatedAt": "2026-06-03T10:00:00.000Z",
      "status": "published",
      "stateVersion": 7,
      "checksum": "sha256:REPLACE_WITH_CONTENT_HASH"
    }
  ]
}
```

Existing website code must continue to work with this manifest shape because it already ignores unknown fields such as `schemaVersion`, `revision`, `stateVersion`, and `checksum`.

## File Structure

- Modify `lib/articles/source-types.ts`: extend article statuses and add explicit state machine interfaces.
- Create `lib/articles/state-machine.ts`: centralize state paths, transition validation, state document validation, manifest snapshot construction, and checksum helpers.
- Test `tests/unit/article-state-machine.test.ts`: lock down path construction, transition rules, published-only manifest behavior, and checksum behavior.
- Modify `lib/articles/article-directory.ts`: keep reading `ai/manifest.json`, accept the richer manifest schema, and continue filtering only `status: 'published'`.
- Extend `tests/unit/r2-article-directory.test.ts`: verify content and asset URLs work when `contentPath` includes `articles/published/{slug}/index.md`.
- Create `scripts/r2-article-state.mjs`: operational tool for `verify`, `snapshot`, `promote`, and `rollback`.
- Create `docs/运维/R2文章状态机与发布流程.md`: human runbook for operators and the content bridge.

---

### Task 1: Define State Types and Transitions

**Files:**
- Modify: `lib/articles/source-types.ts`
- Create: `lib/articles/state-machine.ts`
- Create: `tests/unit/article-state-machine.test.ts`

- [ ] **Step 1: Write failing tests for valid and invalid transitions**

Add `tests/unit/article-state-machine.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
    assertArticleStateTransition,
    buildArticleStateKey,
    buildArticleContentPath,
    buildManifestSnapshotKey,
} from '@/lib/articles/state-machine';

describe('article state machine', () => {
    it('allows expected publishing transitions', () => {
        expect(() => assertArticleStateTransition('draft', 'review')).not.toThrow();
        expect(() => assertArticleStateTransition('review', 'published')).not.toThrow();
        expect(() => assertArticleStateTransition('published', 'archived')).not.toThrow();
        expect(() => assertArticleStateTransition('archived', 'published')).not.toThrow();
    });

    it('rejects invalid publishing transitions', () => {
        expect(() => assertArticleStateTransition('draft', 'published')).toThrow(/invalid article state transition/i);
        expect(() => assertArticleStateTransition('archived', 'review')).toThrow(/invalid article state transition/i);
    });

    it('builds stable R2 keys for state and snapshots', () => {
        expect(buildArticleStateKey('ai', 'prompt-caching')).toBe('ai/state/articles/prompt-caching.json');
        expect(buildArticleContentPath('published', 'prompt-caching')).toBe('articles/published/prompt-caching/index.md');
        expect(buildManifestSnapshotKey('ai', '2026-06-03T10-00-00-000Z')).toBe(
            'ai/manifests/2026-06-03T10-00-00-000Z.json',
        );
    });
});
```

- [ ] **Step 2: Run test to verify failure**

Run:

```bash
npm test -- tests/unit/article-state-machine.test.ts
```

Expected: FAIL because `lib/articles/state-machine.ts` does not exist.

- [ ] **Step 3: Extend source status types**

Modify `lib/articles/source-types.ts`:

```ts
export type ArticleSourceStatus =
    | 'draft'
    | 'review'
    | 'scheduled'
    | 'published'
    | 'archived';

export interface ArticleStateDocument {
    schemaVersion: 1;
    site: ArticleSite;
    source: string;
    slug: string;
    state: ArticleSourceStatus;
    version: number;
    contentKey: string;
    assetPrefix: string;
    manifestSnapshotKey?: string;
    checksum: string;
    updatedAt: string;
    updatedBy: string;
}
```

- [ ] **Step 4: Implement transition helpers**

Create `lib/articles/state-machine.ts`:

```ts
import crypto from 'crypto';
import type { ArticleSourceManifest, ArticleSourceStatus } from './source-types';

const ALLOWED_TRANSITIONS: Record<ArticleSourceStatus, ArticleSourceStatus[]> = {
    draft: ['review'],
    review: ['draft', 'scheduled', 'published'],
    scheduled: ['review', 'published'],
    published: ['archived'],
    archived: ['published'],
};

export function assertArticleStateTransition(from: ArticleSourceStatus, to: ArticleSourceStatus): void {
    if (!ALLOWED_TRANSITIONS[from]?.includes(to)) {
        throw new Error(`Invalid article state transition: ${from} -> ${to}`);
    }
}

export function buildArticleStateKey(sitePrefix: string, slug: string): string {
    return `${sitePrefix.replace(/^\/+|\/+$/g, '')}/state/articles/${slug}.json`;
}

export function buildArticleContentPath(state: ArticleSourceStatus, slug: string): string {
    return `articles/${state}/${slug}/index.md`;
}

export function buildManifestSnapshotKey(sitePrefix: string, revision: string): string {
    return `${sitePrefix.replace(/^\/+|\/+$/g, '')}/manifests/${revision}.json`;
}

export function createSha256Checksum(content: string | Uint8Array): string {
    return `sha256:${crypto.createHash('sha256').update(content).digest('hex')}`;
}

export function filterPublishedManifest(manifest: ArticleSourceManifest): ArticleSourceManifest {
    return {
        ...manifest,
        articles: manifest.articles.filter((article) => article.status === 'published'),
    };
}
```

- [ ] **Step 5: Run focused test**

Run:

```bash
npm test -- tests/unit/article-state-machine.test.ts
```

Expected: PASS.

---

### Task 2: Verify Website Reads Published Prefixes Correctly

**Files:**
- Modify: `tests/unit/r2-article-directory.test.ts`
- Modify only if required: `lib/articles/article-directory.ts`

- [ ] **Step 1: Add a regression test for the new content path**

Add a test to `tests/unit/r2-article-directory.test.ts`:

```ts
it('supports state-machine published article paths from R2 manifests', async () => {
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
        schemaVersion: 1,
        site: 'ai',
        source: 'web-article',
        revision: '2026-06-03T10-00-00-000Z',
        articles: [
            {
                id: 'ai-1',
                slug: 'stateful-publish',
                title: 'Stateful Publish',
                summary: 'summary',
                category: 'ai-tech',
                author: '@author',
                originalUrl: 'https://example.com/stateful-publish',
                sourcePlatform: 'website',
                type: 'article',
                coverImage: 'images/cover.jpg',
                contentPath: 'articles/published/stateful-publish/index.md',
                publishedAt: '2026-06-03T10:00:00.000Z',
                updatedAt: '2026-06-03T10:00:00.000Z',
                status: 'published',
                stateVersion: 1,
                checksum: 'sha256:test',
            },
        ],
    }));

    const directory = await fetchAggregatedArticleDirectory({ forceRefresh: true });

    expect(directory.entries[0]).toMatchObject({
        slug: 'stateful-publish',
        assetBasePath: 'https://assets.zgnknowledge.online/ai/articles/published/stateful-publish',
        coverUrl: 'https://assets.zgnknowledge.online/ai/articles/published/stateful-publish/images/cover.jpg',
        contentKey: 'ai/articles/published/stateful-publish/index.md',
    });
});
```

- [ ] **Step 2: Run focused test**

Run:

```bash
npm test -- tests/unit/r2-article-directory.test.ts
```

Expected: PASS. If it fails, update `lib/articles/article-directory.ts` path resolution without changing public route behavior.

---

### Task 3: Add Operational R2 State Tool

**Files:**
- Create: `scripts/r2-article-state.mjs`
- Test manually with dry-run commands first.

- [ ] **Step 1: Create the script shell**

Create `scripts/r2-article-state.mjs` with commands:

```js
#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { S3Client, GetObjectCommand, PutObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';

const command = process.argv[2];
const args = Object.fromEntries(
    process.argv.slice(3).map((arg) => {
        const [key, ...rest] = arg.replace(/^--/, '').split('=');
        return [key, rest.join('=') || 'true'];
    }),
);

const required = ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY'];
for (const name of required) {
    if (!process.env[name]) {
        throw new Error(`${name} is required`);
    }
}

const client = new S3Client({
    region: 'auto',
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    },
});

function requireArg(name) {
    if (!args[name]) throw new Error(`--${name}=... is required`);
    return args[name];
}

function sha256(text) {
    return `sha256:${createHash('sha256').update(text).digest('hex')}`;
}

async function readText(bucket, key) {
    const response = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    if (!response.Body) throw new Error(`Object has no body: ${bucket}/${key}`);
    return response.Body.transformToString('utf-8');
}

async function writeJson(bucket, key, value) {
    await client.send(new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: `${JSON.stringify(value, null, 2)}\n`,
        ContentType: 'application/json; charset=utf-8',
    }));
}

async function listKeys(bucket, prefix) {
    const keys = [];
    let ContinuationToken;
    do {
        const response = await client.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, ContinuationToken }));
        for (const item of response.Contents || []) {
            if (item.Key) keys.push(item.Key);
        }
        ContinuationToken = response.NextContinuationToken;
    } while (ContinuationToken);
    return keys;
}

async function verify() {
    const bucket = requireArg('bucket');
    const prefix = requireArg('prefix').replace(/^\/+|\/+$/g, '');
    const manifest = JSON.parse(await readText(bucket, `${prefix}/manifest.json`));
    const missing = [];

    for (const article of manifest.articles || []) {
        if (article.status !== 'published') continue;
        const contentKey = `${prefix}/${article.contentPath}`;
        try {
            await readText(bucket, contentKey);
        } catch {
            missing.push(contentKey);
        }
    }

    if (missing.length > 0) {
        console.error(`Missing objects:\n${missing.join('\n')}`);
        process.exitCode = 1;
        return;
    }

    console.log(`OK: verified ${manifest.articles.filter((article) => article.status === 'published').length} published articles`);
}

async function snapshot() {
    const bucket = requireArg('bucket');
    const prefix = requireArg('prefix').replace(/^\/+|\/+$/g, '');
    const revision = new Date().toISOString().replace(/[:.]/g, '-');
    const manifest = JSON.parse(await readText(bucket, `${prefix}/manifest.json`));
    manifest.revision = revision;
    manifest.updatedAt = new Date().toISOString();
    await writeJson(bucket, `${prefix}/manifests/${revision}.json`, manifest);
    console.log(`${prefix}/manifests/${revision}.json`);
}

async function rollback() {
    const bucket = requireArg('bucket');
    const prefix = requireArg('prefix').replace(/^\/+|\/+$/g, '');
    const snapshotKey = requireArg('snapshot');
    const manifest = JSON.parse(await readText(bucket, snapshotKey));
    await writeJson(bucket, `${prefix}/manifest.json`, manifest);
    console.log(`Rolled back ${prefix}/manifest.json to ${snapshotKey}`);
}

async function main() {
    if (command === 'verify') return verify();
    if (command === 'snapshot') return snapshot();
    if (command === 'rollback') return rollback();
    if (command === 'list') {
        const bucket = requireArg('bucket');
        const prefix = requireArg('prefix').replace(/^\/+|\/+$/g, '');
        console.log((await listKeys(bucket, prefix)).join('\n'));
        return;
    }
    throw new Error('Command must be one of: verify, snapshot, rollback, list');
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
```

- [ ] **Step 2: Run dry verification against R2**

Run with the production credentials already configured in the shell:

```bash
node scripts/r2-article-state.mjs verify --bucket=knowledge-articles --prefix=ai
```

Expected:

```text
OK: verified 101 published articles
```

- [ ] **Step 3: Create an immutable snapshot**

Run:

```bash
node scripts/r2-article-state.mjs snapshot --bucket=knowledge-articles --prefix=ai
```

Expected: prints an object key under `ai/manifests/`.

- [ ] **Step 4: Verify snapshot exists**

Run:

```bash
node scripts/r2-article-state.mjs list --bucket=knowledge-articles --prefix=ai/manifests/
```

Expected: output includes the snapshot key from Step 3.

---

### Task 4: Define Publish and Rollback Operations

**Files:**
- Modify: `scripts/r2-article-state.mjs`
- Modify: `docs/运维/R2文章状态机与发布流程.md`

- [ ] **Step 1: Add publish operation rules to the runbook**

Create `docs/运维/R2文章状态机与发布流程.md`:

```md
# R2文章状态机与发布流程

线上网站只读取 `ai/manifest.json`。R2 控制台里的目录只是对象 Key 前缀展示，不是状态来源。

## 发布顺序

1. 上传正文到 `ai/articles/published/{slug}/index.md`。
2. 上传图片到 `ai/articles/published/{slug}/images/`。
3. 写入 `ai/state/articles/{slug}.json`。
4. 读取当前 `ai/manifest.json`，生成新的 manifest 内容。
5. 写入不可变快照 `ai/manifests/{revision}.json`。
6. 覆盖 `ai/manifest.json`。
7. 调用网站缓存刷新接口 `/api/articles/cache`。
8. 请求 `/api/articles?action=slugs&site=ai` 验证文章列表。

## 回滚

把某个 `ai/manifests/{revision}.json` 覆盖回 `ai/manifest.json`，然后刷新网站文章缓存。

## 运营约束

同一时间只允许一个发布任务写 `ai/manifest.json`。内容中台桥接任务需要串行执行发布。
```

- [ ] **Step 2: Add rollback command usage to the runbook**

Append:

```md
## 命令

验证当前线上状态：

```bash
node scripts/r2-article-state.mjs verify --bucket=knowledge-articles --prefix=ai
```

生成当前线上状态快照：

```bash
node scripts/r2-article-state.mjs snapshot --bucket=knowledge-articles --prefix=ai
```

回滚：

```bash
node scripts/r2-article-state.mjs rollback --bucket=knowledge-articles --prefix=ai --snapshot=ai/manifests/2026-06-03T10-00-00-000Z.json
```
```

---

### Task 5: Production Verification

**Files:**
- No source changes.

- [ ] **Step 1: Run local tests**

Run:

```bash
npm test -- tests/unit/article-state-machine.test.ts tests/unit/r2-article-directory.test.ts tests/unit/article-source-config.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run build**

Run:

```bash
npm run build
```

Expected: PASS.

- [ ] **Step 3: Verify R2 public manifest**

Run:

```bash
curl -fsS https://assets.zgnknowledge.online/ai/manifest.json | head
```

Expected: JSON output begins with `{`.

- [ ] **Step 4: Verify production API uses R2 manifest**

Run:

```bash
curl -fsS "https://zgnknowledge.online/api/articles?action=slugs&site=ai"
```

Expected: response contains AI article slugs from `knowledge-articles/ai/manifest.json`.

- [ ] **Step 5: Verify a known published image**

Run:

```bash
curl -I https://assets.zgnknowledge.online/ai/articles/published/building-self-improving-tax-agents/images/cover.jpg
```

Expected: `HTTP/2 200` or `HTTP/1.1 200`.

---

## Deployment Notes

Current production environment should keep:

```env
ARTICLE_R2_SOURCES=[{"site":"ai","source":"web-article","bucket":"knowledge-articles","prefix":"ai","manifestPath":"manifest.json","publicBaseUrl":"https://assets.zgnknowledge.online/ai"}]
ARTICLE_R2_PUBLIC_HOST=assets.zgnknowledge.online
R2_ACCOUNT_ID=4524b1d8551fa19f1fcb2cb6f16ee3b9
```

Do not keep `ARTICLE_LOCAL_SOURCES` enabled in production once R2 is the source of truth.

## Self-Review

- Spec coverage: covers R2 state modeling, published manifest authority, state files, event/snapshot layout, verification, rollback, and website compatibility.
- Placeholder scan: no `TBD`, no generic “add validation later”; each implementation task has concrete paths, commands, and expected outcomes.
- Type consistency: status names match `ArticleSourceStatus`; manifest fields keep current website compatibility.

