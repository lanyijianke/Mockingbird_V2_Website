import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import {
    compressVideo, compressImage,
    downloadVideoWithAudio,
    isVideoFile, isCompressibleImage,
} from '@/lib/utils/media-processor';
import { resolvePath, ensureDir } from '@/lib/pipelines/pipeline-shared';
import { logger } from '@/lib/utils/logger';
import { validateOutboundUrl } from '@/lib/utils/url-security';
import { uploadPromptMediaToR2, type PromptMediaKind } from '@/lib/pipelines/r2-media-store';

// ════════════════════════════════════════════════════════════════
// 媒体管道编排层 — 移植自 KnowledgePipelineBase.cs
// 提供下载 + 自动后处理（视频压缩 / 图片 WebP 转换）
// ════════════════════════════════════════════════════════════════

/**
 * 获取媒体目录路径
 */
export function getMediaDir(): string {
    return resolvePath(
        process.env.CONTENT_PROMPTS_MEDIA_DIR,
        './data/prompts/media'
    );
}

/**
 * 下载外部媒体资源到本地，自动进行后处理（视频压缩 / 图片转 WebP）
 * 对应 KnowledgePipelineBase.DownloadMediaAsync
 *
 * @returns 本地相对路径（如 /content/prompts/media/xxx.webp），下载失败则返回原 URL
 */
export async function downloadMedia(
    originalUrl: string,
    mediaDir?: string,
    options?: { keepLocal?: boolean }
): Promise<string> {
    if (!originalUrl || !originalUrl.startsWith('http')) {
        return originalUrl;
    }

    const validation = await validateOutboundUrl(originalUrl);
    if (!validation.ok) {
        logger.warn('MediaPipeline', `拒绝不安全媒体 URL: ${originalUrl} (${validation.reason})`);
        return originalUrl;
    }

    const dir = mediaDir || getMediaDir();
    await ensureDir(dir);

    try {
        // 推断文件扩展名
        let extension = '';
        try {
            const urlPath = new URL(originalUrl).pathname;
            extension = path.extname(urlPath);
        } catch { /* ignore */ }

        if (!extension) {
            extension = originalUrl.includes('.mp4') ? '.mp4' : '.png';
        }

        const fileName = `${crypto.randomUUID().replace(/-/g, '')}${extension}`;
        const localPath = path.join(dir, fileName);
        const maxBytes = parseMaxDownloadBytes();

        console.log(`    [下载] 正在下载媒体资源: ${originalUrl}`);

        const response = await fetch(originalUrl, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
            signal: AbortSignal.timeout(30_000),
            redirect: 'follow',
        });

        if (!response.ok) {
            logger.warn('MediaPipeline', `下载失败: HTTP ${response.status} for URL ${originalUrl}`);
            return originalUrl;
        }

        if (response.url && response.url !== originalUrl) {
            const redirectedValidation = await validateOutboundUrl(response.url);
            if (!redirectedValidation.ok) {
                logger.warn('MediaPipeline', `下载失败: 重定向目标不安全 (${response.url}) for URL ${originalUrl}`);
                return originalUrl;
            }
        }

        const contentLength = Number.parseInt(response.headers.get('content-length') || '0', 10);
        if (contentLength > 0 && contentLength > maxBytes) {
            logger.warn('MediaPipeline', `下载失败: 文件过大 (${contentLength} > ${maxBytes}) URL ${originalUrl}`);
            return originalUrl;
        }

        const buffer = await readResponseBodyWithLimit(response, maxBytes);
        await fs.writeFile(localPath, buffer);
        console.log(`    [下载] 成功: /content/prompts/media/${fileName}`);

        // 后处理：媒体压缩
        const processedUrl = await postProcessMedia(localPath, fileName);
        if (options?.keepLocal) return processedUrl;
        return maybeUploadPromptMediaToR2(processedUrl, dir);
    } catch (err) {
        logger.warn('MediaPipeline', `下载媒体资源异常: ${err} (URL: ${originalUrl})`);
        return originalUrl; // 下载失败返回原始链接作为 fallback
    }
}

/**
 * 使用 yt-dlp 下载视频（自动合并音轨），适用于 Twitter/X 的推文链接
 * 下载成功后自动压缩
 * 对应 KnowledgePipelineBase.DownloadVideoViaYtDlpAsync
 */
