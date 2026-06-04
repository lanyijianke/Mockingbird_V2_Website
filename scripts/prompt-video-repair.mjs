#!/usr/bin/env node
import fs from 'node:fs/promises';
import fssync from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import mysql from 'mysql2/promise';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

const DEFAULT_PUBLIC_BASE = 'https://assets.zgnknowledge.online/prompts/media';
const DEFAULT_R2_PREFIX = 'prompts/media';

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
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
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

async function getConnection() {
    return mysql.createConnection({ uri: requireEnv('MYSQL_URL'), charset: 'utf8mb4' });
}

function getR2Client() {
    const accountId = requireEnv('KNOWLEDGE_R2_ACCOUNT_ID');
    return new S3Client({
        region: 'auto',
        endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
        credentials: {
            accessKeyId: requireEnv('KNOWLEDGE_R2_ACCESS_KEY_ID'),
            secretAccessKey: requireEnv('KNOWLEDGE_R2_SECRET_ACCESS_KEY'),
        },
    });
}

function getBucket() {
    return process.env.KNOWLEDGE_PROMPT_MEDIA_R2_BUCKET?.trim() || 'knowledge-articles';
}

function getR2Prefix() {
    return (process.env.KNOWLEDGE_PROMPT_MEDIA_R2_PREFIX || DEFAULT_R2_PREFIX).replace(/^\/+|\/+$/g, '');
}

function getPublicBaseUrl() {
    return (process.env.KNOWLEDGE_PROMPT_MEDIA_R2_PUBLIC_BASE_URL || DEFAULT_PUBLIC_BASE).replace(/\/+$/g, '');
}

function renderTemplate(template, source) {
    return template.replace(/\{(owner|repo|branch|file)\}/g, (_match, key) => encodeURIComponent(source[key] || (key === 'branch' ? 'main' : '')));
}

async function loadSourceConfig(sourceId) {
    const filePath = path.resolve(process.cwd(), 'content-sources/prompts', `${sourceId}.json`);
    return JSON.parse(await fs.readFile(filePath, 'utf8'));
}

function stripMarkdown(value) {
    return value
        .replace(/!\[.*?\]\(.*?\)/g, '')
        .replace(/<img\s[^>]*>/gi, '')
        .replace(/\[([^\]]+)\]\(.*?\)/g, '$1')
        .replace(/<[^>]+>/g, '')
        .replace(/\n{2,}/g, '\n')
        .trim();
}

function extractCodeBlocks(section) {
    return [...section.matchAll(/```[^\n]*\n([\s\S]*?)```/g)].map((match) => match[1].trim()).filter((block) => block.length > 5);
}

