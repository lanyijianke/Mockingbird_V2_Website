import fs from 'fs/promises';
import path from 'path';
import { NextRequest, NextResponse } from 'next/server';
import { cacheHttpHeaders } from '@/lib/cache/policies';
import { getArticleDirectoryEntry, resolveEntryAssetFilePath } from '@/lib/articles/article-directory';

export const runtime = 'nodejs';

function getContentType(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();
    switch (ext) {
        case '.png':
            return 'image/png';
        case '.jpg':
        case '.jpeg':
            return 'image/jpeg';
        case '.webp':
            return 'image/webp';
        case '.gif':
            return 'image/gif';
        case '.svg':
            return 'image/svg+xml';
        default:
            return 'application/octet-stream';
    }
}

export async function GET(
    _request: NextRequest,
    { params }: { params: Promise<{ site: string; slug: string; assetPath: string[] }> }
) {
    const { site, slug, assetPath } = await params;
    const entry = await getArticleDirectoryEntry(site, slug);

    if (!entry || entry.sourceType !== 'local' || assetPath.length === 0) {
        return new NextResponse('Not Found', { status: 404 });
    }

    try {
        const filePath = resolveEntryAssetFilePath(entry, assetPath.join('/'));
        const buffer = await fs.readFile(filePath);
        return new NextResponse(buffer, {
            status: 200,
            headers: {
                'Content-Type': getContentType(filePath),
                'Cache-Control': cacheHttpHeaders.articleAsset,
            },
        });
    } catch {
        return new NextResponse('Not Found', { status: 404 });
    }
}
