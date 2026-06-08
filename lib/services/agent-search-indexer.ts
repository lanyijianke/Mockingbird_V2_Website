import crypto from 'crypto';
import matter from 'gray-matter';
import { execute, query, queryOne } from '@/lib/db';
import { fetchAggregatedArticleDirectory, fetchArticleMarkdown, type ArticleDirectoryEntry } from '@/lib/articles/article-directory';
import { getAllPromptIds, getPromptById } from '@/lib/services/prompt-service';
import { buildAbsoluteUrl } from '@/lib/site-config';
import type { AgentIndexReport, AgentIndexReportItem, AgentPromptBatchIndexReport } from './agent-search-types';
import { normalizeArticleAsset, normalizePromptAsset } from './agent-asset-normalizer';
import { createAgentEmbeddingClient, createOpenAiCompatibleEmbeddingProvider } from '@/lib/agent-search/embedding-client';
import { loadAgentSemanticConfig } from '@/lib/agent-search/semantic-config';
import { buildAgentVectorPoints } from '@/lib/agent-search/vector-points';
import { createAgentVectorStoreFromConfig } from '@/lib/agent-search/vector-store';

interface ExistingDocument {
    Id: number;
    SourceUpdatedAt: string | null;
    ContentHash: string | null;
}

interface IndexedDocumentInput {
    contentType: 'prompt' | 'article';
    contentId: string;
    site: string;
    title: string;
    summary: string | null;
    category: string | null;
    publicUrl: string;
    coverUrl: string | null;
    searchableText: string;
    metadata: Record<string, unknown>;
    sourceUpdatedAt: string | null;
    chunks: string[];
}

interface IndexedChunkInput {
    index: number;
    text: string;
    hash: string;
}

function sha256(value: string): string {
    return crypto.createHash('sha256').update(value).digest('hex');
}

function compactText(value: string | null | undefined): string {
    return (value || '')
        .replace(/\r/g, '\n')
        .replace(/[ \t]+/g, ' ')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

function joinText(parts: Array<string | null | undefined>): string {
    return compactText(parts.filter(Boolean).join('\n\n'));
}

function chunkText(text: string, maxLength: number = 1200): string[] {
    const paragraphs = compactText(text).split(/\n{2,}/).map((part) => part.trim()).filter(Boolean);
    const chunks: string[] = [];
    let current = '';

    for (const paragraph of paragraphs.length > 0 ? paragraphs : [compactText(text)]) {
        if (!current) {
            current = paragraph;
            continue;
        }
        if (`${current}\n\n${paragraph}`.length <= maxLength) {
            current = `${current}\n\n${paragraph}`;
            continue;
        }
        chunks.push(current);
        current = paragraph;
    }

    if (current) chunks.push(current);
    return chunks.length > 0 ? chunks : [''];
}

function toMysqlDate(value: string | null | undefined): string | null {
    if (!value) return null;
    if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value)) return value;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    return date.toISOString().slice(0, 19).replace('T', ' ');
}

function publicUrl(path: string): string {
    return buildAbsoluteUrl(path);
}

async function findDocument(contentType: 'prompt' | 'article', site: string, contentId: string): Promise<ExistingDocument | null> {
    return queryOne<ExistingDocument>(
        `SELECT Id, SourceUpdatedAt, ContentHash
         FROM AgentSearchDocuments
         WHERE ContentType = ? AND Site = ? AND ContentId = ?`,
        [contentType, site, contentId]
    );
}

