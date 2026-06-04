import { spawn } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { logger } from '@/lib/utils/logger';

// ════════════════════════════════════════════════════════════════
// 媒体处理器 — 1:1 移植自 VideoProcessor.cs
// 通过 child_process 调用 ffmpeg / yt-dlp CLI
// ════════════════════════════════════════════════════════════════

let ytDlpBinaryAvailable: boolean | null = null;
let ytDlpMissingWarned = false;

function isMissingBinaryError(error: string): boolean {
    return /\bENOENT\b/i.test(error);
}

/**
 * 通用子进程执行器
 */
export async function runProcess(
    command: string,
    args: string[],
    timeoutSeconds: number = 60
): Promise<{ success: boolean; error: string }> {
    return new Promise((resolve) => {
        const proc = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });

        let stderr = '';
        proc.stderr.on('data', (chunk: Buffer) => {
            stderr += chunk.toString();
        });

        const timer = setTimeout(() => {
            proc.kill('SIGKILL');
            resolve({ success: false, error: `Process timed out after ${timeoutSeconds}s` });
        }, timeoutSeconds * 1000);

        proc.on('error', (err) => {
            clearTimeout(timer);
            resolve({ success: false, error: err.message });
        });

        proc.on('close', (code) => {
            clearTimeout(timer);
            if (code === 0) {
                resolve({ success: true, error: '' });
            } else {
                resolve({ success: false, error: `Exit code ${code}: ${stderr.slice(0, 500)}` });
            }
        });
    });
}

/**
 * 压缩视频：720p / H.264 800Kbps / AAC 128Kbps
 * 覆盖原文件（仅压缩后更小时才替换）
 * 对应 VideoProcessor.CompressVideoAsync
 */
export async function compressVideo(videoPath: string): Promise<boolean> {
    try {
        await fs.access(videoPath);
    } catch {
        console.warn('[压缩] 视频文件不存在:', videoPath);
        return false;
    }

    try {
        const originalStat = await fs.stat(videoPath);
        const originalSize = originalStat.size;
        const tempPath = videoPath + '.tmp.mp4';

        // ffmpeg: 缩放到 720p（保持宽高比），H.264 800Kbps，AAC 128Kbps
        // -y: 覆盖输出
        // -movflags +faststart: 让视频可以边下载边播放
        const args = [
            '-y', '-i', videoPath,
            '-vf', 'scale=-2:720',
            '-c:v', 'libx264', '-preset', 'fast', '-b:v', '800k',
            '-c:a', 'aac', '-b:a', '128k',
            '-movflags', '+faststart',
            tempPath,
        ];

        console.log('[压缩] 开始压缩视频:', videoPath);
        const result = await runProcess('ffmpeg', args, 120);

        if (result.success) {
            try {
                const compressedStat = await fs.stat(tempPath);
                const compressedSize = compressedStat.size;

                // 只有压缩后更小才替换
                if (compressedSize < originalSize) {
                    await fs.unlink(videoPath);
                    await fs.rename(tempPath, videoPath);
                    const savedPct = ((1 - compressedSize / originalSize) * 100).toFixed(0);
                    console.log(
                        `[压缩] 视频压缩完成: ${(originalSize / 1024 / 1024).toFixed(1)}MB → ${(compressedSize / 1024 / 1024).toFixed(1)}MB (节省 ${savedPct}%)`
                    );
                    return true;
                } else {
                    // 压缩后反而更大，保留原文件
                    await fs.unlink(tempPath);
                    console.log('[压缩] 视频已足够小，跳过压缩:', videoPath);
                    return true;
                }
            } catch {
                await safeUnlink(tempPath);
                return false;
            }
        } else {
            logger.warn('MediaProcessor', `视频压缩失败: ${result.error}`);
            await safeUnlink(tempPath);
            return false;
        }
    } catch (err) {
        logger.error('MediaProcessor', `视频压缩异常: ${videoPath}`, err);
        return false;
    }
}

/**
 * 生成卡片悬停预览视频：短时长 / 低分辨率 / 静音
 * 保留原始详情视频，额外产出一个更轻的列表预览资源。
 */
