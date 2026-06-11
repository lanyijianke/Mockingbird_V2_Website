import { describe, expect, it, vi } from 'vitest';

import { createR2S3RestClient } from '@/lib/storage/s3-rest-client';

describe('S3 REST client', () => {
    it('uses sorted S3 ListObjectsV2 query parameters and follows continuation tokens', async () => {
        const fetchImpl = vi
            .fn()
            .mockResolvedValueOnce(new Response([
                '<ListBucketResult>',
                '<IsTruncated>true</IsTruncated>',
                '<NextContinuationToken>token/with/slash</NextContinuationToken>',
                '<Contents><Key>prompts/media/videos/one.mp4</Key><Size>1</Size></Contents>',
                '</ListBucketResult>',
            ].join(''), { status: 200 }))
            .mockResolvedValueOnce(new Response([
                '<ListBucketResult>',
                '<IsTruncated>false</IsTruncated>',
                '<Contents><Key>prompts/media/videos/two.mp4</Key><Size>2</Size></Contents>',
                '</ListBucketResult>',
            ].join(''), { status: 200 }));

        const client = createR2S3RestClient({
            endpoint: 'https://account.r2.cloudflarestorage.com',
            accessKeyId: 'access-key',
            secretAccessKey: 'secret-key',
            fetchImpl,
            now: () => new Date('2026-06-10T00:00:00.000Z'),
        });

        await expect(client.listObjectKeys('knowledge-articles', 'prompts/media/videos/')).resolves.toEqual([
            'prompts/media/videos/one.mp4',
            'prompts/media/videos/two.mp4',
        ]);

        expect(fetchImpl).toHaveBeenNthCalledWith(
            1,
            'https://account.r2.cloudflarestorage.com/knowledge-articles?list-type=2&prefix=prompts%2Fmedia%2Fvideos%2F',
            expect.objectContaining({
                method: 'GET',
                headers: expect.objectContaining({
                    authorization: expect.stringContaining('Credential=access-key/20260610/auto/s3/aws4_request'),
                }),
            }),
        );
        expect(fetchImpl).toHaveBeenNthCalledWith(
            2,
            'https://account.r2.cloudflarestorage.com/knowledge-articles?continuation-token=token%2Fwith%2Fslash&list-type=2&prefix=prompts%2Fmedia%2Fvideos%2F',
            expect.objectContaining({ method: 'GET' }),
        );
    });
});
