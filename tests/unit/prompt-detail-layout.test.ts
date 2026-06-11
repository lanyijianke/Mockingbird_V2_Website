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
                backHref: '/ai/prompts?category=gpt-image-2',
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
        expect(html).toContain('href="/ai/prompts?category=gpt-image-2"');
    });

    it('renders the main prompt image as an enlargeable control', async () => {
        const PromptDetailClient = (await import('@/app/ai/prompts/[id]/PromptDetailClient')).default;
        const html = renderToStaticMarkup(
            React.createElement(PromptDetailClient, {
                images: ['https://assets.example/cat.jpg'],
                content: 'Prompt text',
                videoUrl: null,
                backHref: '/ai/prompts',
                title: 'Cat prompt',
                categoryName: '图像生成',
                description: '',
                author: '',
                copyCount: 12,
                dateStr: '2026年6月11日',
                sourceUrl: null,
                isJson: false,
                relatedPrompts: [],
            })
        );

        expect(html).toContain('aria-label="放大查看图片"');
        expect(html).toContain('pd-main-img-button');
    });

    it('does not show a missing-video note for image-only prompts', async () => {
        const PromptDetailClient = (await import('@/app/ai/prompts/[id]/PromptDetailClient')).default;
        const html = renderToStaticMarkup(
            React.createElement(PromptDetailClient, {
                images: ['https://assets.example/cat.jpg'],
                content: 'Prompt text',
                videoUrl: null,
                backHref: '/ai/prompts',
                title: 'Cat prompt',
                categoryName: '图像生成',
                description: '',
                author: '',
                copyCount: 12,
                dateStr: '2026年6月11日',
                sourceUrl: null,
                isJson: false,
                relatedPrompts: [],
            })
        );

        expect(html).not.toContain('源数据暂未提供可播放视频');
    });

    it('renders Raycast argument templates as complete prompt text', async () => {
        const { renderPromptTemplateDefaults } = await import('@/app/ai/prompts/prompt-template');

        const rendered = renderPromptTemplateDefaults(
            '我想看到 {argument name="subject" default="美丽的猫耳少女"} 奔向夏天。你能生成一张 {argument name="style" default="类似于 Niji-journey 的清晰数字插画"} 吗？'
        );

        expect(rendered).toBe('我想看到美丽的猫耳少女奔向夏天。你能生成一张类似于 Niji-journey 的清晰数字插画吗？');
        expect(rendered).not.toContain('{argument');
    });

    it('leaves non-template braces untouched when rendering prompt defaults', async () => {
        const { renderPromptTemplateDefaults } = await import('@/app/ai/prompts/prompt-template');

        expect(renderPromptTemplateDefaults('Use {argument name="subject"} and keep {json: true}.')).toBe(
            'Use {argument name="subject"} and keep {json: true}.'
        );
        expect(renderPromptTemplateDefaults("Use {argument name='subject' default='cat'} now.")).toBe('Use cat now.');
    });

    it('passes rendered prompt text to the detail page so display and copy use a complete prompt', async () => {
        mockGetPromptById.mockResolvedValueOnce({
            id: 42,
            title: '游戏素材 - 猫耳少女数字插画',
            description: '生成一张精美的人物角色。',
            content: '我想看到 {argument name="subject" default="美丽的猫耳少女"} 奔向夏天。你能生成一张 {argument name="style" default="类似于 Niji-journey 的清晰数字插画"} 吗？',
            category: 'gpt-image-2',
            coverImageUrl: null,
            videoPreviewUrl: null,
            cardPreviewVideoUrl: null,
            author: 'Kitten Kiki',
            sourceUrl: null,
            imagesJson: null,
            copyCount: 781,
            isActive: true,
            createdAt: '2026-06-11T00:00:00.000Z',
            updatedAt: null,
        });

        const { default: PromptDetailPage } = await import('@/app/ai/prompts/[id]/page');
        const html = renderToStaticMarkup(await PromptDetailPage({
            params: Promise.resolve({ id: '42' }),
        }));

        expect(html).toContain('我想看到美丽的猫耳少女奔向夏天。你能生成一张类似于 Niji-journey 的清晰数字插画吗？');
        expect(html).not.toContain('{argument');
    });

    it('links prompt exploration back to the filterable prompt list instead of SEO category pages', async () => {
        const { default: PromptDetailPage } = await import('@/app/ai/prompts/[id]/page');
        const html = renderToStaticMarkup(await PromptDetailPage({
            params: Promise.resolve({ id: '42' }),
        }));

        expect(html).toContain('href="/ai/prompts?category=gemini-3"');
        expect(html).not.toContain('href="/ai/prompts/categories/gemini-3"');
    });

    it('preserves the originating prompt list filter in the floating back link', async () => {
        const { default: PromptDetailPage } = await import('@/app/ai/prompts/[id]/page');
        const html = renderToStaticMarkup(await PromptDetailPage({
            params: Promise.resolve({ id: '42' }),
            searchParams: Promise.resolve({ returnTo: '/ai/prompts?category=seedance-2&q=ceo' }),
        }));

        expect(html).toContain('href="/ai/prompts?category=seedance-2&amp;q=ceo"');
    });

    it('falls back to the prompt category when returnTo is not a prompt list URL', async () => {
        const { default: PromptDetailPage } = await import('@/app/ai/prompts/[id]/page');
        const html = renderToStaticMarkup(await PromptDetailPage({
            params: Promise.resolve({ id: '42' }),
            searchParams: Promise.resolve({ returnTo: 'https://example.com/ai/prompts?category=seedance-2' }),
        }));

        expect(html).toContain('href="/ai/prompts?category=gemini-3"');
        expect(html).not.toContain('example.com');
    });

    it('reloads prompt detail data across metadata and page render so ISR does not retain stale rows', async () => {
        const { default: PromptDetailPage, generateMetadata } = await import('@/app/ai/prompts/[id]/page');

        await generateMetadata({ params: Promise.resolve({ id: '42' }) });
        await PromptDetailPage({ params: Promise.resolve({ id: '42' }) });

        expect(mockGetPromptById).toHaveBeenCalledTimes(2);
    });

    it('prebuilds DB-backed prompt detail pages from prompt ids for ISR', async () => {
        const { generateStaticParams } = await import('@/app/ai/prompts/[id]/page');

        await expect(generateStaticParams()).resolves.toEqual([
            { id: '42' },
        ]);
        expect(mockGetAllPromptIds).toHaveBeenCalledTimes(1);
    });

    it('does not force prompt detail pages to bypass static page caching', async () => {
        const pageModule = await import('@/app/ai/prompts/[id]/page');

        expect(pageModule.dynamic).toBeUndefined();
        expect(pageModule.dynamicParams).toBe(false);
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
