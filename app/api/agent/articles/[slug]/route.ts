import { NextRequest, NextResponse } from 'next/server';
import { getAgentArticleDetail } from '@/lib/services/agent-search-service';

export const runtime = 'nodejs';

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ slug: string }> }
) {
    const { slug } = await params;
    const { searchParams } = new URL(request.url);
    const rawMaxChars = Number.parseInt(searchParams.get('maxChars') || '', 10);
    const maxChars = Number.isInteger(rawMaxChars) ? rawMaxChars : undefined;

    const data = await getAgentArticleDetail(slug, {
        site: searchParams.get('site')?.trim() || 'ai',
        maxChars,
    });
    if (!data) {
        return NextResponse.json({ success: false, error: 'Article not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, data });
}
