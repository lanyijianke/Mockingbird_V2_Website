import { describe, expect, it } from 'vitest';
import {
    assertArticleStateTransition,
    buildArticleContentPath,
    buildArticleStateKey,
    buildManifestSnapshotKey,
    createSha256Checksum,
    filterPublishedManifest,
} from '@/lib/articles/state-machine';

describe('article state machine', () => {
    it('allows expected publishing transitions', () => {
        expect(() => assertArticleStateTransition('draft', 'review')).not.toThrow();
        expect(() => assertArticleStateTransition('review', 'published')).not.toThrow();
        expect(() => assertArticleStateTransition('published', 'archived')).not.toThrow();
        expect(() => assertArticleStateTransition('archived', 'published')).not.toThrow();
    });

    it('rejects invalid publishing transitions', () => {
        expect(() => assertArticleStateTransition('draft', 'published')).toThrow(/invalid article state transition/i);
        expect(() => assertArticleStateTransition('archived', 'review')).toThrow(/invalid article state transition/i);
    });

    it('builds stable R2 keys for state and snapshots', () => {
        expect(buildArticleStateKey('ai', 'prompt-caching')).toBe('ai/state/articles/prompt-caching.json');
        expect(buildArticleContentPath('published', 'prompt-caching')).toBe('articles/published/prompt-caching/index.md');
        expect(buildManifestSnapshotKey('ai', '2026-06-03T10-00-00-000Z')).toBe(
            'ai/manifests/2026-06-03T10-00-00-000Z.json',
        );
    });

    it('filters manifest snapshots down to published articles', () => {
        const manifest = filterPublishedManifest({
            site: 'ai',
            source: 'web-article',
            articles: [
                {
                    id: 'ai-1',
                    slug: 'published-one',
                    title: 'Published One',
                    summary: 'summary',
                    category: 'ai-tech',
                    author: 'author',
                    originalUrl: 'https://example.com/published-one',
                    sourcePlatform: 'website',
                    type: 'article',
                    coverImage: 'images/cover.jpg',
                    contentPath: 'articles/published/published-one/index.md',
                    publishedAt: '2026-06-03T10:00:00.000Z',
                    status: 'published',
                },
                {
                    id: 'ai-2',
                    slug: 'draft-one',
                    title: 'Draft One',
                    summary: 'summary',
                    category: 'ai-tech',
                    author: 'author',
                    originalUrl: 'https://example.com/draft-one',
                    sourcePlatform: 'website',
                    type: 'article',
                    coverImage: 'images/cover.jpg',
                    contentPath: 'articles/draft/draft-one/index.md',
                    publishedAt: '2026-06-03T10:00:00.000Z',
                    status: 'draft',
                },
            ],
        });

        expect(manifest.articles.map((article) => article.slug)).toEqual(['published-one']);
    });

    it('creates stable sha256 checksums', () => {
        expect(createSha256Checksum('hello')).toBe(
            'sha256:2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824',
        );
    });
});
