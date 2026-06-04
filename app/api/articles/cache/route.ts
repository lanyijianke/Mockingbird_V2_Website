import { NextRequest, NextResponse } from 'next/server';
import { clearArticleDirectoryCache } from '@/lib/articles/article-directory';
import { verifyAdminHeaders } from '@/lib/utils/admin-auth';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
    const authResult = verifyAdminHeaders(request.headers);
    if (!authResult.ok) {
        return NextResponse.json({ error: authResult.error }, { status: authResult.status });
    }

    clearArticleDirectoryCache();
    return NextResponse.json({ success: true, message: 'Article cache cleared' });
}
