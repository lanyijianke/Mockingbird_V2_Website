import { NextRequest, NextResponse } from 'next/server';
import { revalidateContentChange, warmContentPaths } from '@/lib/cache/content-revalidation';
import { verifyAdminHeaders } from '@/lib/utils/admin-auth';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
    const authResult = verifyAdminHeaders(request.headers);
    if (!authResult.ok) {
        return NextResponse.json({ error: authResult.error }, { status: authResult.status });
    }

    const result = revalidateContentChange({ type: 'articles', action: 'manual' });
    const warmup = await warmContentPaths(result.warmPaths);
    return NextResponse.json({
        success: true,
        message: 'Article content revalidated',
        data: { ...result, warmup },
    });
}
