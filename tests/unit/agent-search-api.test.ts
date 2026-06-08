import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockQuery = vi.fn();
const mockGetPromptById = vi.fn();
const mockGetArticleBySlug = vi.fn();
const mockLoadAgentSemanticConfig = vi.fn();
const mockEmbedQuery = vi.fn();
const mockCreateOpenAiCompatibleEmbeddingProvider = vi.fn();
const mockCreateAgentEmbeddingClient = vi.fn();
const mockVectorSearch = vi.fn();
const mockCreateAgentVectorStoreFromConfig = vi.fn();
const mockRerank = vi.fn();
const mockCreateAgentRerankClient = vi.fn();

vi.mock('@/lib/db', () => ({
    query: mockQuery,
}));

vi.mock('@/lib/services/prompt-service', () => ({
    getPromptById: mockGetPromptById,
}));

vi.mock('@/lib/services/article-service', () => ({
    getArticleBySlug: mockGetArticleBySlug,
}));

vi.mock('@/lib/agent-search/semantic-config', () => ({
    loadAgentSemanticConfig: mockLoadAgentSemanticConfig,
}));

vi.mock('@/lib/agent-search/embedding-client', () => ({
    createOpenAiCompatibleEmbeddingProvider: mockCreateOpenAiCompatibleEmbeddingProvider,
    createAgentEmbeddingClient: mockCreateAgentEmbeddingClient,
}));

vi.mock('@/lib/agent-search/vector-store', () => ({
    createAgentVectorStoreFromConfig: mockCreateAgentVectorStoreFromConfig,
}));

