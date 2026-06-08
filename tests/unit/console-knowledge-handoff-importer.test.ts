import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
    stageConsoleHandoffReview,
    writeConsoleHandoffPreview,
} from '../../scripts/console-knowledge-handoff-core.mjs';

type StoredObject = {
    body: Uint8Array;
    contentType: string;
};

class MemoryR2Store {
    readonly objects = new Map<string, StoredObject>();

    setText(key: string, value: string, contentType: string = 'application/json; charset=utf-8'): void {
        this.objects.set(key, {
            body: new TextEncoder().encode(value),
            contentType,
        });
    }

    getText(key: string): string {
        const value = this.objects.get(key);
        if (!value) {
            throw new Error(`Missing object: ${key}`);
        }
        return new TextDecoder().decode(value.body);
    }

    async writeJson(_bucket: string, key: string, value: unknown): Promise<void> {
        this.setText(key, `${JSON.stringify(value, null, 2)}\n`);
    }

    async writeText(_bucket: string, key: string, value: string, contentType: string): Promise<void> {
        this.setText(key, value, contentType);
    }

    async writeBytes(_bucket: string, key: string, value: Uint8Array, contentType: string): Promise<void> {
        this.objects.set(key, { body: value, contentType });
    }
}

const terminology = {
    terminology: {
        'AI/ML 人工智能与机器学习': {
            LLM: { en: 'LLM', zh: 'LLM', field: 'keep' },
        },
        '科技/AI 工程专业词库': {
            'agentic workflow': { en: 'agentic workflow', zh: 'Agent 工作流', field: 'translate' },
            'context engineering': { en: 'context engineering', zh: '上下文工程', field: 'translate' },
            'prompt injection': { en: 'prompt injection', zh: 'prompt 注入', field: 'translate' },
            'canary release': { en: 'canary release', zh: '金丝雀发布', field: 'translate' },
            observability: { en: 'observability', zh: '可观测性', field: 'translate' },
            'review gate': { en: 'review gate', zh: 'review gate', field: 'keep' },
        },
    },
};

const chineseHandoff = {
    schemaVersion: 1,
    source: {
        sourceType: 'twitter',
        sourcePlatform: 'x',
        sourceContentId: 'tweet-zh-42',
        sourceUrl: 'https://x.com/example/status/42',
    },
    article: {
        language: 'zh',
        title: 'Agent 工作流为什么需要可审计的中间状态',
        content: [
            '# Agent 工作流为什么需要可审计的中间状态',
            '',
            '很多团队在引入 AI Agent 之后，会把注意力放在最终答案是否漂亮。',
            '',
            '但真正能让系统稳定运行的是可审计的中间状态，因为它让人工 review gate 变得有效复核。',
        ].join('\n'),
    },
    analysis: {
        summary: '解释 Agent 工作流中审计状态和人工复核的重要性。',
        categoryHints: ['applications'],
    },
    mediaAssets: [
        {
            assetType: 'image',
            processingStatus: 'completed',
            publicUrl: 'https://cdn.example.com/cover.jpg',
        },
    ],
};

const englishHandoff = {
    schemaVersion: 1,
    source: {
        sourceType: 'twitter',
        sourcePlatform: 'x',
        sourceContentId: 'tweet-en-42',
        sourceUrl: 'https://x.com/example/status/4242',
    },
    article: {
        language: 'en',
        title: 'Why reliable agent workflows need review gates',
        content: [
            '# Why reliable agent workflows need review gates',
            '',
            'LLM agents are useful because they can turn messy input into structured output.',
            '',
            'A reliable workflow keeps the raw source, intermediate reasoning traces, and final draft separate.',
            '',
            'The review gate is not bureaucracy. It is the control point that prevents confident mistakes from being published.',
        ].join('\n'),
    },
    analysis: {
        summary: 'A note about review gates in production agent workflows.',
        categoryHints: ['applications'],
    },
    mediaAssets: [
        {
            assetType: 'image',
            processingStatus: 'completed',
            publicUrl: 'https://cdn.example.com/cover.jpg',
        },
    ],
};

