import { afterEach, describe, expect, it, vi } from 'vitest';

describe('r2 article client', () => {
    const originalAccountId = process.env.KNOWLEDGE_R2_ACCOUNT_ID;
    const originalAccessKeyId = process.env.KNOWLEDGE_R2_ACCESS_KEY_ID;
    const originalSecretAccessKey = process.env.KNOWLEDGE_R2_SECRET_ACCESS_KEY;
    const originalLegacyAccountId = process.env.R2_ACCOUNT_ID;
    const originalLegacyAccessKeyId = process.env.R2_ACCESS_KEY_ID;
    const originalLegacySecretAccessKey = process.env.R2_SECRET_ACCESS_KEY;

    afterEach(() => {
        if (originalAccountId === undefined) delete process.env.KNOWLEDGE_R2_ACCOUNT_ID;
        else process.env.KNOWLEDGE_R2_ACCOUNT_ID = originalAccountId;

        if (originalAccessKeyId === undefined) delete process.env.KNOWLEDGE_R2_ACCESS_KEY_ID;
        else process.env.KNOWLEDGE_R2_ACCESS_KEY_ID = originalAccessKeyId;

        if (originalSecretAccessKey === undefined) delete process.env.KNOWLEDGE_R2_SECRET_ACCESS_KEY;
        else process.env.KNOWLEDGE_R2_SECRET_ACCESS_KEY = originalSecretAccessKey;

        if (originalLegacyAccountId === undefined) delete process.env.R2_ACCOUNT_ID;
        else process.env.R2_ACCOUNT_ID = originalLegacyAccountId;

        if (originalLegacyAccessKeyId === undefined) delete process.env.R2_ACCESS_KEY_ID;
        else process.env.R2_ACCESS_KEY_ID = originalLegacyAccessKeyId;

        if (originalLegacySecretAccessKey === undefined) delete process.env.R2_SECRET_ACCESS_KEY;
        else process.env.R2_SECRET_ACCESS_KEY = originalLegacySecretAccessKey;

        vi.unstubAllGlobals();
        vi.clearAllMocks();
        vi.resetModules();
    });

    it('reads an R2 object as UTF-8 text through the S3-compatible endpoint', async () => {
        process.env.KNOWLEDGE_R2_ACCOUNT_ID = 'account-id';
        process.env.KNOWLEDGE_R2_ACCESS_KEY_ID = 'access-key';
        process.env.KNOWLEDGE_R2_SECRET_ACCESS_KEY = 'secret-key';

        vi.stubGlobal('fetch', vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
            expect(String(url)).toBe('https://account-id.r2.cloudflarestorage.com/knowledge-articles/ai/manifest.json');
            expect(init?.method).toBe('GET');
            return new Response('{"articles":[]}', { status: 200 });
        }));

        const { readR2ObjectText } = await import('@/lib/articles/r2-client');
        await expect(readR2ObjectText('knowledge-articles', 'ai/manifest.json')).resolves.toBe('{"articles":[]}');
    });

    it('falls back to legacy R2 credential env names', async () => {
        delete process.env.KNOWLEDGE_R2_ACCOUNT_ID;
        delete process.env.KNOWLEDGE_R2_ACCESS_KEY_ID;
        delete process.env.KNOWLEDGE_R2_SECRET_ACCESS_KEY;
        process.env.R2_ACCOUNT_ID = 'legacy-account-id';
        process.env.R2_ACCESS_KEY_ID = 'legacy-access-key';
        process.env.R2_SECRET_ACCESS_KEY = 'legacy-secret-key';

        const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
            expect(String(url)).toBe('https://legacy-account-id.r2.cloudflarestorage.com/knowledge-articles/ai/manifest.json');
            expect(String((init?.headers as Record<string, string>).authorization)).toContain('Credential=legacy-access-key/');
            return new Response('{"articles":[]}', { status: 200 });
        });
        vi.stubGlobal('fetch', fetchMock);

        const { readR2ObjectText } = await import('@/lib/articles/r2-client');
        await expect(readR2ObjectText('knowledge-articles', 'ai/manifest.json')).resolves.toBe('{"articles":[]}');
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('fails clearly when R2 credentials are missing', async () => {
        delete process.env.KNOWLEDGE_R2_ACCOUNT_ID;
        delete process.env.KNOWLEDGE_R2_ACCESS_KEY_ID;
        delete process.env.KNOWLEDGE_R2_SECRET_ACCESS_KEY;
        delete process.env.R2_ACCOUNT_ID;
        delete process.env.R2_ACCESS_KEY_ID;
        delete process.env.R2_SECRET_ACCESS_KEY;

        const { readR2ObjectText } = await import('@/lib/articles/r2-client');
        await expect(readR2ObjectText('bucket', 'key')).rejects.toThrow(/R2 credentials/i);
    });

    it('lists R2 object keys under a prefix with S3 ListObjectsV2 pagination', async () => {
        process.env.KNOWLEDGE_R2_ACCOUNT_ID = 'account-id';
        process.env.KNOWLEDGE_R2_ACCESS_KEY_ID = 'access-key';
        process.env.KNOWLEDGE_R2_SECRET_ACCESS_KEY = 'secret-key';

        const fetchMock = vi
            .fn()
            .mockResolvedValueOnce(new Response([
                '<?xml version="1.0" encoding="UTF-8"?>',
                '<ListBucketResult>',
                '<IsTruncated>true</IsTruncated>',
                '<Contents><Key>ai/state/articles/one.json</Key><Size>1</Size></Contents>',
                '<Contents><Key>ai/state/articles/two.json</Key><Size>2</Size></Contents>',
                '<NextContinuationToken>next/page</NextContinuationToken>',
                '</ListBucketResult>',
            ].join(''), { status: 200 }))
            .mockResolvedValueOnce(new Response([
                '<?xml version="1.0" encoding="UTF-8"?>',
                '<ListBucketResult>',
                '<IsTruncated>false</IsTruncated>',
                '<Contents><Key>ai/state/articles/three.json</Key><Size>3</Size></Contents>',
                '</ListBucketResult>',
            ].join(''), { status: 200 }));
        vi.stubGlobal('fetch', fetchMock);

        const { listR2ObjectKeys } = await import('@/lib/articles/r2-client');
        await expect(listR2ObjectKeys('knowledge-articles', 'ai/state/articles/')).resolves.toEqual([
            'ai/state/articles/one.json',
            'ai/state/articles/two.json',
            'ai/state/articles/three.json',
        ]);

        expect(fetchMock).toHaveBeenNthCalledWith(
            1,
            'https://account-id.r2.cloudflarestorage.com/knowledge-articles?list-type=2&prefix=ai%2Fstate%2Farticles%2F',
            expect.objectContaining({ method: 'GET' }),
        );
        expect(fetchMock).toHaveBeenNthCalledWith(
            2,
            'https://account-id.r2.cloudflarestorage.com/knowledge-articles?continuation-token=next%2Fpage&list-type=2&prefix=ai%2Fstate%2Farticles%2F',
            expect.objectContaining({ method: 'GET' }),
        );
    });
});
