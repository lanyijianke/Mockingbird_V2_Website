import type { CachePolicy } from './types';

const TWO_HOURS_MS = 2 * 60 * 60 * 1000;
const TEN_MINUTES_MS = 10 * 60 * 1000;
const FIVE_MINUTES_MS = 5 * 60 * 1000;
const THIRTY_MINUTES_MS = 30 * 60 * 1000;

export const cachePolicies = {
    rankingsGithub: {
        id: 'rankings.github',
        namespace: 'rankings.github',
        ttlMs: TWO_HOURS_MS,
        maxEntries: 1,
        allowStaleOnError: true,
        replaceOnEmptyResult: false,
        warmOnStartup: true,
    },
    rankingsProductHunt: {
        id: 'rankings.producthunt',
        namespace: 'rankings.producthunt',
        ttlMs: TWO_HOURS_MS,
        maxEntries: 1,
        allowStaleOnError: true,
        replaceOnEmptyResult: false,
        warmOnStartup: true,
    },
    rankingsSkillsTrending: {
        id: 'rankings.skills.trending',
        namespace: 'rankings.skills.trending',
        ttlMs: TWO_HOURS_MS,
        maxEntries: 1,
        allowStaleOnError: true,
        replaceOnEmptyResult: false,
        warmOnStartup: true,
    },
    promptsTop: {
        id: 'prompts.top',
        namespace: 'prompts.top',
        ttlMs: TEN_MINUTES_MS,
        maxEntries: 50,
    },
    promptsDetail: {
        id: 'prompts.detail',
        namespace: 'prompts.detail',
        ttlMs: TEN_MINUTES_MS,
        maxEntries: 500,
    },
    promptsRelated: {
        id: 'prompts.related',
        namespace: 'prompts.related',
        ttlMs: TEN_MINUTES_MS,
        maxEntries: 500,
    },
    articlesDirectory: {
        id: 'articles.directory',
        namespace: 'articles.directory',
        ttlMs: FIVE_MINUTES_MS,
        maxEntries: 10,
        allowStaleOnError: true,
    },
    articlesMarkdown: {
        id: 'articles.markdown',
        namespace: 'articles.markdown',
        ttlMs: THIRTY_MINUTES_MS,
        maxEntries: 200,
        allowStaleOnError: true,
    },
} as const satisfies Record<string, CachePolicy>;

export const rankingCachePolicies = [
    cachePolicies.rankingsGithub,
    cachePolicies.rankingsProductHunt,
    cachePolicies.rankingsSkillsTrending,
] as const;

export const cachePageRevalidate = {
    home: 300,
    rankings: 600,
    promptDetail: 3600,
    articleDetail: 3600,
} as const;

export const cacheHttpHeaders = {
    sitemapIndex: 'public, s-maxage=3600, stale-while-revalidate=86400',
    sitemapChunk: 'public, s-maxage=3600, stale-while-revalidate=86400',
    articleAsset: 'public, max-age=3600',
} as const;
