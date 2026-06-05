import fs from 'fs/promises';
import path from 'path';
import { loadArticleSourceConfigs } from './source-config';
import { readR2ObjectText } from './r2-client';
import type {
    ArticleSourceCategory,
    ArticleSourceConfig,
    ArticleSourceManifest,
    ArticleSourceManifestArticle,
    ArticleSite,
} from './source-types';

export interface ArticleDirectoryEntry {
    id: string;
    site: ArticleSite;
    source: string;
    sourceType: ArticleSourceConfig['type'];
    slug: string;
    title: string;
    summary: string;
    category: string;
    categoryName: string;
    author: string;
    originalUrl: string;
    sourcePlatform: string;
    type: string;
    assetBasePath: string;
    coverImagePath: string;
    coverUrl: string;
    contentPath: string;
    contentLocator: string;
    contentFilePath?: string;
    contentBucket?: string;
    contentKey?: string;
    publishedAt: string;
    updatedAt: string | null;
    seoTitle?: string;
    seoDescription?: string;
    seoKeywords?: string;
    tags?: string[];
}

export interface ArticleDirectorySnapshot {
    entries: ArticleDirectoryEntry[];
    categoriesBySite: Record<string, ArticleSourceCategory[]>;
}

const DEFAULT_CATEGORY_NAMES: Record<string, string> = {
    'ai-tech': 'AI技术',
    'ai-application': 'AI应用',
    'ai-business': 'AI商业',
    'ai-opinion': 'AI观点',
};

function buildAbsoluteSourcePath(config: ArticleSourceConfig, relativePath: string): string {
    if (config.type !== 'local') {
        throw new Error('Cannot build a local source path for a non-local article source');
    }
    return path.join(config.rootPath, relativePath.replace(/^\/+/, ''));
}

function joinR2Key(prefix: string, relativePath: string): string {
    return [prefix.replace(/^\/+|\/+$/g, ''), relativePath.replace(/^\/+/, '')]
        .filter(Boolean)
        .join('/');
}

function joinPublicUrl(baseUrl: string, relativePath: string): string {
    return `${baseUrl.replace(/\/+$/g, '')}/${relativePath.replace(/^\/+/, '')}`;
}

function resolveContentRelativePath(contentPath: string, relativePath: string): string {
    if (!relativePath || relativePath.startsWith('/')) {
        return relativePath.replace(/^\/+/, '');
    }

    if (relativePath.startsWith('articles/')) {
        return relativePath;
    }

    const contentSegments = contentPath.split('/');
    contentSegments.pop();
    const baseSegments = contentSegments.filter(Boolean);

    for (const part of relativePath.split('/')) {
        if (!part || part === '.') continue;
        if (part === '..') {
            baseSegments.pop();
            continue;
        }
        baseSegments.push(part);
    }

    return baseSegments.join('/');
}

function toAssetRelativePath(contentPath: string, relativePath: string): string {
    const resolvedPath = resolveContentRelativePath(contentPath, relativePath);
    const articleDirectory = path.posix.dirname(contentPath);
    if (resolvedPath.startsWith(`${articleDirectory}/`)) {
        return resolvedPath.slice(articleDirectory.length + 1);
    }
    return resolvedPath;
}

export function buildArticleAssetUrl(
    entry: Pick<ArticleDirectoryEntry, 'site' | 'slug' | 'sourceType' | 'assetBasePath'>,
    relativePath: string,
): string {
    const sanitizedPath = relativePath.replace(/^\/+/, '');
    if (entry.sourceType === 'r2') {
        return joinPublicUrl(entry.assetBasePath, sanitizedPath);
    }
    return `/api/article-assets/${entry.site}/${entry.slug}/${sanitizedPath}`.replace(/\/+/g, '/');
}

function isValidPublishedArticle(article: ArticleSourceManifestArticle): boolean {
    return article.status === 'published';
}

function resolveCategoryName(categories: ArticleSourceCategory[] | undefined, code: string): string {
    return categories?.find((category) => category.code === code)?.name || code;
}

function deriveCategories(manifest: ArticleSourceManifest): ArticleSourceCategory[] {
    if (Array.isArray(manifest.categories) && manifest.categories.length > 0) {
        return manifest.categories;
    }

    return Array.from(new Set(
        manifest.articles
            .filter(isValidPublishedArticle)
            .map((article) => article.category)
            .filter(Boolean)
    )).map((code) => ({
        code,
        name: DEFAULT_CATEGORY_NAMES[code] || code,
    }));
}

