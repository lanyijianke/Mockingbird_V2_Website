import { afterEach, describe, expect, it, vi } from 'vitest';
import nextConfig from '@/next.config';

const ORIGINAL_R2_PUBLIC_HOST = process.env.KNOWLEDGE_R2_PUBLIC_ASSET_HOST;

describe('next image remote patterns', () => {
    afterEach(() => {
        if (ORIGINAL_R2_PUBLIC_HOST === undefined) delete process.env.KNOWLEDGE_R2_PUBLIC_ASSET_HOST;
        else process.env.KNOWLEDGE_R2_PUBLIC_ASSET_HOST = ORIGINAL_R2_PUBLIC_HOST;
    });

    it('allows the production knowledge site domain for image assets', () => {
        const remotePatterns = nextConfig.images?.remotePatterns ?? [];
        const productionSitePattern = remotePatterns.find((pattern) => pattern.hostname === 'zgnknowledge.online');

        expect(productionSitePattern).toMatchObject({
            protocol: 'https',
            hostname: 'zgnknowledge.online',
        });
    });

    it('allows ProductHunt imgix thumbnails across all paths', () => {
        const remotePatterns = nextConfig.images?.remotePatterns ?? [];
        const productHuntPattern = remotePatterns.find((pattern) => pattern.hostname === 'ph-files.imgix.net');

        expect(productHuntPattern).toBeDefined();
        expect(productHuntPattern).toMatchObject({
            protocol: 'https',
            hostname: 'ph-files.imgix.net',
            pathname: '/**',
        });
    });

    it('allows the configured R2 article asset domain for image assets', async () => {
        vi.resetModules();
        process.env.KNOWLEDGE_R2_PUBLIC_ASSET_HOST = 'assets.zgnknowledge.online';

        const { default: config } = await import('@/next.config');
        const remotePatterns = config.images?.remotePatterns ?? [];
        const r2Pattern = remotePatterns.find((pattern) => pattern.hostname === 'assets.zgnknowledge.online');

        expect(r2Pattern).toMatchObject({
            protocol: 'https',
            hostname: 'assets.zgnknowledge.online',
            pathname: '/**',
        });
    });
});
