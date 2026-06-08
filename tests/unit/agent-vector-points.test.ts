import { describe, expect, it } from 'vitest';
import {
    buildAgentVectorPointId,
    buildAgentVectorPointKey,
    buildAgentVectorPoints,
} from '@/lib/agent-search/vector-points';

describe('agent vector points', () => {
    it('builds stable prompt point keys', () => {
        expect(buildAgentVectorPointKey({
            contentType: 'prompt',
            site: 'ai',
            contentId: '123',
            chunkIndex: 0,
        })).toBe('knowledge:prompt:ai:123:chunk:0');
    });

    it('builds stable article point keys', () => {
        expect(buildAgentVectorPointKey({
            contentType: 'article',
            site: 'ai',
            contentId: 'nano-banana-pro-guide',
            chunkIndex: 0,
        })).toBe('knowledge:article:ai:nano-banana-pro-guide:chunk:0');
    });

    it('derives Qdrant-compatible UUID point ids from stable point keys', () => {
        const identity = {
            contentType: 'prompt' as const,
            site: 'ai',
            contentId: '123',
            chunkIndex: 0,
        };

        expect(buildAgentVectorPointId(identity)).toBe(buildAgentVectorPointId(identity));
        expect(buildAgentVectorPointId(identity)).toMatch(
            /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
        );
    });

    it('rejects invalid point identity values', () => {
        expect(() => buildAgentVectorPointId({
            contentType: 'prompt',
            site: 'ai',
            contentId: 'bad/id',
            chunkIndex: 0,
        })).toThrow('Vector point contentId contains unsupported characters');
    });

    it('builds vector points with searchable payload', () => {
        const points = buildAgentVectorPoints({
            contentType: 'prompt',
            site: 'ai',
            contentId: '123',
            title: 'Product poster prompt',
            category: 'Image',
            publicUrl: 'https://example.com/ai/prompts/123',
            chunks: [
                { index: 0, text: 'Create a cinematic product poster.', hash: 'hash-0' },
                { index: 1, text: 'Add lighting and camera direction.', hash: 'hash-1' },
            ],
            embeddings: [
                [0.1, 0.2],
                [0.3, 0.4],
            ],
            metadata: {
                assetKind: 'prompt',
                mediaTypes: ['image'],
                useCases: ['poster'],
            },
        });

        expect(points).toEqual([
            {
                id: expect.stringMatching(/^[0-9a-f-]{36}$/),
                vector: [0.1, 0.2],
                payload: {
                    pointSchema: 'agent-search-vector-v1',
                    pointKey: 'knowledge:prompt:ai:123:chunk:0',
                    contentType: 'prompt',
                    site: 'ai',
                    contentId: '123',
                    chunkIndex: 0,
                    chunkHash: 'hash-0',
                    title: 'Product poster prompt',
                    category: 'Image',
                    publicUrl: 'https://example.com/ai/prompts/123',
                    text: 'Create a cinematic product poster.',
                    assetKind: 'prompt',
                    mediaTypes: ['image'],
                    useCases: ['poster'],
                },
            },
            {
                id: expect.stringMatching(/^[0-9a-f-]{36}$/),
                vector: [0.3, 0.4],
                payload: {
                    pointSchema: 'agent-search-vector-v1',
                    pointKey: 'knowledge:prompt:ai:123:chunk:1',
                    contentType: 'prompt',
                    site: 'ai',
                    contentId: '123',
                    chunkIndex: 1,
                    chunkHash: 'hash-1',
                    title: 'Product poster prompt',
                    category: 'Image',
                    publicUrl: 'https://example.com/ai/prompts/123',
                    text: 'Add lighting and camera direction.',
                    assetKind: 'prompt',
                    mediaTypes: ['image'],
                    useCases: ['poster'],
                },
            },
        ]);
    });

    it('requires one embedding per chunk', () => {
        expect(() => buildAgentVectorPoints({
            contentType: 'article',
            site: 'ai',
            contentId: 'guide',
            title: 'Guide',
            category: null,
            publicUrl: null,
            chunks: [{ index: 0, text: 'Only chunk', hash: 'hash-0' }],
            embeddings: [],
            metadata: {},
        })).toThrow('Vector point chunk count must match embedding count');
    });
});
