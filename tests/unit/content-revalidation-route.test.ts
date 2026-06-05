import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const revalidateContentChange = vi.fn(() => ({
    paths: ['/ai/articles'],
    tags: ['articles'],
    warmPaths: ['/ai/articles'],
}));
const warmContentPaths = vi.fn(async () => [{ path: '/ai/articles', ok: true, status: 200 }]);

vi.mock('@/lib/cache/content-revalidation', () => ({
    revalidateContentChange,
    warmContentPaths,
}));

describe('content revalidation route', () => {
    const originalKnowledgeToken = process.env.KNOWLEDGE_ADMIN_TOKEN;
    const originalAdminToken = process.env.ADMIN_API_TOKEN;

    beforeEach(() => {
        vi.resetModules();
        vi.clearAllMocks();
        process.env.KNOWLEDGE_ADMIN_TOKEN = 'secret-token';
        delete process.env.ADMIN_API_TOKEN;
    });

    afterEach(() => {
        if (originalKnowledgeToken === undefined) delete process.env.KNOWLEDGE_ADMIN_TOKEN;
        else process.env.KNOWLEDGE_ADMIN_TOKEN = originalKnowledgeToken;
        if (originalAdminToken === undefined) delete process.env.ADMIN_API_TOKEN;
        else process.env.ADMIN_API_TOKEN = originalAdminToken;
    });

    it('rejects missing admin token', async () => {
        const { POST } = await import('@/app/api/revalidate/content/route');

        const response = await POST(new NextRequest('http://localhost:5046/api/revalidate/content', {
            method: 'POST',
            body: JSON.stringify({ type: 'article', action: 'publish', site: 'ai', slug: 'new-one' }),
        }));

        expect(response.status).toBe(401);
        expect(revalidateContentChange).not.toHaveBeenCalled();
    });

    it('revalidates valid content event with admin token', async () => {
        const { POST } = await import('@/app/api/revalidate/content/route');

        const response = await POST(new NextRequest('http://localhost:5046/api/revalidate/content', {
            method: 'POST',
            headers: { 'x-admin-token': 'secret-token' },
            body: JSON.stringify({ type: 'article', action: 'publish', site: 'ai', slug: 'new-one' }),
        }));
        const payload = await response.json();

        expect(response.status).toBe(200);
        expect(payload).toEqual({
            success: true,
            data: {
                paths: ['/ai/articles'],
                tags: ['articles'],
                warmPaths: ['/ai/articles'],
                warmup: [{ path: '/ai/articles', ok: true, status: 200 }],
            },
        });
        expect(warmContentPaths).toHaveBeenCalledWith(['/ai/articles']);
        expect(revalidateContentChange).toHaveBeenCalledWith({
            type: 'article',
            action: 'publish',
            site: 'ai',
            slug: 'new-one',
        });
    });

    it('accepts all-articles manual revalidation events', async () => {
        const { POST } = await import('@/app/api/revalidate/content/route');

        const response = await POST(new NextRequest('http://localhost:5046/api/revalidate/content', {
            method: 'POST',
            headers: { 'x-admin-token': 'secret-token' },
            body: JSON.stringify({ type: 'articles', action: 'manual' }),
        }));

        expect(response.status).toBe(200);
        expect(revalidateContentChange).toHaveBeenCalledWith({
            type: 'articles',
            action: 'manual',
        });
    });

    it('rejects unsupported event payloads', async () => {
        const { POST } = await import('@/app/api/revalidate/content/route');

        const response = await POST(new NextRequest('http://localhost:5046/api/revalidate/content', {
            method: 'POST',
            headers: { 'x-admin-token': 'secret-token' },
            body: JSON.stringify({ type: 'article', action: 'publish', site: 'unknown' }),
        }));

        expect(response.status).toBe(400);
        expect(revalidateContentChange).not.toHaveBeenCalled();
    });
});
