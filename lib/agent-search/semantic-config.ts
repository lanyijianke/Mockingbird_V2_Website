export interface AgentSemanticDisabledConfig {
    enabled: false;
}

export interface AgentSemanticEnabledConfig {
    enabled: true;
    qdrant: {
        host: string;
        httpPort: number;
        apiKey?: string;
        https: boolean;
        collection: string;
    };
    embedding: {
        name: string;
        apiKey: string;
        baseURL: string;
        model: string;
    };
    rerank: {
        enabled: false;
    } | {
        enabled: true;
        name: string;
        endpoint: string;
        apiKey: string;
        model: string;
        topN: number;
    };
}

export type AgentSemanticConfig = AgentSemanticDisabledConfig | AgentSemanticEnabledConfig;

function truthy(value: string | undefined): boolean {
    return value === 'true' || value === '1' || value === 'yes';
}

function required(env: NodeJS.ProcessEnv | Record<string, string | undefined>, key: string): string {
    const value = env[key]?.trim();
    if (!value) throw new Error(`${key} is required when AGENT_SEMANTIC_SEARCH_ENABLED=true`);
    return value;
}

function parsePositiveInteger(value: string, key: string): number {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isInteger(parsed) || parsed <= 0) {
        throw new Error(`${key} must be a positive integer`);
    }
    return parsed;
}

function embeddingBaseUrl(endpoint: string): string {
    return endpoint.replace(/\/embeddings\/?$/, '').replace(/\/+$/, '');
}

export function loadAgentSemanticConfig(
    env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env,
): AgentSemanticConfig {
    if (!truthy(env.AGENT_SEMANTIC_SEARCH_ENABLED)) return { enabled: false };

    const collection = required(env, 'AGENT_QDRANT_COLLECTION');
    if (collection === 'mockingbird_vector_store') {
        throw new Error('AGENT_QDRANT_COLLECTION must not be mockingbird_vector_store');
    }
    if (!collection.startsWith('mockingbird_knowledge_')) {
        throw new Error('AGENT_QDRANT_COLLECTION must start with mockingbird_knowledge_');
    }

    return {
        enabled: true,
        qdrant: {
            host: required(env, 'AGENT_QDRANT_HOST'),
            httpPort: parsePositiveInteger(required(env, 'AGENT_QDRANT_HTTP_PORT'), 'AGENT_QDRANT_HTTP_PORT'),
            apiKey: env.AGENT_QDRANT_API_KEY?.trim() || undefined,
            https: truthy(env.AGENT_QDRANT_HTTPS),
            collection,
        },
        embedding: {
            name: env.AGENT_EMBEDDING_PROVIDER?.trim() || 'siliconflow',
            apiKey: required(env, 'AGENT_EMBEDDING_API_KEY'),
            baseURL: embeddingBaseUrl(required(env, 'AGENT_EMBEDDING_ENDPOINT')),
            model: required(env, 'AGENT_EMBEDDING_MODEL'),
        },
        rerank: truthy(env.AGENT_RERANK_ENABLED)
            ? {
                enabled: true,
                name: env.AGENT_RERANK_PROVIDER?.trim() || 'siliconflow',
                endpoint: required(env, 'AGENT_RERANK_ENDPOINT').replace(/\/+$/, ''),
                apiKey: required(env, 'AGENT_RERANK_API_KEY'),
                model: required(env, 'AGENT_RERANK_MODEL'),
                topN: parsePositiveInteger(env.AGENT_RERANK_TOP_N?.trim() || '5', 'AGENT_RERANK_TOP_N'),
            }
            : { enabled: false },
    };
}
