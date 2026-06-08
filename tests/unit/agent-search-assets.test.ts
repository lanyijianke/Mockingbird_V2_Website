import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockQuery = vi.fn();

vi.mock('@/lib/db', () => ({
    query: mockQuery,
}));

vi.mock('@/lib/services/prompt-service', () => ({
    getPromptById: vi.fn(),
}));

vi.mock('@/lib/services/article-service', () => ({
    getArticleBySlug: vi.fn(),
}));

vi.mock('@/lib/site-config', () => ({
    buildAbsoluteUrl: (pathOrUrl: string) => (
        /^https?:\/\//.test(pathOrUrl) ? pathOrUrl : `https://zgnknowledge.online${pathOrUrl}`
    ),
}));

describe('Agent asset-aware search', () => {
    beforeEach(() => {
        vi.resetModules();
        vi.clearAllMocks();
        mockQuery.mockResolvedValue([]);
    });

    it('maps indexed asset metadata into search results', async () => {
        mockQuery.mockResolvedValueOnce([
            {
                Id: 7,
                ContentType: 'prompt',
                ContentId: '123',
                Site: 'ai',
                Title: 'Product poster prompt',
                Summary: 'Create polished posters.',
                Category: 'gpt-image-2',
                PublicUrl: 'https://zgnknowledge.online/ai/prompts/123',
                CoverUrl: 'https://assets.example/cover.jpg',
                SearchableText: 'Product poster prompt Create polished posters.',
                MetadataJson: JSON.stringify({
                    assetKind: 'prompt',
                    mediaTypes: ['image', 'video'],
                    useCases: ['gpt-image-2', 'poster'],
                    outputFormats: ['image', 'video'],
                    qualitySignals: {
                        hasCover: true,
                        hasVideo: true,
                        hasExamples: true,
                        copyCount: 20,
                        updatedAt: '2026-06-02T00:00:00.000Z',
                    },
                }),
                SourceUpdatedAt: '2026-06-02 00:00:00',
                ContentHash: 'abc',
                IndexedAt: '2026-06-03 00:00:00',
                MatchedText: 'Create polished posters.',
            },
        ]);

        const { GET } = await import('@/app/api/agent/search/route');
        const response = await GET(new NextRequest('http://localhost:5046/api/agent/search?q=poster&type=prompt'));
        const payload = await response.json();

        expect(response.status).toBe(200);
        expect(payload.data.items[0]).toMatchObject({
            type: 'prompt',
            assetKind: 'prompt',
            mediaTypes: ['image', 'video'],
            useCases: ['gpt-image-2', 'poster'],
            outputFormats: ['image', 'video'],
            qualitySignals: {
                hasCover: true,
                hasVideo: true,
                hasExamples: true,
                copyCount: 20,
            },
        });
    });

    it('adds a metadata filter for video assets', async () => {
        const { GET } = await import('@/app/api/agent/search/route');
        const response = await GET(new NextRequest('http://localhost:5046/api/agent/search?q=poster&type=prompt&media=video'));

        expect(response.status).toBe(200);
        expect(mockQuery.mock.calls[0][0]).toContain('d.MetadataJson LIKE ?');
        expect(mockQuery.mock.calls[0][1]).toEqual(expect.arrayContaining(['%"video"%']));
    });

    it('adds a use case filter against searchable text and metadata', async () => {
        const { GET } = await import('@/app/api/agent/search/route');
        const response = await GET(new NextRequest('http://localhost:5046/api/agent/search?q=poster&type=prompt&useCase=%25_product'));

        expect(response.status).toBe(200);
        expect(mockQuery.mock.calls[0][0]).toContain('d.MetadataJson LIKE ?');
        expect(mockQuery.mock.calls[0][1]).toEqual(expect.arrayContaining([
            '%\\%\\_product%',
        ]));
    });
});
