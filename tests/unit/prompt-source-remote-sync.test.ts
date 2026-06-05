import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockQueryOne = vi.fn();
const mockExecute = vi.fn();
const mockDownloadMedia = vi.fn();
const mockDownloadVideoViaYtDlp = vi.fn();
const mockCreateCardPreviewVideo = vi.fn();
const mockExtractFirstFrame = vi.fn();
const mockUploadPromptMediaFileToR2 = vi.fn(async (value: string): Promise<string | null> => value);
const mockWithPromptMediaWorkspace = vi.fn(async (task: (workspaceDir: string) => Promise<unknown>) => task('/tmp/prompt-media'));

vi.mock('@/lib/db', () => ({
    queryOne: mockQueryOne,
    execute: mockExecute,
}));

vi.mock('@/lib/pipelines/media-pipeline', () => ({
    downloadMedia: mockDownloadMedia,
    downloadVideoViaYtDlp: mockDownloadVideoViaYtDlp,
    uploadPromptMediaFileToR2: mockUploadPromptMediaFileToR2,
    withPromptMediaWorkspace: mockWithPromptMediaWorkspace,
}));

vi.mock('@/lib/utils/media-processor', () => ({
    createCardPreviewVideo: mockCreateCardPreviewVideo,
    extractFirstFrame: mockExtractFirstFrame,
}));

vi.mock('@/lib/utils/logger', () => ({
    logger: {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        persist: vi.fn(),
    },
}));

