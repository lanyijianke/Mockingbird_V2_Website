# Unified Content Revalidation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Centralize all content cache invalidation and Next.js page revalidation behind one typed content-change event system.

**Architecture:** Add a single `lib/cache/content-revalidation.ts` module that maps article, prompt, ranking, and all-content events to memory cache invalidation plus `revalidatePath()` calls. Expose the same module through an authenticated `POST /api/revalidate/content` route so runtime jobs, scripts, skills, and future publishing tools use one contract instead of scattered cache-clearing code.

**Tech Stack:** Next.js App Router, TypeScript, Vitest, existing `CacheManager`, `next/cache` `revalidatePath`, existing admin-token header verification.

---

## File Structure

- Create `lib/cache/content-revalidation.ts`: typed event contract, path mapping, memory-cache invalidation, optional `revalidatePath` adapter injection for tests, public `revalidateContentChange()` function.
- Create `tests/unit/content-revalidation.test.ts`: unit coverage for article, prompt, rankings, and all-content event path/tag behavior.
- Create `app/api/revalidate/content/route.ts`: authenticated HTTP entrypoint for scripts and skills.
- Create `tests/unit/content-revalidation-route.test.ts`: route auth and payload tests.
- Modify `app/api/articles/cache/route.ts`: delegate existing article cache endpoint to the unified revalidation module.
- Modify `tests/unit/article-cache-route-auth.test.ts`: assert old endpoint still works but now calls unified revalidation.
- Modify `lib/jobs/scheduler.ts`: after prompt sync changes or ranking refreshes, call the unified module.
- Modify `tests/unit/scheduler.test.ts`: assert scheduler invokes unified revalidation only when prompt sync reports changes and after ranking refresh.
- Modify `app/api/jobs/route.ts`: manual prompt sync trigger also calls unified revalidation when changes occur.
- Modify `tests/unit/jobs-route-auth.test.ts`: assert manual sync revalidates on changes.
- Modify `console-knowledge-handoff/SKILL.md`: update publishing step to call `POST /api/revalidate/content` after manifest publication.
- Modify `.env.example`: document that the revalidation API uses existing `KNOWLEDGE_ADMIN_TOKEN` / `ADMIN_API_TOKEN`.

---

### Task 1: Unified Revalidation Module

**Files:**
- Create: `lib/cache/content-revalidation.ts`
- Create: `tests/unit/content-revalidation.test.ts`

- [ ] **Step 1: Write failing tests for event-to-path and tag behavior**

Create `tests/unit/content-revalidation.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const invalidateTag = vi.fn();

vi.mock('@/lib/cache/runtime', () => ({
    getCacheManager: () => ({ invalidateTag }),
}));

describe('content revalidation', () => {
    beforeEach(() => {
        invalidateTag.mockClear();
    });

    it('revalidates article public surfaces and clears article cache tags', async () => {
        const revalidatePath = vi.fn();
        const { revalidateContentChange } = await import('@/lib/cache/content-revalidation');

        const result = revalidateContentChange({
            type: 'article',
            action: 'publish',
            site: 'ai',
            slug: 'agent-review-gates',
        }, { revalidatePath });

        expect(result.paths).toEqual([
            '/',
            '/ai',
            '/ai/articles',
            '/ai/articles/agent-review-gates',
            '/sitemap.xml',
        ]);
        expect(revalidatePath).toHaveBeenCalledTimes(5);
        expect(invalidateTag).toHaveBeenCalledWith('articles');
    });

    it('revalidates prompt public surfaces and clears prompt cache tags', async () => {
        const revalidatePath = vi.fn();
        const { revalidateContentChange } = await import('@/lib/cache/content-revalidation');

        const result = revalidateContentChange({
            type: 'prompt',
            action: 'sync',
            id: 42,
        }, { revalidatePath });

        expect(result.paths).toEqual([
            '/',
            '/ai',
            '/ai/prompts',
            '/ai/prompts/42',
            '/sitemap.xml',
        ]);
        expect(invalidateTag).toHaveBeenCalledWith('prompts');
        expect(invalidateTag).toHaveBeenCalledWith('prompts:detail:42');
    });

    it('revalidates all ranking pages and clears ranking cache tags', async () => {
        const revalidatePath = vi.fn();
        const { revalidateContentChange } = await import('@/lib/cache/content-revalidation');

        const result = revalidateContentChange({
            type: 'rankings',
            action: 'refresh',
            kind: 'all',
        }, { revalidatePath });

        expect(result.paths).toEqual([
            '/',
            '/ai',
            '/ai/rankings/github',
            '/ai/rankings/producthunt',
            '/ai/rankings/skills-trending',
            '/ai/rankings/skills-hot',
        ]);
        expect(invalidateTag).toHaveBeenCalledWith('rankings');
    });

    it('deduplicates paths for all-content revalidation', async () => {
        const revalidatePath = vi.fn();
        const { revalidateContentChange } = await import('@/lib/cache/content-revalidation');

        const result = revalidateContentChange({
            type: 'all',
            action: 'manual',
        }, { revalidatePath });

        expect(result.paths).toEqual([
            '/',
            '/ai',
            '/finance',
            '/ai/articles',
            '/finance/articles',
            '/ai/prompts',
            '/ai/rankings/github',
            '/ai/rankings/producthunt',
            '/ai/rankings/skills-trending',
            '/ai/rankings/skills-hot',
            '/sitemap.xml',
        ]);
        expect(new Set(result.paths).size).toBe(result.paths.length);
    });
});
```

