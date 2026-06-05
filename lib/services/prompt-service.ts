import { query, queryOne, queryScalar, execute } from '@/lib/db';
import { Prompt, PromptRow, PagedResult } from '@/lib/types';
import { getCategoryName } from '@/lib/categories';

// ════════════════════════════════════════════════════════════════
// 提示词服务 — 对应 PromptService.cs + PromptRepository.cs
// 分类已从 DB Categories 表迁移至静态配置文件
// ════════════════════════════════════════════════════════════════

// ── 行 → DTO ─────────────────────────────────────────────────
function rowToPrompt(row: PromptRow): Prompt {
    return {
        id: row.Id,
        title: row.Title,
        description: row.Description || null,
        content: row.Content || '',
        category: row.Category || 'multimodal-prompts',
        coverImageUrl: row.CoverImageUrl || null,
        videoPreviewUrl: row.VideoPreviewUrl || null,
        cardPreviewVideoUrl: row.CardPreviewVideoUrl || null,
        author: row.Author || null,
        sourceUrl: row.SourceUrl || null,
        imagesJson: row.ImagesJson || null,
        copyCount: row.CopyCount || 0,
        isActive: Boolean(row.IsActive),
        createdAt: row.CreatedAt ? new Date(row.CreatedAt).toISOString() : '',
        updatedAt: row.UpdatedAt ? new Date(row.UpdatedAt).toISOString() : null,
    };
}

interface PromptSitemapRow {
    Id: number;
    LastModified: string | null;
}

// ════════════════════════════════════════════════════════════════
// 公开 API
// ════════════════════════════════════════════════════════════════

/** 获取 Top N 提示词 */
export async function getTopPrompts(count: number = 6): Promise<Prompt[]> {
    const rows = await query<PromptRow>(
        'SELECT * FROM Prompts WHERE IsActive = 1 ORDER BY CreatedAt DESC LIMIT ?',
        [count]
    );
    return rows.map(r => rowToPrompt(r));
}

/** 分页查询提示词 */
export async function getPagedPrompts(
    page: number = 1,
    pageSize: number = 12,
    category?: string,
    searchQuery?: string
): Promise<PagedResult<Prompt>> {
    const offset = (page - 1) * pageSize;
    const conditions: string[] = ['IsActive = 1'];
    const params: (string | number)[] = [];

    if (category) {
        conditions.push('Category = ?');
        params.push(category);
    }

    if (searchQuery) {
        conditions.push('(Title LIKE ? OR Description LIKE ?)');
        const pattern = `%${searchQuery}%`;
        params.push(pattern, pattern);
    }

    const whereClause = conditions.join(' AND ');

    const totalCount = await queryScalar<number>(
        `SELECT COUNT(*) FROM Prompts WHERE ${whereClause}`,
        params
    ) ?? 0;

    const rows = await query<PromptRow>(
        `SELECT Id, Title, RawTitle, Description, Category, Source, CoverImageUrl, VideoPreviewUrl, CardPreviewVideoUrl, Author, SourceUrl, CopyCount, IsActive, CreatedAt, UpdatedAt
     FROM Prompts 
     WHERE ${whereClause}
     ORDER BY CreatedAt DESC
     LIMIT ?, ?`,
        [...params, offset, pageSize]
    );

    const items = rows.map(r => rowToPrompt(r));

    return {
        items,
        totalCount,
        page,
        pageSize,
        totalPages: Math.ceil(totalCount / pageSize),
    };
}

/** 根据 ID 获取提示词详情 */
export async function getPromptById(id: number): Promise<Prompt | null> {
    const row = await queryOne<PromptRow>(
        'SELECT * FROM Prompts WHERE Id = ?',
        [id]
    );
    return row ? rowToPrompt(row) : null;
}

/** 获取同分类推荐提示词（排除指定 ID） */
export async function getRelatedPrompts(
    category: string,
    excludeId: number,
    limit: number = 6
): Promise<Prompt[]> {
    const rows = await query<PromptRow>(
        'SELECT * FROM Prompts WHERE IsActive = 1 AND Category = ? AND Id != ? ORDER BY CreatedAt DESC LIMIT ?',
        [category, excludeId, limit]
    );
    return rows.map(r => rowToPrompt(r));
}

/** 复制次数追踪 */
export async function trackCopy(id: number): Promise<boolean> {
    const result = await execute(
        'UPDATE Prompts SET CopyCount = CopyCount + 1 WHERE Id = ?',
        [id]
    );
    return result.affectedRows > 0;
}

/** 获取所有提示词 ID (用于 SSG) */
export async function getAllPromptIds(): Promise<number[]> {
    const rows = await query<PromptRow>(
        'SELECT Id FROM Prompts WHERE IsActive = 1 ORDER BY CreatedAt DESC'
    );
    return rows.map(r => r.Id);
}

export interface PromptSitemapEntry {
    id: number;
    lastModified: string | null;
}

/** 获取 sitemap 所需的提示词 URL 与真实更新时间 */
export async function getPromptSitemapEntries(): Promise<PromptSitemapEntry[]> {
    const rows = await query<PromptSitemapRow>(
        `SELECT Id, COALESCE(UpdatedAt, CreatedAt) AS LastModified
         FROM Prompts
         WHERE IsActive = 1
         ORDER BY CreatedAt DESC`
    );
    return rows.map((row) => ({
        id: row.Id,
        lastModified: row.LastModified,
    }));
}

// 导出 getCategoryName 以便页面使用
export { getCategoryName };
