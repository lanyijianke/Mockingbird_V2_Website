import { afterEach, describe, expect, it, vi } from 'vitest';

describe('R2 prompt media store', () => {
    afterEach(() => {
        delete process.env.KNOWLEDGE_R2_ACCOUNT_ID;
        delete process.env.KNOWLEDGE_R2_ACCESS_KEY_ID;
        delete process.env.KNOWLEDGE_R2_SECRET_ACCESS_KEY;
        delete process.env.KNOWLEDGE_PROMPT_MEDIA_R2_BUCKET;
        delete process.env.KNOWLEDGE_PROMPT_MEDIA_R2_PREFIX;
        delete process.env.KNOWLEDGE_PROMPT_MEDIA_R2_PUBLIC_BASE_URL;
        vi.unstubAllGlobals();
        vi.resetModules();
    });

    it('uploads prompt media through the S3-compatible R2 endpoint and returns the public URL', async () => {
        process.env.KNOWLEDGE_R2_ACCOUNT_ID = 'account-id';
        process.env.KNOWLEDGE_R2_ACCESS_KEY_ID = 'access-key';
        process.env.KNOWLEDGE_R2_SECRET_ACCESS_KEY = 'secret-key';
        process.env.KNOWLEDGE_PROMPT_MEDIA_R2_BUCKET = 'knowledge-articles';
        process.env.KNOWLEDGE_PROMPT_MEDIA_R2_PREFIX = 'prompts/media';
        process.env.KNOWLEDGE_PROMPT_MEDIA_R2_PUBLIC_BASE_URL = 'https://assets.zgnknowledge.online/prompts/media';

        const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
            expect(String(url)).toBe('https://account-id.r2.cloudflarestorage.com/knowledge-articles/prompts/media/images/cat.webp');
            expect(init?.method).toBe('PUT');
            expect(init?.headers).toMatchObject({
                'content-type': 'image/webp',
                host: 'account-id.r2.cloudflarestorage.com',
                'x-amz-content-sha256': expect.any(String),
                'x-amz-date': expect.any(String),
            });
            expect(String((init?.headers as Record<string, string>).authorization)).toContain('Credential=access-key/');
            expect(Buffer.from(init?.body as Uint8Array)).toEqual(Buffer.from('image'));
            return new Response('', { status: 200 });
        });
        vi.stubGlobal('fetch', fetchMock);

        const { uploadPromptMediaToR2 } = await import('@/lib/pipelines/r2-media-store');

        await expect(uploadPromptMediaToR2({
            kind: 'images',
            fileName: 'cat.webp',
            body: Buffer.from('image'),
            contentType: 'image/webp',
        })).resolves.toBe('https://assets.zgnknowledge.online/prompts/media/images/cat.webp');
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });
});
