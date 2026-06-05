import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import SiteFooter from '@/app/SiteFooter';

vi.mock('@/app/ThemeProvider', () => ({
    useTheme: () => ({
        mode: 'light',
        resolvedTheme: 'light',
        setThemeMode: vi.fn(),
    }),
}));

describe('SiteFooter', () => {
    it('links only to real canonical sections', () => {
        const html = renderToStaticMarkup(createElement(SiteFooter));

        expect(html).toContain('知更鸟 AI 知识库');
        expect(html).toContain('href="/"');
        expect(html).toContain('href="/ai/articles"');
        expect(html).toContain('href="/ai/prompts"');
        expect(html).toContain('href="/ai/rankings/github"');
        expect(html).toContain('href="/about"');
        expect(html).toContain('/images/logo-light.png');
        expect(html).not.toContain('冀ICP备');
        expect(html).not.toContain('/ai/rankings/topics');
        expect(html).not.toContain('/ai/prompts/categories');
        expect(html).not.toContain('/ai/articles/categories');
    });
});
