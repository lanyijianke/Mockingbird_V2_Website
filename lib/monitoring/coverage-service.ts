import { buildSourceIndexCoverage } from '../../scripts/agent-source-index-coverage.mjs';
import { createEmptyIndexStatus, type MonitoringIndexStatus } from '@/lib/monitoring/status-types';

interface SourceIndexCoverageReport {
    site?: string;
    activePrompts?: number;
    indexedPrompts?: number;
    promptGap?: number;
    publishedArticles?: number;
    indexedArticles?: number;
    articleGap?: number;
    totalChunks?: number;
    embeddedChunks?: number;
    promptIndexedWithEmbeddings?: number;
    articleIndexedWithEmbeddings?: number;
    semanticEnabled?: boolean;
    promptVectorDocuments?: number | null;
    articleVectorDocuments?: number | null;
    totalVectorPoints?: number | null;
    promptEmbeddingGap?: number | null;
    articleEmbeddingGap?: number | null;
}

function normalizeNumber(value: unknown): number | null {
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function normalizeCoverageSnapshot(input: SourceIndexCoverageReport, site: string = 'ai'): MonitoringIndexStatus {
    const semanticEnabled = input.semanticEnabled === true;

    return {
        site: input.site || site,
        available: true,
        prompts: {
            sourceTotal: normalizeNumber(input.activePrompts),
            indexed: normalizeNumber(input.indexedPrompts),
            pending: normalizeNumber(input.promptGap),
        },
        articles: {
            sourceTotal: normalizeNumber(input.publishedArticles),
            indexed: normalizeNumber(input.indexedArticles),
            pending: normalizeNumber(input.articleGap),
        },
        embeddings: {
            semanticEnabled,
            totalChunks: normalizeNumber(input.totalChunks),
            embeddedChunks: normalizeNumber(input.embeddedChunks),
            promptDocumentsWithEmbeddings: normalizeNumber(input.promptIndexedWithEmbeddings),
            articleDocumentsWithEmbeddings: normalizeNumber(input.articleIndexedWithEmbeddings),
            promptDocumentsPending: semanticEnabled ? normalizeNumber(input.promptEmbeddingGap) : null,
            articleDocumentsPending: semanticEnabled ? normalizeNumber(input.articleEmbeddingGap) : null,
        },
        vectors: {
            promptPoints: normalizeNumber(input.promptVectorDocuments),
            articlePoints: normalizeNumber(input.articleVectorDocuments),
            totalPoints: normalizeNumber(input.totalVectorPoints),
        },
    };
}

export async function loadCoverageSnapshot(site: string = 'ai'): Promise<MonitoringIndexStatus> {
    try {
        const report = await buildSourceIndexCoverage({ site }) as SourceIndexCoverageReport;
        return normalizeCoverageSnapshot(report, site);
    } catch {
        return createEmptyIndexStatus(site);
    }
}