async function upsertDocument(input: IndexedDocumentInput): Promise<number> {
    const contentHash = sha256(joinText([input.searchableText, ...input.chunks]));
    const result = await execute(
        `INSERT INTO AgentSearchDocuments
         (ContentType, ContentId, Site, Title, Summary, Category, PublicUrl, CoverUrl,
          SearchableText, MetadataJson, SourceUpdatedAt, ContentHash, IndexedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
         ON DUPLICATE KEY UPDATE
          Title = VALUES(Title),
          Summary = VALUES(Summary),
          Category = VALUES(Category),
          PublicUrl = VALUES(PublicUrl),
          CoverUrl = VALUES(CoverUrl),
          SearchableText = VALUES(SearchableText),
          MetadataJson = VALUES(MetadataJson),
          SourceUpdatedAt = VALUES(SourceUpdatedAt),
          ContentHash = VALUES(ContentHash),
          IndexedAt = NOW()`,
        [
            input.contentType,
            input.contentId,
            input.site,
            input.title,
            input.summary,
            input.category,
            input.publicUrl,
            input.coverUrl,
            input.searchableText,
            JSON.stringify(input.metadata),
            toMysqlDate(input.sourceUpdatedAt),
            contentHash,
        ]
    );
    if (result.insertId > 0) return result.insertId;

    const row = await findDocument(input.contentType, input.site, input.contentId);
    if (!row) {
        const rows = await query<{ Id: number }>(
            `SELECT Id FROM AgentSearchDocuments
             WHERE ContentType = ? AND Site = ? AND ContentId = ?`,
            [input.contentType, input.site, input.contentId]
        );
        if (!rows[0]) throw new Error(`Indexed document was not found: ${input.contentType}:${input.contentId}`);
        return rows[0].Id;
    }
    return row.Id;
}

async function replaceChunks(documentId: number, chunks: string[]): Promise<void> {
    await execute('DELETE FROM AgentSearchChunks WHERE DocumentId = ?', [documentId]);
    for (const [index, text] of chunks.entries()) {
        await execute(
            `INSERT INTO AgentSearchChunks
             (DocumentId, ChunkIndex, ChunkText, ChunkHash, EmbeddingJson, EmbeddingModel, EmbeddedAt)
             VALUES (?, ?, ?, ?, NULL, NULL, NULL)`,
            [documentId, index, text, sha256(text)]
        );
    }
}

function loadExpectedEmbeddingModel(): string | null {
    const config = loadAgentSemanticConfig();
    return config.enabled ? config.embedding.model : null;
}

async function documentNeedsRefresh(documentId: number, expectedEmbeddingModel: string | null): Promise<boolean> {
    const row = await queryOne<{
        ChunkCount: number | null;
        MissingEmbeddingCount: number | null;
    }>(
        `SELECT
            COUNT(*) AS ChunkCount,
            SUM(
                CASE
                    WHEN ? IS NOT NULL
                     AND (
                        EmbeddedAt IS NULL
                        OR EmbeddingModel IS NULL
                        OR EmbeddingModel <> ?
                     )
                    THEN 1
                    ELSE 0
                END
            ) AS MissingEmbeddingCount
         FROM AgentSearchChunks
         WHERE DocumentId = ?`,
        [expectedEmbeddingModel, expectedEmbeddingModel, documentId]
    );
    const chunkCount = Number(row?.ChunkCount || 0);
    const missingEmbeddingCount = Number(row?.MissingEmbeddingCount || 0);
    return chunkCount === 0 || missingEmbeddingCount > 0;
}

async function syncVectorPoints(
    documentId: number,
    input: Omit<IndexedDocumentInput, 'searchableText' | 'sourceUpdatedAt'>
): Promise<void> {
    const config = loadAgentSemanticConfig();
    if (!config.enabled) return;

    const chunks: IndexedChunkInput[] = input.chunks.map((text, index) => ({
        index,
        text,
        hash: sha256(text),
    }));
    if (chunks.length === 0) return;

    const embeddingClient = createAgentEmbeddingClient({
        provider: createOpenAiCompatibleEmbeddingProvider(config.embedding),
        model: config.embedding.model,
    });
    const store = createAgentVectorStoreFromConfig(config.qdrant);
    const embeddings = await embeddingClient.embedChunks(chunks.map((chunk) => chunk.text));
    const points = buildAgentVectorPoints({
        contentType: input.contentType,
        site: input.site,
        contentId: input.contentId,
        title: input.title,
        category: input.category,
        publicUrl: input.publicUrl,
        chunks,
        embeddings,
        metadata: input.metadata,
    });

    await store.ensureCollection(embeddings[0]?.length || 768);
    await store.deleteByDocument(input.contentType, input.site, input.contentId);
    await store.upsert(points);
    await execute(
        `UPDATE AgentSearchChunks
         SET EmbeddingModel = ?, EmbeddedAt = NOW()
         WHERE DocumentId = ?`,
        [config.embedding.model, documentId]
    );
}

