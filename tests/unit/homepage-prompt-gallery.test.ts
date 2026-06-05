import React from 'react';
import fs from 'node:fs';
import path from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const globalsCssPath = path.resolve(
    __dirname,
    '../../app/_styles/editorial.css'
);

const {
    mockGetArticleCategories,
    mockGetTopArticles,
    mockGetArticleCount,
    mockGetPagedPrompts,
    mockQueryScalar,
} = vi.hoisted(() => ({
    mockGetArticleCategories: vi.fn(),
    mockGetTopArticles: vi.fn(),
    mockGetArticleCount: vi.fn(),
    mockGetPagedPrompts: vi.fn(),
    mockQueryScalar: vi.fn(),
}));

vi.mock('next/image', async () => {
    const ReactModule = await import('react');

    return {
        default: (props: Record<string, unknown>) => ReactModule.createElement('img', props),
    };
});

vi.mock('next/link', async () => {
    const ReactModule = await import('react');

    return {
        default: ({
            href,
            children,
            ...props
        }: {
            href: string;
            children: React.ReactNode;
        }) => ReactModule.createElement('a', { href, ...props }, children),
    };
});

vi.mock('@/lib/services/article-service', async () => {
    const actual = await vi.importActual<typeof import('@/lib/services/article-service')>('@/lib/services/article-service');
    return {
        ...actual,
        getArticleCategories: mockGetArticleCategories,
        getTopArticles: mockGetTopArticles,
        getTotalCount: mockGetArticleCount,
    };
});

vi.mock('@/lib/services/prompt-service', async () => {
    const actual = await vi.importActual<typeof import('@/lib/services/prompt-service')>('@/lib/services/prompt-service');
    return {
        ...actual,
        getPagedPrompts: mockGetPagedPrompts,
    };
});

vi.mock('@/lib/db', async () => {
    const actual = await vi.importActual<typeof import('@/lib/db')>('@/lib/db');
    return {
        ...actual,
        queryScalar: mockQueryScalar,
    };
});

function buildPrompt(id: number, title: string, category: string) {
    return {
        id,
        title,
        description: null,
        content: 'prompt body',
        category,
        coverImageUrl: null,
        videoPreviewUrl: null,
        cardPreviewVideoUrl: null,
        author: null,
        sourceUrl: null,
        imagesJson: null,
        copyCount: 1,
        isActive: true,
        createdAt: '2026-04-24T00:00:00.000Z',
        updatedAt: null,
    };
}

describe('homepage prompt gallery', () => {
    beforeEach(() => {
        vi.resetModules();
        vi.clearAllMocks();

        mockGetArticleCategories.mockResolvedValue([]);
        mockGetTopArticles.mockResolvedValue([]);
        mockGetArticleCount.mockResolvedValue(0);
        mockQueryScalar.mockResolvedValue(2);
        mockGetPagedPrompts.mockImplementation(async (_page: number, pageSize: number, category?: string) => ({
            items: category === 'gemini-3'
                ? [buildPrompt(101, 'Gemini 最新提示词', 'gemini-3')].slice(0, pageSize)
                : category === 'gpt-image-2'
                    ? [buildPrompt(202, 'GPT Image 2 最新提示词', 'gpt-image-2')].slice(0, pageSize)
                    : [],
            page: 1,
            pageSize,
            totalCount: category === 'gemini-3' || category === 'gpt-image-2' ? 1 : 0,
            totalPages: 1,
        }));
    });

    it('renders model prompt groups that link to list filters instead of SEO category pages', async () => {
        const { default: HomePage } = await import('@/app/page');
        const html = renderToStaticMarkup(await HomePage());

        expect(mockGetPagedPrompts).toHaveBeenCalledWith(1, 8, 'gemini-3');
        expect(mockGetPagedPrompts).toHaveBeenCalledWith(1, 8, 'gpt-image-2');
        expect(html).toContain('模型提示词画廊');
        expect(html).toContain('Gemini 最新提示词');
        expect(html).toContain('GPT Image 2 最新提示词');
        expect(html).toContain('href="/ai/prompts?category=gemini-3"');
        expect(html).toContain('href="/ai/prompts?category=gpt-image-2"');
        expect(html).not.toContain('/ai/prompts/categories/');
    });

    it('uses ISR so the homepage static output is the public cache layer', async () => {
        const homeRoute = await import('@/app/page');
        const aiRoute = await import('@/app/ai/page');

        expect(homeRoute.revalidate).toBe(300);
        expect(aiRoute.revalidate).toBe(300);
    });

    it('prioritizes GPT Image 2 before older model sections on the homepage', async () => {
        const { default: HomePage } = await import('@/app/page');
        const html = renderToStaticMarkup(await HomePage());

        expect(html.indexOf('GPT Image 2')).toBeGreaterThanOrEqual(0);
        expect(html.indexOf('Gemini 3')).toBeGreaterThanOrEqual(0);
        expect(html.indexOf('GPT Image 2')).toBeLessThan(html.indexOf('Gemini 3'));
    });

    it('shows the live homepage summary with 3 public ranking pages', async () => {
        mockGetArticleCount.mockResolvedValue(12);
        mockQueryScalar.mockResolvedValue(3456);

        const { default: HomePage } = await import('@/app/page');
        const html = renderToStaticMarkup(await HomePage());

        expect(html).toContain('已收录');
        expect(html).toContain('<strong>12</strong>');
        expect(html).toContain('<strong>3,456</strong>');
        expect(html).toContain('<strong>3</strong>');
        expect(html).toContain('个榜单');
        expect(html).not.toContain('<strong>4</strong>个榜单');
    });

    it('keeps the desktop hero article as the first mobile editorial item', () => {
        const css = fs.readFileSync(globalsCssPath, 'utf-8');
        const mobileResponsiveBlock = css.match(/@media \(max-width: 768px\) \{[\s\S]*?\.category-group-list\s*\{[\s\S]*?\}\s*\}/);
        const editorialCenterBlock = mobileResponsiveBlock?.[0].match(/\.editorial-center\s*\{[\s\S]*?\}/);

        expect(editorialCenterBlock?.[0]).toContain('order: -1;');
    });
});
