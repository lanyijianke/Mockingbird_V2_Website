// ════════════════════════════════════════════════════════════════
// TypeScript 类型定义 — 精确对应 C# DTOs
// ════════════════════════════════════════════════════════════════

export interface ArticleCategory {
    code: string;
    name: string;
}

export interface PromptRow {
    Id: number;
    Title: string;
    RawTitle: string | null;
    Description: string | null;
    Content: string | null;
    Category: string | null;
    Source: string | null;
    Author: string | null;
    SourceUrl: string | null;
    CoverImageUrl: string | null;
    VideoPreviewUrl: string | null;
    CardPreviewVideoUrl: string | null;
    ImagesJson: string | null;
    CopyCount: number;
    IsActive: number;
    CreatedAt: string | null;
    UpdatedAt: string | null;
}

// ── 文章状态枚举 (对应 ArticleStatus.cs) ──────────────────────
export enum ArticleStatus {
    Draft = 0,
    Published = 1,
    Archived = 2,
}

// ── 文章列表项 (对应 ArticleListItemDto.cs) ───────────────────
export interface ArticleListItem {
    id: string;
    site: string;
    title: string;
    slug: string;
    summary: string;
    category: string;  // 分类编码 (如 'engineering')
    categoryName: string;
    status: ArticleStatus;
    coverUrl?: string | null;
    createdAt: string; // ISO 8601
    updatedAt?: string | null;
    viewCount?: number | null;
}

// ── 文章详情 (对应 ArticleDetailDto.cs) ───────────────────────
export interface ArticleDetail extends ArticleListItem {
    content: string;
    renderedHtml?: string | null;
    author?: string | null;
    originalUrl?: string | null;
    sourcePlatform?: string | null;
    type?: string | null;
    // SEO 优化字段
    seoTitle?: string | null;
    seoDescription?: string | null;
    seoKeywords?: string | null;
}

// ── 提示词 (对应 PromptDto.cs) ───────────────────────────────
export interface Prompt {
    id: number;
    title: string;
    description?: string | null;
    content: string;
    category: string;  // 分类编码 (如 'gemini-3')
    coverImageUrl?: string | null;
    videoPreviewUrl?: string | null;
    cardPreviewVideoUrl?: string | null;
    author?: string | null;
    sourceUrl?: string | null;
    imagesJson?: string | null;
    copyCount: number;
    isActive: boolean;
    createdAt: string;
    updatedAt?: string | null;
}

// (Categories 已迁移至 config/categories.json 静态配置)

// ── GitHub Trending (对应 GitHubTrendingDto.cs) ───────────────
export interface GitHubTrending {
    id: number;
    rank: number;
    repoFullName: string;
    description: string;
    language?: string | null;
    starsCount: number;
    forksCount: number;
    todayStars: number;
    repoUrl?: string | null;
    sourcePlatform: string;
    updatedAt: string;
}

// ── ProductHunt 排行 (对应 ProductHuntRankingDto.cs) ──────────
export interface ProductHuntRanking {
    id: number;
    rank: number;
    title: string;
    tagline: string;
    votesCount: number;
    productUrl?: string | null;
    thumbnailUrl?: string | null;
    sourcePlatform: string;
    updatedAt: string;
}

// ── Skills.sh 排行 (对应 SkillsShRankingDto.cs) ──────────────
export interface SkillsShRanking {
    id: number;
    rank: number;
    skillName: string;
    description?: string | null;
    repoOwner?: string | null;
    repoName?: string | null;
    installCount?: string | null;
    skillUrl?: string | null;
    listType: string; // "trending" | "hot"
    updatedAt: string;
    /** 计算属性: owner/repo */
    repoFullName: string;
}

// ── 分页响应 ──────────────────────────────────────────────────
export interface PagedResult<T> {
    items: T[];
    totalCount: number;
    page: number;
    pageSize: number;
    totalPages: number;
}

// ── API 通用响应 ──────────────────────────────────────────────
export interface ApiResponse<T> {
    success: boolean;
    data?: T;
    error?: string;
}
