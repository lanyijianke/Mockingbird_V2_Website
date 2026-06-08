# Admin Status Job Monitoring Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign `/ai/admin/status` into an internal scheduler and job monitoring ledger that shows whether jobs are running, how often they ran today, and what happened in the latest run.

**Architecture:** Keep `/api/admin/status` as a read-only aggregation endpoint and keep `/api/jobs` as the control endpoint. Replace the current page-level coverage dashboard with a job-first payload: scheduler summary, one normalized row per registered job, daily run counts, latest run detail, compact recent logs, and small supporting service health. Style the page using existing `--theme-*` tokens so it inherits both light and dark themes.

**Tech Stack:** Next.js App Router, TypeScript, mysql2 query helper, existing `SystemLogs` table, existing scheduler module, React server rendering, Vitest.

---

## File Structure

- Modify `lib/monitoring/status-types.ts`: replace object-shaped `jobs` snapshots and first-class `coverage` with job-monitor rows and scheduler summary types.
- Modify `lib/monitoring/status-service.ts`: derive scheduler summary, latest run, daily counts, and recent logs from scheduler memory and `SystemLogs`.
- Keep `lib/monitoring/coverage-service.ts`: leave the helper available for other uses, but stop making coverage a first-class status page/API section.
- Modify `app/api/admin/status/route.ts`: stop loading coverage for the admin status payload and call the new `getMonitoringStatus({ health })` contract.
- Modify `app/ai/admin/status/page.tsx`: render a job ledger, compact logs, and small service health block; remove the coverage card and "索引闭环" text.
- Modify `app/_styles/admin-status.css`: replace the current decorative dashboard styling with compact internal-tool styling derived from global theme tokens.
- Modify `tests/unit/status-service.test.ts`: test the new payload shape, latest run derivation, daily counts, empty states, and log read failures.
- Modify `tests/unit/admin-status-route.test.ts`: test the new route contract without coverage loading.
- Modify `tests/unit/admin-status-page.test.ts`: test job-first copy and absence of "索引闭环", `coverage gap`, and raw `UNKNOWN`.
- Modify `tests/unit/scheduler.test.ts`: ensure structured job summaries include enough fields for latest run duration, status, summary, and error evidence.

## Task 1: Redefine Monitoring Types Around Job Rows

**Files:**
- Modify: `lib/monitoring/status-types.ts`
- Modify: `tests/unit/status-service.test.ts`

- [ ] **Step 1: Write the failing type contract test**

Replace the `status service types` test in `tests/unit/status-service.test.ts` with:

```ts
describe('status service types', () => {
    it('creates a job-first monitoring payload skeleton', async () => {
        const { createEmptyMonitoringPayload } = await import('@/lib/monitoring/status-types');
        const payload = createEmptyMonitoringPayload();

        expect(payload.scheduler).toEqual({
            running: false,
            registeredJobCount: 0,
            runningJobCount: 0,
            updatedAt: expect.any(String),
        });
        expect(payload.jobs).toEqual([]);
        expect(payload.logs).toEqual([]);
        expect(payload).not.toHaveProperty('coverage');
    });
});
```

- [ ] **Step 2: Run the type contract test and verify it fails**

Run:

```bash
npm test -- tests/unit/status-service.test.ts -t "creates a job-first monitoring payload skeleton"
```

Expected: FAIL because `scheduler.registeredJobCount` and array-shaped `jobs` do not exist yet, and `coverage` still exists.

- [ ] **Step 3: Replace the monitoring type definitions**

Update `lib/monitoring/status-types.ts` to this shape:

```ts
export type MonitoringRunStatus = 'success' | 'warning' | 'error' | 'running' | 'none';

export interface MonitoringRunSnapshot {
    status: MonitoringRunStatus;
    startedAt: string | null;
    finishedAt: string | null;
    durationMs: number | null;
    message: string | null;
    summary: Record<string, number | string | boolean | null> | null;
    error: string | null;
}

export interface MonitoringTodaySnapshot {
    totalRuns: number;
    successRuns: number;
    warningRuns: number;
    errorRuns: number;
    lastErrorAt: string | null;
    lastErrorMessage: string | null;
}

export interface MonitoringJobSnapshot {
    key: string;
    name: string;
    interval: string;
    locked: boolean;
    latestRun: MonitoringRunSnapshot;
    today: MonitoringTodaySnapshot;
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
        registeredJobCount: number;
        runningJobCount: number;
        updatedAt: string;
    };
    jobs: MonitoringJobSnapshot[];
    logs: MonitoringLogEntry[];
    logReadError: string | null;
}

export function createEmptyRunSnapshot(): MonitoringRunSnapshot {
    return {
        status: 'none',
        startedAt: null,
        finishedAt: null,
        durationMs: null,
        message: null,
        summary: null,
        error: null,
    };
}

export function createEmptyTodaySnapshot(): MonitoringTodaySnapshot {
    return {
        totalRuns: 0,
        successRuns: 0,
        warningRuns: 0,
        errorRuns: 0,
        lastErrorAt: null,
        lastErrorMessage: null,
    };
}

export function createMonitoringJobSnapshot(input: {
    key: string;
    name: string;
    interval: string;
    locked: boolean;
}): MonitoringJobSnapshot {
    return {
        key: input.key,
        name: input.name,
        interval: input.interval,
        locked: input.locked,
        latestRun: createEmptyRunSnapshot(),
        today: createEmptyTodaySnapshot(),
    };
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
            registeredJobCount: 0,
            runningJobCount: 0,
            updatedAt: new Date(0).toISOString(),
        },
        jobs: [],
        logs: [],
        logReadError: null,
    };
}
```

