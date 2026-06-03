import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const ORIGINAL_SITE_URL = process.env.SITE_URL;
const ORIGINAL_SEO_CAN_INDEX = process.env.SEO_CAN_INDEX;

describe('SEO metadata rebuild', () => {
    beforeEach(() => {
        vi.resetModules();
        process.env.SITE_URL = 'https://zgnknowledge.online';
        delete process.env.SEO_CAN_INDEX;
    });

    afterEach(() => {
        if (ORIGINAL_SITE_URL === undefined) {
            delete process.env.SITE_URL;
        } else {
            process.env.SITE_URL = ORIGINAL_SITE_URL;
        }

        if (ORIGINAL_SEO_CAN_INDEX === undefined) {
            delete process.env.SEO_CAN_INDEX;
        } else {
            process.env.SEO_CAN_INDEX = ORIGINAL_SEO_CAN_INDEX;
        }
    });

    it('builds canonical homepage metadata for the AI knowledge hub', async () => {
        const { buildHomeMetadata } = await import('@/lib/seo/metadata');

        const metadata = buildHomeMetadata();

        expect(metadata.title).toBe('AI 知识库：AI 教程、提示词与工具榜单');
        expect(metadata.description).toContain('知更鸟 AI 知识库');
        expect(metadata.alternates?.canonical).toBe('https://zgnknowledge.online/');
        expect(metadata.openGraph?.url).toBe('https://zgnknowledge.online/');
    });

    it('marks filtered list pages as noindex follow', async () => {
        const { buildArticlesMetadata } = await import('@/lib/seo/metadata');

        const metadata = buildArticlesMetadata({ hasFilters: true });

        expect(metadata.alternates?.canonical).toBe('https://zgnknowledge.online/ai/articles');
        expect(metadata.robots).toMatchObject({
            index: false,
            follow: true,
        });
    });

    it('disables indexing when SEO_CAN_INDEX is false', async () => {
        process.env.SEO_CAN_INDEX = 'false';
        vi.resetModules();
        const { buildPromptsMetadata } = await import('@/lib/seo/metadata');

        const metadata = buildPromptsMetadata({ hasFilters: false });

        expect(metadata.robots).toMatchObject({
            index: false,
            follow: false,
        });
    });
});
