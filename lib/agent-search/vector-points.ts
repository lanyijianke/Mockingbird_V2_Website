import crypto from 'crypto';
import type { AgentContentType } from '@/lib/services/agent-search-types';
import type { AgentVectorPoint } from './vector-store';

const POINT_SCHEMA = 'agent-search-vector-v1';
const SAFE_ID_SEGMENT = /^[A-Za-z0-9._-]+$/;

export interface AgentVectorPointIdentity {
    contentType: AgentContentType;
    site: string;
    contentId: string;
    chunkIndex: number;
}

export interface AgentVectorChunkInput {
    index: number;
    text: string;
    hash: string;
}

export interface AgentVectorPointsInput {
    contentType: AgentContentType;
    site: string;
    contentId: string;
    title: string;
    category: string | null;
    publicUrl: string | null;
    chunks: AgentVectorChunkInput[];
    embeddings: number[][];
    metadata: Record<string, unknown>;
}

function assertSafeSegment(name: string, value: string): void {
    if (!value || !SAFE_ID_SEGMENT.test(value)) {
        throw new Error(`Vector point ${name} contains unsupported characters`);
    }
}

export function buildAgentVectorPointKey(identity: AgentVectorPointIdentity): string {
    assertSafeSegment('site', identity.site);
    assertSafeSegment('contentId', identity.contentId);
    if (!Number.isInteger(identity.chunkIndex) || identity.chunkIndex < 0) {
        throw new Error('Vector point chunkIndex must be a non-negative integer');
    }

    return `knowledge:${identity.contentType}:${identity.site}:${identity.contentId}:chunk:${identity.chunkIndex}`;
}

export function buildAgentVectorPointId(identity: AgentVectorPointIdentity): string {
    const pointKey = buildAgentVectorPointKey(identity);
    const bytes = crypto.createHash('sha1').update(pointKey).digest();

    // Qdrant string point IDs must be UUID-compatible; keep the business key in payload.pointKey.
    bytes[6] = (bytes[6]! & 0x0f) | 0x50;
    bytes[8] = (bytes[8]! & 0x3f) | 0x80;
    const hex = bytes.subarray(0, 16).toString('hex');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

export function buildAgentVectorPoints(input: AgentVectorPointsInput): AgentVectorPoint[] {
    if (input.chunks.length !== input.embeddings.length) {
        throw new Error('Vector point chunk count must match embedding count');
    }

    return input.chunks.map((chunk, index) => {
        const identity = {
            contentType: input.contentType,
            site: input.site,
            contentId: input.contentId,
            chunkIndex: chunk.index,
        };

        return {
            id: buildAgentVectorPointId(identity),
            vector: input.embeddings[index]!,
            payload: {
                pointSchema: POINT_SCHEMA,
                pointKey: buildAgentVectorPointKey(identity),
                contentType: input.contentType,
                site: input.site,
                contentId: input.contentId,
                chunkIndex: chunk.index,
                chunkHash: chunk.hash,
                title: input.title,
                category: input.category,
                publicUrl: input.publicUrl,
                text: chunk.text,
                ...input.metadata,
            },
        };
    });
}