- [ ] **Step 4: Run the focused type test and verify it passes**

Run:

```bash
npm test -- tests/unit/status-service.test.ts -t "creates a job-first monitoring payload skeleton"
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/monitoring/status-types.ts tests/unit/status-service.test.ts
git commit -m "refactor: define job-first monitoring status types"
```

## Task 2: Aggregate Latest Runs And Today's Counts

**Files:**
- Modify: `lib/monitoring/status-service.ts`
- Modify: `tests/unit/status-service.test.ts`

- [ ] **Step 1: Replace status-service tests with job monitoring expectations**

In `tests/unit/status-service.test.ts`, update the scheduler mock to still return:

```ts
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
```

Replace the old `aggregates health, coverage, job snapshots, and recent logs` test with:

```ts
it('aggregates scheduler state, latest runs, today counts, and recent logs', async () => {
    mockQuery
        .mockResolvedValueOnce([
            { Level: 'error', Source: 'AgentIndexSyncJob', Message: 'failed', Detail: 'stack', CreatedAt: '2026-06-08 18:00:00' },
        ])
        .mockResolvedValueOnce([
            { Source: 'PromptSyncJob', Message: 'Sources: 解析 3, 新增 1, 更新 1, 跳过 1', Detail: '{"jobKey":"prompt-sync","startedAt":"2026-06-08T10:00:00.000Z","finishedAt":"2026-06-08T10:01:00.000Z","status":"success","sources":{"totalParsed":3,"newlyAdded":1,"updated":1,"skipped":1}}', CreatedAt: '2026-06-08 10:01:00' },
            { Source: 'AgentIndexSyncJob', Message: 'Prompts: 处理 2, indexed 2, skipped 0, failed 0; Articles: 处理 1, indexed 1, skipped 0, failed 0', Detail: '{"jobKey":"agent-index","startedAt":"2026-06-08T11:00:00.000Z","finishedAt":"2026-06-08T11:03:00.000Z","status":"warning","prompts":{"processed":2,"indexed":2,"skipped":0,"failed":0},"articles":{"processed":1,"indexed":1,"skipped":0,"failed":0}}', CreatedAt: '2026-06-08 11:03:00' },
        ])
        .mockResolvedValueOnce([
            { Source: 'PromptSyncJob', Message: 'Sources: 解析 3, 新增 1, 更新 1, 跳过 1', Detail: '{"status":"success"}', CreatedAt: '2026-06-08 10:01:00' },
            { Source: 'PromptSyncJob', Message: 'Source 同步失败:', Detail: '{"status":"error","error":"timeout"}', CreatedAt: '2026-06-08 12:01:00' },
            { Source: 'AgentIndexSyncJob', Message: 'Prompts: 处理 2', Detail: '{"status":"warning"}', CreatedAt: '2026-06-08 11:03:00' },
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
    });

    expect(payload.scheduler).toMatchObject({
        running: true,
        registeredJobCount: 3,
        runningJobCount: 1,
    });
    expect(payload.jobs.map((job) => job.key)).toEqual(['promptSync', 'rankingSync', 'agentIndex']);

    const promptSync = payload.jobs.find((job) => job.key === 'promptSync');
    expect(promptSync?.latestRun).toMatchObject({
        status: 'success',
        startedAt: '2026-06-08T10:00:00.000Z',
        finishedAt: '2026-06-08T10:01:00.000Z',
        durationMs: 60000,
        message: 'Sources: 解析 3, 新增 1, 更新 1, 跳过 1',
    });
    expect(promptSync?.latestRun.summary).toEqual({
        sources: '{"totalParsed":3,"newlyAdded":1,"updated":1,"skipped":1}',
    });
    expect(promptSync?.today).toMatchObject({
        totalRuns: 2,
        successRuns: 1,
        warningRuns: 0,
        errorRuns: 1,
        lastErrorAt: '2026-06-08 12:01:00',
        lastErrorMessage: 'Source 同步失败:',
    });

    const agentIndex = payload.jobs.find((job) => job.key === 'agentIndex');
    expect(agentIndex?.latestRun.status).toBe('running');
    expect(agentIndex?.today.warningRuns).toBe(1);
    expect(payload.logs).toHaveLength(1);
    expect(payload).not.toHaveProperty('coverage');
});
```

Add this empty-state test:

```ts
it('uses human-safe empty states when a registered job has no persisted runs', async () => {
    mockQuery
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

    const { getMonitoringStatus } = await import('@/lib/monitoring/status-service');
    const payload = await getMonitoringStatus({
        health: {
            status: 'healthy',
            timestamp: '2026-06-08T12:00:00.000Z',
            version: '0.1.0',
            database: { status: 'ok', prompts: 1 },
            articleSources: { status: 'ok', articles: 1 },
        },
    });

    expect(payload.jobs).toHaveLength(3);
    expect(payload.jobs[0].latestRun.status).toBe('none');
    expect(payload.jobs[0].latestRun.message).toBeNull();
    expect(payload.jobs[0].today.totalRuns).toBe(0);
});
```

- [ ] **Step 2: Run focused tests and verify they fail**

