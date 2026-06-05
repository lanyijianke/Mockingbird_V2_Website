import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockPromptSync = vi.fn();
const fetchMock = vi.fn();

vi.mock('@/lib/pipelines/prompt-readme-sync', () => ({
    syncAllAsync: mockPromptSync,
}));

describe('knowledge scheduler', () => {
    const originalPromptCron = process.env.JOB_PROMPT_SYNC_CRON;
    const originalRankingCron = process.env.JOB_RANKING_SYNC_CRON;
    const originalKnowledgeToken = process.env.KNOWLEDGE_ADMIN_TOKEN;
    const originalSiteUrl = process.env.SITE_URL;

    beforeEach(() => {
        vi.resetModules();
        vi.clearAllMocks();
        vi.useFakeTimers();
        mockPromptSync.mockResolvedValue({ totalParsed: 0, newlyAdded: 0, updated: 0, skipped: 0 });
        fetchMock.mockResolvedValue(new Response(null, { status: 200 }));
        vi.stubGlobal('fetch', fetchMock);
        delete process.env.JOB_PROMPT_SYNC_CRON;
        delete process.env.JOB_RANKING_SYNC_CRON;
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
        if (originalKnowledgeToken === undefined) delete process.env.KNOWLEDGE_ADMIN_TOKEN;
        else process.env.KNOWLEDGE_ADMIN_TOKEN = originalKnowledgeToken;
        if (originalSiteUrl === undefined) delete process.env.SITE_URL;
        else process.env.SITE_URL = originalSiteUrl;
    });

    it('registers only prompt and ranking jobs', async () => {
        const scheduler = await import('@/lib/jobs/scheduler');

        scheduler.startScheduler();

        expect(scheduler.getSchedulerStatus().jobs.map((job) => job.name)).toEqual([
            '提示词同步',
            '排行榜同步',
        ]);
    });

    it('defaults prompt source sync to every two hours', async () => {
        const scheduler = await import('@/lib/jobs/scheduler');

        expect(scheduler.getSchedulerStatus().jobs).toContainEqual({
            name: '提示词同步',
            interval: '30 0 */2 * * *',
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
});
