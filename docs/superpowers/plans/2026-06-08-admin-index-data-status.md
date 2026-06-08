# Admin Index Data Status Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add concrete search/index/vector data status to `/ai/admin/status` without reviving the rejected “索引闭环” dashboard language.

**Architecture:** Keep Job monitoring as the primary page structure. Extend the monitoring payload with an `indexStatus` snapshot sourced from the existing coverage script, then render it as a compact supporting section under the Job ledger.

**Tech Stack:** Next.js App Router, TypeScript, Vitest, existing theme CSS variables.

---

### Task 1: Lock The Payload Shape

**Files:**
- Modify: `tests/unit/status-service.test.ts`
- Modify: `tests/unit/admin-status-route.test.ts`

- [ ] Add failing expectations that `getMonitoringStatus` accepts and returns `indexStatus`.
- [ ] Add failing expectations that `/api/admin/status` loads the index snapshot and passes it into the service.
- [ ] Run: `npm test -- tests/unit/status-service.test.ts tests/unit/admin-status-route.test.ts`
- [ ] Expected: tests fail because `indexStatus` is not wired.

### Task 2: Implement Index Snapshot Types And API Wiring

**Files:**
- Modify: `lib/monitoring/status-types.ts`
- Modify: `lib/monitoring/coverage-service.ts`
- Modify: `lib/monitoring/status-service.ts`
- Modify: `app/api/admin/status/route.ts`

- [ ] Add `MonitoringIndexStatus` with prompt, article, embedding, and vector counts.
- [ ] Normalize the existing coverage report into those concrete fields.
- [ ] Pass `indexStatus` through `getMonitoringStatus`.
- [ ] Run: `npm test -- tests/unit/status-service.test.ts tests/unit/admin-status-route.test.ts`
- [ ] Expected: tests pass.

### Task 3: Render The Admin Section

**Files:**
- Modify: `tests/unit/admin-status-page.test.ts`
- Modify: `app/ai/admin/status/page.tsx`
- Modify: `app/_styles/admin-status.css`

- [ ] Add failing page expectations for “索引数据状态”, source/index/pending counts, embedding counts, vector points, and no “索引闭环”.
- [ ] Render the section below the Job ledger.
- [ ] Style it with existing `--theme-*` variables and compact table/card layout.
- [ ] Run: `npm test -- tests/unit/admin-status-page.test.ts`
- [ ] Expected: tests pass.

### Task 4: Verify

**Files:**
- No source edits expected.

- [ ] Run targeted tests for status service, route, and page.
- [ ] Run `npm run lint`.
- [ ] Run `npm run build`.
- [ ] Open `/ai/admin/status` in the in-app browser and visually check the section.
