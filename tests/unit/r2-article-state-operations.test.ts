import { describe, expect, it } from 'vitest';
import {
    listR2ArticleStateKeys,
    rollbackR2ArticleState,
    snapshotR2ArticleState,
    verifyR2ArticleState,
} from '../../scripts/r2-article-state-core.mjs';
import { createSha256Checksum } from '@/lib/articles/state-machine';

class MemoryR2Store {
    readonly objects = new Map<string, string>();

    async readText(_bucket: string, key: string): Promise<string> {
        const value = this.objects.get(key);
        if (value === undefined) {
            throw new Error(`Missing object: ${key}`);
        }
        return value;
    }

    async writeJson(_bucket: string, key: string, value: unknown): Promise<void> {
        this.objects.set(key, `${JSON.stringify(value, null, 2)}\n`);
    }

    async listKeys(_bucket: string, prefix: string): Promise<string[]> {
        return Array.from(this.objects.keys())
            .filter((key) => key.startsWith(prefix))
            .sort();
    }
}

describe('R2 article state operations', () => {
    it('verifies, snapshots, lists, and rolls back the published manifest flow', async () => {
        const store = new MemoryR2Store();
        const articleMarkdown = '# Published article\n\nhello';
        const currentManifest = {
            site: 'ai',
            source: 'web-article',
            updatedAt: '2026-06-03T09:00:00.000Z',
            articles: [
                {
                    id: 'ai-1',
                    slug: 'published-one',
                    title: 'Published One',
                    summary: 'summary',
                    category: 'engineering',
                    author: 'author',
                    originalUrl: 'https://example.com/published-one',
                    sourcePlatform: 'website',
                    type: 'article',
                    coverImage: 'images/cover.jpg',
                    contentPath: 'articles/published/published-one/index.md',
                    publishedAt: '2026-06-03T09:00:00.000Z',
                    updatedAt: '2026-06-03T09:00:00.000Z',
                    status: 'published',
                    checksum: createSha256Checksum(articleMarkdown),
                },
                {
                    id: 'ai-2',
                    slug: 'draft-one',
                    title: 'Draft One',
                    summary: 'summary',
                    category: 'engineering',
                    author: 'author',
                    originalUrl: 'https://example.com/draft-one',
                    sourcePlatform: 'website',
                    type: 'article',
                    coverImage: 'images/cover.jpg',
                    contentPath: 'articles/draft/draft-one/index.md',
                    publishedAt: '2026-06-03T09:00:00.000Z',
                    status: 'draft',
                },
            ],
        };

        store.objects.set('ai/manifest.json', JSON.stringify(currentManifest));
        store.objects.set('ai/articles/published/published-one/index.md', articleMarkdown);
        store.objects.set('ai/articles/published/published-one/images/cover.jpg', 'cover-bytes');

        await expect(verifyR2ArticleState(store, {
            bucket: 'knowledge-articles',
            prefix: 'ai',
        })).resolves.toEqual({
            publishedCount: 1,
            missing: [],
            checksumMismatches: [],
        });

        const snapshotKey = await snapshotR2ArticleState(store, {
            bucket: 'knowledge-articles',
            prefix: 'ai',
            now: new Date('2026-06-03T10:00:00.000Z'),
        });

        expect(snapshotKey).toBe('ai/manifests/2026-06-03T10-00-00-000Z.json');
        await expect(listR2ArticleStateKeys(store, {
            bucket: 'knowledge-articles',
            prefix: 'ai/manifests/',
        })).resolves.toEqual(['ai/manifests/2026-06-03T10-00-00-000Z.json']);

        store.objects.set('ai/manifest.json', JSON.stringify({ site: 'ai', source: 'web-article', articles: [] }));

        await rollbackR2ArticleState(store, {
            bucket: 'knowledge-articles',
            prefix: 'ai',
            snapshotKey,
        });

        expect(store.objects.get('ai/manifest.json')).toBe(store.objects.get(snapshotKey));
    });

    it('reports missing content and checksum mismatches without throwing', async () => {
        const store = new MemoryR2Store();
        store.objects.set('ai/manifest.json', JSON.stringify({
            site: 'ai',
            source: 'web-article',
            articles: [
                {
                    id: 'ai-1',
                    slug: 'bad-one',
                    title: 'Bad One',
                    summary: 'summary',
                    category: 'engineering',
                    author: 'author',
                    originalUrl: 'https://example.com/bad-one',
                    sourcePlatform: 'website',
                    type: 'article',
                    coverImage: 'images/cover.jpg',
                    contentPath: 'articles/published/bad-one/index.md',
                    publishedAt: '2026-06-03T09:00:00.000Z',
                    status: 'published',
                    checksum: createSha256Checksum('expected'),
                },
                {
                    id: 'ai-2',
                    slug: 'missing-one',
                    title: 'Missing One',
                    summary: 'summary',
                    category: 'engineering',
                    author: 'author',
                    originalUrl: 'https://example.com/missing-one',
                    sourcePlatform: 'website',
                    type: 'article',
                    coverImage: 'images/cover.jpg',
                    contentPath: 'articles/published/missing-one/index.md',
                    publishedAt: '2026-06-03T09:00:00.000Z',
                    status: 'published',
                },
            ],
        }));
        store.objects.set('ai/articles/published/bad-one/index.md', 'actual');
        store.objects.set('ai/articles/published/bad-one/images/cover.jpg', 'cover-bytes');

        await expect(verifyR2ArticleState(store, {
            bucket: 'knowledge-articles',
            prefix: 'ai',
        })).resolves.toEqual({
            publishedCount: 2,
            missing: [
                'ai/articles/published/missing-one/index.md',
                'ai/articles/published/missing-one/images/cover.jpg',
            ],
            checksumMismatches: ['ai/articles/published/bad-one/index.md'],
        });
    });
});