export async function indexPrompt(id: number): Promise<AgentIndexReportItem> {
    const prompt = await getPromptById(id);
    if (!prompt || !prompt.isActive) {
        return { type: 'prompt', id: String(id), status: 'skipped', reason: 'not-active-or-missing' };
    }

    const searchableText = joinText([
        prompt.title,
        prompt.description,
        prompt.category,
        prompt.author,
        prompt.sourceUrl,
        prompt.content,
    ]);
    const chunks = chunkText(joinText([
        prompt.title,
        prompt.description,
        prompt.content,
    ]));
    const asset = normalizePromptAsset(prompt);
    const documentId = await upsertDocument({
        contentType: 'prompt',
        contentId: String(prompt.id),
        site: 'ai',
        title: prompt.title,
        summary: prompt.description || null,
        category: prompt.category,
        publicUrl: publicUrl(`/ai/prompts/${prompt.id}`),
        coverUrl: prompt.coverImageUrl || null,
        searchableText,
        metadata: {
            assetKind: asset.assetKind,
            mediaTypes: asset.mediaTypes,
            useCases: asset.useCases,
            outputFormats: asset.outputFormats,
            qualitySignals: asset.qualitySignals,
            author: prompt.author,
            sourceUrl: prompt.sourceUrl,
            copyCount: prompt.copyCount,
        },
        sourceUpdatedAt: prompt.updatedAt || prompt.createdAt,
        chunks,
    });
    await replaceChunks(documentId, chunks);
    await syncVectorPoints(documentId, {
        contentType: 'prompt',
        contentId: String(prompt.id),
        site: 'ai',
        title: prompt.title,
        summary: prompt.description || null,
        category: prompt.category,
        publicUrl: publicUrl(`/ai/prompts/${prompt.id}`),
        coverUrl: prompt.coverImageUrl || null,
        metadata: {
            assetKind: asset.assetKind,
            mediaTypes: asset.mediaTypes,
            useCases: asset.useCases,
            outputFormats: asset.outputFormats,
            qualitySignals: asset.qualitySignals,
            author: prompt.author,
            sourceUrl: prompt.sourceUrl,
            copyCount: prompt.copyCount,
        },
        chunks,
    });

    return { type: 'prompt', id: String(id), status: 'indexed' };
}

function findArticleEntry(entries: ArticleDirectoryEntry[], slug: string, site: string): ArticleDirectoryEntry | null {
    return entries.find((entry) => entry.site === site && entry.slug === slug) || null;
}

