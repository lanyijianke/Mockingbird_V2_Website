import { QdrantClient } from '@qdrant/js-client-rest';
import type { AgentSemanticEnabledConfig } from './semantic-config';

export interface AgentVectorPoint {
    id: string;
    vector: number[];
    payload: Record<string, unknown>;
}

export interface AgentVectorSearchResult {
    id: string;
    score: number;
    payload: Record<string, unknown>;
}

interface QdrantClientLike {
    collectionExists?(collection: string): Promise<{ exists: boolean } | boolean>;
    createCollection?(collection: string, request: unknown): Promise<unknown>;
    upsert?(collection: string, request: unknown): Promise<unknown>;
    delete?(collection: string, request: unknown): Promise<unknown>;
    search?(collection: string, request: unknown): Promise<unknown>;
    count?(collection: string, request?: unknown): Promise<{ count?: number } | number>;
}

export interface AgentVectorStore {
    ensureCollection(vectorSize: number): Promise<void>;
    upsert(points: AgentVectorPoint[]): Promise<void>;
    deleteByDocument(contentType: string, site: string, contentId: string): Promise<void>;
    countByDocument(contentType: string, site: string, contentId: string): Promise<number>;
    search(
        vector: number[],
        options: { limit: number; scoreThreshold?: number; filter?: Record<string, unknown> },
    ): Promise<AgentVectorSearchResult[]>;
}

function assertKnowledgeCollection(collection: string): void {
    if (!collection.startsWith('mockingbird_knowledge_')) {
        throw new Error('Knowledge vector collection must start with mockingbird_knowledge_');
    }
}

function collectionExistsValue(value: { exists: boolean } | boolean): boolean {
    return typeof value === 'boolean' ? value : value.exists;
}

function asPayload(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' ? value as Record<string, unknown> : {};
}

function countValue(value: { count?: number } | number | unknown): number {
    if (typeof value === 'number') return value;
    if (value && typeof value === 'object' && 'count' in value) {
        const count = (value as { count?: unknown }).count;
        return Number(count || 0);
    }
    return 0;
}

function createQdrantClient(config: AgentSemanticEnabledConfig['qdrant']): QdrantClientLike {
    return new QdrantClient({
        host: config.host,
        port: config.httpPort,
        apiKey: config.apiKey,
        https: config.https,
        checkCompatibility: false,
    });
}

export function createAgentVectorStore(options: {
    collection: string;
    client?: QdrantClientLike;
}): AgentVectorStore {
    assertKnowledgeCollection(options.collection);
    const client = options.client ?? createQdrantClient({
        collection: options.collection,
        host: '',
        httpPort: 6333,
        https: false,
    });

    return {
        async ensureCollection(vectorSize: number): Promise<void> {
            const exists = client.collectionExists
                ? collectionExistsValue(await client.collectionExists(options.collection))
                : false;
            if (exists) return;
            if (!client.createCollection) throw new Error('Qdrant client does not support createCollection');

            await client.createCollection(options.collection, {
                vectors: { size: vectorSize, distance: 'Cosine' },
                on_disk_payload: true,
            });
        },

        async upsert(points: AgentVectorPoint[]): Promise<void> {
            if (points.length === 0) return;
            if (!client.upsert) throw new Error('Qdrant client does not support upsert');

            await client.upsert(options.collection, {
                wait: true,
                points,
            });
        },

        async deleteByDocument(contentType: string, site: string, contentId: string): Promise<void> {
            if (!client.delete) throw new Error('Qdrant client does not support delete');

            await client.delete(options.collection, {
                wait: true,
                filter: {
                    must: [
                        { key: 'contentType', match: { value: contentType } },
                        { key: 'site', match: { value: site } },
                        { key: 'contentId', match: { value: contentId } },
                    ],
                },
            });
        },

        async countByDocument(contentType: string, site: string, contentId: string): Promise<number> {
            if (!client.count) throw new Error('Qdrant client does not support count');

            const result = await client.count(options.collection, {
                exact: true,
                filter: {
                    must: [
                        { key: 'contentType', match: { value: contentType } },
                        { key: 'site', match: { value: site } },
                        { key: 'contentId', match: { value: contentId } },
                    ],
                },
            });
            return countValue(result);
        },

        async search(vector, searchOptions): Promise<AgentVectorSearchResult[]> {
            if (!client.search) throw new Error('Qdrant client does not support search');

            const request: Record<string, unknown> = {
                vector,
                limit: searchOptions.limit,
                with_payload: true,
            };
            if (searchOptions.scoreThreshold !== undefined) {
                request.score_threshold = searchOptions.scoreThreshold;
            }
            if (searchOptions.filter) {
                request.filter = searchOptions.filter;
            }

            const results = await client.search(options.collection, request);
            if (!Array.isArray(results)) return [];

            return results.map((result) => {
                const row = asPayload(result);
                return {
                    id: String(row.id),
                    score: Number(row.score ?? 0),
                    payload: asPayload(row.payload),
                };
            });
        },
    };
}

export function createAgentVectorStoreFromConfig(config: AgentSemanticEnabledConfig['qdrant']): AgentVectorStore {
    return createAgentVectorStore({
        collection: config.collection,
        client: createQdrantClient(config),
    });
}
