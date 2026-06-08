import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
    clearArticleDirectoryCache,
    fetchAggregatedArticleDirectory,
    fetchArticleMarkdown,
} from '@/lib/articles/article-directory';

const ORIGINAL_ENV = process.env.ARTICLE_LOCAL_SOURCES;

describe('local article directory', () => {
    let tempRoot: string;

    beforeEach(async () => {
        tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'article-sources-'));
    });

    afterEach(async () => {
        clearArticleDirectoryCache();

        if (typeof ORIGINAL_ENV === 'string') {
            process.env.ARTICLE_LOCAL_SOURCES = ORIGINAL_ENV;
        } else {
            delete process.env.ARTICLE_LOCAL_SOURCES;
        }

        await fs.rm(tempRoot, { recursive: true, force: true });
    });

    it('aggregates published articles from multiple local manifests and sorts them newest first', async () => {
        const aiRoot = path.join(tempRoot, 'web-article');
        const financeRoot = path.join(tempRoot, 'finance-digest');
        await fs.mkdir(aiRoot, { recursive: true });
        await fs.mkdir(financeRoot, { recursive: true });

        await fs.writeFile(path.join(aiRoot, 'manifest.json'), JSON.stringify({
            site: 'ai',
            source: 'web-article',
            categories: [{ code: 'engineering', name: '工程架构' }],
            articles: [
                {
                    id: 'ai-1',
                    slug: 'prompt-caching',
                    title: 'Prompt Caching',
                    summary: 'AI summary',
                    category: 'engineering',
                    author: '@_avichawla',
                    originalUrl: 'https://x.com/example/1',
                    sourcePlatform: 'x',
                    type: 'tweet',
                    coverImage: 'articles/prompt-caching/images/cover.jpg',
                    contentPath: 'articles/prompt-caching/index.md',
                    publishedAt: '2026-04-20T12:20:00+08:00',
                    updatedAt: '2026-04-20T12:20:00+08:00',
                    status: 'published',
                },
                {
                    id: 'ai-2',
                    slug: 'draft-only',
                    title: 'Draft only',
                    summary: 'draft',
                    category: 'engineering',
                    author: '@draft',
                    originalUrl: 'https://x.com/example/draft',
                    sourcePlatform: 'x',
                    type: 'tweet',
                    coverImage: 'articles/draft/images/cover.jpg',
                    contentPath: 'articles/draft/index.md',
                    publishedAt: '2026-04-21T09:00:00+08:00',
                    updatedAt: '2026-04-21T09:00:00+08:00',
                    status: 'draft',
                },
            ],
        }, null, 2));

        await fs.writeFile(path.join(financeRoot, 'manifest.json'), JSON.stringify({
            site: 'finance',
            source: 'finance-digest',
            categories: [{ code: 'macro', name: '宏观' }],
            articles: [
                {
                    id: 'finance-1',
                    slug: 'fed-notes',
                    title: 'Fed Notes',
                    summary: 'Finance summary',
                    category: 'macro',
                    author: '@macro',
                    originalUrl: 'https://example.com/fed-notes',
                    sourcePlatform: 'website',
                    type: 'article',
                    coverImage: 'articles/fed-notes/images/cover.jpg',
                    contentPath: 'articles/fed-notes/index.md',
                    publishedAt: '2026-04-21T11:00:00+08:00',
                    updatedAt: '2026-04-21T11:30:00+08:00',
                    status: 'published',
                },
            ],
        }, null, 2));

        process.env.ARTICLE_LOCAL_SOURCES = JSON.stringify([
            {
                site: 'ai',
                source: 'web-article',
                rootPath: aiRoot,
                manifestPath: 'manifest.json',
            },
            {
                site: 'finance',
                source: 'finance-digest',
                rootPath: financeRoot,
                manifestPath: 'manifest.json',
            },
        ]);

        const directory = await fetchAggregatedArticleDirectory({ forceRefresh: true });

        expect(directory.entries.map((entry) => `${entry.site}:${entry.slug}`)).toEqual([
            'finance:fed-notes',
            'ai:prompt-caching',
        ]);

        expect(directory.categoriesBySite.ai).toEqual([{ code: 'engineering', name: '工程架构' }]);
        expect(directory.categoriesBySite.finance).toEqual([{ code: 'macro', name: '宏观' }]);
        expect(directory.entries[0].coverUrl).toBe('/api/article-assets/finance/fed-notes/images/cover.jpg');
    });

    it('derives categories and resolves article-relative cover paths when the manifest omits repository-level metadata', async () => {
        const aiRoot = path.join(tempRoot, 'web-article');
        await fs.mkdir(aiRoot, { recursive: true });

        await fs.writeFile(path.join(aiRoot, 'manifest.json'), JSON.stringify({
            site: 'ai',
            source: 'web-article',
            articles: [
                {
                    id: 'build-astonishing-ui-with-codex',
                    slug: 'build-astonishing-ui-with-codex',
                    title: '如何用 Codex 构建惊艳的 UI',
                    summary: 'summary',
                    category: 'engineering',
                    author: '@emanueledpt',
                    originalUrl: 'https://x.com/emanueledpt/status/2035402224260550921',
                    sourcePlatform: 'x',
                    type: 'tweet',
                    coverImage: 'images/cover.jpg',
                    contentPath: 'articles/build-astonishing-ui-with-codex/index.md',
                    publishedAt: '2026-04-12T09:30:00+08:00',
                    updatedAt: '2026-04-12T09:30:00+08:00',
                    status: 'published',
                },
            ],
        }, null, 2));

        process.env.ARTICLE_LOCAL_SOURCES = JSON.stringify([
            {
                site: 'ai',
                source: 'web-article',
                rootPath: aiRoot,
                manifestPath: 'manifest.json',
            },
        ]);

        const directory = await fetchAggregatedArticleDirectory({ forceRefresh: true });

        expect(directory.categoriesBySite.ai).toEqual([{ code: 'engineering', name: '工程架构' }]);
        expect(directory.entries[0].coverUrl).toBe('/api/article-assets/ai/build-astonishing-ui-with-codex/images/cover.jpg');
    });

    it('falls back to the site default cover when a local manifest has no cover image', async () => {
        const aiRoot = path.join(tempRoot, 'web-article');
        await fs.mkdir(aiRoot, { recursive: true });

        await fs.writeFile(path.join(aiRoot, 'manifest.json'), JSON.stringify({
            site: 'ai',
            source: 'web-article',
            articles: [
                {
                    id: 'no-cover',
                    slug: 'no-cover',
                    title: 'No Cover',
                    summary: 'summary',
                    category: 'engineering',
                    author: '@author',
                    originalUrl: 'https://example.com/no-cover',
                    sourcePlatform: 'website',
                    type: 'article',
                    coverImage: '',
                    contentPath: 'articles/no-cover/index.md',
                    publishedAt: '2026-06-04T10:00:00.000Z',
                    status: 'published',
                },
            ],
        }, null, 2));

        process.env.ARTICLE_LOCAL_SOURCES = JSON.stringify([
            {
                site: 'ai',
                source: 'web-article',
                rootPath: aiRoot,
                manifestPath: 'manifest.json',
            },
        ]);

        const directory = await fetchAggregatedArticleDirectory({ forceRefresh: true });

        expect(directory.entries[0]).toMatchObject({
            slug: 'no-cover',
            coverImagePath: '',
            coverUrl: '/images/default-cover.png',
        });
    });

    it('throws when the manifest disappears because ISR is the public cache layer', async () => {
        const aiRoot = path.join(tempRoot, 'web-article');
        await fs.mkdir(path.join(aiRoot, 'articles', 'prompt-caching'), { recursive: true });

        const manifestPath = path.join(aiRoot, 'manifest.json');
        await fs.writeFile(manifestPath, JSON.stringify({
            site: 'ai',
            source: 'web-article',
            articles: [
                {
                    id: 'ai-1',
                    slug: 'prompt-caching',
                    title: 'Prompt Caching',
                    summary: 'summary',
                    category: 'engineering',
                    author: '@author',
                    originalUrl: 'https://example.com/prompt-caching',
                    sourcePlatform: 'website',
                    type: 'article',
                    coverImage: 'images/cover.jpg',
                    contentPath: 'articles/prompt-caching/index.md',
                    publishedAt: '2026-04-20T12:20:00+08:00',
                    updatedAt: '2026-04-20T12:20:00+08:00',
                    status: 'published',
                },
            ],
        }, null, 2));

        process.env.ARTICLE_LOCAL_SOURCES = JSON.stringify([
            {
                site: 'ai',
                source: 'web-article',
                rootPath: aiRoot,
                manifestPath: 'manifest.json',
            },
        ]);

        await fetchAggregatedArticleDirectory({ forceRefresh: true });
        await fs.rm(manifestPath, { force: true });

        await expect(fetchAggregatedArticleDirectory({ forceRefresh: true })).rejects.toThrow(/manifest\.json/);
    });

    it('throws when markdown disappears because ISR is the public cache layer', async () => {
        const aiRoot = path.join(tempRoot, 'web-article');
        const articleDir = path.join(aiRoot, 'articles', 'prompt-caching');
        await fs.mkdir(articleDir, { recursive: true });

        await fs.writeFile(path.join(aiRoot, 'manifest.json'), JSON.stringify({
            site: 'ai',
            source: 'web-article',
            articles: [
                {
                    id: 'ai-1',
                    slug: 'prompt-caching',
                    title: 'Prompt Caching',
                    summary: 'summary',
                    category: 'engineering',
                    author: '@author',
                    originalUrl: 'https://example.com/prompt-caching',
                    sourcePlatform: 'website',
                    type: 'article',
                    coverImage: 'images/cover.jpg',
                    contentPath: 'articles/prompt-caching/index.md',
                    publishedAt: '2026-04-20T12:20:00+08:00',
                    updatedAt: '2026-04-20T12:20:00+08:00',
                    status: 'published',
                },
            ],
        }, null, 2));

        const markdownPath = path.join(articleDir, 'index.md');
        await fs.writeFile(markdownPath, '# Prompt Caching\n\nhello');

        process.env.ARTICLE_LOCAL_SOURCES = JSON.stringify([
            {
                site: 'ai',
                source: 'web-article',
                rootPath: aiRoot,
                manifestPath: 'manifest.json',
            },
        ]);

        const directory = await fetchAggregatedArticleDirectory({ forceRefresh: true });
        const entry = directory.entries[0];

        await fetchArticleMarkdown(entry, { forceRefresh: true });
        await fs.rm(markdownPath, { force: true });

        await expect(fetchArticleMarkdown(entry, { forceRefresh: true })).rejects.toThrow(/index\.md/);
    });
});
