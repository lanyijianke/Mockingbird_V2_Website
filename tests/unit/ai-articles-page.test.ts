import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
    mockGetArticleCategories,
    mockGetPagedArticles,
} = vi.hoisted(() => ({
    mockGetArticleCategories: vi.fn(),
    mockGetPagedArticles: vi.fn(),
}));

vi.mock('next/image', () => ({
    default: (props: React.ImgHTMLAttributes<HTMLImageElement>) => React.createElement('img', props),
}));

vi.mock('next/link', () => ({
    default: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) =>
        React.createElement('a', { href, ...props }, children),
}));

vi.mock('@/lib/services/article-service', () => ({
    getArticleCategories: mockGetArticleCategories,
    getPagedArticles: mockGetPagedArticles,
}));

describe('AI articles page', () => {
    beforeEach(() => {
        vi.resetModules();
        vi.clearAllMocks();
        mockGetArticleCategories.mockResolvedValue([
            { code: 'agents', name: 'Agents', count: 1 },
        ]);
        mockGetPagedArticles.mockResolvedValue({
            items: [
                {
                    id: 'article-1',
                    title: 'Agent Workflow',
                    slug: 'agent-workflow',
                    summary: 'Article summary',
                    category: 'agents',
                    categoryName: 'Agents',
                    coverUrl: null,
                    createdAt: '2026-05-20T00:00:00.000Z',
                    viewCount: 12,
                },
            ],
            page: 1,
            pageSize: 10,
            totalPages: 1,
            total: 1,
        });
    });

    it('links article cards with returnTo including the active list filter and card anchor', async () => {
        const { default: AiArticlesPage } = await import('@/app/ai/articles/page');

        const html = renderToStaticMarkup(await AiArticlesPage({
            searchParams: Promise.resolve({ category: 'agents', q: 'workflow' }),
        }));

        expect(html).toContain('id="article-agent-workflow"');
        expect(html).toContain(
            'href="/ai/articles/agent-workflow?returnTo=%2Fai%2Farticles%3Fcategory%3Dagents%26q%3Dworkflow%23article-agent-workflow"'
        );
    });
});
