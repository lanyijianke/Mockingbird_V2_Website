# Website Status Monitoring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an internal-only website status monitoring page that lets operators inspect service health, error logs, and scheduled job status without exposing internal operational details publicly.

**Architecture:** Keep operational monitoring separate from job control. Add a dedicated internal aggregation API that combines health checks, scheduler state, recent job execution reports, source/index/vector coverage, and recent `SystemLogs` entries. Render a server-first internal page under `/ai/admin/status` that consumes the aggregation API data shape through shared helpers, while keeping `PromptSyncJob` and `AgentIndexSyncJob` responsibilities unchanged.

**Tech Stack:** Next.js App Router, TypeScript, mysql2, existing `SystemLogs` table, existing scheduler and health route modules, Vitest.

---

## Scope

This monitoring feature is internal-only. It is not a public marketing/admin surface.

The first version should answer these operational questions in one place:

- Is the website healthy right now?
- Is the scheduler running?
- Are `PromptSyncJob` and `AgentIndexSyncJob` currently locked/running?
- When did each job last run, and what happened?
- Are there recent `warn/error` logs that need attention?
- Is the source/index/vector closed loop healthy, or is backlog accumulating?

The feature should not change any existing job ownership:

- `PromptSyncJob`: source -> business tables
- `AgentIndexSyncJob`: business tables -> search index/vector state

## File Structure

- Create `lib/monitoring/status-types.ts`: shared TypeScript shapes for job runs, coverage summary, log entries, and page/API payloads.
- Create `lib/monitoring/status-service.ts`: reads `SystemLogs`, summarizes recent job runs, and composes a monitoring payload from health, scheduler, and coverage data.
- Modify `lib/jobs/scheduler.ts`: persist structured info-level run summaries for `PromptSyncJob`, `RankingSyncJob`, and `AgentIndexSyncJob`; persist explicit error summaries on failure.
- Create `app/api/admin/status/route.ts`: internal-only aggregation API protected by admin headers.
- Create `app/ai/admin/status/page.tsx`: internal-only status dashboard page.
- Create `app/_styles/admin-status.css`: page-specific monitoring styles.
- Modify `app/ai/layout.tsx`: import the monitoring page stylesheet.
- Optionally modify `app/SiteNav.tsx` only if a hidden internal nav entry is explicitly desired later; by default this page should remain unlinked.
- Test `tests/unit/status-service.test.ts`.
- Test `tests/unit/admin-status-route.test.ts`.
- Test `tests/unit/admin-status-page.test.tsx`.
- Modify `tests/unit/scheduler.test.ts` to verify persisted summaries are written for job outcomes.

## Monitoring Data Model

The monitoring payload should include these top-level sections:

- `service`
  - overall status
  - timestamp
  - service name
  - version
  - database status
  - article source status
- `scheduler`
  - running
  - job intervals
  - lock states
- `jobs`
  - `promptSync`
  - `agentIndex`
  - optional `rankingSync`
  - each with:
    - lastStartedAt
    - lastFinishedAt
    - lastStatus (`success` / `warning` / `error` / `unknown`)
    - latest summary counts
    - latest message
- `coverage`
  - prompt gap
  - article gap
  - prompt embedding gap
  - article embedding gap
  - total indexed docs/chunks/vector points
- `logs`
  - recent `warn/error` items
  - source
  - level
  - message
  - createdAt

## Task 1: Add Shared Monitoring Types

**Files:**
- Create: `lib/monitoring/status-types.ts`
- Test: `tests/unit/status-service.test.ts`

- [ ] **Step 1: Write the failing test imports**

Create `tests/unit/status-service.test.ts` skeleton that imports these types through the service module:

```ts
import { describe, expect, it } from 'vitest';

describe('status service types', () => {
  it('exposes monitoring status sections', async () => {
    const mod = await import('@/lib/monitoring/status-types');
    expect(mod).toHaveProperty('createEmptyMonitoringPayload');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm test -- tests/unit/status-service.test.ts
```

Expected: FAIL because `lib/monitoring/status-types.ts` does not exist yet.

- [ ] **Step 3: Write minimal monitoring types**