Run:

```bash
npm test -- tests/unit/status-service.test.ts -t "aggregates scheduler state|human-safe empty states"
```

Expected: FAIL because `getMonitoringStatus` still expects `coverage`, returns object-shaped jobs, and does not compute daily counts.

- [ ] **Step 3: Implement the new status service contract**

Update `lib/monitoring/status-service.ts` with these implementation points:

```ts
import {
    createEmptyMonitoringPayload,
    createMonitoringJobSnapshot,
    type MonitoringJobSnapshot,
    type MonitoringLogEntry,
    type MonitoringPayload,
    type MonitoringRunStatus,
} from '@/lib/monitoring/status-types';
```

Change the `getMonitoringStatus` input to:

```ts
export async function getMonitoringStatus(input: {
    health: HealthSnapshotInput;
}): Promise<MonitoringPayload> {
```

Use this job map:

```ts
const JOB_SOURCE_MAP = {
    PromptSyncJob: 'promptSync',
    RankingSyncJob: 'rankingSync',
    AgentIndexSyncJob: 'agentIndex',
} as const;

const JOB_NAME_MAP: Record<string, string> = {
    '提示词同步': 'promptSync',
    '排行榜同步': 'rankingSync',
    'Agent 索引同步': 'agentIndex',
};
```

Add a row type for daily rows:

```ts
interface DailyJobRow {
    Source: string;
    Message: string;
    Detail: string | null;
    CreatedAt: string;
}
```

Add these helpers:

```ts
function calculateDurationMs(startedAt: string | null | undefined, finishedAt: string | null | undefined): number | null {
    if (!startedAt || !finishedAt) return null;
    const started = new Date(startedAt).getTime();
    const finished = new Date(finishedAt).getTime();
    if (!Number.isFinite(started) || !Number.isFinite(finished)) return null;
    const duration = finished - started;
    return duration >= 0 ? duration : null;
}

function normalizeRunStatus(value: unknown): MonitoringRunStatus {
    if (value === 'success' || value === 'warning' || value === 'error') return value;
    return 'none';
}

function flattenSummary(detail: PersistedJobDetail | null): Record<string, number | string | boolean | null> | null {
    if (!detail) return null;
    const entries = Object.entries(detail)
        .filter(([key]) => !['jobKey', 'startedAt', 'finishedAt', 'status', 'error'].includes(key))
        .map(([key, value]) => [key, normalizeSummaryValue(value)] as const);
    return entries.length > 0 ? Object.fromEntries(entries) : null;
}

function getTodayStart(): string {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return start.toISOString().slice(0, 19).replace('T', ' ');
}
```

Replace `applySchedulerState` with:

```ts
function applySchedulerState(payload: MonitoringPayload): Map<string, MonitoringJobSnapshot> {
    const scheduler = getSchedulerStatus();
    const jobs = scheduler.jobs.map((job) => createMonitoringJobSnapshot({
        key: JOB_NAME_MAP[job.name] ?? job.name,
        name: job.name,
        interval: job.interval,
        locked: job.locked,
    }));

    payload.scheduler = {
        running: scheduler.running,
        registeredJobCount: jobs.length,
        runningJobCount: jobs.filter((job) => job.locked).length,
        updatedAt: new Date().toISOString(),
    };
    payload.jobs = jobs;

    return new Map(jobs.map((job) => [job.key, job]));
}
```

Replace `applyJobRows` with:

```ts
function applyLatestJobRows(jobMap: Map<string, MonitoringJobSnapshot>, rows: JobLogRow[]): void {
    for (const row of rows) {
        const key = JOB_SOURCE_MAP[row.Source as keyof typeof JOB_SOURCE_MAP];
        if (!key) continue;
        const snapshot = jobMap.get(key);
        if (!snapshot || snapshot.latestRun.status !== 'none') continue;

        const detail = parseJobDetail(row.Detail);
        const startedAt = detail?.startedAt ?? null;
        const finishedAt = detail?.finishedAt ?? row.CreatedAt ?? null;
        snapshot.latestRun = {
            status: snapshot.locked ? 'running' : normalizeRunStatus(detail?.status),
            startedAt,
            finishedAt,
            durationMs: calculateDurationMs(startedAt, finishedAt),
            message: row.Message,
            summary: flattenSummary(detail),
            error: typeof detail?.error === 'string' ? detail.error : null,
        };
    }
}
```

Add daily counts:

```ts
function applyDailyJobRows(jobMap: Map<string, MonitoringJobSnapshot>, rows: DailyJobRow[]): void {
    for (const row of rows) {
        const key = JOB_SOURCE_MAP[row.Source as keyof typeof JOB_SOURCE_MAP];
        if (!key) continue;
        const snapshot = jobMap.get(key);
        if (!snapshot) continue;

        const detail = parseJobDetail(row.Detail);
        const status = normalizeRunStatus(detail?.status);
        snapshot.today.totalRuns += 1;
        if (status === 'success') snapshot.today.successRuns += 1;
        if (status === 'warning') snapshot.today.warningRuns += 1;
        if (status === 'error') {
            snapshot.today.errorRuns += 1;
            if (!snapshot.today.lastErrorAt) {
                snapshot.today.lastErrorAt = row.CreatedAt;
                snapshot.today.lastErrorMessage = row.Message;
            }
        }
    }
}
```

Add daily loader:

