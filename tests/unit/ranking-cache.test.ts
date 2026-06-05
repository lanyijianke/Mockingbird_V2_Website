import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockScrapeGitHubTrending = vi.fn();
const mockScrapeProductHunt = vi.fn();
const mockScrapeSkillsSh = vi.fn();

vi.mock('@/lib/services/ranking-scrapers', () => ({
    scrapeGitHubTrending: mockScrapeGitHubTrending,
    scrapeProductHunt: mockScrapeProductHunt,
    scrapeSkillsSh: mockScrapeSkillsSh,
}));

vi.mock('@/lib/utils/logger', () => ({
    logger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
        persist: vi.fn(),
    },
}));

const githubFixture = [
    {
        id: 1,
        rank: 1,
        repoFullName: 'openai/codex',
        description: 'Build with agents',
        language: 'TypeScript',
        starsCount: 100,
        forksCount: 10,
        todayStars: 20,
        repoUrl: 'https://github.com/openai/codex',
        sourcePlatform: 'github',
        updatedAt: '2026-04-22T10:00:00.000Z',
    },
];

describe('ranking source service', () => {
    beforeEach(() => {
        vi.resetModules();
        vi.clearAllMocks();
    });

    it('loads ranking reads directly so ISR pages are the cache layer', async () => {
        mockScrapeGitHubTrending.mockResolvedValue(githubFixture);

        const { getGitHubTrendings } = await import('@/lib/services/ranking-cache');

        await expect(getGitHubTrendings()).resolves.toEqual(githubFixture);
        await expect(getGitHubTrendings()).resolves.toEqual(githubFixture);

        expect(mockScrapeGitHubTrending).toHaveBeenCalledTimes(2);
    });

    it('returns an empty list when a ranking source fails', async () => {
        mockScrapeGitHubTrending.mockRejectedValue(new Error('source unavailable'));

        const { getGitHubTrendings } = await import('@/lib/services/ranking-cache');

        await expect(getGitHubTrendings()).resolves.toEqual([]);
    });
});
