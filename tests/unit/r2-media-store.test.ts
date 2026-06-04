import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@aws-sdk/client-s3', async () => {
    const actual = await vi.importActual<typeof import('@aws-sdk/client-s3')>('@aws-sdk/client-s3');
    return { ...actual, S3Client: vi.fn() };
});

describe('R2 prompt media store', () => {
    afterEach(() => {
        delete process.env.R2_ACCOUNT_ID;
        delete process.env.R2_ACCESS_KEY_ID;
        delete process.env.R2_SECRET_ACCESS_KEY;
        delete process.env.PROMPT_MEDIA_R2_BUCKET;
        delete process.env.PROMPT_MEDIA_R2_PREFIX;
        delete process.env.PROMPT_MEDIA_R2_PUBLIC_BASE_URL;
        vi.resetModules();
        vi.clearAllMocks();
    });

    it('uploads prompt media and returns the public R2 URL', async () => {
        process.env.R2_ACCOUNT_ID = 'account-id';
        process.env.R2_ACCESS_KEY_ID = 'access-key';
        process.env.R2_SECRET_ACCESS_KEY = 'secret-key';
        process.env.PROMPT_MEDIA_R2_BUCKET = 'knowledge-articles';
        process.env.PROMPT_MEDIA_R2_PREFIX = 'prompts/media';
        process.env.PROMPT_MEDIA_R2_PUBLIC_BASE_URL = 'https://assets.zgnknowledge.online/prompts/media';

        const send = vi.fn(async (command: PutObjectCommand) => {
            expect(command.input).toMatchObject({
                Bucket: 'knowledge-articles',
                Key: 'prompts/media/images/cat.webp',
                ContentType: 'image/webp',
            });
            return {};
        });
        vi.mocked(S3Client).mockImplementation(function MockS3Client() {
            return { send };
        } as unknown as typeof S3Client);

        const { uploadPromptMediaToR2 } = await import('@/lib/pipelines/r2-media-store');

        await expect(uploadPromptMediaToR2({
            kind: 'images',
            fileName: 'cat.webp',
            body: Buffer.from('image'),
            contentType: 'image/webp',
        })).resolves.toBe('https://assets.zgnknowledge.online/prompts/media/images/cat.webp');
    });
});
