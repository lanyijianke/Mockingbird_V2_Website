import fs from 'fs/promises';
import path from 'path';
import { resolvePath } from '@/lib/pipelines/pipeline-shared';
import { logger } from '@/lib/utils/logger';
import type { PromptSourceConfig } from './types';

const DEFAULT_PROMPT_SOURCE_CONFIG_DIR = './content-sources/prompts';

interface LegacyRepoConfig {
    owner: string;
    repo: string;
    branch?: string;
    file?: string;
    rawUrlTemplate?: string;
    repoUrlTemplate?: string;
    category: string;
}

function sanitizeSourceIdPart(value: string): string {
    return value.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '');
}

function normalizeSourceConfig(raw: PromptSourceConfig): PromptSourceConfig {
    return {
        ...raw,
        branch: raw.branch || 'main',
        file: raw.file || 'README.md',
        enabled: raw.enabled !== false,
    };
}

async function loadConfigFiles(configDir: string): Promise<PromptSourceConfig[]> {
    let entries;
    try {
        entries = await fs.readdir(configDir, { withFileTypes: true });
    } catch (err) {
        const code = (err as NodeJS.ErrnoException).code;
        if (code === 'ENOENT') return [];
        throw err;
    }

    const configs: PromptSourceConfig[] = [];

    for (const entry of entries) {
        if (!entry.isFile() || !entry.name.endsWith('.json')) continue;

        const filePath = path.join(configDir, entry.name);
        try {
            const raw = JSON.parse(await fs.readFile(filePath, 'utf-8')) as PromptSourceConfig;
            const source = normalizeSourceConfig(raw);
            if (source.enabled) configs.push(source);
        } catch (err) {
            logger.error('PromptSourceConfig', `读取源配置失败: ${filePath}`, err);
        }
    }

    return configs.sort((left, right) => left.id.localeCompare(right.id));
}

function loadLegacyPromptSyncRepos(): PromptSourceConfig[] {
    const raw = process.env.PROMPT_SYNC_REPOS || '';
    if (!raw) return [];

    try {
        const repos = JSON.parse(raw) as LegacyRepoConfig[];
        return repos.map((repo) => {
            const file = repo.file || 'README.md';
            return {
                id: `legacy-${sanitizeSourceIdPart(repo.owner)}-${sanitizeSourceIdPart(repo.repo)}-${sanitizeSourceIdPart(file)}`,
                type: 'github-readme',
                owner: repo.owner,
                repo: repo.repo,
                branch: repo.branch || 'main',
                file,
                rawUrlTemplate: repo.rawUrlTemplate,
                repoUrlTemplate: repo.repoUrlTemplate,
                defaultCategory: repo.category,
                enabled: true,
            };
        });
    } catch (err) {
        logger.error('PromptSourceConfig', 'PROMPT_SYNC_REPOS 解析失败', err);
        return [];
    }
}

export async function loadPromptSourceConfigs(): Promise<PromptSourceConfig[]> {
    const configDir = resolvePath(process.env.PROMPT_SOURCE_CONFIG_DIR, DEFAULT_PROMPT_SOURCE_CONFIG_DIR);
    const fileConfigs = await loadConfigFiles(configDir);
    if (fileConfigs.length > 0) return fileConfigs;
    return loadLegacyPromptSyncRepos();
}