Create `lib/monitoring/status-types.ts`:

```ts
export type MonitoringRunStatus = 'success' | 'warning' | 'error' | 'unknown';

export interface MonitoringJobSnapshot {
    name: string;
    interval: string;
    locked: boolean;
    lastStartedAt: string | null;
    lastFinishedAt: string | null;
    lastStatus: MonitoringRunStatus;
    lastMessage: string | null;
    lastSummary: Record<string, number | string | boolean | null> | null;
}

export interface MonitoringCoverageSnapshot {
    promptGap: number | null;
    articleGap: number | null;
    promptEmbeddingGap: number | null;
    articleEmbeddingGap: number | null;
    indexedPrompts: number | null;
    indexedArticles: number | null;
    totalDocuments: number | null;
    totalChunks: number | null;
    totalVectorPoints: number | null;
}

export interface MonitoringLogEntry {
    level: 'warn' | 'error';
    source: string;
    message: string;
    detail: string | null;
    createdAt: string;
}

export interface MonitoringPayload {
    service: {
        status: string;
        timestamp: string;
        serviceName: string;
        version: string;
        databaseStatus: string;
        articleSourceStatus: string;
    };
    scheduler: {
        running: boolean;
        jobs: Array<{ name: string; interval: string; locked: boolean }>;
    };
    jobs: {
        promptSync: MonitoringJobSnapshot;
        agentIndex: MonitoringJobSnapshot;
        rankingSync: MonitoringJobSnapshot;
    };
    coverage: MonitoringCoverageSnapshot;
    logs: MonitoringLogEntry[];
}

export function createEmptyMonitoringPayload(): MonitoringPayload {
    return {
        service: {
            status: 'unknown',
            timestamp: new Date(0).toISOString(),
            serviceName: 'unknown',
            version: 'unknown',
            databaseStatus: 'unknown',
            articleSourceStatus: 'unknown',
        },
        scheduler: {
            running: false,
            jobs: [],
        },
        jobs: {
            promptSync: {
                name: '提示词同步',
                interval: '',
                locked: false,
                lastStartedAt: null,
                lastFinishedAt: null,
                lastStatus: 'unknown',
                lastMessage: null,
                lastSummary: null,
            },
            agentIndex: {
                name: 'Agent 索引同步',
                interval: '',
                locked: false,
                lastStartedAt: null,
                lastFinishedAt: null,
                lastStatus: 'unknown',
                lastMessage: null,
                lastSummary: null,
            },
            rankingSync: {
                name: '排行榜同步',
                interval: '',
                locked: false,
                lastStartedAt: null,
                lastFinishedAt: null,
                lastStatus: 'unknown',
                lastMessage: null,
                lastSummary: null,
            },
        },
        coverage: {
            promptGap: null,
            articleGap: null,
            promptEmbeddingGap: null,
            articleEmbeddingGap: null,
            indexedPrompts: null,
            indexedArticles: null,
            totalDocuments: null,
            totalChunks: null,
            totalVectorPoints: null,
        },
        logs: [],
    };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
npm test -- tests/unit/status-service.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/monitoring/status-types.ts tests/unit/status-service.test.ts
git commit -m "feat: add monitoring status types"
```

## Task 2: Persist Structured Job Run Summaries

**Files:**
- Modify: `lib/jobs/scheduler.ts`
- Modify: `tests/unit/scheduler.test.ts`

- [ ] **Step 1: Write the failing scheduler persistence test**

Add a new test in `tests/unit/scheduler.test.ts`:

