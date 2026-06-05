export const cacheTags = {
    rankings: 'rankings',
    prompts: 'prompts',
    promptDetail: (id: number): string => `prompts:detail:${id}`,
    articles: 'articles',
    articleContent: (contentLocator: string): string => `articles:content:${contentLocator}`,
} as const;
