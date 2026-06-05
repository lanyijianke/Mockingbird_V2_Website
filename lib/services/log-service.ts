import { execute } from '@/lib/db';

// ════════════════════════════════════════════════════════════════
// 持久化日志服务 — 写入 MySQL SystemLogs 表
// 供 logger.ts 自动调用（warn/error 级别）及各模块显式调用
// ════════════════════════════════════════════════════════════════

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/**
 * 写入一条日志到 SystemLogs 表
 */
export async function writeLog(
    level: LogLevel,
    source: string,
    message: string,
    detail?: string | null
): Promise<void> {
    try {
        await execute(
            `INSERT INTO SystemLogs (Level, Source, Message, Detail, CreatedAt)
             VALUES (?, ?, ?, ?, NOW())`,
            [level, source, message, detail ?? null]
        );
    } catch {
        // 日志写入自身不应抛出异常导致业务中断
        console.error('[LogService] 日志写入失败');
    }
}

/**
 * 将 Error 对象序列化为可存储的 detail 字符串
 */
export function serializeError(err: unknown): string {
    if (err instanceof Error) {
        return err.stack || err.message;
    }
    if (typeof err === 'string') {
        return err;
    }
    try {
        return JSON.stringify(err);
    } catch {
        return String(err);
    }
}
