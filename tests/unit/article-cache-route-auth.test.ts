import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mockRevalidateContentChange = vi.fn(() => ({
    paths: ['/ai/articles'],
    tags: ['articles'],
    warmPaths: ['/ai/articles'],
}));
const mockWarmContentPaths = vi.fn(async () => [{ path: '/ai/articles', ok: true, status: 200 }]);

vi.mock('@/lib/cache/content-revalidation', () => ({
    revalidateContentChange: mockRevalidateContentChange,
    warmContentPaths: mockWarmContentPaths,
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
        const { POST } = await import('@/app/api/articles/cache/route');

        const response = await POST(new NextRequest('http://localhost:5046/api/articles/cache', {
            method: 'POST',
            headers: { authorization: 'Bearer unit-test-token' },
        }));
        const body = await response.json();

        expect(response.status).toBe(200);
        expect(body).toEqual({
            success: true,
            message: 'Article content revalidated',
            data: {
                paths: ['/ai/articles'],
                tags: ['articles'],
                warmPaths: ['/ai/articles'],
                warmup: [{ path: '/ai/articles', ok: true, status: 200 }],
            },
        });
        expect(mockRevalidateContentChange).toHaveBeenCalledWith({
            type: 'articles',
            action: 'manual',
        });
        expect(mockWarmContentPaths).toHaveBeenCalledWith(['/ai/articles']);
    });
});
