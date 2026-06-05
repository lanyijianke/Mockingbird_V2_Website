import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/app/ThemeProvider', () => ({
    useTheme: () => ({
        mode: 'light',
        resolvedTheme: 'light',
        setThemeMode: vi.fn(),
    }),
}));

describe('ThemeToggle', () => {
    it('renders system, light, and dark choices', async () => {
        const { default: ThemeToggle } = await import('@/app/ThemeToggle');
        const html = renderToStaticMarkup(createElement(ThemeToggle));

        expect(html).toContain('系统');
        expect(html).toContain('亮色');
        expect(html).toContain('暗色');
        expect(html).toContain('theme-toggle');
        expect(html).toContain('aria-pressed');
    });
});
