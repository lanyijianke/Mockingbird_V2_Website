import cron from 'node-cron';
import { buildInternalUrl } from '@/lib/site-config';
import type { ContentRevalidationEvent } from '@/lib/cache/content-revalidation';
import { runAgentIndexJob } from '@/lib/jobs/agent-index-job';
import { syncAllAsync as promptSourceSync } from '@/lib/pipelines/prompt-readme-sync';
import { logger } from '@/lib/utils/logger';

// ════════════════════════════════════════════════════════════════
// 统一 node-cron 调度器 — 替代 Knowledge 的 Quartz Jobs
//
// 调度策略：
//   PromptSyncJob        → 每 2 小时  (README/source 提示词同步)
//   RankingSyncJob       → 每 2 小时  (重验证并预热榜单 ISR 页面)
//   AgentIndexSyncJob    → 每 2 小时  (补齐 Agent MySQL 索引与 Qdrant 向量)
//
// 通过 instrumentation.ts 在服务端进程启动时自动调用 startScheduler()。
// ════════════════════════════════════════════════════════════════

const JOB_INTERVALS = {
    promptSync: process.env.JOB_PROMPT_SYNC_CRON || '30 0 */2 * * *',       // 每 2 小时的第 30 秒
    rankingSync: process.env.JOB_RANKING_SYNC_CRON || '0 */2 * * *',        // 每 2 小时
    agentIndexSync: process.env.JOB_AGENT_INDEX_CRON || '0 15 */2 * * *',   // 每 2 小时的第 15 分钟
};

interface SchedulerGlobalState {
    isRunning: boolean;
    tasks: ReturnType<typeof cron.schedule>[];
    locks: Record<string, boolean>;
}

const schedulerStateKey = Symbol.for('mockingbird.knowledge.schedulerState');
const globalWithScheduler = globalThis as typeof globalThis & {
    [schedulerStateKey]?: SchedulerGlobalState;
};

const schedulerState = globalWithScheduler[schedulerStateKey] ??= {
    isRunning: false,
    tasks: [],
    locks: {},
};

type PersistedJobStatus = 'success' | 'warning' | 'error';

function persistJobSnapshot(
    source: string,
    message: string,
    payload: Record<string, unknown>
): void {
    logger.persist(source, message, JSON.stringify(payload));
}

function persistJobOutcome(input: {
    source: string;
    jobKey: string;
    startedAt: string;
    status: PersistedJobStatus;
    message: string;
    summary?: Record<string, unknown>;
}): void {
    persistJobSnapshot(input.source, input.message, {
        jobKey: input.jobKey,
        startedAt: input.startedAt,
        finishedAt: new Date().toISOString(),
        status: input.status,
        ...(input.summary ? input.summary : {}),
    });
}

async function runWithLock(name: string, fn: () => Promise<void>): Promise<void> {
    if (schedulerState.locks[name]) {
        logger.debug('Scheduler', `${name} 尚在运行中，跳过`);
        return;
    }
    schedulerState.locks[name] = true;
    try {
        await fn();
    } catch (err) {
        logger.error('Scheduler', `${name} 执行异常`, err);
    } finally {
        schedulerState.locks[name] = false;
    }
}

function getAdminToken(): string {
    return process.env.KNOWLEDGE_ADMIN_TOKEN || process.env.ADMIN_API_TOKEN || '';
}

async function requestContentRevalidation(event: ContentRevalidationEvent): Promise<boolean> {
    const adminToken = getAdminToken();
    if (!adminToken) {
        logger.warn('Scheduler', '未配置管理 token，跳过统一重验证请求');
        return false;
    }

    const response = await fetch(buildInternalUrl('/api/revalidate/content'), {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
            'x-admin-token': adminToken,
        },
        body: JSON.stringify(event),
    });

    if (!response.ok) {
        logger.warn('Scheduler', `统一重验证失败: HTTP ${response.status}`);
        return false;
    }

    return true;
}

async function revalidateAndWarmRankings(): Promise<void> {
    const startedAt = new Date().toISOString();
    logger.info('RankingSyncJob', '🔄 开始重验证榜单静态页面...');
    await requestContentRevalidation({
        type: 'rankings',
        action: 'refresh',
        kind: 'all',
    });
    const message = '✅ 执行完毕';
    logger.info('RankingSyncJob', message);
    persistJobOutcome({
        source: 'RankingSyncJob',
        jobKey: 'ranking-sync',
        startedAt,
        status: 'success',
        message,
        summary: {
            revalidation: {
                type: 'rankings',
                action: 'refresh',
                kind: 'all',
            },
        },
    });
}

