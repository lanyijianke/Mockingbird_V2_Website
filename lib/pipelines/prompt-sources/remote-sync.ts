import path from 'path';
import { execute, queryOne } from '@/lib/db';
import { createEmptyReport, type PipelineReport } from '@/lib/pipelines/pipeline-shared';
import { createCardPreviewVideo, extractFirstFrame } from '@/lib/utils/media-processor';
import { logger } from '@/lib/utils/logger';
import {
    downloadMedia,
    downloadVideoViaYtDlp,
    uploadPromptMediaFileToR2,
    withPromptMediaWorkspace,
} from '../media-pipeline';
import { selectPromptSourceAdapter } from './adapters';
import { loadPromptSourceConfigs } from './source-config';
import type { PromptImportRecord, PromptSourceConfig } from './types';

interface ExistingPromptRecord {
    Id: number;
    CoverImageUrl: string | null;
    VideoPreviewUrl: string | null;
    CardPreviewVideoUrl: string | null;
    ImagesJson: string | null;
}

interface ResolvedPromptMedia {
    coverImageUrl: string | null;
    videoPreviewUrl: string | null;
    cardPreviewVideoUrl: string | null;
    imagesJson: string | null;
}

function mergeReport(target: PipelineReport, current: PipelineReport): void {
    target.totalParsed += current.totalParsed;
    target.newlyAdded += current.newlyAdded;
    target.updated += current.updated;
    target.skipped += current.skipped;
}

async function resolveRecordMedia(
    record: PromptImportRecord,
    mediaDir: string,
    existing?: ExistingPromptRecord
): Promise<ResolvedPromptMedia> {
    let coverImageUrl = existing?.CoverImageUrl || null;
    let videoPreviewUrl = existing?.VideoPreviewUrl || null;
    let cardPreviewVideoUrl = existing?.CardPreviewVideoUrl || null;
    let imagesJson = existing?.ImagesJson || null;

    if ((!coverImageUrl || !imagesJson) && record.mediaUrls && record.mediaUrls.length > 0) {
        const uploadedImages: string[] = [];
        for (const imageUrl of record.mediaUrls) {
            if (!imageUrl.startsWith('http')) continue;

            const localPath = await downloadMedia(imageUrl, mediaDir);
            if (!localPath) continue;

            const uploadedUrl = await uploadPromptMediaFileToR2(localPath, 'images');
            if (!uploadedUrl) continue;

            uploadedImages.push(uploadedUrl);
            if (!coverImageUrl) coverImageUrl = uploadedUrl;
        }

        if (!imagesJson && uploadedImages.length > 0) {
            imagesJson = JSON.stringify(uploadedImages);
        }
    }

    if ((!videoPreviewUrl || !cardPreviewVideoUrl || !coverImageUrl) && record.videoUrls && record.videoUrls.length > 0) {
        const videoUrl = record.videoUrls[0];
        if (videoUrl.startsWith('http')) {
            const localVideoPath = await downloadVideoViaYtDlp(videoUrl, mediaDir) || await downloadMedia(videoUrl, mediaDir);

            if (localVideoPath) {
                if (!videoPreviewUrl) {
                    videoPreviewUrl = await uploadPromptMediaFileToR2(localVideoPath, 'videos');
                }

                if (!cardPreviewVideoUrl) {
                    const previewFileName = await createCardPreviewVideo(localVideoPath);
                    if (previewFileName) {
                        const previewPath = path.join(mediaDir, previewFileName);
                        cardPreviewVideoUrl = await uploadPromptMediaFileToR2(previewPath, 'previews');
                    }
                }

                if (!coverImageUrl) {
                    const coverFileName = await extractFirstFrame(localVideoPath, mediaDir);
                    if (coverFileName) {
                        const coverPath = path.join(mediaDir, coverFileName);
                        coverImageUrl = await uploadPromptMediaFileToR2(coverPath, 'images');
                    }
                }
            }
        }
    }

    return { coverImageUrl, videoPreviewUrl, cardPreviewVideoUrl, imagesJson };
}