export async function downloadVideoViaYtDlp(
    sourcePageUrl: string,
    mediaDir?: string,
    options?: { keepLocal?: boolean }
): Promise<string | null> {
    if (!sourcePageUrl) return null;

    const validation = await validateOutboundUrl(sourcePageUrl);
    if (!validation.ok) {
        logger.warn('MediaPipeline', `拒绝不安全视频 URL: ${sourcePageUrl} (${validation.reason})`);
        return null;
    }

    const dir = mediaDir || getMediaDir();
    await ensureDir(dir);

    console.log(`    [yt-dlp] 尝试从推文页面下载视频: ${sourcePageUrl}`);
    const localPath = await downloadVideoWithAudio(sourcePageUrl, dir);

    if (localPath) {
        // 压缩刚下载的视频
        const absolutePath = path.join(dir, path.basename(localPath));
        try {
            await fs.access(absolutePath);
            console.log('    [压缩] 对 yt-dlp 下载的视频进行压缩...');
            await compressVideo(absolutePath);
        } catch {
            // 文件不存在，跳过压缩
        }
        if (options?.keepLocal) return localPath;
        return maybeUploadPromptMediaToR2(localPath, dir, 'videos');
    }

    return null;
}

export function isLocalPromptMediaUrl(value: string): boolean {
    return value.startsWith('/content/prompts/media/');
}

export async function maybeUploadPromptMediaToR2(
    localUrl: string,
    mediaDir?: string,
    kind?: PromptMediaKind
): Promise<string> {
    if (process.env.PROMPT_MEDIA_STORAGE !== 'r2') return localUrl;
    if (!isLocalPromptMediaUrl(localUrl)) return localUrl;

    const fileName = path.basename(localUrl);
    const dir = mediaDir || getMediaDir();
    const absolutePath = path.join(dir, fileName);
    const mediaKind = kind || inferPromptMediaKind(absolutePath, fileName);

    try {
        const body = await fs.readFile(absolutePath);
        return await uploadPromptMediaToR2({
            kind: mediaKind,
            fileName,
            body,
            contentType: inferContentType(fileName),
        });
    } catch (err) {
        logger.warn('MediaPipeline', `R2 上传失败，回退本地媒体路径: ${localUrl} (${err})`);
        return localUrl;
    }
}

function inferPromptMediaKind(absolutePath: string, fileName: string): PromptMediaKind {
    if (/\.card\.mp4$/i.test(fileName)) return 'previews';
    if (isVideoFile(absolutePath)) return 'videos';
    return 'images';
}

function inferContentType(fileName: string): string {
    const extension = path.extname(fileName).toLowerCase();
    if (extension === '.webp') return 'image/webp';
    if (extension === '.jpg' || extension === '.jpeg') return 'image/jpeg';
    if (extension === '.png') return 'image/png';
    if (extension === '.gif') return 'image/gif';
    if (extension === '.mp4') return 'video/mp4';
    return 'application/octet-stream';
}

/**
 * 媒体后处理：根据文件类型自动压缩视频或转换图片
 * 对应 KnowledgePipelineBase.PostProcessMediaAsync
 */
async function postProcessMedia(localPath: string, fileName: string): Promise<string> {
    if (isVideoFile(localPath)) {
        console.log(`    [压缩] 正在压缩视频: ${fileName}`);
        await compressVideo(localPath);
        return `/content/prompts/media/${fileName}`;
    }

    if (isCompressibleImage(localPath)) {
        console.log(`    [压缩] 正在转换图片为 WebP: ${fileName}`);
        const success = await compressImage(localPath);
        if (success) {
            // 图片被转为 .webp，更新文件名
            const webpFileName = fileName.replace(/\.[^.]+$/, '.webp');
            return `/content/prompts/media/${webpFileName}`;
        }
        return `/content/prompts/media/${fileName}`;
    }

    return `/content/prompts/media/${fileName}`;
}

function parseMaxDownloadBytes(): number {
    const raw = Number.parseInt(process.env.MEDIA_DOWNLOAD_MAX_BYTES || '', 10);
    if (Number.isFinite(raw) && raw > 0) return raw;
    return 50 * 1024 * 1024; // 50MB
}

async function readResponseBodyWithLimit(response: Response, maxBytes: number): Promise<Buffer> {
    const body = response.body;
    if (!body) return Buffer.alloc(0);

    const reader = body.getReader();
    const chunks: Buffer[] = [];
    let totalBytes = 0;

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!value) continue;

        totalBytes += value.byteLength;
        if (totalBytes > maxBytes) {
            await reader.cancel('payload too large');
            throw new Error(`Response body exceeds max size (${maxBytes})`);
        }

        chunks.push(Buffer.from(value));
    }

    return Buffer.concat(chunks);
}