```ts
async function loadTodayJobRows(): Promise<DailyJobRow[]> {
    try {
        return await query<DailyJobRow>(
            `SELECT Source, Message, Detail, CreatedAt
             FROM SystemLogs
             WHERE Source IN ('PromptSyncJob', 'RankingSyncJob', 'AgentIndexSyncJob')
               AND CreatedAt >= ?
             ORDER BY CreatedAt DESC`,
            [getTodayStart()],
        );
    } catch {
        return [];
    }
}
```

Update the main function to query logs, latest rows, and daily rows:

```ts
const jobMap = applySchedulerState(payload);

const [logs, latestJobRows, todayJobRows] = await Promise.all([
    loadRecentLogs(),
    loadRecentJobRows(),
    loadTodayJobRows(),
]);

payload.logs = logs;
applyLatestJobRows(jobMap, latestJobRows);
applyDailyJobRows(jobMap, todayJobRows);
```

- [ ] **Step 4: Remove coverage expectations from status-service tests**

Delete the old `maps coverage metrics into monitoring payload` and `falls back to an empty coverage snapshot when coverage loading fails` tests from `tests/unit/status-service.test.ts`. Coverage service can remain tested elsewhere later if needed, but this status page no longer owns that concept.

- [ ] **Step 5: Run status-service tests and verify they pass**

Run:

```bash
npm test -- tests/unit/status-service.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/monitoring/status-service.ts tests/unit/status-service.test.ts
git commit -m "feat: aggregate job monitoring status"
```

## Task 3: Update Admin Status API Contract

**Files:**
- Modify: `app/api/admin/status/route.ts`
- Modify: `tests/unit/admin-status-route.test.ts`

- [ ] **Step 1: Write the failing route test**

In `tests/unit/admin-status-route.test.ts`, remove the `mockLoadCoverageSnapshot` mock and coverage setup. Update the success test to assert that only health is passed:

```ts
it('returns aggregated job monitoring payload for valid admin token', async () => {
    mockGetMonitoringStatus.mockResolvedValue({ jobs: [], scheduler: { running: true } });
    const { GET } = await import('@/app/api/admin/status/route');
    const response = await GET(new NextRequest('http://localhost:5046/api/admin/status', {
        headers: { 'x-admin-token': 'secret-token' },
    }));

    expect(response.status).toBe(200);
    expect(mockGetMonitoringStatus).toHaveBeenCalledWith({
        health: expect.objectContaining({ status: 'healthy' }),
    });
    expect(await response.json()).toEqual({
        success: true,
        data: { jobs: [], scheduler: { running: true } },
    });
});
```

- [ ] **Step 2: Run route tests and verify they fail**

Run:

```bash
npm test -- tests/unit/admin-status-route.test.ts
```

Expected: FAIL because the route still imports coverage service and passes `coverage` into `getMonitoringStatus`.

- [ ] **Step 3: Update the route implementation**

In `app/api/admin/status/route.ts`, remove:

```ts
import { loadCoverageSnapshot } from '@/lib/monitoring/coverage-service';
```

Replace the handler body with:

```ts
export async function GET(request: NextRequest) {
    const auth = validateAdminRequest(request);
    if (!auth.ok) {
        return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
    }

    const health = await getHealthSnapshot();
    const data = await getMonitoringStatus({ health });

    return NextResponse.json({ success: true, data });
}
```

- [ ] **Step 4: Run route tests and verify they pass**

Run:

```bash
npm test -- tests/unit/admin-status-route.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/api/admin/status/route.ts tests/unit/admin-status-route.test.ts
git commit -m "refactor: make admin status api job focused"
```

## Task 4: Render The Job Monitoring Ledger Page

**Files:**
- Modify: `app/ai/admin/status/page.tsx`
- Modify: `tests/unit/admin-status-page.test.ts`

- [ ] **Step 1: Replace the page test mock payload**

In `tests/unit/admin-status-page.test.ts`, replace the `getMonitoringStatus` mock payload with:

```ts
getMonitoringStatus: vi.fn(async () => ({
    service: {
        status: 'healthy',
        timestamp: '2026-06-08T12:00:00.000Z',
        serviceName: 'Mockingbird Knowledge',
        version: '0.1.0',
        databaseStatus: 'ok',
        articleSourceStatus: 'ok',
    },
    scheduler: {
        running: true,
        registeredJobCount: 3,
        runningJobCount: 1,
        updatedAt: '2026-06-08T12:10:00.000Z',
    },
    jobs: [
        {
            key: 'promptSync',
            name: '提示词同步',
            interval: '30 0 */2 * * *',
            locked: false,
            latestRun: {
                status: 'success',
                startedAt: '2026-06-08T10:00:00.000Z',
                finishedAt: '2026-06-08T10:01:00.000Z',
                durationMs: 60000,
                message: 'Sources: 解析 3, 新增 1, 更新 1, 跳过 1',
                summary: { totalParsed: 3, newlyAdded: 1, updated: 1, skipped: 1 },
                error: null,
            },
            today: {
                totalRuns: 4,
                successRuns: 4,
                warningRuns: 0,
                errorRuns: 0,
                lastErrorAt: null,
                lastErrorMessage: null,
            },
        },
        {
            key: 'rankingSync',
            name: '排行榜同步',
            interval: '0 */2 * * *',
            locked: false,
            latestRun: {
                status: 'none',
                startedAt: null,
                finishedAt: null,
                durationMs: null,
                message: null,
                summary: null,
                error: null,
            },
            today: {
                totalRuns: 0,
                successRuns: 0,
                warningRuns: 0,
                errorRuns: 0,
                lastErrorAt: null,
                lastErrorMessage: null,
            },
        },
        {
            key: 'agentIndex',
            name: 'Agent 索引同步',
            interval: '0 15 */2 * * *',
            locked: true,
            latestRun: {
                status: 'running',
                startedAt: '2026-06-08T11:00:00.000Z',
                finishedAt: null,
                durationMs: null,
                message: 'Prompts: 处理 2',
                summary: { promptsProcessed: 2 },
                error: null,
            },
            today: {
                totalRuns: 3,
                successRuns: 2,
                warningRuns: 1,
                errorRuns: 0,
                lastErrorAt: null,
                lastErrorMessage: null,
            },
        },
    ],
    logs: [
        {
            level: 'error',
            source: 'AgentIndexSyncJob',
            message: 'failed',
            detail: 'stack',
            createdAt: '2026-06-08 18:00:00',
        },
    ],
    logReadError: null,
}))
```

