export type MonitoringRunStatus = 'success' | 'warning' | 'error' | 'running' | 'none';

export interface MonitoringRunSnapshot {
    status: MonitoringRunStatus;
    startedAt: string | null;
    finishedAt: string | null;
    durationMs: number | null;
    message: string | null;
    summary: Record<string, number | string | boolean | null> | null;
    error: string | null;
}

export interface MonitoringTodaySnapshot {
    totalRuns: number;
    successRuns: number;
    warningRuns: number;
    errorRuns: number;
    lastErrorAt: string | null;
    lastErrorMessage: string | null;
}

export interface MonitoringJobSnapshot {
    key: string;
    name: string;
    interval: string;
    locked: boolean;
    latestRun: MonitoringRunSnapshot;
    today: MonitoringTodaySnapshot;
}

export interface MonitoringLogEntry {
    level: 'warn' | 'error';
    source: string;
    message: string;
    detail: string | null;
    createdAt: string;
}

export interface MonitoringIndexStatus {
    site: string;
    available: boolean;
    prompts: {
        sourceTotal: number | null;
        indexed: number | null;
        pending: number | null;
    };
    articles: {
        sourceTotal: number | null;
        indexed: number | null;
        pending: number | null;
    };
    embeddings: {
        semanticEnabled: boolean;
        totalChunks: number | null;
        embeddedChunks: number | null;
        promptDocumentsWithEmbeddings: number | null;
        articleDocumentsWithEmbeddings: number | null;
        promptDocumentsPending: number | null;
        articleDocumentsPending: number | null;
    };
    vectors: {
        promptPoints: number | null;
        articlePoints: number | null;
        totalPoints: number | null;
    };
}

export interface MonitoringPayload {
    service: {
        status: string;
        timestamp: string;
        serviceName: string;
        version: string;
        databaseStatus: string;
        articleSourceStatus: string;
    };
    scheduler: {
        running: boolean;
        registeredJobCount: number;
        runningJobCount: number;
        updatedAt: string;
    };
    jobs: MonitoringJobSnapshot[];
    logs: MonitoringLogEntry[];
    logReadError: string | null;
    indexStatus: MonitoringIndexStatus;
}

export function createEmptyRunSnapshot(): MonitoringRunSnapshot {
    return {
        status: 'none',
        startedAt: null,
        finishedAt: null,
        durationMs: null,
        message: null,
        summary: null,
        error: null,
    };
}

export function createEmptyTodaySnapshot(): MonitoringTodaySnapshot {
    return {
        totalRuns: 0,
        successRuns: 0,
        warningRuns: 0,
        errorRuns: 0,
        lastErrorAt: null,
        lastErrorMessage: null,
    };
}

export function createMonitoringJobSnapshot(input: {
    key: string;
    name: string;
    interval: string;
    locked: boolean;
}): MonitoringJobSnapshot {
    return {
        key: input.key,
        name: input.name,
        interval: input.interval,
        locked: input.locked,
        latestRun: createEmptyRunSnapshot(),
        today: createEmptyTodaySnapshot(),
    };
}

export function createEmptyIndexStatus(site: string = 'ai'): MonitoringIndexStatus {
    return {
        site,
        available: false,
        prompts: {
            sourceTotal: null,
            indexed: null,
            pending: null,
        },
        articles: {
            sourceTotal: null,
            indexed: null,
            pending: null,
        },
        embeddings: {
            semanticEnabled: false,
            totalChunks: null,
            embeddedChunks: null,
            promptDocumentsWithEmbeddings: null,
            articleDocumentsWithEmbeddings: null,
            promptDocumentsPending: null,
            articleDocumentsPending: null,
        },
        vectors: {
            promptPoints: null,
            articlePoints: null,
            totalPoints: null,
        },
    };
}

export function createEmptyMonitoringPayload(): MonitoringPayload {
    return {
        service: {
            status: 'unknown',
            timestamp: new Date(0).toISOString(),
            serviceName: 'unknown',
            version: 'unknown',
            databaseStatus: 'unknown',
            articleSourceStatus: 'unknown',
        },
        scheduler: {
            running: false,
            registeredJobCount: 0,
            runningJobCount: 0,
            updatedAt: new Date(0).toISOString(),
        },
        jobs: [],
        logs: [],
        logReadError: null,
        indexStatus: createEmptyIndexStatus(),
    };
}
