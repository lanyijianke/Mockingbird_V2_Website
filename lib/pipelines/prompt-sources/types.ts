export type PromptSourceType = 'github-readme' | 'json-api' | 'manual';

export interface PromptSourceConfig {
    id: string;
    type: PromptSourceType;
    url?: string;
    rawUrlTemplate?: string;
    repoUrlTemplate?: string;
    owner?: string;
    repo?: string;
    branch?: string;
    file?: string;
    adapter?: string;
    locale?: string;
    defaultCategory: string;
    enabled: boolean;
    metadata?: Record<string, unknown>;
}

export interface PromptImportRecord {
    externalId: string;
    title: string;
    rawTitle?: string;
    description?: string;
    content: string;
    category: string;
    tags?: string[];
    author?: string;
    sourceUrl?: string;
    sourcePublishedAt?: string;
    mediaUrls?: string[];
    videoUrls?: string[];
    flags?: string[];
    metadata?: Record<string, unknown>;
}

export interface PromptSourceAdapter {
    id: string;
    canHandle(source: PromptSourceConfig): boolean;
    fetchSource(source: PromptSourceConfig): Promise<string | Buffer>;
    parse(input: string | Buffer, source: PromptSourceConfig): Promise<PromptImportRecord[]>;
}