- [ ] **Step 2: Run the failing test**

Run:

```bash
npm test -- tests/unit/content-revalidation.test.ts
```

Expected: FAIL because `@/lib/cache/content-revalidation` does not exist.

- [ ] **Step 3: Implement the unified module**

Create `lib/cache/content-revalidation.ts`:

```ts
import { revalidatePath as nextRevalidatePath } from 'next/cache';
import { getCacheManager } from '@/lib/cache/runtime';
import { cacheTags } from '@/lib/cache/keys';
import { getArticleDetailPath, getArticleListPath } from '@/lib/articles/article-route-paths';

type ArticleSite = 'ai' | 'finance';
type RankingKind = 'github' | 'producthunt' | 'skills-trending' | 'skills-hot' | 'all';

export type ContentRevalidationEvent =
    | { type: 'article'; action: 'publish' | 'update' | 'unpublish' | 'manual'; site: ArticleSite; slug?: string }
    | { type: 'prompt'; action: 'sync' | 'update' | 'manual'; id?: number }
    | { type: 'rankings'; action: 'refresh' | 'manual'; kind?: RankingKind }
    | { type: 'all'; action: 'manual' };

export interface ContentRevalidationResult {
    paths: string[];
    tags: string[];
}

export interface ContentRevalidationOptions {
    revalidatePath?: (path: string) => void;
}

const RANKING_PATHS: Record<Exclude<RankingKind, 'all'>, string> = {
    github: '/ai/rankings/github',
    producthunt: '/ai/rankings/producthunt',
    'skills-trending': '/ai/rankings/skills-trending',
    'skills-hot': '/ai/rankings/skills-hot',
};

function unique(values: string[]): string[] {
    return Array.from(new Set(values));
}

function articlePaths(event: Extract<ContentRevalidationEvent, { type: 'article' }>): string[] {
    const paths = ['/', `/${event.site}`, getArticleListPath(event.site), '/sitemap.xml'];
    if (event.slug) {
        paths.splice(3, 0, getArticleDetailPath(event.site, event.slug));
    }
    return paths;
}

function promptPaths(event: Extract<ContentRevalidationEvent, { type: 'prompt' }>): string[] {
    const paths = ['/', '/ai', '/ai/prompts', '/sitemap.xml'];
    if (typeof event.id === 'number' && Number.isFinite(event.id) && event.id > 0) {
        paths.splice(3, 0, `/ai/prompts/${event.id}`);
    }
    return paths;
}

function rankingPaths(event: Extract<ContentRevalidationEvent, { type: 'rankings' }>): string[] {
    const kind = event.kind || 'all';
    if (kind !== 'all') return ['/', '/ai', RANKING_PATHS[kind]];
    return ['/', '/ai', ...Object.values(RANKING_PATHS)];
}

function allPaths(): string[] {
    return [
        '/',
        '/ai',
        '/finance',
        getArticleListPath('ai'),
        getArticleListPath('finance'),
        '/ai/prompts',
        ...Object.values(RANKING_PATHS),
        '/sitemap.xml',
    ];
}

function pathsForEvent(event: ContentRevalidationEvent): string[] {
    if (event.type === 'article') return articlePaths(event);
    if (event.type === 'prompt') return promptPaths(event);
    if (event.type === 'rankings') return rankingPaths(event);
    return allPaths();
}

function tagsForEvent(event: ContentRevalidationEvent): string[] {
    if (event.type === 'article') return [cacheTags.articles];
    if (event.type === 'prompt') {
        const tags = [cacheTags.prompts];
        if (typeof event.id === 'number' && Number.isFinite(event.id) && event.id > 0) {
            tags.push(cacheTags.promptDetail(event.id));
        }
        return tags;
    }
    if (event.type === 'rankings') return [cacheTags.rankings];
    return [cacheTags.articles, cacheTags.prompts, cacheTags.rankings];
}

export function revalidateContentChange(
    event: ContentRevalidationEvent,
    options: ContentRevalidationOptions = {},
): ContentRevalidationResult {
    const paths = unique(pathsForEvent(event));
    const tags = unique(tagsForEvent(event));
    const cacheManager = getCacheManager();
    const revalidatePath = options.revalidatePath || nextRevalidatePath;

    for (const tag of tags) {
        cacheManager.invalidateTag(tag);
    }

    for (const path of paths) {
        revalidatePath(path);
    }

    return { paths, tags };
}
```

