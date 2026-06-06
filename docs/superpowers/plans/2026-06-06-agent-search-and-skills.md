# Agent Search And Skills Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a keyword-search MVP for Agent-facing prompt/article discovery, trigger indexing from content workflows, and add a read-only external skill client.

**Architecture:** Add MySQL-backed Agent search document/chunk tables and focused services under `lib/services/agent-search-*`. Agent search reads only the index; article indexing reads R2/local markdown only during indexing. The existing internal handoff skill calls a protected index endpoint after publish, while the external skill calls only public read APIs.

**Tech Stack:** Next.js App Router route handlers, TypeScript, mysql2, Vitest, Node ESM skill scripts.

---

## File Structure

- Modify `lib/init-schema.ts`: create `AgentSearchDocuments` and `AgentSearchChunks` with indexes.
- Create `lib/services/agent-search-types.ts`: shared request/result/indexing types.
- Create `lib/services/agent-search-indexer.ts`: prompt/article indexing and text normalization.
- Create `lib/services/agent-search-service.ts`: index search, detail adapters, and validation helpers.
- Create `app/api/agent/search/route.ts`: public Agent search endpoint.
- Create `app/api/agent/prompts/[id]/route.ts`: public Agent prompt detail endpoint.
- Create `app/api/agent/articles/[slug]/route.ts`: public Agent article detail endpoint.
- Create `app/api/agent/index/route.ts`: protected index trigger endpoint.
- Modify `lib/pipelines/prompt-sources/remote-sync.ts`: trigger prompt index updates after prompt sync.
- Modify `/Users/grank/.codex/skills/console-knowledge-handoff/SKILL.md`: document post-publish indexing.
- Modify `/Users/grank/.codex/skills/console-knowledge-handoff/scripts/console-knowledge-handoff-core.mjs`: call index endpoint after revalidation.
- Create `/Users/grank/.codex/skills/mockingbird-knowledge/SKILL.md`: external read-only skill instructions.
- Create `/Users/grank/.codex/skills/mockingbird-knowledge/agents/openai.yaml`: skill UI metadata.
- Create `/Users/grank/.codex/skills/mockingbird-knowledge/references/api.md`: API contract.
- Create `/Users/grank/.codex/skills/mockingbird-knowledge/scripts/search.mjs`: search script.
- Create `/Users/grank/.codex/skills/mockingbird-knowledge/scripts/get-prompt.mjs`: prompt detail script.
- Create `/Users/grank/.codex/skills/mockingbird-knowledge/scripts/get-article.mjs`: article detail script.
- Create/update focused unit tests under `tests/unit/`.

## Task 1: Schema And Types

**Files:**
- Modify: `lib/init-schema.ts`
- Create: `lib/services/agent-search-types.ts`
- Test: `tests/unit/init-schema-agent-search.test.ts`

- [ ] **Step 1: Write failing schema tests**

Create `tests/unit/init-schema-agent-search.test.ts` with assertions that `initDatabase` creates both Agent search tables and the unique document key.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/unit/init-schema-agent-search.test.ts`

Expected: FAIL because `AgentSearchDocuments` does not exist.

- [ ] **Step 3: Add schema and shared types**

Update `lib/init-schema.ts` to create the new tables and indexes. Add `lib/services/agent-search-types.ts` with `AgentContentType`, `AgentSearchResultItem`, `AgentIndexRequest`, and `AgentIndexReport`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/unit/init-schema-agent-search.test.ts`

Expected: PASS.

## Task 2: Indexer Service

**Files:**
- Create: `lib/services/agent-search-indexer.ts`
- Test: `tests/unit/agent-search-indexer.test.ts`

- [ ] **Step 1: Write failing indexer tests**

Cover prompt searchable text construction, article indexing skip behavior, markdown frontmatter stripping, and stale chunk replacement.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/unit/agent-search-indexer.test.ts`

Expected: FAIL because the indexer module does not exist.

- [ ] **Step 3: Implement minimal indexer**

Implement `indexPrompt`, `indexArticle`, `indexAllPrompts`, and `indexAllArticles`. Use SHA-256 hashes, paragraph chunking, and JSON metadata. Leave `EmbeddingJson` null in MVP.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/unit/agent-search-indexer.test.ts`

Expected: PASS.

## Task 3: Search Service And Public Agent APIs

