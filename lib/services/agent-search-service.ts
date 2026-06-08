import { query } from '@/lib/db';
import { createAgentEmbeddingClient, createOpenAiCompatibleEmbeddingProvider } from '@/lib/agent-search/embedding-client';
import { mergeHybridResults, hybridResultKey, type SemanticCandidate, type HybridSearchResultItem } from '@/lib/agent-search/hybrid-ranker';
import { createAgentRerankClient } from '@/lib/agent-search/rerank-client';
import { loadAgentSemanticConfig } from '@/lib/agent-search/semantic-config';
import { createAgentVectorStoreFromConfig } from '@/lib/agent-search/vector-store';
import { buildAbsoluteUrl } from '@/lib/site-config';
import { getArticleBySlug } from '@/lib/services/article-service';
import { getPromptById } from '@/lib/services/prompt-service';
import type {
    AgentContentType,
    AgentSearchDocumentRow,
    AgentSearchResponse,
    AgentSearchResultItem,
    AgentSearchType,
} from './agent-search-types';
import type {
    AgentAssetKind,
    AgentAssetQualitySignals,
    AgentMediaAsset,
    AgentMediaType,
} from './agent-asset-types';
import { normalizeArticleAsset, normalizePromptAsset } from './agent-asset-normalizer';

export interface AgentSearchOptions {
    query: string;
    type?: AgentSearchType;
    site?: string;
    category?: string;
    limit?: number;
    media?: AgentMediaType | 'any';
    useCase?: string;
}

export interface AgentPromptDetail {
    type: 'prompt';
    id: string;
    title: string;
    description: string | null;
    content: string;
    category: string;
    author: string | null;
    sourceUrl: string | null;
    url: string;
    media: {
        coverImageUrl: string | null;
        videoPreviewUrl: string | null;
        cardPreviewVideoUrl: string | null;
        imagesJson: string | null;
    };
    assetKind: 'prompt';
    mediaTypes: AgentMediaType[];
    useCases: string[];
    outputFormats: string[];
    qualitySignals: AgentAssetQualitySignals;
    promptText: string;
    usageNotes: string[];
    mediaAssets: AgentMediaAsset[];
    createdAt: string;
    updatedAt: string | null;
}

export interface AgentArticleDetail {
    type: 'article';
    id: string;
    site: string;
    title: string;
    summary: string;
    content: string;
    truncated: boolean;
    category: string;
    categoryName: string;
    author: string | null;
    originalUrl: string | null;
    sourcePlatform: string | null;
    url: string;
    coverUrl: string | null;
    assetKind: 'article';
    mediaTypes: AgentMediaType[];
    useCases: string[];
    outputFormats: string[];
    qualitySignals: AgentAssetQualitySignals;
    mediaAssets: AgentMediaAsset[];
    createdAt: string;
    updatedAt: string | null;
}

interface SearchRow extends AgentSearchDocumentRow {
    MatchedText?: string | null;
}

const MAX_SEARCH_LIMIT = 20;
const DEFAULT_SEARCH_LIMIT = 10;
const MAX_ARTICLE_CHARS = 20000;
const SEMANTIC_SCORE_THRESHOLD = 0.2;

export function normalizeSearchType(value: string | null | undefined): AgentSearchType {
    if (value === 'prompt' || value === 'article' || value === 'all') return value;
    return 'all';
}

export function parseLimit(value: string | number | null | undefined, defaultValue: number = DEFAULT_SEARCH_LIMIT): number {
    const parsed = typeof value === 'number' ? value : Number.parseInt(value || '', 10);
    if (!Number.isFinite(parsed)) return defaultValue;
    return Math.min(MAX_SEARCH_LIMIT, Math.max(1, parsed));
}

function toIso(value: string | null | undefined): string | null {
    if (!value) return null;
    const date = new Date(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value)
        ? `${value.replace(' ', 'T')}Z`
        : value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toISOString();
}