- [ ] **Step 4: Run the module test**

Run:

```bash
npm test -- tests/unit/content-revalidation.test.ts
```

Expected: PASS.

---

### Task 2: Authenticated Revalidation API and Existing Article Cache Delegation

**Files:**
- Create: `app/api/revalidate/content/route.ts`
- Create: `tests/unit/content-revalidation-route.test.ts`
- Modify: `app/api/articles/cache/route.ts`
- Modify: `tests/unit/article-cache-route-auth.test.ts`

- [ ] **Step 1: Write failing route tests**

Create `tests/unit/content-revalidation-route.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const revalidateContentChange = vi.fn(() => ({
    paths: ['/ai/articles'],
    tags: ['articles'],
}));

vi.mock('@/lib/cache/content-revalidation', () => ({
    revalidateContentChange,
}));

describe('content revalidation route', () => {
    beforeEach(() => {
        vi.resetModules();
        vi.clearAllMocks();
        process.env.KNOWLEDGE_ADMIN_TOKEN = 'secret-token';
        delete process.env.ADMIN_API_TOKEN;
    });

    it('rejects missing admin token', async () => {
        const { POST } = await import('@/app/api/revalidate/content/route');

        const response = await POST(new NextRequest('http://localhost:5046/api/revalidate/content', {
            method: 'POST',
            body: JSON.stringify({ type: 'article', action: 'publish', site: 'ai', slug: 'new-one' }),
        }));

        expect(response.status).toBe(401);
        expect(revalidateContentChange).not.toHaveBeenCalled();
    });

    it('revalidates valid content event with admin token', async () => {
        const { POST } = await import('@/app/api/revalidate/content/route');

        const response = await POST(new NextRequest('http://localhost:5046/api/revalidate/content', {
            method: 'POST',
            headers: { 'x-admin-token': 'secret-token' },
            body: JSON.stringify({ type: 'article', action: 'publish', site: 'ai', slug: 'new-one' }),
        }));
        const payload = await response.json();

        expect(response.status).toBe(200);
        expect(payload).toEqual({ success: true, data: { paths: ['/ai/articles'], tags: ['articles'] } });
        expect(revalidateContentChange).toHaveBeenCalledWith({
            type: 'article',
            action: 'publish',
            site: 'ai',
            slug: 'new-one',
        });
    });

    it('rejects unsupported event payloads', async () => {
        const { POST } = await import('@/app/api/revalidate/content/route');

        const response = await POST(new NextRequest('http://localhost:5046/api/revalidate/content', {
            method: 'POST',
            headers: { 'x-admin-token': 'secret-token' },
            body: JSON.stringify({ type: 'article', action: 'publish', site: 'unknown' }),
        }));

        expect(response.status).toBe(400);
        expect(revalidateContentChange).not.toHaveBeenCalled();
    });
});
```

- [ ] **Step 2: Run failing route tests**

Run:

```bash
npm test -- tests/unit/content-revalidation-route.test.ts
```

Expected: FAIL because the route does not exist.

