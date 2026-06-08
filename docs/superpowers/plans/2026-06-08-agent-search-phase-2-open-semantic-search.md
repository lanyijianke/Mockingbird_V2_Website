# Agent Search Phase 2 Open Semantic Search Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade `mockingbird-knowledge` from a keyword-search skill MVP into a public, server-side semantic knowledge search service backed by a dedicated Qdrant collection.

**Architecture:** Keep the public skill as a thin client that only calls stable `/api/agent/*` read APIs. The Knowledge Website server owns embedding generation, Qdrant access, MySQL keyword indexing, R2 read caching, hybrid ranking, rate limiting, and fallbacks. Reuse the existing remote Qdrant service, but create a separate `mockingbird_knowledge_assets` collection instead of writing Knowledge assets into Console's existing `mockingbird_vector_store`.

**Tech Stack:** Next.js App Router route handlers, TypeScript, mysql2, Vitest, Cloudflare R2 S3-compatible API, `@qdrant/js-client-rest`, Vercel AI SDK embedding helpers, OpenAI-compatible SiliconFlow embedding endpoint, remote Qdrant collection with 768-dimensional Cosine vectors.

---

## Phase Boundary

Phase 1 is the Agent search and skill MVP:

- Public `mockingbird-knowledge` skill exists.
- Public search/detail API surface exists.
- Protected index endpoint exists.
- Prompt/article asset contract exists.
- Keyword search reads MySQL `AgentSearchDocuments` and `AgentSearchChunks`.
- `/ai/skill` marketing page exists.
- GitHub skill repository exists.

Phase 2 makes the system safe and useful for public external Agent usage:

- Real data is fully indexed and audited before vectors are generated.
- R2 reads are cached and observable.
- Embedding and Qdrant are hidden behind server APIs.
- Search becomes hybrid: keyword + semantic + quality reranking.
- Public APIs have rate limits, caching, and graceful fallback.
- The skill docs describe the stable public API contract, not internal infrastructure.

## External Vector Database Boundary

Remote Qdrant is already available on `mk_database`.

Current Console collection:

```text
mockingbird_vector_store
```

New Knowledge Website collection:

```text
mockingbird_knowledge_assets
```

Rules:

- Never write Knowledge Website prompt/article vectors into `mockingbird_vector_store`.
- Never let Console jobs delete or rebuild `mockingbird_knowledge_assets`.
- Qdrant point ids must be deterministic UUIDs derived from stable Knowledge point keys.
- Knowledge point keys must be stored in `payload.pointKey` and start with `knowledge:`.
- The public skill must never know the Qdrant host, port, API key, or collection name.

## File Structure

- Modify `package.json`: add Qdrant and embedding dependencies.
- Modify `.env.example`: document non-secret Phase 2 environment variables.
- Create `lib/agent-search/semantic-config.ts`: reads and validates Phase 2 semantic search environment variables.
- Create `lib/agent-search/embedding-client.ts`: wraps the OpenAI-compatible embedding endpoint for query and chunk embeddings.
- Create `lib/agent-search/vector-store.ts`: wraps Qdrant collection creation, upsert, delete, and search.
- Create `lib/agent-search/vector-points.ts`: builds stable Knowledge point keys, Qdrant-compatible UUID point ids, and payloads for prompt/article chunks.
- Create `lib/agent-search/hybrid-ranker.ts`: merges MySQL keyword results and Qdrant semantic results into stable public search results.
- Modify `lib/services/agent-search-indexer.ts`: generate embeddings and upsert Qdrant points during indexing.
- Modify `lib/services/agent-search-service.ts`: call hybrid search when semantic search is enabled, fallback to keyword search when unavailable.
- Create `lib/articles/r2-object-cache.ts`: read-through cache for R2 manifest and article markdown.
- Modify `lib/articles/article-directory.ts`: use the R2 object cache and support force refresh.
- Modify `lib/cache/content-revalidation.ts`: clear R2 object cache for article publish/update/unpublish/manual events.
- Create `lib/agent-search/query-cache.ts`: query embedding and short-TTL search response cache.
- Create `lib/agent-search/rate-limit.ts`: lightweight public API rate limiter for Agent search/detail endpoints.
- Modify `app/api/agent/search/route.ts`: apply rate limit, cache, hybrid search, and safe error responses.
- Modify `app/api/agent/prompts/[id]/route.ts`: apply public read rate limit.
- Modify `app/api/agent/articles/[slug]/route.ts`: apply public read rate limit and keep `maxChars` bounded.
- Create `scripts/agent-search-vector-health.mjs`: checks embedding config and Qdrant collection health without writing data by default.
- Create `scripts/agent-search-vector-reindex-report.mjs`: summarizes vector coverage against MySQL source/index counts.
- Modify `skills/mockingbird-knowledge/SKILL.md`: document semantic search behavior and public-only API boundary.
- Modify `skills/mockingbird-knowledge/references/api.md`: document stable response fields and rate-limit expectations.
- Test `tests/unit/agent-semantic-config.test.ts`.
- Test `tests/unit/agent-embedding-client.test.ts`.
- Test `tests/unit/agent-vector-store.test.ts`.
- Test `tests/unit/agent-vector-points.test.ts`.
- Test `tests/unit/agent-hybrid-ranker.test.ts`.
- Test `tests/unit/agent-search-indexer-vector.test.ts`.
- Test `tests/unit/r2-object-cache.test.ts`.
- Test `tests/unit/agent-query-cache.test.ts`.
- Test `tests/unit/agent-rate-limit.test.ts`.
- Test `tests/unit/agent-search-api.test.ts`.
- Test `tests/unit/mockingbird-knowledge-skill.test.ts`.

## Task 0: Complete Real Data Preparation Gate

**Files:**
- Read: `docs/superpowers/plans/2026-06-08-agent-assets-data-handoff.md`
- Modify if needed: `scripts/agent-assets-audit.mjs`
- Create if needed: `scripts/agent-source-index-coverage.mjs`
- Report: `docs/superpowers/reports/2026-06-08-agent-assets-data-report.md`

- [ ] **Step 1: Verify branch and working tree**

Run:

```bash
cd /Users/grank/Mockingbird_V2/Mockingbird_V2_Knowledge_Website/.worktrees/agent-search-skills
git branch --show-current
git status --short
```

Expected: branch is `codex/agent-search-skills`. Existing unrelated changes are noted and not reverted.

- [ ] **Step 2: Run focused Phase 1 tests**

Run:

```bash
npm test -- \
  tests/unit/agent-asset-normalizer.test.ts \
  tests/unit/agent-search-assets.test.ts \
  tests/unit/agent-search-api.test.ts \
  tests/unit/agent-search-indexer.test.ts \
  tests/unit/agent-assets-audit.test.ts \
  tests/unit/mockingbird-knowledge-skill.test.ts
```

Expected: PASS. If any test fails, stop Phase 2 implementation and fix Phase 1 regressions first.

- [ ] **Step 3: Full reindex current assets**

Start or reuse the dev server:

```bash
npm run dev
```

In another shell with the worktree `.env.local` loaded, run:

```bash
curl -sS -X POST http://localhost:5046/api/agent/index \
  -H "Authorization: Bearer $KNOWLEDGE_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"type":"all","site":"ai"}'
```

Expected: response lists indexed/skipped/failed prompt and article ids. Save only non-secret counts and failed ids in the report.

- [ ] **Step 4: Run indexed asset audit**

Run:

