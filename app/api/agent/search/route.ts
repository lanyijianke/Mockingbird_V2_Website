import { NextRequest, NextResponse } from 'next/server';
import { normalizeSearchType, parseLimit, searchAgentIndex } from '@/lib/services/agent-search-service';
import { parseCategoryParam } from '@/lib/utils/api-validation';
import type { AgentMediaType } from '@/lib/services/agent-asset-types';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const q = searchParams.get('q')?.trim().slice(0, 200);
    if (!q) {
        return NextResponse.json({ success: false, error: 'Missing search query' }, { status: 400 });
    }

    const mediaParam = searchParams.get('media');
    const media: AgentMediaType | 'any' | undefined = mediaParam === 'image' || mediaParam === 'video' || mediaParam === 'any'
        ? mediaParam
        : undefined;

    const data = await searchAgentIndex({
        query: q,
        type: normalizeSearchType(searchParams.get('type')),
        site: searchParams.get('site')?.trim() || 'ai',
        category: parseCategoryParam(searchParams),
        limit: parseLimit(searchParams.get('limit')),
        media,
        useCase: searchParams.get('useCase')?.trim() || undefined,
    });

    return NextResponse.json({ success: true, data });
}
