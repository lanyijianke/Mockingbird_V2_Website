import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockExecute = vi.fn();
const mockQuery = vi.fn();
const mockQueryOne = vi.fn();

vi.mock('@/lib/db', () => ({
    execute: mockExecute,
    query: mockQuery,
    queryOne: mockQueryOne,
}));

const mockGetPromptById = vi.fn();
const mockGetAllPromptIds = vi.fn();

vi.mock('@/lib/services/prompt-service', () => ({
    getPromptById: mockGetPromptById,
    getAllPromptIds: mockGetAllPromptIds,
}));

const mockFetchAggregatedArticleDirectory = vi.fn();
const mockFetchArticleMarkdown = vi.fn();

vi.mock('@/lib/articles/article-directory', () => ({
    fetchAggregatedArticleDirectory: mockFetchAggregatedArticleDirectory,
    fetchArticleMarkdown: mockFetchArticleMarkdown,
}));

vi.mock('@/lib/site-config', () => ({
    buildAbsoluteUrl: (pathOrUrl: string) => (
        /^https?:\/\//.test(pathOrUrl) ? pathOrUrl : `https://zgnknowledge.online${pathOrUrl}`
    ),
}));

describe('agent search indexer', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockExecute.mockResolvedValue({ affectedRows: 1, insertId: 7 });
        mockQuery.mockResolvedValue([]);
        mockQueryOne.mockResolvedValue(null);
    });

    it('indexes prompt text into a document and chunks', async () => {
        mockGetPromptById.mockResolvedValue({
            id: 123,
            title: 'Nano Banana product poster',
            description: 'Create a polished product poster.',
            content: 'Use the product photo and generate a premium ecommerce poster.',
            category: 'nano-banana-pro',
            coverImageUrl: 'https://assets.example/cover.jpg',
            videoPreviewUrl: 'https://assets.example/video.mp4',
            cardPreviewVideoUrl: 'https://assets.example/card.mp4',
            imagesJson: JSON.stringify(['https://assets.example/example.jpg']),
            author: 'Mockingbird',
            sourceUrl: 'https://github.com/example/prompts',
            copyCount: 8,
            isActive: true,
            createdAt: '2026-06-01T00:00:00.000Z',
            updatedAt: '2026-06-02T00:00:00.000Z',
        });

        const { indexPrompt } = await import('@/lib/services/agent-search-indexer');
        const report = await indexPrompt(123);

        expect(report.status).toBe('indexed');
        const upsertSql = mockExecute.mock.calls.find(([sql]) => String(sql).includes('AgentSearchDocuments'));
        expect(upsertSql?.[1]).toEqual(expect.arrayContaining([
            'prompt',
            '123',
            'Nano Banana product poster',
            'Create a polished product poster.',
            'nano-banana-pro',
            'https://zgnknowledge.online/ai/prompts/123',
        ]));
        expect(JSON.stringify(upsertSql?.[1])).toContain('premium ecommerce poster');
        const metadata = JSON.parse(String(upsertSql?.[1]?.[9]));
        expect(metadata).toMatchObject({
            assetKind: 'prompt',
            mediaTypes: ['image', 'video'],
            outputFormats: ['image', 'video'],
            qualitySignals: {
                hasCover: true,
                hasVideo: true,
                hasExamples: true,
                copyCount: 8,
            },
            author: 'Mockingbird',
            sourceUrl: 'https://github.com/example/prompts',
            copyCount: 8,
        });
        expect(metadata.useCases).toEqual(expect.arrayContaining(['nano-banana-pro', 'poster', 'product']));
        expect(mockExecute.mock.calls.some(([sql]) => String(sql).includes('DELETE FROM AgentSearchChunks'))).toBe(true);
        expect(mockExecute.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO AgentSearchChunks'))).toBe(true);
    });

    it('indexes changed article markdown with frontmatter removed', async () => {
        mockFetchAggregatedArticleDirectory.mockResolvedValue({
            entries: [{
                id: 'article-1',
                site: 'ai',
                source: 'web-article',
                sourceType: 'r2',
                slug: 'agent-workflow',
                title: 'Agent Workflow',
                summary: 'Workflow summary',
                category: 'engineering',
                categoryName: '工程架构',
                author: '@author',
                originalUrl: 'https://example.com/source',
                sourcePlatform: 'x',
                type: 'article',
                assetBasePath: 'https://assets.example/ai/articles/published/agent-workflow',
                coverImagePath: 'images/cover.jpg',
                coverUrl: 'https://assets.example/ai/articles/published/agent-workflow/images/cover.jpg',
                contentPath: 'articles/published/agent-workflow/index.md',
                contentLocator: 'r2:bucket/key',
                contentBucket: 'bucket',
                contentKey: 'ai/articles/published/agent-workflow/index.md',
                publishedAt: '2026-06-01T00:00:00.000Z',
                updatedAt: '2026-06-03T00:00:00.000Z',
                tags: ['agent', 'workflow'],
            }],
            categoriesBySite: {},
        });
        mockFetchArticleMarkdown.mockResolvedValue(`---
title: Hidden
---

# Agent Workflow

First paragraph.

Second paragraph.`);

        const { indexArticle } = await import('@/lib/services/agent-search-indexer');
        const report = await indexArticle('agent-workflow', { site: 'ai' });

        expect(report.status).toBe('indexed');
        expect(mockFetchArticleMarkdown).toHaveBeenCalledTimes(1);
        const upsertSql = mockExecute.mock.calls.find(([sql]) => String(sql).includes('AgentSearchDocuments'));
        expect(upsertSql?.[1]).toEqual(expect.arrayContaining([
            'article',
            'agent-workflow',
            'ai',
            'Agent Workflow',
            'Workflow summary',
            'engineering',
            'https://zgnknowledge.online/ai/articles/agent-workflow',
        ]));
        expect(JSON.stringify(upsertSql?.[1])).toContain('First paragraph.');
        expect(JSON.stringify(upsertSql?.[1])).not.toContain('title: Hidden');
    });

    it('skips unchanged article before reading markdown when MySQL source timestamp matches', async () => {
        mockFetchAggregatedArticleDirectory.mockResolvedValue({
            entries: [{
                site: 'ai',
                slug: 'agent-workflow',
                title: 'Agent Workflow',
                summary: 'Workflow summary',
                category: 'engineering',
                coverUrl: null,
                publishedAt: '2026-06-01T00:00:00.000Z',
                updatedAt: '2026-06-03T00:00:00.000Z',
            }],
            categoriesBySite: {},
        });
        mockQueryOne.mockResolvedValue({
            Id: 7,
            SourceUpdatedAt: '2026-06-03 00:00:00',
            ContentHash: 'existing-hash',
        });

        const { indexArticle } = await import('@/lib/services/agent-search-indexer');
        const report = await indexArticle('agent-workflow', { site: 'ai' });

        expect(report).toEqual({
            type: 'article',
            id: 'agent-workflow',
            status: 'skipped',
            reason: 'unchanged',
        });
        expect(mockFetchArticleMarkdown).not.toHaveBeenCalled();
    });

    it('indexes prompts in a bounded batch with a next cursor', async () => {
        mockQuery.mockResolvedValueOnce([
            { Id: 101 },
            { Id: 102 },
            { Id: 103 },
        ]);
        mockGetPromptById.mockImplementation(async (id: number) => ({
            id,
            title: `Prompt ${id}`,
            description: `Description ${id}`,
            content: `Content ${id}`,
            category: 'nano-banana',
            coverImageUrl: null,
            videoPreviewUrl: null,
            cardPreviewVideoUrl: null,
            imagesJson: null,
            author: null,
            sourceUrl: null,
            copyCount: 0,
            isActive: true,
            createdAt: '2026-06-01T00:00:00.000Z',
            updatedAt: null,
        }));

        const { indexPromptBatch } = await import('@/lib/services/agent-search-indexer');
        const report = await indexPromptBatch({ afterId: 100, limit: 2 });

        expect(mockQuery.mock.calls[0][0]).toContain('Id > ?');
        expect(mockQuery.mock.calls[0][1]).toEqual([100, 3]);
        expect(report).toMatchObject({
            success: true,
            processed: 2,
            requestedLimit: 2,
            nextCursor: 102,
            hasMore: true,
        });
        expect(report.items.map((item) => item.id)).toEqual(['101', '102']);
        expect(mockGetPromptById).toHaveBeenCalledTimes(2);
    });

    it('indexes prompt backlog batches from missing or stale agent documents', async () => {
        mockQuery.mockResolvedValueOnce([
            { Id: 201 },
            { Id: 305 },
        ]);
        mockGetPromptById.mockImplementation(async (id: number) => ({
            id,
            title: `Prompt ${id}`,
            description: `Description ${id}`,
            content: `Content ${id}`,
            category: 'nano-banana',
            coverImageUrl: null,
            videoPreviewUrl: null,
            cardPreviewVideoUrl: null,
            imagesJson: null,
            author: null,
            sourceUrl: null,
            copyCount: 0,
            isActive: true,
            createdAt: '2026-06-01T00:00:00.000Z',
            updatedAt: null,
        }));

        const { indexPromptBacklogBatch } = await import('@/lib/services/agent-search-indexer');
        const report = await indexPromptBacklogBatch({ limit: 2 });

        expect(mockQuery.mock.calls[0]?.[0]).toContain('LEFT JOIN AgentSearchDocuments');
        expect(mockQuery.mock.calls[0]?.[0]).toContain('LEFT JOIN (');
        expect(mockQuery.mock.calls[0]?.[0]).toContain('AgentSearchChunks');
        expect(mockQuery.mock.calls[0]?.[0]).toContain('CONVERT(d.ContentId USING utf8mb4)');
        expect(mockQuery.mock.calls[0]?.[0]).toContain('COLLATE utf8mb4_general_ci');
        expect(mockQuery.mock.calls[0]?.[1]).toEqual([null, null, 3]);
        expect(report).toMatchObject({
            success: true,
            processed: 2,
            requestedLimit: 2,
            nextCursor: null,
            hasMore: false,
        });
        expect(report.items.map((item) => item.id)).toEqual(['201', '305']);
        expect(mockGetPromptById).toHaveBeenCalledTimes(2);
    });
});
