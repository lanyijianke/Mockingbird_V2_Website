export type ArticleSite = 'ai' | 'finance' | string;

export interface LocalArticleSourceConfig {
    type: 'local';
    site: ArticleSite;
    source: string;
    rootPath: string;
    manifestPath: string;
}

export interface R2ArticleSourceConfig {
    type: 'r2';
    site: ArticleSite;
    source: string;
    bucket: string;
    prefix: string;
    manifestPath: string;
    publicBaseUrl: string;
}

export type ArticleSourceConfig = LocalArticleSourceConfig | R2ArticleSourceConfig;

export type ArticleSourceStatus =
    | 'draft'
    | 'review'
    | 'scheduled'
    | 'published'
    | 'archived';

export interface ArticleStateDocument {
    schemaVersion: 1;
    site: ArticleSite;
    source: string;
    slug: string;
    state: ArticleSourceStatus;
    version: number;
    contentKey: string;
    assetPrefix: string;
    manifestSnapshotKey?: string;
    checksum: string;
    updatedAt: string;
    updatedBy: string;
}

export interface ArticleSourceCategory {
    code: string;
    name: string;
}

export interface ArticleSourceManifestArticle {
    id: string;
    slug: string;
    title: string;
    summary: string;
    category: string;
    author: string;
    originalUrl: string;
    sourcePlatform: string;
    type: string;
    coverImage: string;
    contentPath: string;
    publishedAt: string;
    updatedAt?: string;
    status: ArticleSourceStatus;
    stateVersion?: number;
    checksum?: string;
    seoTitle?: string;
    seoDescription?: string;
    seoKeywords?: string;
    tags?: string[];
}

export interface ArticleSourceManifest {
    schemaVersion?: 1;
    site: ArticleSite;
    source: string;
    revision?: string;
    updatedAt?: string;
    categories?: ArticleSourceCategory[];
    articles: ArticleSourceManifestArticle[];
}
