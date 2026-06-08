import { NextRequest, NextResponse } from 'next/server';
import { buildAbsoluteUrl } from '@/lib/site-config';
import { verifyAdminHeaders } from '@/lib/utils/admin-auth';

export const runtime = 'nodejs';

function getAdminToken(): string {
    return process.env.KNOWLEDGE_ADMIN_TOKEN || process.env.ADMIN_API_TOKEN || '';
}

async function requestContentRevalidation(body: unknown): Promise<void> {
    const adminToken = getAdminToken();
    if (!adminToken) return;

    const response = await fetch(buildAbsoluteUrl('/api/revalidate/content'), {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
            'x-admin-token': adminToken,
        },
        body: JSON.stringify(body),
    });

    if (!response.ok) {
        console.warn(`[API] 统一重验证失败: HTTP ${response.status}`);
    }
}

/**
 * GET /api/jobs — 获取调度器状态
 * POST /api/jobs?action=start — 启动调度器
 * POST /api/jobs?action=stop — 停止调度器
 * POST /api/jobs?action=trigger-prompt-sync — 立即执行一次提示词源同步
 * POST /api/jobs?action=trigger-agent-index — 立即执行一次 Agent 索引/向量同步
 */
export async function GET() {
    const { getSchedulerStatus } = await import('@/lib/jobs/scheduler');
    return NextResponse.json(getSchedulerStatus());
}

export async function POST(request: NextRequest) {
    const authResult = verifyAdminHeaders(request.headers);
    if (!authResult.ok) {
        return NextResponse.json({ error: authResult.error }, { status: authResult.status });
    }

    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');

    switch (action) {
        case 'start': {
            const { startScheduler, getSchedulerStatus } = await import('@/lib/jobs/scheduler');
            startScheduler();
            return NextResponse.json({ message: '调度器已启动', ...getSchedulerStatus() });
        }

        case 'stop': {
            const { stopScheduler, getSchedulerStatus } = await import('@/lib/jobs/scheduler');
            stopScheduler();
            return NextResponse.json({ message: '调度器已停止', ...getSchedulerStatus() });
        }

        case 'trigger-prompt-sync': {
            const { syncAllAsync: promptSourceSync } = await import('@/lib/pipelines/prompt-readme-sync');
            console.log('[API] 手动触发提示词源同步...');
            const sources = await promptSourceSync();
            if (sources.newlyAdded > 0 || sources.updated > 0) {
                await requestContentRevalidation({ type: 'prompt', action: 'sync' });
            }
            const report = { sources };
            console.log('[API] 提示词源同步完成:', report);
            return NextResponse.json({ message: '提示词同步已执行', report });
        }

        case 'trigger-agent-index': {
            const { runAgentIndexJob } = await import('@/lib/jobs/agent-index-job');
            console.log('[API] 手动触发 Agent 索引同步...');
            const report = await runAgentIndexJob();
            console.log('[API] Agent 索引同步完成:', report);
            return NextResponse.json({ message: 'Agent 索引同步已执行', report });
        }

        default:
            return NextResponse.json({ error: '无效的 action（可选: start, stop, trigger-prompt-sync, trigger-agent-index）' }, { status: 400 });
    }
}