export function startScheduler(): void {
    if (schedulerState.isRunning) {
        logger.info('Scheduler', '调度器已在运行');
        return;
    }

    logger.persist('Scheduler', '📅 Knowledge 定时任务调度器启动');
    logger.info('Scheduler', '══════════════════════════════════════');

    // ─── 提示词同步任务 ───
    const promptTask = cron.schedule(JOB_INTERVALS.promptSync, async () => {
        await runWithLock('PromptSync', async () => {
            logger.info('PromptSyncJob', '🔄 开始执行...');
            const startedAt = new Date().toISOString();

            try {
                const sourceReport = await promptSourceSync();
                const message = `Sources: 解析 ${sourceReport.totalParsed}, 新增 ${sourceReport.newlyAdded}, 更新 ${sourceReport.updated}, 跳过 ${sourceReport.skipped}`;
                if (sourceReport.newlyAdded > 0 || sourceReport.updated > 0) {
                    await requestContentRevalidation({ type: 'prompt', action: 'sync' });
                }
                persistJobOutcome({
                    source: 'PromptSyncJob',
                    jobKey: 'prompt-sync',
                    startedAt,
                    status: 'success',
                    message,
                    summary: {
                        sources: sourceReport,
                    },
                });
            } catch (err) {
                logger.error('PromptSyncJob', 'Source 同步失败:', err);
                persistJobOutcome({
                    source: 'PromptSyncJob',
                    jobKey: 'prompt-sync',
                    startedAt,
                    status: 'error',
                    message: 'Source 同步失败:',
                    summary: {
                        error: String(err),
                    },
                });
            }
        });
    }, { scheduled: false } as Record<string, unknown>);

    // ─── 排行榜同步任务 ───
    const rankingTask = cron.schedule(JOB_INTERVALS.rankingSync, async () => {
        await runWithLock('RankingSync', async () => {
            await revalidateAndWarmRankings();
        });
    }, { scheduled: false } as Record<string, unknown>);

    // ─── Agent 搜索索引与向量同步任务 ───
    const agentIndexTask = cron.schedule(JOB_INTERVALS.agentIndexSync, async () => {
        await runWithLock('AgentIndexSync', async () => {
            logger.info('AgentIndexSyncJob', '🔄 开始执行...');
            const startedAt = new Date().toISOString();
            try {
                const report = await runAgentIndexJob();
                const message = `Prompts: 处理 ${report.prompts.processed}, indexed ${report.prompts.indexed}, skipped ${report.prompts.skipped}, failed ${report.prompts.failed}; Articles: 处理 ${report.articles.processed}, indexed ${report.articles.indexed}, skipped ${report.articles.skipped}, failed ${report.articles.failed}`;
                const level = report.success ? 'info' : 'warn';
                logger[level]('AgentIndexSyncJob', message);
                persistJobOutcome({
                    source: 'AgentIndexSyncJob',
                    jobKey: 'agent-index',
                    startedAt,
                    status: report.success ? 'success' : 'warning',
                    message,
                    summary: {
                        prompts: report.prompts,
                        articles: report.articles,
                    },
                });
            } catch (err) {
                logger.error('AgentIndexSyncJob', 'Agent 索引同步失败:', err);
                persistJobOutcome({
                    source: 'AgentIndexSyncJob',
                    jobKey: 'agent-index',
                    startedAt,
                    status: 'error',
                    message: 'Agent 索引同步失败:',
                    summary: {
                        error: String(err),
                    },
                });
            }
        });
    }, { scheduled: false } as Record<string, unknown>);

    // 启动定时任务
    promptTask.start();
    rankingTask.start();
    agentIndexTask.start();
    schedulerState.tasks.push(promptTask, rankingTask, agentIndexTask);
    schedulerState.isRunning = true;

    logger.info('Scheduler', `  📌 提示词同步:  ${JOB_INTERVALS.promptSync}`);
    logger.info('Scheduler', `  📌 排行榜同步:  ${JOB_INTERVALS.rankingSync}`);
    logger.info('Scheduler', `  📌 Agent 索引同步:  ${JOB_INTERVALS.agentIndexSync}`);
    logger.info('Scheduler', '══════════════════════════════════════');

    // 启动时预热榜单 ISR 页面（延迟 5 秒避免阻塞启动）。
    setTimeout(async () => {
        logger.info('Scheduler', '🚀 启动预热：刷新榜单静态页面...');
        await runWithLock('RankingSync', revalidateAndWarmRankings);
    }, 5000);
}

export function stopScheduler(): void {
    schedulerState.tasks.forEach(t => t.stop());
    schedulerState.tasks.length = 0;
    schedulerState.isRunning = false;
    logger.info('Scheduler', '调度器已停止');
}

export function isSchedulerRunning(): boolean {
    return schedulerState.isRunning;
}

export interface SchedulerStatus {
    running: boolean;
    jobs: Array<{ name: string; interval: string; locked: boolean }>;
}

export function getSchedulerStatus(): SchedulerStatus {
    return {
        running: schedulerState.isRunning,
        jobs: [
            { name: '提示词同步', interval: JOB_INTERVALS.promptSync, locked: !!schedulerState.locks['PromptSync'] },
            { name: '排行榜同步', interval: JOB_INTERVALS.rankingSync, locked: !!schedulerState.locks['RankingSync'] },
            { name: 'Agent 索引同步', interval: JOB_INTERVALS.agentIndexSync, locked: !!schedulerState.locks['AgentIndexSync'] },
        ],
    };
}
