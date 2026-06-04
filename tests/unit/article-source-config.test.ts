import { afterEach, describe, expect, it } from 'vitest';
import { loadArticleSourceConfigs } from '@/lib/articles/source-config';

const ORIGINAL_ENV = process.env.ARTICLE_LOCAL_SOURCES;
const ORIGINAL_R2_ENV = process.env.ARTICLE_R2_SOURCES;

describe('article source config', () => {
    afterEach(() => {
        if (typeof ORIGINAL_ENV === 'string') {
            process.env.ARTICLE_LOCAL_SOURCES = ORIGINAL_ENV;
        } else {
            delete process.env.ARTICLE_LOCAL_SOURCES;
        }

        if (typeof ORIGINAL_R2_ENV === 'string') {
            process.env.ARTICLE_R2_SOURCES = ORIGINAL_R2_ENV;
        } else {
            delete process.env.ARTICLE_R2_SOURCES;
        }
    });

    it('loads multiple local article sources from ARTICLE_LOCAL_SOURCES', () => {
        process.env.ARTICLE_LOCAL_SOURCES = JSON.stringify([
            {
                site: 'ai',
                source: 'web-article',
                rootPath: '/data/content/web-article',
                manifestPath: 'manifest.json',
            },
            {
                site: 'finance',
                source: 'finance-digest',
                rootPath: '/data/content/finance-digest',
                manifestPath: 'manifest.json',
            },
        ]);

        expect(loadArticleSourceConfigs()).toEqual([
            {
                type: 'local',
                site: 'ai',
                source: 'web-article',
                rootPath: '/data/content/web-article',
                manifestPath: 'manifest.json',
            },
            {
                type: 'local',
                site: 'finance',
                source: 'finance-digest',
                rootPath: '/data/content/finance-digest',
                manifestPath: 'manifest.json',
            },
        ]);
    });

    it('loads R2 article sources from ARTICLE_R2_SOURCES', () => {
        process.env.ARTICLE_R2_SOURCES = JSON.stringify([
            {
                site: 'ai',
                source: 'web-article',
                bucket: 'knowledge-articles',
                prefix: 'ai',
                manifestPath: 'manifest.json',
                publicBaseUrl: 'https://assets.zgnknowledge.online/ai',
            },
        ]);

        expect(loadArticleSourceConfigs()).toEqual([
            {
                type: 'r2',
                site: 'ai',
                source: 'web-article',
                bucket: 'knowledge-articles',
                prefix: 'ai',
                manifestPath: 'manifest.json',
                publicBaseUrl: 'https://assets.zgnknowledge.online/ai',
            },
        ]);
    });

    it('rejects duplicate site/source pairs', () => {
        process.env.ARTICLE_LOCAL_SOURCES = JSON.stringify([
            {
                site: 'ai',
                source: 'web-article',
                rootPath: '/data/content/web-article',
                manifestPath: 'manifest.json',
            },
            {
                site: 'ai',
                source: 'web-article',
                rootPath: '/data/content/web-article-copy',
                manifestPath: 'manifest.json',
            },
        ]);

        expect(() => loadArticleSourceConfigs()).toThrow(/duplicate article source/i);
    });

    it('rejects duplicate site/source pairs across local and R2 sources', () => {
        process.env.ARTICLE_LOCAL_SOURCES = JSON.stringify([
            {
                site: 'ai',
                source: 'web-article',
                rootPath: '/data/content/web-article',
                manifestPath: 'manifest.json',
            },
        ]);
        process.env.ARTICLE_R2_SOURCES = JSON.stringify([
            {
                site: 'ai',
                source: 'web-article',
                bucket: 'knowledge-articles',
                prefix: 'ai',
                manifestPath: 'manifest.json',
                publicBaseUrl: 'https://assets.zgnknowledge.online/ai',
            },
        ]);

        expect(() => loadArticleSourceConfigs()).toThrow(/duplicate article source/i);
    });
});