Remove the `loadCoverageSnapshot` mock entirely because the page no longer loads coverage.

- [ ] **Step 2: Replace the render assertion**

Replace `renders service, jobs, logs, and coverage sections` with:

```ts
it('renders scheduler status, job ledger, logs, and service health without coverage dashboard language', async () => {
    process.env.KNOWLEDGE_ADMIN_TOKEN = 'secret-token';
    mockCookies.mockResolvedValue({
        get: vi.fn((name: string) => {
            if (name === 'admin_token') return { value: 'secret-token' };
            return undefined;
        }),
    });
    mockHeaders.mockResolvedValue({
        get: vi.fn(() => 'example.com'),
    });

    const mod = await import('@/app/ai/admin/status/page');
    const html = renderToString(await mod.default());

    expect(html).toContain('Job 运行监控');
    expect(html).toContain('定时器运行中');
    expect(html).toContain('提示词同步');
    expect(html).toContain('今天 4 次');
    expect(html).toContain('本次启动后尚无记录');
    expect(html).toContain('最近错误');
    expect(html).toContain('服务健康');
    expect(html).not.toContain('索引闭环');
    expect(html).not.toContain('coverage gap');
    expect(html).not.toContain('UNKNOWN');
});
```

- [ ] **Step 3: Run page tests and verify they fail**

Run:

```bash
npm test -- tests/unit/admin-status-page.test.ts
```

Expected: FAIL because the page still renders `网站状态监控`, coverage, and object-shaped jobs.

- [ ] **Step 4: Implement page helper functions**

In `app/ai/admin/status/page.tsx`, remove the coverage import and load call:

```ts
import { loadCoverageSnapshot } from '@/lib/monitoring/coverage-service';
```

Add helpers:

```tsx
function renderRunStatusLabel(status: string): string {
    switch (status) {
        case 'success':
            return '最近成功';
        case 'warning':
            return '最近告警';
        case 'error':
            return '最近失败';
        case 'running':
            return '正在执行';
        case 'none':
            return '本次启动后尚无记录';
        default:
            return '本次启动后尚无记录';
    }
}

function renderCurrentLabel(locked: boolean): string {
    return locked ? '正在执行' : '空闲';
}

function formatDuration(durationMs: number | null): string {
    if (durationMs === null) return '-';
    if (durationMs < 1000) return `${durationMs}ms`;
    return `${(durationMs / 1000).toFixed(1)}s`;
}

function formatDateTime(value: string | null): string {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString('zh-CN', {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
    });
}

function renderLatestRun(job: { latestRun: { status: string; finishedAt: string | null; startedAt: string | null } }): string {
    const label = renderRunStatusLabel(job.latestRun.status);
    const time = formatDateTime(job.latestRun.finishedAt ?? job.latestRun.startedAt);
    return time ? `${label} ${time}` : label;
}

function renderTodaySummary(today: { totalRuns: number; successRuns: number; warningRuns: number; errorRuns: number }): string {
    return `今天 ${today.totalRuns} 次 / 成功 ${today.successRuns} / 告警 ${today.warningRuns} / 失败 ${today.errorRuns}`;
}

function renderSummary(summary: Record<string, number | string | boolean | null> | null, message: string | null, error: string | null): string {
    if (error) return `失败：${error}`;
    if (summary && Object.keys(summary).length > 0) {
        return Object.entries(summary)
            .map(([key, value]) => `${key}: ${value ?? '-'}`)
            .join('，');
    }
    return message ?? '本次启动后尚无记录';
}
```

- [ ] **Step 5: Render the new page structure**

Replace the JSX body inside `<main className="admin-status">` with:

