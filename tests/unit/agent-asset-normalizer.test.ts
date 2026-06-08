import { describe, expect, it } from 'vitest';
import type { ArticleDetail, Prompt } from '@/lib/types';
import {
    normalizeArticleAsset,
    normalizePromptAsset,
} from '@/lib/services/agent-asset-normalizer';

describe('agent asset normalizer', () => {
    it('normalizes prompt images and videos into media assets', () => {
        const asset = normalizePromptAsset({
            id: 7,
            title: 'Product poster prompt',
            description: 'Create ecommerce posters.',
            content: 'Use the uploaded product photo to create a premium ecommerce poster.',
            category: 'gpt-image-2',
            coverImageUrl: 'https://assets.example/cover.jpg',
            videoPreviewUrl: 'https://assets.example/full.mp4',
            cardPreviewVideoUrl: 'https://assets.example/card.mp4',
            imagesJson: JSON.stringify(['https://assets.example/example-1.jpg']),
            copyCount: 42,
            isActive: true,
            createdAt: '2026-06-01T00:00:00.000Z',
            updatedAt: '2026-06-02T00:00:00.000Z',
        } satisfies Prompt);

        expect(asset.assetKind).toBe('prompt');
        expect(asset.mediaTypes).toEqual(['image', 'video']);
        expect(asset.outputFormats).toEqual(['image', 'video']);
        expect(asset.useCases).toEqual(expect.arrayContaining(['gpt-image-2', 'poster']));
        expect(asset.promptText).toContain('premium ecommerce poster');
        expect(asset.usageNotes.length).toBeGreaterThan(0);
        expect(asset.media).toEqual(expect.arrayContaining([
            expect.objectContaining({ type: 'image', role: 'cover', url: 'https://assets.example/cover.jpg' }),
            expect.objectContaining({ type: 'image', role: 'example', url: 'https://assets.example/example-1.jpg' }),
            expect.objectContaining({ type: 'video', role: 'video-preview', url: 'https://assets.example/full.mp4' }),
            expect.objectContaining({ type: 'video', role: 'thumbnail', url: 'https://assets.example/card.mp4' }),
        ]));
        expect(asset.qualitySignals).toMatchObject({
            hasCover: true,
            hasVideo: true,
            hasExamples: true,
            copyCount: 42,
            updatedAt: '2026-06-02T00:00:00.000Z',
        });
    });

    it('ignores invalid prompt image JSON without losing cover media', () => {
        const asset = normalizePromptAsset({
            id: 8,
            title: 'Avatar image prompt',
            description: null,
            content: 'Create an avatar.',
            category: 'multimodal-prompts',
            coverImageUrl: 'https://assets.example/avatar.jpg',
            videoPreviewUrl: null,
            cardPreviewVideoUrl: null,
            imagesJson: '{bad-json',
            copyCount: 0,
            isActive: true,
            createdAt: '2026-06-01T00:00:00.000Z',
            updatedAt: null,
        } satisfies Prompt);

        expect(asset.mediaTypes).toEqual(['image']);
        expect(asset.media).toEqual([
            expect.objectContaining({ type: 'image', role: 'cover', url: 'https://assets.example/avatar.jpg' }),
        ]);
        expect(asset.qualitySignals).toMatchObject({
            hasCover: true,
            hasVideo: false,
            hasExamples: false,
            copyCount: 0,
            updatedAt: '2026-06-01T00:00:00.000Z',
        });
    });

    it('normalizes article cover and text output as an article asset', () => {
        const asset = normalizeArticleAsset({
            id: 'article-1',
            site: 'ai',
            title: 'Agent Workflow',
            slug: 'agent-workflow',
            summary: 'Workflow summary',
            category: 'engineering',
            categoryName: '工程架构',
            status: 1,
            coverUrl: 'https://assets.example/article-cover.jpg',
            createdAt: '2026-06-01T00:00:00.000Z',
            updatedAt: null,
            content: 'Article body',
            author: '@author',
            originalUrl: 'https://example.com/source',
            sourcePlatform: 'x',
            type: 'article',
        } satisfies ArticleDetail, { truncated: false });

        expect(asset.assetKind).toBe('article');
        expect(asset.mediaTypes).toEqual(['image']);
        expect(asset.outputFormats).toEqual(['text']);
        expect(asset.useCases).toEqual(expect.arrayContaining(['engineering', 'x']));
        expect(asset.media).toEqual([
            expect.objectContaining({ type: 'image', role: 'cover', url: 'https://assets.example/article-cover.jpg' }),
        ]);
        expect(asset.truncated).toBe(false);
        expect(asset.content).toBe('Article body');
    });
});
