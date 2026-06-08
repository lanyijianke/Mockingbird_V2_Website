import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/articles/article-directory', () => ({
    fetchAggregatedArticleDirectory: vi.fn(),
    fetchArticleMarkdown: vi.fn(),
    buildArticleAssetUrl: vi.fn((entry, relativePath: string) => {
        if (entry.sourceType === 'r2') {
            return `${entry.assetBasePath.replace(/\/+$/g, '')}/${relativePath.replace(/^\/+/, '')}`;
        }
        return `/api/article-assets/${entry.site}/${entry.slug}/${relativePath}`;
    }),
}));

describe('article service backed by R2 sources', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('rewrites relative markdown images to the R2 public base URL', async () => {
        const { fetchAggregatedArticleDirectory, fetchArticleMarkdown } = await import('@/lib/articles/article-directory');
        vi.mocked(fetchAggregatedArticleDirectory).mockResolvedValue({
            categoriesBySite: { ai: [{ code: 'engineering', name: '工程架构' }] },
            entries: [
                {
                    id: 'ai-1',
                    site: 'ai',
                    source: 'web-article',
                    sourceType: 'r2',
                    slug: 'prompt-caching',
                    title: 'Prompt Caching',
                    summary: 'summary',
                    category: 'engineering',
                    categoryName: '工程架构',
                    author: '@author',
                    originalUrl: 'https://example.com/prompt-caching',
                    sourcePlatform: 'website',
                    type: 'article',
                    assetBasePath: 'https://assets.zgnknowledge.online/ai/articles/prompt-caching',
                    coverImagePath: 'images/cover.jpg',
                    coverUrl: 'https://assets.zgnknowledge.online/ai/articles/prompt-caching/images/cover.jpg',
                    contentPath: 'articles/prompt-caching/index.md',
                    contentLocator: 'r2:knowledge-articles/ai/articles/prompt-caching/index.md',
                    contentBucket: 'knowledge-articles',
                    contentKey: 'ai/articles/prompt-caching/index.md',
                    publishedAt: '2026-04-20T12:20:00+08:00',
                    updatedAt: null,
                },
            ],
        });
        vi.mocked(fetchArticleMarkdown).mockResolvedValue('---\ntitle: test\n---\n\n![封面](images/cover.jpg)');

        const { getArticleBySlug } = await import('@/lib/services/article-service');
        const article = await getArticleBySlug('prompt-caching', { site: 'ai' });

        expect(article?.content).toContain('![封面](https://assets.zgnknowledge.online/ai/articles/prompt-caching/images/cover.jpg)');
    });
});
