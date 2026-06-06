import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    clearArticleDirectoryCache,
    fetchAggregatedArticleDirectory,
    fetchArticleMarkdown,
} from '@/lib/articles/article-directory';

vi.mock('@/lib/articles/r2-client', () => ({
    readR2ObjectText: vi.fn(),
}));

const ORIGINAL_R2_SOURCES = process.env.KNOWLEDGE_ARTICLE_R2_SOURCES;
const ORIGINAL_LOCAL_SOURCES = process.env.ARTICLE_LOCAL_SOURCES;

describe('R2 article directory', () => {
    afterEach(() => {
        clearArticleDirectoryCache();
        if (ORIGINAL_R2_SOURCES === undefined) delete process.env.KNOWLEDGE_ARTICLE_R2_SOURCES;
        else process.env.KNOWLEDGE_ARTICLE_R2_SOURCES = ORIGINAL_R2_SOURCES;
        if (ORIGINAL_LOCAL_SOURCES === undefined) delete process.env.ARTICLE_LOCAL_SOURCES;
        else process.env.ARTICLE_LOCAL_SOURCES = ORIGINAL_LOCAL_SOURCES;
        vi.clearAllMocks();
    });

    it('aggregates published articles from an R2 manifest and builds public asset URLs', async () => {
        process.env.KNOWLEDGE_ARTICLE_R2_SOURCES = JSON.stringify([
            {
                site: 'ai',
                source: 'web-article',
                bucket: 'knowledge-articles',
                prefix: 'ai',
                manifestPath: 'manifest.json',
                publicBaseUrl: 'https://assets.zgnknowledge.online/ai',
            },
        ]);
        delete process.env.ARTICLE_LOCAL_SOURCES;

        const { readR2ObjectText } = await import('@/lib/articles/r2-client');
        vi.mocked(readR2ObjectText).mockResolvedValueOnce(JSON.stringify({
            site: 'ai',
            source: 'web-article',
            categories: [{ code: 'ai-tech', name: 'AI技术' }],
            articles: [
                {
                    id: 'ai-1',
                    slug: 'prompt-caching',
                    title: 'Prompt Caching',
                    summary: 'summary',
                    category: 'ai-tech',
                    author: '@author',
                    originalUrl: 'https://example.com/prompt-caching',
                    sourcePlatform: 'website',
                    type: 'article',
                    coverImage: 'images/cover.jpg',
                    contentPath: 'articles/prompt-caching/index.md',
                    publishedAt: '2026-04-20T12:20:00+08:00',
                    updatedAt: '2026-04-20T12:20:00+08:00',
                    status: 'published',
                },
            ],
        }));

        const directory = await fetchAggregatedArticleDirectory({ forceRefresh: true });

        expect(readR2ObjectText).toHaveBeenCalledWith('knowledge-articles', 'ai/manifest.json');
        expect(directory.entries[0]).toMatchObject({
            site: 'ai',
            source: 'web-article',
            sourceType: 'r2',
            slug: 'prompt-caching',
            assetBasePath: 'https://assets.zgnknowledge.online/ai/articles/prompt-caching',
            coverUrl: 'https://assets.zgnknowledge.online/ai/articles/prompt-caching/images/cover.jpg',
            contentPath: 'articles/prompt-caching/index.md',
            contentBucket: 'knowledge-articles',
            contentKey: 'ai/articles/prompt-caching/index.md',
        });
    });

    it('reads article markdown from R2 using the entry locator', async () => {
        process.env.KNOWLEDGE_ARTICLE_R2_SOURCES = JSON.stringify([
            {
                site: 'ai',
                source: 'web-article',
                bucket: 'knowledge-articles',
                prefix: 'ai',
                manifestPath: 'manifest.json',
                publicBaseUrl: 'https://assets.zgnknowledge.online/ai',
            },
        ]);
        delete process.env.ARTICLE_LOCAL_SOURCES;

        const { readR2ObjectText } = await import('@/lib/articles/r2-client');
        vi.mocked(readR2ObjectText)
            .mockResolvedValueOnce(JSON.stringify({
                site: 'ai',
                source: 'web-article',
                articles: [
                    {
                        id: 'ai-1',
                        slug: 'prompt-caching',
                        title: 'Prompt Caching',
                        summary: 'summary',
                        category: 'ai-tech',
                        author: '@author',
                        originalUrl: 'https://example.com/prompt-caching',
                        sourcePlatform: 'website',
                        type: 'article',
                        coverImage: 'images/cover.jpg',
                        contentPath: 'articles/prompt-caching/index.md',
                        publishedAt: '2026-04-20T12:20:00+08:00',
                        status: 'published',
                    },
                ],
            }))
            .mockResolvedValueOnce('# Prompt Caching\n\nhello');

        const directory = await fetchAggregatedArticleDirectory({ forceRefresh: true });
        await expect(fetchArticleMarkdown(directory.entries[0], { forceRefresh: true })).resolves.toBe('# Prompt Caching\n\nhello');

        expect(readR2ObjectText).toHaveBeenLastCalledWith('knowledge-articles', 'ai/articles/prompt-caching/index.md');
    });

    it('supports state-machine published article paths from R2 manifests', async () => {
        process.env.KNOWLEDGE_ARTICLE_R2_SOURCES = JSON.stringify([
            {
                site: 'ai',
                source: 'web-article',
                bucket: 'knowledge-articles',
                prefix: 'ai',
                manifestPath: 'manifest.json',
                publicBaseUrl: 'https://assets.zgnknowledge.online/ai',
            },
        ]);
        delete process.env.ARTICLE_LOCAL_SOURCES;

        const { readR2ObjectText } = await import('@/lib/articles/r2-client');
        vi.mocked(readR2ObjectText).mockResolvedValueOnce(JSON.stringify({
            schemaVersion: 1,
            site: 'ai',
            source: 'web-article',
            revision: '2026-06-03T10-00-00-000Z',
            articles: [
                {
                    id: 'ai-1',
                    slug: 'stateful-publish',
                    title: 'Stateful Publish',
                    summary: 'summary',
                    category: 'ai-tech',
                    author: '@author',
                    originalUrl: 'https://example.com/stateful-publish',
                    sourcePlatform: 'website',
                    type: 'article',
                    coverImage: 'images/cover.jpg',
                    contentPath: 'articles/published/stateful-publish/index.md',
                    publishedAt: '2026-06-03T10:00:00.000Z',
                    updatedAt: '2026-06-03T10:00:00.000Z',
                    status: 'published',
                    stateVersion: 1,
                    checksum: 'sha256:test',
                },
            ],
        }));

        const directory = await fetchAggregatedArticleDirectory({ forceRefresh: true });

        expect(directory.entries[0]).toMatchObject({
            slug: 'stateful-publish',
            assetBasePath: 'https://assets.zgnknowledge.online/ai/articles/published/stateful-publish',
            coverUrl: 'https://assets.zgnknowledge.online/ai/articles/published/stateful-publish/images/cover.jpg',
            contentKey: 'ai/articles/published/stateful-publish/index.md',
        });
    });

    it('falls back to the site default cover when an R2 manifest contains an external cover URL', async () => {
        process.env.KNOWLEDGE_ARTICLE_R2_SOURCES = JSON.stringify([
            {
                site: 'ai',
                source: 'web-article',
                bucket: 'knowledge-articles',
                prefix: 'ai',
                manifestPath: 'manifest.json',
                publicBaseUrl: 'https://assets.zgnknowledge.online/ai',
            },
        ]);
        delete process.env.ARTICLE_LOCAL_SOURCES;

        const { readR2ObjectText } = await import('@/lib/articles/r2-client');
        vi.mocked(readR2ObjectText).mockResolvedValueOnce(JSON.stringify({
            site: 'ai',
            source: 'web-article',
            articles: [
                {
                    id: 'ai-1',
                    slug: 'external-cover',
                    title: 'External Cover',
                    summary: 'summary',
                    category: 'ai-tech',
                    author: '@author',
                    originalUrl: 'https://example.com/external-cover',
                    sourcePlatform: 'website',
                    type: 'article',
                    coverImage: 'https://cdn.example.com/cover.png',
                    contentPath: 'articles/published/external-cover/index.md',
                    publishedAt: '2026-06-04T10:00:00.000Z',
                    status: 'published',
                },
            ],
        }));

        const directory = await fetchAggregatedArticleDirectory({ forceRefresh: true });

        expect(directory.entries[0]).toMatchObject({
            slug: 'external-cover',
            coverImagePath: '',
            coverUrl: '/images/default-cover.png',
        });
    });
});
