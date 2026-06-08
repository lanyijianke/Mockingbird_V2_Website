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

    it('falls back to an empty coverage snapshot when coverage loading fails', async () => {
        mockBuildSourceIndexCoverage.mockRejectedValueOnce(new Error('MYSQL_URL is required'));

        const { loadCoverageSnapshot } = await import('@/lib/monitoring/coverage-service');
        await expect(loadCoverageSnapshot('ai')).resolves.toEqual({
            promptGap: null,
            articleGap: null,
            promptEmbeddingGap: null,
            articleEmbeddingGap: null,
            indexedPrompts: null,
            indexedArticles: null,
            totalDocuments: null,
            totalChunks: null,
            totalVectorPoints: null,
        });
    });

    it('returns empty logs and unknown job snapshots when system log queries fail', async () => {
        mockQuery
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
        });

        expect(payload.logs).toEqual([]);
        expect(payload.jobs.promptSync.lastStatus).toBe('unknown');
        expect(payload.jobs.agentIndex.lastMessage).toBeNull();
    });

    it('keeps the newest persisted job row when multiple rows exist for the same job', async () => {
        mockQuery
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([
                { Source: 'PromptSyncJob', Message: 'newest', Detail: '{"jobKey":"prompt-sync","startedAt":"2026-06-08T12:00:00.000Z","finishedAt":"2026-06-08T12:01:00.000Z","status":"success","sources":{"totalParsed":9}}', CreatedAt: '2026-06-08 12:01:00' },
                { Source: 'PromptSyncJob', Message: 'older', Detail: '{"jobKey":"prompt-sync","startedAt":"2026-06-08T10:00:00.000Z","finishedAt":"2026-06-08T10:01:00.000Z","status":"warning","sources":{"totalParsed":1}}', CreatedAt: '2026-06-08 10:01:00' },
            ]);

        const { getMonitoringStatus } = await import('@/lib/monitoring/status-service');
        const payload = await getMonitoringStatus({
            health: {
                status: 'healthy',
                timestamp: '2026-06-08T12:00:00.000Z',
                version: '0.1.0',
                database: { status: 'ok', prompts: 1 },
                articleSources: { status: 'ok', articles: 1 },
            },
            coverage: {
                promptGap: 0,
                articleGap: 0,
                promptEmbeddingGap: 0,
                articleEmbeddingGap: 0,
                indexedPrompts: 1,
                indexedArticles: 1,
                totalDocuments: 2,
                totalChunks: 2,
                totalVectorPoints: 2,
            },
        });

        expect(payload.jobs.promptSync.lastMessage).toBe('newest');
        expect(payload.jobs.promptSync.lastStatus).toBe('success');
    });

    it('filters local development revalidation noise from recent logs', async () => {
        mockQuery
            .mockResolvedValueOnce([
                { Level: 'warn', Source: 'Scheduler', Message: '统一重验证失败: HTTP 403', Detail: null, CreatedAt: '2026-06-08 18:00:00' },
                { Level: 'error', Source: 'AgentIndexSyncJob', Message: 'failed', Detail: 'stack', CreatedAt: '2026-06-08 18:01:00' },
            ])
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
            coverage: {
                promptGap: 0,
                articleGap: 0,
                promptEmbeddingGap: 0,
                articleEmbeddingGap: 0,
                indexedPrompts: 1,
                indexedArticles: 1,
                totalDocuments: 2,
                totalChunks: 2,
                totalVectorPoints: 2,
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
