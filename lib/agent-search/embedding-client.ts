import { embed, embedMany } from 'ai';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import type { AgentSemanticEnabledConfig } from './semantic-config';

export interface EmbeddingProviderLike {
    embedText(text: string): Promise<number[]>;
    embedTexts?(texts: string[]): Promise<number[][]>;
}

export interface AgentEmbeddingClient {
    model: string;
    embedQuery(text: string): Promise<number[]>;
    embedChunks(texts: string[]): Promise<number[][]>;
}

function normalizeText(value: string): string {
    return value.replace(/\s+/g, ' ').trim();
}

export function createOpenAiCompatibleEmbeddingProvider(config: AgentSemanticEnabledConfig['embedding']): EmbeddingProviderLike {
    const provider = createOpenAICompatible({
        name: config.name,
        apiKey: config.apiKey,
        baseURL: config.baseURL,
    });
    const model = provider.textEmbeddingModel(config.model);

    return {
        async embedText(text: string): Promise<number[]> {
            const result = await embed({ model, value: text });
            return result.embedding;
        },
        async embedTexts(texts: string[]): Promise<number[][]> {
            const result = await embedMany({ model, values: texts });
            return result.embeddings;
        },
    };
}

export function createAgentEmbeddingClient(options: {
    provider: EmbeddingProviderLike;
    model: string;
}): AgentEmbeddingClient {
    return {
        model: options.model,
        async embedQuery(text: string): Promise<number[]> {
            const normalized = normalizeText(text);
            if (!normalized) throw new Error('Cannot embed empty text');
            return options.provider.embedText(normalized);
        },
        async embedChunks(texts: string[]): Promise<number[][]> {
            const normalized = texts.map(normalizeText).filter(Boolean);
            if (normalized.length === 0) return [];
            if (options.provider.embedTexts) return options.provider.embedTexts(normalized);
            return Promise.all(normalized.map((text) => options.provider.embedText(text)));
        },
    };
}