vi.mock('@/lib/agent-search/rerank-client', () => ({
    createAgentRerankClient: mockCreateAgentRerankClient,
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
        mockLoadAgentSemanticConfig.mockReturnValue({ enabled: false });
        mockCreateOpenAiCompatibleEmbeddingProvider.mockReturnValue({ provider: 'embedding' });
        mockCreateAgentEmbeddingClient.mockReturnValue({ embedQuery: mockEmbedQuery });
        mockCreateAgentVectorStoreFromConfig.mockReturnValue({ search: mockVectorSearch });
        mockCreateAgentRerankClient.mockReturnValue({ rerank: mockRerank });
        mockEmbedQuery.mockResolvedValue([0.1, 0.2, 0.3]);
        mockVectorSearch.mockResolvedValue([]);
        mockRerank.mockImplementation(async (_query: string, documents: string[]) => (
            documents.map((document, index) => ({ document, index, score: 0 }))
        ));
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
                items: [expect.objectContaining({
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
                    assetKind: 'prompt',
                    mediaTypes: [],
                    useCases: [],
                    outputFormats: [],
                    qualitySignals: {
                        hasCover: true,
                        hasVideo: false,
                        hasExamples: false,
                        copyCount: null,
                        updatedAt: '2026-06-02T00:00:00.000Z',
                    },
                    retrievalMode: 'keyword',
                    semanticScore: 0,
                    keywordScore: expect.any(Number),
                })],
            },
        });
        expect(mockQuery.mock.calls[0][1]).toContain(20);
        expect(mockGetArticleBySlug).not.toHaveBeenCalled();
    });

    it('uses semantic vector search and rerank when configured', async () => {
        mockLoadAgentSemanticConfig.mockReturnValue({
            enabled: true,
            qdrant: {
                host: '154.222.29.185',
                httpPort: 47321,
                https: false,
                collection: 'mockingbird_knowledge_assets',
            },
            embedding: {
                name: 'siliconflow',
                apiKey: 'embedding-secret',
                baseURL: 'https://api.siliconflow.cn/v1',
                model: 'Qwen/Qwen3-Embedding-8B',
            },
            rerank: {
                enabled: true,
                name: 'siliconflow',
                endpoint: 'https://api.siliconflow.cn/v1/rerank',
                apiKey: 'rerank-secret',
                model: 'Qwen/Qwen3-Reranker-8B',
                topN: 5,
            },
        });
        mockVectorSearch.mockResolvedValue([
            {
                id: 'point-1',
                score: 0.93,
                payload: {
                    pointKey: 'knowledge:prompt:ai:456:chunk:0',
                    contentType: 'prompt',
                    site: 'ai',
                    contentId: '456',
                    text: 'A semantic poster prompt chunk.',
                },
            },
        ]);
        mockQuery
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([
                {
                    Id: 9,
                    ContentType: 'prompt',
                    ContentId: '456',
                    Site: 'ai',
                    Title: 'Semantic poster prompt',
                    Summary: 'Better semantic match.',
                    Category: 'gpt-image-2',
                    PublicUrl: 'https://zgnknowledge.online/ai/prompts/456',
                    CoverUrl: null,
                    SearchableText: 'Semantic poster prompt Better semantic match.',
                    MetadataJson: '{"assetKind":"prompt","mediaTypes":["image"],"useCases":["poster"],"outputFormats":["image"],"qualitySignals":{"hasExamples":true}}',
                    SourceUpdatedAt: '2026-06-04 00:00:00',
                    ContentHash: 'def',
                    IndexedAt: '2026-06-05 00:00:00',
                    MatchedText: 'A semantic poster prompt chunk.',
                },
            ]);
        mockRerank.mockResolvedValue([
            { document: 'Semantic poster prompt\nBetter semantic match.\nA semantic poster prompt chunk.', index: 0, score: 0.99 },
        ]);

        const { GET } = await import('@/app/api/agent/search/route');
        const response = await GET(new NextRequest('http://localhost:5046/api/agent/search?q=poster&type=prompt&limit=5&media=image'));
        const payload = await response.json();

        expect(response.status).toBe(200);
        expect(mockEmbedQuery).toHaveBeenCalledWith('poster');
        expect(mockVectorSearch).toHaveBeenCalledWith([0.1, 0.2, 0.3], expect.objectContaining({
            limit: expect.any(Number),
            filter: expect.objectContaining({
                must: expect.arrayContaining([
                    { key: 'site', match: { value: 'ai' } },
                    { key: 'contentType', match: { value: 'prompt' } },
                ]),
            }),
        }));
        expect(mockRerank).toHaveBeenCalledWith('poster', [
            'Semantic poster prompt\nBetter semantic match.\nA semantic poster prompt chunk.',
        ]);
        expect(payload.data.items[0]).toMatchObject({
            type: 'prompt',
            id: '456',
            title: 'Semantic poster prompt',
            retrievalMode: 'semantic',
            semanticScore: 0.93,
            keywordScore: 0,
        });
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
            videoPreviewUrl: 'https://assets.example/video.mp4',
            cardPreviewVideoUrl: null,
            imagesJson: JSON.stringify(['https://assets.example/example.jpg']),
            author: 'Author',
            sourceUrl: 'https://example.com',
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
            promptText: 'Prompt body',
            assetKind: 'prompt',
            mediaTypes: ['image', 'video'],
            outputFormats: ['image', 'video'],
            url: 'https://zgnknowledge.online/ai/prompts/123',
        });
        expect(payload.data.usageNotes).toEqual(expect.any(Array));
        expect(payload.data.mediaAssets).toEqual(expect.arrayContaining([
            expect.objectContaining({ type: 'image', role: 'cover', url: 'https://assets.example/cover.jpg' }),
            expect.objectContaining({ type: 'image', role: 'example', url: 'https://assets.example/example.jpg' }),
            expect.objectContaining({ type: 'video', role: 'video-preview', url: 'https://assets.example/video.mp4' }),
        ]));
    });

    it('returns article detail with maxChars applied', async () => {
        mockGetArticleBySlug.mockResolvedValue({
            id: 'article-1',
            site: 'ai',
            title: 'Agent Workflow',
            slug: 'agent-workflow',
            summary: 'Workflow summary',
            category: 'engineering',
            categoryName: '工程架构',
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
            assetKind: 'article',
            outputFormats: ['text'],
            url: 'https://zgnknowledge.online/ai/articles/agent-workflow',
        });
        expect(payload.data.mediaAssets).toEqual([]);
    });
});
