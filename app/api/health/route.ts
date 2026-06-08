import { NextResponse } from 'next/server';
import { getSiteBrandConfig } from '@/lib/site-config';

export const runtime = 'nodejs';

export interface HealthSnapshot {
    status: string;
    service: string;
    timestamp: string;
    version: string;
    database: {
        status: string;
        prompts: number;
    };
    articleSources: {
        status: string;
        articles: number;
    };
    scheduler: {
        running: boolean;
        jobs: Array<{ name: string; interval: string; locked: boolean }>;
    };
}

export async function getHealthSnapshot(): Promise<HealthSnapshot> {
    const siteConfig = getSiteBrandConfig();
    const [{ queryScalar }, { getTotalCount: getArticleCount }, { getSchedulerStatus }] = await Promise.all([
        import('@/lib/db'),
        import('@/lib/services/article-service'),
        import('@/lib/jobs/scheduler'),
    ]);

    let dbStatus = 'ok';
    let articleSourcesStatus = 'ok';
    let articleCount = 0;
    let promptCount = 0;

    try {
        promptCount = (await queryScalar<number>('SELECT COUNT(*) FROM Prompts')) ?? 0;
    } catch {
        dbStatus = 'error';
    }

    try {
        articleCount = await getArticleCount({ site: 'ai' });
    } catch {
        articleSourcesStatus = 'error';
    }

    const scheduler = getSchedulerStatus();

    return {
        status: dbStatus === 'ok' && articleSourcesStatus === 'ok' ? 'healthy' : 'degraded',
        service: siteConfig.serviceName,
        timestamp: new Date().toISOString(),
        version: process.env.npm_package_version || '0.1.0',
        database: {
            status: dbStatus,
            prompts: promptCount,
        },
        articleSources: {
            status: articleSourcesStatus,
            articles: articleCount,
        },
        scheduler: {
            running: scheduler.running,
            jobs: scheduler.jobs,
        },
    };
}

// GET /api/health — 增强版健康检查
export async function GET() {
    return NextResponse.json(await getHealthSnapshot());
}
