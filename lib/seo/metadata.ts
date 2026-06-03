import type { Metadata } from 'next';
import { buildAbsoluteUrl, getSiteBrandConfig } from '@/lib/site-config';

type ListMetadataOptions = {
    hasFilters?: boolean;
};

type PageMetadataInput = {
    title: string;
    description: string;
    path: string;
    type?: 'website' | 'article';
    noIndex?: boolean;
};

function canIndex(): boolean {
    return process.env.SEO_CAN_INDEX !== 'false';
}

function buildRobots(noIndex?: boolean): Metadata['robots'] {
    if (!canIndex()) {
        return { index: false, follow: false };
    }

    if (noIndex) {
        return { index: false, follow: true };
    }

    return { index: true, follow: true };
}

export function buildPageMetadata(input: PageMetadataInput): Metadata {
    const brand = getSiteBrandConfig();
    const canonical = buildAbsoluteUrl(input.path);

    return {
        title: input.title,
        description: input.description,
        metadataBase: new URL(buildAbsoluteUrl('/')),
        alternates: {
            canonical,
        },
        openGraph: {
            title: input.title,
            description: input.description,
            url: canonical,
            siteName: brand.brandName,
            type: input.type || 'website',
            locale: 'zh_CN',
        },
        twitter: {
            card: 'summary_large_image',
            title: input.title,
            description: input.description,
        },
        robots: buildRobots(input.noIndex),
    };
}

export function buildHomeMetadata(): Metadata {
    return buildPageMetadata({
        title: 'AI 知识库：AI 教程、提示词与工具榜单',
        description: '知更鸟 AI 知识库收录深度文章、AI 教程、提示词模板和工具榜单，帮助你系统追踪 AI 技术、产品和实操方法。',
        path: '/',
    });
}

export function buildArticlesMetadata(options: ListMetadataOptions = {}): Metadata {
    return buildPageMetadata({
        title: 'AI 教程与深度文章',
        description: '阅读 AI 教程、技术解析和产品实践文章，系统理解模型能力、Agent 工作流、提示词方法和 AI 工具趋势。',
        path: '/ai/articles',
        noIndex: options.hasFilters,
    });
}

export function buildPromptsMetadata(options: ListMetadataOptions = {}): Metadata {
    return buildPageMetadata({
        title: 'AI 提示词库：精选提示词模板',
        description: '浏览可复用的 AI 提示词模板，覆盖图像、视频、写作、编程和 Agent 工作流等场景。',
        path: '/ai/prompts',
        noIndex: options.hasFilters,
    });
}

export function buildRankingMetadata(path: string, title: string, description: string): Metadata {
    return buildPageMetadata({
        title,
        description,
        path,
    });
}

export function buildArticleDetailMetadata(input: {
    title: string;
    description: string;
    path: string;
}): Metadata {
    return buildPageMetadata({
        title: input.title,
        description: input.description,
        path: input.path,
        type: 'article',
    });
}

export function buildPromptDetailMetadata(input: {
    title: string;
    description: string;
    path: string;
}): Metadata {
    return buildPageMetadata({
        title: `${input.title} - AI 提示词模板`,
        description: input.description,
        path: input.path,
    });
}
