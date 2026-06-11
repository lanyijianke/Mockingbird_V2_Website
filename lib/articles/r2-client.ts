import { createR2S3RestClient, type S3RestClient } from '@/lib/storage/s3-rest-client';

let cachedClient: S3RestClient | null = null;
let cachedSignature = '';

function getR2Client(): S3RestClient {
    const accountId = process.env.KNOWLEDGE_R2_ACCOUNT_ID?.trim() || process.env.R2_ACCOUNT_ID?.trim();
    const accessKeyId = process.env.KNOWLEDGE_R2_ACCESS_KEY_ID?.trim() || process.env.R2_ACCESS_KEY_ID?.trim();
    const secretAccessKey = process.env.KNOWLEDGE_R2_SECRET_ACCESS_KEY?.trim() || process.env.R2_SECRET_ACCESS_KEY?.trim();

    if (!accountId || !accessKeyId || !secretAccessKey) {
        throw new Error('R2 credentials are not configured');
    }

    const signature = `${accountId}:${accessKeyId}:${secretAccessKey}`;
    if (cachedClient && cachedSignature === signature) {
        return cachedClient;
    }

    cachedClient = createR2S3RestClient({
        endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
        accessKeyId,
        secretAccessKey,
    });
    cachedSignature = signature;
    return cachedClient;
}

export async function readR2ObjectText(bucket: string, key: string): Promise<string> {
    const client = getR2Client();
    return client.getObjectText(bucket, key);
}

export async function listR2ObjectKeys(bucket: string, prefix: string): Promise<string[]> {
    const client = getR2Client();
    return client.listObjectKeys(bucket, prefix);
}
