import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockPromptSync = vi.fn();
const mockRunAgentIndexJob = vi.fn();
const fetchMock = vi.fn();
const mockWriteLog = vi.fn();

vi.mock('@/lib/pipelines/prompt-readme-sync', () => ({
    syncAllAsync: mockPromptSync,
}));

vi.mock('@/lib/jobs/agent-index-job', () => ({
    runAgentIndexJob: mockRunAgentIndexJob,
}));

vi.mock('@/lib/services/log-service', () => ({
    writeLog: mockWriteLog,
    serializeError: (value: unknown) => String(value),
}));

describe('knowledge scheduler', () => {
    const originalPromptCron = process.env.JOB_PROMPT_SYNC_CRON;
    const originalRankingCron = process.env.JOB_RANKING_SYNC_CRON;
    const originalAgentIndexCron = process.env.JOB_AGENT_INDEX_CRON;
    const originalKnowledgeToken = process.env.KNOWLEDGE_ADMIN_TOKEN;
    const originalSiteUrl = process.env.SITE_URL;

    beforeEach(() => {
        vi.resetModules();
        vi.clearAllMocks();
        vi.useFakeTimers();
        mockPromptSync.mockResolvedValue({ totalParsed: 0, newlyAdded: 0, updated: 0, skipped: 0 });
        mockRunAgentIndexJob.mockResolvedValue({
            success: true,
            prompts: { processed: 0, indexed: 0, skipped: 0, failed: 0, batches: 1, lastCursor: null, hasMore: false },
            articles: { processed: 0, indexed: 0, skipped: 0, failed: 0 },
        });
        mockWriteLog.mockResolvedValue(undefined);
        fetchMock.mockResolvedValue(new Response(null, { status: 200 }));
        vi.stubGlobal('fetch', fetchMock);
        delete process.env.JOB_PROMPT_SYNC_CRON;
        delete process.env.JOB_RANKING_SYNC_CRON;
        delete process.env.JOB_AGENT_INDEX_CRON;
        process.env.KNOWLEDGE_ADMIN_TOKEN = 'unit-test-token';
        process.env.SITE_URL = 'http://localhost:5046';
    });

    afterEach(async () => {
        const scheduler = await import('@/lib/jobs/scheduler');
        scheduler.stopScheduler();
        vi.clearAllTimers();
        vi.unstubAllGlobals();
        vi.useRealTimers();
        if (originalPromptCron === undefined) delete process.env.JOB_PROMPT_SYNC_CRON;
        else process.env.JOB_PROMPT_SYNC_CRON = originalPromptCron;
        if (originalRankingCron === undefined) delete process.env.JOB_RANKING_SYNC_CRON;
        else process.env.JOB_RANKING_SYNC_CRON = originalRankingCron;
        if (originalAgentIndexCron === undefined) delete process.env.JOB_AGENT_INDEX_CRON;
        else process.env.JOB_AGENT_INDEX_CRON = originalAgentIndexCron;
        if (originalKnowledgeToken === undefined) delete process.env.KNOWLEDGE_ADMIN_TOKEN;
        else process.env.KNOWLEDGE_ADMIN_TOKEN = originalKnowledgeToken;
        if (originalSiteUrl === undefined) delete process.env.SITE_URL;
        else process.env.SITE_URL = originalSiteUrl;
    });

    it('registers prompt, ranking, and agent index jobs', async () => {
        const scheduler = await import('@/lib/jobs/scheduler');

        scheduler.startScheduler();

        expect(scheduler.getSchedulerStatus().jobs.map((job) => job.name)).toEqual([
            '提示词同步',
            '排行榜同步',
            'Agent 索引同步',
        ]);
    });

    it('keeps scheduler state across module reloads in the same server process', async () => {
        const scheduler = await import('@/lib/jobs/scheduler');
        scheduler.startScheduler();

        vi.resetModules();
        const reloadedScheduler = await import('@/lib/jobs/scheduler');

        expect(reloadedScheduler.getSchedulerStatus().running).toBe(true);
        expect(reloadedScheduler.getSchedulerStatus().jobs).toHaveLength(3);
    });

    it('defaults prompt source sync to every two hours', async () => {
        const scheduler = await import('@/lib/jobs/scheduler');

        expect(scheduler.getSchedulerStatus().jobs).toContainEqual({
            name: '提示词同步',
            interval: '30 0 */2 * * *',
            locked: false,
        });
    });

    it('defaults agent indexing to every two hours', async () => {
        const scheduler = await import('@/lib/jobs/scheduler');

        expect(scheduler.getSchedulerStatus().jobs).toContainEqual({
            name: 'Agent 索引同步',
            interval: '0 15 */2 * * *',
            locked: false,
        });
    });

    it('requests unified revalidation when scheduled prompt sync changes content', async () => {
        process.env.JOB_PROMPT_SYNC_CRON = '* * * * * *';
        mockPromptSync.mockResolvedValue({ totalParsed: 3, newlyAdded: 1, updated: 0, skipped: 2 });
        const scheduler = await import('@/lib/jobs/scheduler');

        scheduler.startScheduler();
        await vi.advanceTimersByTimeAsync(1000);

        expect(fetchMock).toHaveBeenCalledWith(
            'http://localhost:5046/api/revalidate/content',
            expect.objectContaining({
                method: 'POST',
                body: JSON.stringify({ type: 'prompt', action: 'sync' }),
            }),
        );
    });

    it('does not revalidate prompt surfaces when scheduled prompt sync has no changes', async () => {
        process.env.JOB_PROMPT_SYNC_CRON = '* * * * * *';
        mockPromptSync.mockResolvedValue({ totalParsed: 3, newlyAdded: 0, updated: 0, skipped: 3 });
        const scheduler = await import('@/lib/jobs/scheduler');

        scheduler.startScheduler();
        await vi.advanceTimersByTimeAsync(1000);

        expect(fetchMock).not.toHaveBeenCalledWith(
            'http://localhost:5046/api/revalidate/content',
            expect.anything(),
        );

        const promptSyncLogCall = mockWriteLog.mock.calls.find(
            (call) => call[1] === 'PromptSyncJob'
        );
        expect(promptSyncLogCall).toBeTruthy();
        expect(promptSyncLogCall?.[2]).toContain('Sources: 解析 3, 新增 0, 更新 0, 跳过 3');
        expect(promptSyncLogCall?.[3]).toContain('"status":"success"');
    });

    it('targets localhost for internal revalidation in non-production development', async () => {
        process.env.JOB_PROMPT_SYNC_CRON = '* * * * * *';
        process.env.SITE_URL = 'https://zgnknowledge.online';
        mockPromptSync.mockResolvedValue({ totalParsed: 1, newlyAdded: 1, updated: 0, skipped: 0 });
        const scheduler = await import('@/lib/jobs/scheduler');

        scheduler.startScheduler();
        await vi.advanceTimersByTimeAsync(1000);

        expect(fetchMock).toHaveBeenCalledWith(
            'http://localhost:5046/api/revalidate/content',
            expect.objectContaining({
                method: 'POST',
            }),
        );
    });

    it('requests ranking ISR revalidation after startup', async () => {
        const scheduler = await import('@/lib/jobs/scheduler');

        scheduler.startScheduler();
        await vi.advanceTimersByTimeAsync(5000);

        expect(fetchMock).toHaveBeenCalledWith(
            'http://localhost:5046/api/revalidate/content',
            expect.objectContaining({
                method: 'POST',
                body: JSON.stringify({ type: 'rankings', action: 'refresh', kind: 'all' }),
            }),
        );
    });

    it('runs agent indexing on its own schedule', async () => {
        process.env.JOB_AGENT_INDEX_CRON = '* * * * * *';
        const scheduler = await import('@/lib/jobs/scheduler');

        scheduler.startScheduler();
        await vi.advanceTimersByTimeAsync(1000);

        expect(mockRunAgentIndexJob).toHaveBeenCalledTimes(1);
    });

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
    });

    it('persists scheduler job errors with status and error detail', async () => {
        process.env.JOB_PROMPT_SYNC_CRON = '* * * * * *';
        mockPromptSync.mockRejectedValue(new Error('source timeout'));

        const scheduler = await import('@/lib/jobs/scheduler');
        scheduler.startScheduler();
        await vi.advanceTimersByTimeAsync(1000);

        const errorCall = mockWriteLog.mock.calls.find(
            (call) => call[0] === 'info' && call[1] === 'PromptSyncJob' && call[2] === 'Source 同步失败:',
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
});