export async function createCardPreviewVideo(
    videoPath: string,
    durationSeconds: number = 4
): Promise<string | null> {
    try {
        await fs.access(videoPath);
    } catch {
        console.warn('[预览] 视频文件不存在:', videoPath);
        return null;
    }

    try {
        const parsed = path.parse(videoPath);
        const previewFileName = `${parsed.name}.card.mp4`;
        const previewPath = path.join(parsed.dir, previewFileName);

        const args = [
            '-y',
            '-ss', '0',
            '-i', videoPath,
            '-t', String(durationSeconds),
            '-an',
            '-vf', 'scale=-2:360',
            '-c:v', 'libx264',
            '-preset', 'fast',
            '-b:v', '240k',
            '-movflags', '+faststart',
            previewPath,
        ];

        const result = await runProcess('ffmpeg', args, 60);
        if (!result.success) {
            logger.warn('MediaProcessor', `卡片预览视频生成失败: ${result.error}`);
            await safeUnlink(previewPath);
            return null;
        }

        await fs.access(previewPath);
        return previewFileName;
    } catch (err) {
        logger.error('MediaProcessor', `卡片预览视频生成异常: ${videoPath}`, err);
        return null;
    }
}

/**
 * 将图片转换为 WebP 格式（质量 80，最大宽度 1200px）
 * 覆盖原文件（扩展名改为 .webp）
 * 对应 VideoProcessor.CompressImageAsync
 */
export async function compressImage(imagePath: string): Promise<boolean> {
    try {
        await fs.access(imagePath);
    } catch {
        console.warn('[压缩] 图片文件不存在:', imagePath);
        return false;
    }

    // 已经是 WebP 的跳过
    if (imagePath.endsWith('.webp')) {
        return true;
    }

    // 验证文件是否为有效图片（检查 magic bytes）
    if (!(await isValidImageFile(imagePath))) {
        console.warn('[压缩] 文件不是有效图片，跳过压缩:', imagePath);
        return false;
    }

    try {
        const originalStat = await fs.stat(imagePath);
        const webpPath = imagePath.replace(/\.[^.]+$/, '.webp');

        // 优先使用 cwebp（更可靠），回退到 ffmpeg
        const cwebpResult = await runProcess('cwebp', [
            '-q', '80',
            '-resize', '1200', '0',
            imagePath,
            '-o', webpPath,
        ], 30);

        const success = cwebpResult.success;

        if (!success) {
            // cwebp 失败，尝试 ffmpeg 作为后备
            console.warn('[压缩] cwebp 失败，尝试 ffmpeg:', cwebpResult.error);
            const ffmpegResult = await runProcess('ffmpeg', [
                '-y', '-i', imagePath,
                '-c:v', 'libwebp',
                '-q:v', '80',
                webpPath,
            ], 30);

            if (!ffmpegResult.success) {
                logger.warn('MediaProcessor', `图片压缩失败 (ffmpeg fallback): ${ffmpegResult.error}`);
                return false;
            }
        }

        try {
            await fs.access(webpPath);
            const compressedStat = await fs.stat(webpPath);

            // 删除原文件
            if (imagePath !== webpPath) {
                await fs.unlink(imagePath);
            }

            console.log(
                `[压缩] 图片压缩完成: ${(originalStat.size / 1024).toFixed(0)}KB → ${(compressedStat.size / 1024).toFixed(0)}KB (${path.extname(imagePath)} → .webp)`
            );
            return true;
        } catch {
            return false;
        }
    } catch (err) {
        logger.error('MediaProcessor', `图片压缩异常: ${imagePath}`, err);
        return false;
    }
}

/**
 * 通过 magic bytes 检测文件是否为有效图片
 */
async function isValidImageFile(filePath: string): Promise<boolean> {
    try {
        const fd = await fs.open(filePath, 'r');
        const buf = Buffer.alloc(16);
        await fd.read(buf, 0, 16, 0);
        await fd.close();

        // PNG: 89 50 4E 47
        if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47) return true;
        // JPEG: FF D8 FF
        if (buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF) return true;
        // GIF: 47 49 46
        if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) return true;
        // BMP: 42 4D
        if (buf[0] === 0x42 && buf[1] === 0x4D) return true;
        // WebP: 52 49 46 46 ... 57 45 42 50
        if (buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46
            && buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50) return true;

        return false;
    } catch {
        return false;
    }
}

