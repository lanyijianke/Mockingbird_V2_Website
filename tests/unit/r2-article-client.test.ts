import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@aws-sdk/client-s3', async () => {
    const actual = await vi.importActual<typeof import('@aws-sdk/client-s3')>('@aws-sdk/client-s3');
    return {
        ...actual,
        S3Client: vi.fn(),
    };
});

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

        vi.clearAllMocks();
        vi.resetModules();
    });

    it('reads an R2 object as UTF-8 text', async () => {
        process.env.KNOWLEDGE_R2_ACCOUNT_ID = 'account-id';
        process.env.KNOWLEDGE_R2_ACCESS_KEY_ID = 'access-key';
        process.env.KNOWLEDGE_R2_SECRET_ACCESS_KEY = 'secret-key';

        const send = vi.fn(async (command: GetObjectCommand) => {
            expect(command.input).toMatchObject({
                Bucket: 'knowledge-articles',
                Key: 'ai/manifest.json',
            });
            return {
                Body: {
                    transformToString: vi.fn(async () => '{"articles":[]}'),
                },
            };
        });

        vi.mocked(S3Client).mockImplementation(function mockS3Client() {
            return { send } as unknown as S3Client;
        });

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

        const send = vi.fn(async () => ({
            Body: {
                transformToString: vi.fn(async () => '{"articles":[]}'),
            },
        }));

        vi.mocked(S3Client).mockImplementation(function mockS3Client() {
            return { send } as unknown as S3Client;
        });

        const { readR2ObjectText } = await import('@/lib/articles/r2-client');
        await expect(readR2ObjectText('knowledge-articles', 'ai/manifest.json')).resolves.toBe('{"articles":[]}');
        expect(vi.mocked(S3Client)).toHaveBeenCalledWith(expect.objectContaining({
            endpoint: 'https://legacy-account-id.r2.cloudflarestorage.com',
            credentials: {
                accessKeyId: 'legacy-access-key',
                secretAccessKey: 'legacy-secret-key',
            },
        }));
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

    it('lists R2 object keys under a prefix', async () => {
        process.env.KNOWLEDGE_R2_ACCOUNT_ID = 'account-id';
        process.env.KNOWLEDGE_R2_ACCESS_KEY_ID = 'access-key';
        process.env.KNOWLEDGE_R2_SECRET_ACCESS_KEY = 'secret-key';

        const send = vi
            .fn()
            .mockResolvedValueOnce({
                Contents: [
                    { Key: 'ai/state/articles/one.json' },
                    { Key: 'ai/state/articles/two.json' },
                ],
                IsTruncated: true,
                NextContinuationToken: 'next-page',
            })
            .mockResolvedValueOnce({
                Contents: [{ Key: 'ai/state/articles/three.json' }],
                IsTruncated: false,
            });

        vi.mocked(S3Client).mockImplementation(function mockS3Client() {
            return { send } as unknown as S3Client;
        });

        const { listR2ObjectKeys } = await import('@/lib/articles/r2-client');
        await expect(listR2ObjectKeys('knowledge-articles', 'ai/state/articles/')).resolves.toEqual([
            'ai/state/articles/one.json',
            'ai/state/articles/two.json',
            'ai/state/articles/three.json',
        ]);

        expect(send).toHaveBeenCalledTimes(2);
    });
});
