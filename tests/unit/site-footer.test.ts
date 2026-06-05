import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import SiteFooter from '@/app/SiteFooter';

describe('SiteFooter', () => {
    it('links only to real canonical sections', () => {
        const html = renderToStaticMarkup(createElement(SiteFooter));

        expect(html).toContain('知更鸟 AI 知识库');
        expect(html).toContain('href="/"');
        expect(html).toContain('href="/ai/articles"');
        expect(html).toContain('href="/ai/prompts"');
        expect(html).toContain('href="/ai/rankings/github"');
        expect(html).toContain('href="/about"');
        expect(html).toContain('/images/logo-nav.png');
        expect(html).toContain('/images/logo-light.png');
        expect(html).toContain('theme-logo-dark');
        expect(html).toContain('theme-logo-light');
        expect(html).not.toContain('冀ICP备');
        expect(html).not.toContain('/ai/rankings/topics');
        expect(html).not.toContain('/ai/rankings/skills-hot');
        expect(html).not.toContain('热门技能');
        expect(html).not.toContain('/ai/prompts/categories');
        expect(html).not.toContain('/ai/articles/categories');
    });

    it('still renders the secondary navigation groups in the desktop footer', () => {
        const html = renderToStaticMarkup(createElement(SiteFooter));

        expect(html).toContain('内容');
        expect(html).toContain('热榜');
        expect(html).toContain('站点');
        expect(html).toContain('GitHub 热榜');
        expect(html).toContain('关于我');
    });
});