/**
 * 使用 yt-dlp 下载视频（自动合并音轨），适用于各类视频平台
 * 对应 VideoProcessor.DownloadVideoWithAudioAsync
 */
export async function downloadVideoWithAudio(
    sourcePageUrl: string,
    outputDirectory: string
): Promise<string | null> {
    if (!sourcePageUrl) return null;
    if (ytDlpBinaryAvailable === false) return null;

    try {
        await fs.mkdir(outputDirectory, { recursive: true });

        const fileName = `${crypto.randomUUID().replace(/-/g, '')}.mp4`;
        const outputPath = path.join(outputDirectory, fileName);

        // yt-dlp: 最佳 720p + 音轨合并
        const args = [
            '--no-playlist',
            '-f', 'best[height<=720]/best',
            '--merge-output-format', 'mp4',
            '--no-warnings',
            '-o', outputPath,
            sourcePageUrl,
        ];

        console.log('[yt-dlp] 开始下载:', sourcePageUrl);
        const result = await runProcess('yt-dlp', args, 120);

        if (result.success) {
            ytDlpBinaryAvailable = true;
            try {
                const stat = await fs.stat(outputPath);
                console.log(`[yt-dlp] 下载成功: ${fileName} (${(stat.size / 1024 / 1024).toFixed(1)} MB)`);
                return outputPath;
            } catch {
                return null;
            }
        } else {
            if (isMissingBinaryError(result.error)) {
                ytDlpBinaryAvailable = false;
                if (!ytDlpMissingWarned) {
                    logger.warn('MediaProcessor', 'yt-dlp 未安装，跳过 yt-dlp 视频下载并使用 HTTP fallback');
                    ytDlpMissingWarned = true;
                }
                return null;
            }

            logger.warn('MediaProcessor', `yt-dlp 下载失败: ${result.error}`);
            return null;
        }
    } catch (err) {
        logger.error('MediaProcessor', `yt-dlp 下载异常: ${sourcePageUrl}`, err);
        return null;
    }
}

/**
 * 从视频文件中提取第一帧作为封面图
 * 对应 VideoProcessor.ExtractFirstFrameAsync
 */
export async function extractFirstFrame(
    videoPath: string,
    outputDirectory: string
): Promise<string | null> {
    try {
        await fs.access(videoPath);
    } catch {
        console.warn('[封面] 视频文件不存在:', videoPath);
        return null;
    }

    try {
        await fs.mkdir(outputDirectory, { recursive: true });

        const baseName = path.basename(videoPath, path.extname(videoPath));
        const fileName = `${baseName}_cover.jpg`;
        const outputPath = path.join(outputDirectory, fileName);

        // 如果已存在则直接返回
        try {
            await fs.access(outputPath);
            return fileName;
        } catch {
            // 不存在，继续提取
        }

        // ffmpeg: 提取第一帧
        const args = [
            '-y', '-i', videoPath,
            '-frames:v', '1',
            '-q:v', '2',
            outputPath,
        ];

        const result = await runProcess('ffmpeg', args, 30);

        if (result.success) {
            try {
                await fs.access(outputPath);
                console.log(`[封面] 成功提取首帧: ${videoPath} → ${outputPath}`);
                return fileName;
            } catch {
                return null;
            }
        } else {
            console.warn('[封面] 提取首帧失败:', result.error);
            return null;
        }
    } catch (err) {
        console.error('[封面] 提取首帧异常:', videoPath, err);
        return null;
    }
}

// ─── 工具函数 ──────────────────────────────────────────────

async function safeUnlink(filePath: string): Promise<void> {
    try {
        await fs.unlink(filePath);
    } catch {
        // 文件可能已不存在
    }
}

/**
 * 判断文件扩展名是否为视频类型
 */
export function isVideoFile(filePath: string): boolean {
    const ext = path.extname(filePath).toLowerCase();
    return ['.mp4', '.mov', '.webm', '.m4v'].includes(ext);
}

/**
 * 判断文件扩展名是否为可压缩的图片类型
 */
export function isCompressibleImage(filePath: string): boolean {
    const ext = path.extname(filePath).toLowerCase();
    return ['.png', '.jpg', '.jpeg', '.gif', '.bmp'].includes(ext);
}