```tsx
<header className="admin-status__header">
    <p className="admin-status__eyebrow">Internal Ops</p>
    <div className="admin-status__title-row">
        <div>
            <h1>Job 运行监控</h1>
            <p className="admin-status__summary">{headline}</p>
        </div>
        <span className={`admin-status__status is-${topState}`}>{topLabel}</span>
    </div>
</header>

<section className="admin-status__strip" aria-label="Scheduler summary">
    {renderMetric('定时器', status.scheduler.running ? '运行中' : '未启动')}
    {renderMetric('已注册 Job', status.scheduler.registeredJobCount)}
    {renderMetric('正在执行', status.scheduler.runningJobCount)}
    {renderMetric('更新时间', formatDateTime(status.scheduler.updatedAt))}
</section>

<section className="admin-status__section">
    <div className="admin-status__section-heading">
        <h2>Job 台账</h2>
        <p>只看定时任务是否正常执行，以及今天执行了多少。</p>
    </div>
    <div className="admin-status__table-wrap">
        <table className="admin-status__table">
            <thead>
                <tr>
                    <th>Job</th>
                    <th>间隔</th>
                    <th>当前</th>
                    <th>最近一次</th>
                    <th>耗时</th>
                    <th>今天</th>
                    <th>摘要</th>
                </tr>
            </thead>
            <tbody>
                {status.jobs.map((job) => (
                    <tr key={job.key}>
                        <td>{job.name}</td>
                        <td><code>{job.interval || '-'}</code></td>
                        <td><span className={`admin-status__pill is-${job.locked ? 'running' : 'idle'}`}>{renderCurrentLabel(job.locked)}</span></td>
                        <td><span className={`admin-status__pill is-${job.latestRun.status}`}>{renderLatestRun(job)}</span></td>
                        <td>{formatDuration(job.latestRun.durationMs)}</td>
                        <td>{renderTodaySummary(job.today)}</td>
                        <td>{renderSummary(job.latestRun.summary, job.latestRun.message, job.latestRun.error)}</td>
                    </tr>
                ))}
            </tbody>
        </table>
    </div>
</section>

<section className="admin-status__two-column">
    <article className="admin-status__section">
        <div className="admin-status__section-heading">
            <h2>最近错误</h2>
            <p>warn/error 日志只作为排查证据。</p>
        </div>
        {status.logReadError ? (
            <p className="admin-status__empty">无法读取 job 历史记录</p>
        ) : status.logs.length === 0 ? (
            <p className="admin-status__empty">最近没有 warn/error 日志。</p>
        ) : (
            <div className="admin-status__logs">
                {status.logs.map((log) => (
                    <div className="admin-status__log" key={`${log.createdAt}-${log.source}-${log.message}`}>
                        <span>{formatDateTime(log.createdAt)}</span>
                        <strong>{log.level}</strong>
                        <span>{log.source}</span>
                        <p>{log.message}</p>
                    </div>
                ))}
            </div>
        )}
    </article>

    <article className="admin-status__section">
        <div className="admin-status__section-heading">
            <h2>服务健康</h2>
            <p>支撑信息，不参与 job 台账排序。</p>
        </div>
        <dl className="admin-status__health">
            {renderMetric('服务', status.service.serviceName)}
            {renderMetric('整体', renderServiceStateLabel(status.service.status))}
            {renderMetric('数据库', status.service.databaseStatus)}
            {renderMetric('文章源', status.service.articleSourceStatus)}
            {renderMetric('版本', status.service.version)}
            {renderMetric('检测时间', formatDateTime(status.service.timestamp))}
        </dl>
    </article>
</section>
```

Before returning JSX, derive top state:

```tsx
const hasJobFailures = status.jobs.some((job) => job.latestRun.status === 'error' || job.today.errorRuns > 0);
const topState = !status.scheduler.running ? 'error' : hasJobFailures ? 'warning' : 'success';
const topLabel = !status.scheduler.running ? '定时器未启动' : hasJobFailures ? '有 job 需要关注' : '定时器运行中';
const totalRunsToday = status.jobs.reduce((sum, job) => sum + job.today.totalRuns, 0);
const latestProblem = status.jobs.find((job) => job.latestRun.status === 'error' || job.today.errorRuns > 0);
const headline = !status.scheduler.running
    ? '定时器未启动，自动同步不会执行。'
    : latestProblem
        ? `${status.scheduler.registeredJobCount} 个定时任务已注册，今天共执行 ${totalRunsToday} 次，最近的问题来自 ${latestProblem.name}。`
        : `${status.scheduler.registeredJobCount} 个定时任务已注册，今天共执行 ${totalRunsToday} 次，暂无失败记录。`;
```

Add service label helper:

```tsx
function renderServiceStateLabel(value: string): string {
    switch (value) {
        case 'healthy':
            return '健康';
        case 'degraded':
            return '降级';
        default:
            return value || '未知';
    }
}
```

- [ ] **Step 6: Run page tests and verify they pass**

Run:

```bash
npm test -- tests/unit/admin-status-page.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add app/ai/admin/status/page.tsx tests/unit/admin-status-page.test.ts
git commit -m "feat: render admin job monitoring ledger"
```

## Task 5: Restyle With Existing Light/Dark Theme Tokens

**Files:**
- Modify: `app/_styles/admin-status.css`
- Modify: `tests/unit/admin-status-page.test.ts`

- [ ] **Step 1: Add a CSS regression test**

Add this test to `tests/unit/admin-status-page.test.ts`:

```ts
it('admin status css inherits existing theme tokens', async () => {
    const fs = await import('node:fs/promises');
    const path = await import('node:path');
    const css = await fs.readFile(
        path.join(process.cwd(), 'app/_styles/admin-status.css'),
        'utf8',
    );

    expect(css).toContain('var(--theme-bg)');
    expect(css).toContain('var(--theme-surface)');
    expect(css).toContain('var(--theme-border)');
    expect(css).toContain('var(--theme-text)');
    expect(css).not.toContain('#c8dbff');
    expect(css).not.toContain('#465768');
    expect(css).not.toContain('border-radius: 24px');
});
```

