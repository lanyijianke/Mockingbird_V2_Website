import { queryScalar } from '@/lib/db';
import { createEmptyReport, type PipelineReport } from './pipeline-shared';
import { logger } from '@/lib/utils/logger';

const PROMPT_SYNC_LOCK_NAME = 'prompt-source-sync';

async function withPromptSyncLock<T>(task: () => Promise<T>): Promise<T | null> {
    const acquired = await queryScalar<number>(
        'SELECT GET_LOCK(?, 0) AS Acquired',
        [PROMPT_SYNC_LOCK_NAME]
    );

    if (acquired !== 1) {
        logger.warn('PromptSyncJob', '检测到其他进程正在执行提示词同步，当前任务跳过');
        return null;
    }

    try {
        return await task();
    } finally {
        await queryScalar<number>(
            'SELECT RELEASE_LOCK(?) AS Released',
            [PROMPT_SYNC_LOCK_NAME]
        ).catch(() => {});
    }
}

// ════════════════════════════════════════════════════════════════
// GitHub README 提示词同步管线
// 从配置的 GitHub 仓库 README 解析提示词，按仓库映射分类入库
// 支持图片（<img src> / markdown）和视频（<a href="...mp4">）提取
// ════════════════════════════════════════════════════════════════

interface ParsedPrompt {
    rawTitle: string;
    content: string;
    description: string;
    author: string;
    images: string[];
    videos: string[];
    sourceUrl: string;
    originalSourceUrl?: string;
}

