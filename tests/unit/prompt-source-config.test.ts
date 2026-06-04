import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('prompt source config loader', () => {
    const ORIGINAL_PROMPT_SOURCE_CONFIG_DIR = process.env.PROMPT_SOURCE_CONFIG_DIR;
    const ORIGINAL_PROMPT_SYNC_REPOS = process.env.PROMPT_SYNC_REPOS;
    let tempRoot: string;

    beforeEach(async () => {
        vi.resetModules();
        tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'prompt-source-config-'));
        process.env.PROMPT_SOURCE_CONFIG_DIR = tempRoot;
        delete process.env.PROMPT_SYNC_REPOS;
    });

    afterEach(async () => {
        if (typeof ORIGINAL_PROMPT_SOURCE_CONFIG_DIR === 'string') {
            process.env.PROMPT_SOURCE_CONFIG_DIR = ORIGINAL_PROMPT_SOURCE_CONFIG_DIR;
        } else {
            delete process.env.PROMPT_SOURCE_CONFIG_DIR;
        }

        if (typeof ORIGINAL_PROMPT_SYNC_REPOS === 'string') {
            process.env.PROMPT_SYNC_REPOS = ORIGINAL_PROMPT_SYNC_REPOS;
        } else {
            delete process.env.PROMPT_SYNC_REPOS;
        }

        await fs.rm(tempRoot, { recursive: true, force: true });
    });

    it('loads enabled prompt sources from JSON files', async () => {
        await fs.writeFile(
            path.join(tempRoot, 'gpt-image-2.json'),
            JSON.stringify({
                id: 'yoomind-gpt-image-2',
                type: 'github-readme',
                owner: 'YouMind-OpenLab',
                repo: 'awesome-gpt-image-2',
                branch: 'main',
                file: 'README_zh.md',
                adapter: 'github-readme-yoomind',
                locale: 'zh-CN',
                defaultCategory: 'gpt-image-2',
                enabled: true,
            }),
            'utf-8'
        );

        await fs.writeFile(
            path.join(tempRoot, 'disabled.json'),
            JSON.stringify({
                id: 'disabled-source',
                type: 'github-readme',
                owner: 'Example',
                repo: 'disabled',
                defaultCategory: 'multimodal-prompts',
                enabled: false,
            }),
            'utf-8'
        );

        const { loadPromptSourceConfigs } = await import('@/lib/pipelines/prompt-sources/source-config');
        const sources = await loadPromptSourceConfigs();

        expect(sources).toHaveLength(1);
        expect(sources[0]).toMatchObject({
            id: 'yoomind-gpt-image-2',
            type: 'github-readme',
            adapter: 'github-readme-yoomind',
            defaultCategory: 'gpt-image-2',
        });
    });

    it('falls back to PROMPT_SYNC_REPOS when no source config files exist', async () => {
        process.env.PROMPT_SYNC_REPOS = JSON.stringify([
            {
                owner: 'YouMind-OpenLab',
                repo: 'awesome-seedance-2-prompts',
                branch: 'main',
                file: 'README_zh.md',
                rawUrlTemplate: 'https://example.invalid/{owner}/{repo}/{branch}/{file}',
                repoUrlTemplate: 'https://repos.example.invalid/{owner}/{repo}',
                category: 'seedance-2',
            },
        ]);

        const { loadPromptSourceConfigs } = await import('@/lib/pipelines/prompt-sources/source-config');
        const sources = await loadPromptSourceConfigs();

        expect(sources).toEqual([
            expect.objectContaining({
                id: 'legacy-YouMind-OpenLab-awesome-seedance-2-prompts-README-zh-md',
                type: 'github-readme',
                owner: 'YouMind-OpenLab',
                repo: 'awesome-seedance-2-prompts',
                branch: 'main',
                file: 'README_zh.md',
                rawUrlTemplate: 'https://example.invalid/{owner}/{repo}/{branch}/{file}',
                repoUrlTemplate: 'https://repos.example.invalid/{owner}/{repo}',
                defaultCategory: 'seedance-2',
                enabled: true,
            }),
        ]);
    });

    it('loads the bundled GPT Image 2 source when using the default config directory', async () => {
        delete process.env.PROMPT_SOURCE_CONFIG_DIR;
        delete process.env.PROMPT_SYNC_REPOS;
        vi.resetModules();

        const { loadPromptSourceConfigs } = await import('@/lib/pipelines/prompt-sources/source-config');
        const sources = await loadPromptSourceConfigs();

        expect(sources).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    id: 'yoomind-gpt-image-2',
                    adapter: 'github-readme-yoomind',
                    defaultCategory: 'gpt-image-2',
                    file: 'README_zh.md',
                }),
            ])
        );
    });
});
