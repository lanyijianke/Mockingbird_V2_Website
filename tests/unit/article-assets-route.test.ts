import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs/promises';

vi.mock('@/lib/articles/article-directory', () => ({
    getArticleDirectoryEntry: vi.fn(),
    resolveEntryAssetFilePath: vi.fn(),
}));

vi.mock('fs/promises', () => ({
    default: {
        readFile: vi.fn(),
    },
}));

describe('article asset route', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('returns 404 for R2 entries because assets are served publicly from R2', async () => {
        const { getArticleDirectoryEntry } = await import('@/lib/articles/article-directory');
        const { resolveEntryAssetFilePath } = await import('@/lib/articles/article-directory');
        vi.mocked(getArticleDirectoryEntry).mockResolvedValue({
            site: 'ai',
            slug: 'prompt-caching',
            sourceType: 'r2',
        } as never);
        vi.mocked(resolveEntryAssetFilePath).mockReturnValue('/tmp/cover.jpg');
        vi.mocked(fs.readFile).mockResolvedValue(Buffer.from('image'));

        const { GET } = await import('@/app/api/article-assets/[site]/[slug]/[...assetPath]/route');
        const response = await GET(new NextRequest('http://localhost/api/article-assets/ai/prompt-caching/images/cover.jpg'), {
            params: Promise.resolve({ site: 'ai', slug: 'prompt-caching', assetPath: ['images', 'cover.jpg'] }),
        });

        expect(response.status).toBe(404);
    });
});
