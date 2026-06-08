import { cookies } from 'next/headers';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { getHealthSnapshot } from '@/app/api/health/route';
import { getMonitoringStatus } from '@/lib/monitoring/status-service';
import { isValidAdminToken } from '@/lib/utils/admin-auth';

function isLocalDevelopmentHost(host: string): boolean {
    return /^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/i.test(host.trim());
}

function renderServiceStateLabel(value: string): string {
    switch (value) {
        case 'healthy':
            return '健康';
        case 'degraded':
            return '降级';
        default:
            return value || '未知';
    }
}

function renderRunStatusLabel(status: string): string {
    switch (status) {
        case 'success':
            return '最近成功';
        case 'warning':
            return '最近告警';
        case 'error':
            return '最近失败';
        case 'running':
            return '正在执行';
        case 'none':
            return '本次启动后尚无记录';
        default:
            return '本次启动后尚无记录';
    }
}

function renderCurrentLabel(locked: boolean): string {
    return locked ? '正在执行' : '空闲';
}

function renderIntervalLabel(cron: string): string {
    switch (cron) {
        case '30 0 */2 * * *':
            return '每 2 小时，整点后 30 秒';
        case '0 */2 * * *':
            return '每 2 小时，整点';
        case '0 15 */2 * * *':
            return '每 2 小时，第 15 分钟';
        default:
            return cron || '-';
    }
}

function formatDuration(durationMs: number | null): string {
    if (durationMs === null) return '-';
    if (durationMs < 1000) return `${durationMs}ms`;
    return `${(durationMs / 1000).toFixed(1)}s`;
}

function formatDateTime(value: string | null): string {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString('zh-CN', {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
    });
}

function renderLatestRun(job: { latestRun: { status: string; finishedAt: string | null; startedAt: string | null } }): string {
    const label = renderRunStatusLabel(job.latestRun.status);
    const time = formatDateTime(job.latestRun.finishedAt ?? job.latestRun.startedAt);
    return time ? `${label} ${time}` : label;
}

function renderTodaySummary(today: { totalRuns: number; successRuns: number; warningRuns: number; errorRuns: number }): string {
    return `今天 ${today.totalRuns} 次 / 成功 ${today.successRuns} / 告警 ${today.warningRuns} / 失败 ${today.errorRuns}`;
}

function renderSummary(
    summary: Record<string, number | string | boolean | null> | null,
    message: string | null,
    error: string | null,
): string {
    if (error) return `失败：${error}`;
    if (summary && Object.keys(summary).length > 0) {
        return Object.entries(summary)
            .map(([key, value]) => `${key}: ${value ?? '-'}`)
            .join('，');
    }
    return message ?? '本次启动后尚无记录';
}

function renderMetric(label: string, value: string | number | null | undefined) {
    return (
        <div className="admin-status__metric" key={label}>
            <dt>{label}</dt>
            <dd>{value ?? 'n/a'}</dd>
        </div>
    );
}

