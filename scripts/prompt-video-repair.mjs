#!/usr/bin/env node
import fs from 'node:fs/promises';
import fssync from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import mysql from 'mysql2/promise';
import { createS3RestClient } from './s3-rest-client.mjs';

const DEFAULT_PUBLIC_BASE = 'https://assets.zgnknowledge.online/prompts/media';
const DEFAULT_R2_PREFIX = 'prompts/media';
const YOUMIND_VIDEO_PROMPTS_ENDPOINT = 'https://youmind.com/youmarketing-api/video-prompts';
const YOUMIND_VIDEO_MODEL_BY_CATEGORY = {
    'seedance-2': 'seedance-2.0',
};

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

function parsePositiveInt(value, fallback) {
    const parsed = Number.parseInt(String(value || ''), 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function isTruthyOption(value) {
    return value === true || value === 'true' || value === '1' || value === 'yes';
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
    return createS3RestClient({
        endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
        accessKeyId: requireEnv('KNOWLEDGE_R2_ACCESS_KEY_ID'),
        secretAccessKey: requireEnv('KNOWLEDGE_R2_SECRET_ACCESS_KEY'),
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

function getSiteUrl() {
    return (process.env.SITE_URL || 'http://localhost:5046').replace(/\/+$/g, '');
}

function getAdminToken() {
    return process.env.KNOWLEDGE_ADMIN_TOKEN?.trim() || process.env.ADMIN_API_TOKEN?.trim() || '';
}

async function requestPromptRevalidation(repairedPromptIds, options) {
    if (!isTruthyOption(options.revalidate)) return null;

    const token = getAdminToken();
    if (!token) {
        return { ok: false, status: null, error: 'admin token is not configured' };
    }

    const siteUrl = String(options['site-url'] || getSiteUrl()).replace(/\/+$/g, '');
    const shouldRevalidateDetails = isTruthyOption(options['revalidate-details']);
    const events = [{ type: 'prompt', action: 'manual' }];
    if (shouldRevalidateDetails) {
        for (const id of repairedPromptIds) events.push({ type: 'prompt', action: 'update', id });
    }

    const results = [];
    for (const event of events) {
        try {
            const response = await fetch(`${siteUrl}/api/revalidate/content`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-admin-token': token,
                },
                body: JSON.stringify(event),
                signal: AbortSignal.timeout(60_000),
            });
            results.push({
                event,
                ok: response.ok,
                status: response.status,
                body: await response.text(),
            });
        } catch (err) {
            results.push({ event, ok: false, status: null, error: String(err) });
        }
    }

    return {
        ok: results.every((result) => result.ok),
        siteUrl,
        results,
    };
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

function buildCloudflareStreamDownloadUrl(streamId, customerCode) {
    if (!streamId) return null;
    const normalizedStreamId = streamId.trim();
    if (!normalizedStreamId) return null;

    try {
        const parsed = new URL(normalizedStreamId);
        if (parsed.hostname.endsWith('cloudflarestream.com')) {
            const streamMatch = parsed.pathname.match(/^\/([^/]+)(?:\/|$)/);
            return streamMatch ? `https://${parsed.hostname}/${streamMatch[1]}/downloads/default.mp4` : null;
        }
        if (parsed.hostname.endsWith('videodelivery.net')) {
            const streamMatch = parsed.pathname.match(/^\/([^/]+)(?:\/|$)/);
            return streamMatch ? `https://videodelivery.net/${streamMatch[1]}/downloads/default.mp4` : null;
        }
    } catch {
        // streamId is usually an opaque Cloudflare Stream id, not a full URL.
    }

    return customerCode
        ? `https://customer-${customerCode}.cloudflarestream.com/${normalizedStreamId}/downloads/default.mp4`
        : `https://videodelivery.net/${normalizedStreamId}/downloads/default.mp4`;
}

function extractMp4Url(value) {
    if (!value) return null;
    return value.match(/https?:\/\/[^\s"')]+\.mp4(?:\?[^\s"')]+)?/i)?.[0] || null;
}

function inferCustomerCodeFromCloudflareUrl(value) {
    if (!value) return undefined;
    try {
        const parsed = new URL(value);
        return parsed.hostname.match(/^customer-([^.]+)\.cloudflarestream\.com$/i)?.[1];
    } catch {
        return undefined;
    }
}

function resolveYouMindVideoUrl(media) {
    const directUrl = extractMp4Url(media?.sourceUrl) || extractMp4Url(media?.caption);
    if (directUrl) return directUrl;
    return buildCloudflareStreamDownloadUrl(
        media?.streamId || '',
        media?.customerCode || inferCustomerCodeFromCloudflareUrl(media?.sourceUrl) || inferCustomerCodeFromCloudflareUrl(media?.thumbnail)
    );
}

function extractDirectVideoUrls(section) {
    const htmlLinks = [...section.matchAll(/<a\s[^>]*href=["'](.*?\.mp4(?:\?[^"']*)?)["'][^>]*>/gi)].map((match) => match[1].trim());
    const plainLinks = [...section.matchAll(/https?:\/\/[^\s"')]+\.mp4(?:\?[^\s"')]+)?/gi)].map((match) => match[0].trim());
    return [...new Set([...htmlLinks, ...plainLinks])];
}

function extractYouMindWatchIds(section) {
    return [...section.matchAll(/https?:\/\/(?:www\.)?youmind\.com\/[^\s"')]+[?&]id=(\d+)/gi)]
        .map((match) => Number.parseInt(match[1], 10))
        .filter((id) => Number.isFinite(id) && id > 0)
        .filter((id, index, ids) => ids.indexOf(id) === index);
}

function extractVideoUrls(section, imageUrls, youmindVideos = new Map(), fallbackUrl) {
    const direct = extractDirectVideoUrls(section);
    if (direct.length > 0) return direct;

    const cloudflare = imageUrls.map(inferCloudflareVideoDownloadUrl).filter(Boolean);
    if (cloudflare.length > 0) return cloudflare;

    const watchIds = extractYouMindWatchIds(section);
    const youmindUrls = watchIds.map((id) => youmindVideos.get(id)).filter(Boolean);
    if (youmindUrls.length > 0) return youmindUrls;

    if (watchIds.length > 0 && fallbackUrl && /^https?:\/\/(?:www\.)?(?:x|twitter)\.com\//i.test(fallbackUrl)) {
        return [fallbackUrl];
    }

    return [];
}

function extractSourceUrl(section) {
    const linked = section.match(/\*\*(?:来源|Source):\*\*\s*\[.*?\]\((.*?)\)/i);
    return linked?.[1]?.trim();
}

function needsYouMindVideoLookup(source, readme) {
    return Boolean(YOUMIND_VIDEO_MODEL_BY_CATEGORY[source.defaultCategory]) && /youmind\.com\/[^\s"')]+[?&]id=\d+/i.test(readme);
}

async function fetchYouMindVideoMap(source) {
    const model = YOUMIND_VIDEO_MODEL_BY_CATEGORY[source.defaultCategory];
    if (!model) return new Map();

    const locale = source.locale || 'zh-CN';
    const videoMap = new Map();
    let page = 1;
    let hasMore = true;

    while (hasMore && page <= 50) {
        const response = await fetch(YOUMIND_VIDEO_PROMPTS_ENDPOINT, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': 'Mozilla/5.0',
            },
            body: JSON.stringify({ model, page, limit: 100, locale }),
        });
        if (!response.ok) break;

        const payload = await response.json();
        for (const prompt of payload.prompts || []) {
            const promptId = typeof prompt.id === 'number' ? prompt.id : Number.parseInt(String(prompt.id || ''), 10);
            if (!Number.isFinite(promptId) || promptId <= 0) continue;

            const mediaCandidates = [
                ...(prompt.videos || []),
                prompt.media,
                prompt,
            ].filter(Boolean);
            const videoUrl = mediaCandidates
                .map((media) => resolveYouMindVideoUrl(media))
                .find(Boolean);
            if (videoUrl) videoMap.set(promptId, videoUrl);
        }

        hasMore = Boolean(payload.hasMore);
        page++;
    }

    return videoMap;
}

async function parseYouMindRecords(readme, source) {
    const youmindVideos = needsYouMindVideoLookup(source, readme)
        ? await fetchYouMindVideoMap(source)
        : new Map();
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
        const sourceUrl = extractSourceUrl(body);
        const videoUrls = extractVideoUrls(body, mediaUrls, youmindVideos, sourceUrl);
        records.push({
            title: rawTitle || titleLine,
            rawTitle: rawTitle || titleLine,
            sourceUrl,
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
    await client.writeFile(bucket, key, filePath, contentType);
}

async function downloadVideoWithYtDlp(url, outputPath) {
    return new Promise((resolve, reject) => {
        const child = spawn('yt-dlp', [
            '--no-playlist',
            '-f', 'best[height<=720]/best',
            '--merge-output-format', 'mp4',
            '--no-warnings',
            '-o', outputPath,
            url,
        ], { stdio: ['ignore', 'pipe', 'pipe'] });
        let stderr = '';
        child.stderr.on('data', (chunk) => {
            stderr += chunk.toString();
        });
        child.on('error', reject);
        child.on('close', async (code) => {
            if (code !== 0) return reject(new Error(stderr.trim() || `yt-dlp exited ${code}`));
            try {
                await fs.access(outputPath);
                resolve(outputPath);
            } catch {
                reject(new Error('yt-dlp finished without output file'));
            }
        });
    });
}

async function downloadVideoSource(url, filePath) {
    if (/^https?:\/\/(?:www\.)?(?:x|twitter)\.com\//i.test(url)) {
        return downloadVideoWithYtDlp(url, filePath);
    }
    await downloadToFile(url, filePath);
    return filePath;
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
    const report = { generatedAt: new Date().toISOString(), repaired: [], skipped: [], failed: [], revalidation: null };
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
                await downloadVideoSource(match.videoUrl, videoPath);
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
    report.revalidation = await requestPromptRevalidation(report.repaired.map((item) => item.promptId), options);
    await fs.writeFile('/tmp/seedance-video-repair-report.json', JSON.stringify(report, null, 2));
    console.log(`apply complete repaired=${report.repaired.length} skipped=${report.skipped.length} failed=${report.failed.length}`);
    if (report.revalidation) {
        console.log(`revalidation ${report.revalidation.ok ? 'complete' : 'failed'} site=${report.revalidation.siteUrl || 'n/a'}`);
    }
    if (report.failed.length > 0) process.exitCode = 1;
}

async function auditMissingX(options) {
    const out = path.resolve(String(options.out || '/tmp/seedance-missing-x-video-audit.json'));
    const limit = parsePositiveInt(options.limit, 2000);
    const afterId = Number.parseInt(String(options['after-id'] || '0'), 10) || 0;
    const includeGithub = isTruthyOption(options['include-github']);
    const conn = await getConnection();
    try {
        const sourceCondition = includeGithub
            ? `(SourceUrl REGEXP '^https?://(www\\\\.)?(x|twitter)\\\\.com/' OR SourceUrl LIKE 'https://github.com/%')`
            : `SourceUrl REGEXP '^https?://(www\\\\.)?(x|twitter)\\\\.com/'`;
        const [rows] = await conn.query(
            `SELECT Id, RawTitle, SourceUrl, VideoPreviewUrl, CardPreviewVideoUrl
             FROM Prompts
             WHERE IsActive = 1
               AND Category = 'seedance-2'
               AND Id > ?
               AND (VideoPreviewUrl IS NULL OR VideoPreviewUrl = '')
               AND ${sourceCondition}
             ORDER BY Id
             LIMIT ?`,
            [afterId, limit]
        );
        const result = {
            generatedAt: new Date().toISOString(),
            mode: includeGithub ? 'missing-seedance-x-or-github-source' : 'missing-seedance-x-source',
            afterId,
            limit,
            count: rows.length,
            lastId: rows.length > 0 ? rows[rows.length - 1].Id : null,
            matches: rows.map((row) => ({
                promptId: row.Id,
                rawTitle: row.RawTitle,
                sourceUrl: row.SourceUrl,
                videoUrl: row.SourceUrl,
                currentVideoPreviewUrl: row.VideoPreviewUrl,
                currentCardPreviewVideoUrl: row.CardPreviewVideoUrl,
                needsVideo: !row.VideoPreviewUrl,
                needsCardPreview: !row.CardPreviewVideoUrl,
            })),
        };
        await fs.writeFile(out, JSON.stringify(result, null, 2));
        console.log(`audit-missing-x complete count=${result.count} lastId=${result.lastId ?? 'none'} out=${out}`);
    } finally {
        await conn.end();
    }
}

async function auditMissingGithubByTitle(options) {
    const sourceId = String(options.source || 'yoomind-seedance-2');
    const out = path.resolve(String(options.out || '/tmp/seedance-missing-github-title-audit.json'));
    const parsedRecords = (await fetchSourceRecords(sourceId)).filter((record) => record.videoUrls.length > 0);
    const recordsByTitle = new Map();
    const duplicateTitles = new Set();

    for (const record of parsedRecords) {
        const key = record.rawTitle.trim();
        if (recordsByTitle.has(key)) duplicateTitles.add(key);
        recordsByTitle.set(key, record);
    }
    for (const title of duplicateTitles) recordsByTitle.delete(title);

    const conn = await getConnection();
    try {
        const [rows] = await conn.query(
            `SELECT Id, RawTitle, SourceUrl, VideoPreviewUrl, CardPreviewVideoUrl
             FROM Prompts
             WHERE IsActive = 1
               AND Category = 'seedance-2'
               AND (VideoPreviewUrl IS NULL OR VideoPreviewUrl = '')
               AND SourceUrl LIKE 'https://github.com/%'
             ORDER BY Id`
        );
        const matches = [];
        const unmatchedRows = [];
        for (const row of rows) {
            const record = recordsByTitle.get(String(row.RawTitle || '').trim());
            if (!record) {
                unmatchedRows.push({ promptId: row.Id, rawTitle: row.RawTitle, sourceUrl: row.SourceUrl });
                continue;
            }
            matches.push({
                promptId: row.Id,
                rawTitle: row.RawTitle,
                sourceUrl: row.SourceUrl,
                matchedSourceUrl: record.sourceUrl,
                videoUrl: record.videoUrls[0],
                currentVideoPreviewUrl: row.VideoPreviewUrl,
                currentCardPreviewVideoUrl: row.CardPreviewVideoUrl,
                needsVideo: !row.VideoPreviewUrl,
                needsCardPreview: !row.CardPreviewVideoUrl,
            });
        }

        const result = {
            generatedAt: new Date().toISOString(),
            mode: 'missing-seedance-github-source-by-raw-title',
            sourceId,
            parsedVideoRecords: parsedRecords.length,
            duplicateParsedTitles: [...duplicateTitles],
            dbGithubMissingRows: rows.length,
            dbMatches: matches.length,
            unmatchedRows,
            matches,
        };
        await fs.writeFile(out, JSON.stringify(result, null, 2));
        console.log(`audit-missing-github-title complete parsedVideoRecords=${result.parsedVideoRecords} dbGithubMissingRows=${result.dbGithubMissingRows} dbMatches=${result.dbMatches} unmatchedRows=${result.unmatchedRows.length} out=${out}`);
    } finally {
        await conn.end();
    }
}

function fail(message) {
    throw new Error(message);
}

async function main() {
    await loadEnv();
    const options = parseArgs(process.argv.slice(2));
    if (options.command === 'audit') return audit(options);
    if (options.command === 'audit-missing-x') return auditMissingX(options);
    if (options.command === 'audit-missing-github-title') return auditMissingGithubByTitle(options);
    if (options.command === 'dry-run') return dryRun(options);
    if (options.command === 'apply') return apply(options);
    fail('Usage: prompt-video-repair.mjs <audit|audit-missing-x|audit-missing-github-title|dry-run|apply>');
}

main().catch((err) => {
    console.error(err.message || err);
    process.exit(1);
});
