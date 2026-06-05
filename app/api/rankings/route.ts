import { NextRequest, NextResponse } from 'next/server';
import { getGitHubTrendings, getProductHuntRankings, getSkillsShRankings } from '@/lib/services/ranking-cache';

export const runtime = 'nodejs';

// GET /api/rankings?type=github|producthunt|skills-trending
export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type') || 'github';

    switch (type) {
        case 'github': {
            const data = await getGitHubTrendings();
            return NextResponse.json({ success: true, data });
        }
        case 'producthunt': {
            const data = await getProductHuntRankings();
            return NextResponse.json({ success: true, data });
        }
        case 'skills-trending': {
            const data = await getSkillsShRankings('trending');
            return NextResponse.json({ success: true, data });
        }
        default:
            return NextResponse.json(
                { success: false, error: `Unknown ranking type: ${type}` },
                { status: 400 }
            );
    }
}