describe('prompt remote source sync runner', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockCreateCardPreviewVideo.mockResolvedValue(null);
        mockExtractFirstFrame.mockResolvedValue(null);
        mockUploadPromptMediaFileToR2.mockImplementation(async (value: string) => {
            if (value.endsWith('/cat.webp')) return 'https://assets.zgnknowledge.online/prompts/media/images/cat.webp';
            if (value.endsWith('/demo.mp4')) return 'https://assets.zgnknowledge.online/prompts/media/videos/demo.mp4';
            if (value.endsWith('/demo.card.mp4')) return 'https://assets.zgnknowledge.online/prompts/media/previews/demo.card.mp4';
            if (value.endsWith('/demo-cover.webp')) return 'https://assets.zgnknowledge.online/prompts/media/images/demo-cover.webp';
            return value;
        });
    });

    it('imports normalized records through the existing Prompts table shape', async () => {
        mockQueryOne.mockResolvedValue(null);
        mockDownloadMedia.mockResolvedValue('/tmp/prompt-media/cat.webp');
        mockExecute.mockResolvedValue({ affectedRows: 1 });

        const { syncPromptSourceRecords } = await import('@/lib/pipelines/prompt-sources/remote-sync');
        const report = await syncPromptSourceRecords(
            {
                id: 'test-source',
                type: 'github-readme',
                defaultCategory: 'gpt-image-2',
                enabled: true,
            },
            [
                {
                    externalId: 'test-source:no-1',
                    title: 'Cat Portrait',
                    rawTitle: 'Cat Portrait',
                    description: 'A cat prompt',
                    content: 'Draw a cat',
                    category: 'gpt-image-2',
                    author: 'Author',
                    sourceUrl: 'https://example.com/cat',
                    mediaUrls: ['https://example.com/cat.jpg'],
                    videoUrls: [],
                    flags: ['raycast'],
                    metadata: { sourceId: 'test-source' },
                },
            ]
        );

        expect(report).toMatchObject({
            totalParsed: 1,
            newlyAdded: 1,
            updated: 0,
            skipped: 0,
        });
        expect(mockWithPromptMediaWorkspace).toHaveBeenCalledTimes(1);
        expect(mockExecute).toHaveBeenCalledTimes(1);
        expect(mockExecute.mock.calls[0][0]).toContain('INSERT INTO Prompts');
        expect(mockExecute.mock.calls[0][1]).toContain('Cat Portrait');
        expect(mockExecute.mock.calls[0][1]).toContain('gpt-image-2');
        expect(mockExecute.mock.calls[0][1]).toContain('https://assets.zgnknowledge.online/prompts/media/images/cat.webp');
    });

    it('updates missing media fields for existing prompts without duplicating rows', async () => {
        mockQueryOne.mockResolvedValue({
            Id: 42,
            CoverImageUrl: null,
            VideoPreviewUrl: null,
            CardPreviewVideoUrl: null,
            ImagesJson: null,
        });
        mockDownloadMedia.mockResolvedValue('/tmp/prompt-media/cat.webp');
        mockExecute.mockResolvedValue({ affectedRows: 1 });

        const { syncPromptSourceRecords } = await import('@/lib/pipelines/prompt-sources/remote-sync');
        const report = await syncPromptSourceRecords(
            {
                id: 'test-source',
                type: 'github-readme',
                defaultCategory: 'gpt-image-2',
                enabled: true,
            },
            [
                {
                    externalId: 'test-source:no-1',
                    title: 'Cat Portrait',
                    content: 'Draw a cat',
                    category: 'gpt-image-2',
                    sourceUrl: 'https://example.com/cat',
                    mediaUrls: ['https://example.com/cat.jpg'],
                },
            ]
        );

        expect(report.updated).toBe(1);
        expect(report.newlyAdded).toBe(0);
        expect(mockExecute.mock.calls[0][0]).toContain('UPDATE Prompts SET');
        expect(mockExecute.mock.calls[0][1]).toContain(42);
    });

    it('does not try to generate local preview files from an existing R2 URL when there is no fresh source video', async () => {
        mockQueryOne.mockResolvedValue({
            Id: 43,
            CoverImageUrl: '/content/prompts/media/cover.webp',
            VideoPreviewUrl: 'https://assets.zgnknowledge.online/prompts/media/videos/demo.mp4',
            CardPreviewVideoUrl: null,
            ImagesJson: JSON.stringify(['/content/prompts/media/cover.webp']),
        });

        const { syncPromptSourceRecords } = await import('@/lib/pipelines/prompt-sources/remote-sync');
        const report = await syncPromptSourceRecords(
            {
                id: 'test-source',
                type: 'github-readme',
                defaultCategory: 'seedance-2',
                enabled: true,
            },
            [
                {
                    externalId: 'test-source:no-2',
                    title: 'Seedance Prompt',
                    content: 'Make a video',
                    category: 'seedance-2',
                    sourceUrl: 'https://example.com/video',
                    videoUrls: [],
                },
            ]
        );

        expect(report.skipped).toBe(1);
        expect(mockCreateCardPreviewVideo).not.toHaveBeenCalled();
        expect(mockDownloadVideoViaYtDlp).not.toHaveBeenCalled();
        expect(mockDownloadMedia).not.toHaveBeenCalled();
        expect(mockExecute).not.toHaveBeenCalled();
    });

    it('abandons media when an R2 upload fails instead of writing local paths', async () => {
        mockQueryOne.mockResolvedValue(null);
        mockDownloadMedia.mockResolvedValue('/tmp/prompt-media/cat.webp');
        mockUploadPromptMediaFileToR2.mockResolvedValueOnce(null);
        mockExecute.mockResolvedValue({ affectedRows: 1 });

        const { syncPromptSourceRecords } = await import('@/lib/pipelines/prompt-sources/remote-sync');
        const report = await syncPromptSourceRecords(
            {
                id: 'test-source',
                type: 'github-readme',
                defaultCategory: 'gpt-image-2',
                enabled: true,
            },
            [
                {
                    externalId: 'test-source:no-4',
                    title: 'Cat Portrait',
                    content: 'Draw a cat',
                    category: 'gpt-image-2',
                    sourceUrl: 'https://example.com/cat',
                    mediaUrls: ['https://example.com/cat.jpg'],
                },
            ]
        );

        expect(report.newlyAdded).toBe(1);
        expect(mockExecute.mock.calls[0][1][7]).toBeNull();
        expect(mockExecute.mock.calls[0][1][10]).toBeNull();
        expect(JSON.stringify(mockExecute.mock.calls[0][1])).not.toContain('/tmp/prompt-media');
    });

    it('keeps video derivations local until they can be uploaded to R2', async () => {
        mockQueryOne.mockResolvedValue(null);
        mockDownloadVideoViaYtDlp.mockResolvedValue('/tmp/prompt-media/demo.mp4');
        mockCreateCardPreviewVideo.mockResolvedValue('demo.card.mp4');
        mockExtractFirstFrame.mockResolvedValue('demo-cover.webp');

        const { syncPromptSourceRecords } = await import('@/lib/pipelines/prompt-sources/remote-sync');
        const report = await syncPromptSourceRecords(
            {
                id: 'test-source',
                type: 'github-readme',
                defaultCategory: 'seedance-2',
                enabled: true,
            },
            [
                {
                    externalId: 'test-source:no-3',
                    title: 'Seedance Prompt',
                    content: 'Make a video',
                    category: 'seedance-2',
                    sourceUrl: 'https://example.com/video',
                    videoUrls: ['https://example.com/demo.mp4'],
                },
            ]
        );

        expect(report.newlyAdded).toBe(1);
        expect(mockWithPromptMediaWorkspace).toHaveBeenCalledTimes(1);
        expect(mockCreateCardPreviewVideo).toHaveBeenCalledWith('/tmp/prompt-media/demo.mp4');
        expect(mockExtractFirstFrame).toHaveBeenCalledWith('/tmp/prompt-media/demo.mp4', '/tmp/prompt-media');
        expect(mockExecute.mock.calls[0][1]).toContain('https://assets.zgnknowledge.online/prompts/media/videos/demo.mp4');
        expect(mockExecute.mock.calls[0][1]).toContain('https://assets.zgnknowledge.online/prompts/media/previews/demo.card.mp4');
        expect(mockExecute.mock.calls[0][1]).toContain('https://assets.zgnknowledge.online/prompts/media/images/demo-cover.webp');
    });
});
