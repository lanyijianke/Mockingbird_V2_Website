import { query } from '@/lib/db';
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

export interface AgentSearchOptions {
    query: string;
    type?: AgentSearchType;
    site?: string;
    category?: string;
    limit?: number;
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
    createdAt: string;
    updatedAt: string | null;
}

interface SearchRow extends AgentSearchDocumentRow {
    MatchedText?: string | null;
}

const MAX_SEARCH_LIMIT = 20;
const DEFAULT_SEARCH_LIMIT = 10;
const MAX_ARTICLE_CHARS = 20000;

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

function mapSearchRow(row: SearchRow, term: string): AgentSearchResultItem {
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
    };
}

export async function searchAgentIndex(options: AgentSearchOptions): Promise<AgentSearchResponse> {
    const q = options.query.trim().slice(0, 200);
    if (!q) {
        throw new Error('Missing search query');
    }

    const type = options.type || 'all';
    const site = options.site?.trim() || 'ai';
    const limit = Math.min(MAX_SEARCH_LIMIT, Math.max(1, options.limit || DEFAULT_SEARCH_LIMIT));
    const like = `%${escapeLike(q)}%`;
    const conditions = [
        'd.Site = ?',
        `(d.Title LIKE ? ESCAPE '\\\\'
          OR d.Summary LIKE ? ESCAPE '\\\\'
          OR d.Category LIKE ? ESCAPE '\\\\'
          OR d.SearchableText LIKE ? ESCAPE '\\\\'
          OR c.ChunkText LIKE ? ESCAPE '\\\\')`,
    ];
    const params: Array<string | number> = [site, like, like, like, like, like];

    if (type !== 'all') {
        conditions.push('d.ContentType = ?');
        params.push(type);
    }
    if (options.category) {
        conditions.push('d.Category = ?');
        params.push(options.category);
    }

    const rows = await query<SearchRow>(
        `SELECT d.*, MIN(c.ChunkText) AS MatchedText
         FROM AgentSearchDocuments d
         LEFT JOIN AgentSearchChunks c ON c.DocumentId = d.Id
         WHERE ${conditions.join(' AND ')}
         GROUP BY d.Id
         ORDER BY d.SourceUpdatedAt DESC, d.IndexedAt DESC
         LIMIT ?`,
        [...params, limit]
    );

    return {
        query: q,
        items: rows.map((row) => mapSearchRow(row, q))
            .sort((left, right) => right.score - left.score),
    };
}

export async function getAgentPromptDetail(id: number): Promise<AgentPromptDetail | null> {
    const prompt = await getPromptById(id);
    if (!prompt || !prompt.isActive) return null;

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
    return {
        type: 'article',
        id: article.slug,
        site: article.site,
        title: article.title,
        summary: article.summary,
        content: truncated ? article.content.slice(0, maxChars) : article.content,
        truncated,
        category: article.category,
        categoryName: article.categoryName,
        author: article.author || null,
        originalUrl: article.originalUrl || null,
        sourcePlatform: article.sourcePlatform || null,
        url: buildAbsoluteUrl(`/ai/articles/${article.slug}`),
        coverUrl: article.coverUrl || null,
        createdAt: article.createdAt,
        updatedAt: article.updatedAt || null,
    };
}

export function isAgentContentType(value: string): value is AgentContentType {
    return value === 'prompt' || value === 'article';
}
