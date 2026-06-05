import { revalidatePath as nextRevalidatePath } from 'next/cache';
import { getArticleDetailPath, getArticleListPath } from '@/lib/articles/article-route-paths';
import { buildAbsoluteUrl } from '@/lib/site-config';
import { cacheTags } from '@/lib/cache/keys';

export type ArticleSite = 'ai';
export type RankingKind = 'github' | 'producthunt' | 'skills-trending' | 'all';

export type ContentRevalidationEvent =
    | { type: 'article'; action: 'publish' | 'update' | 'unpublish' | 'manual'; site: ArticleSite; slug?: string }
    | { type: 'articles'; action: 'manual' }
    | { type: 'prompt'; action: 'sync' | 'update' | 'manual'; id?: number }
    | { type: 'rankings'; action: 'refresh' | 'manual'; kind?: RankingKind }
    | { type: 'all'; action: 'manual' };

export interface ContentRevalidationResult {
    paths: string[];
    tags: string[];
    warmPaths: string[];
}

export interface ContentRevalidationOptions {
    revalidatePath?: (path: string) => void;
}

const RANKING_PATHS: Record<Exclude<RankingKind, 'all'>, string> = {
    github: '/ai/rankings/github',
    producthunt: '/ai/rankings/producthunt',
    'skills-trending': '/ai/rankings/skills-trending',
};

function unique(values: string[]): string[] {
    return Array.from(new Set(values));
}

function hasValidId(id: number | undefined): id is number {
    return typeof id === 'number' && Number.isFinite(id) && id > 0;
}

function articlePaths(event: Extract<ContentRevalidationEvent, { type: 'article' }>): string[] {
    const paths = ['/', `/${event.site}`, getArticleListPath(event.site)];
    if (event.slug) {
        paths.push(getArticleDetailPath(event.site, event.slug));
    }
    paths.push('/sitemap.xml');
    return paths;
}

function allArticlePaths(): string[] {
    return [
        '/',
        '/ai',
        getArticleListPath('ai'),
        '/sitemap.xml',
    ];
}

function promptPaths(event: Extract<ContentRevalidationEvent, { type: 'prompt' }>): string[] {
    const paths = ['/', '/ai', '/ai/prompts'];
    if (hasValidId(event.id)) {
        paths.push(`/ai/prompts/${event.id}`);
    }
    paths.push('/sitemap.xml');
    return paths;
}

function rankingPaths(event: Extract<ContentRevalidationEvent, { type: 'rankings' }>): string[] {
    const kind = event.kind || 'all';
    if (kind !== 'all') return ['/', '/ai', RANKING_PATHS[kind]];
    return ['/', '/ai', ...Object.values(RANKING_PATHS)];
}

function allPaths(): string[] {
    return [
        '/',
        '/ai',
        getArticleListPath('ai'),
        '/ai/prompts',
        ...Object.values(RANKING_PATHS),
        '/sitemap.xml',
    ];
}

function warmPathsForEvent(event: ContentRevalidationEvent): string[] {
    const paths = ['/', '/ai'];

    if (event.type === 'article') {
        paths.push(getArticleListPath(event.site));
        if (event.slug) paths.push(getArticleDetailPath(event.site, event.slug));
        return paths;
    }

    if (event.type === 'articles') {
        return ['/', '/ai', getArticleListPath('ai')];
    }

    if (event.type === 'prompt') {
        paths.push('/ai/prompts');
        if (hasValidId(event.id)) paths.push(`/ai/prompts/${event.id}`);
        return paths;
    }

    if (event.type === 'rankings') {
        return rankingPaths(event);
    }

    return [
        '/',
        '/ai',
        getArticleListPath('ai'),
        '/ai/prompts',
        ...Object.values(RANKING_PATHS),
    ];
}

function pathsForEvent(event: ContentRevalidationEvent): string[] {
    if (event.type === 'article') return articlePaths(event);
    if (event.type === 'articles') return allArticlePaths();
    if (event.type === 'prompt') return promptPaths(event);
    if (event.type === 'rankings') return rankingPaths(event);
    return allPaths();
}

function tagsForEvent(event: ContentRevalidationEvent): string[] {
    if (event.type === 'article' || event.type === 'articles') return [cacheTags.articles];
    if (event.type === 'prompt') {
        const tags: string[] = [cacheTags.prompts];
        if (hasValidId(event.id)) {
            tags.push(cacheTags.promptDetail(event.id));
        }
        return tags;
    }
    if (event.type === 'rankings') return [cacheTags.rankings];
    return [cacheTags.articles, cacheTags.prompts, cacheTags.rankings];
}

export function revalidateContentChange(
    event: ContentRevalidationEvent,
    options: ContentRevalidationOptions = {},
): ContentRevalidationResult {
    const paths = unique(pathsForEvent(event));
    const tags = unique(tagsForEvent(event));
    const warmPaths = unique(warmPathsForEvent(event));
    const revalidatePath = options.revalidatePath || nextRevalidatePath;

    for (const path of paths) {
        revalidatePath(path);
    }

    return { paths, tags, warmPaths };
}

export async function warmContentPaths(paths: readonly string[]): Promise<Array<{ path: string; ok: boolean; status?: number }>> {
    return Promise.all(paths.map(async (path) => {
        try {
            const response = await fetch(buildAbsoluteUrl(path), {
                method: 'GET',
                headers: { 'x-prerender-warmup': 'content-revalidation' },
            });

            return { path, ok: response.ok, status: response.status };
        } catch {
            return { path, ok: false };
        }
    }));
}