export async function indexArticle(slug: string, options?: { site?: string; force?: boolean }): Promise<AgentIndexReportItem> {
    const site = options?.site || 'ai';
    const snapshot = await fetchAggregatedArticleDirectory();
    const entry = findArticleEntry(snapshot.entries, slug, site);
    if (!entry) {
        return { type: 'article', id: slug, status: 'failed', reason: 'article-not-found' };
    }

    const sourceUpdatedAt = toMysqlDate(entry.updatedAt || entry.publishedAt);
    const existing = await findDocument('article', site, slug);
    if (!options?.force && existing?.SourceUpdatedAt && toMysqlDate(existing.SourceUpdatedAt) === sourceUpdatedAt) {
        const expectedEmbeddingModel = loadExpectedEmbeddingModel();
        if (!expectedEmbeddingModel) {
            return { type: 'article', id: slug, status: 'skipped', reason: 'unchanged' };
        }
        const needsRefresh = await documentNeedsRefresh(existing.Id, expectedEmbeddingModel);
        if (!needsRefresh) {
            return { type: 'article', id: slug, status: 'skipped', reason: 'unchanged' };
        }
    }

    const markdown = await fetchArticleMarkdown(entry);
    const parsed = matter(markdown);
    const body = compactText(parsed.content);
    const asset = normalizeArticleAsset({
        id: entry.id || entry.slug,
        site: entry.site,
        title: entry.title,
        slug: entry.slug,
        summary: entry.summary || '',
        category: entry.category || '',
        categoryName: entry.categoryName || '',
        status: 1,
        coverUrl: entry.coverUrl || null,
        createdAt: entry.publishedAt || entry.updatedAt || '',
        updatedAt: entry.updatedAt || null,
        content: body,
        author: entry.author || null,
        originalUrl: entry.originalUrl || null,
        sourcePlatform: entry.sourcePlatform || null,
        type: entry.type || null,
    }, { truncated: false });
    const searchableText = joinText([
        entry.title,
        entry.summary,
        entry.category,
        entry.categoryName,
        entry.author,
        entry.sourcePlatform,
        entry.tags?.join(' '),
        body,
    ]);
    const chunks = chunkText(joinText([entry.title, entry.summary, body]));
    const documentId = await upsertDocument({
        contentType: 'article',
        contentId: entry.slug,
        site,
        title: entry.title,
        summary: entry.summary || null,
        category: entry.category || null,
        publicUrl: publicUrl(`/ai/articles/${entry.slug}`),
        coverUrl: entry.coverUrl || null,
        searchableText,
        metadata: {
            assetKind: asset.assetKind,
            mediaTypes: asset.mediaTypes,
            useCases: asset.useCases,
            outputFormats: asset.outputFormats,
            qualitySignals: asset.qualitySignals,
            author: entry.author,
            originalUrl: entry.originalUrl,
            sourcePlatform: entry.sourcePlatform,
            tags: entry.tags || [],
        },
        sourceUpdatedAt,
        chunks,
    });
    await replaceChunks(documentId, chunks);
    await syncVectorPoints(documentId, {
        contentType: 'article',
        contentId: entry.slug,
        site,
        title: entry.title,
        summary: entry.summary || null,
        category: entry.category || null,
        publicUrl: publicUrl(`/ai/articles/${entry.slug}`),
        coverUrl: entry.coverUrl || null,
        metadata: {
            assetKind: asset.assetKind,
            mediaTypes: asset.mediaTypes,
            useCases: asset.useCases,
            outputFormats: asset.outputFormats,
            qualitySignals: asset.qualitySignals,
            author: entry.author,
            originalUrl: entry.originalUrl,
            sourcePlatform: entry.sourcePlatform,
            tags: entry.tags || [],
        },
        chunks,
    });

    return { type: 'article', id: slug, status: 'indexed' };
}

export async function indexAllPrompts(): Promise<AgentIndexReport> {
    const ids = await getAllPromptIds();
    const items: AgentIndexReportItem[] = [];
    for (const id of ids) {
        try {
            items.push(await indexPrompt(id));
        } catch (error) {
            items.push({ type: 'prompt', id: String(id), status: 'failed', reason: error instanceof Error ? error.message : 'unknown-error' });
        }
    }
    return { success: items.every((item) => item.status !== 'failed'), items };
}

