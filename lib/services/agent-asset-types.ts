export type AgentAssetKind = 'prompt' | 'article';
export type AgentMediaType = 'image' | 'video';
export type AgentMediaRole =
    | 'cover'
    | 'example'
    | 'input-reference'
    | 'output-preview'
    | 'video-preview'
    | 'thumbnail';

export interface AgentMediaAsset {
    type: AgentMediaType;
    role: AgentMediaRole;
    url: string;
    thumbnailUrl: string | null;
    alt: string | null;
    width: number | null;
    height: number | null;
    durationSeconds: number | null;
}

export interface AgentAssetQualitySignals {
    hasCover: boolean;
    hasVideo: boolean;
    hasExamples: boolean;
    copyCount: number | null;
    updatedAt: string | null;
}

export interface AgentAssetSummary {
    assetKind: AgentAssetKind;
    mediaTypes: AgentMediaType[];
    useCases: string[];
    outputFormats: string[];
    qualitySignals: AgentAssetQualitySignals;
}

export interface AgentPromptAsset extends AgentAssetSummary {
    assetKind: 'prompt';
    inputsRequired: string[];
    promptText: string;
    usageNotes: string[];
    media: AgentMediaAsset[];
}

export interface AgentArticleAsset extends AgentAssetSummary {
    assetKind: 'article';
    content: string;
    truncated: boolean;
    media: AgentMediaAsset[];
}
