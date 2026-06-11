import { createHash, createHmac } from 'node:crypto';
import fs from 'node:fs/promises';

function sha256Hex(value) {
    return createHash('sha256').update(value).digest('hex');
}

function hmac(key, value) {
    return createHmac('sha256', key).update(value).digest();
}

function isoAmzDate(date) {
    return date.toISOString().replace(/[:-]|\.\d{3}/g, '');
}

function encodePathPart(value) {
    return encodeURIComponent(value).replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
}

function objectPath(bucket, key = '') {
    return `/${[bucket, ...key.split('/').filter(Boolean)].map(encodePathPart).join('/')}`;
}

function canonicalQuery(params) {
    return params
        .map(([name, value]) => [encodePathPart(name), encodePathPart(value)])
        .sort(([leftName, leftValue], [rightName, rightValue]) => {
            const nameComparison = leftName.localeCompare(rightName);
            return nameComparison === 0 ? leftValue.localeCompare(rightValue) : nameComparison;
        })
        .map(([name, value]) => `${name}=${value}`)
        .join('&');
}

function decodeXml(value) {
    return value
        .replaceAll('&lt;', '<')
        .replaceAll('&gt;', '>')
        .replaceAll('&quot;', '"')
        .replaceAll('&apos;', "'")
        .replaceAll('&amp;', '&');
}

function readTag(body, tagName) {
    const match = new RegExp(`<${tagName}>([\\s\\S]*?)</${tagName}>`).exec(body);
    return match?.[1] ? decodeXml(match[1]) : null;
}

function readKeys(body) {
    return [...body.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)]
        .map((match) => readTag(match[1] || '', 'Key'))
        .filter(Boolean);
}

export function createS3RestClient(options) {
    const fetchImpl = options.fetchImpl || fetch;
    const now = options.now || (() => new Date());

    async function request(method, bucket, key = '', input = {}) {
        const endpoint = new URL(options.endpoint);
        const path = objectPath(bucket, key);
        const query = input.query || '';
        const url = `${endpoint.origin}${path}${query ? `?${query}` : ''}`;
        const body = input.body || '';
        const amzDate = isoAmzDate(now());
        const dateStamp = amzDate.slice(0, 8);
        const payloadHash = sha256Hex(body);
        const credentialScope = `${dateStamp}/auto/s3/aws4_request`;
        const headers = {
            host: endpoint.host,
            'x-amz-content-sha256': payloadHash,
            'x-amz-date': amzDate,
        };
        if (input.contentType) headers['content-type'] = input.contentType;

        const signedHeaders = Object.keys(headers).sort().join(';');
        const canonicalHeaders = signedHeaders
            .split(';')
            .map((name) => `${name}:${headers[name]}\n`)
            .join('');
        const canonicalRequest = [
            method,
            path,
            query,
            canonicalHeaders,
            signedHeaders,
            payloadHash,
        ].join('\n');
        const stringToSign = [
            'AWS4-HMAC-SHA256',
            amzDate,
            credentialScope,
            sha256Hex(canonicalRequest),
        ].join('\n');
        const dateKey = hmac(`AWS4${options.secretAccessKey}`, dateStamp);
        const regionKey = hmac(dateKey, 'auto');
        const serviceKey = hmac(regionKey, 's3');
        const signingKey = hmac(serviceKey, 'aws4_request');
        const signature = createHmac('sha256', signingKey).update(stringToSign).digest('hex');
        headers.authorization = [
            `AWS4-HMAC-SHA256 Credential=${options.accessKeyId}/${credentialScope}`,
            `SignedHeaders=${signedHeaders}`,
            `Signature=${signature}`,
        ].join(', ');

        return fetchImpl(url, {
            method,
            headers,
            body: method === 'GET' || method === 'HEAD' ? undefined : body,
        });
    }

    async function expectOk(response, action, bucket, key) {
        if (response.ok) return;
        throw new Error(`object storage ${action} failed: ${response.status} ${response.statusText} ${bucket}/${key}`);
    }

    return {
        async readText(bucket, key) {
            const response = await request('GET', bucket, key);
            await expectOk(response, 'read', bucket, key);
            return response.text();
        },
        async writeObject(bucket, key, body, contentType) {
            const response = await request('PUT', bucket, key, { body, contentType });
            await expectOk(response, 'write', bucket, key);
        },
        async writeFile(bucket, key, filePath, contentType) {
            await this.writeObject(bucket, key, await fs.readFile(filePath), contentType);
        },
        async headObject(bucket, key) {
            const response = await request('HEAD', bucket, key);
            await expectOk(response, 'head', bucket, key);
            return { contentLength: Number(response.headers.get('content-length') || 0) || null };
        },
        async listKeys(bucket, prefix) {
            const keys = [];
            let continuationToken = null;
            do {
                const params = [
                    ['list-type', '2'],
                    ['prefix', prefix],
                ];
                if (continuationToken) params.push(['continuation-token', continuationToken]);
                const response = await request('GET', bucket, '', { query: canonicalQuery(params) });
                await expectOk(response, 'list', bucket, prefix);
                const body = await response.text();
                keys.push(...readKeys(body));
                continuationToken = readTag(body, 'IsTruncated') === 'true'
                    ? readTag(body, 'NextContinuationToken')
                    : null;
            } while (continuationToken);
            return keys;
        },
    };
}
