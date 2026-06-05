import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('content revalidation', () => {
    beforeEach(() => {
        vi.resetModules();
    });

    it('revalidates article public surfaces and reports article tags', async () => {
        const revalidatePath = vi.fn();
        const { revalidateContentChange } = await import('@/lib/cache/content-revalidation');

        const result = revalidateContentChange({
            type: 'article',
            action: 'publish',
            site: 'ai',
            slug: 'agent-review-gates',
        }, { revalidatePath });

        expect(result.paths).toEqual([
            '/',
            '/ai',
            '/ai/articles',
            '/ai/articles/agent-review-gates',
            '/sitemap.xml',
        ]);
        expect(result.warmPaths).toEqual([
            '/',
            '/ai',
            '/ai/articles',
            '/ai/articles/agent-review-gates',
        ]);
        expect(revalidatePath).toHaveBeenCalledTimes(5);
        expect(result.tags).toEqual(['articles']);
    });

    it('revalidates prompt public surfaces and reports prompt tags', async () => {
        const revalidatePath = vi.fn();
        const { revalidateContentChange } = await import('@/lib/cache/content-revalidation');

        const result = revalidateContentChange({
            type: 'prompt',
            action: 'sync',
            id: 42,
        }, { revalidatePath });

        expect(result.paths).toEqual([
            '/',
            '/ai',
            '/ai/prompts',
            '/ai/prompts/42',
            '/sitemap.xml',
        ]);
        expect(result.warmPaths).toEqual([
            '/',
            '/ai',
            '/ai/prompts',
            '/ai/prompts/42',
        ]);
        expect(result.tags).toEqual(['prompts', 'prompts:detail:42']);
    });

    it('revalidates article surfaces for all sites', async () => {
        const revalidatePath = vi.fn();
        const { revalidateContentChange } = await import('@/lib/cache/content-revalidation');

        const result = revalidateContentChange({
            type: 'articles',
            action: 'manual',
        }, { revalidatePath });

        expect(result.paths).toEqual([
            '/',
            '/ai',
            '/finance',
            '/ai/articles',
            '/finance/articles',
            '/sitemap.xml',
        ]);
        expect(result.warmPaths).toEqual([
            '/',
            '/ai',
            '/finance',
            '/ai/articles',
            '/finance/articles',
        ]);
        expect(result.tags).toEqual(['articles']);
    });

    it('revalidates all ranking pages and reports ranking tags', async () => {
        const revalidatePath = vi.fn();
        const { revalidateContentChange } = await import('@/lib/cache/content-revalidation');

        const result = revalidateContentChange({
            type: 'rankings',
            action: 'refresh',
            kind: 'all',
        }, { revalidatePath });

        expect(result.paths).toEqual([
            '/',
            '/ai',
            '/ai/rankings/github',
            '/ai/rankings/producthunt',
            '/ai/rankings/skills-trending',
        ]);
        expect(result.warmPaths).toEqual(result.paths);
        expect(result.tags).toEqual(['rankings']);
    });

    it('deduplicates paths for all-content revalidation', async () => {
        const revalidatePath = vi.fn();
        const { revalidateContentChange } = await import('@/lib/cache/content-revalidation');

        const result = revalidateContentChange({
            type: 'all',
            action: 'manual',
        }, { revalidatePath });

        expect(result.paths).toEqual([
            '/',
            '/ai',
            '/finance',
            '/ai/articles',
            '/finance/articles',
            '/ai/prompts',
            '/ai/rankings/github',
            '/ai/rankings/producthunt',
            '/ai/rankings/skills-trending',
            '/sitemap.xml',
        ]);
        expect(new Set(result.paths).size).toBe(result.paths.length);
    });
});
