import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockQuery = vi.fn();
const mockBuildSourceIndexCoverage = vi.fn();

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

vi.mock('../../scripts/agent-source-index-coverage.mjs', () => ({
    buildSourceIndexCoverage: mockBuildSourceIndexCoverage,
}));

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

describe('getMonitoringStatus', () => {
    beforeEach(() => {
        vi.resetModules();
        vi.clearAllMocks();
    });

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

        expect(payload.service.status).toBe('healthy');
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
        expect(agentIndex?.locked).toBe(true);
        expect(agentIndex?.latestRun.status).toBe('running');
        expect(agentIndex?.today.warningRuns).toBe(1);
        expect(payload.logs).toHaveLength(1);
        expect(payload).not.toHaveProperty('coverage');
    });

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

    it('returns empty logs and no job history when system log queries fail', async () => {
        mockQuery
            .mockRejectedValueOnce(new Error('MYSQL_URL 环境变量未设置'))
            .mockRejectedValueOnce(new Error('MYSQL_URL 环境变量未设置'))
            .mockRejectedValueOnce(new Error('MYSQL_URL 环境变量未设置'));

        const { getMonitoringStatus } = await import('@/lib/monitoring/status-service');
        const payload = await getMonitoringStatus({
            health: {
                status: 'degraded',
                timestamp: '2026-06-08T12:00:00.000Z',
                version: '0.1.0',
                database: { status: 'error', prompts: 0 },
                articleSources: { status: 'ok', articles: 0 },
            },
        });

        expect(payload.logs).toEqual([]);
        expect(payload.jobs[0].latestRun.status).toBe('none');
        expect(payload.jobs[2].latestRun.message).toBeNull();
    });

    it('keeps the newest persisted job row when multiple rows exist for the same job', async () => {
        mockQuery
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([
                { Source: 'PromptSyncJob', Message: 'newest', Detail: '{"jobKey":"prompt-sync","startedAt":"2026-06-08T12:00:00.000Z","finishedAt":"2026-06-08T12:01:00.000Z","status":"success","sources":{"totalParsed":9}}', CreatedAt: '2026-06-08 12:01:00' },
                { Source: 'PromptSyncJob', Message: 'older', Detail: '{"jobKey":"prompt-sync","startedAt":"2026-06-08T10:00:00.000Z","finishedAt":"2026-06-08T10:01:00.000Z","status":"warning","sources":{"totalParsed":1}}', CreatedAt: '2026-06-08 10:01:00' },
            ])
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

        const promptSync = payload.jobs.find((job) => job.key === 'promptSync');
        expect(promptSync?.latestRun.message).toBe('newest');
        expect(promptSync?.latestRun.status).toBe('success');
    });

    it('filters local development revalidation noise from recent logs', async () => {
        mockQuery
            .mockResolvedValueOnce([
                { Level: 'warn', Source: 'Scheduler', Message: '统一重验证失败: HTTP 403', Detail: null, CreatedAt: '2026-06-08 18:00:00' },
                { Level: 'error', Source: 'AgentIndexSyncJob', Message: 'failed', Detail: 'stack', CreatedAt: '2026-06-08 18:01:00' },
            ])
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([]);

        const originalSiteUrl = process.env.SITE_URL;
        process.env.SITE_URL = 'https://zgnknowledge.online';

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

        expect(payload.logs).toEqual([
            {
                level: 'error',
                source: 'AgentIndexSyncJob',
                message: 'failed',
                detail: 'stack',
                createdAt: '2026-06-08 18:01:00',
            },
        ]);

        if (originalSiteUrl === undefined) delete process.env.SITE_URL;
        else process.env.SITE_URL = originalSiteUrl;
    });
});