```bash
node scripts/agent-assets-audit.mjs --site=ai --format=markdown
```

Expected: audit reports indexed asset counts, missing descriptions/summaries, missing media, invalid media metadata, empty indexed content, and weak categories.

- [ ] **Step 5: Check source-vs-index coverage**

If `scripts/agent-source-index-coverage.mjs` does not exist, create it so it counts:

```text
active prompts in Prompts
published AI articles from the article directory
indexed prompt documents in AgentSearchDocuments
indexed article documents in AgentSearchDocuments
```

Run:

```bash
node scripts/agent-source-index-coverage.mjs --site=ai --format=markdown
```

Expected: indexed prompt count equals active prompt count, and indexed article count equals published AI article count, unless skips are explicitly listed.

- [ ] **Step 6: Write the data readiness report**

Create `docs/superpowers/reports/2026-06-08-agent-assets-data-report.md` with these sections:

```markdown
# Agent Assets Data Readiness Report

Date: 2026-06-08

## Reindex Summary

- Prompts indexed:
- Articles indexed:
- Skipped:
- Failed:

## Source Vs Index Coverage

- Active prompts:
- Indexed prompt documents:
- Published AI articles:
- Indexed article documents:

## Audit Findings

### Critical

### High

### Medium

### Low

## Safe Automated Fixes Applied

## Manual Content Fixes

## Phase 2 Gate Decision

Phase 2 vector indexing may start only if critical indexing failures are zero or explicitly accepted.
```

Expected: no secrets, no raw database URLs, no API keys.

## Task 1: Add Dependencies And Semantic Runtime Config

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `.env.example`
- Create: `lib/agent-search/semantic-config.ts`
- Test: `tests/unit/agent-semantic-config.test.ts`

- [ ] **Step 1: Install dependencies**

Run:

```bash
npm install @qdrant/js-client-rest ai @ai-sdk/openai-compatible
```

Expected: `package.json` and `package-lock.json` include the new dependencies.

- [ ] **Step 2: Write failing config tests**

Create `tests/unit/agent-semantic-config.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { loadAgentSemanticConfig } from '@/lib/agent-search/semantic-config';

describe('loadAgentSemanticConfig', () => {
  it('returns disabled config when semantic search is not enabled', () => {
    expect(loadAgentSemanticConfig({})).toEqual({ enabled: false });
  });

  it('loads enabled Qdrant and embedding config', () => {
    const config = loadAgentSemanticConfig({
      AGENT_SEMANTIC_SEARCH_ENABLED: 'true',
      AGENT_QDRANT_HOST: '154.222.29.185',
      AGENT_QDRANT_HTTP_PORT: '47321',
      AGENT_QDRANT_COLLECTION: 'mockingbird_knowledge_assets',
      AGENT_EMBEDDING_ENDPOINT: 'https://api.siliconflow.cn/v1/embeddings',
      AGENT_EMBEDDING_API_KEY: 'secret',
      AGENT_EMBEDDING_MODEL: 'Qwen/Qwen3-Embedding-8B',
    });

    expect(config).toMatchObject({
      enabled: true,
      qdrant: {
        host: '154.222.29.185',
        httpPort: 47321,
        collection: 'mockingbird_knowledge_assets',
      },
      embedding: {
        baseURL: 'https://api.siliconflow.cn/v1',
        model: 'Qwen/Qwen3-Embedding-8B',
      },
    });
  });

  it('rejects the Console collection name for Knowledge assets', () => {
    expect(() => loadAgentSemanticConfig({
      AGENT_SEMANTIC_SEARCH_ENABLED: 'true',
      AGENT_QDRANT_HOST: '154.222.29.185',
      AGENT_QDRANT_HTTP_PORT: '47321',
      AGENT_QDRANT_COLLECTION: 'mockingbird_vector_store',
      AGENT_EMBEDDING_ENDPOINT: 'https://api.siliconflow.cn/v1/embeddings',
      AGENT_EMBEDDING_API_KEY: 'secret',
      AGENT_EMBEDDING_MODEL: 'Qwen/Qwen3-Embedding-8B',
    })).toThrow('AGENT_QDRANT_COLLECTION must not be mockingbird_vector_store');
  });
});
```

Run:

```bash
npm test -- tests/unit/agent-semantic-config.test.ts
```

Expected: FAIL because `semantic-config.ts` does not exist.

- [ ] **Step 3: Implement semantic config**

Create `lib/agent-search/semantic-config.ts`:

```ts
export interface AgentSemanticDisabledConfig {
  enabled: false;
}

export interface AgentSemanticEnabledConfig {
  enabled: true;
  qdrant: {
    host: string;
    httpPort: number;
    apiKey?: string;
    https: boolean;
    collection: string;
  };
  embedding: {
    name: string;
    apiKey: string;
    baseURL: string;
    model: string;
  };
}

export type AgentSemanticConfig = AgentSemanticDisabledConfig | AgentSemanticEnabledConfig;

function truthy(value: string | undefined): boolean {
  return value === 'true' || value === '1' || value === 'yes';
}

function required(env: NodeJS.ProcessEnv | Record<string, string | undefined>, key: string): string {
  const value = env[key]?.trim();
  if (!value) throw new Error(`${key} is required when AGENT_SEMANTIC_SEARCH_ENABLED=true`);
  return value;
}

function parsePositiveInteger(value: string, key: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) throw new Error(`${key} must be a positive integer`);
  return parsed;
}

function embeddingBaseUrl(endpoint: string): string {
  return endpoint.replace(/\/embeddings\/?$/, '').replace(/\/+$/, '');
}

export function loadAgentSemanticConfig(
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env,
): AgentSemanticConfig {
  if (!truthy(env.AGENT_SEMANTIC_SEARCH_ENABLED)) return { enabled: false };

  const collection = required(env, 'AGENT_QDRANT_COLLECTION');
  if (collection === 'mockingbird_vector_store') {
    throw new Error('AGENT_QDRANT_COLLECTION must not be mockingbird_vector_store');
  }
  if (!collection.startsWith('mockingbird_knowledge_')) {
    throw new Error('AGENT_QDRANT_COLLECTION must start with mockingbird_knowledge_');
  }

  return {
    enabled: true,
    qdrant: {
      host: required(env, 'AGENT_QDRANT_HOST'),
      httpPort: parsePositiveInteger(required(env, 'AGENT_QDRANT_HTTP_PORT'), 'AGENT_QDRANT_HTTP_PORT'),
      apiKey: env.AGENT_QDRANT_API_KEY?.trim() || undefined,
      https: truthy(env.AGENT_QDRANT_HTTPS),
      collection,
    },
    embedding: {
      name: env.AGENT_EMBEDDING_PROVIDER?.trim() || 'siliconflow',
      apiKey: required(env, 'AGENT_EMBEDDING_API_KEY'),
      baseURL: embeddingBaseUrl(required(env, 'AGENT_EMBEDDING_ENDPOINT')),
      model: required(env, 'AGENT_EMBEDDING_MODEL'),
    },
  };
}
```

- [ ] **Step 4: Document env vars**

Add to `.env.example`:

