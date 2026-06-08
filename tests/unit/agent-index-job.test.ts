import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockIndexPromptBacklogBatch = vi.fn();
const mockIndexAllArticles = vi.fn();

vi.mock('@/lib/services/agent-search-indexer', () => ({
    indexPromptBacklogBatch: mockIndexPromptBacklogBatch,
    indexAllArticles: mockIndexAllArticles,
}));

describe('runAgentIndexJob', () => {
    beforeEach(() => {
        vi.resetModules();
        vi.clearAllMocks();
        mockIndexPromptBacklogBatch.mockResolvedValue({
            success: true,
            items: [
                { type: 'prompt', id: '1', status: 'indexed' },
                { type: 'prompt', id: '2', status: 'indexed' },
            ],
            processed: 2,
            requestedLimit: 1000,
            nextCursor: null,
            hasMore: false,
        });
        mockIndexAllArticles.mockResolvedValue({
            success: true,
            items: [
                { type: 'article', id: 'agent-workflow', status: 'indexed' },
            ],
        });
    });

    it('indexes prompt batches and published articles', async () => {
        const { runAgentIndexJob } = await import('@/lib/jobs/agent-index-job');
        const report = await runAgentIndexJob();

        expect(mockIndexPromptBacklogBatch).toHaveBeenCalledWith({ limit: 1000 });
        expect(mockIndexAllArticles).toHaveBeenCalledWith({ site: 'ai' });
        expect(report).toEqual({
            success: true,
            prompts: {
                processed: 2,
                indexed: 2,
                skipped: 0,
                failed: 0,
                batches: 1,
                lastCursor: null,
                hasMore: false,
            },
            articles: {
                processed: 1,
                indexed: 1,
                skipped: 0,
                failed: 0,
            },
        });
    });

    it('continues prompt batches until hasMore is false or max batches is reached', async () => {
        mockIndexPromptBacklogBatch
            .mockResolvedValueOnce({
                success: true,
                items: [{ type: 'prompt', id: '1', status: 'indexed' }],
                processed: 1,
                requestedLimit: 1,
                nextCursor: null,
                hasMore: true,
            })
            .mockResolvedValueOnce({
                success: true,
                items: [{ type: 'prompt', id: '2', status: 'skipped' }],
                processed: 1,
                requestedLimit: 1,
                nextCursor: null,
                hasMore: true,
            });

        const { runAgentIndexJob } = await import('@/lib/jobs/agent-index-job');
        const report = await runAgentIndexJob({ promptBatchLimit: 1, maxPromptBatches: 2 });

        expect(mockIndexPromptBacklogBatch).toHaveBeenNthCalledWith(1, { limit: 1 });
        expect(mockIndexPromptBacklogBatch).toHaveBeenNthCalledWith(2, { limit: 1 });
        expect(report.prompts).toMatchObject({
            processed: 2,
            indexed: 1,
            skipped: 1,
            failed: 0,
            batches: 2,
            lastCursor: null,
            hasMore: true,
        });
    });

    it('marks the job unsuccessful when any indexed item fails', async () => {
        mockIndexPromptBacklogBatch.mockResolvedValue({
            success: false,
            items: [{ type: 'prompt', id: '1', status: 'failed', reason: 'embedding-error' }],
            processed: 1,
            requestedLimit: 1000,
            nextCursor: null,
            hasMore: false,
        });

        const { runAgentIndexJob } = await import('@/lib/jobs/agent-index-job');
        const report = await runAgentIndexJob();

        expect(report.success).toBe(false);
        expect(report.prompts.failed).toBe(1);
    });
});
