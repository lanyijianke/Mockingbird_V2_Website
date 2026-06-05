import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('theme styles', () => {
    it('defines both dark and parchment tokens in globals.css', () => {
        const globalsCss = fs.readFileSync(path.resolve(__dirname, '../../app/globals.css'), 'utf-8');

        expect(globalsCss).toContain("html[data-theme='light']");
        expect(globalsCss).toContain('--theme-bg');
        expect(globalsCss).toContain('--theme-surface');
        expect(globalsCss).toContain('--theme-border');
        expect(globalsCss).toContain('--theme-accent-soft');
        expect(globalsCss).toContain('.mobile-tab-bar');
        expect(globalsCss).toContain('.mobile-tab-item');
        expect(globalsCss).toContain('.mobile-tab-item.active');
    });

    it('declares the theme toggle styles in nav.css', () => {
        const navCss = fs.readFileSync(path.resolve(__dirname, '../../app/_styles/nav.css'), 'utf-8');

        expect(navCss).toContain('.theme-toggle');
        expect(navCss).toContain('.theme-toggle-option');
    });

    it('keeps article reader mobile rules in place', () => {
        const readerCss = fs.readFileSync(path.resolve(__dirname, '../../app/articles/[slug]/article-reader.css'), 'utf-8');

        expect(readerCss).toContain('@media (max-width: 768px)');
        expect(readerCss).toContain('.reader-container');
        expect(readerCss).toContain('.article-toc');
        expect(readerCss).toContain('.reader-back-float');
    });

    it('keeps prompt detail mobile rules in place', () => {
        const promptCss = fs.readFileSync(path.resolve(__dirname, '../../app/ai/prompts/[id]/prompt-detail.css'), 'utf-8');

        expect(promptCss).toContain('@media (max-width: 767px)');
        expect(promptCss).toContain('.pd-layout');
        expect(promptCss).toContain('.pd-media');
        expect(promptCss).toContain('.pd-content');
    });
});
