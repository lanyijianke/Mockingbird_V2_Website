import { GetObjectCommand, ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3';

let cachedClient: S3Client | null = null;
let cachedSignature = '';

function getR2Client(): S3Client {
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

    cachedClient = new S3Client({
        region: 'auto',
        endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
        credentials: {
            accessKeyId,
            secretAccessKey,
        },
    });
    cachedSignature = signature;
    return cachedClient;
}

export async function readR2ObjectText(bucket: string, key: string): Promise<string> {
    const client = getR2Client();
    const response = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));

    if (!response.Body) {
        throw new Error(`R2 object has no body: ${bucket}/${key}`);
    }

    return response.Body.transformToString('utf-8');
}

export async function listR2ObjectKeys(bucket: string, prefix: string): Promise<string[]> {
    const client = getR2Client();
    const keys: string[] = [];
    let continuationToken: string | undefined;

    do {
        const response = await client.send(new ListObjectsV2Command({
            Bucket: bucket,
            Prefix: prefix,
            ContinuationToken: continuationToken,
        }));

        for (const object of response.Contents || []) {
            if (object.Key) keys.push(object.Key);
        }

        continuationToken = response.IsTruncated ? response.NextContinuationToken : undefined;
    } while (continuationToken);

    return keys;
}
