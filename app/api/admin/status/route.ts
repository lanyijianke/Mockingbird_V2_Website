import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminHeaders } from '@/lib/utils/admin-auth';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
    const auth = verifyAdminHeaders(request.headers);
    if (!auth.ok) {
        return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
    }

    const [{ getMonitoringStatus }, { getHealthSnapshot }] = await Promise.all([
        import('@/lib/monitoring/status-service'),
        import('@/app/api/health/route'),
    ]);

    const health = await getHealthSnapshot();
    const data = await getMonitoringStatus({ health });
    return NextResponse.json({ success: true, data });
}