- [ ] **Step 2: Run the CSS test and verify it fails**

Run:

```bash
npm test -- tests/unit/admin-status-page.test.ts -t "inherits existing theme tokens"
```

Expected: FAIL because current CSS still contains the rejected decorative palette and large-radius hero styling.

- [ ] **Step 3: Replace page CSS with token-based internal tool styling**

Replace `app/_styles/admin-status.css` with:

```css
.admin-status {
  width: min(1280px, calc(100vw - 32px));
  margin: 0 auto;
  padding: 28px 0 72px;
  color: var(--theme-text);
}

.admin-status__header {
  margin-bottom: 16px;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--theme-border);
}

.admin-status__eyebrow {
  margin: 0 0 6px;
  color: var(--theme-text-muted);
  font-size: 12px;
  text-transform: uppercase;
}

.admin-status__title-row {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
}

.admin-status__title-row h1 {
  margin: 0;
  font-size: 28px;
  line-height: 1.2;
}

.admin-status__summary {
  margin: 8px 0 0;
  color: var(--theme-text-soft);
}

.admin-status__status,
.admin-status__pill {
  display: inline-flex;
  align-items: center;
  width: fit-content;
  min-height: 28px;
  padding: 4px 9px;
  border: 1px solid var(--theme-border-strong);
  border-radius: var(--radius-md);
  background: var(--theme-surface-soft);
  color: var(--theme-text);
  font-size: 13px;
  white-space: nowrap;
}

.admin-status__status.is-success,
.admin-status__pill.is-success,
.admin-status__pill.is-idle {
  border-color: color-mix(in srgb, var(--theme-accent) 34%, var(--theme-border));
  background: var(--theme-accent-soft);
}

.admin-status__status.is-warning,
.admin-status__pill.is-warning,
.admin-status__pill.is-running {
  border-color: color-mix(in srgb, var(--theme-skills) 45%, var(--theme-border));
  background: color-mix(in srgb, var(--theme-skills) 14%, var(--theme-surface-soft));
}

.admin-status__status.is-error,
.admin-status__pill.is-error {
  border-color: color-mix(in srgb, var(--theme-ph) 48%, var(--theme-border));
  background: color-mix(in srgb, var(--theme-ph) 13%, var(--theme-surface-soft));
}

.admin-status__pill.is-none {
  color: var(--theme-text-muted);
}

.admin-status__strip {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
  margin-bottom: 18px;
}

.admin-status__metric {
  padding: 12px;
  border: 1px solid var(--theme-border);
  border-radius: var(--radius-md);
  background: var(--theme-surface);
}

.admin-status__metric dt {
  margin: 0 0 4px;
  color: var(--theme-text-muted);
  font-size: 12px;
}

.admin-status__metric dd {
  margin: 0;
  color: var(--theme-text);
  font-weight: 600;
}

.admin-status__section {
  margin-top: 18px;
  padding: 16px;
  border: 1px solid var(--theme-border);
  border-radius: var(--radius-md);
  background: var(--theme-surface);
}

.admin-status__section-heading {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 12px;
}

.admin-status__section-heading h2 {
  margin: 0;
  font-size: 18px;
}

.admin-status__section-heading p {
  margin: 0;
  color: var(--theme-text-muted);
  font-size: 13px;
}

.admin-status__table-wrap {
  overflow-x: auto;
}

.admin-status__table {
  width: 100%;
  min-width: 920px;
  border-collapse: collapse;
}

.admin-status__table th,
.admin-status__table td {
  padding: 11px 10px;
  border-top: 1px solid var(--theme-border);
  text-align: left;
  vertical-align: top;
  font-size: 14px;
}

.admin-status__table th {
  color: var(--theme-text-muted);
  font-size: 12px;
  font-weight: 600;
}

.admin-status__table code {
  color: var(--theme-code-text);
  font-family: var(--font-mono);
  font-size: 12px;
}

.admin-status__two-column {
  display: grid;
  grid-template-columns: minmax(0, 1.2fr) minmax(280px, 0.8fr);
  gap: 18px;
}

.admin-status__logs {
  display: grid;
  gap: 8px;
}

.admin-status__log {
  display: grid;
  grid-template-columns: 96px 56px 160px minmax(0, 1fr);
  gap: 10px;
  padding: 10px 0;
  border-top: 1px solid var(--theme-border);
  color: var(--theme-text-soft);
  font-size: 13px;
}

.admin-status__log strong {
  color: var(--theme-text);
}

.admin-status__log p {
  margin: 0;
}

.admin-status__empty {
  margin: 0;
  color: var(--theme-text-muted);
}

.admin-status__health {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

@media (max-width: 760px) {
  .admin-status {
    width: min(100vw - 24px, 1280px);
    padding-top: 20px;
  }

  .admin-status__title-row,
  .admin-status__section-heading {
    align-items: flex-start;
    flex-direction: column;
  }

  .admin-status__strip,
  .admin-status__two-column,
  .admin-status__health {
    grid-template-columns: 1fr;
  }

  .admin-status__log {
    grid-template-columns: 1fr;
  }
}
```

- [ ] **Step 4: Run page tests and verify they pass**

Run:

```bash
npm test -- tests/unit/admin-status-page.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/_styles/admin-status.css tests/unit/admin-status-page.test.ts
git commit -m "style: align admin status with site theme"
```