```ts
const mockWriteLog = vi.fn();

vi.mock('@/lib/services/log-service', () => ({
  writeLog: mockWriteLog,
  serializeError: (value: unknown) => String(value),
}));

it('persists prompt sync and agent index summaries for monitoring', async () => {
  process.env.JOB_PROMPT_SYNC_CRON = '* * * * * *';
  process.env.JOB_AGENT_INDEX_CRON = '* * * * * *';
  mockPromptSync.mockResolvedValue({ totalParsed: 3, newlyAdded: 1, updated: 1, skipped: 1 });
  mockRunAgentIndexJob.mockResolvedValue({
    success: true,
    prompts: { processed: 2, indexed: 2, skipped: 0, failed: 0, batches: 1, lastCursor: null, hasMore: false },
    articles: { processed: 1, indexed: 1, skipped: 0, failed: 0 },
  });

  const scheduler = await import('@/lib/jobs/scheduler');
  scheduler.startScheduler();
  await vi.advanceTimersByTimeAsync(1000);

  expect(mockWriteLog).toHaveBeenCalledWith(
    'info',
    'PromptSyncJob',
    expect.stringContaining('Sources: 解析 3'),
    expect.any(String),
  );
  expect(mockWriteLog).toHaveBeenCalledWith(
    'info',
    'AgentIndexSyncJob',
    expect.stringContaining('Prompts: 处理 2'),
    expect.any(String),
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm test -- tests/unit/scheduler.test.ts
```

Expected: FAIL because no structured detail string is persisted yet.

- [ ] **Step 3: Add structured monitoring persistence to scheduler**

Modify `lib/jobs/scheduler.ts` so that each scheduled run writes a JSON detail payload with:

- `startedAt`
- `finishedAt`
- `status`
- `jobKey`
- job-specific summary counts

Implementation shape:

```ts
function persistJobSnapshot(
    source: string,
    message: string,
    payload: Record<string, unknown>
): void {
    logger.persist(source, message, JSON.stringify(payload));
}
```

Use it in:

- prompt sync success path
- prompt sync failure path
- ranking sync success/failure path
- agent index success/failure path

For example:

```ts
const startedAt = new Date().toISOString();
// ... run job
persistJobSnapshot('AgentIndexSyncJob', summaryMessage, {
  jobKey: 'agent-index',
  startedAt,
  finishedAt: new Date().toISOString(),
  status: report.success ? 'success' : 'error',
  prompts: report.prompts,
  articles: report.articles,
});
```

- [ ] **Step 4: Run scheduler test to verify it passes**

Run:

```bash
npm test -- tests/unit/scheduler.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/jobs/scheduler.ts tests/unit/scheduler.test.ts
git commit -m "feat: persist scheduler job summaries"
```

## Task 3: Build Monitoring Aggregation Service

**Files:**
- Create: `lib/monitoring/status-service.ts`
- Modify: `tests/unit/status-service.test.ts`

- [ ] **Step 1: Write the failing service behavior test**

Expand `tests/unit/status-service.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockQuery = vi.fn();

vi.mock('@/lib/db', () => ({
  query: mockQuery,
}));

vi.mock('@/lib/jobs/scheduler', () => ({
  getSchedulerStatus: () => ({
    running: true,
    jobs: [
      { name: '提示词同步', interval: '30 0 */2 * * *', locked: false },
      { name: '排行榜同步', interval: '0 */2 * * *', locked: false },
      { name: 'Agent 索引同步', interval: '0 15 */2 * * *', locked: true },
    ],
  }),
}));

vi.mock('@/lib/site-config', () => ({
  getSiteBrandConfig: () => ({ serviceName: 'Mockingbird Knowledge' }),
}));

describe('getMonitoringStatus', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('aggregates health, coverage, job snapshots, and recent logs', async () => {
    mockQuery
      .mockResolvedValueOnce([
        { Level: 'error', Source: 'AgentIndexSyncJob', Message: 'failed', Detail: 'stack', CreatedAt: '2026-06-08 18:00:00' },
      ])
      .mockResolvedValueOnce([
        { Source: 'PromptSyncJob', Message: 'Sources: 解析 3, 新增 1, 更新 1, 跳过 1', Detail: '{"jobKey":"prompt-sync","startedAt":"2026-06-08T10:00:00.000Z","finishedAt":"2026-06-08T10:01:00.000Z","status":"success","sources":{"totalParsed":3,"newlyAdded":1,"updated":1,"skipped":1}}', CreatedAt: '2026-06-08 10:01:00' },
        { Source: 'AgentIndexSyncJob', Message: 'Prompts: 处理 2, indexed 2, skipped 0, failed 0; Articles: 处理 1, indexed 1, skipped 0, failed 0', Detail: '{"jobKey":"agent-index","startedAt":"2026-06-08T11:00:00.000Z","finishedAt":"2026-06-08T11:03:00.000Z","status":"success","prompts":{"processed":2,"indexed":2,"skipped":0,"failed":0},"articles":{"processed":1,"indexed":1,"skipped":0,"failed":0}}', CreatedAt: '2026-06-08 11:03:00' },
      ]);

    const { getMonitoringStatus } = await import('@/lib/monitoring/status-service');
    const payload = await getMonitoringStatus({
      health: {
        status: 'healthy',
        timestamp: '2026-06-08T12:00:00.000Z',
        version: '0.1.0',
        database: { status: 'ok', prompts: 7659 },
        articleSources: { status: 'ok', articles: 17 },
      },
      coverage: {
        promptGap: 0,
        articleGap: 0,
        promptEmbeddingGap: 4000,
        articleEmbeddingGap: 0,
        indexedPrompts: 7659,
        indexedArticles: 17,
        totalDocuments: 7676,
        totalChunks: 9252,
        totalVectorPoints: 6200,
      },
    });

    expect(payload.service.status).toBe('healthy');
    expect(payload.scheduler.running).toBe(true);
    expect(payload.jobs.agentIndex.locked).toBe(true);
    expect(payload.jobs.promptSync.lastStatus).toBe('success');
    expect(payload.coverage.promptEmbeddingGap).toBe(4000);
    expect(payload.logs).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm test -- tests/unit/status-service.test.ts
```

