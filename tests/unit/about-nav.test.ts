import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import RootLayout from '@/app/layout';

const { mockPathname } = vi.hoisted(() => ({
    mockPathname: vi.fn(() => '/'),
}));

vi.mock('next/navigation', () => ({
    usePathname: () => mockPathname(),
    useRouter: () => ({
        refresh: vi.fn(),
    }),
}));

vi.mock('@/app/NavAuthButton', () => ({
    default: () => createElement('span', null, 'auth'),
}));

describe('about navigation link', () => {
    it('uses the same AI navigation menu on the about page', () => {
        mockPathname.mockReturnValue('/about');

        const html = renderToStaticMarkup(
            RootLayout({
                children: createElement('div', null, 'test page'),
            })
        );

        expect(html).toContain('href="/ai/articles"');
        expect(html).toContain('href="/ai/prompts"');
        expect(html).not.toContain('href="/ai/rankings/topics"');
        expect(html).toContain('href="/ai/rankings/github"');
        expect(html.match(/<div class="nav-left">([\s\S]*?)<\/div>/)?.[1]).toContain('href="/about"');
        expect(html).toContain('关于我');
    });
});
