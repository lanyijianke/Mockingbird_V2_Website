import matter from 'gray-matter';
import {
    buildArticleAssetUrl,
    fetchAggregatedArticleDirectory,
    fetchArticleMarkdown,
    type ArticleDirectoryEntry,
} from '@/lib/articles/article-directory';
import { getArticleDetailPath } from '@/lib/articles/article-route-paths';
import { ArticleCategory, ArticleDetail, ArticleListItem, ArticleStatus, PagedResult } from '@/lib/types';

function normalizeSite(site?: string): string {
    return site?.trim() || 'ai';
}

function mapEntryToListItem(entry: ArticleDirectoryEntry): ArticleListItem {
    return {
        id: entry.id,
        site: entry.site,
        title: entry.title,
        slug: entry.slug,
        summary: entry.summary,
        category: entry.category,
        categoryName: entry.categoryName,
        status: ArticleStatus.Published,
        coverUrl: entry.coverUrl,
        createdAt: new Date(entry.publishedAt).toISOString(),
        updatedAt: entry.updatedAt ? new Date(entry.updatedAt).toISOString() : null,
        viewCount: null,
    };
}

async function getSiteEntries(site?: string): Promise<ArticleDirectoryEntry[]> {
    const normalizedSite = normalizeSite(site);
    const snapshot = await fetchAggregatedArticleDirectory();
    return snapshot.entries.filter((entry) => entry.site === normalizedSite);
}

function filterEntries(
    entries: ArticleDirectoryEntry[],
    category?: string,
    searchQuery?: string
): ArticleDirectoryEntry[] {
    const normalizedSearch = searchQuery?.trim().toLowerCase();

    return entries.filter((entry) => {
        if (category && entry.category !== category) return false;
        if (!normalizedSearch) return true;
        const haystack = `${entry.title} ${entry.summary}`.toLowerCase();
        return haystack.includes(normalizedSearch);
    });
}

function rewriteRelativeMarkdownAssets(content: string, entry: ArticleDirectoryEntry): string {
    return content.replace(
        /!\[([^\]]*)\]\((?!https?:\/\/|data:|mailto:|#)([^)]+)\)/g,
        (_match, alt: string, relativePath: string) => {
            const sanitizedRelativePath = relativePath.trim().replace(/^\.\/+/, '');
            return `![${alt}](${buildArticleAssetUrl(entry, sanitizedRelativePath)})`;
        }
    );
}

export async function getArticleCategories(site: string = 'ai'): Promise<ArticleCategory[]> {
    const snapshot = await fetchAggregatedArticleDirectory();
    return snapshot.categoriesBySite[normalizeSite(site)] || [];
}

/** 获取 Top N 文章 */
export async function getTopArticles(
    count: number = 9,
    options?: { site?: string }
): Promise<ArticleListItem[]> {
    const entries = await getSiteEntries(options?.site);
    return entries.slice(0, count).map(mapEntryToListItem);
}

/** 分页查询文章 */
export async function getPagedArticles(
    page: number = 1,
    pageSize: number = 12,
    category?: string,
    searchQuery?: string,
    options?: { site?: string }
): Promise<PagedResult<ArticleListItem>> {
    const offset = (page - 1) * pageSize;
    const entries = await getSiteEntries(options?.site);
    const filteredEntries = filterEntries(entries, category, searchQuery);
    const totalCount = filteredEntries.length;
    const items = filteredEntries
        .slice(offset, offset + pageSize)
        .map(mapEntryToListItem);

    return {
        items,
        totalCount,
        page,
        pageSize,
        totalPages: Math.ceil(totalCount / pageSize),
    };
}

/** 根据 Slug 获取文章详情 */
export async function getArticleBySlug(
    slug: string,
    options?: { site?: string }
): Promise<ArticleDetail | null> {
    const entries = await getSiteEntries(options?.site);
    const entry = entries.find((item) => item.slug === slug);
    if (!entry) return null;

    const markdown = await fetchArticleMarkdown(entry);
    const { content } = matter(markdown);

    return {
        ...mapEntryToListItem(entry),
        content: rewriteRelativeMarkdownAssets(content.trim(), entry),
        renderedHtml: null,
        author: entry.author,
        originalUrl: entry.originalUrl,
        sourcePlatform: entry.sourcePlatform,
        type: entry.type,
        seoTitle: entry.seoTitle || null,
        seoDescription: entry.seoDescription || null,
        seoKeywords: entry.seoKeywords || null,
    };
}

/** 获取所有文章 Slug (用于 SSG generateStaticParams) */
export async function getAllSlugs(site: string = 'ai'): Promise<string[]> {
    const entries = await getSiteEntries(site);
    return entries.map((entry) => entry.slug);
}

export interface ArticleSitemapEntry {
    site: string;
    slug: string;
    path: string;
    lastModified: string | null;
}

/** 获取 sitemap 所需的文章 URL 与真实更新时间 */
export async function getArticleSitemapEntries(): Promise<ArticleSitemapEntry[]> {
    const snapshot = await fetchAggregatedArticleDirectory();
    return snapshot.entries.map((entry) => ({
        site: entry.site,
        slug: entry.slug,
        path: getArticleDetailPath(entry.site, entry.slug),
        lastModified: entry.updatedAt || entry.publishedAt,
    }));
}

/** 阅读量追踪：GitHub 源模式下兼容性 no-op */
export async function trackView(slug: string): Promise<boolean> {
    void slug;
    return false;
}

/** 获取同分类推荐文章（排除指定 slug） */
export async function getRelatedArticles(
    category: string,
    excludeSlug: string,
    limit: number = 6,
    options?: { site?: string }
): Promise<ArticleListItem[]> {
    const entries = await getSiteEntries(options?.site);
    return entries
        .filter((entry) => entry.category === category && entry.slug !== excludeSlug)
        .slice(0, limit)
        .map(mapEntryToListItem);
}

/** 获取文章总数 */
export async function getTotalCount(options?: { site?: string }): Promise<number> {
    const entries = await getSiteEntries(options?.site);
    return entries.length;
}
