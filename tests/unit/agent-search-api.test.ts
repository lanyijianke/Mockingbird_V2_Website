import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockQuery = vi.fn();
const mockGetPromptById = vi.fn();
const mockGetArticleBySlug = vi.fn();

vi.mock('@/lib/db', () => ({
    query: mockQuery,
}));

vi.mock('@/lib/services/prompt-service', () => ({
    getPromptById: mockGetPromptById,
}));

vi.mock('@/lib/services/article-service', () => ({
    getArticleBySlug: mockGetArticleBySlug,
}));

vi.mock('@/lib/site-config', () => ({
    buildAbsoluteUrl: (pathOrUrl: string) => (
        /^https?:\/\//.test(pathOrUrl) ? pathOrUrl : `https://zgnknowledge.online${pathOrUrl}`
    ),
}));

describe('Agent search API', () => {
    beforeEach(() => {
        vi.resetModules();
        vi.clearAllMocks();
        mockQuery.mockResolvedValue([]);
    });

    it('rejects missing search query', async () => {
        const { GET } = await import('@/app/api/agent/search/route');
        const response = await GET(new NextRequest('http://localhost:5046/api/agent/search'));

        expect(response.status).toBe(400);
        expect(mockQuery).not.toHaveBeenCalled();
    });

    it('returns compact search results from the index', async () => {
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
                MetadataJson: '{"copyCount":20}',
                SourceUpdatedAt: '2026-06-02 00:00:00',
                ContentHash: 'abc',
                IndexedAt: '2026-06-03 00:00:00',
                MatchedText: 'Create polished posters.',
            },
        ]);

        const { GET } = await import('@/app/api/agent/search/route');
        const response = await GET(new NextRequest('http://localhost:5046/api/agent/search?q=poster&type=prompt&limit=100'));
        const payload = await response.json();

        expect(response.status).toBe(200);
        expect(payload).toEqual({
            success: true,
            data: {
                query: 'poster',
                items: [{
                    type: 'prompt',
                    id: '123',
                    site: 'ai',
                    title: 'Product poster prompt',
                    summary: 'Create polished posters.',
                    category: 'gpt-image-2',
                    url: 'https://zgnknowledge.online/ai/prompts/123',
                    coverUrl: 'https://assets.example/cover.jpg',
                    score: expect.any(Number),
                    matchedText: 'Create polished posters.',
                    updatedAt: '2026-06-02T00:00:00.000Z',
                }],
            },
        });
        expect(mockQuery.mock.calls[0][1]).toContain(20);
        expect(mockGetArticleBySlug).not.toHaveBeenCalled();
    });

    it('escapes SQL wildcard characters in search queries', async () => {
        const { GET } = await import('@/app/api/agent/search/route');
        const response = await GET(new NextRequest('http://localhost:5046/api/agent/search?q=%25_under&type=all'));

        expect(response.status).toBe(200);
        expect(mockQuery.mock.calls[0][0]).toContain("ESCAPE '\\\\'");
        expect(mockQuery.mock.calls[0][1]).toEqual(expect.arrayContaining([
            '%\\%\\_under%',
        ]));
    });

    it('returns prompt detail in agent shape', async () => {
        mockGetPromptById.mockResolvedValue({
            id: 123,
            title: 'Poster Prompt',
            description: 'Prompt summary',
            content: 'Prompt body',
            category: 'gpt-image-2',
            coverImageUrl: 'https://assets.example/cover.jpg',
            videoPreviewUrl: null,
            cardPreviewVideoUrl: null,
            author: 'Author',
            sourceUrl: 'https://example.com',
            imagesJson: null,
            copyCount: 9,
            isActive: true,
            createdAt: '2026-06-01T00:00:00.000Z',
            updatedAt: null,
        });

        const { GET } = await import('@/app/api/agent/prompts/[id]/route');
        const response = await GET(new NextRequest('http://localhost:5046/api/agent/prompts/123'), {
            params: Promise.resolve({ id: '123' }),
        });
        const payload = await response.json();

        expect(response.status).toBe(200);
        expect(payload.data).toMatchObject({
            type: 'prompt',
            id: '123',
            title: 'Poster Prompt',
            content: 'Prompt body',
            url: 'https://zgnknowledge.online/ai/prompts/123',
        });
    });

    it('returns article detail with maxChars applied', async () => {
        mockGetArticleBySlug.mockResolvedValue({
            id: 'article-1',
            site: 'ai',
            title: 'Agent Workflow',
            slug: 'agent-workflow',
            summary: 'Workflow summary',
            category: 'ai-tech',
            categoryName: 'AI技术',
            status: 1,
            coverUrl: null,
            createdAt: '2026-06-01T00:00:00.000Z',
            updatedAt: null,
            content: '1234567890',
            author: '@author',
            originalUrl: 'https://example.com',
            sourcePlatform: 'x',
            type: 'article',
        });

        const { GET } = await import('@/app/api/agent/articles/[slug]/route');
        const response = await GET(new NextRequest('http://localhost:5046/api/agent/articles/agent-workflow?site=ai&maxChars=4'), {
            params: Promise.resolve({ slug: 'agent-workflow' }),
        });
        const payload = await response.json();

        expect(response.status).toBe(200);
        expect(payload.data).toMatchObject({
            type: 'article',
            id: 'agent-workflow',
            content: '1234',
            truncated: true,
            url: 'https://zgnknowledge.online/ai/articles/agent-workflow',
        });
    });
});
