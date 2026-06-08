#!/usr/bin/env node
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';
import { QdrantClient } from '@qdrant/js-client-rest';

function parseArgs(argv) {
    const options = { site: 'ai', format: 'json' };
    for (const arg of argv) {
        if (arg.startsWith('--site=')) options.site = arg.slice('--site='.length).trim() || 'ai';
        if (arg.startsWith('--format=')) options.format = arg.slice('--format='.length).trim() || 'json';
    }
    return options;
}

function requireMysqlUrl() {
    if (!process.env.MYSQL_URL) throw new Error('MYSQL_URL is required');
    return process.env.MYSQL_URL;
}

function semanticEnabled() {
    const value = (process.env.AGENT_SEMANTIC_SEARCH_ENABLED || '').trim().toLowerCase();
    return value === 'true' || value === '1' || value === 'yes';
}

function requireEnv(key) {
    const value = process.env[key]?.trim();
    if (!value) throw new Error(`${key} is required`);
    return value;
}

async function countScalar(conn, sql, params = []) {
    const [rows] = await conn.execute(sql, params);
    return Number(rows[0]?.count || 0);
}

async function loadPublishedArticleCount(site) {
    const response = await fetch(`http://localhost:${process.env.PORT || '5046'}/api/articles?action=slugs&site=${encodeURIComponent(site)}`);
    if (!response.ok) {
        throw new Error(`Failed to load article slugs: ${response.status}`);
    }

    const payload = await response.json();
    const data = payload.data || payload.slugs || payload;
    if (Array.isArray(data)) return data.length;
    if (Array.isArray(data.items)) return data.items.length;
    return 0;
}

async function loadVectorCoverage(site) {
    if (!semanticEnabled()) {
        return {
            semanticEnabled: false,
            promptVectorDocuments: null,
            articleVectorDocuments: null,
            totalVectorPoints: null,
        };
    }

    const client = new QdrantClient({
        host: requireEnv('AGENT_QDRANT_HOST'),
        port: Number.parseInt(requireEnv('AGENT_QDRANT_HTTP_PORT'), 10),
        https: /^(true|1|yes)$/i.test(process.env.AGENT_QDRANT_HTTPS || ''),
        apiKey: process.env.AGENT_QDRANT_API_KEY?.trim() || undefined,
        checkCompatibility: false,
    });
    const collection = requireEnv('AGENT_QDRANT_COLLECTION');

    const [promptCount, articleCount, totalCount] = await Promise.all([
        client.count(collection, {
            exact: true,
            filter: {
                must: [
                    { key: 'contentType', match: { value: 'prompt' } },
                    { key: 'site', match: { value: site } },
                ],
            },
        }),
        client.count(collection, {
            exact: true,
            filter: {
                must: [
                    { key: 'contentType', match: { value: 'article' } },
                    { key: 'site', match: { value: site } },
                ],
            },
        }),
        client.count(collection, { exact: true }),
    ]);

    return {
        semanticEnabled: true,
        promptVectorDocuments: Number(promptCount?.count || 0),
        articleVectorDocuments: Number(articleCount?.count || 0),
        totalVectorPoints: Number(totalCount?.count || 0),
    };
}

