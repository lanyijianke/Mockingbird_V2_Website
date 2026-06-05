import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockQuery = vi.fn();
const mockQueryOne = vi.fn();
const mockQueryScalar = vi.fn();
const mockExecute = vi.fn();

vi.mock('@/lib/db', () => ({
    query: mockQuery,
    queryOne: mockQueryOne,
    queryScalar: mockQueryScalar,
    execute: mockExecute,
}));

const promptRow = {
    Id: 7,
    Title: 'Prompt 7',
    RawTitle: null,
    Description: 'A prompt',
    Content: 'Hello',
    Category: 'multimodal-prompts',
    Source: null,
    Author: 'tester',
    SourceUrl: 'https://example.com/prompts/7',
    CoverImageUrl: null,
    VideoPreviewUrl: null,
    CardPreviewVideoUrl: '/content/prompts/media/prompt-7.card.mp4',
    ImagesJson: null,
    CopyCount: 3,
    IsActive: 1,
    CreatedAt: '2026-04-22T00:00:00.000Z',
    UpdatedAt: '2026-04-22T00:00:00.000Z',
};

describe('prompt service static-page data reads', () => {
    beforeEach(() => {
        vi.resetModules();
        vi.clearAllMocks();
        mockQuery.mockImplementation(async (sql: string) => {
            if (sql.includes('Id != ?')) return [promptRow];
            if (sql.includes('ORDER BY CreatedAt DESC LIMIT ?')) return [promptRow];
            return [];
        });
        mockQueryOne.mockResolvedValue(promptRow);
        mockQueryScalar.mockResolvedValue(1);
        mockExecute.mockResolvedValue({ affectedRows: 1 });
    });

    it('loads prompt detail directly so ISR pages are the cache layer', async () => {
        const { getPromptById, trackCopy } = await import('@/lib/services/prompt-service');

        await expect(getPromptById(7)).resolves.toMatchObject({
            id: 7,
            title: 'Prompt 7',
            cardPreviewVideoUrl: '/content/prompts/media/prompt-7.card.mp4',
        });
        await expect(getPromptById(7)).resolves.toMatchObject({
            id: 7,
            title: 'Prompt 7',
            cardPreviewVideoUrl: '/content/prompts/media/prompt-7.card.mp4',
        });
        expect(mockQueryOne).toHaveBeenCalledTimes(2);

        await expect(trackCopy(7)).resolves.toBe(true);
        await expect(getPromptById(7)).resolves.toMatchObject({ id: 7, title: 'Prompt 7' });

        expect(mockQueryOne).toHaveBeenCalledTimes(3);
    });

    it('loads top and related prompt reads directly', async () => {
        const { getTopPrompts, getRelatedPrompts, trackCopy } = await import('@/lib/services/prompt-service');

        await expect(getTopPrompts(6)).resolves.toHaveLength(1);
        await expect(getTopPrompts(6)).resolves.toHaveLength(1);
        await expect(getRelatedPrompts('multimodal-prompts', 99, 6)).resolves.toHaveLength(1);
        await expect(getRelatedPrompts('multimodal-prompts', 99, 6)).resolves.toHaveLength(1);

        expect(mockQuery).toHaveBeenCalledTimes(4);

        await expect(trackCopy(7)).resolves.toBe(true);
        await expect(getTopPrompts(6)).resolves.toHaveLength(1);
        await expect(getRelatedPrompts('multimodal-prompts', 99, 6)).resolves.toHaveLength(1);

        expect(mockQuery).toHaveBeenCalledTimes(6);
    });
});
