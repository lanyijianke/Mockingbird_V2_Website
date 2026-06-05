import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();

function repoPath(path: string): string {
    return join(root, path);
}

function readRepoFile(path: string): string {
    return readFileSync(repoPath(path), 'utf8');
}

describe('legacy SEO teardown', () => {
    it('removes old SEO-only frontend routes', () => {
        [
            'app/ai/articles/categories/[category]/page.tsx',
            'app/ai/prompts/categories/[category]/page.tsx',
            'app/ai/prompts/scenarios/page.tsx',
            'app/ai/prompts/scenarios/[slug]/page.tsx',
            'app/ai/rankings/topics/page.tsx',
            'app/ai/rankings/topics/[slug]/page.tsx',
            'app/ai/rankings/skills-hot/page.tsx',
        ].forEach((path) => {
            expect(existsSync(repoPath(path)), path).toBe(false);
        });
    });

    it('removes old SEO helper modules that are not part of the rebuild', () => {
        [
            'lib/seo/config.ts',
            'lib/seo/growth-pages.ts',
            'lib/seo/internal-links.ts',
            'lib/utils/json-ld.tsx',
        ].forEach((path) => {
            expect(existsSync(repoPath(path)), path).toBe(false);
        });
    });

    it('removes legacy SEO widgets and json-ld from the AI homepage', () => {
        const source = readRepoFile('app/ai/AiHomePage.tsx');

        expect(source).not.toContain('HOME_SEO');
        expect(source).not.toContain('从这里继续探索');
        expect(source).not.toContain('继续展开');
    });

    it('does not link active navigation to removed SEO pages', () => {
        const activeFiles = [
            'app/SiteNav.tsx',
        ].map(readRepoFile).join('\n');

        expect(activeFiles).not.toContain('href="/ai/rankings/topics"');
        expect(activeFiles).not.toContain('href="/ai/rankings/skills-hot"');
        expect(activeFiles).not.toContain('/ai/prompts/categories/');
        expect(activeFiles).not.toContain('/ai/articles/categories/');
    });
});
