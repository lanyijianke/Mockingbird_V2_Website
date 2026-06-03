import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
    mockGetPromptById,
    mockGetRelatedPrompts,
    mockGetAllPromptIds,
} = vi.hoisted(() => ({
    mockGetPromptById: vi.fn(),
    mockGetRelatedPrompts: vi.fn(),
    mockGetAllPromptIds: vi.fn(),
}));

const promptDetailCssPath = path.resolve(
    __dirname,
    '../../app/ai/prompts/[id]/prompt-detail.css'
);
vi.mock('next/image', () => ({
    default: (props: React.ImgHTMLAttributes<HTMLImageElement>) => React.createElement('img', props),
}));

vi.mock('next/link', () => ({
    default: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) =>
        React.createElement('a', { href, ...props }, children),
}));

vi.mock('next/navigation', () => ({
    notFound: () => {
        throw new Error('NEXT_NOT_FOUND');
    },
}));

vi.mock('@/lib/services/prompt-service', () => ({
    getPromptById: mockGetPromptById,
    getRelatedPrompts: mockGetRelatedPrompts,
    getAllPromptIds: mockGetAllPromptIds,
}));

describe('prompt detail related cards layout', () => {
    beforeEach(() => {
        vi.resetModules();
        vi.clearAllMocks();

        mockGetAllPromptIds.mockResolvedValue([42]);
        mockGetRelatedPrompts.mockResolvedValue([]);
        mockGetPromptById.mockResolvedValue({
            id: 42,
            title: 'Prompt Title',
            description: 'Prompt description',
            content: 'You are a helpful assistant.',
            category: 'gemini-3',
            coverImageUrl: null,
            videoPreviewUrl: null,
            cardPreviewVideoUrl: null,
            author: null,
            sourceUrl: null,
            imagesJson: null,
            copyCount: 12,
            isActive: true,
            createdAt: '2026-04-22T00:00:00.000Z',
            updatedAt: null,
        });
    });

    it('anchors the related card overlay to each card container', () => {
        const css = fs.readFileSync(promptDetailCssPath, 'utf-8');
        const relatedCardBlock = css.match(/\.pd-related-card\s*\{[\s\S]*?\}/);

        expect(relatedCardBlock?.[0]).toContain('position: relative;');
    });

    it('renders an exploration section for internal prompt navigation', async () => {
        const PromptDetailClient = (await import('@/app/ai/prompts/[id]/PromptDetailClient')).default;
        const html = renderToStaticMarkup(
            React.createElement(PromptDetailClient, {
                images: [],
                content: 'You are a helpful assistant.',
                videoUrl: null,
                title: 'Prompt Title',
                categoryName: '图像生成',
                description: 'Prompt description',
                author: 'Author',
                copyCount: 12,
                dateStr: '2026年4月22日',
                sourceUrl: null,
                isJson: false,
                relatedPrompts: [],
                explorationLinks: [
                    {
                        href: '/ai/prompts',
                        title: '浏览更多提示词分类',
                        description: '回到提示词库继续筛选。',
                    },
                    {
                        href: '/ai/rankings/producthunt',
                        title: '查看 ProductHunt 热榜',
                        description: '继续观察最新产品。',
                    },
                ],
            })
        );

        expect(html).toContain('延伸探索');
        expect(html).toContain('浏览更多提示词分类');
        expect(html).toContain('查看 ProductHunt 热榜');
    });

    it('links prompt exploration back to the filterable prompt list instead of SEO category pages', async () => {
        const { default: PromptDetailPage } = await import('@/app/ai/prompts/[id]/page');
        const html = renderToStaticMarkup(await PromptDetailPage({
            params: Promise.resolve({ id: '42' }),
        }));

        expect(html).toContain('href="/ai/prompts?category=gemini-3"');
        expect(html).not.toContain('href="/ai/prompts/categories/gemini-3"');
    });

    it('does not prebuild DB-backed prompt detail pages during production builds', async () => {
        const { generateStaticParams } = await import('@/app/ai/prompts/[id]/page');

        await expect(generateStaticParams()).resolves.toEqual([]);
        expect(mockGetAllPromptIds).not.toHaveBeenCalled();
    });

    it('returns not found for non-numeric prompt ids without querying the database', async () => {
        const { default: PromptDetailPage } = await import('@/app/ai/prompts/[id]/page');

        await expect(PromptDetailPage({
            params: Promise.resolve({ id: 'scenarios' }),
        })).rejects.toThrow('NEXT_NOT_FOUND');

        expect(mockGetPromptById).not.toHaveBeenCalled();
        expect(mockGetRelatedPrompts).not.toHaveBeenCalled();
    });

    it('uses prompt list metadata for non-numeric prompt ids without querying the database', async () => {
        const { generateMetadata } = await import('@/app/ai/prompts/[id]/page');

        const metadata = await generateMetadata({
            params: Promise.resolve({ id: 'categories' }),
        });

        expect(metadata.alternates?.canonical?.toString()).toContain('/ai/prompts');
        expect(mockGetPromptById).not.toHaveBeenCalled();
    });
});
