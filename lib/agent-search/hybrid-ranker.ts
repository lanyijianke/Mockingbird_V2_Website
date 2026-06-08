import type { AgentContentType, AgentSearchResultItem } from '@/lib/services/agent-search-types';

export interface SemanticCandidate {
    contentType: AgentContentType;
    site: string;
    contentId: string;
    semanticScore: number;
}

export type HybridSearchResultItem = AgentSearchResultItem & {
    retrievalMode: 'keyword' | 'semantic' | 'hybrid';
    semanticScore: number;
    keywordScore: number;
};

export function hybridResultKey(type: string, site: string, id: string): string {
    return `${type}:${site}:${id}`;
}

function qualityBoost(item: AgentSearchResultItem): number {
    let boost = 0;
    if (item.qualitySignals.hasExamples) boost += 0.05;
    if (item.qualitySignals.hasCover) boost += 0.03;
    if (item.qualitySignals.hasVideo) boost += 0.03;
    if (typeof item.qualitySignals.copyCount === 'number') {
        boost += Math.min(0.05, item.qualitySignals.copyCount / 100000);
    }
    return boost;
}

function roundedScore(value: number): number {
    return Number(value.toFixed(4));
}

export function mergeHybridResults(input: {
    query: string;
    semantic: SemanticCandidate[];
    keyword: AgentSearchResultItem[];
    semanticDetails: Map<string, AgentSearchResultItem>;
    limit: number;
}): HybridSearchResultItem[] {
    const merged = new Map<string, HybridSearchResultItem>();

    for (const item of input.keyword) {
        merged.set(hybridResultKey(item.type, item.site, item.id), {
            ...item,
            retrievalMode: 'keyword',
            semanticScore: 0,
            keywordScore: item.score,
            score: roundedScore(item.score + qualityBoost(item)),
        });
    }

    for (const candidate of input.semantic) {
        const id = hybridResultKey(candidate.contentType, candidate.site, candidate.contentId);
        const existing = merged.get(id);
        const detail = existing || input.semanticDetails.get(id);
        if (!detail) continue;

        const keywordScore = existing?.keywordScore || 0;
        const score = (candidate.semanticScore * 0.7) + (keywordScore * 0.25) + qualityBoost(detail);
        merged.set(id, {
            ...detail,
            retrievalMode: keywordScore > 0 ? 'hybrid' : 'semantic',
            semanticScore: candidate.semanticScore,
            keywordScore,
            score: roundedScore(score),
        });
    }

    return [...merged.values()]
        .sort((left, right) => right.score - left.score)
        .slice(0, Math.max(0, input.limit));
}
