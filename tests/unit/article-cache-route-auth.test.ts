import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/articles/article-directory', () => ({
    clearArticleDirectoryCache: vi.fn(),
}));

describe('article cache route auth', () => {
    const originalToken = process.env.KNOWLEDGE_ADMIN_TOKEN;

    afterEach(() => {
        if (originalToken === undefined) delete process.env.KNOWLEDGE_ADMIN_TOKEN;
        else process.env.KNOWLEDGE_ADMIN_TOKEN = originalToken;
        vi.clearAllMocks();
        vi.resetModules();
    });

    it('rejects cache refresh without an admin token', async () => {
        process.env.KNOWLEDGE_ADMIN_TOKEN = 'unit-test-token';
        const { POST } = await import('@/app/api/articles/cache/route');

        const response = await POST(new NextRequest('http://localhost:5046/api/articles/cache', { method: 'POST' }));

        expect(response.status).toBe(401);
    });

    it('clears article caches with a valid admin token', async () => {
        process.env.KNOWLEDGE_ADMIN_TOKEN = 'unit-test-token';
        const { clearArticleDirectoryCache } = await import('@/lib/articles/article-directory');
        const { POST } = await import('@/app/api/articles/cache/route');

        const response = await POST(new NextRequest('http://localhost:5046/api/articles/cache', {
            method: 'POST',
            headers: { authorization: 'Bearer unit-test-token' },
        }));
        const body = await response.json();

        expect(response.status).toBe(200);
        expect(body).toEqual({ success: true, message: 'Article cache cleared' });
        expect(clearArticleDirectoryCache).toHaveBeenCalledTimes(1);
    });
});
