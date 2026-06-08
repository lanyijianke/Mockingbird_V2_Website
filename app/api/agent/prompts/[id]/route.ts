import { NextRequest, NextResponse } from 'next/server';
import { getAgentPromptDetail } from '@/lib/services/agent-search-service';

export const runtime = 'nodejs';

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    void request;
    const { id } = await params;
    const promptId = Number.parseInt(id, 10);
    if (!Number.isInteger(promptId) || promptId <= 0) {
        return NextResponse.json({ success: false, error: 'Invalid prompt ID' }, { status: 400 });
    }

    const data = await getAgentPromptDetail(promptId);
    if (!data) {
        return NextResponse.json({ success: false, error: 'Prompt not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, data });
}
