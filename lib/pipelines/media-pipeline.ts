import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import crypto from 'crypto';
import {
    compressVideo,
    compressImage,
    downloadVideoWithAudio,
    isVideoFile,
    isCompressibleImage,
} from '@/lib/utils/media-processor';
import { logger } from '@/lib/utils/logger';
import { validateOutboundUrl } from '@/lib/utils/url-security';
import { uploadPromptMediaToR2, type PromptMediaKind } from '@/lib/pipelines/r2-media-store';

// ════════════════════════════════════════════════════════════════
// 媒体管道编排层 — 临时文件 only
// 下载、后处理、R2 上传都在临时工作区内完成
// ════════════════════════════════════════════════════════════════

const TEMP_MEDIA_PREFIX = 'prompt-media-';

export async function withPromptMediaWorkspace<T>(
    task: (workspaceDir: string) => Promise<T>
): Promise<T> {
    const workspaceDir = await fs.mkdtemp(path.join(os.tmpdir(), TEMP_MEDIA_PREFIX));

    try {
        return await task(workspaceDir);
    } finally {
        await fs.rm(workspaceDir, { recursive: true, force: true });
    }
}

/**
 * 下载外部媒体资源到指定临时目录，自动进行后处理（视频压缩 / 图片转 WebP）
 * 失败时返回 null，不保留本地 fallback。
 */
export async function downloadMedia(
    originalUrl: string,
    mediaDir: string
): Promise<string | null> {
    if (!originalUrl || !originalUrl.startsWith('http')) {
        return null;
    }

    const validation = await validateOutboundUrl(originalUrl);
    if (!validation.ok) {
        logger.warn('MediaPipeline', `拒绝不安全媒体 URL: ${originalUrl} (${validation.reason})`);
        return null;
    }

    await fs.mkdir(mediaDir, { recursive: true });

    try {
        let extension = '';
        try {
            const urlPath = new URL(originalUrl).pathname;
            extension = path.extname(urlPath);
        } catch {
            // ignore
        }

        if (!extension) {
            extension = originalUrl.includes('.mp4') ? '.mp4' : '.png';
        }

        const fileName = `${crypto.randomUUID().replace(/-/g, '')}${extension}`;
        const localPath = path.join(mediaDir, fileName);
        const maxBytes = parseMaxDownloadBytes();

        console.log(`    [下载] 正在下载媒体资源: ${originalUrl}`);

        const response = await fetch(originalUrl, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
            signal: AbortSignal.timeout(30_000),
            redirect: 'follow',
        });

        if (!response.ok) {
            logger.warn('MediaPipeline', `下载失败: HTTP ${response.status} for URL ${originalUrl}`);
            return null;
        }

        if (response.url && response.url !== originalUrl) {
            const redirectedValidation = await validateOutboundUrl(response.url);
            if (!redirectedValidation.ok) {
                logger.warn('MediaPipeline', `下载失败: 重定向目标不安全 (${response.url}) for URL ${originalUrl}`);
                return null;
            }
        }

        const contentLength = Number.parseInt(response.headers.get('content-length') || '0', 10);
        if (contentLength > 0 && contentLength > maxBytes) {
            logger.warn('MediaPipeline', `下载失败: 文件过大 (${contentLength} > ${maxBytes}) URL ${originalUrl}`);
            return null;
        }

        const buffer = await readResponseBodyWithLimit(response, maxBytes);
        await fs.writeFile(localPath, buffer);
        console.log(`    [下载] 成功: ${localPath}`);

        return await postProcessMedia(localPath);
    } catch (err) {
        logger.warn('MediaPipeline', `下载媒体资源异常: ${err} (URL: ${originalUrl})`);
        return null;
    }
}

/**
 * 使用 yt-dlp 下载视频（自动合并音轨），适用于 Twitter/X 的推文链接
 * 下载成功后自动压缩，并返回临时目录中的绝对路径。
 */
export async function downloadVideoViaYtDlp(
    sourcePageUrl: string,
    mediaDir: string
): Promise<string | null> {
    if (!sourcePageUrl) return null;

    const validation = await validateOutboundUrl(sourcePageUrl);
    if (!validation.ok) {
        logger.warn('MediaPipeline', `拒绝不安全视频 URL: ${sourcePageUrl} (${validation.reason})`);
        return null;
    }

    await fs.mkdir(mediaDir, { recursive: true });

    console.log(`    [yt-dlp] 尝试从推文页面下载视频: ${sourcePageUrl}`);
    const localPath = await downloadVideoWithAudio(sourcePageUrl, mediaDir);

    if (!localPath) return null;

    const absolutePath = path.isAbsolute(localPath) ? localPath : path.join(mediaDir, path.basename(localPath));
    try {
        await fs.access(absolutePath);
        console.log('    [压缩] 对 yt-dlp 下载的视频进行压缩...');
        await compressVideo(absolutePath);
        return absolutePath;
    } catch (err) {
        logger.warn('MediaPipeline', `yt-dlp 产物不存在或不可用: ${absolutePath} (${err})`);
        return null;
    }
}

export async function uploadPromptMediaFileToR2(
    filePath: string,
    kind?: PromptMediaKind
): Promise<string | null> {
    try {
        const fileName = path.basename(filePath);
        const mediaKind = kind || inferPromptMediaKind(filePath, fileName);
        const body = await fs.readFile(filePath);

        return await uploadPromptMediaToR2({
            kind: mediaKind,
            fileName,
            body,
            contentType: inferContentType(fileName),
        });
    } catch (err) {
        logger.warn('MediaPipeline', `R2 上传失败: ${filePath} (${err})`);
        return null;
    }
}

// 现行管线不再依赖本地持久目录，但底层下载器仍返回本地文件路径。
async function postProcessMedia(localPath: string): Promise<string> {
    if (isVideoFile(localPath)) {
        console.log(`    [压缩] 正在压缩视频: ${path.basename(localPath)}`);
        await compressVideo(localPath);
        return localPath;
    }

    if (isCompressibleImage(localPath)) {
        console.log(`    [压缩] 正在转换图片为 WebP: ${path.basename(localPath)}`);
        const success = await compressImage(localPath);
        if (success) {
            return localPath.replace(/\.[^.]+$/, '.webp');
        }
    }

    return localPath;
}

function inferPromptMediaKind(filePath: string, fileName: string): PromptMediaKind {
    if (/\.card\.mp4$/i.test(fileName)) return 'previews';
    if (isVideoFile(filePath)) return 'videos';
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

function parseMaxDownloadBytes(): number {
    const raw = Number.parseInt(process.env.MEDIA_DOWNLOAD_MAX_BYTES || '', 10);
    if (Number.isFinite(raw) && raw > 0) return raw;
    return 50 * 1024 * 1024;
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
