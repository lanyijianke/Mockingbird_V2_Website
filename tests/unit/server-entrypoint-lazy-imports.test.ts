import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/image', async () => {
    const React = await import('react');
    return {
        default: ({ alt, ...props }: Record<string, unknown>) => React.createElement('img', { alt, ...props }),
    };
});

vi.mock('next/link', async () => {
    const React = await import('react');
    return {
        default: ({ href, children, ...props }: Record<string, unknown>) =>
            React.createElement('a', { href, ...props }, children as ReactNode),
    };
});

describe('server entrypoint lazy imports', () => {
    const originalNextRuntime = process.env.NEXT_RUNTIME;
    const originalAdminToken = process.env.KNOWLEDGE_ADMIN_TOKEN;

    beforeEach(() => {
        vi.resetModules();
        vi.clearAllMocks();
    });

    afterEach(() => {
        if (originalNextRuntime === undefined) {
            delete process.env.NEXT_RUNTIME;
        } else {
            process.env.NEXT_RUNTIME = originalNextRuntime;
        }

        if (originalAdminToken === undefined) {
            delete process.env.KNOWLEDGE_ADMIN_TOKEN;
        } else {
            process.env.KNOWLEDGE_ADMIN_TOKEN = originalAdminToken;
        }
    });

    it('loads the scheduler only when instrumentation runs in the node runtime', async () => {
        const state = {
            imported: 0,
            started: vi.fn(),
        };

        vi.doMock('@/lib/jobs/scheduler', () => {
            state.imported += 1;
            return {
                startScheduler: state.started,
            };
        });

        process.env.NEXT_RUNTIME = 'edge';
        const instrumentation = await import('@/instrumentation');

        expect(state.imported).toBe(0);

        await instrumentation.register();

        expect(state.imported).toBe(0);
        expect(state.started).not.toHaveBeenCalled();
    });

    it('does not import health dependencies until the handler is executed', async () => {
        const state = {
            dbImported: 0,
            articleImported: 0,
            schedulerImported: 0,
        };

        vi.doMock('@/lib/db', () => {
            state.dbImported += 1;
            return {
                queryScalar: vi.fn().mockResolvedValue(12),
            };
        });

        vi.doMock('@/lib/services/article-service', () => {
            state.articleImported += 1;
            return {
                getTotalCount: vi.fn().mockResolvedValue(34),
            };
        });

        vi.doMock('@/lib/jobs/scheduler', () => {
            state.schedulerImported += 1;
            return {
                getSchedulerStatus: vi.fn(() => ({ running: true, jobs: [] })),
            };
        });

        const route = await import('@/app/api/health/route');

        expect(state.dbImported).toBe(0);
        expect(state.articleImported).toBe(0);
        expect(state.schedulerImported).toBe(0);

        const response = await route.GET();
        const body = await response.json();

        expect(response.status).toBe(200);
        expect(body.database.prompts).toBe(12);
        expect(body.articleSources.articles).toBe(68);
        expect(state.dbImported).toBe(1);
        expect(state.articleImported).toBe(1);
        expect(state.schedulerImported).toBe(1);
    });

    it('does not import job pipelines until the matching route action is executed', async () => {
        const state = {
            schedulerImported: 0,
            readmeImported: 0,
            startScheduler: vi.fn(),
            stopScheduler: vi.fn(),
            getSchedulerStatus: vi.fn(() => ({ running: false, jobs: [] })),
            syncAllAsync: vi.fn().mockResolvedValue({ totalParsed: 1, newlyAdded: 1, updated: 0, skipped: 0 }),
        };

        vi.doMock('@/lib/jobs/scheduler', () => {
            state.schedulerImported += 1;
            return {
                startScheduler: state.startScheduler,
                stopScheduler: state.stopScheduler,
                getSchedulerStatus: state.getSchedulerStatus,
            };
        });

        vi.doMock('@/lib/pipelines/prompt-readme-sync', () => {
            state.readmeImported += 1;
            return {
                syncAllAsync: state.syncAllAsync,
            };
        });

        process.env.KNOWLEDGE_ADMIN_TOKEN = 'unit-test-token';

        const route = await import('@/app/api/jobs/route');

        expect(state.schedulerImported).toBe(0);
        expect(state.readmeImported).toBe(0);

        const getResponse = await route.GET();
        await getResponse.json();

        expect(state.schedulerImported).toBe(1);
        expect(state.readmeImported).toBe(0);

        const postResponse = await route.POST(new Request('http://localhost:5046/api/jobs?action=trigger-prompt-sync', {
            method: 'POST',
            headers: {
                'x-admin-token': 'unit-test-token',
            },
        }) as never);
        await postResponse.json();

        expect(state.readmeImported).toBe(1);
    });

    it('does not import prompt data services until the prompts page is rendered', async () => {
        const state = {
            promptServiceImported: 0,
            getPagedPrompts: vi.fn().mockResolvedValue({
                items: [],
                totalCount: 0,
                page: 1,
                pageSize: 20,
                totalPages: 0,
            }),
        };

        vi.doMock('@/lib/services/prompt-service', () => {
            state.promptServiceImported += 1;
            return {
                getPagedPrompts: state.getPagedPrompts,
            };
        });

        const pageModule = await import('@/app/ai/prompts/page');

        expect(state.promptServiceImported).toBe(0);

        await pageModule.default({
            searchParams: Promise.resolve({}),
        });

        expect(state.promptServiceImported).toBe(1);
        expect(state.getPagedPrompts).toHaveBeenCalledTimes(1);
    });
});