function scoreRow(row: SearchRow, term: string): number {
    const lowerTerm = term.toLowerCase();
    let score = 0.2;
    if (row.Title.toLowerCase().includes(lowerTerm)) score += 0.5;
    if ((row.Summary || '').toLowerCase().includes(lowerTerm)) score += 0.2;
    if ((row.Category || '').toLowerCase().includes(lowerTerm)) score += 0.1;
    try {
        const metadata = row.MetadataJson ? JSON.parse(row.MetadataJson) as { copyCount?: number } : {};
        if (typeof metadata.copyCount === 'number') score += Math.min(0.1, metadata.copyCount / 100000);
    } catch {
        // Metadata is not trusted input; ignore malformed values for scoring.
    }
    return Number(score.toFixed(4));
}

function escapeLike(value: string): string {
    return value.replace(/[\\%_]/g, (match) => `\\${match}`);
}

function escapeSqlStringLiteral(value: string): string {
    return value.replace(/'/g, "''");
}

function stringArray(value: unknown): string[] {
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function mediaTypeArray(value: unknown): AgentMediaType[] {
    return stringArray(value).filter((item): item is AgentMediaType => item === 'image' || item === 'video');
}

function parseAssetMetadata(row: SearchRow): Pick<AgentSearchResultItem, 'assetKind' | 'mediaTypes' | 'useCases' | 'outputFormats' | 'qualitySignals'> {
    const fallbackQualitySignals: AgentAssetQualitySignals = {
        hasCover: Boolean(row.CoverUrl),
        hasVideo: false,
        hasExamples: false,
        copyCount: null,
        updatedAt: toIso(row.SourceUpdatedAt),
    };
    const fallback = {
        assetKind: row.ContentType as AgentAssetKind,
        mediaTypes: [] as AgentMediaType[],
        useCases: [] as string[],
        outputFormats: row.ContentType === 'article' ? ['text'] : [] as string[],
        qualitySignals: fallbackQualitySignals,
    };

    try {
        const metadata = row.MetadataJson ? JSON.parse(row.MetadataJson) as Record<string, unknown> : {};
        const qualitySignals = typeof metadata.qualitySignals === 'object' && metadata.qualitySignals
            ? metadata.qualitySignals as Partial<AgentAssetQualitySignals>
            : {};
        return {
            assetKind: metadata.assetKind === 'prompt' || metadata.assetKind === 'article'
                ? metadata.assetKind
                : fallback.assetKind,
            mediaTypes: mediaTypeArray(metadata.mediaTypes),
            useCases: stringArray(metadata.useCases),
            outputFormats: stringArray(metadata.outputFormats),
            qualitySignals: {
                hasCover: typeof qualitySignals.hasCover === 'boolean' ? qualitySignals.hasCover : fallbackQualitySignals.hasCover,
                hasVideo: typeof qualitySignals.hasVideo === 'boolean' ? qualitySignals.hasVideo : fallbackQualitySignals.hasVideo,
                hasExamples: typeof qualitySignals.hasExamples === 'boolean' ? qualitySignals.hasExamples : fallbackQualitySignals.hasExamples,
                copyCount: typeof qualitySignals.copyCount === 'number' ? qualitySignals.copyCount : fallbackQualitySignals.copyCount,
                updatedAt: typeof qualitySignals.updatedAt === 'string' ? qualitySignals.updatedAt : fallbackQualitySignals.updatedAt,
            },
        };
    } catch {
        return fallback;
    }
}

function mapSearchRow(row: SearchRow, term: string): AgentSearchResultItem {
    const assetMetadata = parseAssetMetadata(row);
    return {
        type: row.ContentType,
        id: row.ContentId,
        site: row.Site,
        title: row.Title,
        summary: row.Summary,
        category: row.Category,
        url: row.PublicUrl,
        coverUrl: row.CoverUrl,
        score: scoreRow(row, term),
        matchedText: row.MatchedText || row.Summary || null,
        updatedAt: toIso(row.SourceUpdatedAt),
        ...assetMetadata,
    };
}

function buildVectorFilter(options: {
    type: AgentSearchType;
    site: string;
    category?: string;
    media?: AgentMediaType | 'any';
}): Record<string, unknown> {
    const must: Array<Record<string, unknown>> = [
        { key: 'site', match: { value: options.site } },
    ];
    if (options.type !== 'all') {
        must.push({ key: 'contentType', match: { value: options.type } });
    }
    if (options.category) {
        must.push({ key: 'category', match: { value: options.category } });
    }
    if (options.media && options.media !== 'any') {
        must.push({ key: 'mediaTypes', match: { value: options.media } });
    }
    return { must };
}

function semanticCandidateFromPayload(result: {
    score: number;
    payload: Record<string, unknown>;
}): SemanticCandidate | null {
    const contentType = result.payload.contentType;
    const site = result.payload.site;
    const contentId = result.payload.contentId;
    if ((contentType !== 'prompt' && contentType !== 'article') || typeof site !== 'string' || typeof contentId !== 'string') {
        return null;
    }
    return { contentType, site, contentId, semanticScore: Number(result.score || 0) };
}

function dedupeSemanticCandidates(candidates: SemanticCandidate[]): SemanticCandidate[] {
    const byDocument = new Map<string, SemanticCandidate>();
    for (const candidate of candidates) {
        const key = hybridResultKey(candidate.contentType, candidate.site, candidate.contentId);
        const existing = byDocument.get(key);
        if (!existing || candidate.semanticScore > existing.semanticScore) {
            byDocument.set(key, candidate);
        }
    }
    return [...byDocument.values()];
}

function rerankDocumentText(item: AgentSearchResultItem): string {
    return [item.title, item.summary, item.matchedText].filter(Boolean).join('\n');
}

function applyRerankScores(items: HybridSearchResultItem[], rerankResults: Array<{ index: number; score: number }>): HybridSearchResultItem[] {
    if (items.length === 0 || rerankResults.length === 0) return items;
    const scoreByIndex = new Map(rerankResults.map((result) => [result.index, result.score]));
    return items
        .map((item, index) => {
            const rerankScore = scoreByIndex.get(index);
            if (rerankScore === undefined || rerankScore <= 0) return item;
            return {
                ...item,
                score: Number(((item.score * 0.75) + (rerankScore * 0.25)).toFixed(4)),
            };
        })
        .sort((left, right) => right.score - left.score);
}

async function searchKeywordAgentIndex(input: {
    q: string;
    type: AgentSearchType;
    site: string;
    category?: string;
    limit: number;
    media?: AgentMediaType | 'any';
    useCase?: string;
}): Promise<AgentSearchResultItem[]> {
    const like = `%${escapeLike(input.q)}%`;
    const conditions = [
        'd.Site = ?',
        `(d.Title LIKE ? ESCAPE '\\\\'
          OR d.Summary LIKE ? ESCAPE '\\\\'
          OR d.Category LIKE ? ESCAPE '\\\\'
          OR d.SearchableText LIKE ? ESCAPE '\\\\'
          OR c.ChunkText LIKE ? ESCAPE '\\\\')`,
    ];
    const params: Array<string | number> = [input.site, like, like, like, like, like];

    if (input.type !== 'all') {
        conditions.push('d.ContentType = ?');
        params.push(input.type);
    }
    if (input.category) {
        conditions.push('d.Category = ?');
        params.push(input.category);
    }
    if (input.media && input.media !== 'any') {
        conditions.push('d.MetadataJson LIKE ?');
        params.push(`%"${input.media}"%`);
    }
    if (input.useCase?.trim()) {
        const useCaseLike = `%${escapeLike(input.useCase.trim().slice(0, 100))}%`;
        conditions.push(`(d.SearchableText LIKE ? ESCAPE '\\\\' OR d.MetadataJson LIKE ? ESCAPE '\\\\')`);
        params.push(useCaseLike, useCaseLike);
    }

    const rows = await query<SearchRow>(
        `SELECT d.*, MIN(c.ChunkText) AS MatchedText
         FROM AgentSearchDocuments d
         LEFT JOIN AgentSearchChunks c ON c.DocumentId = d.Id
         WHERE ${conditions.join(' AND ')}
         GROUP BY d.Id
         ORDER BY d.SourceUpdatedAt DESC, d.IndexedAt DESC
         LIMIT ?`,
        [...params, input.limit]
    );

    return rows.map((row) => mapSearchRow(row, input.q))
        .sort((left, right) => right.score - left.score);
}

async function fetchSemanticDetails(candidates: SemanticCandidate[], term: string): Promise<Map<string, AgentSearchResultItem>> {
    if (candidates.length === 0) return new Map();
    const conditions = candidates.map(() => '(d.ContentType = ? AND d.Site = ? AND d.ContentId = ?)');
    const params = candidates.flatMap((candidate) => [candidate.contentType, candidate.site, candidate.contentId]);
    const orderCases = candidates
        .map((candidate, index) => {
            const type = escapeSqlStringLiteral(candidate.contentType);
            const site = escapeSqlStringLiteral(candidate.site);
            const id = escapeSqlStringLiteral(candidate.contentId);
            return `WHEN d.ContentType = '${type}' AND d.Site = '${site}' AND d.ContentId = '${id}' THEN ${index}`;
        })
        .join(' ');
    const rows = await query<SearchRow>(
        `SELECT d.*, MIN(c.ChunkText) AS MatchedText
         FROM AgentSearchDocuments d
         LEFT JOIN AgentSearchChunks c ON c.DocumentId = d.Id
         WHERE ${conditions.join(' OR ')}
         GROUP BY d.Id
         ORDER BY CASE ${orderCases} ELSE ${candidates.length} END`,
        params
    );
    return new Map(rows.map((row) => [
        hybridResultKey(row.ContentType, row.Site, row.ContentId),
        mapSearchRow(row, term),
    ]));
}

async function searchSemanticAgentIndex(input: {
    q: string;
    type: AgentSearchType;
    site: string;
    category?: string;
    limit: number;
    media?: AgentMediaType | 'any';
}): Promise<{ candidates: SemanticCandidate[]; details: Map<string, AgentSearchResultItem> }> {
    const config = loadAgentSemanticConfig();
    if (!config.enabled) return { candidates: [], details: new Map() };

    try {
        const embeddingClient = createAgentEmbeddingClient({
            provider: createOpenAiCompatibleEmbeddingProvider(config.embedding),
            model: config.embedding.model,
        });
        const vectorStore = createAgentVectorStoreFromConfig(config.qdrant);
        const vector = await embeddingClient.embedQuery(input.q);
        const vectorResults = await vectorStore.search(vector, {
            limit: Math.min(MAX_SEARCH_LIMIT * 3, Math.max(input.limit * 3, input.limit)),
            scoreThreshold: SEMANTIC_SCORE_THRESHOLD,
            filter: buildVectorFilter(input),
        });
        const candidates = dedupeSemanticCandidates(
            vectorResults
                .map(semanticCandidateFromPayload)
                .filter((candidate): candidate is SemanticCandidate => Boolean(candidate)),
        ).slice(0, Math.min(MAX_SEARCH_LIMIT * 2, input.limit * 2));
        return { candidates, details: await fetchSemanticDetails(candidates, input.q) };
    } catch {
        return { candidates: [], details: new Map() };
    }
}

async function rerankIfConfigured(items: HybridSearchResultItem[], q: string): Promise<HybridSearchResultItem[]> {
    const config = loadAgentSemanticConfig();
    if (!config.enabled || !config.rerank.enabled || items.length === 0) return items;

    const reranker = createAgentRerankClient({ config: config.rerank });
    const documents = items.map(rerankDocumentText);
    const results = await reranker.rerank(q, documents);
    return applyRerankScores(items, results).slice(0, items.length);
}

export async function searchAgentIndex(options: AgentSearchOptions): Promise<AgentSearchResponse> {
    const q = options.query.trim().slice(0, 200);
    if (!q) {
        throw new Error('Missing search query');
    }

    const type = options.type || 'all';
    const site = options.site?.trim() || 'ai';
    const limit = Math.min(MAX_SEARCH_LIMIT, Math.max(1, options.limit || DEFAULT_SEARCH_LIMIT));
    const keyword = await searchKeywordAgentIndex({
        q,
        type,
        site,
        category: options.category,
        limit,
        media: options.media,
        useCase: options.useCase,
    });
    const semantic = await searchSemanticAgentIndex({
        q,
        type,
        site,
        category: options.category,
        limit,
        media: options.media,
    });
    const merged = mergeHybridResults({
        query: q,
        semantic: semantic.candidates,
        keyword,
        semanticDetails: semantic.details,
        limit,
    });
    const items = semantic.candidates.length > 0
        ? await rerankIfConfigured(merged, q)
        : merged;

    return {
        query: q,
        items,
    };
}

export async function getAgentPromptDetail(id: number): Promise<AgentPromptDetail | null> {
    const prompt = await getPromptById(id);
    if (!prompt || !prompt.isActive) return null;
    const asset = normalizePromptAsset(prompt);

    return {
        type: 'prompt',
        id: String(prompt.id),
        title: prompt.title,
        description: prompt.description || null,
        content: prompt.content,
        category: prompt.category,
        author: prompt.author || null,
        sourceUrl: prompt.sourceUrl || null,
        url: buildAbsoluteUrl(`/ai/prompts/${prompt.id}`),
        media: {
            coverImageUrl: prompt.coverImageUrl || null,
            videoPreviewUrl: prompt.videoPreviewUrl || null,
            cardPreviewVideoUrl: prompt.cardPreviewVideoUrl || null,
            imagesJson: prompt.imagesJson || null,
        },
        assetKind: asset.assetKind,
        mediaTypes: asset.mediaTypes,
        useCases: asset.useCases,
        outputFormats: asset.outputFormats,
        qualitySignals: asset.qualitySignals,
        promptText: asset.promptText,
        usageNotes: asset.usageNotes,
        mediaAssets: asset.media,
        createdAt: prompt.createdAt,
        updatedAt: prompt.updatedAt || null,
    };
}

export async function getAgentArticleDetail(slug: string, options?: { site?: string; maxChars?: number }): Promise<AgentArticleDetail | null> {
    const site = options?.site || 'ai';
    const article = await getArticleBySlug(slug, { site });
    if (!article) return null;

    const maxChars = Math.min(MAX_ARTICLE_CHARS, Math.max(1, options?.maxChars || MAX_ARTICLE_CHARS));
    const truncated = article.content.length > maxChars;
    const content = truncated ? article.content.slice(0, maxChars) : article.content;
    const asset = normalizeArticleAsset({ ...article, content }, { truncated });
    return {
        type: 'article',
        id: article.slug,
        site: article.site,
        title: article.title,
        summary: article.summary,
        content,
        truncated,
        category: article.category,
        categoryName: article.categoryName,
        author: article.author || null,
        originalUrl: article.originalUrl || null,
        sourcePlatform: article.sourcePlatform || null,
        url: buildAbsoluteUrl(`/ai/articles/${article.slug}`),
        coverUrl: article.coverUrl || null,
        assetKind: asset.assetKind,
        mediaTypes: asset.mediaTypes,
        useCases: asset.useCases,
        outputFormats: asset.outputFormats,
        qualitySignals: asset.qualitySignals,
        mediaAssets: asset.media,
        createdAt: article.createdAt,
        updatedAt: article.updatedAt || null,
    };
}

export function isAgentContentType(value: string): value is AgentContentType {
    return value === 'prompt' || value === 'article';
}