export function inferCloudflareVideoDownloadUrl(imageUrl: string): string | null {
    try {
        const parsed = new URL(imageUrl);
        if (!parsed.hostname.endsWith('cloudflarestream.com')) {
            return null;
        }

        const match = parsed.pathname.match(/^\/([a-f0-9]+)\/thumbnails\//i);
        if (!match) {
            return null;
        }

        return `https://${parsed.hostname}/${match[1]}/downloads/default.mp4`;
    } catch {
        return null;
    }
}

export async function syncAllAsync(): Promise<PipelineReport> {
    const lockedReport = await withPromptSyncLock(async () => {
        const { syncConfiguredPromptSources } = await import('./prompt-sources/remote-sync');
        return syncConfiguredPromptSources();
    });

    return lockedReport ?? createEmptyReport();
}

/**
 * 解析 README 中的提示词条目
 *
 * YouMind-OpenLab 仓库 README 结构（每个提示词）：
 *   ### No. X: 标题
 *   #### 📖 描述      ← 说明文字（存为 description）
 *   #### 📝 提示词     ← 纯 prompt 在 ``` 代码块里（存为 content）
 *   #### 🎬 视频      ← 视频链接 + 缩略图
 *   #### 📌 详情      ← 作者、来源等
 *
 * 核心提取规则：content 只取代码块内的纯文本，其余为元数据。
 */
export function parseReadmeToPrompts(readme: string, repoUrl: string): ParsedPrompt[] {
    const prompts: ParsedPrompt[] = [];
    // 按 ### 级标题切分（匹配 "### No. 1: ..." 等格式）
    const sections = readme.split(/^###\s+/m).filter(s => s.trim());

    for (const section of sections) {
        const lines = section.split('\n');
        const titleLine = lines[0]?.trim();
        if (!titleLine || titleLine.length < 3) continue;

        // 跳过非提示词的章节标题（目录、贡献、许可等）
        if (/^(📖|📊|🤝|📄|🙏|⭐|📚|🌐|🤔|🚀|🔥|🎬|📋|🐛)/.test(titleLine)) continue;

        const sectionContent = lines.slice(1).join('\n').trim();
        if (sectionContent.length < 10) continue;

        // ─── 提取纯 prompt 文本（只取 ``` 代码块内容） ───
        const codeBlocks: string[] = [];
        const codeBlockRegex = /```[^\n]*\n([\s\S]*?)```/g;
        let match;
        while ((match = codeBlockRegex.exec(sectionContent)) !== null) {
            const blockContent = match[1].trim();
            if (blockContent.length > 5) {
                codeBlocks.push(blockContent);
            }
        }

        // 如果没找到代码块，跳过（不是有效的提示词条目）
        if (codeBlocks.length === 0) continue;

        // 合并所有代码块为最终 prompt content
        const promptContent = codeBlocks.join('\n\n');

        // ─── 提取 📖 描述段落 ───────────────────────────
        let description = '';
        const descMatch = sectionContent.match(/####\s*📖\s*描述\s*\n([\s\S]*?)(?=####|$)/i);
        if (descMatch) {
            description = descMatch[1]
                .replace(/!\[.*?\]\(.*?\)/g, '')          // 移除图片
                .replace(/<img\s[^>]*>/gi, '')             // 移除 img 标签
                .replace(/!\[.*?\]\[.*?\]/g, '')           // badge 引用
                .replace(/\[.*?\]\(.*?\)/g, '')            // 移除链接
                .replace(/<[^>]+>/g, '')                    // 移除所有 HTML 标签
                .replace(/\n{2,}/g, '\n')                  // 压缩空行
                .trim()
                .slice(0, 300);
        }
        if (!description) {
            description = promptContent.slice(0, 200).replace(/\n/g, ' ');
        }

        // ─── 提取 📌 详情中的真实作者和来源 ─────────────────────
        let author = repoUrl.split('/')[3] || 'Unknown';
        const authorMatch = sectionContent.match(/\*\*作者:\*\*\s*\[(.+?)\]/);
        if (authorMatch) {
            author = authorMatch[1];
        }
        
        let originalSourceUrl: string | undefined;
        const sourceMatch = sectionContent.match(/\*\*来源:\*\*\s*\[.*?\]\((.*?)\)/);
        if (sourceMatch) {
            originalSourceUrl = sourceMatch[1];
        } else {
            console.log(`[PromptSync Regex Debug] 未匹配来源. Section fragment: ${sectionContent.substring(sectionContent.indexOf('详情'), sectionContent.indexOf('详情') + 150)}`);
        }

        // ─── 提取图片 URL ───────────────────────────────
        const images: string[] = [];
        // HTML <img src="..."> 格式（YouMind 仓库使用此格式展示缩略图）
        const htmlImgRegex = /<img\s[^>]*src=["'](.*?)["'][^>]*>/gi;
        while ((match = htmlImgRegex.exec(sectionContent)) !== null) {
            images.push(match[1]);
        }
        // 过滤掉 badge/shield 图片
        const filteredImages = images.filter(url =>
            !url.includes('shields.io') && !url.includes('badge')
        );

        // ─── 提取视频 URL ───────────────────────────────
        const videos: string[] = [];
        const videoLinkRegex = /<a\s[^>]*href=["'](.*?\.mp4)["'][^>]*>/gi;
        while ((match = videoLinkRegex.exec(sectionContent)) !== null) {
            videos.push(match[1]);
        }

        if (videos.length === 0) {
            const inferredVideoUrl = filteredImages
                .map((imageUrl) => inferCloudflareVideoDownloadUrl(imageUrl))
                .find((videoUrl): videoUrl is string => Boolean(videoUrl));

            if (inferredVideoUrl) {
                videos.push(inferredVideoUrl);
            }
        }

        // 清理 "No. X: " 前缀后的标题
        const cleanTitle = titleLine.replace(/^No\.\s*\d+:\s*/, '').trim();

        prompts.push({
            rawTitle: cleanTitle || titleLine,
            content: promptContent,
            description,
            author,
            images: filteredImages,
            videos,
            sourceUrl: `${repoUrl}#${encodeURIComponent(titleLine.toLowerCase().replace(/\s+/g, '-'))}`,
            originalSourceUrl
        });
    }

    return prompts;
}
