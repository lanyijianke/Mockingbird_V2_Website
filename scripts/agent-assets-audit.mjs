#!/usr/bin/env node
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';

function parseArgs(argv) {
    const options = { site: 'ai', format: 'json' };
    for (const arg of argv) {
        if (arg.startsWith('--site=')) options.site = arg.slice('--site='.length).trim() || 'ai';
        if (arg.startsWith('--format=')) options.format = arg.slice('--format='.length).trim() || 'json';
    }
    return options;
}

function compactAssetRef(asset) {
    return {
        type: asset.type,
        id: String(asset.id),
        title: asset.title || '',
    };
}

function hasText(value) {
    return typeof value === 'string' && value.trim().length > 0;
}

export function summarizeAssetCompleteness(assets) {
    const report = {
        total: assets.length,
        prompts: 0,
        articles: 0,
        withCover: 0,
        withImage: 0,
        withVideo: 0,
        withExamples: 0,
        invalidMediaJson: [],
        missingMedia: [],
        missingDescription: [],
        emptyContent: [],
    };

    for (const asset of assets) {
        const type = asset.type === 'article' ? 'article' : 'prompt';
        if (type === 'article') report.articles += 1;
        if (type === 'prompt') report.prompts += 1;

        const quality = asset.qualitySignals || {};
        const mediaTypes = Array.isArray(asset.mediaTypes) ? asset.mediaTypes : [];

        if (quality.hasCover) report.withCover += 1;
        if (mediaTypes.includes('image')) report.withImage += 1;
        if (mediaTypes.includes('video') || quality.hasVideo) report.withVideo += 1;
        if (quality.hasExamples) report.withExamples += 1;
        if (asset.invalidMediaJson) report.invalidMediaJson.push(compactAssetRef({ ...asset, type }));
        if (mediaTypes.length === 0) report.missingMedia.push(compactAssetRef({ ...asset, type }));

        const description = type === 'article' ? asset.summary : asset.description;
        if (!hasText(description)) report.missingDescription.push(compactAssetRef({ ...asset, type }));
        if (!hasText(asset.content)) report.emptyContent.push(compactAssetRef({ ...asset, type }));
    }

    return report;
}

function markdownList(items) {
    if (items.length === 0) return '- None\n';
    return items.map((item) => `- ${item.type}:${item.id} ${item.title}`.trim()).join('\n') + '\n';
}

export function formatAssetCompletenessMarkdown(report) {
    return [
        '# Agent Assets Audit',
        '',
        '| Metric | Value |',
        '| --- | ---: |',
        `| Total | ${report.total} |`,
        `| Prompts | ${report.prompts} |`,
        `| Articles | ${report.articles} |`,
        `| With cover | ${report.withCover} |`,
        `| With image | ${report.withImage} |`,
        `| With video | ${report.withVideo} |`,
        `| With examples | ${report.withExamples} |`,
        '',
        '## Missing Media',
        '',
        markdownList(report.missingMedia),
        '## Missing Description Or Summary',
        '',
        markdownList(report.missingDescription),
        '## Empty Content',
        '',
        markdownList(report.emptyContent),
        '## Invalid Media JSON',
        '',
        markdownList(report.invalidMediaJson),
    ].join('\n');
}

function requireMysqlUrl() {
    if (!process.env.MYSQL_URL) throw new Error('MYSQL_URL is required');
    return process.env.MYSQL_URL;
}

function safeParseJson(value) {
    if (!value) return {};
    try {
        return JSON.parse(value);
    } catch {
        return {};
    }
}

async function loadIndexedAssets(conn, site) {
    const [rows] = await conn.query(
        `SELECT ContentType, ContentId, Title, Summary, SearchableText, MetadataJson
         FROM AgentSearchDocuments
         WHERE Site = ?
         ORDER BY ContentType, ContentId`,
        [site]
    );

    return rows.map((row) => {
        const metadata = safeParseJson(row.MetadataJson);
        return {
            type: row.ContentType,
            id: row.ContentId,
            title: row.Title,
            summary: row.Summary,
            description: row.Summary,
            content: row.SearchableText,
            mediaTypes: Array.isArray(metadata.mediaTypes) ? metadata.mediaTypes : [],
            qualitySignals: metadata.qualitySignals || {},
        };
    });
}

async function main() {
    const options = parseArgs(process.argv.slice(2));
    const conn = await mysql.createConnection({ uri: requireMysqlUrl(), charset: 'utf8mb4' });
    try {
        const assets = await loadIndexedAssets(conn, options.site);
        const report = summarizeAssetCompleteness(assets);
        if (options.format === 'markdown') {
            console.log(formatAssetCompletenessMarkdown(report));
        } else {
            console.log(JSON.stringify(report, null, 2));
        }
    } finally {
        await conn.end();
    }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
    main().catch((error) => {
        console.error(error instanceof Error ? error.message : String(error));
        process.exit(1);
    });
}
