import { describe, expect, it } from 'vitest';
import type { AgentSearchResultItem } from '@/lib/services/agent-search-types';
import { mergeHybridResults } from '@/lib/agent-search/hybrid-ranker';

function result(overrides: Partial<AgentSearchResultItem> = {}): AgentSearchResultItem {
    return {
        type: 'prompt',
        id: '1',
        site: 'ai',
        title: '产品海报提示词',
        summary: '生成商品海报',
        category: 'gpt-image-2',
        url: 'https://zgnknowledge.online/ai/prompts/1',
        coverUrl: null,
        score: 0.7,
        matchedText: '产品海报提示词',
        updatedAt: null,
        assetKind: 'prompt',
        mediaTypes: ['image'],
        useCases: ['poster'],
        outputFormats: ['image'],
        qualitySignals: {
            hasCover: false,
            hasVideo: false,
            hasExamples: true,
            copyCount: 10,
            updatedAt: null,
        },
        ...overrides,
    };
}

describe('mergeHybridResults', () => {
    it('deduplicates semantic and keyword matches by type/site/id', () => {
        const results = mergeHybridResults({
            query: '产品海报',
            semantic: [
                { contentType: 'prompt', site: 'ai', contentId: '1', semanticScore: 0.92 },
            ],
            keyword: [result()],
            semanticDetails: new Map([
                ['prompt:ai:1', result({ score: 0, matchedText: null })],
            ]),
            limit: 5,
        });

        expect(results).toHaveLength(1);
        expect(results[0]).toMatchObject({
            id: '1',
            type: 'prompt',
            retrievalMode: 'hybrid',
            semanticScore: 0.92,
            keywordScore: 0.7,
        });
        expect(results[0]!.score).toBeGreaterThan(0.8);
    });

    it('keeps semantic-only matches when public details are available', () => {
        const results = mergeHybridResults({
            query: '工作流',
            semantic: [
                { contentType: 'article', site: 'ai', contentId: 'agent-workflow', semanticScore: 0.88 },
            ],
            keyword: [],
            semanticDetails: new Map([
                ['article:ai:agent-workflow', result({
                    type: 'article',
                    id: 'agent-workflow',
                    title: 'Agent Workflow',
                    url: 'https://zgnknowledge.online/ai/articles/agent-workflow',
                    score: 0,
                    matchedText: null,
                    assetKind: 'article',
                    outputFormats: ['text'],
                })],
            ]),
            limit: 5,
        });

        expect(results).toHaveLength(1);
        expect(results[0]).toMatchObject({
            type: 'article',
            id: 'agent-workflow',
            retrievalMode: 'semantic',
            keywordScore: 0,
            semanticScore: 0.88,
        });
    });

    it('does not expose semantic candidates without public details', () => {
        const results = mergeHybridResults({
            query: 'missing',
            semantic: [
                { contentType: 'prompt', site: 'ai', contentId: 'missing', semanticScore: 0.99 },
            ],
            keyword: [],
            semanticDetails: new Map(),
            limit: 5,
        });

        expect(results).toEqual([]);
    });

    it('sorts by merged score and respects limit', () => {
        const results = mergeHybridResults({
            query: 'poster',
            semantic: [
                { contentType: 'prompt', site: 'ai', contentId: '2', semanticScore: 0.6 },
            ],
            keyword: [
                result({ id: '1', score: 0.2 }),
                result({ id: '3', score: 0.9, title: 'Strong keyword match' }),
            ],
            semanticDetails: new Map([
                ['prompt:ai:2', result({ id: '2', score: 0, title: 'Semantic match' })],
            ]),
            limit: 2,
        });

        expect(results.map((item) => item.id)).toEqual(['3', '2']);
    });
});
