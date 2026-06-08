import {
    createEmptyMonitoringPayload,
    createMonitoringJobSnapshot,
    type MonitoringJobSnapshot,
    type MonitoringLogEntry,
    type MonitoringPayload,
    type MonitoringRunStatus,
} from '@/lib/monitoring/status-types';
import { query } from '@/lib/db';
import { getSchedulerStatus } from '@/lib/jobs/scheduler';
import { getSiteBrandConfig } from '@/lib/site-config';

interface HealthSnapshotInput {
    status: string;
    timestamp: string;
    version: string;
    database: { status: string; prompts: number };
    articleSources: { status: string; articles: number };
}

interface JobLogRow {
    Source: string;
    Message: string;
    Detail: string | null;
    CreatedAt: string;
}

interface DailyJobRow {
    Source: string;
    Message: string;
    Detail: string | null;
    CreatedAt: string;
}

interface SystemLogRow {
    Level: 'warn' | 'error';
    Source: string;
    Message: string;
    Detail: string | null;
    CreatedAt: string;
}

interface PersistedJobDetail {
    jobKey?: string;
    startedAt?: string;
    finishedAt?: string;
    status?: unknown;
    [key: string]: unknown;
}

const JOB_SOURCE_MAP = {
    PromptSyncJob: 'promptSync',
    RankingSyncJob: 'rankingSync',
    AgentIndexSyncJob: 'agentIndex',
} as const;

const JOB_NAME_MAP: Record<string, string> = {
    '提示词同步': 'promptSync',
    '排行榜同步': 'rankingSync',
    'Agent 索引同步': 'agentIndex',
};

function parseJobDetail(detail: string | null): PersistedJobDetail | null {
    if (!detail) return null;
    try {
        return JSON.parse(detail) as PersistedJobDetail;
    } catch {
        return null;
    }
}

function flattenSummary(detail: PersistedJobDetail | null): Record<string, number | string | boolean | null> | null {
    if (!detail) return null;

    const summaryEntries = Object.entries(detail).filter(([key]) => (
        key !== 'jobKey' &&
        key !== 'startedAt' &&
        key !== 'finishedAt' &&
        key !== 'status' &&
        key !== 'error'
    ));

    if (summaryEntries.length === 0) return null;

    return Object.fromEntries(summaryEntries.map(([key, value]) => [key, normalizeSummaryValue(value)]));
}

function normalizeSummaryValue(value: unknown): number | string | boolean | null {
    if (value === null || value === undefined) return null;
    if (typeof value === 'number' || typeof value === 'string' || typeof value === 'boolean') return value;
    return JSON.stringify(value);
}

function normalizeRunStatus(value: unknown, fallback: MonitoringRunStatus = 'none'): MonitoringRunStatus {
    if (value === 'success' || value === 'warning' || value === 'error') return value;
    return fallback;
}

function calculateDurationMs(startedAt: string | null | undefined, finishedAt: string | null | undefined): number | null {
    if (!startedAt || !finishedAt) return null;

    const started = new Date(startedAt).getTime();
    const finished = new Date(finishedAt).getTime();
    if (!Number.isFinite(started) || !Number.isFinite(finished)) return null;

    const duration = finished - started;
    return duration >= 0 ? duration : null;
}

function getTodayStart(): string {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return start.toISOString().slice(0, 19).replace('T', ' ');
}

function applySchedulerState(payload: MonitoringPayload): Map<string, MonitoringJobSnapshot> {
    const scheduler = getSchedulerStatus();
    const jobs = scheduler.jobs.map((job) => createMonitoringJobSnapshot({
        key: JOB_NAME_MAP[job.name] ?? job.name,
        name: job.name,
        interval: job.interval,
        locked: job.locked,
    }));

    payload.scheduler = {
        running: scheduler.running,
        registeredJobCount: jobs.length,
        runningJobCount: jobs.filter((job) => job.locked).length,
        updatedAt: new Date().toISOString(),
    };
    payload.jobs = jobs;

    return new Map(jobs.map((job) => [job.key, job]));
}

function isLocalDevelopmentNoiseLog(log: MonitoringLogEntry): boolean {
    return process.env.NODE_ENV !== 'production'
        && Boolean(process.env.SITE_URL?.includes('zgnknowledge.online'))
        && log.source === 'Scheduler'
        && log.level === 'warn'
        && log.message.startsWith('统一重验证失败: HTTP 403');
}

