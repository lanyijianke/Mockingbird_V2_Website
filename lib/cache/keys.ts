import type { CacheKeyPart } from './types';

function normalizeSkillsListType(listType: string): 'trending' | 'hot' {
    return listType === 'hot' ? 'hot' : 'trending';
}

export const cacheKeys = {
    rankings: {
        github: (): CacheKeyPart[] => ['github'],
        producthunt: (): CacheKeyPart[] => ['producthunt'],
        skills: (listType: string): CacheKeyPart[] => ['skills', normalizeSkillsListType(listType)],
    },
    prompts: {
        top: (count: number): CacheKeyPart[] => ['top', count],
        detail: (id: number): CacheKeyPart[] => ['detail', id],
        related: (category: string, excludeId: number, limit: number): CacheKeyPart[] => [
            'related',
            category,
            excludeId,
            limit,
        ],
    },
    articles: {
        directory: (): CacheKeyPart[] => ['directory'],
        markdown: (contentLocator: string): CacheKeyPart[] => ['markdown', contentLocator],
    },
} as const;

export const cacheTags = {
    rankings: 'rankings',
    prompts: 'prompts',
    promptDetail: (id: number): string => `prompts:detail:${id}`,
    articles: 'articles',
    articleContent: (contentLocator: string): string => `articles:content:${contentLocator}`,
} as const;
