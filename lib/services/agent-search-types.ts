export type AgentContentType = 'prompt' | 'article';
export type AgentSearchType = AgentContentType | 'all';

export interface AgentSearchDocumentRow {
    Id: number;
    ContentType: AgentContentType;
    ContentId: string;
    Site: string;
    Title: string;
    Summary: string | null;
    Category: string | null;
    PublicUrl: string | null;
    CoverUrl: string | null;
    SearchableText: string | null;
    MetadataJson: string | null;
    SourceUpdatedAt: string | null;
    ContentHash: string | null;
    IndexedAt: string | null;
}

export interface AgentSearchChunkRow {
    Id: number;
    DocumentId: number;
    ChunkIndex: number;
    ChunkText: string;
    ChunkHash: string;
    EmbeddingJson: string | null;
    EmbeddingModel: string | null;
    EmbeddedAt: string | null;
}

export interface AgentSearchResultItem {
    type: AgentContentType;
    id: string;
    site: string;
    title: string;
    summary: string | null;
    category: string | null;
    url: string | null;
    coverUrl: string | null;
    score: number;
    matchedText: string | null;
    updatedAt: string | null;
}

export interface AgentSearchResponse {
    query: string;
    items: AgentSearchResultItem[];
}

export type AgentIndexRequest =
    | { type: 'prompt'; id: number }
    | { type: 'article'; site?: string; slug: string }
    | { type: 'all'; site?: string };

export interface AgentIndexReportItem {
    type: AgentContentType;
    id: string;
    status: 'indexed' | 'skipped' | 'failed';
    reason?: string;
}

export interface AgentIndexReport {
    success: boolean;
    items: AgentIndexReportItem[];
}