export async function buildSourceIndexCoverage(options = {}) {
    const site = options.site || 'ai';
    const conn = await mysql.createConnection({ uri: requireMysqlUrl(), charset: 'utf8mb4' });
    try {
        const [
            activePrompts,
            indexedPrompts,
            indexedArticles,
            totalDocuments,
            totalChunks,
            embeddedChunks,
            promptIndexedWithEmbeddings,
            articleIndexedWithEmbeddings,
        ] = await Promise.all([
            countScalar(conn, 'SELECT COUNT(*) AS count FROM Prompts WHERE IsActive = 1'),
            countScalar(conn, "SELECT COUNT(*) AS count FROM AgentSearchDocuments WHERE ContentType = 'prompt' AND Site = ?", [site]),
            countScalar(conn, "SELECT COUNT(*) AS count FROM AgentSearchDocuments WHERE ContentType = 'article' AND Site = ?", [site]),
            countScalar(conn, 'SELECT COUNT(*) AS count FROM AgentSearchDocuments WHERE Site = ?', [site]),
            countScalar(conn, 'SELECT COUNT(*) AS count FROM AgentSearchChunks'),
            countScalar(conn, 'SELECT COUNT(*) AS count FROM AgentSearchChunks WHERE EmbeddedAt IS NOT NULL'),
            countScalar(conn, `SELECT COUNT(DISTINCT d.Id) AS count
                FROM AgentSearchDocuments d
                JOIN AgentSearchChunks c ON c.DocumentId = d.Id
               WHERE d.ContentType = 'prompt' AND d.Site = ? AND c.EmbeddedAt IS NOT NULL`, [site]),
            countScalar(conn, `SELECT COUNT(DISTINCT d.Id) AS count
                FROM AgentSearchDocuments d
                JOIN AgentSearchChunks c ON c.DocumentId = d.Id
               WHERE d.ContentType = 'article' AND d.Site = ? AND c.EmbeddedAt IS NOT NULL`, [site]),
        ]);
        const publishedArticles = await loadPublishedArticleCount(site);
        const vectorCoverage = await loadVectorCoverage(site);

        return {
            site,
            activePrompts,
            indexedPrompts,
            promptGap: activePrompts - indexedPrompts,
            publishedArticles,
            indexedArticles,
            articleGap: publishedArticles - indexedArticles,
            totalDocuments,
            totalChunks,
            embeddedChunks,
            promptIndexedWithEmbeddings,
            articleIndexedWithEmbeddings,
            promptsCovered: activePrompts === indexedPrompts,
            articlesCovered: publishedArticles === indexedArticles,
            semanticEnabled: vectorCoverage.semanticEnabled,
            promptVectorDocuments: vectorCoverage.promptVectorDocuments,
            articleVectorDocuments: vectorCoverage.articleVectorDocuments,
            totalVectorPoints: vectorCoverage.totalVectorPoints,
            promptEmbeddingGap: vectorCoverage.semanticEnabled ? indexedPrompts - promptIndexedWithEmbeddings : null,
            articleEmbeddingGap: vectorCoverage.semanticEnabled ? indexedArticles - articleIndexedWithEmbeddings : null,
        };
    } finally {
        await conn.end();
    }
}

export function formatCoverageMarkdown(report) {
    return [
        '# Agent Source Vs Index Coverage',
        '',
        '| Metric | Value |',
        '| --- | ---: |',
        `| Site | ${report.site} |`,
        `| Active prompts | ${report.activePrompts} |`,
        `| Indexed prompt documents | ${report.indexedPrompts} |`,
        `| Prompt gap | ${report.promptGap} |`,
        `| Published articles | ${report.publishedArticles} |`,
        `| Indexed article documents | ${report.indexedArticles} |`,
        `| Article gap | ${report.articleGap} |`,
        `| Total indexed documents | ${report.totalDocuments} |`,
        `| Total chunks | ${report.totalChunks} |`,
        `| Embedded chunks | ${report.embeddedChunks} |`,
        `| Prompt docs with embeddings | ${report.promptIndexedWithEmbeddings} |`,
        `| Article docs with embeddings | ${report.articleIndexedWithEmbeddings} |`,
        `| Semantic search enabled | ${report.semanticEnabled ? 'yes' : 'no'} |`,
        `| Prompt vector points | ${report.promptVectorDocuments ?? 'n/a'} |`,
        `| Article vector points | ${report.articleVectorDocuments ?? 'n/a'} |`,
        `| Total vector points | ${report.totalVectorPoints ?? 'n/a'} |`,
        `| Prompt embedding gap | ${report.promptEmbeddingGap ?? 'n/a'} |`,
        `| Article embedding gap | ${report.articleEmbeddingGap ?? 'n/a'} |`,
        '',
        '## Status',
        '',
        `- Prompt coverage: ${report.promptsCovered ? 'covered' : 'incomplete'}`,
        `- Article coverage: ${report.articlesCovered ? 'covered' : 'incomplete'}`,
        `- Embedding coverage: ${report.semanticEnabled ? ((report.promptEmbeddingGap === 0 && report.articleEmbeddingGap === 0) ? 'covered' : 'incomplete') : 'semantic-disabled'}`,
        '',
    ].join('\n');
}

async function main() {
    const options = parseArgs(process.argv.slice(2));
    const report = await buildSourceIndexCoverage(options);
    if (options.format === 'markdown') {
        console.log(formatCoverageMarkdown(report));
        return;
    }
    console.log(JSON.stringify(report, null, 2));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
    main().catch((error) => {
        console.error(error instanceof Error ? error.message : String(error));
        process.exit(1);
    });
}
