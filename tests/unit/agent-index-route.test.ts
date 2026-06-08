import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockIndexPrompt = vi.fn();
const mockIndexArticle = vi.fn();
const mockIndexAllPrompts = vi.fn();
const mockIndexAllArticles = vi.fn();
const mockIndexPromptBatch = vi.fn();

vi.mock('@/lib/services/agent-search-indexer', () => ({
    indexPrompt: mockIndexPrompt,
    indexArticle: mockIndexArticle,
    indexAllPrompts: mockIndexAllPrompts,
    indexAllArticles: mockIndexAllArticles,
    indexPromptBatch: mockIndexPromptBatch,
}));

describe('Agent index route', () => {
    const originalKnowledgeToken = process.env.KNOWLEDGE_ADMIN_TOKEN;
    const originalAdminToken = process.env.ADMIN_API_TOKEN;

    beforeEach(() => {
        vi.resetModules();
        vi.clearAllMocks();
        process.env.KNOWLEDGE_ADMIN_TOKEN = 'secret-token';
        delete process.env.ADMIN_API_TOKEN;
        mockIndexPrompt.mockResolvedValue({ type: 'prompt', id: '123', status: 'indexed' });
        mockIndexArticle.mockResolvedValue({ type: 'article', id: 'agent-workflow', status: 'indexed' });
        mockIndexAllPrompts.mockResolvedValue({ success: true, items: [] });
        mockIndexAllArticles.mockResolvedValue({ success: true, items: [] });
        mockIndexPromptBatch.mockResolvedValue({
            success: true,
            items: [{ type: 'prompt', id: '124', status: 'indexed' }],
            processed: 1,
            requestedLimit: 50,
            nextCursor: 124,
            hasMore: true,
        });
    });

    afterEach(() => {
        if (originalKnowledgeToken === undefined) delete process.env.KNOWLEDGE_ADMIN_TOKEN;
        else process.env.KNOWLEDGE_ADMIN_TOKEN = originalKnowledgeToken;
        if (originalAdminToken === undefined) delete process.env.ADMIN_API_TOKEN;
        else process.env.ADMIN_API_TOKEN = originalAdminToken;
    });

    it('rejects missing admin token', async () => {
        const { POST } = await import('@/app/api/agent/index/route');
        const response = await POST(new NextRequest('http://localhost:5046/api/agent/index', {
            method: 'POST',
            body: JSON.stringify({ type: 'prompt', id: 123 }),
        }));

        expect(response.status).toBe(401);
        expect(mockIndexPrompt).not.toHaveBeenCalled();
    });

    it('indexes a single prompt with a valid token', async () => {
        const { POST } = await import('@/app/api/agent/index/route');
        const response = await POST(new NextRequest('http://localhost:5046/api/agent/index', {
            method: 'POST',
            headers: { 'x-admin-token': 'secret-token' },
            body: JSON.stringify({ type: 'prompt', id: 123 }),
        }));
        const payload = await response.json();

        expect(response.status).toBe(200);
        expect(payload).toEqual({
            success: true,
            data: { success: true, items: [{ type: 'prompt', id: '123', status: 'indexed' }] },
        });
        expect(mockIndexPrompt).toHaveBeenCalledWith(123);
    });

    it('indexes a single article with a valid token', async () => {
        const { POST } = await import('@/app/api/agent/index/route');
        const response = await POST(new NextRequest('http://localhost:5046/api/agent/index', {
            method: 'POST',
            headers: { authorization: 'Bearer secret-token' },
            body: JSON.stringify({ type: 'article', site: 'ai', slug: 'agent-workflow' }),
        }));

        expect(response.status).toBe(200);
        expect(mockIndexArticle).toHaveBeenCalledWith('agent-workflow', { site: 'ai', force: true });
    });

    it('indexes a bounded prompt batch with a valid token', async () => {
        const { POST } = await import('@/app/api/agent/index/route');
        const response = await POST(new NextRequest('http://localhost:5046/api/agent/index', {
            method: 'POST',
            headers: { authorization: 'Bearer secret-token' },
            body: JSON.stringify({ type: 'prompt-batch', afterId: 123, limit: 50 }),
        }));
        const payload = await response.json();

        expect(response.status).toBe(200);
        expect(payload.data).toMatchObject({
            processed: 1,
            requestedLimit: 50,
            nextCursor: 124,
            hasMore: true,
        });
        expect(mockIndexPromptBatch).toHaveBeenCalledWith({ afterId: 123, limit: 50 });
    });

    it('rejects invalid payloads', async () => {
        const { POST } = await import('@/app/api/agent/index/route');
        const response = await POST(new NextRequest('http://localhost:5046/api/agent/index', {
            method: 'POST',
            headers: { 'x-admin-token': 'secret-token' },
            body: JSON.stringify({ type: 'prompt', id: -1 }),
        }));

        expect(response.status).toBe(400);
        expect(mockIndexPrompt).not.toHaveBeenCalled();
    });
});
