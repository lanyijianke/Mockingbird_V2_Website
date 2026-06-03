import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import RootLayout from '@/app/layout';

vi.mock('next/navigation', () => ({
    usePathname: () => '/',
    useRouter: () => ({
        refresh: vi.fn(),
    }),
}));

vi.mock('@/app/NavAuthButton', () => ({
    default: () => createElement('span', null, 'auth'),
}));

describe('root layout navigation', () => {
    it('treats the root page as the AI knowledge platform navigation', () => {
        const html = renderToStaticMarkup(
            RootLayout({
                children: createElement('div', null, 'test page'),
            })
        );

        const navLeftMatch = html.match(/<div class="nav-left">([\s\S]*?)<\/div>/);
        const navRightMatch = html.match(/<div class="nav-right">([\s\S]*?)<\/div>/);
        expect(navLeftMatch?.[1]).toContain('href="/about"');
        expect(navRightMatch?.[1]).toContain('href="/ai/articles"');
        expect(navRightMatch?.[1]).toContain('href="/ai/prompts"');
        expect(navRightMatch?.[1]).toContain('AI 提示词');
        expect(navRightMatch?.[1]).not.toContain('href="/about"');
        expect(navRightMatch?.[1]).not.toContain('href="/finance/articles"');
        expect(html).not.toContain('学社');
        expect(html).not.toContain('academy-link');
        expect(html).not.toContain('localhost:5080');
        expect(html).not.toContain('登录');
        expect(html).not.toContain('>auth<');
    });

    it('places the about link in the left navigation area', () => {
        const html = renderToStaticMarkup(
            RootLayout({
                children: createElement('div', null, 'test page'),
            })
        );

        const navLeftMatch = html.match(/<div class="nav-left">([\s\S]*?)<\/div>/);
        const navRightMatch = html.match(/<div class="nav-right">([\s\S]*?)<\/div>/);

        expect(navLeftMatch?.[1]).toContain('href="/about"');
        expect(navRightMatch?.[1]).not.toContain('href="/about"');
    });

    it('renders a mobile rankings hub link and desktop dropdown links', () => {
        const html = renderToStaticMarkup(
            RootLayout({
                children: createElement('div', null, 'test page'),
            })
        );

        expect(html).not.toContain('href="/ai/rankings/topics"');
        expect(html).toContain('href="/ai/rankings/github"');
        expect(html).toContain('nav-mobile-only');
        expect(html).toContain('热榜');
        expect(html).toContain('href="/ai/rankings/producthunt"');
        expect(html).toContain('href="/ai/rankings/skills-trending"');
        expect(html).toContain('href="/ai/rankings/skills-hot"');
        expect(html).toContain('nav-desktop-only');
    });
});