- [ ] **Step 3: Implement the route**

Create `app/api/revalidate/content/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import {
    revalidateContentChange,
    type ContentRevalidationEvent,
} from '@/lib/cache/content-revalidation';
import { verifyAdminHeaders } from '@/lib/utils/admin-auth';

export const runtime = 'nodejs';

function isPositiveInteger(value: unknown): value is number {
    return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

function parseEvent(value: unknown): ContentRevalidationEvent | null {
    if (!value || typeof value !== 'object') return null;
    const candidate = value as Record<string, unknown>;

    if (candidate.type === 'article') {
        if (!['publish', 'update', 'unpublish', 'manual'].includes(String(candidate.action))) return null;
        if (candidate.site !== 'ai' && candidate.site !== 'finance') return null;
        return {
            type: 'article',
            action: candidate.action as ContentRevalidationEvent['action'],
            site: candidate.site,
            slug: typeof candidate.slug === 'string' && candidate.slug.trim() ? candidate.slug.trim() : undefined,
        } as ContentRevalidationEvent;
    }

    if (candidate.type === 'prompt') {
        if (!['sync', 'update', 'manual'].includes(String(candidate.action))) return null;
        return {
            type: 'prompt',
            action: candidate.action as 'sync' | 'update' | 'manual',
            id: isPositiveInteger(candidate.id) ? candidate.id : undefined,
        };
    }

    if (candidate.type === 'rankings') {
        if (!['refresh', 'manual'].includes(String(candidate.action))) return null;
        const kind = typeof candidate.kind === 'string' ? candidate.kind : 'all';
        if (!['github', 'producthunt', 'skills-trending', 'skills-hot', 'all'].includes(kind)) return null;
        return {
            type: 'rankings',
            action: candidate.action as 'refresh' | 'manual',
            kind: kind as ContentRevalidationEvent extends { kind?: infer K } ? K : never,
        } as ContentRevalidationEvent;
    }

    if (candidate.type === 'all') {
        if (candidate.action !== 'manual') return null;
        return { type: 'all', action: 'manual' };
    }

    return null;
}

export async function POST(request: NextRequest) {
    const authResult = verifyAdminHeaders(request.headers);
    if (!authResult.ok) {
        return NextResponse.json({ error: authResult.error }, { status: authResult.status });
    }

    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const event = parseEvent(body);
    if (!event) {
        return NextResponse.json({ error: 'Invalid revalidation event' }, { status: 400 });
    }

    const result = revalidateContentChange(event);
    return NextResponse.json({ success: true, data: result });
}
```

- [ ] **Step 4: Fix the route type cast if TypeScript rejects it**

If `ContentRevalidationEvent['action']` causes a TypeScript error because it is a discriminated union, replace the article return branch with explicit action narrowing:

```ts
const action = candidate.action as 'publish' | 'update' | 'unpublish' | 'manual';
return {
    type: 'article',
    action,
    site: candidate.site,
    slug: typeof candidate.slug === 'string' && candidate.slug.trim() ? candidate.slug.trim() : undefined,
};
```

For rankings, replace the conditional type with:

```ts
kind: kind as 'github' | 'producthunt' | 'skills-trending' | 'skills-hot' | 'all',
```

- [ ] **Step 5: Update old article cache route to delegate**

Modify `app/api/articles/cache/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { revalidateContentChange } from '@/lib/cache/content-revalidation';
import { verifyAdminHeaders } from '@/lib/utils/admin-auth';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
    const authResult = verifyAdminHeaders(request.headers);
    if (!authResult.ok) {
        return NextResponse.json({ error: authResult.error }, { status: authResult.status });
    }

    const result = revalidateContentChange({ type: 'article', action: 'manual', site: 'ai' });
    return NextResponse.json({ success: true, message: 'Article content revalidated', data: result });
}
```

- [ ] **Step 6: Update article cache route test mock**

Modify `tests/unit/article-cache-route-auth.test.ts` to mock the new module instead of `clearArticleDirectoryCache`:

```ts
const mockRevalidateContentChange = vi.fn(() => ({ paths: ['/ai/articles'], tags: ['articles'] }));

vi.mock('@/lib/cache/content-revalidation', () => ({
    revalidateContentChange: mockRevalidateContentChange,
}));
```

Update the successful auth assertion to:

