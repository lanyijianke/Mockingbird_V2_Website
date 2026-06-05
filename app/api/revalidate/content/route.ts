import { NextRequest, NextResponse } from 'next/server';
import {
    revalidateContentChange,
    warmContentPaths,
    type ArticleSite,
    type ContentRevalidationEvent,
    type RankingKind,
} from '@/lib/cache/content-revalidation';
import { verifyAdminHeaders } from '@/lib/utils/admin-auth';

export const runtime = 'nodejs';

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object';
}

function isArticleAction(value: unknown): value is Extract<ContentRevalidationEvent, { type: 'article' }>['action'] {
    return value === 'publish' || value === 'update' || value === 'unpublish' || value === 'manual';
}

function isPromptAction(value: unknown): value is Extract<ContentRevalidationEvent, { type: 'prompt' }>['action'] {
    return value === 'sync' || value === 'update' || value === 'manual';
}

function isRankingAction(value: unknown): value is Extract<ContentRevalidationEvent, { type: 'rankings' }>['action'] {
    return value === 'refresh' || value === 'manual';
}

function isArticleSite(value: unknown): value is ArticleSite {
    return value === 'ai' || value === 'finance';
}

function isRankingKind(value: unknown): value is RankingKind {
    return (
        value === 'github'
        || value === 'producthunt'
        || value === 'skills-trending'
        || value === 'all'
    );
}

function isPositiveInteger(value: unknown): value is number {
    return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

function optionalSlug(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function parseEvent(value: unknown): ContentRevalidationEvent | null {
    if (!isRecord(value)) return null;

    if (value.type === 'article') {
        if (!isArticleAction(value.action)) return null;
        if (!isArticleSite(value.site)) return null;
        return {
            type: 'article',
            action: value.action,
            site: value.site,
            slug: optionalSlug(value.slug),
        };
    }

    if (value.type === 'articles') {
        if (value.action !== 'manual') return null;
        return { type: 'articles', action: 'manual' };
    }

    if (value.type === 'prompt') {
        if (!isPromptAction(value.action)) return null;
        return {
            type: 'prompt',
            action: value.action,
            id: isPositiveInteger(value.id) ? value.id : undefined,
        };
    }

    if (value.type === 'rankings') {
        if (!isRankingAction(value.action)) return null;
        const kind = value.kind === undefined ? 'all' : value.kind;
        if (!isRankingKind(kind)) return null;
        return {
            type: 'rankings',
            action: value.action,
            kind,
        };
    }

    if (value.type === 'all') {
        if (value.action !== 'manual') return null;
        return { type: 'all', action: 'manual' };
    }

    return null;
}

export async function POST(request: NextRequest) {
    const authResult = verifyAdminHeaders(request.headers);
    if (!authResult.ok) {
        return NextResponse.json({ error: authResult.error }, { status: authResult.status });
    }

    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const event = parseEvent(body);
    if (!event) {
        return NextResponse.json({ error: 'Invalid revalidation event' }, { status: 400 });
    }

    const result = revalidateContentChange(event);
    const warmup = await warmContentPaths(result.warmPaths);
    return NextResponse.json({ success: true, data: { ...result, warmup } });
}
