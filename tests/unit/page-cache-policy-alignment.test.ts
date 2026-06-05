import { describe, expect, it } from 'vitest';
import { cachePageRevalidate } from '@/lib/cache/policies';

describe('page cache policy alignment', () => {
    it('keeps public aggregation pages on ISR so static output is the cache layer', async () => {
        const homePage = await import('@/app/page');
        const aiHomePage = await import('@/app/ai/page');
        const aiArticlesPage = await import('@/app/ai/articles/page');
        const aiPromptsPage = await import('@/app/ai/prompts/page');
        const financeHomePage = await import('@/app/finance/page');
        const financeArticlesPage = await import('@/app/finance/articles/page');

        expect(homePage.revalidate).toBe(cachePageRevalidate.home);
        expect(aiHomePage.revalidate).toBe(cachePageRevalidate.home);
        expect(aiArticlesPage.revalidate).toBe(cachePageRevalidate.home);
        expect(aiPromptsPage.revalidate).toBe(cachePageRevalidate.home);
        expect(financeHomePage.revalidate).toBe(cachePageRevalidate.home);
        expect(financeArticlesPage.revalidate).toBe(cachePageRevalidate.home);
    });

    it('keeps detail and ranking route segment revalidate exports aligned with centralized cache settings', async () => {
        const promptDetailPage = await import('@/app/ai/prompts/[id]/page');
        const aiArticlePage = await import('@/app/ai/articles/[slug]/page');
        const financeArticlePage = await import('@/app/finance/articles/[slug]/page');
        const githubRankingPage = await import('@/app/ai/rankings/github/page');
        const productHuntRankingPage = await import('@/app/ai/rankings/producthunt/page');
        const skillsTrendingPage = await import('@/app/ai/rankings/skills-trending/page');

        expect(promptDetailPage.revalidate).toBe(cachePageRevalidate.promptDetail);
        expect(aiArticlePage.revalidate).toBe(cachePageRevalidate.articleDetail);
        expect(financeArticlePage.revalidate).toBe(cachePageRevalidate.articleDetail);
        expect(githubRankingPage.revalidate).toBe(cachePageRevalidate.rankings);
        expect(productHuntRankingPage.revalidate).toBe(cachePageRevalidate.rankings);
        expect(skillsTrendingPage.revalidate).toBe(cachePageRevalidate.rankings);
    });
});
