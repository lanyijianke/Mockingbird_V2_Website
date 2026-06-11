import { createHash, createHmac } from 'node:crypto';

export type S3RestClient = {
    getObjectText(bucket: string, key: string): Promise<string>;
    headObject(bucket: string, key: string): Promise<{ contentLength: number | null }>;
    listObjectKeys(bucket: string, prefix: string): Promise<string[]>;
    putObject(input: {
        bucket: string;
        key: string;
        body: Buffer | string;
        contentType: string;
    }): Promise<void>;
};

type S3RestClientOptions = {
    endpoint: string;
    accessKeyId: string;
    secretAccessKey: string;
    fetchImpl?: typeof fetch;
    now?: () => Date;
};

function encodePathPart(value: string): string {
    return encodeURIComponent(value).replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
}

function objectPath(bucket: string, key = ''): string {
    return `/${[bucket, ...key.split('/').filter(Boolean)].map(encodePathPart).join('/')}`;
}

function canonicalQuery(params: Array<[string, string]>): string {
    return params
        .map(([name, value]) => [encodePathPart(name), encodePathPart(value)] as const)
        .sort(([leftName, leftValue], [rightName, rightValue]) => {
            const nameComparison = leftName.localeCompare(rightName);
            return nameComparison === 0 ? leftValue.localeCompare(rightValue) : nameComparison;
        })
        .map(([name, value]) => `${name}=${value}`)
        .join('&');
}

function hashHex(value: string | Uint8Array): string {
    return createHash('sha256').update(value).digest('hex');
}

function hmac(key: string | Buffer, value: string): Buffer {
    return createHmac('sha256', key).update(value).digest();
}

function toAmzDate(date: Date): { amzDate: string; dateStamp: string } {
    const iso = date.toISOString().replace(/[:-]|\.\d{3}/g, '');
    return { amzDate: iso, dateStamp: iso.slice(0, 8) };
}

function decodeXml(value: string): string {
    return value
        .replaceAll('&lt;', '<')
        .replaceAll('&gt;', '>')
        .replaceAll('&quot;', '"')
        .replaceAll('&apos;', "'")
        .replaceAll('&amp;', '&');
}

function readTag(body: string, tagName: string): string | null {
    const match = new RegExp(`<${tagName}>([\\s\\S]*?)</${tagName}>`).exec(body);
    return match?.[1] ? decodeXml(match[1]) : null;
}

function readKeys(body: string): string[] {
    return [...body.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)]
        .map((match) => readTag(match[1] || '', 'Key'))
        .filter((key): key is string => Boolean(key));
}

export function createR2S3RestClient(options: S3RestClientOptions): S3RestClient {
    const region = 'auto';
    const service = 's3';
    const fetchImpl = options.fetchImpl ?? fetch;
    const now = options.now ?? (() => new Date());

    async function request(method: string, bucket: string, key: string, input?: {
        body?: Buffer | string;
        contentType?: string;
        query?: string;
    }): Promise<Response> {
        const body = input?.body ?? '';
        const payloadHash = hashHex(body);
        const { amzDate, dateStamp } = toAmzDate(now());
        const endpoint = new URL(options.endpoint);
        const pathname = objectPath(bucket, key);
        const query = input?.query ?? '';
        const url = `${endpoint.origin}${pathname}${query ? `?${query}` : ''}`;
        const headers: Record<string, string> = {
            host: endpoint.host,
            'x-amz-content-sha256': payloadHash,
            'x-amz-date': amzDate,
        };
        if (input?.contentType) headers['content-type'] = input.contentType;

        const signedHeaderNames = Object.keys(headers).sort();
        const canonicalHeaders = signedHeaderNames.map((name) => `${name}:${headers[name]}\n`).join('');
        const signedHeaders = signedHeaderNames.join(';');
        const canonicalRequest = [
            method,
            pathname,
            query,
            canonicalHeaders,
            signedHeaders,
            payloadHash,
        ].join('\n');
        const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
        const stringToSign = [
            'AWS4-HMAC-SHA256',
            amzDate,
            credentialScope,
            hashHex(canonicalRequest),
        ].join('\n');
        const signingKey = hmac(hmac(hmac(hmac(`AWS4${options.secretAccessKey}`, dateStamp), region), service), 'aws4_request');
        const signature = createHmac('sha256', signingKey).update(stringToSign).digest('hex');
        headers.authorization = `AWS4-HMAC-SHA256 Credential=${options.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

        const requestBody = typeof body === 'string' ? body : new Uint8Array(body);
        return fetchImpl(url, {
            method,
            headers,
            body: method === 'GET' || method === 'HEAD' ? undefined : requestBody,
        });
    }

    async function expectOk(response: Response, bucket: string, key: string): Promise<void> {
        if (response.ok) return;
        throw new Error(`S3 request failed ${response.status} ${response.statusText}: ${bucket}/${key}`);
    }

    return {
        async getObjectText(bucket, key) {
            const response = await request('GET', bucket, key);
            await expectOk(response, bucket, key);
            return response.text();
        },
        async headObject(bucket, key) {
            const response = await request('HEAD', bucket, key);
            await expectOk(response, bucket, key);
            const contentLength = response.headers.get('content-length');
            return { contentLength: contentLength ? Number(contentLength) : null };
        },
        async listObjectKeys(bucket, prefix) {
            const keys: string[] = [];
            let continuationToken: string | undefined;
            do {
                const params: Array<[string, string]> = [
                    ['list-type', '2'],
                    ['prefix', prefix],
                ];
                if (continuationToken) params.push(['continuation-token', continuationToken]);
                const response = await request('GET', bucket, '', {
                    query: canonicalQuery(params),
                });
                await expectOk(response, bucket, prefix);
                const body = await response.text();
                keys.push(...readKeys(body));
                continuationToken = readTag(body, 'IsTruncated') === 'true'
                    ? readTag(body, 'NextContinuationToken') || undefined
                    : undefined;
            } while (continuationToken);
            return keys;
        },
        async putObject(input) {
            const response = await request('PUT', input.bucket, input.key, {
                body: input.body,
                contentType: input.contentType,
            });
            await expectOk(response, input.bucket, input.key);
        },
    };
}
