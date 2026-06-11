import { createR2S3RestClient, type S3RestClient } from '@/lib/storage/s3-rest-client';

export type PromptMediaKind = 'images' | 'videos' | 'previews' | 'legacy';

let cachedClient: S3RestClient | null = null;
let cachedSignature = '';

function getClient(): S3RestClient {
    const accountId = process.env.KNOWLEDGE_R2_ACCOUNT_ID?.trim();
    const accessKeyId = process.env.KNOWLEDGE_R2_ACCESS_KEY_ID?.trim();
    const secretAccessKey = process.env.KNOWLEDGE_R2_SECRET_ACCESS_KEY?.trim();

    if (!accountId || !accessKeyId || !secretAccessKey) {
        throw new Error('R2 credentials are not configured');
    }

    const signature = `${accountId}:${accessKeyId}:${secretAccessKey}`;
    if (cachedClient && cachedSignature === signature) return cachedClient;

    cachedClient = createR2S3RestClient({
        endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
        accessKeyId,
        secretAccessKey,
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
    const bucket = process.env.KNOWLEDGE_PROMPT_MEDIA_R2_BUCKET?.trim();
    const prefix = process.env.KNOWLEDGE_PROMPT_MEDIA_R2_PREFIX?.trim() || 'prompts/media';
    const publicBaseUrl = process.env.KNOWLEDGE_PROMPT_MEDIA_R2_PUBLIC_BASE_URL?.trim();

    if (!bucket) throw new Error('KNOWLEDGE_PROMPT_MEDIA_R2_BUCKET is not configured');
    if (!publicBaseUrl) throw new Error('KNOWLEDGE_PROMPT_MEDIA_R2_PUBLIC_BASE_URL is not configured');

    const key = joinKey(prefix, input.kind, input.fileName);
    await getClient().putObject({
        bucket,
        key,
        body: input.body,
        contentType: input.contentType,
    });

    return `${publicBaseUrl.replace(/\/+$/g, '')}/${input.kind}/${encodeURIComponent(input.fileName)}`;
}
