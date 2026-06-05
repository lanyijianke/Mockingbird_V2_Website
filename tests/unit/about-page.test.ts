import fs from 'node:fs';
import path from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

const aboutPageCssPath = path.resolve(
    __dirname,
    '../../app/_styles/about-page.css'
);

vi.mock('next/image', async () => {
    const ReactModule = await import('react');

    return {
        default: ({
            fill,
            priority,
            ...props
        }: Record<string, unknown>) => {
            void fill;
            void priority;
            return ReactModule.createElement('img', props);
        },
    };
});

vi.mock('next/link', async () => {
    const ReactModule = await import('react');

    return {
        default: ({
            href,
            children,
            ...props
        }: {
            href: string;
            children: React.ReactNode;
        }) => ReactModule.createElement('a', { href, ...props }, children),
    };
});

describe('about page', () => {
    it('renders the imported personal profile content', async () => {
        const { default: AboutPage } = await import('@/app/about/page');
        const html = renderToStaticMarkup(await AboutPage());

        expect(html).toContain('蓝衣剑客');
        expect(html).toContain('@lanyi1992');
        expect(html).toContain('独立开发者');
        expect(html).toContain('为什么做这个站');
        expect(html).toContain('返回首页');
        expect(html).toContain('href="https://x.com/lanyi1992"');
    });

    it('does not keep the old desktop top padding on the identity block after removing the eyebrow label', () => {
        const css = fs.readFileSync(aboutPageCssPath, 'utf-8');
        const identityBlock = css.match(/\.about-identity\s*\{[\s\S]*?\}/);

        expect(identityBlock?.[0]).toContain('display: grid;');
        expect(identityBlock?.[0]).not.toContain('padding-top:');
    });

    it('keeps the desktop hero text below the banner instead of lifting the whole card upward', () => {
        const css = fs.readFileSync(aboutPageCssPath, 'utf-8');
        const heroCardBlock = css.match(/\.about-hero-card\s*\{[\s\S]*?\}/);
        const avatarBlock = css.match(/\.about-avatar-wrap\s*\{[\s\S]*?\}/);

        expect(heroCardBlock?.[0]).not.toContain('margin-top: -');
        expect(avatarBlock?.[0]).toContain('margin-top: -');
    });
});