```dotenv
# Agent semantic search (server-side only; do not expose these to the public skill)
AGENT_SEMANTIC_SEARCH_ENABLED=false
AGENT_QDRANT_HOST=154.222.29.185
AGENT_QDRANT_HTTP_PORT=47321
AGENT_QDRANT_COLLECTION=mockingbird_knowledge_assets
AGENT_QDRANT_HTTPS=false
AGENT_QDRANT_API_KEY=
AGENT_EMBEDDING_PROVIDER=siliconflow
AGENT_EMBEDDING_ENDPOINT=https://api.siliconflow.cn/v1/embeddings
AGENT_EMBEDDING_API_KEY=
AGENT_EMBEDDING_MODEL=Qwen/Qwen3-Embedding-8B
```

- [ ] **Step 5: Run config tests**

Run:

```bash
npm test -- tests/unit/agent-semantic-config.test.ts
```

Expected: PASS.

## Task 2: Add Embedding Client And Qdrant Vector Store

**Files:**
- Create: `lib/agent-search/embedding-client.ts`
- Create: `lib/agent-search/vector-store.ts`
- Test: `tests/unit/agent-embedding-client.test.ts`
- Test: `tests/unit/agent-vector-store.test.ts`

- [ ] **Step 1: Write failing embedding client tests**

Create `tests/unit/agent-embedding-client.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { createAgentEmbeddingClient } from '@/lib/agent-search/embedding-client';

describe('createAgentEmbeddingClient', () => {
  it('normalizes text before embedding', async () => {
    const embedText = vi.fn().mockResolvedValue([0.1, 0.2, 0.3]);
    const client = createAgentEmbeddingClient({
      provider: { embedText },
      model: 'Qwen/Qwen3-Embedding-8B',
    });

    await expect(client.embedQuery('  产品   海报\n提示词  ')).resolves.toEqual([0.1, 0.2, 0.3]);
    expect(embedText).toHaveBeenCalledWith('产品 海报 提示词');
  });

  it('rejects empty normalized text', async () => {
    const client = createAgentEmbeddingClient({
      provider: { embedText: vi.fn() },
      model: 'Qwen/Qwen3-Embedding-8B',
    });

    await expect(client.embedQuery('   ')).rejects.toThrow('Cannot embed empty text');
  });
});
```

Run:

```bash
npm test -- tests/unit/agent-embedding-client.test.ts
```

Expected: FAIL because the module does not exist.

- [ ] **Step 2: Implement embedding client**

Create `lib/agent-search/embedding-client.ts`:

```ts
import { embed, embedMany } from 'ai';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import type { AgentSemanticEnabledConfig } from './semantic-config';

export interface EmbeddingProviderLike {
  embedText(text: string): Promise<number[]>;
  embedTexts?(texts: string[]): Promise<number[][]>;
}

export interface AgentEmbeddingClient {
  model: string;
  embedQuery(text: string): Promise<number[]>;
  embedChunks(texts: string[]): Promise<number[][]>;
}

function normalizeText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

export function createOpenAiCompatibleEmbeddingProvider(config: AgentSemanticEnabledConfig['embedding']): EmbeddingProviderLike {
  const provider = createOpenAICompatible({
    name: config.name,
    apiKey: config.apiKey,
    baseURL: config.baseURL,
  });
  const model = provider.textEmbeddingModel(config.model);

  return {
    async embedText(text: string): Promise<number[]> {
      const result = await embed({ model, value: text });
      return result.embedding;
    },
    async embedTexts(texts: string[]): Promise<number[][]> {
      const result = await embedMany({ model, values: texts });
      return result.embeddings;
    },
  };
}

export function createAgentEmbeddingClient(options: {
  provider: EmbeddingProviderLike;
  model: string;
}): AgentEmbeddingClient {
  return {
    model: options.model,
    async embedQuery(text: string): Promise<number[]> {
      const normalized = normalizeText(text);
      if (!normalized) throw new Error('Cannot embed empty text');
      return options.provider.embedText(normalized);
    },
    async embedChunks(texts: string[]): Promise<number[][]> {
      const normalized = texts.map(normalizeText).filter(Boolean);
      if (normalized.length === 0) return [];
      if (options.provider.embedTexts) return options.provider.embedTexts(normalized);
      return Promise.all(normalized.map((text) => options.provider.embedText(text)));
    },
  };
}
```

- [ ] **Step 3: Write failing vector store tests**

Create `tests/unit/agent-vector-store.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { createAgentVectorStore } from '@/lib/agent-search/vector-store';

describe('createAgentVectorStore', () => {
  it('creates a 768-dimensional cosine collection when missing', async () => {
    const client = {
      collectionExists: vi.fn().mockResolvedValue({ exists: false }),
      createCollection: vi.fn().mockResolvedValue({}),
    };
    const store = createAgentVectorStore({
      collection: 'mockingbird_knowledge_assets',
      client,
    });

    await store.ensureCollection(768);

    expect(client.createCollection).toHaveBeenCalledWith('mockingbird_knowledge_assets', {
      vectors: { size: 768, distance: 'Cosine' },
      on_disk_payload: true,
    });
  });

  it('searches with payload and score threshold', async () => {
    const client = {
      search: vi.fn().mockResolvedValue([
        { id: '2d7dc1e5-b19b-56e6-8c02-1376e9915e17', score: 0.91, payload: { pointKey: 'knowledge:prompt:ai:1:chunk:0', contentType: 'prompt', contentId: '1' } },
      ]),
    };
    const store = createAgentVectorStore({
      collection: 'mockingbird_knowledge_assets',
      client,
    });

    await expect(store.search([0.1, 0.2], { limit: 5, scoreThreshold: 0.25 })).resolves.toEqual([
      { id: '2d7dc1e5-b19b-56e6-8c02-1376e9915e17', score: 0.91, payload: { pointKey: 'knowledge:prompt:ai:1:chunk:0', contentType: 'prompt', contentId: '1' } },
    ]);
  });
});
```

Run:

```bash
npm test -- tests/unit/agent-vector-store.test.ts
```

Expected: FAIL because the module does not exist.

- [ ] **Step 4: Implement vector store**

Create `lib/agent-search/vector-store.ts`:

