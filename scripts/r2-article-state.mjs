#!/usr/bin/env node

import {
    GetObjectCommand,
    ListObjectsV2Command,
    PutObjectCommand,
    S3Client,
} from '@aws-sdk/client-s3';
import {
    listR2ArticleStateKeys,
    rollbackR2ArticleState,
    snapshotR2ArticleState,
    verifyR2ArticleState,
} from './r2-article-state-core.mjs';

const command = process.argv[2];
const args = Object.fromEntries(
    process.argv.slice(3).map((arg) => {
        const [key, ...rest] = arg.replace(/^--/, '').split('=');
        return [key, rest.join('=') || 'true'];
    }),
);

const requiredEnv = ['KNOWLEDGE_R2_ACCOUNT_ID', 'KNOWLEDGE_R2_ACCESS_KEY_ID', 'KNOWLEDGE_R2_SECRET_ACCESS_KEY'];
for (const name of requiredEnv) {
    if (!process.env[name]) {
        throw new Error(`${name} is required`);
    }
}

const client = new S3Client({
    region: 'auto',
    endpoint: `https://${process.env.KNOWLEDGE_R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
        accessKeyId: process.env.KNOWLEDGE_R2_ACCESS_KEY_ID,
        secretAccessKey: process.env.KNOWLEDGE_R2_SECRET_ACCESS_KEY,
    },
});

const r2Store = {
    async readText(bucket, key) {
        const response = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
        if (!response.Body) throw new Error(`Object has no body: ${bucket}/${key}`);
        return response.Body.transformToString('utf-8');
    },
    async writeJson(bucket, key, value) {
        await client.send(new PutObjectCommand({
            Bucket: bucket,
            Key: key,
            Body: `${JSON.stringify(value, null, 2)}\n`,
            ContentType: 'application/json; charset=utf-8',
        }));
    },
    async listKeys(bucket, prefix) {
        const keys = [];
        let ContinuationToken;

        do {
            const response = await client.send(new ListObjectsV2Command({
                Bucket: bucket,
                Prefix: prefix,
                ContinuationToken,
            }));

            for (const item of response.Contents || []) {
                if (item.Key) keys.push(item.Key);
            }

            ContinuationToken = response.NextContinuationToken;
        } while (ContinuationToken);

        return keys;
    },
};

function requireArg(name) {
    if (!args[name]) throw new Error(`--${name}=... is required`);
    return args[name];
}

function normalizePrefix(prefix) {
    return prefix.replace(/^\/+|\/+$/g, '');
}

async function verify() {
    const result = await verifyR2ArticleState(r2Store, {
        bucket: requireArg('bucket'),
        prefix: requireArg('prefix'),
    });

    if (result.missing.length > 0 || result.checksumMismatches.length > 0) {
        if (result.missing.length > 0) {
            console.error(`Missing objects:\n${result.missing.join('\n')}`);
        }
        if (result.checksumMismatches.length > 0) {
            console.error(`Checksum mismatches:\n${result.checksumMismatches.join('\n')}`);
        }
        process.exitCode = 1;
        return;
    }

    console.log(`OK: verified ${result.publishedCount} published articles`);
}

async function snapshot() {
    const snapshotKey = await snapshotR2ArticleState(r2Store, {
        bucket: requireArg('bucket'),
        prefix: requireArg('prefix'),
    });
    console.log(snapshotKey);
}

async function rollback() {
    const prefix = requireArg('prefix');
    const snapshotKey = requireArg('snapshot');
    await rollbackR2ArticleState(r2Store, {
        bucket: requireArg('bucket'),
        prefix,
        snapshotKey,
    });
    console.log(`Rolled back ${normalizePrefix(prefix)}/manifest.json to ${snapshotKey}`);
}

async function list() {
    const keys = await listR2ArticleStateKeys(r2Store, {
        bucket: requireArg('bucket'),
        prefix: requireArg('prefix'),
    });
    console.log(keys.join('\n'));
}

async function main() {
    if (command === 'verify') return verify();
    if (command === 'snapshot') return snapshot();
    if (command === 'rollback') return rollback();
    if (command === 'list') return list();

    throw new Error('Command must be one of: verify, snapshot, rollback, list');
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
