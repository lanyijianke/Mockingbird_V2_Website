import { indexAllArticles, indexPromptBacklogBatch } from '@/lib/services/agent-search-indexer';
import type { AgentIndexReportItem } from '@/lib/services/agent-search-types';

export interface AgentIndexJobOptions {
    promptBatchLimit?: number;
    maxPromptBatches?: number;
    site?: string;
}

export interface AgentIndexJobSectionReport {
    processed: number;
    indexed: number;
    skipped: number;
    failed: number;
}

export interface AgentPromptIndexJobReport extends AgentIndexJobSectionReport {
    batches: number;
    lastCursor: number | null;
    hasMore: boolean;
}

export interface AgentIndexJobReport {
    success: boolean;
    prompts: AgentPromptIndexJobReport;
    articles: AgentIndexJobSectionReport;
}

function countItems(items: AgentIndexReportItem[]): AgentIndexJobSectionReport {
    return {
        processed: items.length,
        indexed: items.filter((item) => item.status === 'indexed').length,
        skipped: items.filter((item) => item.status === 'skipped').length,
        failed: items.filter((item) => item.status === 'failed').length,
    };
}

export async function runAgentIndexJob(options: AgentIndexJobOptions = {}): Promise<AgentIndexJobReport> {
    const promptBatchLimit = Math.min(1000, Math.max(1, options.promptBatchLimit || 1000));
    const maxPromptBatches = Math.min(20, Math.max(1, options.maxPromptBatches || 2));
    const site = options.site || 'ai';
    const promptItems: AgentIndexReportItem[] = [];
    let batches = 0;
    let lastCursor: number | null = null;
    let hasMore = false;

    while (batches < maxPromptBatches) {
        const batch = await indexPromptBacklogBatch({ limit: promptBatchLimit });
        batches += 1;
        promptItems.push(...batch.items);
        lastCursor = batch.nextCursor;
        hasMore = batch.hasMore;

        if (!batch.hasMore) break;
    }

    const articles = await indexAllArticles({ site });
    const promptCounts = countItems(promptItems);
    const articleCounts = countItems(articles.items);

    return {
        success: promptCounts.failed === 0 && articleCounts.failed === 0,
        prompts: {
            ...promptCounts,
            batches,
            lastCursor,
            hasMore,
        },
        articles: articleCounts,
    };
}
