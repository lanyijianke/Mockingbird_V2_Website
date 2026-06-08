# Agent Assets Data Preparation Handoff

Date: 2026-06-08

## Current State

This branch has built most of the product and code surface for Agent-facing knowledge assets:

- Agent search/index APIs exist for search, prompt detail, article detail, and protected indexing.
- `mockingbird-knowledge` exists as the external read-only skill.
- `mockingbird-skills` GitHub repository exists and points to `skills/mockingbird-knowledge`.
- `/ai/skill` exists as the marketing page and links to the GitHub skill folder.
- Prompt/article asset contract code exists:
  - `lib/services/agent-asset-types.ts`
  - `lib/services/agent-asset-normalizer.ts`
- Asset-aware search/detail code and tests exist in the branch.
- `scripts/agent-assets-audit.mjs` exists and can summarize asset completeness from indexed documents.

The important missing piece is the real data pass:

- Existing prompts and published articles have not yet been fully reindexed under the new asset contract.
- Existing data has not yet been audited for media completeness, invalid media JSON, missing descriptions/summaries, empty content, or category quality.
- Existing data has not yet been cleaned up or backfilled based on an audit report.
- The audit script currently reads `AgentSearchDocuments`, so it audits the indexed read model, not the raw source of truth. This is useful after reindexing, but it does not prove that every source prompt/article has been indexed.

## Naming Corrections

Use the new names going forward:

- External skill name: `mockingbird-knowledge`
- Repo skill folder: `skills/mockingbird-knowledge`
- Installed local skill: `/Users/grank/.codex/skills/mockingbird-knowledge`
- GitHub skills collection repo: `https://github.com/lanyijianke/mockingbird-skills`
- Skill install URL: `https://github.com/lanyijianke/mockingbird-skills/tree/main/skills/mockingbird-knowledge`

Older plan text still mentions `mockingbird-agent-assets`. Treat that as stale naming.

## Relevant Workspaces

- Main site worktree:
  `/Users/grank/Mockingbird_V2/Mockingbird_V2_Knowledge_Website/.worktrees/agent-search-skills`
- Branch:
  `codex/agent-search-skills`
- Standalone GitHub skill repo:
  `/Users/grank/Mockingbird_V2/mockingbird-skills`

## Existing Plans

- Search/index/skill MVP plan:
  `docs/superpowers/plans/2026-06-06-agent-search-and-skills.md`
- Asset contract and audit plan:
  `docs/superpowers/plans/2026-06-07-agent-assetization.md`

The second plan is directionally correct, but its real-data verification section has not been executed yet.

## Next Task Goal

Prepare all existing prompts and articles as usable Agent assets before moving to vector search.

The next task should produce:

1. A real reindex report for all current prompts and published articles.
2. A real asset audit report.
3. A list of data quality issues grouped by severity.
4. Any safe automated fixes/backfills that can be performed now.
5. A clear list of manual content fixes that still need human review.

## Recommended Next Task Sequence

### 1. Verify Branch And Environment

```bash
cd /Users/grank/Mockingbird_V2/Mockingbird_V2_Knowledge_Website/.worktrees/agent-search-skills
git branch --show-current
git status --short
```

Expected branch:

```text
codex/agent-search-skills
```

Use `.env.local` from this worktree. Do not copy secrets into docs or commits.

### 2. Run Focused Tests First

```bash
npm test -- \
  tests/unit/agent-asset-normalizer.test.ts \
  tests/unit/agent-search-assets.test.ts \
  tests/unit/agent-search-api.test.ts \
  tests/unit/agent-search-indexer.test.ts \
  tests/unit/agent-assets-audit.test.ts \
  tests/unit/mockingbird-knowledge-skill.test.ts
```

If these fail, fix them before touching real data.

### 3. Start Or Reuse Dev Server

```bash
npm run dev
```

Expected local URL:

```text
http://localhost:5046
```

### 4. Reindex All Existing Assets

Use the protected index endpoint:

```bash
curl -sS -X POST http://localhost:5046/api/agent/index \
  -H "Authorization: Bearer $KNOWLEDGE_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"type":"all","site":"ai"}'
```

Save the response into a local report file outside committed source if it contains noisy operational details, or summarize it in a new committed markdown report if it contains no secrets.

Questions to answer from the reindex result:

- How many prompts were indexed?
- How many articles were indexed?
- How many items were skipped?
- How many items failed?
- Which exact ids/slugs failed, if any?

### 5. Run Asset Audit

```bash
node scripts/agent-assets-audit.mjs --site=ai --format=markdown
```

This currently audits indexed documents. Run it only after the all-assets reindex.

Questions to answer from the audit:

- How many indexed assets exist?
- How many prompts/articles have cover media?
- How many prompts have examples?
- How many prompts have video?
- Which assets have no media?
- Which assets lack descriptions/summaries?
- Which assets have empty indexed content?
- Are any rows carrying invalid media JSON?

### 6. Verify Real Skill Search

Use the repo skill scripts:

```bash
node skills/mockingbird-knowledge/scripts/search.mjs "产品海报" --type=prompt --media=image --limit=5
node skills/mockingbird-knowledge/scripts/search.mjs "视频生成" --type=prompt --media=video --limit=5
```

Then fetch at least one prompt detail:

```bash
node skills/mockingbird-knowledge/scripts/get-prompt.mjs <prompt-id-from-search>
```

Expected:

- Search results include `mediaTypes`, `outputFormats`, `qualitySignals`, and public URLs.
- Prompt detail includes `promptText` and `mediaAssets`.
- Media remains URL-only.

### 7. Check Index Coverage Against Source Counts

The current audit script does not compare source counts to indexed counts. Add or run a small source-count check before claiming all data is prepared.

Minimum useful counts:

- Active prompts in `Prompts`.
- Published AI articles from the article directory/manifest.
- Indexed prompt documents in `AgentSearchDocuments`.
- Indexed article documents in `AgentSearchDocuments`.

Acceptance:

- Indexed prompt count equals active prompt count, unless there are documented skips.
- Indexed article count equals published AI article count, unless there are documented skips.

### 8. Decide Backfill Strategy

Likely safe automated fixes:

- Re-run prompt sync if active prompt rows are stale.
- Re-run article indexing for failed slugs.
- Repair malformed `ImagesJson` only when the intended URL list is obvious.
- Backfill missing copy counts using existing `scripts/backfill-prompt-copy-counts.mjs` if needed.

Likely manual fixes:

- Missing cover images.
- Missing example images.
- Missing video preview URLs.
- Weak or missing prompt descriptions.
- Article category mismatches.
- Article cover image choices.

## Important Risks

- Do not treat the GitHub skill repo as the source of truth for website behavior. The website branch still owns the APIs and `/ai/skill` page.
- Do not run destructive DB updates without first producing an audit.
- Do not download or proxy media as part of audit; inspect URLs only unless the user asks for visual inspection.
- Do not move to vector search until existing data is indexed, audited, and mostly clean.
- Existing docs still contain stale `mockingbird-agent-assets` references. Do not resurrect that name.

## Exit Criteria For The Next Task

The next task is done when there is a real-data report showing:

- Full reindex attempted.
- Failures are zero or explicitly listed.
- Asset audit report exists.
- Source-vs-index coverage is checked.
- Data cleanup/backfill actions are completed or listed as manual follow-ups.
- `mockingbird-knowledge` can find at least one image prompt and, if available, one video prompt through the real API.

