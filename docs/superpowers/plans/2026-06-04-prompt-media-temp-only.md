# Prompt Media Temp-Only Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove persistent local media storage from the prompt media pipeline so downloads, processing, and previews use temporary files only, and any R2 upload failure abandons that media item.

**Architecture:** Keep MySQL as the source of truth for prompt metadata and keep R2 as the only durable media store. Media downloads and derived files should live in per-operation temp directories, be uploaded to R2 immediately after processing, and then be deleted. The sync path should treat any media upload failure as a hard miss for that media field instead of falling back to local URLs or persistent disk.

**Tech Stack:** TypeScript, Next.js App Router, Vitest, Node `fs/promises`, `os.tmpdir()`, existing R2 S3 client, existing media processor helpers.

---

### Task 1: Refactor media pipeline to temp-only

**Files:**
- Modify: `lib/pipelines/media-pipeline.ts`
- Test: `tests/unit/media-pipeline.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
it('cleans up temp files after successful R2 upload', async () => {
    // verify the temp directory is removed after upload
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/unit/media-pipeline.test.ts -v`
Expected: fail because the pipeline still depends on persistent media dirs.

- [ ] **Step 3: Write minimal implementation**

Use `fs.mkdtemp(path.join(os.tmpdir(), 'prompt-media-'))` for each operation, process files there, upload directly to R2, and remove temp dirs in `finally` blocks. Return `null` or throw on failure paths that should abort downstream sync.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/unit/media-pipeline.test.ts -v`
Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add lib/pipelines/media-pipeline.ts tests/unit/media-pipeline.test.ts
git commit -m "fix: make prompt media pipeline temp-only"
```

### Task 2: Abort prompt sync on media upload failure

**Files:**
- Modify: `lib/pipelines/prompt-sources/remote-sync.ts`
- Test: `tests/unit/prompt-source-remote-sync.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
it('skips a prompt when required media cannot be uploaded to R2', async () => {
    // verify no row is inserted or updated when media upload fails
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/unit/prompt-source-remote-sync.test.ts -v`
Expected: fail because the sync path still allows local fallback behavior.

- [ ] **Step 3: Write minimal implementation**

Treat any failed media fetch/process/upload as a skipped prompt for required media fields, and only persist URLs that are already public R2 URLs. Remove `keepLocal` and local path assumptions from the sync flow.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/unit/prompt-source-remote-sync.test.ts -v`
Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add lib/pipelines/prompt-sources/remote-sync.ts tests/unit/prompt-source-remote-sync.test.ts
git commit -m "fix: stop prompt sync from falling back to local media"
```

### Task 3: Remove persistent media config and update docs

**Files:**
- Modify: `.env.example`
- Modify: `.env.local`
- Modify: `docs/运维/R2提示词媒体迁移与修复.md`
- Modify: `docs/运维/Mockingbird_web部署与迁移指南.md`

- [ ] **Step 1: Write the failing test**

```ts
// no new runtime config should reference a persistent prompt media directory
```

- [ ] **Step 2: Run the relevant verification**

Run: `rg -n "CONTENT_PROMPTS_MEDIA_DIR|PROMPT_MEDIA_LOCAL_FALLBACK_DIR|data/prompts/media|public/content/prompts/media" .`
Expected: only historical references in archived notes, not active config.

- [ ] **Step 3: Write minimal implementation**

Remove the active prompt media directory defaults from environment samples and update the docs so the workflow is temp-only and R2-backed.

- [ ] **Step 4: Run verification**

Run: `rg -n "CONTENT_PROMPTS_MEDIA_DIR|PROMPT_MEDIA_LOCAL_FALLBACK_DIR|data/prompts/media|public/content/prompts/media" .`
Expected: no active runtime references remain.

- [ ] **Step 5: Commit**

```bash
git add .env.example .env.local docs/运维/R2提示词媒体迁移与修复.md docs/运维/Mockingbird_web部署与迁移指南.md
git commit -m "docs: remove persistent prompt media directory guidance"
```

### Task 4: Verify the full media path

**Files:**
- Test: `tests/unit/media-pipeline.test.ts`
- Test: `tests/unit/prompt-source-remote-sync.test.ts`

- [ ] **Step 1: Run the focused test files**

Run: `npm test -- tests/unit/media-pipeline.test.ts tests/unit/prompt-source-remote-sync.test.ts -v`
Expected: pass.

- [ ] **Step 2: Run the build**

Run: `npm run build`
Expected: production build succeeds.

- [ ] **Step 3: Commit**

```bash
git add .
git commit -m "fix: make prompt media flow temp-only and r2-backed"
```
