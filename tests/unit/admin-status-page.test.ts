import { describe, expect, it, vi } from 'vitest';
import { renderToString } from 'react-dom/server';

vi.mock('@/lib/monitoring/status-service', () => ({
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
        indexStatus: {
            site: 'ai',
            available: true,
            prompts: { sourceTotal: 7649, indexed: 7659, pending: -10 },
            articles: { sourceTotal: 17, indexed: 16, pending: 1 },
            embeddings: {
                semanticEnabled: false,
                totalChunks: 12000,
                embeddedChunks: 11900,
                promptDocumentsWithEmbeddings: null,
                articleDocumentsWithEmbeddings: null,
                promptDocumentsPending: null,
                articleDocumentsPending: null,
            },
            vectors: {
                promptPoints: null,
                articlePoints: null,
                totalPoints: null,
            },
        },
    })),
}));

vi.mock('@/lib/monitoring/coverage-service', () => ({
    loadCoverageSnapshot: vi.fn(async () => ({
        site: 'ai',
        available: true,
        prompts: { sourceTotal: 7659, indexed: 7600, pending: 59 },
        articles: { sourceTotal: 17, indexed: 16, pending: 1 },
        embeddings: {
            semanticEnabled: false,
            totalChunks: 12000,
            embeddedChunks: 11900,
            promptDocumentsWithEmbeddings: null,
            articleDocumentsWithEmbeddings: null,
            promptDocumentsPending: null,
            articleDocumentsPending: null,
        },
        vectors: {
            promptPoints: null,
            articlePoints: null,
            totalPoints: null,
        },
    })),
}));

vi.mock('@/app/api/health/route', () => ({
    getHealthSnapshot: vi.fn(async () => ({
        status: 'healthy',
        timestamp: '2026-06-08T12:00:00.000Z',
        version: '0.1.0',
        database: { status: 'ok', prompts: 100 },
        articleSources: { status: 'ok', articles: 10 },
        scheduler: { running: true, jobs: [] },
        service: 'Mockingbird Knowledge',
    })),
}));

const mockCookies = vi.fn();
const mockHeaders = vi.fn();
const mockNotFound = vi.fn(() => {
    throw new Error('not-found');
});

vi.mock('next/headers', () => ({
    cookies: mockCookies,
    headers: mockHeaders,
}));

vi.mock('next/navigation', () => ({
    notFound: mockNotFound,
}));

describe('admin status page', () => {
    it('rejects requests without a valid admin token cookie', async () => {
        process.env.KNOWLEDGE_ADMIN_TOKEN = 'secret-token';
        mockCookies.mockResolvedValue({
            get: vi.fn(() => undefined),
        });
        mockHeaders.mockResolvedValue({
            get: vi.fn(() => 'example.com'),
        });

        const mod = await import('@/app/ai/admin/status/page');
        await expect(mod.default()).rejects.toThrow('not-found');
    });

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
        expect(html).toContain('索引数据状态');
        expect(html).toContain('提示词源数据');
        expect(html).toContain('已入搜索索引');
        expect(html).toContain('多出 10');
        expect(html).not.toContain('待补 -10');
        expect(html).toContain('文章源数据');
        expect(html).toContain('待补 1');
        expect(html).toContain('Embedding');
        expect(html).toContain('11,900 / 12,000 chunks');
        expect(html).toContain('语义搜索关闭');
        expect(html).toContain('提示词文档待补');
        expect(html).toContain('向量库');
        expect(html).toContain('随语义搜索关闭');
        expect(html).toContain('未检查');
        expect(html).not.toContain('未读取');
        expect(html).not.toContain('未启用');
        expect(html).not.toContain('n/a');
        expect(html).not.toContain('索引闭环');
        expect(html).not.toContain('coverage gap');
        expect(html).not.toContain('UNKNOWN');
    });

    it('renders human-readable job intervals while preserving raw cron values', async () => {
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

        expect(html).toContain('每 2 小时，整点后 30 秒');
        expect(html).toContain('每 2 小时，整点');
        expect(html).toContain('每 2 小时，第 15 分钟');
        expect(html).toContain('cron: 30 0 */2 * * *');
        expect(html).toContain('cron: 0 */2 * * *');
        expect(html).toContain('cron: 0 15 */2 * * *');
    });

    it('uses stable job table columns so long summaries do not crush scan fields', async () => {
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

        expect(html).toContain('admin-status__col-job');
        expect(html).toContain('admin-status__col-interval');
        expect(html).toContain('admin-status__col-summary');

        const fs = await import('node:fs/promises');
        const path = await import('node:path');
        const css = await fs.readFile(
            path.join(process.cwd(), 'app/_styles/admin-status.css'),
            'utf8',
        );

        expect(css).toContain('table-layout: fixed');
        expect(css).toContain('min-width: 1280px');
        expect(css).toContain('.admin-status__col-summary');
    });

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
});