Expected: FAIL because the service does not exist yet.

- [ ] **Step 3: Write the aggregation service**

Create `lib/monitoring/status-service.ts` with:

- a helper to read the latest recent `warn/error` rows from `SystemLogs`
- a helper to read the latest `info` rows for `PromptSyncJob`, `RankingSyncJob`, and `AgentIndexSyncJob`
- a parser for JSON `Detail`
- a function:

```ts
export async function getMonitoringStatus(input: {
    health: {
        status: string;
        timestamp: string;
        version: string;
        database: { status: string; prompts: number };
        articleSources: { status: string; articles: number };
    };
    coverage: {
        promptGap: number | null;
        articleGap: number | null;
        promptEmbeddingGap: number | null;
        articleEmbeddingGap: number | null;
        indexedPrompts: number | null;
        indexedArticles: number | null;
        totalDocuments: number | null;
        totalChunks: number | null;
        totalVectorPoints: number | null;
    };
}): Promise<MonitoringPayload>
```

The function should:

- start from `createEmptyMonitoringPayload()`
- fill service info
- read `getSchedulerStatus()`
- map the latest persisted run for each job
- append recent `warn/error` logs
- return the final payload

- [ ] **Step 4: Run service test to verify it passes**

Run:

```bash
npm test -- tests/unit/status-service.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/monitoring/status-service.ts lib/monitoring/status-types.ts tests/unit/status-service.test.ts
git commit -m "feat: add monitoring status aggregation service"
```

## Task 4: Add Internal Aggregation API

**Files:**
- Create: `app/api/admin/status/route.ts`
- Create: `tests/unit/admin-status-route.test.ts`

- [ ] **Step 1: Write the failing route test**

Create `tests/unit/admin-status-route.test.ts`:

```ts
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockGetMonitoringStatus = vi.fn();

vi.mock('@/lib/monitoring/status-service', () => ({
  getMonitoringStatus: mockGetMonitoringStatus,
}));

describe('GET /api/admin/status', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env.KNOWLEDGE_ADMIN_TOKEN = 'secret-token';
  });

  it('rejects missing admin token', async () => {
    const { GET } = await import('@/app/api/admin/status/route');
    const response = await GET(new NextRequest('http://localhost:5046/api/admin/status'));
    expect(response.status).toBe(401);
  });

  it('returns aggregated monitoring payload for valid admin token', async () => {
    mockGetMonitoringStatus.mockResolvedValue({ ok: true });
    const { GET } = await import('@/app/api/admin/status/route');
    const response = await GET(new NextRequest('http://localhost:5046/api/admin/status', {
      headers: { 'x-admin-token': 'secret-token' },
    }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true, data: { ok: true } });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm test -- tests/unit/admin-status-route.test.ts
```

