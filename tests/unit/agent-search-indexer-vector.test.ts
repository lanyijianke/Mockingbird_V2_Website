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

vi.mock('@/lib/services/prompt-service', () => ({
    getPromptById: mockGetPromptById,
    getAllPromptIds: vi.fn(),
}));

vi.mock('@/lib/articles/article-directory', () => ({
    fetchAggregatedArticleDirectory: vi.fn(),
    fetchArticleMarkdown: vi.fn(),
}));

vi.mock('@/lib/site-config', () => ({
    buildAbsoluteUrl: (pathOrUrl: string) => (
        /^https?:\/\//.test(pathOrUrl) ? pathOrUrl : `https://zgnknowledge.online${pathOrUrl}`
    ),
}));

const mockLoadAgentSemanticConfig = vi.fn();

vi.mock('@/lib/agent-search/semantic-config', () => ({
    loadAgentSemanticConfig: mockLoadAgentSemanticConfig,
}));

const mockEmbedChunks = vi.fn();
const mockCreateOpenAiCompatibleEmbeddingProvider = vi.fn();
const mockCreateAgentEmbeddingClient = vi.fn();

vi.mock('@/lib/agent-search/embedding-client', () => ({
    createOpenAiCompatibleEmbeddingProvider: mockCreateOpenAiCompatibleEmbeddingProvider,
    createAgentEmbeddingClient: mockCreateAgentEmbeddingClient,
}));

const mockEnsureCollection = vi.fn();
const mockDeleteByDocument = vi.fn();
const mockUpsert = vi.fn();
const mockCreateAgentVectorStoreFromConfig = vi.fn();

vi.mock('@/lib/agent-search/vector-store', () => ({
    createAgentVectorStoreFromConfig: mockCreateAgentVectorStoreFromConfig,
}));

describe('agent search indexer vector integration', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.resetModules();
        mockExecute.mockResolvedValue({ affectedRows: 1, insertId: 7 });
        mockQuery.mockResolvedValue([]);
        mockQueryOne.mockResolvedValue(null);
        mockCreateOpenAiCompatibleEmbeddingProvider.mockReturnValue({ provider: 'embedding' });
        mockCreateAgentEmbeddingClient.mockReturnValue({ embedChunks: mockEmbedChunks });
        mockCreateAgentVectorStoreFromConfig.mockReturnValue({
            ensureCollection: mockEnsureCollection,
            deleteByDocument: mockDeleteByDocument,
            upsert: mockUpsert,
        });
    });

    it('upserts Knowledge vector points after indexing a prompt when semantic search is enabled', async () => {
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
                apiKey: 'secret',
                baseURL: 'https://api.siliconflow.cn/v1',
                model: 'Qwen/Qwen3-Embedding-8B',
            },
        });
        mockEmbedChunks.mockResolvedValue([[0.1, 0.2, 0.3]]);
        mockGetPromptById.mockResolvedValue({
            id: 123,
            title: 'Nano Banana product poster',
            description: 'Create a polished product poster.',
            content: 'Use the product photo and generate a premium ecommerce poster.',
            category: 'nano-banana-pro',
            coverImageUrl: null,
            videoPreviewUrl: null,
            cardPreviewVideoUrl: null,
            imagesJson: null,
            author: 'Mockingbird',
            sourceUrl: null,
            copyCount: 8,
            isActive: true,
            createdAt: '2026-06-01T00:00:00.000Z',
            updatedAt: '2026-06-02T00:00:00.000Z',
        });

        const { indexPrompt } = await import('@/lib/services/agent-search-indexer');
        const report = await indexPrompt(123);

        expect(report.status).toBe('indexed');
        expect(mockEnsureCollection).toHaveBeenCalledWith(3);
        expect(mockDeleteByDocument).toHaveBeenCalledWith('prompt', 'ai', '123');
        expect(mockEmbedChunks).toHaveBeenCalledWith([
            'Nano Banana product poster\n\nCreate a polished product poster.\n\nUse the product photo and generate a premium ecommerce poster.',
        ]);
        expect(mockExecute.mock.calls.some(([sql, params]) => (
            String(sql).includes('UPDATE AgentSearchChunks')
            && Array.isArray(params)
            && params[0] === 'Qwen/Qwen3-Embedding-8B'
            && params[1] === 7
        ))).toBe(true);
        expect(mockUpsert).toHaveBeenCalledWith([
            expect.objectContaining({
                id: expect.stringMatching(/^[0-9a-f-]{36}$/),
                vector: [0.1, 0.2, 0.3],
                payload: expect.objectContaining({
                    pointSchema: 'agent-search-vector-v1',
                    pointKey: 'knowledge:prompt:ai:123:chunk:0',
                    contentType: 'prompt',
                    site: 'ai',
                    contentId: '123',
                    chunkIndex: 0,
                    title: 'Nano Banana product poster',
                    publicUrl: 'https://zgnknowledge.online/ai/prompts/123',
                    assetKind: 'prompt',
                }),
            }),
        ]);
    });

    it('keeps indexing keyword-only documents when semantic search is disabled', async () => {
        mockLoadAgentSemanticConfig.mockReturnValue({ enabled: false });
        mockGetPromptById.mockResolvedValue({
            id: 124,
            title: 'Keyword only prompt',
            description: 'Description',
            content: 'Content',
            category: 'general',
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
        });

        const { indexPrompt } = await import('@/lib/services/agent-search-indexer');
        const report = await indexPrompt(124);

        expect(report.status).toBe('indexed');
        expect(mockEmbedChunks).not.toHaveBeenCalled();
        expect(mockUpsert).not.toHaveBeenCalled();
    });
});
