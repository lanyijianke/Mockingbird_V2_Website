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