```ts
expect(mockRevalidateContentChange).toHaveBeenCalledWith({
    type: 'article',
    action: 'manual',
    site: 'ai',
});
```

- [ ] **Step 7: Run route tests**

Run:

```bash
npm test -- tests/unit/content-revalidation-route.test.ts tests/unit/article-cache-route-auth.test.ts
```

Expected: PASS.

---

### Task 3: Runtime Job Integration

**Files:**
- Modify: `lib/jobs/scheduler.ts`
- Modify: `app/api/jobs/route.ts`
- Modify: `tests/unit/scheduler.test.ts`
- Modify: `tests/unit/jobs-route-auth.test.ts`

- [ ] **Step 1: Add failing scheduler tests for prompt and ranking revalidation**

Extend `tests/unit/scheduler.test.ts` with mocks before importing the scheduler:

```ts
const mockPromptSync = vi.fn();
const mockRefreshAllRankings = vi.fn();
const mockRevalidateContentChange = vi.fn();

vi.mock('@/lib/pipelines/prompt-readme-sync', () => ({
    syncAllAsync: mockPromptSync,
}));

vi.mock('@/lib/services/ranking-cache', () => ({
    refreshAllRankings: mockRefreshAllRankings,
}));

vi.mock('@/lib/cache/content-revalidation', () => ({
    revalidateContentChange: mockRevalidateContentChange,
}));
```

Add these tests:

```ts
it('revalidates prompt surfaces when scheduled prompt sync changes content', async () => {
    mockPromptSync.mockResolvedValue({ totalParsed: 3, newlyAdded: 1, updated: 0, skipped: 2 });
    const scheduler = await import('@/lib/jobs/scheduler');

    scheduler.startScheduler();
    await vi.advanceTimersToNextTimerAsync();

    expect(mockRevalidateContentChange).toHaveBeenCalledWith({ type: 'prompt', action: 'sync' });
});

it('does not revalidate prompt surfaces when scheduled prompt sync has no changes', async () => {
    mockPromptSync.mockResolvedValue({ totalParsed: 3, newlyAdded: 0, updated: 0, skipped: 3 });
    const scheduler = await import('@/lib/jobs/scheduler');

    scheduler.startScheduler();
    await vi.advanceTimersToNextTimerAsync();

    expect(mockRevalidateContentChange).not.toHaveBeenCalledWith({ type: 'prompt', action: 'sync' });
});

it('revalidates ranking surfaces after scheduled ranking refresh', async () => {
    mockRefreshAllRankings.mockResolvedValue(undefined);
    const scheduler = await import('@/lib/jobs/scheduler');

    scheduler.startScheduler();
    await vi.advanceTimersByTimeAsync(5_000);

    expect(mockRevalidateContentChange).toHaveBeenCalledWith({
        type: 'rankings',
        action: 'refresh',
        kind: 'all',
    });
});
```

- [ ] **Step 2: Run failing scheduler tests**

Run:

```bash
npm test -- tests/unit/scheduler.test.ts
```

Expected: FAIL because scheduler does not import or call `revalidateContentChange`.

- [ ] **Step 3: Integrate scheduler with unified revalidation**

Modify `lib/jobs/scheduler.ts` imports:

```ts
import { revalidateContentChange } from '@/lib/cache/content-revalidation';
```

In the prompt sync block, after `const sourceReport = await promptSourceSync();`, add:

```ts
if (sourceReport.newlyAdded > 0 || sourceReport.updated > 0) {
    revalidateContentChange({ type: 'prompt', action: 'sync' });
    logger.persist('PromptSyncJob', `Sources: 解析 ${sourceReport.totalParsed}, 新增 ${sourceReport.newlyAdded}, 更新 ${sourceReport.updated}, 跳过 ${sourceReport.skipped}`);
}
```

Replace the existing duplicate `if` body with the combined body above.

In the ranking scheduled task, after `await refreshAllRankings();`, add:

```ts
revalidateContentChange({ type: 'rankings', action: 'refresh', kind: 'all' });
```

In the startup ranking warm block, after `await refreshAllRankings();`, add the same ranking revalidation call.

- [ ] **Step 4: Add failing jobs route test for manual prompt sync revalidation**

In `tests/unit/jobs-route-auth.test.ts`, add a mock:

```ts
const mockRevalidateContentChange = vi.fn();

vi.mock('@/lib/cache/content-revalidation', () => ({
    revalidateContentChange: mockRevalidateContentChange,
}));
```

Add test:

```ts
it('revalidates prompt surfaces after manual prompt sync changes content', async () => {
    mockPromptSync.mockResolvedValue({ totalParsed: 3, newlyAdded: 1, updated: 0, skipped: 2 });
    const { POST } = await import('@/app/api/jobs/route');

    const response = await POST(new NextRequest('http://localhost:5046/api/jobs?action=trigger-prompt-sync', {
        method: 'POST',
        headers: { 'x-admin-token': 'secret-token' },
    }));

    expect(response.status).toBe(200);
    expect(mockRevalidateContentChange).toHaveBeenCalledWith({ type: 'prompt', action: 'sync' });
});
```

- [ ] **Step 5: Integrate jobs route manual prompt sync**

Modify `app/api/jobs/route.ts` in the `trigger-prompt-sync` case:

```ts
const [{ syncAllAsync: promptSourceSync }, { revalidateContentChange }] = await Promise.all([
    import('@/lib/pipelines/prompt-readme-sync'),
    import('@/lib/cache/content-revalidation'),
]);
console.log('[API] 手动触发提示词源同步...');
const sources = await promptSourceSync();
if (sources.newlyAdded > 0 || sources.updated > 0) {
    revalidateContentChange({ type: 'prompt', action: 'sync' });
}
const report = { sources };
console.log('[API] 提示词源同步完成:', report);
return NextResponse.json({ message: '提示词同步已执行', report });
```

- [ ] **Step 6: Run runtime integration tests**

Run:

```bash
npm test -- tests/unit/scheduler.test.ts tests/unit/jobs-route-auth.test.ts
```

Expected: PASS.

---

### Task 4: Documentation and Skill Contract Cleanup

**Files:**
- Modify: `console-knowledge-handoff/SKILL.md`
- Modify: `.env.example`

- [ ] **Step 1: Update Console handoff skill publishing step**

Modify `console-knowledge-handoff/SKILL.md` step 14 to replace “刷新文章缓存” with:

```markdown
调用知识库网站 `POST /api/revalidate/content`，携带管理 token 和 payload `{"type":"article","action":"publish","site":"ai","slug":"<slug>"}`，让统一重验证入口清内存缓存并刷新公开页面。
```

Keep the existing requirement to verify `/api/articles?action=slugs&site=ai`.

- [ ] **Step 2: Document the unified revalidation API in `.env.example`**

Under the admin token section in `.env.example`, add:

```env
# 内容发布/同步后统一重验证接口复用上述管理 token：
# POST /api/revalidate/content
```

- [ ] **Step 3: Run docs-related tests if present**

Run:

```bash
npm test -- tests/unit/console-knowledge-handoff-skill.test.ts
```

Expected: PASS. If the test expects the old English wording, update it to assert the new `/api/revalidate/content` contract and run again.

---

### Task 5: Verification

**Files:**
- No new files.

- [ ] **Step 1: Run focused cache/revalidation tests**

Run:

```bash
npm test -- tests/unit/content-revalidation.test.ts tests/unit/content-revalidation-route.test.ts tests/unit/article-cache-route-auth.test.ts tests/unit/scheduler.test.ts tests/unit/jobs-route-auth.test.ts tests/unit/console-knowledge-handoff-skill.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run full test suite**

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

- [ ] **Step 4: Review diff for cache split regressions**

Run:

```bash
git diff --stat
git diff -- lib/cache/content-revalidation.ts app/api/revalidate/content/route.ts lib/jobs/scheduler.ts app/api/jobs/route.ts app/api/articles/cache/route.ts console-knowledge-handoff/SKILL.md .env.example
```

Expected: all content-change invalidation flows go through `revalidateContentChange()` or `POST /api/revalidate/content`; no new scattered `revalidatePath()` calls outside the unified module.

---

## Self-Review

- Spec coverage: The plan centralizes memory-cache invalidation and ISR path revalidation for articles, prompts, rankings, and manual all-content events. It updates current runtime triggers and the Console handoff skill contract.
- Placeholder scan: No placeholder implementation steps remain; every code-writing task includes exact files and code.
- Type consistency: Event names are consistent across module, API, scheduler, jobs route, and skill docs: `article`, `prompt`, `rankings`, `all`.