Expected: FAIL because the route does not exist yet.

- [ ] **Step 3: Implement the internal status route**

Create `app/api/admin/status/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminHeaders } from '@/lib/utils/admin-auth';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
    const auth = verifyAdminHeaders(request.headers);
    if (!auth.ok) {
        return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
    }

    const [{ getMonitoringStatus }, healthModule, coverageModule] = await Promise.all([
        import('@/lib/monitoring/status-service'),
        import('@/app/api/health/route'),
        import('@/lib/monitoring/status-service'),
    ]);

    const healthResponse = await healthModule.GET();
    const health = await healthResponse.json();
    const coverage = {
        promptGap: null,
        articleGap: null,
        promptEmbeddingGap: null,
        articleEmbeddingGap: null,
        indexedPrompts: null,
        indexedArticles: null,
        totalDocuments: null,
        totalChunks: null,
        totalVectorPoints: null,
    };

    const data = await getMonitoringStatus({ health, coverage });
    return NextResponse.json({ success: true, data });
}
```

Then replace the inline empty coverage with a real imported coverage helper during Task 5.

- [ ] **Step 4: Run route test to verify it passes**

Run:

```bash
npm test -- tests/unit/admin-status-route.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/api/admin/status/route.ts tests/unit/admin-status-route.test.ts
git commit -m "feat: add internal monitoring status api"
```

## Task 5: Expose Coverage Data To Monitoring

**Files:**
- Modify: `scripts/agent-source-index-coverage.mjs`
- Create: `lib/monitoring/coverage-service.ts`
- Modify: `app/api/admin/status/route.ts`
- Test: `tests/unit/status-service.test.ts`

- [ ] **Step 1: Write the failing coverage helper test**

Extend `tests/unit/status-service.test.ts` with:

```ts
it('maps coverage metrics into monitoring payload', async () => {
  const { normalizeCoverageSnapshot } = await import('@/lib/monitoring/coverage-service');
  expect(normalizeCoverageSnapshot({
    promptGap: 0,
    articleGap: 1,
    promptEmbeddingGap: 400,
    articleEmbeddingGap: 0,
    indexedPrompts: 10,
    indexedArticles: 3,
    totalDocuments: 13,
    totalChunks: 40,
    totalVectorPoints: 20,
  })).toEqual({
    promptGap: 0,
    articleGap: 1,
    promptEmbeddingGap: 400,
    articleEmbeddingGap: 0,
    indexedPrompts: 10,
    indexedArticles: 3,
    totalDocuments: 13,
    totalChunks: 40,
    totalVectorPoints: 20,
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm test -- tests/unit/status-service.test.ts
```

Expected: FAIL because `coverage-service.ts` does not exist yet.

- [ ] **Step 3: Create coverage helper**

Create `lib/monitoring/coverage-service.ts`:

```ts
import { buildSourceIndexCoverage } from '../../scripts/agent-source-index-coverage.mjs';

export interface MonitoringCoverageInput {
    promptGap: number | null;
    articleGap: number | null;
    promptEmbeddingGap: number | null;
    articleEmbeddingGap: number | null;
    indexedPrompts: number | null;
    indexedArticles: number | null;
    totalDocuments: number | null;
    totalChunks: number | null;
    totalVectorPoints: number | null;
}

export function normalizeCoverageSnapshot(input: MonitoringCoverageInput): MonitoringCoverageInput {
    return input;
}

export async function loadCoverageSnapshot(site: string = 'ai'): Promise<MonitoringCoverageInput> {
    const report = await buildSourceIndexCoverage({ site });
    return normalizeCoverageSnapshot({
        promptGap: report.promptGap,
        articleGap: report.articleGap,
        promptEmbeddingGap: report.promptEmbeddingGap,
        articleEmbeddingGap: report.articleEmbeddingGap,
        indexedPrompts: report.indexedPrompts,
        indexedArticles: report.indexedArticles,
        totalDocuments: report.totalDocuments,
        totalChunks: report.totalChunks,
        totalVectorPoints: report.totalVectorPoints,
    });
}
```

