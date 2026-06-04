import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

export type PromptMediaKind = 'images' | 'videos' | 'previews' | 'legacy';

let cachedClient: S3Client | null = null;
let cachedSignature = '';

function getClient(): S3Client {
    const accountId = process.env.R2_ACCOUNT_ID?.trim();
    const accessKeyId = process.env.R2_ACCESS_KEY_ID?.trim();
    const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY?.trim();

    if (!accountId || !accessKeyId || !secretAccessKey) {
        throw new Error('R2 credentials are not configured');
    }

    const signature = `${accountId}:${accessKeyId}:${secretAccessKey}`;
    if (cachedClient && cachedSignature === signature) return cachedClient;

    cachedClient = new S3Client({
        region: 'auto',
        endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
        credentials: { accessKeyId, secretAccessKey },
    });
    cachedSignature = signature;
    return cachedClient;
}

function joinKey(...parts: string[]): string {
    return parts
        .map((part) => part.replace(/^\/+|\/+$/g, ''))
        .filter(Boolean)
        .join('/');
}

export async function uploadPromptMediaToR2(input: {
    kind: PromptMediaKind;
    fileName: string;
    body: Buffer;
    contentType: string;
}): Promise<string> {
    const bucket = process.env.PROMPT_MEDIA_R2_BUCKET?.trim();
    const prefix = process.env.PROMPT_MEDIA_R2_PREFIX?.trim() || 'prompts/media';
    const publicBaseUrl = process.env.PROMPT_MEDIA_R2_PUBLIC_BASE_URL?.trim();

    if (!bucket) throw new Error('PROMPT_MEDIA_R2_BUCKET is not configured');
    if (!publicBaseUrl) throw new Error('PROMPT_MEDIA_R2_PUBLIC_BASE_URL is not configured');

    const key = joinKey(prefix, input.kind, input.fileName);
    await getClient().send(new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: input.body,
        ContentType: input.contentType,
    }));

    return `${publicBaseUrl.replace(/\/+$/g, '')}/${input.kind}/${encodeURIComponent(input.fileName)}`;
}