```ts
import { QdrantClient } from '@qdrant/js-client-rest';
import type { AgentSemanticEnabledConfig } from './semantic-config';

export interface AgentVectorPoint {
  id: string;
  vector: number[];
  payload: Record<string, unknown>;
}

export interface AgentVectorSearchResult {
  id: string;
  score: number;
  payload: Record<string, unknown>;
}

interface QdrantClientLike {
  collectionExists?(collection: string): Promise<{ exists: boolean } | boolean>;
  createCollection?(collection: string, request: unknown): Promise<unknown>;
  upsert?(collection: string, request: unknown): Promise<unknown>;
  delete?(collection: string, request: unknown): Promise<unknown>;
  search?(collection: string, request: unknown): Promise<unknown>;
}

export interface AgentVectorStore {
  ensureCollection(vectorSize: number): Promise<void>;
  upsert(points: AgentVectorPoint[]): Promise<void>;
  deleteByDocument(contentType: string, site: string, contentId: string): Promise<void>;
  search(vector: number[], options: { limit: number; scoreThreshold?: number; filter?: Record<string, unknown> }): Promise<AgentVectorSearchResult[]>;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {};
}

function createQdrantClient(config: AgentSemanticEnabledConfig['qdrant']): QdrantClientLike {
  return new QdrantClient({
    host: config.host,
    port: config.httpPort,
    apiKey: config.apiKey,
    https: config.https,
    checkCompatibility: false,
  });
}

export function createAgentVectorStore(options: {
  collection: string;
  client?: QdrantClientLike;
  config?: AgentSemanticEnabledConfig['qdrant'];
}): AgentVectorStore {
  const client = options.client || createQdrantClient(options.config!);
  const collection = options.collection;

  return {
    async ensureCollection(vectorSize: number): Promise<void> {
      if (!client.collectionExists || !client.createCollection) {
        throw new Error('Qdrant client does not support collection management');
      }
      const existsResult = await client.collectionExists(collection);
      const exists = typeof existsResult === 'boolean' ? existsResult : existsResult.exists;
      if (exists) return;
      await client.createCollection(collection, {
        vectors: { size: vectorSize, distance: 'Cosine' },
        on_disk_payload: true,
      });
    },
    async upsert(points: AgentVectorPoint[]): Promise<void> {
      if (points.length === 0) return;
      if (!client.upsert) throw new Error('Qdrant client does not support upsert');
      await client.upsert(collection, { points });
    },
    async deleteByDocument(contentType: string, site: string, contentId: string): Promise<void> {
      if (!client.delete) throw new Error('Qdrant client does not support delete');
      await client.delete(collection, {
        filter: {
          must: [
            { key: 'contentType', match: { value: contentType } },
            { key: 'site', match: { value: site } },
            { key: 'contentId', match: { value: contentId } },
          ],
        },
      });
    },
    async search(vector: number[], options): Promise<AgentVectorSearchResult[]> {
      if (!client.search) throw new Error('Qdrant client does not support search');
      const request: Record<string, unknown> = {
        vector,
        limit: options.limit,
        with_payload: true,
      };
      if (options.scoreThreshold !== undefined) request.score_threshold = options.scoreThreshold;
      if (options.filter) request.filter = options.filter;
      const raw = await client.search(collection, request);
      const rows = Array.isArray(raw) ? raw : [];
      return rows.map((row) => {
        const record = asRecord(row);
        return {
          id: String(record.id),
          score: Number(record.score) || 0,
          payload: asRecord(record.payload),
        };
      });
    },
  };
}
```

- [ ] **Step 5: Run client tests**

Run:

```bash
npm test -- tests/unit/agent-embedding-client.test.ts tests/unit/agent-vector-store.test.ts
```

Expected: PASS.

## Task 3: Build Stable Vector Point Contract

**Files:**
- Create: `lib/agent-search/vector-points.ts`
- Test: `tests/unit/agent-vector-points.test.ts`

- [ ] **Step 1: Write failing point contract tests**

Create `tests/unit/agent-vector-points.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { buildAgentVectorPointId, buildAgentVectorPointKey, buildAgentVectorPayload } from '@/lib/agent-search/vector-points';

describe('agent vector point contract', () => {
  it('builds stable point keys with knowledge prefix', () => {
    expect(buildAgentVectorPointKey({
      contentType: 'prompt',
      site: 'ai',
      contentId: '123',
      chunkIndex: 2,
    })).toBe('knowledge:prompt:ai:123:chunk:2');
  });

  it('builds deterministic Qdrant-compatible UUID point ids', () => {
    expect(buildAgentVectorPointId({
      contentType: 'prompt',
      site: 'ai',
      contentId: '123',
      chunkIndex: 2,
    })).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('builds searchable vector payload', () => {
    expect(buildAgentVectorPayload({
      contentType: 'article',
      site: 'ai',
      contentId: 'agent-workflow',
      chunkIndex: 0,
      title: 'Agent workflow',
      summary: 'How to work with agents',
      category: 'workflow',
      publicUrl: 'https://zgnknowledge.online/ai/articles/agent-workflow',
      mediaTypes: ['image'],
      useCases: ['workflow'],
      outputFormats: ['text'],
      qualitySignals: { hasCover: true, hasVideo: false, hasExamples: false, copyCount: null, updatedAt: null },
      indexedAt: '2026-06-08T00:00:00.000Z',
    })).toMatchObject({
      contentType: 'article',
      site: 'ai',
      contentId: 'agent-workflow',
      chunkIndex: 0,
      title: 'Agent workflow',
      mediaTypes: ['image'],
      pointNamespace: 'knowledge',
    });
  });
});
```

Run:

```bash
npm test -- tests/unit/agent-vector-points.test.ts
```

Expected: FAIL because the module does not exist.

- [ ] **Step 2: Implement vector point helpers**

Create `lib/agent-search/vector-points.ts`:

```ts
import type { AgentContentType } from '@/lib/services/agent-search-types';
import type { AgentAssetQualitySignals, AgentMediaType } from '@/lib/services/agent-asset-types';

export interface AgentVectorPointIdentity {
  contentType: AgentContentType;
  site: string;
  contentId: string;
  chunkIndex: number;
}

export interface AgentVectorPayloadInput extends AgentVectorPointIdentity {
  title: string;
  summary: string | null;
  category: string | null;
  publicUrl: string | null;
  mediaTypes: AgentMediaType[];
  useCases: string[];
  outputFormats: string[];
  qualitySignals: AgentAssetQualitySignals;
  indexedAt: string;
}

function safePart(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, '-');
}

export function buildAgentVectorPointId(input: AgentVectorPointIdentity): string {
  return [
    'knowledge',
    safePart(input.contentType),
    safePart(input.site),
    safePart(input.contentId),
    'chunk',
    String(input.chunkIndex),
  ].join(':');
}

export function buildAgentVectorPayload(input: AgentVectorPayloadInput): Record<string, unknown> {
  return {
    pointNamespace: 'knowledge',
    contentType: input.contentType,
    site: input.site,
    contentId: input.contentId,
    chunkIndex: input.chunkIndex,
    title: input.title,
    summary: input.summary,
    category: input.category,
    publicUrl: input.publicUrl,
    mediaTypes: input.mediaTypes,
    useCases: input.useCases,
    outputFormats: input.outputFormats,
    qualitySignals: input.qualitySignals,
    indexedAt: input.indexedAt,
  };
}
```

- [ ] **Step 3: Run point contract tests**

Run:

```bash
npm test -- tests/unit/agent-vector-points.test.ts
```

Expected: PASS.

## Task 4: Add R2 Object Read-Through Cache

**Files:**
- Create: `lib/articles/r2-object-cache.ts`
- Modify: `lib/articles/article-directory.ts`
- Modify: `lib/cache/content-revalidation.ts`
- Test: `tests/unit/r2-object-cache.test.ts`

- [ ] **Step 1: Write failing cache tests**

Create `tests/unit/r2-object-cache.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clearR2ObjectCache, readCachedR2ObjectText } from '@/lib/articles/r2-object-cache';

describe('R2 object cache', () => {
  beforeEach(() => {
    clearR2ObjectCache();
  });

  it('caches R2 object reads by bucket and key', async () => {
    const reader = vi.fn().mockResolvedValue('manifest');

    await expect(readCachedR2ObjectText('bucket', 'ai/manifest.json', { reader, ttlMs: 60000 })).resolves.toBe('manifest');
    await expect(readCachedR2ObjectText('bucket', 'ai/manifest.json', { reader, ttlMs: 60000 })).resolves.toBe('manifest');

    expect(reader).toHaveBeenCalledTimes(1);
  });

  it('supports force refresh', async () => {
    const reader = vi.fn()
      .mockResolvedValueOnce('old')
      .mockResolvedValueOnce('new');

    await readCachedR2ObjectText('bucket', 'ai/index.md', { reader, ttlMs: 60000 });
    await expect(readCachedR2ObjectText('bucket', 'ai/index.md', { reader, ttlMs: 60000, forceRefresh: true })).resolves.toBe('new');

    expect(reader).toHaveBeenCalledTimes(2);
  });
});
```