function applyLatestJobRows(jobMap: Map<string, MonitoringJobSnapshot>, rows: JobLogRow[]): void {
    for (const row of rows) {
        const key = JOB_SOURCE_MAP[row.Source as keyof typeof JOB_SOURCE_MAP];
        if (!key) continue;

        const snapshot = jobMap.get(key);
        if (!snapshot || snapshot.latestRun.status !== 'none') continue;

        const detail = parseJobDetail(row.Detail);
        const startedAt = detail?.startedAt ?? null;
        const finishedAt = detail?.finishedAt ?? row.CreatedAt ?? null;
        snapshot.latestRun = {
            status: snapshot.locked ? 'running' : normalizeRunStatus(detail?.status, 'success'),
            startedAt,
            finishedAt,
            durationMs: calculateDurationMs(startedAt, finishedAt),
            message: row.Message,
            summary: flattenSummary(detail),
            error: typeof detail?.error === 'string' ? detail.error : null,
        };
    }
}

function applyDailyJobRows(jobMap: Map<string, MonitoringJobSnapshot>, rows: DailyJobRow[]): void {
    for (const row of rows) {
        const key = JOB_SOURCE_MAP[row.Source as keyof typeof JOB_SOURCE_MAP];
        if (!key) continue;

        const snapshot = jobMap.get(key);
        if (!snapshot) continue;

        const detail = parseJobDetail(row.Detail);
        const status = normalizeRunStatus(detail?.status, 'success');
        snapshot.today.totalRuns += 1;
        if (status === 'success') snapshot.today.successRuns += 1;
        if (status === 'warning') snapshot.today.warningRuns += 1;
        if (status === 'error') {
            snapshot.today.errorRuns += 1;
            if (!snapshot.today.lastErrorAt) {
                snapshot.today.lastErrorAt = row.CreatedAt;
                snapshot.today.lastErrorMessage = row.Message;
            }
        }
    }
}

async function loadRecentLogs(limit: number = 10): Promise<MonitoringLogEntry[]> {
    try {
        const rows = await query<SystemLogRow>(
            `SELECT Level, Source, Message, Detail, CreatedAt
             FROM SystemLogs
             WHERE Level IN ('warn', 'error')
             ORDER BY CreatedAt DESC
             LIMIT ?`,
            [limit],
        );

        return rows.map((row) => ({
            level: row.Level,
            source: row.Source,
            message: row.Message,
            detail: row.Detail,
            createdAt: row.CreatedAt,
        })).filter((row) => !isLocalDevelopmentNoiseLog(row));
    } catch {
        return [];
    }
}

async function loadRecentJobRows(): Promise<JobLogRow[]> {
    try {
        return await query<JobLogRow>(
            `SELECT Source, Message, Detail, CreatedAt
             FROM SystemLogs
             WHERE Level = 'info'
               AND Source IN ('PromptSyncJob', 'RankingSyncJob', 'AgentIndexSyncJob')
             ORDER BY CreatedAt DESC`,
        );
    } catch {
        return [];
    }
}

async function loadTodayJobRows(): Promise<DailyJobRow[]> {
    try {
        return await query<DailyJobRow>(
            `SELECT Source, Message, Detail, CreatedAt
             FROM SystemLogs
             WHERE Level = 'info'
               AND Source IN ('PromptSyncJob', 'RankingSyncJob', 'AgentIndexSyncJob')
               AND CreatedAt >= ?
             ORDER BY CreatedAt DESC`,
            [getTodayStart()],
        );
    } catch {
        return [];
    }
}

export async function getMonitoringStatus(input: {
    health: HealthSnapshotInput;
}): Promise<MonitoringPayload> {
    const payload = createEmptyMonitoringPayload();
    const siteConfig = getSiteBrandConfig();

    payload.service = {
        status: input.health.status,
        timestamp: input.health.timestamp,
        serviceName: siteConfig.serviceName,
        version: input.health.version,
        databaseStatus: input.health.database.status,
        articleSourceStatus: input.health.articleSources.status,
    };

    const jobMap = applySchedulerState(payload);

    const [logs, latestJobRows, todayJobRows] = await Promise.all([
        loadRecentLogs(),
        loadRecentJobRows(),
        loadTodayJobRows(),
    ]);

    payload.logs = logs;
    applyLatestJobRows(jobMap, latestJobRows);
    applyDailyJobRows(jobMap, todayJobRows);

    return payload;
}
