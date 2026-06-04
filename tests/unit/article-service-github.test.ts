import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    fetchAggregatedArticleDirectory,
    fetchArticleMarkdown,
    type ArticleDirectorySnapshot,
} from '@/lib/articles/article-directory';

vi.mock('@/lib/articles/article-directory', () => ({
    fetchAggregatedArticleDirectory: vi.fn(),
    fetchArticleMarkdown: vi.fn(),
    buildArticleAssetUrl: (entry: { site: string; slug: string }, relativePath: string) =>
        `/api/article-assets/${entry.site}/${entry.slug}/${relativePath}`,
}));

const directoryFixture: ArticleDirectorySnapshot = {
    categoriesBySite: {
        ai: [{ code: 'ai-tech', name: 'AI技术' }],
        finance: [{ code: 'macro', name: '宏观' }],
    },
    entries: [
        {
            id: 'finance-1',
            site: 'finance',
            source: 'finance-digest',
            sourceType: 'local',
            slug: 'fed-notes',
            title: 'Fed Notes',
            summary: 'Fed summary',
            category: 'macro',
            categoryName: '宏观',
            author: '@macro',
            originalUrl: 'https://example.com/fed-notes',
            sourcePlatform: 'website',
            type: 'article',
            assetBasePath: '/api/article-assets/finance/fed-notes',
            coverImagePath: 'articles/fed-notes/images/cover.jpg',
            coverUrl: '/api/article-assets/finance/fed-notes/images/cover.jpg',
            contentPath: 'articles/fed-notes/index.md',
            contentLocator: 'local:/data/content/finance-digest/articles/fed-notes/index.md',
            contentFilePath: '/data/content/finance-digest/articles/fed-notes/index.md',
            publishedAt: '2026-04-21T11:00:00+08:00',
            updatedAt: '2026-04-21T11:30:00+08:00',
        },
        {
            id: 'ai-1',
            site: 'ai',
            source: 'web-article',
            sourceType: 'local',
            slug: 'prompt-caching',
            title: 'Prompt Caching',
            summary: 'Caching summary',
            category: 'ai-tech',
            categoryName: 'AI技术',
            author: '@_avichawla',
            originalUrl: 'https://x.com/example/1',
            sourcePlatform: 'x',
            type: 'tweet',
            assetBasePath: '/api/article-assets/ai/prompt-caching',
            coverImagePath: 'articles/published/prompt-caching/images/cover.jpg',
            coverUrl: '/api/article-assets/ai/prompt-caching/images/cover.jpg',
            contentPath: 'articles/published/prompt-caching/index.md',
            contentLocator: 'local:/data/content/web-article/articles/published/prompt-caching/index.md',
            contentFilePath: '/data/content/web-article/articles/published/prompt-caching/index.md',
            publishedAt: '2026-04-20T12:20:00+08:00',
            updatedAt: '2026-04-20T12:20:00+08:00',
        },
        {
            id: 'ai-2',
            site: 'ai',
            source: 'web-article',
            sourceType: 'local',
            slug: 'agent-loops',
            title: 'Agent Loops',
            summary: 'Agent summary',
            category: 'ai-tech',
            categoryName: 'AI技术',
            author: '@agent',
            originalUrl: 'https://x.com/example/2',
            sourcePlatform: 'x',
            type: 'tweet',
            assetBasePath: '/api/article-assets/ai/agent-loops',
            coverImagePath: 'articles/published/agent-loops/images/cover.jpg',
            coverUrl: '/api/article-assets/ai/agent-loops/images/cover.jpg',
            contentPath: 'articles/published/agent-loops/index.md',
            contentLocator: 'local:/data/content/web-article/articles/published/agent-loops/index.md',
            contentFilePath: '/data/content/web-article/articles/published/agent-loops/index.md',
            publishedAt: '2026-04-19T09:00:00+08:00',
            updatedAt: '2026-04-19T09:00:00+08:00',
        },
    ],
};

describe('article service backed by GitHub sources', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(fetchAggregatedArticleDirectory).mockResolvedValue(directoryFixture);
        vi.mocked(fetchArticleMarkdown).mockResolvedValue(`---
title: "Prompt Caching"
summary: "Caching summary"
---

开头段落。

![封面](images/cover.jpg)
`);
    });

    it('defaults list queries to the AI site and keeps category names from the manifest', async () => {
        const { getPagedArticles } = await import('@/lib/services/article-service');

        const result = await getPagedArticles(1, 10);

        expect(result.items.map((item) => item.slug)).toEqual(['prompt-caching', 'agent-loops']);
        expect(result.items[0].site).toBe('ai');
        expect(result.items[0].categoryName).toBe('AI技术');
    });

    it('filters related articles within the same site only', async () => {
        const { getRelatedArticles } = await import('@/lib/services/article-service');

        const related = await getRelatedArticles('ai-tech', 'prompt-caching', 6, { site: 'ai' });

        expect(related.map((item) => item.slug)).toEqual(['agent-loops']);
    });

    it('returns article detail with frontmatter removed and relative images rewritten to local asset URLs', async () => {
        const { getArticleBySlug } = await import('@/lib/services/article-service');

        const article = await getArticleBySlug('prompt-caching');

        expect(article?.content).toContain('开头段落。');
        expect(article?.content).not.toContain('title: "Prompt Caching"');
        expect(article?.content).toContain(
            '![封面](/api/article-assets/ai/prompt-caching/images/cover.jpg)'
        );
        expect(article?.author).toBe('@_avichawla');
        expect(article?.originalUrl).toBe('https://x.com/example/1');
    });
});