Run:

```bash
npm test -- tests/unit/r2-object-cache.test.ts
```

Expected: FAIL because the cache module does not exist.

- [ ] **Step 2: Implement cache module**

Create `lib/articles/r2-object-cache.ts`:

```ts
interface CacheEntry {
  value: string;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();
const DEFAULT_TTL_MS = 5 * 60 * 1000;

function cacheKey(bucket: string, key: string): string {
  return `${bucket}:${key}`;
}

export function clearR2ObjectCache(): void {
  cache.clear();
}

export async function readCachedR2ObjectText(
  bucket: string,
  key: string,
  options: {
    reader: (bucket: string, key: string) => Promise<string>;
    ttlMs?: number;
    forceRefresh?: boolean;
    now?: number;
  },
): Promise<string> {
  const now = options.now ?? Date.now();
  const ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
  const id = cacheKey(bucket, key);
  const existing = cache.get(id);
  if (!options.forceRefresh && existing && existing.expiresAt > now) {
    return existing.value;
  }

  const value = await options.reader(bucket, key);
  cache.set(id, { value, expiresAt: now + ttlMs });
  return value;
}
```

- [ ] **Step 3: Use cache in article directory**

Modify `lib/articles/article-directory.ts`:

```ts
import { readCachedR2ObjectText, clearR2ObjectCache } from './r2-object-cache';
```

For R2 manifest reads, replace direct `readR2ObjectText(config.bucket, manifestKey)` with:

```ts
const manifest = JSON.parse(await readCachedR2ObjectText(config.bucket, manifestKey, {
  reader: readR2ObjectText,
  forceRefresh: options?.forceRefresh,
})) as ArticleSourceManifest;
```

For R2 markdown reads, replace direct `readR2ObjectText(entry.contentBucket, entry.contentKey)` with:

```ts
return readCachedR2ObjectText(entry.contentBucket, entry.contentKey, {
  reader: readR2ObjectText,
  forceRefresh: options?.forceRefresh,
});
```

Update function signatures so `fetchSourceManifest` accepts `options?: { forceRefresh?: boolean }`, and pass the option from `fetchAggregatedArticleDirectory`.

Update `clearArticleDirectoryCache()`:

```ts
export function clearArticleDirectoryCache(): void {
  clearR2ObjectCache();
}
```

- [ ] **Step 4: Clear R2 cache on revalidation**

Modify `lib/cache/content-revalidation.ts`:

```ts
import { clearArticleDirectoryCache } from '@/lib/articles/article-directory';
```

Inside `revalidateContentChange`, before returning:

```ts
if (event.type === 'article' || event.type === 'articles' || event.type === 'all') {
  clearArticleDirectoryCache();
}
```

- [ ] **Step 5: Run cache tests**

Run:

```bash
npm test -- tests/unit/r2-object-cache.test.ts tests/unit/content-revalidation.test.ts tests/unit/article-cache-route-auth.test.ts
```

Expected: PASS.

## Task 5: Write Vectors During Agent Indexing

**Files:**
- Modify: `lib/services/agent-search-indexer.ts`
- Test: `tests/unit/agent-search-indexer-vector.test.ts`

- [ ] **Step 1: Write failing vector indexing tests**

Create `tests/unit/agent-search-indexer-vector.test.ts` with mocked embedding and vector store dependencies:

```ts
import { describe, expect, it, vi } from 'vitest';
import { buildAgentVectorPointId, buildAgentVectorPointKey } from '@/lib/agent-search/vector-points';

describe('agent search vector indexing', () => {
  it('uses stable knowledge point keys and Qdrant-compatible ids', () => {
    const identity = {
      contentType: 'prompt',
      site: 'ai',
      contentId: '7',
      chunkIndex: 0,
    };

    expect(buildAgentVectorPointKey(identity)).toBe('knowledge:prompt:ai:7:chunk:0');
    expect(buildAgentVectorPointId(identity)).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('documents expected indexer dependency behavior', async () => {
    const embeddingClient = { embedChunks: vi.fn().mockResolvedValue([[0.1, 0.2, 0.3]]) };
    const vectorStore = {
      ensureCollection: vi.fn().mockResolvedValue(undefined),
      deleteByDocument: vi.fn().mockResolvedValue(undefined),
      upsert: vi.fn().mockResolvedValue(undefined),
    };

    await vectorStore.ensureCollection(768);
    const vectors = await embeddingClient.embedChunks(['prompt chunk']);
    await vectorStore.deleteByDocument('prompt', 'ai', '7');
    await vectorStore.upsert([{ id: buildAgentVectorPointId(identity), vector: vectors[0], payload: { pointKey: 'knowledge:prompt:ai:7:chunk:0', contentType: 'prompt' } }]);

    expect(vectorStore.ensureCollection).toHaveBeenCalledWith(768);
    expect(vectorStore.deleteByDocument).toHaveBeenCalledWith('prompt', 'ai', '7');
    expect(vectorStore.upsert).toHaveBeenCalledWith([
      expect.objectContaining({ id: expect.stringMatching(/^[0-9a-f-]{36}$/) }),
    ]);
  });
});
```

Run:

```bash
npm test -- tests/unit/agent-search-indexer-vector.test.ts
```

Expected: PASS after Task 3 exists. This test locks the point contract before indexer integration.

- [ ] **Step 2: Add vector indexing helper to indexer**

Modify `lib/services/agent-search-indexer.ts` to add a helper:

```ts
async function maybeIndexVectors(input: IndexedDocumentInput, documentId: number): Promise<void> {
  const config = loadAgentSemanticConfig();
  if (!config.enabled) return;

  const embeddingClient = createAgentEmbeddingClient({
    provider: createOpenAiCompatibleEmbeddingProvider(config.embedding),
    model: config.embedding.model,
  });
  const vectorStore = createAgentVectorStore({
    collection: config.qdrant.collection,
    config: config.qdrant,
  });

  const vectors = await embeddingClient.embedChunks(input.chunks);
  await vectorStore.ensureCollection(vectors[0]?.length || 768);
  await vectorStore.deleteByDocument(input.contentType, input.site, input.contentId);
  await vectorStore.upsert(vectors.map((vector, index) => ({
    id: buildAgentVectorPointId({
      contentType: input.contentType,
      site: input.site,
      contentId: input.contentId,
      chunkIndex: index,
    }),
    vector,
    payload: buildAgentVectorPayload({
      contentType: input.contentType,
      site: input.site,
      contentId: input.contentId,
      chunkIndex: index,
      title: input.title,
      summary: input.summary,
      category: input.category,
      publicUrl: input.publicUrl,
      mediaTypes: Array.isArray(input.metadata.mediaTypes) ? input.metadata.mediaTypes as never[] : [],
      useCases: Array.isArray(input.metadata.useCases) ? input.metadata.useCases as string[] : [],
      outputFormats: Array.isArray(input.metadata.outputFormats) ? input.metadata.outputFormats as string[] : [],
      qualitySignals: input.metadata.qualitySignals as never,
      indexedAt: new Date().toISOString(),
    }),
  })));

  await execute(
    `UPDATE AgentSearchChunks
     SET EmbeddingModel = ?, EmbeddedAt = NOW()
     WHERE DocumentId = ?`,
    [config.embedding.model, documentId],
  );
}
```

Add imports:

```ts
import { createAgentEmbeddingClient, createOpenAiCompatibleEmbeddingProvider } from '@/lib/agent-search/embedding-client';
import { loadAgentSemanticConfig } from '@/lib/agent-search/semantic-config';
import { createAgentVectorStore } from '@/lib/agent-search/vector-store';
import { buildAgentVectorPayload, buildAgentVectorPointId } from '@/lib/agent-search/vector-points';
```

Call `await maybeIndexVectors(input, documentId);` after `replaceChunks(documentId, chunks)` in prompt and article indexing paths.

- [ ] **Step 3: Preserve indexing success if vectors are disabled**

Run existing indexer tests with semantic search disabled:

```bash
AGENT_SEMANTIC_SEARCH_ENABLED=false npm test -- tests/unit/agent-search-indexer.test.ts
```

Expected: PASS.

- [ ] **Step 4: Run vector indexing tests**

Run:

```bash
npm test -- tests/unit/agent-search-indexer-vector.test.ts tests/unit/agent-search-indexer.test.ts
```

Expected: PASS.

## Task 6: Implement Hybrid Search And Fallback

**Files:**
- Create: `lib/agent-search/hybrid-ranker.ts`
- Modify: `lib/services/agent-search-service.ts`
- Test: `tests/unit/agent-hybrid-ranker.test.ts`
- Test: `tests/unit/agent-search-api.test.ts`

- [ ] **Step 1: Write failing hybrid ranker tests**

Create `tests/unit/agent-hybrid-ranker.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { mergeHybridResults } from '@/lib/agent-search/hybrid-ranker';

describe('mergeHybridResults', () => {
  it('deduplicates semantic and keyword matches by type/site/id', () => {
    const results = mergeHybridResults({
      query: '产品海报',
      semantic: [
        { contentType: 'prompt', site: 'ai', contentId: '1', semanticScore: 0.92 },
      ],
      keyword: [
        {
          type: 'prompt',
          id: '1',
          site: 'ai',
          title: '产品海报提示词',
          summary: '生成商品海报',
          category: 'gpt-image-2',
          url: 'https://zgnknowledge.online/ai/prompts/1',
          coverUrl: null,
          score: 0.7,
          matchedText: '产品海报提示词',
          updatedAt: null,
          assetKind: 'prompt',
          mediaTypes: ['image'],
          useCases: ['poster'],
          outputFormats: ['image'],
          qualitySignals: { hasCover: false, hasVideo: false, hasExamples: true, copyCount: 10, updatedAt: null },
        },
      ],
      semanticDetails: new Map([
        ['prompt:ai:1', {
          type: 'prompt',
          id: '1',
          site: 'ai',
          title: '产品海报提示词',
          summary: '生成商品海报',
          category: 'gpt-image-2',
          url: 'https://zgnknowledge.online/ai/prompts/1',
          coverUrl: null,
          score: 0,
          matchedText: null,
          updatedAt: null,
          assetKind: 'prompt',
          mediaTypes: ['image'],
          useCases: ['poster'],
          outputFormats: ['image'],
          qualitySignals: { hasCover: false, hasVideo: false, hasExamples: true, copyCount: 10, updatedAt: null },
        }],
      ]),
      limit: 5,
    });

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      id: '1',
      type: 'prompt',
      retrievalMode: 'hybrid',
    });
    expect(results[0]!.score).toBeGreaterThan(0.9);
  });
});
```

Run:

```bash
npm test -- tests/unit/agent-hybrid-ranker.test.ts
```

Expected: FAIL because ranker does not exist.

- [ ] **Step 2: Implement hybrid ranker**

Create `lib/agent-search/hybrid-ranker.ts`:

```ts
import type { AgentContentType, AgentSearchResultItem } from '@/lib/services/agent-search-types';

export interface SemanticCandidate {
  contentType: AgentContentType;
  site: string;
  contentId: string;
  semanticScore: number;
}

export type HybridSearchResultItem = AgentSearchResultItem & {
  retrievalMode: 'keyword' | 'semantic' | 'hybrid';
  semanticScore: number;
  keywordScore: number;
};

function key(type: string, site: string, id: string): string {
  return `${type}:${site}:${id}`;
}

function qualityBoost(item: AgentSearchResultItem): number {
  let boost = 0;
  if (item.qualitySignals.hasExamples) boost += 0.05;
  if (item.qualitySignals.hasCover) boost += 0.03;
  if (item.qualitySignals.hasVideo) boost += 0.03;
  if (typeof item.qualitySignals.copyCount === 'number') {
    boost += Math.min(0.05, item.qualitySignals.copyCount / 100000);
  }
  return boost;
}

export function mergeHybridResults(input: {
  query: string;
  semantic: SemanticCandidate[];
  keyword: AgentSearchResultItem[];
  semanticDetails: Map<string, AgentSearchResultItem>;
  limit: number;
}): HybridSearchResultItem[] {
  const merged = new Map<string, HybridSearchResultItem>();

  for (const item of input.keyword) {
    merged.set(key(item.type, item.site, item.id), {
      ...item,
      retrievalMode: 'keyword',
      semanticScore: 0,
      keywordScore: item.score,
      score: item.score + qualityBoost(item),
    });
  }

  for (const candidate of input.semantic) {
    const id = key(candidate.contentType, candidate.site, candidate.contentId);
    const detail = merged.get(id) || input.semanticDetails.get(id);
    if (!detail) continue;

    const existing = merged.get(id);
    const keywordScore = existing?.keywordScore || 0;
    const score = (candidate.semanticScore * 0.7) + (keywordScore * 0.25) + qualityBoost(detail);
    merged.set(id, {
      ...detail,
      retrievalMode: keywordScore > 0 ? 'hybrid' : 'semantic',
      semanticScore: candidate.semanticScore,
      keywordScore,
      score: Number(score.toFixed(4)),
    });
  }

  return [...merged.values()]
    .sort((left, right) => right.score - left.score)
    .slice(0, input.limit);
}
```

- [ ] **Step 3: Add semantic search path with keyword fallback**

Modify `lib/services/agent-search-service.ts`:

- Keep existing keyword search logic as a helper such as `searchAgentKeywordIndex(options)`.
- Add `searchAgentIndex(options)` wrapper:

```ts
export async function searchAgentIndex(options: AgentSearchOptions): Promise<AgentSearchResponse> {
  const config = loadAgentSemanticConfig();
  if (!config.enabled) return searchAgentKeywordIndex(options);

  try {
    return searchAgentHybridIndex(options, config);
  } catch (error) {
    console.warn('Agent semantic search failed; falling back to keyword search', error);
    return searchAgentKeywordIndex(options);
  }
}
```

Implement `searchAgentHybridIndex` so it:

- Embeds `options.query`.
- Searches Qdrant with `limit * 3`.
- Applies Qdrant filters for `type`, `site`, and `media` where possible.
- Fetches matching `AgentSearchDocuments` rows by `(ContentType, Site, ContentId)`.
- Calls `mergeHybridResults`.
- Returns the same public `AgentSearchResponse` shape with extra fields tolerated by JSON clients.

- [ ] **Step 4: Run hybrid tests**

Run:

```bash
npm test -- tests/unit/agent-hybrid-ranker.test.ts tests/unit/agent-search-api.test.ts
```

Expected: PASS.

## Task 7: Add Query Cache, Rate Limit, And Safe Public API Behavior