function extractImages(section) {
    return [...section.matchAll(/<img\s[^>]*src=["'](.*?)["'][^>]*>/gi)]
        .map((match) => match[1])
        .filter((url) => !url.includes('shields.io') && !url.includes('badge'));
}

function inferCloudflareVideoDownloadUrl(imageUrl) {
    try {
        const parsed = new URL(imageUrl);
        if (!parsed.hostname.endsWith('cloudflarestream.com')) return null;
        const match = parsed.pathname.match(/^\/([^/]+)\/thumbnails\//i);
        if (!match) return null;
        return `https://${parsed.hostname}/${match[1]}/downloads/default.mp4`;
    } catch {
        return null;
    }
}

function extractVideoUrls(section, imageUrls) {
    const htmlLinks = [...section.matchAll(/<a\s[^>]*href=["'](.*?\.mp4(?:\?[^"']*)?)["'][^>]*>/gi)].map((match) => match[1].trim());
    const plainLinks = [...section.matchAll(/https?:\/\/[^\s"')]+\.mp4(?:\?[^\s"')]+)?/gi)].map((match) => match[0].trim());
    const direct = [...new Set([...htmlLinks, ...plainLinks])];
    if (direct.length > 0) return direct;
    return imageUrls.map(inferCloudflareVideoDownloadUrl).filter(Boolean);
}

function extractSourceUrl(section) {
    const linked = section.match(/\*\*(?:来源|Source):\*\*\s*\[.*?\]\((.*?)\)/i);
    return linked?.[1]?.trim();
}

function parseYouMindRecords(readme, source) {
    const records = [];
    const sections = readme.split(/^###\s+/m).filter((section) => section.trim());
    for (const section of sections) {
        const lines = section.split('\n');
        const titleLine = lines[0]?.trim();
        if (!titleLine || /^(📖|📊|🤝|📄|🙏|⭐|📚|🌐|🤔|🚀|🔥|🎬|📋|🐛)/.test(titleLine)) continue;
        const body = lines.slice(1).join('\n').trim();
        const codeBlocks = extractCodeBlocks(body);
        if (codeBlocks.length === 0) continue;
        const rawTitle = titleLine.replace(/^No\.\s*\d+:\s*/i, '').trim();
        const mediaUrls = extractImages(body);
        const videoUrls = extractVideoUrls(body, mediaUrls);
        records.push({
            title: rawTitle || titleLine,
            rawTitle: rawTitle || titleLine,
            sourceUrl: extractSourceUrl(body),
            videoUrls,
            body: stripMarkdown(body).slice(0, 500),
            category: source.defaultCategory,
        });
    }
    return records;
}

async function fetchSourceRecords(sourceId) {
    const source = await loadSourceConfig(sourceId);
    const rawUrl = source.url || renderTemplate(source.rawUrlTemplate, source);
    const response = await fetch(rawUrl);
    if (!response.ok) throw new Error(`Failed to fetch ${sourceId}: ${response.status} ${response.statusText}`);
    return parseYouMindRecords(await response.text(), source);
}

async function audit(options) {
    const sourceId = String(options.source || 'yoomind-seedance-2');
    const out = path.resolve(String(options.out || '/tmp/seedance-video-repair-audit.json'));
    const parsedRecords = (await fetchSourceRecords(sourceId)).filter((record) => record.videoUrls.length > 0);
    const conn = await getConnection();
    const matches = [];
    const unmatchedParsedRecords = [];
    try {
        for (const record of parsedRecords) {
            let rows = [];
            if (record.sourceUrl) {
                [rows] = await conn.query(
                    `SELECT Id, RawTitle, SourceUrl, VideoPreviewUrl, CardPreviewVideoUrl FROM Prompts WHERE SourceUrl = ? LIMIT 2`,
                    [record.sourceUrl]
                );
            }
            if (rows.length === 0) {
                [rows] = await conn.query(
                    `SELECT Id, RawTitle, SourceUrl, VideoPreviewUrl, CardPreviewVideoUrl FROM Prompts WHERE RawTitle = ? LIMIT 2`,
                    [record.rawTitle]
                );
            }
            if (rows.length === 0) {
                unmatchedParsedRecords.push(record);
                continue;
            }
            const row = rows[0];
            matches.push({
                promptId: row.Id,
                rawTitle: row.RawTitle,
                sourceUrl: row.SourceUrl,
                videoUrl: record.videoUrls[0],
                currentVideoPreviewUrl: row.VideoPreviewUrl,
                currentCardPreviewVideoUrl: row.CardPreviewVideoUrl,
                needsVideo: !row.VideoPreviewUrl,
                needsCardPreview: !row.CardPreviewVideoUrl,
            });
        }
    } finally {
        await conn.end();
    }
    const result = {
        generatedAt: new Date().toISOString(),
        sourceId,
        parsedVideoRecords: parsedRecords.length,
        dbMatches: matches.length,
        missingVideoPreviewUrl: matches.filter((match) => match.needsVideo).length,
        alreadyHasVideoPreviewUrl: matches.filter((match) => !match.needsVideo).length,
        unmatchedParsedRecords,
        matches,
    };
    await fs.writeFile(out, JSON.stringify(result, null, 2));
    console.log(`audit complete parsedVideoRecords=${result.parsedVideoRecords} dbMatches=${result.dbMatches} missingVideoPreviewUrl=${result.missingVideoPreviewUrl} unmatchedParsedRecords=${result.unmatchedParsedRecords.length}`);
}

async function dryRun(options) {
    const auditFile = JSON.parse(await fs.readFile(path.resolve(String(options.audit || fail('--audit is required'))), 'utf8'));
    const toRepair = (auditFile.matches || []).filter((match) => match.needsVideo);
    console.log(`wouldRepair=${toRepair.length}`);
    console.log('Would not overwrite existing VideoPreviewUrl or CardPreviewVideoUrl.');
}

function stableFileName(url, suffix) {
    return `${createHash('sha256').update(url).digest('hex').slice(0, 32)}${suffix}`;
}

async function downloadToFile(url, filePath) {
    const response = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
        redirect: 'follow',
        signal: AbortSignal.timeout(120_000),
    });
    if (!response.ok) throw new Error(`download failed ${response.status}`);
    await fs.writeFile(filePath, Buffer.from(await response.arrayBuffer()));
}

async function uploadFile(client, bucket, key, filePath, contentType) {
    await client.send(new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: await fs.readFile(filePath),
        ContentType: contentType,
    }));
}

async function maybeCreatePreview(videoPath, previewPath) {
    return new Promise((resolve) => {
        const child = spawn('ffmpeg', ['-y', '-i', videoPath, '-t', '3', '-an', '-vf', 'scale=480:-2', previewPath], { stdio: 'ignore' });
        child.on('error', () => resolve(false));
        child.on('close', async (code) => {
            if (code !== 0) return resolve(false);
            try {
                await fs.access(previewPath);
                resolve(true);
            } catch {
                resolve(false);
            }
        });
    });
}

async function apply(options) {
    const auditFile = JSON.parse(await fs.readFile(path.resolve(String(options.audit || fail('--audit is required'))), 'utf8'));
    const matches = (auditFile.matches || []).filter((match) => match.needsVideo);
    const client = getR2Client();
    const bucket = getBucket();
    const conn = await getConnection();
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'prompt-video-repair-'));
    const report = { generatedAt: new Date().toISOString(), repaired: [], skipped: [], failed: [] };
    try {
        for (const match of matches) {
            const videoFileName = stableFileName(match.videoUrl, '.mp4');
            const videoPath = path.join(tempDir, videoFileName);
            const videoKey = `${getR2Prefix()}/videos/${videoFileName}`;
            const videoPublicUrl = `${getPublicBaseUrl()}/videos/${videoFileName}`;
            const previewFileName = videoFileName.replace(/\.mp4$/, '.card.mp4');
            const previewPath = path.join(tempDir, previewFileName);
            const previewKey = `${getR2Prefix()}/previews/${previewFileName}`;
            const previewPublicUrl = `${getPublicBaseUrl()}/previews/${previewFileName}`;
            try {
                await downloadToFile(match.videoUrl, videoPath);
                await uploadFile(client, bucket, videoKey, videoPath, 'video/mp4');
                const hasPreview = await maybeCreatePreview(videoPath, previewPath);
                if (hasPreview) await uploadFile(client, bucket, previewKey, previewPath, 'video/mp4');

                const [result] = await conn.execute(
                    `UPDATE Prompts
                     SET VideoPreviewUrl = COALESCE(NULLIF(VideoPreviewUrl, ''), ?),
                         CardPreviewVideoUrl = COALESCE(NULLIF(CardPreviewVideoUrl, ''), ?),
                         UpdatedAt = NOW()
                     WHERE Id = ?
                       AND (VideoPreviewUrl IS NULL OR VideoPreviewUrl = '')`,
                    [videoPublicUrl, hasPreview ? previewPublicUrl : null, match.promptId]
                );
                if (result.affectedRows === 1) {
                    report.repaired.push({ promptId: match.promptId, videoPreviewUrl: videoPublicUrl, cardPreviewVideoUrl: hasPreview ? previewPublicUrl : null });
                } else {
                    report.skipped.push({ promptId: match.promptId, reason: 'row changed or video already present' });
                }
            } catch (err) {
                report.failed.push({ promptId: match.promptId, videoUrl: match.videoUrl, error: String(err) });
            }
        }
    } finally {
        await conn.end();
        await fs.rm(tempDir, { recursive: true, force: true });
    }
    await fs.writeFile('/tmp/seedance-video-repair-report.json', JSON.stringify(report, null, 2));
    console.log(`apply complete repaired=${report.repaired.length} skipped=${report.skipped.length} failed=${report.failed.length}`);
    if (report.failed.length > 0) process.exitCode = 1;
}

function fail(message) {
    throw new Error(message);
}

async function main() {
    await loadEnv();
    const options = parseArgs(process.argv.slice(2));
    if (options.command === 'audit') return audit(options);
    if (options.command === 'dry-run') return dryRun(options);
    if (options.command === 'apply') return apply(options);
    fail('Usage: prompt-video-repair.mjs <audit|dry-run|apply>');
}

main().catch((err) => {
    console.error(err.message || err);
    process.exit(1);
});
