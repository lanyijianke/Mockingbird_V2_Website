import { notFound } from 'next/navigation';
import { getCategoryName } from '@/lib/categories';
import {
    buildPromptDetailMetadata,
    buildPromptsMetadata,
} from '@/lib/seo/metadata';
import {
    JsonLdScript,
    buildCreativeWorkSchema,
} from '@/lib/seo/schema';
import PromptDetailClient from './PromptDetailClient';
import { safeJsonParse } from '../safeJsonParse';
import { renderPromptTemplateDefaults } from '../prompt-template';
import './prompt-detail.css';

export const runtime = 'nodejs';
export const dynamicParams = false;
export const revalidate = 3600;

type PromptService = typeof import('@/lib/services/prompt-service');
type PromptDetail = Awaited<ReturnType<PromptService['getPromptById']>>;

export async function generateStaticParams() {
    const { getAllPromptIds } = await import('@/lib/services/prompt-service');
    const ids = await getAllPromptIds();

    return ids.map((id) => ({ id: String(id) }));
}

function summarizePrompt(prompt: { description?: string | null; content: string }): string {
    return (prompt.description || prompt.content.slice(0, 150)).trim();
}

function parsePromptId(id: string): number | null {
    if (!/^\d+$/.test(id)) {
        return null;
    }

    const parsed = Number(id);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function normalizePromptReturnTo(value: string | undefined): string | null {
    if (!value) return null;

    try {
        const parsed = new URL(value, 'https://zgnknowledge.online');
        if (parsed.origin !== 'https://zgnknowledge.online') return null;
        if (parsed.pathname !== '/ai/prompts') return null;

        return `${parsed.pathname}${parsed.search}${parsed.hash}`;
    } catch {
        return null;
    }
}

async function getPromptDetail(promptId: number): Promise<PromptDetail> {
    const { getPromptById } = await import('@/lib/services/prompt-service');
    return getPromptById(promptId);
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const promptId = parsePromptId(id);

    if (!promptId) {
        return buildPromptsMetadata();
    }

    const prompt = await getPromptDetail(promptId);

    if (!prompt) {
        return buildPromptsMetadata();
    }

    return buildPromptDetailMetadata({
        title: prompt.title,
        description: summarizePrompt(prompt),
        path: `/ai/prompts/${prompt.id}`,
    });
}

export default async function PromptDetailPage({
    params,
    searchParams,
}: {
    params: Promise<{ id: string }>;
    searchParams?: Promise<{ returnTo?: string }>;
}) {
    const { getRelatedPrompts } = await import('@/lib/services/prompt-service');
    const { id } = await params;
    const promptId = parsePromptId(id);

    if (!promptId) {
        notFound();
    }

    const prompt = await getPromptDetail(promptId);
    if (!prompt) notFound();

    // 获取同分类推荐提示词
    const relatedPrompts = await getRelatedPrompts(prompt.category, prompt.id, 6);

    // 解析图片 JSON
    let images: string[] = [];
    if (prompt.imagesJson) {
        images = safeJsonParse<string[]>(prompt.imagesJson, []);
    }

    const renderedPromptContent = renderPromptTemplateDefaults(prompt.content);

    // 检测是否为 JSON 内容
    const isJson = renderedPromptContent.trim().startsWith('{') || renderedPromptContent.trim().startsWith('[');

    const dateStr = new Date(prompt.createdAt).toLocaleDateString('zh-CN', {
        timeZone: 'Asia/Shanghai',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
    });
    const promptListCategoryHref = `/ai/prompts?category=${encodeURIComponent(prompt.category)}`;
    const returnParams = await searchParams;
    const backHref = normalizePromptReturnTo(returnParams?.returnTo) || promptListCategoryHref;
    const explorationLinks = [
        {
            href: promptListCategoryHref,
            title: `${getCategoryName(prompt.category)} 提示词`,
            description: `回到提示词列表并按 ${getCategoryName(prompt.category)} 筛选，继续浏览同类模板。`,
        },
        {
            href: '/ai/articles?category=prompts',
            title: '提示词相关文章',
            description: '从提示词分类延伸到配套教程、最佳实践和案例分析。',
        },
        {
            href: '/ai/rankings/producthunt',
            title: 'ProductHunt 热榜',
            description: '观察正在增长的 AI 产品，再反向寻找适合它们的提示词玩法。',
        },
    ];

    return (
        <>
            <JsonLdScript
                data={buildCreativeWorkSchema({
                    title: prompt.title,
                    description: summarizePrompt(prompt),
                    path: `/ai/prompts/${prompt.id}`,
                })}
            />
            <PromptDetailClient
                images={images}
                content={renderedPromptContent}
                videoUrl={prompt.videoPreviewUrl}
                backHref={backHref}
                title={prompt.title}
                categoryName={getCategoryName(prompt.category)}
                description={prompt.description || ''}
                author={prompt.author || ''}
                copyCount={prompt.copyCount}
                dateStr={dateStr}
                sourceUrl={prompt.sourceUrl}
                isJson={isJson}
                relatedPrompts={relatedPrompts.map(p => ({
                    id: p.id,
                    title: p.title,
                    coverImageUrl: p.coverImageUrl,
                    category: getCategoryName(p.category),
                    copyCount: p.copyCount,
                }))}
                explorationLinks={explorationLinks}
            />
        </>
    );
}
