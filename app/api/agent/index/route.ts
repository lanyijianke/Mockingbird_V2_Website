import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminHeaders } from '@/lib/utils/admin-auth';
import { indexAllArticles, indexAllPrompts, indexArticle, indexPrompt } from '@/lib/services/agent-search-indexer';
import type { AgentIndexReport, AgentIndexRequest } from '@/lib/services/agent-search-types';

export const runtime = 'nodejs';

function isObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}

function parseIndexRequest(value: unknown): AgentIndexRequest | null {
    if (!isObject(value)) return null;
    if (value.type === 'prompt' && Number.isInteger(value.id) && Number(value.id) > 0) {
        return { type: 'prompt', id: Number(value.id) };
    }
    if (value.type === 'article' && typeof value.slug === 'string' && value.slug.trim()) {
        return { type: 'article', site: typeof value.site === 'string' && value.site.trim() ? value.site.trim() : 'ai', slug: value.slug.trim() };
    }
    if (value.type === 'all') {
        return { type: 'all', site: typeof value.site === 'string' && value.site.trim() ? value.site.trim() : 'ai' };
    }
    return null;
}

async function runIndexRequest(request: AgentIndexRequest): Promise<AgentIndexReport> {
    if (request.type === 'prompt') {
        const item = await indexPrompt(request.id);
        return { success: item.status !== 'failed', items: [item] };
    }
    if (request.type === 'article') {
        const item = await indexArticle(request.slug, { site: request.site || 'ai', force: true });
        return { success: item.status !== 'failed', items: [item] };
    }

    const [prompts, articles] = await Promise.all([
        indexAllPrompts(),
        indexAllArticles({ site: request.site || 'ai' }),
    ]);
    return {
        success: prompts.success && articles.success,
        items: [...prompts.items, ...articles.items],
    };
}

export async function POST(request: NextRequest) {
    const auth = verifyAdminHeaders(request.headers);
    if (!auth.ok) {
        return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
    }

    let payload: unknown;
    try {
        payload = await request.json();
    } catch {
        return NextResponse.json({ success: false, error: 'Invalid JSON payload' }, { status: 400 });
    }

    const indexRequest = parseIndexRequest(payload);
    if (!indexRequest) {
        return NextResponse.json({ success: false, error: 'Invalid index request' }, { status: 400 });
    }

    const data = await runIndexRequest(indexRequest);
    return NextResponse.json({ success: data.success, data }, { status: data.success ? 200 : 207 });
}
