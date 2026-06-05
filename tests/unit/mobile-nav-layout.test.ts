import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const navCssPath = path.resolve(
    __dirname,
    '../../app/_styles/nav.css'
);

describe('mobile navigation layout', () => {
    it('hides the desktop-heavy mobile nav controls instead of forcing a scroll rail', () => {
        const css = fs.readFileSync(navCssPath, 'utf-8');
        const mobileNavBlock = css.match(/@media \(max-width: 768px\) \{[\s\S]*?\.theme-toggle\s*\{[\s\S]*?\}\s*\}/);

        expect(mobileNavBlock?.[0]).toContain('.top-nav');
        expect(mobileNavBlock?.[0]).toContain('.nav-right');
        expect(mobileNavBlock?.[0]).toContain('display: none;');
        expect(mobileNavBlock?.[0]).toContain('.nav-mobile-only');
        expect(mobileNavBlock?.[0]).toContain('.nav-desktop-only');
        expect(mobileNavBlock?.[0]).toContain('.theme-toggle');
    });

    it('keeps the mobile-only nav utility visible without the old trigger styles', () => {
        const css = fs.readFileSync(navCssPath, 'utf-8');
        const navMobileOnlyBlock = css.match(/\.nav-mobile-only\s*\{[\s\S]*?\}/);

        expect(navMobileOnlyBlock?.[0]).toContain('display: none;');
    });
});
