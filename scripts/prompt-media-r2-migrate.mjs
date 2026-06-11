#!/usr/bin/env node
import fs from 'node:fs/promises';
import fssync from 'node:fs';
import path from 'node:path';
import mysql from 'mysql2/promise';
import { createS3RestClient } from './s3-rest-client.mjs';

const LOCAL_PREFIX = '/content/prompts/media/';
const DEFAULT_R2_PREFIX = 'prompts/media';
const DEFAULT_PUBLIC_BASE = 'https://assets.zgnknowledge.online/prompts/media';
const BATCH_SIZE = 200;

function parseArgs(argv) {
    const [command, ...rest] = argv;
    const options = { command };
    for (const arg of rest) {
        if (!arg.startsWith('--')) continue;
        const [key, ...valueParts] = arg.slice(2).split('=');
        options[key] = valueParts.length > 0 ? valueParts.join('=') : true;
    }
    return options;
}

async function loadEnvFile(filePath) {
    if (!fssync.existsSync(filePath)) return;
    const content = await fs.readFile(filePath, 'utf8');
    for (const line of content.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
        const index = trimmed.indexOf('=');
        const key = trimmed.slice(0, index).trim();
        let value = trimmed.slice(index + 1).trim();
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
            value = value.slice(1, -1);
        }
        process.env[key] ||= value;
    }
}

async function loadEnv() {
    await loadEnvFile(path.resolve(process.cwd(), '.env.local'));
    await loadEnvFile(path.resolve(process.cwd(), '.env'));
}

function requireEnv(name) {
    const value = process.env[name]?.trim();
    if (!value) throw new Error(`${name} is not configured`);
    return value;
}

function getPublicBaseUrl() {
    return (process.env.KNOWLEDGE_PROMPT_MEDIA_R2_PUBLIC_BASE_URL || DEFAULT_PUBLIC_BASE).replace(/\/+$/g, '');
}

function getR2Prefix() {
    return (process.env.KNOWLEDGE_PROMPT_MEDIA_R2_PREFIX || DEFAULT_R2_PREFIX).replace(/^\/+|\/+$/g, '');
}

function localPathToR2Url(localPath) {
    if (!localPath?.startsWith(LOCAL_PREFIX)) return localPath;
    return `${getPublicBaseUrl()}/legacy/${encodeURIComponent(path.basename(localPath))}`;
}

function replaceLocalMediaUrls(value) {
    if (!value || typeof value !== 'string') return value;
    return value.replaceAll(LOCAL_PREFIX, `${getPublicBaseUrl()}/legacy/`);
}

