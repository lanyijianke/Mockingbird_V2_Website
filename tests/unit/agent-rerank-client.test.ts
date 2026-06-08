import { describe, expect, it, vi } from 'vitest';
import { createAgentRerankClient } from '@/lib/agent-search/rerank-client';

describe('createAgentRerankClient', () => {
    it('posts query and documents to the configured rerank endpoint', async () => {
        const fetch = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({
                results: [
                    { index: 1, relevance_score: 0.98 },
                    { index: 0, relevance_score: 0.77 },
                ],
            }),
        });
        const client = createAgentRerankClient({
            config: {
                enabled: true,
                name: 'siliconflow',
                endpoint: 'https://api.siliconflow.cn/v1/rerank',
                apiKey: 'key',
                model: 'Qwen/Qwen3-Reranker-8B',
                topN: 2,
            },
            fetch,
        });

        const results = await client.rerank('产品海报', ['first', 'second']);

        expect(fetch).toHaveBeenCalledWith('https://api.siliconflow.cn/v1/rerank', {
            method: 'POST',
            headers: {
                Authorization: 'Bearer key',
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: 'Qwen/Qwen3-Reranker-8B',
                query: '产品海报',
                documents: ['first', 'second'],
                top_n: 2,
            }),
        });
        expect(results).toEqual([
            { document: 'second', index: 1, score: 0.98 },
            { document: 'first', index: 0, score: 0.77 },
        ]);
    });

    it('falls back to original order when rerank fails', async () => {
        const client = createAgentRerankClient({
            config: {
                enabled: true,
                name: 'siliconflow',
                endpoint: 'https://api.siliconflow.cn/v1/rerank',
                apiKey: 'key',
                model: 'Qwen/Qwen3-Reranker-8B',
                topN: 5,
            },
            fetch: vi.fn().mockRejectedValue(new Error('network failure')),
        });

        await expect(client.rerank('产品海报', ['first', 'second'])).resolves.toEqual([
            { document: 'first', index: 0, score: 0 },
            { document: 'second', index: 1, score: 0 },
        ]);
    });
});