export default async function AdminStatusPage() {
    const cookieStore = await cookies();
    const headerStore = await headers();
    const adminToken = cookieStore.get('admin_token')?.value;
    const requestHost = headerStore.get('x-forwarded-host') || headerStore.get('host') || '';
    const allowLocalDevelopmentAccess = process.env.NODE_ENV !== 'production' && isLocalDevelopmentHost(requestHost);
    if (!allowLocalDevelopmentAccess && !isValidAdminToken(adminToken)) {
        notFound();
    }

    const health = await getHealthSnapshot();
    const status = await getMonitoringStatus({ health });
    const hasJobFailures = status.jobs.some((job) => job.latestRun.status === 'error' || job.today.errorRuns > 0);
    const topState = !status.scheduler.running ? 'error' : hasJobFailures ? 'warning' : 'success';
    const topLabel = !status.scheduler.running ? '定时器未启动' : hasJobFailures ? '有 job 需要关注' : '定时器运行中';
    const totalRunsToday = status.jobs.reduce((sum, job) => sum + job.today.totalRuns, 0);
    const latestProblem = status.jobs.find((job) => job.latestRun.status === 'error' || job.today.errorRuns > 0);
    const headline = !status.scheduler.running
        ? '定时器未启动，自动同步不会执行。'
        : latestProblem
            ? `${status.scheduler.registeredJobCount} 个定时任务已注册，今天共执行 ${totalRunsToday} 次，最近的问题来自 ${latestProblem.name}。`
            : `${status.scheduler.registeredJobCount} 个定时任务已注册，今天共执行 ${totalRunsToday} 次，暂无失败记录。`;

    return (
        <main className="admin-status">
            <header className="admin-status__header">
                <p className="admin-status__eyebrow">Internal Ops</p>
                <div className="admin-status__title-row">
                    <div>
                        <h1>Job 运行监控</h1>
                        <p className="admin-status__summary">{headline}</p>
                    </div>
                    <span className={`admin-status__status is-${topState}`}>{topLabel}</span>
                </div>
            </header>

            <section className="admin-status__strip" aria-label="Scheduler summary">
                {renderMetric('定时器', status.scheduler.running ? '运行中' : '未启动')}
                {renderMetric('已注册 Job', status.scheduler.registeredJobCount)}
                {renderMetric('正在执行', status.scheduler.runningJobCount)}
                {renderMetric('更新时间', formatDateTime(status.scheduler.updatedAt))}
            </section>

            <section className="admin-status__section">
                <div className="admin-status__section-heading">
                    <h2>Job 台账</h2>
                    <p>只看定时任务是否正常执行，以及今天执行了多少。</p>
                </div>
                <div className="admin-status__table-wrap">
                    <table className="admin-status__table">
                        <colgroup>
                            <col className="admin-status__col-job" />
                            <col className="admin-status__col-interval" />
                            <col className="admin-status__col-current" />
                            <col className="admin-status__col-latest" />
                            <col className="admin-status__col-duration" />
                            <col className="admin-status__col-today" />
                            <col className="admin-status__col-summary" />
                        </colgroup>
                        <thead>
                            <tr>
                                <th>Job</th>
                                <th>间隔</th>
                                <th>当前</th>
                                <th>最近一次</th>
                                <th>耗时</th>
                                <th>今天</th>
                                <th>摘要</th>
                            </tr>
                        </thead>
                        <tbody>
                            {status.jobs.map((job) => (
                                <tr key={job.key}>
                                    <td>{job.name}</td>
                                    <td>
                                        <span className="admin-status__interval-label">{renderIntervalLabel(job.interval)}</span>
                                        {job.interval ? (
                                            <code className="admin-status__interval-cron">{`cron: ${job.interval}`}</code>
                                        ) : null}
                                    </td>
                                    <td><span className={`admin-status__pill is-${job.locked ? 'running' : 'idle'}`}>{renderCurrentLabel(job.locked)}</span></td>
                                    <td><span className={`admin-status__pill is-${job.latestRun.status}`}>{renderLatestRun(job)}</span></td>
                                    <td>{formatDuration(job.latestRun.durationMs)}</td>
                                    <td>{renderTodaySummary(job.today)}</td>
                                    <td>{renderSummary(job.latestRun.summary, job.latestRun.message, job.latestRun.error)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </section>

            <section className="admin-status__two-column">
                <article className="admin-status__section">
                    <div className="admin-status__section-heading">
                        <h2>最近错误</h2>
                        <p>warn/error 日志只作为排查证据。</p>
                    </div>
                    {status.logReadError ? (
                        <p className="admin-status__empty">无法读取 job 历史记录</p>
                    ) : status.logs.length === 0 ? (
                        <p className="admin-status__empty">最近没有 warn/error 日志。</p>
                    ) : (
                        <div className="admin-status__logs">
                            {status.logs.map((log) => (
                                <div className="admin-status__log" key={`${log.createdAt}-${log.source}-${log.message}`}>
                                    <span>{formatDateTime(log.createdAt)}</span>
                                    <strong>{log.level}</strong>
                                    <span>{log.source}</span>
                                    <p>{log.message}</p>
                                </div>
                            ))}
                        </div>
                    )}
                </article>

                <article className="admin-status__section">
                    <div className="admin-status__section-heading">
                        <h2>服务健康</h2>
                        <p>支撑信息，不参与 job 台账排序。</p>
                    </div>
                    <dl className="admin-status__health">
                        {renderMetric('服务', status.service.serviceName)}
                        {renderMetric('整体', renderServiceStateLabel(status.service.status))}
                        {renderMetric('数据库', status.service.databaseStatus)}
                        {renderMetric('文章源', status.service.articleSourceStatus)}
                        {renderMetric('版本', status.service.version)}
                        {renderMetric('检测时间', formatDateTime(status.service.timestamp))}
                    </dl>
                </article>
            </section>
        </main>
    );
}
