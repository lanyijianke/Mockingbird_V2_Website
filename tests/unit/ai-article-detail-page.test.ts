import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const ORIGINAL_SITE_URL = process.env.SITE_URL;

const {
    mockGetAllSlugs,
    mockGetArticleBySlug,
    mockGetRelatedArticles,
} = vi.hoisted(() => ({
    mockGetAllSlugs: vi.fn(),
    mockGetArticleBySlug: vi.fn(),
    mockGetRelatedArticles: vi.fn(),
}));

vi.mock('@/lib/services/article-service', () => ({
    getAllSlugs: mockGetAllSlugs,
    getArticleBySlug: mockGetArticleBySlug,
    getRelatedArticles: mockGetRelatedArticles,
}));

vi.mock('@/app/articles/[slug]/ArticleReaderClient', () => ({
    default: ({ articleUrl }: { articleUrl: string }) => React.createElement('div', {
        'data-testid': 'article-reader',
        'data-article-url': articleUrl,
    }),
}));

vi.mock('unified', () => ({
    unified: () => {
        const processor = {
            use: () => processor,
            process: vi.fn(async () => '<p>rendered article</p>'),
        };
        return processor;
    },
}));

vi.mock('remark-parse', () => ({ default: () => undefined }));
vi.mock('remark-gfm', () => ({ default: () => undefined }));
vi.mock('remark-rehype', () => ({ default: () => undefined }));
vi.mock('rehype-slug', () => ({ default: () => undefined }));
vi.mock('rehype-highlight', () => ({ default: () => undefined }));
vi.mock('rehype-stringify', () => ({ default: () => undefined }));

describe('AI article detail page', () => {
    beforeEach(() => {
        vi.resetModules();
        vi.clearAllMocks();
        process.env.SITE_URL = 'https://zgnknowledge.online';
        mockGetAllSlugs.mockResolvedValue(['agent-workflow']);
        mockGetRelatedArticles.mockResolvedValue([]);
        mockGetArticleBySlug.mockResolvedValue({
            id: 'article-1',
            site: 'ai',
            title: 'Agent Workflow',
            slug: 'agent-workflow',
            summary: 'Article summary',
            category: 'agents',
            categoryName: 'Agents',
            status: 'published',
            coverUrl: null,
            createdAt: '2026-05-20T00:00:00.000Z',
            updatedAt: null,
            viewCount: null,
            content: '# Agent Workflow\n\nBody',
            renderedHtml: null,
            author: 'Author',
            originalUrl: null,
            sourcePlatform: 'local',
            type: 'article',
            seoTitle: null,
            seoDescription: null,
            seoKeywords: null,
        });
    });

    afterEach(() => {
        if (ORIGINAL_SITE_URL === undefined) {
            delete process.env.SITE_URL;
        } else {
            process.env.SITE_URL = ORIGINAL_SITE_URL;
        }
    });

    it('passes an absolute public URL to the article reader share control', async () => {
        const { default: AiArticleDetailPage } = await import('@/app/ai/articles/[slug]/page');

        const html = renderToStaticMarkup(await AiArticleDetailPage({
            params: Promise.resolve({ slug: 'agent-workflow' }),
        }));

        expect(html).toContain('data-article-url="https://zgnknowledge.online/ai/articles/agent-workflow"');
    });
});
