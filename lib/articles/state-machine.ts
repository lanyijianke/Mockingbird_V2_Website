import crypto from 'crypto';
import type { ArticleSourceManifest, ArticleSourceStatus } from './source-types';

const ALLOWED_TRANSITIONS: Record<ArticleSourceStatus, ArticleSourceStatus[]> = {
    draft: ['review'],
    review: ['draft', 'scheduled', 'published'],
    scheduled: ['review', 'published'],
    published: ['archived'],
    archived: ['published'],
};

function normalizePrefix(prefix: string): string {
    return prefix.replace(/^\/+|\/+$/g, '');
}

export function assertArticleStateTransition(from: ArticleSourceStatus, to: ArticleSourceStatus): void {
    if (!ALLOWED_TRANSITIONS[from]?.includes(to)) {
        throw new Error(`Invalid article state transition: ${from} -> ${to}`);
    }
}

export function buildArticleStateKey(sitePrefix: string, slug: string): string {
    return `${normalizePrefix(sitePrefix)}/state/articles/${slug}.json`;
}

export function buildArticleContentPath(state: ArticleSourceStatus, slug: string): string {
    return `articles/${state}/${slug}/index.md`;
}

export function buildManifestSnapshotKey(sitePrefix: string, revision: string): string {
    return `${normalizePrefix(sitePrefix)}/manifests/${revision}.json`;
}

export function createSha256Checksum(content: string | Uint8Array): string {
    return `sha256:${crypto.createHash('sha256').update(content).digest('hex')}`;
}

export function filterPublishedManifest(manifest: ArticleSourceManifest): ArticleSourceManifest {
    return {
        ...manifest,
        articles: manifest.articles.filter((article) => article.status === 'published'),
    };
}
