import { NextRequest, NextResponse } from 'next/server';
import { parsePaginationParams, parseCountParam, parseSearchQuery, parseCategoryParam } from '@/lib/utils/api-validation';

export const runtime = 'nodejs';

// GET /api/articles?page=1&pageSize=12&category=engineering&q=search
export async function GET(request: NextRequest) {
    const { getTopArticles, getPagedArticles, getAllSlugs } = await import('@/lib/services/article-service');
    const { searchParams } = new URL(request.url);
    const site = searchParams.get('site') || 'ai';

    // 路由: /api/articles/slugs → 返回所有 Slug (SSG 用)
    if (searchParams.get('action') === 'slugs') {
        const slugs = await getAllSlugs(site);
        return NextResponse.json({ success: true, data: slugs });
    }

    // 路由: /api/articles/top?count=9
    if (searchParams.get('action') === 'top') {
        const count = parseCountParam(searchParams, 9);
        const articles = await getTopArticles(count, { site });
        return NextResponse.json({ success: true, data: articles });
    }

    // 默认: 分页查询（参数已校验：page≥1, pageSize∈[1,100]）
    const { page, pageSize } = parsePaginationParams(searchParams);
    const category = parseCategoryParam(searchParams);
    const q = parseSearchQuery(searchParams);

    const result = await getPagedArticles(page, pageSize, category, q, { site });
    return NextResponse.json({ success: true, data: result });
}

// POST /api/articles → track-view
export async function POST(request: NextRequest) {
    const { trackView } = await import('@/lib/services/article-service');
    const body = await request.json();
    const { slug, action } = body;

    if (action === 'track-view' && slug && typeof slug === 'string') {
        const success = await trackView(slug);
        return NextResponse.json({ success: true, tracked: success });
    }

    return NextResponse.json({ success: false, error: 'Invalid action' }, { status: 400 });
}