**Files:**
- Create: `lib/services/agent-search-service.ts`
- Create: `app/api/agent/search/route.ts`
- Create: `app/api/agent/prompts/[id]/route.ts`
- Create: `app/api/agent/articles/[slug]/route.ts`
- Test: `tests/unit/agent-search-api.test.ts`

- [ ] **Step 1: Write failing API tests**

Cover query validation, limit clamping, search result shape, prompt detail shape, article detail `maxChars`, and prove search does not call article markdown fetches.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/unit/agent-search-api.test.ts`

Expected: FAIL because route modules do not exist.

- [ ] **Step 3: Implement service and routes**

Implement keyword search against `AgentSearchDocuments` and `AgentSearchChunks`, result mapping, detail adapters, and route validation.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/unit/agent-search-api.test.ts`

Expected: PASS.

## Task 4: Protected Index Endpoint And Prompt Sync Hook

**Files:**
- Create: `app/api/agent/index/route.ts`
- Modify: `lib/pipelines/prompt-sources/remote-sync.ts`
- Test: `tests/unit/agent-index-route.test.ts`
- Test: `tests/unit/prompt-source-remote-sync.test.ts`

- [ ] **Step 1: Write failing endpoint and sync tests**

Cover missing token rejection, article index trigger, prompt index trigger, and prompt sync calling changed prompt indexing without failing the whole sync on index errors.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/unit/agent-index-route.test.ts tests/unit/prompt-source-remote-sync.test.ts`

Expected: New tests fail because the endpoint/hook does not exist.

- [ ] **Step 3: Implement endpoint and sync hook**

Use existing admin-token validation helpers. Call indexer functions based on payload. In prompt sync, dynamically import the indexer and log index failures.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tests/unit/agent-index-route.test.ts tests/unit/prompt-source-remote-sync.test.ts`

Expected: PASS.

## Task 5: Internal Handoff Skill Index Trigger

**Files:**
- Modify: `/Users/grank/.codex/skills/console-knowledge-handoff/SKILL.md`
- Modify: `/Users/grank/.codex/skills/console-knowledge-handoff/scripts/console-knowledge-handoff-core.mjs`

- [ ] **Step 1: Inspect publish/revalidate code path**

Find the exact function that calls the existing revalidation endpoint.

- [ ] **Step 2: Add post-revalidation index call**

Call `POST /api/agent/index` with `{ type: "article", site: "ai", slug }` after successful revalidation. Use existing site URL and admin token config.

- [ ] **Step 3: Add non-blocking failure reporting**

If indexing fails, publish still reports success but includes a clear index failure warning.

- [ ] **Step 4: Update SKILL.md workflow and verification**

Add post-publish indexing and Agent search verification to the workflow and verification checklist.

## Task 6: External Read-Only Skill

**Files:**
- Create: `/Users/grank/.codex/skills/mockingbird-knowledge/SKILL.md`
- Create: `/Users/grank/.codex/skills/mockingbird-knowledge/agents/openai.yaml`
- Create: `/Users/grank/.codex/skills/mockingbird-knowledge/references/api.md`
- Create: `/Users/grank/.codex/skills/mockingbird-knowledge/scripts/search.mjs`
- Create: `/Users/grank/.codex/skills/mockingbird-knowledge/scripts/get-prompt.mjs`
- Create: `/Users/grank/.codex/skills/mockingbird-knowledge/scripts/get-article.mjs`

- [ ] **Step 1: Create skill instructions**

Write concise trigger conditions and workflow. Keep write/publish/index endpoints explicitly forbidden.

- [ ] **Step 2: Create scripts**

Implement Node ESM scripts using built-in `fetch`, simple argument parsing, compact JSON output, and non-zero exits on API errors.

- [ ] **Step 3: Smoke-test scripts against a mocked local server or invalid endpoint**

Run each script with `MOCKINGBIRD_KNOWLEDGE_BASE_URL=http://127.0.0.1:9` and confirm it exits non-zero with a clear error.

## Task 7: Verification And Commit

**Files:**
- All changed files

- [ ] **Step 1: Run focused tests**

Run all new and affected unit tests.

- [ ] **Step 2: Run lint**

Run: `npm run lint`

- [ ] **Step 3: Run build**

Run: `npm run build`

- [ ] **Step 4: Commit implementation**

Commit with `feat: add agent search skills`.

