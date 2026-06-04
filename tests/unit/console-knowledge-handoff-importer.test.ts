import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { stageConsoleHandoffReview } from '../../scripts/console-knowledge-handoff-core.mjs';

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

const skillDir = path.join(process.cwd(), 'console-knowledge-handoff');
const terminology = JSON.parse(readFileSync(path.join(skillDir, 'references/terminology.json'), 'utf8'));
const chineseHandoff = JSON.parse(readFileSync(path.join(skillDir, 'fixtures/console-chinese-handoff.json'), 'utf8'));
const englishHandoff = JSON.parse(readFileSync(path.join(skillDir, 'fixtures/console-english-handoff.json'), 'utf8'));

describe('console knowledge handoff importer', () => {
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
            now: new Date('2026-06-05T02:30:00.000Z'),
            updatedBy: 'unit-test',
        })).rejects.toThrow(/translator is required/i);
    });
});
