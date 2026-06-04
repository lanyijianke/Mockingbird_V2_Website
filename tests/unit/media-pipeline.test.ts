import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockCompressVideo = vi.fn();
const mockCompressImage = vi.fn();
const mockUploadPromptMediaToR2 = vi.fn();

vi.mock('@/lib/utils/media-processor', () => ({
    compressVideo: mockCompressVideo,
    compressImage: mockCompressImage,
    downloadVideoWithAudio: vi.fn(),
    isVideoFile: vi.fn(() => false),
    isCompressibleImage: vi.fn(() => false),
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

vi.mock('@/lib/utils/url-security', () => ({
    validateOutboundUrl: vi.fn(async () => ({ ok: true })),
}));

vi.mock('@/lib/pipelines/r2-media-store', () => ({
    uploadPromptMediaToR2: mockUploadPromptMediaToR2,
}));

describe('media pipeline', () => {
    const originalFetch = global.fetch;
    let tempDir: string;

    beforeEach(async () => {
        vi.resetModules();
        vi.clearAllMocks();
        tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'media-pipeline-'));
    });

    afterEach(async () => {
        global.fetch = originalFetch;
        delete process.env.PROMPT_MEDIA_STORAGE;
        await fs.rm(tempDir, { recursive: true, force: true });
    });

    it('downloads media successfully when the upstream requires a redirect hop', async () => {
        global.fetch = vi.fn(async (_input, init) => {
            if (init?.redirect === 'error') {
                throw new TypeError('fetch failed');
            }

            return new Response(Buffer.from('video-bytes'), {
                status: 200,
                headers: {
                    'content-type': 'video/mp4',
                    'content-length': '11',
                },
            });
        }) as typeof fetch;

        const { downloadMedia } = await import('@/lib/pipelines/media-pipeline');
        const result = await downloadMedia('https://example.com/demo.mp4', tempDir);

        expect(result).toMatch(/^\/content\/prompts\/media\/.+\.mp4$/);
        expect(global.fetch).toHaveBeenCalledTimes(1);
        expect(global.fetch).toHaveBeenCalledWith(
            'https://example.com/demo.mp4',
            expect.objectContaining({
                redirect: 'follow',
            })
        );
    });

    it('uploads processed images to R2 and returns the public URL when R2 storage is enabled', async () => {
        process.env.PROMPT_MEDIA_STORAGE = 'r2';
        const { isCompressibleImage } = await import('@/lib/utils/media-processor');
        vi.mocked(isCompressibleImage).mockReturnValue(true);
        mockCompressImage.mockImplementation(async (localPath: string) => {
            await fs.writeFile(localPath.replace(/\.[^.]+$/, '.webp'), Buffer.from('webp-bytes'));
            return true;
        });
        mockUploadPromptMediaToR2.mockResolvedValue('https://assets.zgnknowledge.online/prompts/media/images/cat.webp');
        global.fetch = vi.fn(async () => new Response(Buffer.from('image-bytes'), {
            status: 200,
            headers: {
                'content-type': 'image/jpeg',
                'content-length': '11',
            },
        })) as typeof fetch;

        const { downloadMedia } = await import('@/lib/pipelines/media-pipeline');
        const result = await downloadMedia('https://example.com/cat.jpg', tempDir);

        expect(result).toBe('https://assets.zgnknowledge.online/prompts/media/images/cat.webp');
        expect(mockUploadPromptMediaToR2).toHaveBeenCalledWith(expect.objectContaining({
            kind: 'images',
            fileName: expect.stringMatching(/\.webp$/),
            contentType: 'image/webp',
            body: expect.any(Buffer),
        }));
    });
});
