import path from 'path';
import type { ArticleSourceConfig, LocalArticleSourceConfig, R2ArticleSourceConfig } from './source-types';

function isNonEmptyString(value: unknown): value is string {
    return typeof value === 'string' && value.trim().length > 0;
}

function parseConfigArray(rawConfig: string | undefined, envName: string): unknown[] {
    if (!rawConfig?.trim()) return [];

    let parsed: unknown;
    try {
        parsed = JSON.parse(rawConfig);
    } catch (error) {
        throw new Error(`Failed to parse ${envName}: ${error}`);
    }

    if (!Array.isArray(parsed)) {
        throw new Error(`${envName} must be a JSON array`);
    }

    return parsed;
}

function normalizeLocalConfig(value: unknown, index: number): LocalArticleSourceConfig {
    if (!value || typeof value !== 'object') {
        throw new Error(`Invalid article source config at index ${index}`);
    }

    const candidate = value as Record<string, unknown>;

    if (!isNonEmptyString(candidate.site)) {
        throw new Error(`Article source ${index} is missing a valid site`);
    }

    if (!isNonEmptyString(candidate.source)) {
        throw new Error(`Article source ${index} is missing a valid source`);
    }

    if (!isNonEmptyString(candidate.rootPath)) {
        throw new Error(`Article source ${index} is missing a valid rootPath`);
    }

    if (!isNonEmptyString(candidate.manifestPath)) {
        throw new Error(`Article source ${index} is missing a valid manifestPath`);
    }

    const rawRootPath = candidate.rootPath.trim();

    return {
        type: 'local',
        site: candidate.site.trim(),
        source: candidate.source.trim(),
        rootPath: path.isAbsolute(rawRootPath)
            ? rawRootPath
            : path.resolve(process.cwd(), rawRootPath),
        manifestPath: candidate.manifestPath.trim(),
    };
}

function normalizeR2Config(value: unknown, index: number): R2ArticleSourceConfig {
    if (!value || typeof value !== 'object') {
        throw new Error(`Invalid R2 article source config at index ${index}`);
    }

    const candidate = value as Record<string, unknown>;

    if (!isNonEmptyString(candidate.site)) {
        throw new Error(`R2 article source ${index} is missing a valid site`);
    }

    if (!isNonEmptyString(candidate.source)) {
        throw new Error(`R2 article source ${index} is missing a valid source`);
    }

    if (!isNonEmptyString(candidate.bucket)) {
        throw new Error(`R2 article source ${index} is missing a valid bucket`);
    }

    if (!isNonEmptyString(candidate.manifestPath)) {
        throw new Error(`R2 article source ${index} is missing a valid manifestPath`);
    }

    if (!isNonEmptyString(candidate.publicBaseUrl)) {
        throw new Error(`R2 article source ${index} is missing a valid publicBaseUrl`);
    }

    const rawPrefix = typeof candidate.prefix === 'string' ? candidate.prefix : '';

    return {
        type: 'r2',
        site: candidate.site.trim(),
        source: candidate.source.trim(),
        bucket: candidate.bucket.trim(),
        prefix: rawPrefix.trim().replace(/^\/+|\/+$/g, ''),
        manifestPath: candidate.manifestPath.trim().replace(/^\/+/, ''),
        publicBaseUrl: candidate.publicBaseUrl.trim().replace(/\/+$/g, ''),
    };
}

export function loadArticleSourceConfigs(
    rawLocalConfig: string | undefined = process.env.ARTICLE_LOCAL_SOURCES,
    rawR2Config: string | undefined = process.env.KNOWLEDGE_ARTICLE_R2_SOURCES,
): ArticleSourceConfig[] {
    const localConfigs = parseConfigArray(rawLocalConfig, 'ARTICLE_LOCAL_SOURCES')
        .map((entry, index) => normalizeLocalConfig(entry, index));
    const r2Configs = parseConfigArray(rawR2Config, 'KNOWLEDGE_ARTICLE_R2_SOURCES')
        .map((entry, index) => normalizeR2Config(entry, index));
    const configs = [...localConfigs, ...r2Configs];
    const seenPairs = new Set<string>();

    for (const config of configs) {
        const key = `${config.site}::${config.source}`;
        if (seenPairs.has(key)) {
            throw new Error(`Duplicate article source detected for ${key}`);
        }
        seenPairs.add(key);
    }

    return configs;
}
