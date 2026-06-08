import { describe, expect, it, vi } from 'vitest';
import { createAgentVectorStore } from '@/lib/agent-search/vector-store';

describe('createAgentVectorStore', () => {
    it('creates a 768-dimensional cosine collection when missing', async () => {
        const client = {
            collectionExists: vi.fn().mockResolvedValue({ exists: false }),
            createCollection: vi.fn().mockResolvedValue({}),
        };
        const store = createAgentVectorStore({
            collection: 'mockingbird_knowledge_assets',
            client,
        });

        await store.ensureCollection(768);

        expect(client.createCollection).toHaveBeenCalledWith('mockingbird_knowledge_assets', {
            vectors: { size: 768, distance: 'Cosine' },
            on_disk_payload: true,
        });
    });

    it('does not recreate an existing collection', async () => {
        const client = {
            collectionExists: vi.fn().mockResolvedValue(true),
            createCollection: vi.fn().mockResolvedValue({}),
        };
        const store = createAgentVectorStore({
            collection: 'mockingbird_knowledge_assets',
            client,
        });

        await store.ensureCollection(768);

        expect(client.createCollection).not.toHaveBeenCalled();
    });

    it('searches with payload and score threshold', async () => {
        const client = {
            search: vi.fn().mockResolvedValue([
                {
                    id: '2d7dc1e5-b19b-56e6-8c02-1376e9915e17',
                    score: 0.91,
                    payload: { pointKey: 'knowledge:prompt:ai:1:chunk:0', contentType: 'prompt', contentId: '1' },
                },
            ]),
        };
        const store = createAgentVectorStore({
            collection: 'mockingbird_knowledge_assets',
            client,
        });

        await expect(store.search([0.1, 0.2], { limit: 5, scoreThreshold: 0.25 })).resolves.toEqual([
            {
                id: '2d7dc1e5-b19b-56e6-8c02-1376e9915e17',
                score: 0.91,
                payload: { pointKey: 'knowledge:prompt:ai:1:chunk:0', contentType: 'prompt', contentId: '1' },
            },
        ]);
        expect(client.search).toHaveBeenCalledWith('mockingbird_knowledge_assets', {
            vector: [0.1, 0.2],
            limit: 5,
            with_payload: true,
            score_threshold: 0.25,
        });
    });

    it('upserts vector points in batches', async () => {
        const client = {
            upsert: vi.fn().mockResolvedValue({}),
        };
        const store = createAgentVectorStore({
            collection: 'mockingbird_knowledge_assets',
            client,
        });

        await store.upsert([
            {
                id: '2d7dc1e5-b19b-56e6-8c02-1376e9915e17',
                vector: [0.1, 0.2],
                payload: { pointKey: 'knowledge:prompt:ai:1:chunk:0', contentType: 'prompt', site: 'ai', contentId: '1' },
            },
        ]);

        expect(client.upsert).toHaveBeenCalledWith('mockingbird_knowledge_assets', {
            wait: true,
            points: [
                {
                    id: '2d7dc1e5-b19b-56e6-8c02-1376e9915e17',
                    vector: [0.1, 0.2],
                    payload: { pointKey: 'knowledge:prompt:ai:1:chunk:0', contentType: 'prompt', site: 'ai', contentId: '1' },
                },
            ],
        });
    });

    it('deletes vectors by source document identity', async () => {
        const client = {
            delete: vi.fn().mockResolvedValue({}),
        };
        const store = createAgentVectorStore({
            collection: 'mockingbird_knowledge_assets',
            client,
        });

        await store.deleteByDocument('prompt', 'ai', '1');

        expect(client.delete).toHaveBeenCalledWith('mockingbird_knowledge_assets', {
            wait: true,
            filter: {
                must: [
                    { key: 'contentType', match: { value: 'prompt' } },
                    { key: 'site', match: { value: 'ai' } },
                    { key: 'contentId', match: { value: '1' } },
                ],
            },
        });
    });

    it('counts vectors by source document identity', async () => {
        const client = {
            count: vi.fn().mockResolvedValue({ count: 3 }),
        };
        const store = createAgentVectorStore({
            collection: 'mockingbird_knowledge_assets',
            client,
        });

        await expect(store.countByDocument('prompt', 'ai', '1')).resolves.toBe(3);
        expect(client.count).toHaveBeenCalledWith('mockingbird_knowledge_assets', {
            exact: true,
            filter: {
                must: [
                    { key: 'contentType', match: { value: 'prompt' } },
                    { key: 'site', match: { value: 'ai' } },
                    { key: 'contentId', match: { value: '1' } },
                ],
            },
        });
    });

    it('rejects unsafe collection names', () => {
        expect(() => createAgentVectorStore({
            collection: 'mockingbird_vector_store',
            client: {},
        })).toThrow('Knowledge vector collection must start with mockingbird_knowledge_');
    });
});