- [ ] **Step 4: Wire coverage loader into admin status route**

Modify `app/api/admin/status/route.ts` to import and call:

```ts
const [{ getMonitoringStatus }, { loadCoverageSnapshot }, healthModule] = await Promise.all([
  import('@/lib/monitoring/status-service'),
  import('@/lib/monitoring/coverage-service'),
  import('@/app/api/health/route'),
]);

const coverage = await loadCoverageSnapshot('ai');
```

- [ ] **Step 5: Run tests to verify they pass**

Run:

```bash
npm test -- tests/unit/status-service.test.ts tests/unit/admin-status-route.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/monitoring/coverage-service.ts app/api/admin/status/route.ts tests/unit/status-service.test.ts
git commit -m "feat: surface coverage metrics in monitoring api"
```

## Task 6: Build The Internal Monitoring Page

**Files:**
- Create: `app/ai/admin/status/page.tsx`
- Create: `app/_styles/admin-status.css`
- Modify: `app/ai/layout.tsx`
- Create: `tests/unit/admin-status-page.test.tsx`

- [ ] **Step 1: Write the failing page test**

Create `tests/unit/admin-status-page.test.tsx`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { renderToString } from 'react-dom/server';

vi.mock('@/lib/monitoring/status-service', () => ({
  getMonitoringStatus: vi.fn(),
}));

vi.mock('@/lib/monitoring/coverage-service', () => ({
  loadCoverageSnapshot: vi.fn(async () => ({
    promptGap: 0,
    articleGap: 0,
    promptEmbeddingGap: 12,
    articleEmbeddingGap: 0,
    indexedPrompts: 100,
    indexedArticles: 10,
    totalDocuments: 110,
    totalChunks: 400,
    totalVectorPoints: 250,
  })),
}));

describe('admin status page', () => {
  it('renders service, jobs, logs, and coverage sections', async () => {
    const mod = await import('@/app/ai/admin/status/page');
    const html = renderToString(await mod.default());
    expect(html).toContain('网站状态监控');
    expect(html).toContain('服务健康');
    expect(html).toContain('定时 Job');
    expect(html).toContain('错误日志');
    expect(html).toContain('索引闭环');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm test -- tests/unit/admin-status-page.test.tsx
```

Expected: FAIL because the page does not exist yet.

- [ ] **Step 3: Build the page and styles**

Create `app/ai/admin/status/page.tsx` as a server component that:

- calls the internal aggregation helpers directly
- renders cards for:
  - 服务健康
  - 定时 Job
  - 最近错误日志
  - 索引闭环
  - 职责边界

Create `app/_styles/admin-status.css` with feature-scoped styles only.

Modify `app/ai/layout.tsx`:

```ts
import '@/app/_styles/admin-status.css';
```

Keep the page unlinked from public nav.

- [ ] **Step 4: Run page test to verify it passes**

Run:

```bash
npm test -- tests/unit/admin-status-page.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/ai/admin/status/page.tsx app/_styles/admin-status.css app/ai/layout.tsx tests/unit/admin-status-page.test.tsx
git commit -m "feat: add internal website status monitoring page"
```

## Task 7: Full Verification

**Files:**
- Verify only

- [ ] **Step 1: Run focused monitoring tests**

Run:

```bash
npm test -- \
  tests/unit/status-service.test.ts \
  tests/unit/admin-status-route.test.ts \
  tests/unit/admin-status-page.test.tsx \
  tests/unit/scheduler.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run lint**

Run:

```bash
npm run lint
```

Expected: exit code `0`.

- [ ] **Step 3: Manual smoke check**

Run dev server:

```bash
npm run dev
```

Then verify:

```bash
curl -sS http://localhost:5046/api/health
curl -sS -H "x-admin-token: $KNOWLEDGE_ADMIN_TOKEN" http://localhost:5046/api/admin/status
```

Expected:

- `/api/health` returns service + scheduler health
- `/api/admin/status` returns aggregated monitoring payload
- `/ai/admin/status` renders all monitoring sections when opened in browser

- [ ] **Step 4: Commit**

```bash
git add .
git commit -m "feat: add internal website status monitoring"
```