function mapManifestArticle(
    config: ArticleSourceConfig,
    manifest: ArticleSourceManifest,
    article: ArticleSourceManifestArticle,
    categories: ArticleSourceCategory[],
): ArticleDirectoryEntry {
    const coverAssetPath = toAssetRelativePath(article.contentPath, article.coverImage);
    const localContentFilePath = config.type === 'local'
        ? buildAbsoluteSourcePath(config, article.contentPath)
        : undefined;
    const r2ContentKey = config.type === 'r2'
        ? joinR2Key(config.prefix, article.contentPath)
        : undefined;
    const assetBasePath = config.type === 'r2'
        ? joinPublicUrl(config.publicBaseUrl, path.posix.dirname(article.contentPath))
        : `/api/article-assets/${manifest.site}/${article.slug}`;
    const contentLocator = config.type === 'r2'
        ? `r2:${config.bucket}/${r2ContentKey}`
        : `local:${localContentFilePath}`;

    return {
        id: article.id,
        site: manifest.site,
        source: manifest.source,
        sourceType: config.type,
        slug: article.slug,
        title: article.title,
        summary: article.summary,
        category: article.category,
        categoryName: resolveCategoryName(categories, article.category),
        author: article.author,
        originalUrl: article.originalUrl,
        sourcePlatform: article.sourcePlatform,
        type: article.type,
        assetBasePath,
        coverImagePath: article.coverImage,
        coverUrl: config.type === 'r2'
            ? joinPublicUrl(assetBasePath, coverAssetPath)
            : buildArticleAssetUrl({
                site: manifest.site,
                slug: article.slug,
                sourceType: config.type,
                assetBasePath,
            }, coverAssetPath),
        contentPath: article.contentPath,
        contentLocator,
        contentFilePath: localContentFilePath,
        contentBucket: config.type === 'r2' ? config.bucket : undefined,
        contentKey: r2ContentKey,
        publishedAt: article.publishedAt,
        updatedAt: article.updatedAt ?? null,
        seoTitle: article.seoTitle,
        seoDescription: article.seoDescription,
        seoKeywords: article.seoKeywords,
        tags: article.tags,
    };
}

async function fetchSourceManifest(config: ArticleSourceConfig): Promise<ArticleSourceManifest> {
    if (config.type === 'r2') {
        const manifestKey = joinR2Key(config.prefix, config.manifestPath);
        const manifest = JSON.parse(await readR2ObjectText(config.bucket, manifestKey)) as ArticleSourceManifest;
        return manifest;
    }

    const manifestFilePath = buildAbsoluteSourcePath(config, config.manifestPath);
    const manifest = JSON.parse(await fs.readFile(manifestFilePath, 'utf-8')) as ArticleSourceManifest;
    return manifest;
}

function sortEntriesNewestFirst(entries: ArticleDirectoryEntry[]): ArticleDirectoryEntry[] {
    return [...entries].sort((left, right) => {
        const leftTime = new Date(left.updatedAt || left.publishedAt).getTime();
        const rightTime = new Date(right.updatedAt || right.publishedAt).getTime();
        return rightTime - leftTime;
    });
}

export async function fetchAggregatedArticleDirectory(options?: {
    forceRefresh?: boolean;
}): Promise<ArticleDirectorySnapshot> {
    void options;

    const configs = loadArticleSourceConfigs();
    if (configs.length === 0) {
        return { entries: [], categoriesBySite: {} };
    }

    const manifests = await Promise.all(
        configs.map(async (config) => ({ config, manifest: await fetchSourceManifest(config) }))
    );

    const categoriesBySite: Record<string, ArticleSourceCategory[]> = {};
    const entries: ArticleDirectoryEntry[] = [];

    for (const { config, manifest } of manifests) {
        const categories = deriveCategories(manifest);
        categoriesBySite[manifest.site] = categories;

        for (const article of manifest.articles.filter(isValidPublishedArticle)) {
            entries.push(mapManifestArticle(config, manifest, article, categories));
        }
    }

    return {
        entries: sortEntriesNewestFirst(entries),
        categoriesBySite,
    };
}

export async function fetchArticleMarkdown(
    entry: Pick<ArticleDirectoryEntry, 'sourceType' | 'contentLocator' | 'contentFilePath' | 'contentBucket' | 'contentKey'>,
    options?: { forceRefresh?: boolean }
): Promise<string> {
    void options;

    if (entry.sourceType === 'r2') {
        if (!entry.contentBucket) throw new Error('R2 article entry is missing contentBucket');
        if (!entry.contentKey) throw new Error('R2 article entry is missing contentKey');
        return readR2ObjectText(entry.contentBucket, entry.contentKey);
    }

    if (!entry.contentFilePath) throw new Error('Local article entry is missing contentFilePath');
    return fs.readFile(entry.contentFilePath, 'utf-8');
}

export async function getArticleDirectoryEntry(
    site: string,
    slug: string,
): Promise<ArticleDirectoryEntry | null> {
    const snapshot = await fetchAggregatedArticleDirectory();
    return snapshot.entries.find((entry) => entry.site === site && entry.slug === slug) || null;
}

export function resolveEntryAssetFilePath(entry: ArticleDirectoryEntry, relativePath: string): string {
    if (!entry.contentFilePath) {
        throw new Error('Article entry does not have a local content file path');
    }

    const articleDirectory = path.dirname(entry.contentFilePath);
    const normalizedPath = path.normalize(path.join(articleDirectory, relativePath));
    const normalizedArticleDirectory = path.normalize(articleDirectory);

    if (!normalizedPath.startsWith(`${normalizedArticleDirectory}${path.sep}`) && normalizedPath !== normalizedArticleDirectory) {
        throw new Error('Asset path escapes article directory');
    }

    return normalizedPath;
}

export function clearArticleDirectoryCache(): void {
    // Legacy no-op: public article pages use ISR/static output as the cache layer.
}