## Task 6: Verify Scheduler Summary Persistence Still Supports Monitoring

**Files:**
- Modify: `lib/jobs/scheduler.ts`
- Modify: `tests/unit/scheduler.test.ts`

- [ ] **Step 1: Add precise structured detail assertions**

In `tests/unit/scheduler.test.ts`, extend `persists prompt sync and agent index summaries for monitoring` with:

```ts
const promptDetail = JSON.parse(
    mockWriteLog.mock.calls.find((call) => call[1] === 'PromptSyncJob')?.[3] as string,
);
expect(promptDetail).toMatchObject({
    jobKey: 'prompt-sync',
    status: 'success',
    sources: {
        totalParsed: 3,
        newlyAdded: 1,
        updated: 1,
        skipped: 1,
    },
});
expect(promptDetail.startedAt).toEqual(expect.any(String));
expect(promptDetail.finishedAt).toEqual(expect.any(String));

const agentDetail = JSON.parse(
    mockWriteLog.mock.calls.find((call) => call[1] === 'AgentIndexSyncJob')?.[3] as string,
);
expect(agentDetail).toMatchObject({
    jobKey: 'agent-index',
    status: 'success',
    prompts: {
        processed: 2,
        indexed: 2,
        skipped: 0,
        failed: 0,
    },
    articles: {
        processed: 1,
        indexed: 1,
        skipped: 0,
        failed: 0,
    },
});
expect(agentDetail.startedAt).toEqual(expect.any(String));
expect(agentDetail.finishedAt).toEqual(expect.any(String));
```

Add an error summary test:

```ts
it('persists scheduler job errors with status and error detail', async () => {
    process.env.JOB_PROMPT_SYNC_CRON = '* * * * * *';
    mockPromptSync.mockRejectedValue(new Error('source timeout'));

    const scheduler = await import('@/lib/jobs/scheduler');
    scheduler.startScheduler();
    await vi.advanceTimersByTimeAsync(1000);

    const errorCall = mockWriteLog.mock.calls.find(
        (call) => call[0] === 'error' && call[1] === 'PromptSyncJob',
    );
    expect(errorCall).toBeTruthy();
    const detail = JSON.parse(errorCall?.[3] as string);
    expect(detail).toMatchObject({
        jobKey: 'prompt-sync',
        status: 'error',
        error: 'Error: source timeout',
    });
    expect(detail.startedAt).toEqual(expect.any(String));
    expect(detail.finishedAt).toEqual(expect.any(String));
});
```

- [ ] **Step 2: Run scheduler tests and verify failures if fields are missing**

Run:

```bash
npm test -- tests/unit/scheduler.test.ts -t "monitoring|persists scheduler job errors"
```

Expected: PASS if existing structured summaries already include these fields. If the error detail is missing `jobKey`, `status`, or timestamps, the new error test will fail.

- [ ] **Step 3: Fix scheduler detail only if the test fails**

If the test fails, update the relevant `persistJobRunSummary` calls in `lib/jobs/scheduler.ts` so success and error paths include:

```ts
{
    jobKey: 'prompt-sync',
    startedAt,
    finishedAt,
    status: 'error',
    error: serializeError(err),
}
```

and for agent indexing:

```ts
{
    jobKey: 'agent-index',
    startedAt,
    finishedAt,
    status: report.success ? 'success' : 'warning',
    prompts: report.prompts,
    articles: report.articles,
}
```

- [ ] **Step 4: Run scheduler tests and verify they pass**

Run:

```bash
npm test -- tests/unit/scheduler.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/jobs/scheduler.ts tests/unit/scheduler.test.ts
git commit -m "test: verify scheduler monitoring summaries"
```

## Task 7: Full Targeted Verification And Browser Check

**Files:**
- No source edits expected unless verification finds a defect.

- [ ] **Step 1: Run the targeted monitoring test suite**

Run:

```bash
npm test -- tests/unit/status-service.test.ts tests/unit/admin-status-route.test.ts tests/unit/admin-status-page.test.ts tests/unit/scheduler.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run lint**

Run:

```bash
npm run lint
```

Expected: PASS.

- [ ] **Step 3: Attempt production build**

Run:

```bash
npm run build
```

Expected: PASS if required local build environment is configured. If it fails because of the existing `MYSQL_URL` build-time dependency unrelated to this redesign, record the exact failing route/error in the final report.

- [ ] **Step 4: Start or reuse the dev server**

Check whether port `5046` already has the app running:

```bash
ps -ef | rg 'next dev -p 5046|npm run dev'
```

If not running, start it:

```bash
npm run dev
```

Expected: Next.js dev server listens on `http://localhost:5046`.

- [ ] **Step 5: Open the admin status page in the in-app browser**

Use the Browser plugin to open:

```text
http://localhost:5046/ai/admin/status
```

Expected:

- Page title is `Job 运行监控`.
- Header shows `定时器运行中`, `有 job 需要关注`, or `定时器未启动`.
- Job table is visible.
- No page section titled `索引闭环`.
- The visual style follows the current site theme in both light and dark modes.

- [ ] **Step 6: Commit any verification fixes**

If verification required source fixes, commit them:

```bash
git add <changed-files>
git commit -m "fix: polish admin job monitoring verification"
```

If no fixes were needed, do not create an empty commit.