describe('console knowledge handoff importer', () => {
    it('publishes generated covers with content-versioned paths to avoid CDN stale cover caches', () => {
        const script = fs.readFileSync('/Users/grank/.codex/skills/console-knowledge-handoff/scripts/console-knowledge-handoff.mjs', 'utf8');

        expect(script).toContain('versionedCoverImagePath');
        expect(script).toContain('cover-');
        expect(script).not.toContain("coverImage: 'images/cover.jpg'");
    });

    it('does not make the handoff publish skill write Agent search indexes', () => {
        const skill = fs.readFileSync('/Users/grank/.codex/skills/console-knowledge-handoff/SKILL.md', 'utf8');
        const script = fs.readFileSync('/Users/grank/.codex/skills/console-knowledge-handoff/scripts/console-knowledge-handoff.mjs', 'utf8');

        expect(script).not.toContain('/api/agent/index');
        expect(script).toContain('agentIndexing');
        expect(skill).toContain('AgentIndexSync');
        expect(skill).toContain('不得调用 `/api/agent/index`');
    });

    it('stages a Chinese handoff into review without mutating the published manifest', async () => {
        const store = new MemoryR2Store();
        const manifestBefore = JSON.stringify({
            site: 'ai',
            source: 'web-article',
            articles: [{ slug: 'existing-article', status: 'published' }],
        });
        store.setText('ai/manifest.json', manifestBefore);

        const fetchImpl = vi.fn(async () => new Response(Uint8Array.from([1, 2, 3]), {
            headers: { 'content-type': 'image/jpeg' },
        }));

        const result = await stageConsoleHandoffReview({
            handoff: chineseHandoff,
            siteConfig: {
                site: 'ai',
                source: 'web-article',
                bucket: 'knowledge-articles',
                prefix: 'ai',
            },
            store,
            fetchImpl,
            terminology,
            previewDir: null,
            now: new Date('2026-06-05T01:00:00.000Z'),
            updatedBy: 'unit-test',
        });

        expect(result.slug).toBe('twitter-tweet-zh-42');
        expect(result.reviewContentKey).toBe('ai/articles/review/twitter-tweet-zh-42/index.md');
        expect(store.getText(result.reviewContentKey)).toContain('# Agent 工作流为什么需要可审计的中间状态');
        expect(result.title).toBe('Agent 工作流为什么需要可审计的中间状态');
        expect(store.getText(result.reviewContentKey)).toContain('![封面](images/cover.jpg)');
        expect(store.getText(result.reviewContentKey)).toContain('很多团队在引入 AI Agent 之后');
        expect(JSON.parse(store.getText('ai/state/articles/twitter-tweet-zh-42.json'))).toMatchObject({
            slug: 'twitter-tweet-zh-42',
            state: 'review',
            updatedBy: 'unit-test',
        });
        expect(store.getText('ai/manifest.json')).toBe(manifestBefore);
        expect(fetchImpl).toHaveBeenCalledTimes(1);
    });

    it('translates and reviews English chunks through sub agents before staging the review draft', async () => {
        const store = new MemoryR2Store();
        const previewRoot = await mkdtemp(path.join(os.tmpdir(), 'console-handoff-preview-'));
        store.setText('ai/manifest.json', JSON.stringify({ site: 'ai', source: 'web-article', articles: [] }));

        const translator = {
            translateChunk: vi
                .fn()
                .mockImplementationOnce(async (input: { chunk: string; terminology: typeof terminology }) => {
                    expect(input.terminology.terminology['AI/ML 人工智能与机器学习'].LLM.field).toBe('keep');
                    expect(input.chunk).toContain('LLM agents are useful');
                    return 'LLM Agent 可以把杂乱输入整理成结构化输出，但生产团队需要的不只是漂亮的最终答案。';
                })
                .mockImplementationOnce(async (input: { chunk: string }) => {
                    expect(input.chunk).toContain('A reliable workflow keeps the raw source');
                    return '可靠的工作流会把原始素材、中间推理痕迹和最终草稿分开保存，这样运营就能在发布前检查改动。';
                })
                .mockImplementationOnce(async (input: { chunk: string }) => {
                    expect(input.chunk).toContain('The review gate is not bureaucracy');
                    return 'review gate 不是官僚流程，而是防止模型自信地发布错误文章的控制点。';
                }),
        };
        const reviewer = {
            reviewChunk: vi
                .fn()
                .mockImplementationOnce(async (input: { translatedChunk: string }) => `${input.translatedChunk}\n\n【审核】术语保留正确。`)
                .mockImplementationOnce(async (input: { translatedChunk: string }) => input.translatedChunk)
                .mockImplementationOnce(async (input: { translatedChunk: string }) => input.translatedChunk.replace('review gate', 'review gate')),
        };
        const fetchImpl = vi.fn(async () => new Response(Uint8Array.from([4, 5, 6]), {
            headers: { 'content-type': 'image/jpeg' },
        }));

        try {
            const result = await stageConsoleHandoffReview({
                handoff: englishHandoff,
                siteConfig: {
                    site: 'ai',
                    source: 'web-article',
                    bucket: 'knowledge-articles',
                    prefix: 'ai',
                },
                store,
                fetchImpl,
                terminology,
                translator,
                reviewer,
                previewDir: previewRoot,
                reviewMetadata: {
                    sourceLocator: 'r2://content-hub-r2/knowledge-imports/console/sample.json',
                    translationReview: {
                        method: 'parallel-subagents-maker-checker',
                        translatedChunks: 3,
                        checkerReport: 'PASS',
                        checkerStatus: 'pass',
                    },
                },
                now: new Date('2026-06-05T02:00:00.000Z'),
                updatedBy: 'unit-test',
            });

            expect(translator.translateChunk).toHaveBeenCalledTimes(3);
            expect(reviewer.reviewChunk).toHaveBeenCalledTimes(3);
            expect(result.slug).toBe('twitter-tweet-en-42');
            const markdown = store.getText(result.reviewContentKey);
            expect(markdown).toContain('# 为什么可靠的 Agent 工作流需要 review gate');
            expect(markdown).toContain('LLM Agent 可以把杂乱输入整理成结构化输出');
            expect(markdown).toContain('【审核】术语保留正确。');
            expect(markdown).not.toContain('Why reliable agent workflows need review gates');
            expect(JSON.parse(store.getText('ai/state/articles/twitter-tweet-en-42.json'))).toMatchObject({
                slug: 'twitter-tweet-en-42',
                state: 'review',
                updatedBy: 'unit-test',
            });
            const reviewMetadata = JSON.parse(store.getText('ai/articles/review/twitter-tweet-en-42/review.json'));
            expect(reviewMetadata).toMatchObject({
                schemaVersion: 1,
                sourceLocator: 'r2://content-hub-r2/knowledge-imports/console/sample.json',
                originalUrl: 'https://x.com/example/status/4242',
                sourceContentId: 'tweet-en-42',
                language: 'en',
                translationReview: {
                    method: 'parallel-subagents-maker-checker',
                    checkerReport: 'PASS',
                },
            });
            expect(result.preview?.indexPath).toBe(path.join(previewRoot, 'twitter-tweet-en-42', 'index.html'));
            const previewHtml = await readFile(result.preview!.indexPath, 'utf8');
            expect(previewHtml).toContain('临时审阅预览');
            expect(previewHtml).toContain('为什么可靠的 Agent 工作流需要 review gate');
            expect(previewHtml).toContain('正文预览');
            expect(previewHtml).toContain('translation.md');
            expect(previewHtml).not.toContain('原文 / 译文对照');
            expect(previewHtml).toContain('如果通过，回复：发布这篇');
            expect(previewHtml).toContain('<img src="images/cover.jpg" alt="封面"');
            expect(previewHtml).not.toContain('![封面]');
            expect(await readFile(path.join(previewRoot, 'twitter-tweet-en-42', 'images', 'cover.jpg'))).toEqual(Buffer.from([4, 5, 6]));
            expect(await readFile(path.join(previewRoot, 'twitter-tweet-en-42', 'source.md'), 'utf8')).toContain('LLM agents are useful');
            expect(await readFile(path.join(previewRoot, 'twitter-tweet-en-42', 'translation.md'), 'utf8')).toBe(markdown);
        } finally {
            await rm(previewRoot, { recursive: true, force: true });
        }
    });

    it('preserves inline source image markdown in translated English reviews', async () => {
        const store = new MemoryR2Store();
        const previewRoot = await mkdtemp(path.join(os.tmpdir(), 'console-handoff-images-preview-'));
        const handoffWithImage = structuredClone(englishHandoff);
        handoffWithImage.mediaAssets = [];
        handoffWithImage.article.content = [
            '# Image rich source',
            '',
            'First source paragraph.',
            '',
            '![Architecture diagram](https://cdn.example.com/diagram.png)',
            '',
            'Second source paragraph.',
        ].join('\n');

        const translator = {
            translateChunk: vi
                .fn()
                .mockResolvedValueOnce('第一段译文。')
                .mockResolvedValueOnce('第二段译文。'),
        };
        const reviewer = {
            reviewChunk: vi.fn(async (input: { translatedChunk: string }) => input.translatedChunk),
        };

        try {
            const result = await stageConsoleHandoffReview({
                handoff: handoffWithImage,
                siteConfig: {
                    site: 'ai',
                    source: 'web-article',
                    bucket: 'knowledge-articles',
                    prefix: 'ai',
                },
                store,
                fetchImpl: vi.fn(),
                terminology,
                translator,
                reviewer,
                previewDir: previewRoot,
                now: new Date('2026-06-05T03:00:00.000Z'),
                updatedBy: 'unit-test',
            });

            const markdown = store.getText(result.reviewContentKey);
            expect(translator.translateChunk).toHaveBeenCalledTimes(2);
            expect(reviewer.reviewChunk).toHaveBeenCalledTimes(2);
            expect(markdown).toContain('第一段译文。');
            expect(markdown).toContain('![Architecture diagram](https://cdn.example.com/diagram.png)');
            expect(markdown).toContain('第二段译文。');

            const previewHtml = await readFile(result.preview!.indexPath, 'utf8');
            expect(previewHtml).toContain('<img src="https://cdn.example.com/diagram.png" alt="Architecture diagram"');
        } finally {
            await rm(previewRoot, { recursive: true, force: true });
        }
    });

    it('fails clearly when an English handoff is staged without sub agents', async () => {
        const store = new MemoryR2Store();

        await expect(stageConsoleHandoffReview({
            handoff: englishHandoff,
            siteConfig: {
                site: 'ai',
                source: 'web-article',
                bucket: 'knowledge-articles',
                prefix: 'ai',
            },
            store,
            fetchImpl: vi.fn(),
            terminology,
            previewDir: null,
            now: new Date('2026-06-05T02:30:00.000Z'),
            updatedBy: 'unit-test',
        })).rejects.toThrow(/translator is required/i);
    });

    it('can generate a local preview from an existing staged review without restaging translation', async () => {
        const previewRoot = await mkdtemp(path.join(os.tmpdir(), 'console-handoff-existing-preview-'));
        const sourceAssetRoot = path.join(previewRoot, 'r2-assets');
        await mkdir(path.join(sourceAssetRoot, 'images'), { recursive: true });
        await writeFile(path.join(sourceAssetRoot, 'images', 'cover.jpg'), Buffer.from([7, 8, 9]));
        const markdown = [
            '# 已暂存的中文标题',
            '',
            '> 已暂存摘要',
            '',
            '![封面](images/cover.jpg)',
            '',
            '第一段完整译文。',
            '',
            '第二段完整译文。',
        ].join('\n');

        try {
            const result = await writeConsoleHandoffPreview({
                previewDir: previewRoot,
                slug: 'existing-review',
                handoff: englishHandoff,
                markdown,
                metadata: {
                    schemaVersion: 1,
                    title: '已暂存的中文标题',
                    summary: '已暂存摘要',
                    originalUrl: englishHandoff.source.sourceUrl,
                    sourceLocator: 'r2://content-hub-r2/knowledge-imports/console/existing.json',
                    category: 'applications',
                    language: 'en',
                    translationReview: {
                        method: 'parallel-subagents-maker-checker',
                        translatedChunks: 2,
                        checkerStatus: 'pass',
                        checkerReport: 'PASS',
                    },
                },
                stateDocument: {
                    contentKey: 'ai/articles/review/existing-review/index.md',
                },
                assetSourceDir: sourceAssetRoot,
            });

            const previewHtml = await readFile(result.indexPath, 'utf8');
            expect(previewHtml).toContain('已暂存的中文标题');
            expect(previewHtml).toContain('第一段完整译文。');
            expect(previewHtml).toContain('<img src="images/cover.jpg" alt="封面"');
            expect(previewHtml).toContain('正文预览');
            expect(previewHtml).not.toContain('原文 / 译文对照');
            expect(previewHtml).toContain('PASS');
            expect(await readFile(path.join(previewRoot, 'existing-review', 'images', 'cover.jpg'))).toEqual(Buffer.from([7, 8, 9]));
        } finally {
            await rm(previewRoot, { recursive: true, force: true });
        }
    });
});
