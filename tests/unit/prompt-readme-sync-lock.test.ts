import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockQueryScalar = vi.fn();
const mockSyncConfiguredPromptSources = vi.fn();
const mockLoggerWarn = vi.fn();

vi.mock('@/lib/db', () => ({
    queryScalar: mockQueryScalar,
}));

vi.mock('@/lib/pipelines/prompt-sources/remote-sync', () => ({
    syncConfiguredPromptSources: mockSyncConfiguredPromptSources,
}));

vi.mock('@/lib/utils/logger', () => ({
    logger: {
        debug: vi.fn(),
        info: vi.fn(),
        warn: mockLoggerWarn,
        error: vi.fn(),
        persist: vi.fn(),
    },
}));

describe('prompt README sync locking', () => {
    beforeEach(() => {
        vi.resetModules();
        vi.clearAllMocks();
    });

    it('acquires a MySQL advisory lock before syncing and releases it afterwards', async () => {
        mockQueryScalar.mockResolvedValueOnce(1).mockResolvedValueOnce(1);
        mockSyncConfiguredPromptSources.mockResolvedValue({
            totalParsed: 3,
            newlyAdded: 1,
            updated: 1,
            skipped: 1,
        });

        const { syncAllAsync } = await import('@/lib/pipelines/prompt-readme-sync');
        const report = await syncAllAsync();

        expect(report).toEqual({
            totalParsed: 3,
            newlyAdded: 1,
            updated: 1,
            skipped: 1,
        });
        expect(mockQueryScalar).toHaveBeenNthCalledWith(
            1,
            'SELECT GET_LOCK(?, 0) AS Acquired',
            ['prompt-source-sync']
        );
        expect(mockSyncConfiguredPromptSources).toHaveBeenCalledTimes(1);
        expect(mockQueryScalar).toHaveBeenNthCalledWith(
            2,
            'SELECT RELEASE_LOCK(?) AS Released',
            ['prompt-source-sync']
        );
    });

    it('skips syncing when another process already holds the advisory lock', async () => {
        mockQueryScalar.mockResolvedValueOnce(0);

        const { syncAllAsync } = await import('@/lib/pipelines/prompt-readme-sync');
        const report = await syncAllAsync();

        expect(report).toEqual({
            totalParsed: 0,
            newlyAdded: 0,
            updated: 0,
            skipped: 0,
        });
        expect(mockSyncConfiguredPromptSources).not.toHaveBeenCalled();
        expect(mockLoggerWarn).toHaveBeenCalledWith(
            'PromptSyncJob',
            expect.stringContaining('其他进程')
        );
        expect(mockQueryScalar).toHaveBeenCalledTimes(1);
    });
});