async function findExistingRecord(record: PromptImportRecord): Promise<ExistingPromptRecord | null> {
    if (record.sourceUrl) {
        const existing = await queryOne<ExistingPromptRecord>(
            'SELECT Id, CoverImageUrl, VideoPreviewUrl, CardPreviewVideoUrl, ImagesJson FROM Prompts WHERE SourceUrl = ?',
            [record.sourceUrl]
        );
        if (existing) return existing;
    }

    if (record.rawTitle || record.title) {
        return queryOne<ExistingPromptRecord>(
            'SELECT Id, CoverImageUrl, VideoPreviewUrl, CardPreviewVideoUrl, ImagesJson FROM Prompts WHERE RawTitle = ?',
            [record.rawTitle || record.title]
        );
    }

    return null;
}

async function upsertPromptRecord(
    source: PromptSourceConfig,
    record: PromptImportRecord,
    mediaDir: string
): Promise<'inserted' | 'updated' | 'skipped'> {
    if (!record.title || !record.content || record.content.length < 5) {
        return 'skipped';
    }

    const existing = await findExistingRecord(record);
    const media = await resolveRecordMedia(record, mediaDir, existing || undefined);

    if (existing) {
        const updates: string[] = [];
        const updateArgs: Array<string | number | null> = [];

        if (!existing.CoverImageUrl && media.coverImageUrl) {
            updates.push('CoverImageUrl = ?');
            updateArgs.push(media.coverImageUrl);
        }
        if (!existing.VideoPreviewUrl && media.videoPreviewUrl) {
            updates.push('VideoPreviewUrl = ?');
            updateArgs.push(media.videoPreviewUrl);
        }
        if (!existing.CardPreviewVideoUrl && media.cardPreviewVideoUrl) {
            updates.push('CardPreviewVideoUrl = ?');
            updateArgs.push(media.cardPreviewVideoUrl);
        }
        if (!existing.ImagesJson && media.imagesJson) {
            updates.push('ImagesJson = ?');
            updateArgs.push(media.imagesJson);
        }

        if (updates.length === 0) return 'skipped';

        updates.push('UpdatedAt = NOW()');
        await execute(`UPDATE Prompts SET ${updates.join(', ')} WHERE Id = ?`, [...updateArgs, existing.Id]);
        return 'updated';
    }

    await execute(
        `INSERT INTO Prompts (Title, RawTitle, Description, Content, Category, Source, Author, SourceUrl, CoverImageUrl, VideoPreviewUrl, CardPreviewVideoUrl, ImagesJson, CopyCount, IsActive, CreatedAt)
         VALUES (?, ?, ?, ?, ?, 'github', ?, ?, ?, ?, ?, ?, ?, 1, NOW())`,
        [
            record.title,
            record.rawTitle || record.title,
            record.description || '',
            record.content,
            record.category || source.defaultCategory,
            record.author || null,
            record.sourceUrl || null,
            media.coverImageUrl || null,
            media.videoPreviewUrl || null,
            media.cardPreviewVideoUrl || null,
            media.imagesJson || null,
            Math.floor(Math.random() * 9900) + 100,
        ]
    );
    return 'inserted';
}

export async function syncPromptSourceRecords(
    source: PromptSourceConfig,
    records: PromptImportRecord[]
): Promise<PipelineReport> {
    const report = createEmptyReport();
    report.totalParsed = records.length;

    for (const record of records) {
        try {
            const result = await withPromptMediaWorkspace(async (mediaDir) => (
                upsertPromptRecord(source, record, mediaDir)
            ));

            if (result === 'inserted') report.newlyAdded++;
            if (result === 'updated') report.updated++;
            if (result === 'skipped') report.skipped++;
        } catch (err) {
            logger.error('PromptSourceSync', `入库失败: ${record.title}`, err);
        }
    }

    return report;
}

export async function syncConfiguredPromptSources(): Promise<PipelineReport> {
    const report = createEmptyReport();
    const sources = await loadPromptSourceConfigs();

    for (const source of sources) {
        const adapter = selectPromptSourceAdapter(source);
        if (!adapter) {
            logger.warn('PromptSourceSync', `未找到适配器: ${source.id}`);
            continue;
        }

        try {
            logger.info('PromptSourceSync', `开始同步源 ${source.id} (${adapter.id})`);
            const input = await adapter.fetchSource(source);
            const records = await adapter.parse(input, source);
            const sourceReport = await syncPromptSourceRecords(source, records);
            mergeReport(report, sourceReport);
        } catch (err) {
            logger.error('PromptSourceSync', `同步源失败: ${source.id}`, err);
        }
    }

    return report;
}