**Files:**
- Create: `lib/agent-search/query-cache.ts`
- Create: `lib/agent-search/rate-limit.ts`
- Modify: `app/api/agent/search/route.ts`
- Modify: `app/api/agent/prompts/[id]/route.ts`
- Modify: `app/api/agent/articles/[slug]/route.ts`
- Test: `tests/unit/agent-query-cache.test.ts`
- Test: `tests/unit/agent-rate-limit.test.ts`
- Test: `tests/unit/agent-search-api.test.ts`

- [ ] **Step 1: Write query cache tests**

Create `tests/unit/agent-query-cache.test.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import { clearAgentQueryCache, getCachedQueryEmbedding, normalizeAgentQuery, setCachedQueryEmbedding } from '@/lib/agent-search/query-cache';

describe('agent query cache', () => {
  beforeEach(() => clearAgentQueryCache());

  it('normalizes whitespace and case', () => {
    expect(normalizeAgentQuery('  产品   海报  ')).toBe('产品 海报');
  });

  it('stores embeddings by normalized query', () => {
    setCachedQueryEmbedding('产品 海报', [0.1, 0.2], { now: 1000, ttlMs: 1000 });
    expect(getCachedQueryEmbedding('  产品 海报 ', { now: 1500 })).toEqual([0.1, 0.2]);
    expect(getCachedQueryEmbedding('产品 海报', { now: 2501 })).toBeNull();
  });
});
```

- [ ] **Step 2: Implement query cache**

Create `lib/agent-search/query-cache.ts`:

```ts
interface EmbeddingEntry {
  vector: number[];
  expiresAt: number;
}

const embeddingCache = new Map<string, EmbeddingEntry>();
const DEFAULT_EMBEDDING_TTL_MS = 10 * 60 * 1000;

export function normalizeAgentQuery(query: string): string {
  return query.replace(/\s+/g, ' ').trim();
}

export function clearAgentQueryCache(): void {
  embeddingCache.clear();
}

export function getCachedQueryEmbedding(query: string, options: { now?: number } = {}): number[] | null {
  const key = normalizeAgentQuery(query);
  const entry = embeddingCache.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= (options.now ?? Date.now())) {
    embeddingCache.delete(key);
    return null;
  }
  return entry.vector;
}

export function setCachedQueryEmbedding(
  query: string,
  vector: number[],
  options: { now?: number; ttlMs?: number } = {},
): void {
  embeddingCache.set(normalizeAgentQuery(query), {
    vector,
    expiresAt: (options.now ?? Date.now()) + (options.ttlMs ?? DEFAULT_EMBEDDING_TTL_MS),
  });
}
```

- [ ] **Step 3: Write rate limit tests**

Create `tests/unit/agent-rate-limit.test.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import { checkAgentRateLimit, clearAgentRateLimit } from '@/lib/agent-search/rate-limit';

describe('agent rate limit', () => {
  beforeEach(() => clearAgentRateLimit());

  it('allows requests under the limit and rejects over limit', () => {
    expect(checkAgentRateLimit('ip:1', { limit: 2, windowMs: 1000, now: 1000 }).allowed).toBe(true);
    expect(checkAgentRateLimit('ip:1', { limit: 2, windowMs: 1000, now: 1100 }).allowed).toBe(true);
    expect(checkAgentRateLimit('ip:1', { limit: 2, windowMs: 1000, now: 1200 }).allowed).toBe(false);
    expect(checkAgentRateLimit('ip:1', { limit: 2, windowMs: 1000, now: 2101 }).allowed).toBe(true);
  });
});
```

- [ ] **Step 4: Implement rate limiter**

Create `lib/agent-search/rate-limit.ts`:

```ts
interface RateBucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, RateBucket>();

export function clearAgentRateLimit(): void {
  buckets.clear();
}

export function checkAgentRateLimit(
  key: string,
  options: { limit?: number; windowMs?: number; now?: number } = {},
): { allowed: true; remaining: number; resetAt: number } | { allowed: false; remaining: 0; resetAt: number } {
  const limit = options.limit ?? 60;
  const windowMs = options.windowMs ?? 60 * 1000;
  const now = options.now ?? Date.now();
  const existing = buckets.get(key);

  if (!existing || existing.resetAt <= now) {
    const resetAt = now + windowMs;
    buckets.set(key, { count: 1, resetAt });
    return { allowed: true, remaining: limit - 1, resetAt };
  }

  if (existing.count >= limit) {
    return { allowed: false, remaining: 0, resetAt: existing.resetAt };
  }

  existing.count += 1;
  return { allowed: true, remaining: limit - existing.count, resetAt: existing.resetAt };
}

export function agentRateLimitKey(headers: Headers): string {
  const forwardedFor = headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  const realIp = headers.get('x-real-ip')?.trim();
  return forwardedFor || realIp || 'unknown';
}
```

- [ ] **Step 5: Apply public API protection**

Modify `app/api/agent/search/route.ts`:

- Use `agentRateLimitKey(request.headers)`.
- Call `checkAgentRateLimit(key, { limit: 60, windowMs: 60_000 })`.
- Return `429` with `{ success: false, error: 'Rate limit exceeded' }` when blocked.
- Keep `q` sliced to 200 characters.
- Keep `limit` bounded by existing `parseLimit`.
- Catch unexpected errors and return `{ success: false, error: 'Search temporarily unavailable' }` with status `503`.

Apply the same rate-limit helper to prompt and article detail endpoints with a higher limit such as `120/minute`.

- [ ] **Step 6: Run cache and API tests**

Run:

```bash
npm test -- tests/unit/agent-query-cache.test.ts tests/unit/agent-rate-limit.test.ts tests/unit/agent-search-api.test.ts
```

Expected: PASS.

## Task 8: Add Vector Health And Coverage Scripts

**Files:**
- Create: `scripts/agent-search-vector-health.mjs`
- Create: `scripts/agent-search-vector-reindex-report.mjs`
- Test: `tests/unit/agent-vector-health-script.test.ts`

- [ ] **Step 1: Create health script**

Create `scripts/agent-search-vector-health.mjs`:

```js
#!/usr/bin/env node
import { QdrantClient } from '@qdrant/js-client-rest';

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

async function main() {
  const collection = required('AGENT_QDRANT_COLLECTION');
  if (collection === 'mockingbird_vector_store') {
    throw new Error('Refusing to inspect Console collection from Knowledge health script');
  }

  const client = new QdrantClient({
    host: required('AGENT_QDRANT_HOST'),
    port: Number.parseInt(required('AGENT_QDRANT_HTTP_PORT'), 10),
    apiKey: process.env.AGENT_QDRANT_API_KEY || undefined,
    https: process.env.AGENT_QDRANT_HTTPS === 'true',
    checkCompatibility: false,
  });

  const exists = await client.collectionExists(collection);
  const present = typeof exists === 'boolean' ? exists : exists.exists;
  if (!present) {
    console.log(JSON.stringify({ ok: false, collection, exists: false }, null, 2));
    return;
  }

  const info = await client.getCollection(collection);
  console.log(JSON.stringify({ ok: true, collection, info }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
```

- [ ] **Step 2: Create vector coverage report script**

Create `scripts/agent-search-vector-reindex-report.mjs`:

```js
#!/usr/bin/env node
import 'dotenv/config';
import mysql from 'mysql2/promise';

function mysqlUrl() {
  const url = process.env.MYSQL_URL;
  if (!url) throw new Error('MYSQL_URL is required');
  return url;
}

async function scalar(conn, sql, params = []) {
  const [rows] = await conn.execute(sql, params);
  return Number(rows[0]?.count || 0);
}

async function main() {
  const conn = await mysql.createConnection(mysqlUrl());
  try {
    const promptDocuments = await scalar(conn, "SELECT COUNT(*) AS count FROM AgentSearchDocuments WHERE ContentType = 'prompt' AND Site = 'ai'");
    const articleDocuments = await scalar(conn, "SELECT COUNT(*) AS count FROM AgentSearchDocuments WHERE ContentType = 'article' AND Site = 'ai'");
    const embeddedChunks = await scalar(conn, 'SELECT COUNT(*) AS count FROM AgentSearchChunks WHERE EmbeddedAt IS NOT NULL');
    const totalChunks = await scalar(conn, 'SELECT COUNT(*) AS count FROM AgentSearchChunks');

    console.log([
      '# Agent Search Vector Coverage',
      '',
      `- Prompt documents: ${promptDocuments}`,
      `- Article documents: ${articleDocuments}`,
      `- Embedded chunks: ${embeddedChunks}`,
      `- Total chunks: ${totalChunks}`,
    ].join('\n'));
  } finally {
    await conn.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
```

- [ ] **Step 3: Run scripts in dry mode**

Run:

```bash
node scripts/agent-search-vector-health.mjs
node scripts/agent-search-vector-reindex-report.mjs
```

Expected: health script reports whether `mockingbird_knowledge_assets` exists. Coverage script reports MySQL chunk embedding coverage without secrets.

## Task 9: Update Skill Documentation For Public Use

**Files:**
- Modify: `skills/mockingbird-knowledge/SKILL.md`
- Modify: `skills/mockingbird-knowledge/references/api.md`
- Modify if mirrored: `/Users/grank/.codex/skills/mockingbird-knowledge/SKILL.md`
- Modify if mirrored: `/Users/grank/.codex/skills/mockingbird-knowledge/references/api.md`
- Test: `tests/unit/mockingbird-knowledge-skill.test.ts`

- [ ] **Step 1: Update skill rules**

Add these rules to `skills/mockingbird-knowledge/SKILL.md`:

```markdown
- Treat search as a public semantic retrieval API; do not attempt to call embedding providers or vector databases directly.
- Never request, store, or print Qdrant, embedding, R2, or admin credentials.
- If search fails or returns no results, try a narrower query before making claims from memory.
- Search is ranked by server-side semantic relevance, keyword match, and asset quality signals.
```

- [ ] **Step 2: Update API reference**

Add to `skills/mockingbird-knowledge/references/api.md`:

```markdown
## Search Ranking

The public API may use server-side hybrid retrieval. The skill should treat `score` as an opaque ranking score and should not assume the score is only keyword-based.

The server may include optional fields such as `retrievalMode`, `semanticScore`, or `keywordScore`. These fields are informational and may change; stable fields are `type`, `id`, `title`, `summary`, `url`, `mediaTypes`, `outputFormats`, `useCases`, and `qualitySignals`.

## Public Boundary

The skill must not access Qdrant, embedding providers, R2 credentials, admin endpoints, indexing endpoints, or revalidation endpoints. All intelligence lives behind `/api/agent/*`.
```

- [ ] **Step 3: Run skill tests**

Run:

```bash
npm test -- tests/unit/mockingbird-knowledge-skill.test.ts
```

Expected: PASS.

## Task 10: Launch Verification

**Files:**
- Create: `docs/superpowers/reports/2026-06-08-agent-search-phase-2-launch-report.md`

- [ ] **Step 1: Run full focused Phase 2 tests**

Run:

```bash
npm test -- \
  tests/unit/agent-semantic-config.test.ts \
  tests/unit/agent-embedding-client.test.ts \
  tests/unit/agent-vector-store.test.ts \
  tests/unit/agent-vector-points.test.ts \
  tests/unit/agent-hybrid-ranker.test.ts \
  tests/unit/agent-search-indexer-vector.test.ts \
  tests/unit/r2-object-cache.test.ts \
  tests/unit/agent-query-cache.test.ts \
  tests/unit/agent-rate-limit.test.ts \
  tests/unit/agent-search-api.test.ts \
  tests/unit/mockingbird-knowledge-skill.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run standard verification**

Run:

```bash
npm run lint
npm test
npm run build
```

Expected: PASS.

- [ ] **Step 3: Verify Qdrant collection health**

Run with production-equivalent non-secret env loaded:

```bash
node scripts/agent-search-vector-health.mjs
```

Expected: `mockingbird_knowledge_assets` exists, is green, uses 768 dimensions and Cosine distance.

- [ ] **Step 4: Reindex into vectors**

Run:

```bash
curl -sS -X POST http://localhost:5046/api/agent/index \
  -H "Authorization: Bearer $KNOWLEDGE_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"type":"all","site":"ai"}'
```

Expected: failures are zero or explicitly listed.

- [ ] **Step 5: Verify vector coverage**

Run:

```bash
node scripts/agent-search-vector-reindex-report.mjs
```

Expected: embedded chunk count equals total chunk count, unless skipped chunks are explicitly documented.

- [ ] **Step 6: Verify public skill search**

Run:

```bash
MOCKINGBIRD_KNOWLEDGE_BASE_URL=http://localhost:5046 \
node skills/mockingbird-knowledge/scripts/search.mjs "产品海报" --type=prompt --media=image --limit=5

MOCKINGBIRD_KNOWLEDGE_BASE_URL=http://localhost:5046 \
node skills/mockingbird-knowledge/scripts/search.mjs "Agent 工作流" --type=article --limit=5
```

Expected: results return public URLs, asset fields, and no internal Qdrant/R2/embedding details.

- [ ] **Step 7: Write launch report**

Create `docs/superpowers/reports/2026-06-08-agent-search-phase-2-launch-report.md`:

```markdown
# Agent Search Phase 2 Launch Report

Date: 2026-06-08

## Verification

- Focused tests:
- Lint:
- Full test:
- Build:

## Qdrant

- Collection:
- Dimension:
- Distance:
- Points:

## Reindex

- Prompt documents:
- Article documents:
- Chunks:
- Embedded chunks:
- Failures:

## R2 Cache

- Manifest cache:
- Markdown cache:
- Revalidation clearing:

## Public API Smoke

- Prompt image search:
- Article search:
- Prompt detail:
- Article detail:

## Known Follow-Ups

## Launch Decision
```

Expected: no secrets and no internal credentials.

## Acceptance Criteria

- `mockingbird_knowledge_assets` exists as a separate Qdrant collection.
- Knowledge Website never writes to `mockingbird_vector_store`.
- Embedding and Qdrant access are server-side only.
- Public skill continues to call only `/api/agent/search`, `/api/agent/prompts/:id`, and `/api/agent/articles/:slug`.
- Search works when semantic search is enabled.
- Search falls back to keyword search when semantic search fails.
- R2 manifest and markdown reads are cached.
- Public Agent APIs have rate limiting and bounded inputs.
- Full data readiness, vector coverage, and launch reports exist.

## Execution Options

Plan complete and saved to `docs/superpowers/plans/2026-06-08-agent-search-phase-2-open-semantic-search.md`.

1. **Subagent-Driven (recommended)** - Dispatch a fresh subagent per task, review between tasks, fastest safe iteration.
2. **Inline Execution** - Execute tasks in this session using executing-plans, with checkpoints after major tasks.
