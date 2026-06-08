# Admin Status Job Monitoring Redesign

## Goal

Redesign `/ai/admin/status` into an internal job monitoring page.

The page should answer the operator's real questions:

- Is the scheduler running?
- Which scheduled jobs are registered?
- Did each job run recently?
- How many times did each job run today?
- How many succeeded, warned, or failed?
- What happened in the latest run?
- What recent errors need attention?

This page should not present "index loop", "coverage loop", or "source/index/vector closure" as product concepts. Those are implementation details. If index-related counts are useful, they should appear only as the execution summary of the relevant job, such as `Agent 索引同步`.

## Product Direction

The page is an internal operations ledger, not a public dashboard.

The first screen should be practical and dense enough to scan:

1. A top status strip that says whether the scheduler and jobs are currently healthy.
2. A job table showing one row per scheduled job.
3. A recent-log section showing warn/error evidence only after the job view.

The page should prefer plain operational language:

- `定时器运行中`
- `定时器未启动`
- `最近成功`
- `最近失败`
- `今天尚未运行`
- `正在执行`
- `本次启动后尚无记录`

Avoid raw implementation words in the primary UI:

- Do not show `UNKNOWN` as user-facing text.
- Do not show "索引闭环".
- Do not expose `coverage gap` as a first-class module.
- Do not use uppercase SaaS-style badges.

## Visual Design

The status page must inherit the existing site theme.

Use the existing global tokens from `app/globals.css`:

- `--theme-bg`
- `--theme-surface`
- `--theme-surface-soft`
- `--theme-border`
- `--theme-border-strong`
- `--theme-text`
- `--theme-text-muted`
- `--theme-text-soft`
- `--theme-accent`
- `--theme-accent-soft`
- `--theme-accent-border`
- `--theme-shadow-soft`

The page should work in both `html[data-theme='dark']` and `html[data-theme='light']`.

Feature CSS may define local semantic variables for status tone, but they must be derived from the theme tokens with `color-mix()` or existing tokens. The page should not introduce a separate blue/gray dashboard palette.

Layout direction:

- Use a restrained internal tool layout.
- Prefer tables and compact rows over large decorative cards.
- Use small status markers and text labels.
- Keep radius consistent with the site, around `var(--radius-md)`.
- Avoid large gradients, decorative hero treatments, and generic SaaS dashboard styling.

## Data Model

Keep `/api/admin/status` as a read-only aggregation API. Keep `/api/jobs` responsible for control and manual triggering.

Update the monitoring payload around scheduler and job execution:

```ts
interface MonitoringPayload {
    service: ServiceSnapshot;
    scheduler: SchedulerSnapshot;
    jobs: JobMonitorSnapshot[];
    logs: MonitoringLogEntry[];
}
```

`SchedulerSnapshot` should include:

- `running`
- `registeredJobCount`
- `runningJobCount`
- `updatedAt`

`JobMonitorSnapshot` should include:

- `key`
- `name`
- `interval`
- `locked`
- `latestRun`
- `today`

`latestRun` should include:

- `status`: `success | warning | error | running | none`
- `startedAt`
- `finishedAt`
- `durationMs`
- `message`
- `summary`
- `error`

`today` should include:

- `totalRuns`
- `successRuns`
- `warningRuns`
- `errorRuns`
- `lastErrorAt`
- `lastErrorMessage`

The service may still read existing `SystemLogs.Detail` JSON from structured job run summaries. It should derive today's counts from persisted scheduler/job log rows for the local day.

## Page Content

### Header Strip

Show a single operational conclusion:

- `定时器运行中`
- `有 job 需要关注`
- `定时器未启动`

Below it, show a short sentence:

- `3 个定时任务已注册，今天共执行 18 次，最近一次失败来自 Agent 索引同步。`
- `定时器已启动，今天暂无失败记录。`
- `定时器未启动，自动同步不会执行。`

### Job Table

Columns:

- `Job`
- `间隔`
- `当前`
- `最近一次`
- `耗时`
- `今天`
- `摘要`

Row examples:

- `提示词同步 | 0 */6 * * * | 空闲 | 最近成功 19:04 | 3.2s | 4 次 / 4 成功 / 0 失败 | 新增 28，更新 10，跳过 108`
- `Agent 索引同步 | 15 */6 * * * | 正在执行 | 最近失败 18:42 | 41.8s | 3 次 / 2 成功 / 1 失败 | 失败：Embedding request timeout`
- `排行榜同步 | 0 */12 * * * | 空闲 | 今天尚未运行 | - | 0 次 | 本次启动后尚无记录`

### Recent Logs

Show recent warn/error logs as evidence, below the job table.

This section should be compact:

- timestamp
- level
- source
- message

Do not let logs dominate the first screen unless there is a current failure.

### Service Health

Keep service health as a small supporting block:

- database status
- article source status
- service version
- health timestamp

This block answers whether the app can read its backing services. It should not compete with job monitoring.

## Error Handling

If job summary logs cannot be read, the page should still render:

- scheduler state from memory
- service health
- a clear message: `无法读取 job 历史记录`

If no run record exists for a job, show:

- `本次启动后尚无记录` when the scheduler knows the job but no persisted run exists.
- `今天尚未运行` when historical data exists but no row exists for the current day.

If the scheduler is not running, make that the top-level warning because scheduled jobs will not execute automatically.

## Testing

Update tests around the new contract:

- `status-service.test.ts`: derives latest run, daily counts, scheduler summary, and human-safe empty states.
- `admin-status-route.test.ts`: returns the read-only aggregation payload and keeps admin protection.
- `admin-status-page.test.ts`: renders job table language and does not render `索引闭环`, `coverage gap`, or raw `UNKNOWN`.
- `scheduler.test.ts`: verifies structured summaries contain enough fields for latest run and daily counts.

Targeted verification after implementation:

```bash
npm test -- tests/unit/status-service.test.ts tests/unit/admin-status-route.test.ts tests/unit/admin-status-page.test.ts tests/unit/scheduler.test.ts
npm run lint
```

`npm run build` should be attempted, but existing environment-dependent MySQL build issues may need to be reported separately if they are not caused by this redesign.

## Out Of Scope

- Public navigation entry.
- Manual job control UI.
- New charting library.
- External alerting.
- Rebranding the site's light/dark theme.
- Presenting source/index/vector closure as a first-class status concept.
