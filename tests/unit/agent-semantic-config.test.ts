import { describe, expect, it } from 'vitest';
import { loadAgentSemanticConfig } from '@/lib/agent-search/semantic-config';

describe('loadAgentSemanticConfig', () => {
    it('returns disabled config when semantic search is not enabled', () => {
        expect(loadAgentSemanticConfig({})).toEqual({ enabled: false });
    });

    it('loads enabled Qdrant and embedding config', () => {
        const config = loadAgentSemanticConfig({
            AGENT_SEMANTIC_SEARCH_ENABLED: 'true',
            AGENT_QDRANT_HOST: '154.222.29.185',
            AGENT_QDRANT_HTTP_PORT: '47321',
            AGENT_QDRANT_COLLECTION: 'mockingbird_knowledge_assets',
            AGENT_EMBEDDING_ENDPOINT: 'https://api.siliconflow.cn/v1/embeddings',
            AGENT_EMBEDDING_API_KEY: 'secret',
            AGENT_EMBEDDING_MODEL: 'Qwen/Qwen3-Embedding-8B',
        });

        expect(config).toMatchObject({
            enabled: true,
            qdrant: {
                host: '154.222.29.185',
                httpPort: 47321,
                collection: 'mockingbird_knowledge_assets',
            },
            embedding: {
                baseURL: 'https://api.siliconflow.cn/v1',
                model: 'Qwen/Qwen3-Embedding-8B',
            },
        });
    });

    it('loads rerank config when enabled', () => {
        const config = loadAgentSemanticConfig({
            AGENT_SEMANTIC_SEARCH_ENABLED: 'true',
            AGENT_QDRANT_HOST: '154.222.29.185',
            AGENT_QDRANT_HTTP_PORT: '47321',
            AGENT_QDRANT_COLLECTION: 'mockingbird_knowledge_assets',
            AGENT_EMBEDDING_ENDPOINT: 'https://api.siliconflow.cn/v1/embeddings',
            AGENT_EMBEDDING_API_KEY: 'embedding-secret',
            AGENT_EMBEDDING_MODEL: 'Qwen/Qwen3-Embedding-8B',
            AGENT_RERANK_ENABLED: 'true',
            AGENT_RERANK_PROVIDER: 'siliconflow',
            AGENT_RERANK_ENDPOINT: 'https://api.siliconflow.cn/v1/rerank',
            AGENT_RERANK_API_KEY: 'rerank-secret',
            AGENT_RERANK_MODEL: 'Qwen/Qwen3-Reranker-8B',
            AGENT_RERANK_TOP_N: '8',
        });

        expect(config).toMatchObject({
            enabled: true,
            rerank: {
                enabled: true,
                name: 'siliconflow',
                endpoint: 'https://api.siliconflow.cn/v1/rerank',
                model: 'Qwen/Qwen3-Reranker-8B',
                topN: 8,
            },
        });
    });

    it('rejects the Console collection name for Knowledge assets', () => {
        expect(() => loadAgentSemanticConfig({
            AGENT_SEMANTIC_SEARCH_ENABLED: 'true',
            AGENT_QDRANT_HOST: '154.222.29.185',
            AGENT_QDRANT_HTTP_PORT: '47321',
            AGENT_QDRANT_COLLECTION: 'mockingbird_vector_store',
            AGENT_EMBEDDING_ENDPOINT: 'https://api.siliconflow.cn/v1/embeddings',
            AGENT_EMBEDDING_API_KEY: 'secret',
            AGENT_EMBEDDING_MODEL: 'Qwen/Qwen3-Embedding-8B',
        })).toThrow('AGENT_QDRANT_COLLECTION must not be mockingbird_vector_store');
    });
});
