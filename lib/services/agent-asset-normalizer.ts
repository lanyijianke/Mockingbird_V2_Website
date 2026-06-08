import type { ArticleDetail, Prompt } from '@/lib/types';
import type {
    AgentArticleAsset,
    AgentMediaAsset,
    AgentMediaType,
    AgentPromptAsset,
} from './agent-asset-types';

function mediaAsset(input: {
    type: AgentMediaType;
    role: AgentMediaAsset['role'];
    url: string;
    thumbnailUrl?: string | null;
    alt?: string | null;
}): AgentMediaAsset {
    return {
        type: input.type,
        role: input.role,
        url: input.url,
        thumbnailUrl: input.thumbnailUrl || null,
        alt: input.alt || null,
        width: null,
        height: null,
        durationSeconds: null,
    };
}

function parseImageUrls(imagesJson: string | null | undefined): string[] {
    if (!imagesJson) return [];
    try {
        const parsed = JSON.parse(imagesJson) as unknown;
        if (!Array.isArray(parsed)) return [];
        return parsed.filter((item): item is string => typeof item === 'string' && /^https?:\/\//.test(item));
    } catch {
        return [];
    }
}

function uniqueOrdered<T extends string>(values: T[], order: T[]): T[] {
    const present = new Set(values);
    return order.filter((item) => present.has(item));
}

function inferUseCases(...values: Array<string | null | undefined>): string[] {
    const text = values.filter(Boolean).join(' ').toLowerCase();
    const useCases = new Set<string>();

    for (const value of values) {
        if (value) useCases.add(value);
    }

    const keywordMap: Array<[RegExp, string]> = [
        [/poster|海报/, 'poster'],
        [/avatar|头像/, 'avatar'],
        [/video|视频/, 'video'],
        [/product|商品|产品|ecommerce|电商/, 'product'],
        [/article|文章/, 'article'],
    ];
    for (const [pattern, label] of keywordMap) {
        if (pattern.test(text)) useCases.add(label);
    }

    return Array.from(useCases).filter(Boolean).slice(0, 12);
}

function outputFormats(mediaTypes: AgentMediaType[], fallback: string[] = []): string[] {
    const formats = new Set<string>(fallback);
    for (const type of mediaTypes) formats.add(type);
    return Array.from(formats);
}

function sourceUpdatedAt(createdAt: string | null | undefined, updatedAt: string | null | undefined): string | null {
    return updatedAt || createdAt || null;
}

export function normalizePromptAsset(prompt: Prompt): AgentPromptAsset {
    const media: AgentMediaAsset[] = [];
    if (prompt.coverImageUrl) {
        media.push(mediaAsset({
            type: 'image',
            role: 'cover',
            url: prompt.coverImageUrl,
            alt: prompt.title,
        }));
    }

    for (const url of parseImageUrls(prompt.imagesJson)) {
        if (url === prompt.coverImageUrl) continue;
        media.push(mediaAsset({
            type: 'image',
            role: 'example',
            url,
            alt: prompt.title,
        }));
    }

    if (prompt.videoPreviewUrl) {
        media.push(mediaAsset({
            type: 'video',
            role: 'video-preview',
            url: prompt.videoPreviewUrl,
            thumbnailUrl: prompt.coverImageUrl || null,
            alt: prompt.title,
        }));
    }

    if (prompt.cardPreviewVideoUrl && prompt.cardPreviewVideoUrl !== prompt.videoPreviewUrl) {
        media.push(mediaAsset({
            type: 'video',
            role: 'thumbnail',
            url: prompt.cardPreviewVideoUrl,
            thumbnailUrl: prompt.coverImageUrl || null,
            alt: prompt.title,
        }));
    }

    const mediaTypes = uniqueOrdered(media.map((item) => item.type), ['image', 'video']);
    const hasExamples = media.some((item) => item.role === 'example');

    return {
        assetKind: 'prompt',
        mediaTypes,
        useCases: inferUseCases(prompt.category, prompt.title, prompt.description),
        outputFormats: outputFormats(mediaTypes),
        qualitySignals: {
            hasCover: Boolean(prompt.coverImageUrl),
            hasVideo: mediaTypes.includes('video'),
            hasExamples,
            copyCount: prompt.copyCount,
            updatedAt: sourceUpdatedAt(prompt.createdAt, prompt.updatedAt),
        },
        inputsRequired: [],
        promptText: prompt.content,
        usageNotes: [
            'Review the prompt text and adapt variables to the current task before use.',
            'Media fields are public URLs for reference only; do not download them unless visual inspection is explicitly required.',
        ],
        media,
    };
}

export function normalizeArticleAsset(article: ArticleDetail, options?: { truncated?: boolean }): AgentArticleAsset {
    const media: AgentMediaAsset[] = article.coverUrl ? [
        mediaAsset({
            type: 'image',
            role: 'cover',
            url: article.coverUrl,
            alt: article.title,
        }),
    ] : [];
    const mediaTypes = uniqueOrdered(media.map((item) => item.type), ['image', 'video']);

    return {
        assetKind: 'article',
        mediaTypes,
        useCases: inferUseCases(article.category, article.sourcePlatform, article.title, article.summary),
        outputFormats: ['text'],
        qualitySignals: {
            hasCover: Boolean(article.coverUrl),
            hasVideo: false,
            hasExamples: false,
            copyCount: null,
            updatedAt: sourceUpdatedAt(article.createdAt, article.updatedAt),
        },
        content: article.content,
        truncated: Boolean(options?.truncated),
        media,
    };
}
