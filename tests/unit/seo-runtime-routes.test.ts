import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/services/article-service', () => ({
    getArticleSitemapEntries: vi.fn(async () => [
        {
            slug: 'agent-workflow',
            site: 'ai',
            path: '/ai/articles/agent-workflow',
            lastModified: '2026-05-20T00:00:00.000Z',
        },
    ]),
}));

vi.mock('@/lib/services/prompt-service', () => ({
    getPromptSitemapEntries: vi.fn(async () => [
        { id: 101, lastModified: '2026-05-21T00:00:00.000Z' },
    ]),
}));

describe('SEO runtime routes', () => {
    it('robots allows AI citation crawlers and points to sitemap', async () => {
        process.env.SITE_URL = 'https://zgnknowledge.online';
        const { default: robots } = await import('@/app/robots');

        const result = robots();

        expect(result.sitemap).toBe('https://zgnknowledge.online/sitemap.xml');
        expect(result.rules).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ userAgent: 'GPTBot', allow: '/' }),
                expect.objectContaining({ userAgent: 'PerplexityBot', allow: '/' }),
                expect.objectContaining({ userAgent: 'ClaudeBot', allow: '/' }),
                expect.objectContaining({ userAgent: 'Google-Extended', allow: '/' }),
            ])
        );
    });

    it('sitemap includes canonical pages and excludes removed legacy SEO pages', async () => {
        process.env.SITE_URL = 'https://zgnknowledge.online';
        const route = await import('@/app/sitemap.xml/route');

        const response = await route.GET();
        const xml = await response.text();

        expect(xml).toContain('<loc>https://zgnknowledge.online/</loc>');
        expect(xml).toContain('<loc>https://zgnknowledge.online/ai/articles</loc>');
        expect(xml).toContain('<loc>https://zgnknowledge.online/ai/prompts</loc>');
        expect(xml).toContain('<loc>https://zgnknowledge.online/ai/rankings/github</loc>');
        expect(xml).toContain('<loc>https://zgnknowledge.online/ai/articles/agent-workflow</loc>');
        expect(xml).toContain('<loc>https://zgnknowledge.online/ai/prompts/101</loc>');
        expect(xml).not.toContain('/ai/rankings/topics');
        expect(xml).not.toContain('/ai/prompts/categories');
        expect(xml).not.toContain('/ai/prompts/scenarios');
    });

    it('llms.txt explains the AI knowledge hub with canonical links and citation guidance', async () => {
        const route = await import('@/app/llms.txt/route');

        const response = await route.GET();
        const text = await response.text();

        expect(text).toContain('## Site Identity');
        expect(text).toContain('## 站点身份');
        expect(text).toContain('- Brand:');
        expect(text).toContain('## Best Citation Targets');
        expect(text).toContain('## 最佳引用目标');
        expect(text).toContain('## Freshness And Update Signals');
        expect(text).toContain('## 新鲜度与更新信号');
        expect(text).toContain('## Citation Guidance');
        expect(text).toContain('## 引用建议');
        expect(text).toContain('## Deprecated Or Non-Canonical URL Patterns');
        expect(text).toContain('## 废弃或非规范 URL 模式');
        expect(text).toContain('Primary language: zh-CN');
        expect(text).toContain('主要语言：简体中文');
        expect(text).toContain('Use articles for definitions, tutorials, analysis, and explainers.');
        expect(text).toContain('文章页适合用于定义、教程、分析和解释型引用。');
        expect(text).toContain('Use ranking pages for current tool discovery and trend context.');
        expect(text).toContain('榜单页适合用于当前 AI 工具发现和趋势背景。');
        expect(text).toContain('Prefer canonical URLs listed in sitemap.xml.');
        expect(text).toContain('优先引用 sitemap.xml 中列出的规范 URL。');
        expect(text).toContain('Sitemap: https://zgnknowledge.online/sitemap.xml');
        expect(text).toContain('Robots: https://zgnknowledge.online/robots.txt');
        expect(text).toContain('/ai/articles');
        expect(text).toContain('/ai/prompts');
        expect(text).toContain('/ai/rankings/github');
        expect(text).toContain('- /ai/rankings/topics/*');
        expect(text).not.toContain('https://zgnknowledge.online/ai/rankings/topics');
    });

    it('llm.txt aliases the GEO guidance for users who try the singular path', async () => {
        const route = await import('@/app/llm.txt/route');

        const response = await route.GET();
        const text = await response.text();

        expect(response.headers.get('Content-Type')).toContain('text/plain');
        expect(text).toContain('## Site Identity');
        expect(text).toContain('## 站点身份');
        expect(text).toContain('Sitemap: https://zgnknowledge.online/sitemap.xml');
    });
});
