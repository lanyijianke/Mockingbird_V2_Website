import type { AgentSemanticEnabledConfig } from './semantic-config';

type FetchLike = (url: string, init: RequestInit) => Promise<{
    ok: boolean;
    status?: number;
    statusText?: string;
    json(): Promise<unknown>;
}>;

export interface AgentRerankResult {
    document: string;
    index: number;
    score: number;
}

interface RerankApiResponse {
    results?: Array<{
        index: number;
        relevance_score?: number;
        score?: number;
    }>;
}

export interface AgentRerankClient {
    model: string;
    rerank(query: string, documents: string[]): Promise<AgentRerankResult[]>;
}

export function createAgentRerankClient(options: {
    config: Extract<AgentSemanticEnabledConfig['rerank'], { enabled: true }>;
    fetch?: FetchLike;
}): AgentRerankClient {
    const fetcher = options.fetch ?? fetch;

    return {
        model: options.config.model,
        async rerank(query: string, documents: string[]): Promise<AgentRerankResult[]> {
            if (documents.length === 0) return [];
            try {
                const response = await fetcher(options.config.endpoint, {
                    method: 'POST',
                    headers: {
                        Authorization: `Bearer ${options.config.apiKey}`,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        model: options.config.model,
                        query,
                        documents,
                        top_n: options.config.topN,
                    }),
                });

                if (!response.ok) {
                    throw new Error(`Rerank request failed: ${response.status ?? 'unknown'} ${response.statusText ?? ''}`.trim());
                }

                const body = await response.json() as RerankApiResponse;
                return (body.results ?? []).map((result) => ({
                    document: documents[result.index] ?? '',
                    index: result.index,
                    score: result.relevance_score ?? result.score ?? 0,
                }));
            } catch {
                return documents.map((document, index) => ({ document, index, score: 0 }));
            }
        },
    };
}
