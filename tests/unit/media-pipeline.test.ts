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
        await fs.rm(tempDir, { recursive: true, force: true });
    });

    it('downloads media into the provided temp workspace and keeps the file local', async () => {
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

        expect(result).not.toBeNull();
        const localPath = result as string;
        expect(path.dirname(localPath)).toBe(tempDir);
        expect(localPath).toMatch(/\.mp4$/);
        await expect(fs.access(localPath)).resolves.toBeUndefined();
        expect(global.fetch).toHaveBeenCalledTimes(1);
        expect(global.fetch).toHaveBeenCalledWith(
            'https://example.com/demo.mp4',
            expect.objectContaining({
                redirect: 'follow',
            })
        );
    });

    it('converts compressible images to webp in the temp workspace', async () => {
        global.fetch = vi.fn(async () => new Response(Buffer.from('image-bytes'), {
            status: 200,
            headers: {
                'content-type': 'image/jpeg',
                'content-length': '11',
            },
        })) as typeof fetch;
        const { isCompressibleImage } = await import('@/lib/utils/media-processor');
        vi.mocked(isCompressibleImage).mockReturnValue(true);
        mockCompressImage.mockImplementation(async (localPath: string) => {
            await fs.writeFile(localPath.replace(/\.[^.]+$/, '.webp'), Buffer.from('webp-bytes'));
            return true;
        });

        const { downloadMedia } = await import('@/lib/pipelines/media-pipeline');
        const result = await downloadMedia('https://example.com/cat.jpg', tempDir);

        expect(result).not.toBeNull();
        const localPath = result as string;
        expect(path.dirname(localPath)).toBe(tempDir);
        expect(localPath).toMatch(/\.webp$/);
        await expect(fs.access(localPath)).resolves.toBeUndefined();
    });

    it('uploads a local media file to R2 and returns the public URL', async () => {
        mockUploadPromptMediaToR2.mockResolvedValue('https://assets.zgnknowledge.online/prompts/media/images/cat.webp');
        const filePath = path.join(tempDir, 'cat.webp');
        await fs.writeFile(filePath, Buffer.from('webp-bytes'));

        const { uploadPromptMediaFileToR2 } = await import('@/lib/pipelines/media-pipeline');
        const result = await uploadPromptMediaFileToR2(filePath, 'images');

        expect(result).toBe('https://assets.zgnknowledge.online/prompts/media/images/cat.webp');
        expect(mockUploadPromptMediaToR2).toHaveBeenCalledWith(expect.objectContaining({
            kind: 'images',
            fileName: 'cat.webp',
            contentType: 'image/webp',
            body: expect.any(Buffer),
        }));
    });

    it('creates and cleans up a temp workspace', async () => {
        const { withPromptMediaWorkspace } = await import('@/lib/pipelines/media-pipeline');

        let workspacePath = '';
        await withPromptMediaWorkspace(async (workspaceDir) => {
            workspacePath = workspaceDir;
            await fs.writeFile(path.join(workspaceDir, 'marker.txt'), 'ok');
            await expect(fs.access(workspaceDir)).resolves.toBeUndefined();
        });

        await expect(fs.access(workspacePath)).rejects.toThrow();
    });
});