export async function indexPromptBatch(options: {
    afterId?: number;
    limit?: number;
} = {}): Promise<AgentPromptBatchIndexReport> {
    const requestedLimit = Math.min(500, Math.max(1, options.limit || 100));
    const afterId = Math.max(0, options.afterId || 0);
    const rows = await query<{ Id: number }>(
        `SELECT Id
         FROM Prompts
         WHERE IsActive = 1 AND Id > ?
         ORDER BY Id ASC
         LIMIT ?`,
        [afterId, requestedLimit + 1]
    );
    const batchRows = rows.slice(0, requestedLimit);
    const items: AgentIndexReportItem[] = [];

    for (const row of batchRows) {
        try {
            items.push(await indexPrompt(row.Id));
        } catch (error) {
            items.push({ type: 'prompt', id: String(row.Id), status: 'failed', reason: error instanceof Error ? error.message : 'unknown-error' });
        }
    }

    const nextCursor = batchRows.length > 0 ? batchRows[batchRows.length - 1]!.Id : null;
    return {
        success: items.every((item) => item.status !== 'failed'),
        items,
        processed: items.length,
        requestedLimit,
        nextCursor,
        hasMore: rows.length > requestedLimit,
    };
}

export async function indexPromptBacklogBatch(options: {
    limit?: number;
} = {}): Promise<AgentPromptBatchIndexReport> {
    const requestedLimit = Math.min(1000, Math.max(1, options.limit || 1000));
    const expectedEmbeddingModel = loadExpectedEmbeddingModel();
    const rows = await query<{ Id: number }>(
        `SELECT p.Id
         FROM Prompts p
         LEFT JOIN AgentSearchDocuments d
           ON d.ContentType = 'prompt'
          AND d.Site = 'ai'
          AND CONVERT(d.ContentId USING utf8mb4) COLLATE utf8mb4_general_ci =
              CAST(p.Id AS CHAR CHARACTER SET utf8mb4) COLLATE utf8mb4_general_ci
         LEFT JOIN (
            SELECT
                c.DocumentId,
                COUNT(*) AS ChunkCount,
                SUM(
                    CASE
                        WHEN ? IS NOT NULL
                         AND (
                            c.EmbeddedAt IS NULL
                            OR c.EmbeddingModel IS NULL
                            OR c.EmbeddingModel <> ?
                         )
                        THEN 1
                        ELSE 0
                    END
                ) AS MissingEmbeddingCount
            FROM AgentSearchChunks c
            GROUP BY c.DocumentId
         ) chunk_state
           ON chunk_state.DocumentId = d.Id
         WHERE p.IsActive = 1
           AND (
                d.Id IS NULL
                OR d.SourceUpdatedAt IS NULL
                OR d.ContentHash IS NULL
                OR d.SourceUpdatedAt < COALESCE(p.UpdatedAt, p.CreatedAt)
                OR chunk_state.DocumentId IS NULL
                OR chunk_state.ChunkCount IS NULL
                OR chunk_state.ChunkCount = 0
                OR chunk_state.MissingEmbeddingCount > 0
           )
         ORDER BY p.Id ASC
         LIMIT ?`,
        [expectedEmbeddingModel, expectedEmbeddingModel, requestedLimit + 1]
    );
    const batchRows = rows.slice(0, requestedLimit);
    const items: AgentIndexReportItem[] = [];

    for (const row of batchRows) {
        try {
            items.push(await indexPrompt(row.Id));
        } catch (error) {
            items.push({ type: 'prompt', id: String(row.Id), status: 'failed', reason: error instanceof Error ? error.message : 'unknown-error' });
        }
    }

    return {
        success: items.every((item) => item.status !== 'failed'),
        items,
        processed: items.length,
        requestedLimit,
        nextCursor: null,
        hasMore: rows.length > requestedLimit,
    };
}

export async function indexAllArticles(options?: { site?: string }): Promise<AgentIndexReport> {
    const site = options?.site || 'ai';
    const snapshot = await fetchAggregatedArticleDirectory();
    const slugs = snapshot.entries.filter((entry) => entry.site === site).map((entry) => entry.slug);
    const items: AgentIndexReportItem[] = [];
    for (const slug of slugs) {
        try {
            items.push(await indexArticle(slug, { site }));
        } catch (error) {
            items.push({ type: 'article', id: slug, status: 'failed', reason: error instanceof Error ? error.message : 'unknown-error' });
        }
    }
    return { success: items.every((item) => item.status !== 'failed'), items };
}