function extractLocalMediaRefs(value) {
    if (!value || typeof value !== 'string') return [];
    const refs = new Set();
    const regex = /\/content\/prompts\/media\/[^"',)\]\s]+/g;
    for (const match of value.matchAll(regex)) refs.add(match[0]);
    return [...refs];
}

async function getConnection() {
    const uri = requireEnv('MYSQL_URL');
    return mysql.createConnection({ uri, charset: 'utf8mb4' });
}

async function getR2Client() {
    const accountId = requireEnv('KNOWLEDGE_R2_ACCOUNT_ID');
    return createS3RestClient({
        endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
        accessKeyId: requireEnv('KNOWLEDGE_R2_ACCESS_KEY_ID'),
        secretAccessKey: requireEnv('KNOWLEDGE_R2_SECRET_ACCESS_KEY'),
    });
}

function getBucket() {
    return process.env.KNOWLEDGE_PROMPT_MEDIA_R2_BUCKET?.trim() || 'knowledge-articles';
}

function getContentType(fileName) {
    const ext = path.extname(fileName).toLowerCase();
    if (ext === '.webp') return 'image/webp';
    if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
    if (ext === '.png') return 'image/png';
    if (ext === '.mp4') return 'video/mp4';
    return 'application/octet-stream';
}

async function listFiles(mediaDir) {
    const entries = await fs.readdir(mediaDir, { withFileTypes: true });
    const files = [];
    for (const entry of entries) {
        if (!entry.isFile()) continue;
        const filePath = path.join(mediaDir, entry.name);
        const stat = await fs.stat(filePath);
        files.push({ fileName: entry.name, absolutePath: filePath, bytes: stat.size, extension: path.extname(entry.name).toLowerCase() || '(none)' });
    }
    return files;
}

async function loadPromptRows(conn) {
    const [rows] = await conn.query(
        `SELECT Id, CoverImageUrl, VideoPreviewUrl, CardPreviewVideoUrl, ImagesJson
         FROM Prompts
         WHERE CoverImageUrl LIKE '/content/prompts/media/%'
            OR VideoPreviewUrl LIKE '/content/prompts/media/%'
            OR CardPreviewVideoUrl LIKE '/content/prompts/media/%'
            OR ImagesJson LIKE '%/content/prompts/media/%'`
    );
    return rows;
}

async function audit(options) {
    const mediaDir = path.resolve(String(options['media-dir'] || process.env.PROMPT_MEDIA_LOCAL_FALLBACK_DIR || './public/content/prompts/media'));
    const out = options.out ? path.resolve(String(options.out)) : null;
    const conn = await getConnection();
    try {
        const [statsRows] = await conn.query(
            `SELECT COUNT(*) AS prompts,
                    SUM(CoverImageUrl IS NOT NULL AND CoverImageUrl <> '') AS coverCount,
                    SUM(VideoPreviewUrl IS NOT NULL AND VideoPreviewUrl <> '') AS videoCount,
                    SUM(CardPreviewVideoUrl IS NOT NULL AND CardPreviewVideoUrl <> '') AS cardVideoCount,
                    SUM(ImagesJson IS NOT NULL AND ImagesJson <> '') AS imagesJsonCount
             FROM Prompts`
        );
        const rows = await loadPromptRows(conn);
        const files = await listFiles(mediaDir);
        const fileMap = new Map(files.map((file) => [file.fileName, file]));
        const refs = new Map();

        for (const row of rows) {
            for (const field of ['CoverImageUrl', 'VideoPreviewUrl', 'CardPreviewVideoUrl', 'ImagesJson']) {
                for (const localPath of extractLocalMediaRefs(row[field])) {
                    const fileName = path.basename(localPath);
                    const ref = refs.get(fileName) || {
                        fileName,
                        localPath,
                        r2Url: localPathToR2Url(localPath),
                        fields: [],
                        promptIds: [],
                    };
                    if (!ref.fields.includes(field)) ref.fields.push(field);
                    if (!ref.promptIds.includes(row.Id)) ref.promptIds.push(row.Id);
                    refs.set(fileName, ref);
                }
            }
        }

        const referencedNames = new Set(refs.keys());
        const byExtension = {};
        let totalBytes = 0;
        for (const file of files) {
            byExtension[file.extension] = (byExtension[file.extension] || 0) + 1;
            totalBytes += file.bytes;
        }

        const result = {
            generatedAt: new Date().toISOString(),
            mediaDir,
            db: statsRows[0],
            files: { total: files.length, bytes: totalBytes, byExtension },
            references: [...refs.values()].sort((a, b) => a.fileName.localeCompare(b.fileName)),
            missingLocalFiles: [...refs.values()].filter((ref) => !fileMap.has(ref.fileName)),
            unreferencedLocalFiles: files.filter((file) => !referencedNames.has(file.fileName)).map((file) => file.fileName),
        };
        if (out) await fs.writeFile(out, JSON.stringify(result, null, 2));
        console.log(`audit complete references=${result.references.length} missingLocalFiles=${result.missingLocalFiles.length} unreferencedLocalFiles=${result.unreferencedLocalFiles.length}`);
        if (result.missingLocalFiles.length > 0) process.exitCode = 2;
    } finally {
        await conn.end();
    }
}

async function readJson(filePath) {
    return JSON.parse(await fs.readFile(path.resolve(filePath), 'utf8'));
}

function legacyKey(fileName) {
    return `${getR2Prefix()}/legacy/${fileName}`;
}

function getMigrationFileNames(auditFile) {
    const names = new Set();
    for (const ref of auditFile.references || []) names.add(ref.fileName);
    for (const fileName of auditFile.unreferencedLocalFiles || []) names.add(fileName);
    return [...names].sort((a, b) => a.localeCompare(b));
}

async function upload(options) {
    const auditFile = await readJson(options.audit || fail('--audit is required'));
    if (auditFile.missingLocalFiles?.length) fail('audit has missingLocalFiles; refusing upload');
    const dryRun = Boolean(options['dry-run']);
    const referencedPartFiles = (auditFile.references || []).filter((ref) => ref.fileName.endsWith('.part'));
    const allFileNames = getMigrationFileNames(auditFile);
    const partFileNames = allFileNames.filter((fileName) => fileName.endsWith('.part'));
    const uploadFileNames = allFileNames.filter((fileName) => !fileName.endsWith('.part'));
    const uploadRefs = uploadFileNames.map((fileName) => ({ fileName }));
    const partRefs = referencedPartFiles;
    if (partRefs.length > 0) fail(`referenced .part files found: ${partRefs.map((ref) => ref.fileName).join(', ')}`);
    if (dryRun) {
        console.log(`wouldUpload=${uploadRefs.length} wouldSkipPartFiles=${partFileNames.length}`);
        return;
    }

    const client = await getR2Client();
    const bucket = getBucket();
    const report = { generatedAt: new Date().toISOString(), uploaded: [], failed: [] };
    for (const ref of uploadRefs) {
        const absolutePath = path.join(auditFile.mediaDir, ref.fileName);
        try {
            await retry(async () => client.writeFile(bucket, legacyKey(ref.fileName), absolutePath, getContentType(ref.fileName)));
            const stat = await fs.stat(absolutePath);
            report.uploaded.push({ fileName: ref.fileName, key: legacyKey(ref.fileName), bytes: stat.size });
        } catch (err) {
            report.failed.push({ fileName: ref.fileName, error: String(err) });
        }
    }
    await fs.writeFile('/tmp/prompt-media-upload-report.json', JSON.stringify(report, null, 2));
    console.log(`upload complete uploaded=${report.uploaded.length} failed=${report.failed.length}`);
    if (report.failed.length > 0) process.exitCode = 1;
}

async function verifyR2(options) {
    const auditFile = await readJson(options.audit || fail('--audit is required'));
    const client = await getR2Client();
    const bucket = getBucket();
    const missing = [];
    const mismatched = [];
    for (const fileName of getMigrationFileNames(auditFile).filter((name) => !name.endsWith('.part'))) {
        const localStat = await fs.stat(path.join(auditFile.mediaDir, fileName));
        try {
            const head = await client.headObject(bucket, legacyKey(fileName));
            if (Number(head.contentLength || 0) !== localStat.size) mismatched.push(fileName);
        } catch {
            missing.push(fileName);
        }
    }
    console.log(`verify-r2 complete missing=${missing.length} mismatched=${mismatched.length}`);
    if (missing.length || mismatched.length) {
        console.log(JSON.stringify({ missing, mismatched }, null, 2));
        process.exitCode = 1;
    }
}

async function backupDb(options) {
    const out = path.resolve(String(options.out || fail('--out is required')));
    const conn = await getConnection();
    try {
        const rows = await loadPromptRows(conn);
        await fs.writeFile(out, JSON.stringify({ generatedAt: new Date().toISOString(), rows }, null, 2));
        console.log(`backup-db complete rows=${rows.length} out=${out}`);
    } finally {
        await conn.end();
    }
}

function countUpdates(rows, replacer) {
    const counts = { rowsToUpdate: 0, coverUpdates: 0, videoUpdates: 0, cardVideoUpdates: 0, imagesJsonUpdates: 0 };
    for (const row of rows) {
        let changed = false;
        if (replacer(row.CoverImageUrl) !== row.CoverImageUrl) {
            counts.coverUpdates++;
            changed = true;
        }
        if (replacer(row.VideoPreviewUrl) !== row.VideoPreviewUrl) {
            counts.videoUpdates++;
            changed = true;
        }
        if (replacer(row.CardPreviewVideoUrl) !== row.CardPreviewVideoUrl) {
            counts.cardVideoUpdates++;
            changed = true;
        }
        if (replacer(row.ImagesJson) !== row.ImagesJson) {
            counts.imagesJsonUpdates++;
            changed = true;
        }
        if (changed) counts.rowsToUpdate++;
    }
    return counts;
}

async function dryRunDb(options) {
    const backup = await readJson(options.backup || fail('--backup is required'));
    console.log(JSON.stringify(countUpdates(backup.rows || [], replaceLocalMediaUrls), null, 2));
}

async function applyDb(options) {
    await rewriteDb(options, {
        label: 'apply-db',
        buildNext: (row) => ({
            CoverImageUrl: replaceLocalMediaUrls(row.CoverImageUrl),
            VideoPreviewUrl: replaceLocalMediaUrls(row.VideoPreviewUrl),
            CardPreviewVideoUrl: replaceLocalMediaUrls(row.CardPreviewVideoUrl),
            ImagesJson: replaceLocalMediaUrls(row.ImagesJson),
        }),
        buildExpectedCurrent: (row) => ({
            CoverImageUrl: row.CoverImageUrl,
            VideoPreviewUrl: row.VideoPreviewUrl,
            CardPreviewVideoUrl: row.CardPreviewVideoUrl,
            ImagesJson: row.ImagesJson,
        }),
    });
}

async function rollbackDb(options) {
    await rewriteDb(options, {
        label: 'rollback-db',
        buildNext: (row) => ({
            CoverImageUrl: row.CoverImageUrl,
            VideoPreviewUrl: row.VideoPreviewUrl,
            CardPreviewVideoUrl: row.CardPreviewVideoUrl,
            ImagesJson: row.ImagesJson,
        }),
        buildExpectedCurrent: (row) => ({
            CoverImageUrl: replaceLocalMediaUrls(row.CoverImageUrl),
            VideoPreviewUrl: replaceLocalMediaUrls(row.VideoPreviewUrl),
            CardPreviewVideoUrl: replaceLocalMediaUrls(row.CardPreviewVideoUrl),
            ImagesJson: replaceLocalMediaUrls(row.ImagesJson),
        }),
    });
}

async function rewriteDb(options, rewriteOptions) {
    const backup = await readJson(options.backup || fail('--backup is required'));
    const conn = await getConnection();
    let updated = 0;
    let skipped = 0;
    try {
        const rows = backup.rows || [];
        for (let i = 0; i < rows.length; i += BATCH_SIZE) {
            const batch = rows.slice(i, i + BATCH_SIZE);
            await conn.beginTransaction();
            try {
                for (const row of batch) {
                    const next = rewriteOptions.buildNext(row);
                    const expectedCurrent = rewriteOptions.buildExpectedCurrent(row);
                    const [result] = await conn.execute(
                        `UPDATE Prompts
                         SET CoverImageUrl = ?, VideoPreviewUrl = ?, CardPreviewVideoUrl = ?, ImagesJson = ?, UpdatedAt = NOW()
                         WHERE Id = ?
                           AND (CoverImageUrl <=> ?)
                           AND (VideoPreviewUrl <=> ?)
                           AND (CardPreviewVideoUrl <=> ?)
                           AND (ImagesJson <=> ?)`,
                        [
                            next.CoverImageUrl,
                            next.VideoPreviewUrl,
                            next.CardPreviewVideoUrl,
                            next.ImagesJson,
                            row.Id,
                            expectedCurrent.CoverImageUrl,
                            expectedCurrent.VideoPreviewUrl,
                            expectedCurrent.CardPreviewVideoUrl,
                            expectedCurrent.ImagesJson,
                        ]
                    );
                    if (result.affectedRows === 1) updated++;
                    else skipped++;
                }
                await conn.commit();
            } catch (err) {
                await conn.rollback();
                throw err;
            }
        }
        console.log(`${rewriteOptions.label} complete updated=${updated} skipped=${skipped}`);
    } finally {
        await conn.end();
    }
}

async function retry(fn, attempts = 3) {
    let lastError;
    for (let attempt = 1; attempt <= attempts; attempt++) {
        try {
            return await fn();
        } catch (err) {
            lastError = err;
            if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, attempt * 500));
        }
    }
    throw lastError;
}

function fail(message) {
    throw new Error(message);
}

async function main() {
    await loadEnv();
    const options = parseArgs(process.argv.slice(2));
    if (options.command === 'audit') return audit(options);
    if (options.command === 'upload') return upload(options);
    if (options.command === 'verify-r2') return verifyR2(options);
    if (options.command === 'backup-db') return backupDb(options);
    if (options.command === 'dry-run-db') return dryRunDb(options);
    if (options.command === 'apply-db') return applyDb(options);
    if (options.command === 'rollback-db') return rollbackDb(options);
    fail('Usage: prompt-media-r2-migrate.mjs <audit|upload|verify-r2|backup-db|dry-run-db|apply-db|rollback-db>');
}

main().catch((err) => {
    console.error(err.message || err);
    process.exit(1);
});
