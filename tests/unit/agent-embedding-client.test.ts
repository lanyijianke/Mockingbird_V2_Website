import { describe, expect, it, vi } from 'vitest';
import { createAgentEmbeddingClient } from '@/lib/agent-search/embedding-client';

describe('createAgentEmbeddingClient', () => {
    it('normalizes text before embedding', async () => {
        const embedText = vi.fn().mockResolvedValue([0.1, 0.2, 0.3]);
        const client = createAgentEmbeddingClient({
            provider: { embedText },
            model: 'Qwen/Qwen3-Embedding-8B',
        });

        await expect(client.embedQuery('  产品   海报\n提示词  ')).resolves.toEqual([0.1, 0.2, 0.3]);
        expect(embedText).toHaveBeenCalledWith('产品 海报 提示词');
    });

    it('rejects empty normalized text', async () => {
        const client = createAgentEmbeddingClient({
            provider: { embedText: vi.fn() },
            model: 'Qwen/Qwen3-Embedding-8B',
        });

        await expect(client.embedQuery('   ')).rejects.toThrow('Cannot embed empty text');
    });
});
