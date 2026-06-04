# Prompt Media R2 Migration And Repair Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move prompt images/videos to Cloudflare R2, repair missed Seedance video extraction, migrate existing 7,086 prompt media records safely, and keep rollback paths for production data.

**Architecture:** Keep the prompt database as the runtime source of truth, but change media values from local `/content/prompts/media/...` paths to public R2 URLs under `https://assets.zgnknowledge.online/prompts/media/...`. New prompt sync still downloads and post-processes media locally first, then uploads final image/video/preview files to R2 and writes R2 URLs to MySQL. Existing media migrates through a manifest-driven script: audit, upload, verify, DB backup, dry-run SQL, apply, and rollback.

**Tech Stack:** Next.js App Router, TypeScript, Vitest, MySQL, Node scripts, Cloudflare R2 S3-compatible API, `@aws-sdk/client-s3`, existing media processor and prompt sync pipeline.

---

## Production Facts Confirmed

Current production prompt media state:

```text
Prompts total: 7086
CoverImageUrl: 7086
ImagesJson: 7086
VideoPreviewUrl: 290
CardPreviewVideoUrl: 153
All current media URL prefixes: /content/prompts/media
```

Current production media directory:

```text
/opt/mockingbird-knowledge-web/media
files: 11639
size: 2.11 GB
.webp: 8745
.jpg: 2109
.mp4: 767
.png: 17
.part: 1
```

Current Seedance source audit:

```text
yoomind-seedance-2 parsed records: 105
watch links in README: 105
Cloudflare Stream thumbnails: 85
direct .mp4 links: 5
current new adapter videoUrls: 0
```

Root cause for missed new videos:

```text
lib/pipelines/prompt-sources/adapters/github-readme-yoomind.ts currently sets videoUrls: []
```

## Target R2 Layout

Use the existing bucket and public asset host:

```text
bucket: knowledge-articles
public host: https://assets.zgnknowledge.online
```

Prompt media objects:

```text
prompts/media/images/{fileName}
prompts/media/videos/{fileName}
prompts/media/previews/{fileName}
prompts/media/legacy/{fileName}
```

Migration rule:

```text
/content/prompts/media/{fileName}
  -> https://assets.zgnknowledge.online/prompts/media/legacy/{fileName}
```

New-sync rule:

```text
new images -> https://assets.zgnknowledge.online/prompts/media/images/{fileName}
new videos -> https://assets.zgnknowledge.online/prompts/media/videos/{fileName}
new card previews -> https://assets.zgnknowledge.online/prompts/media/previews/{fileName}
```

Keep the existing local route:

```text
/content/prompts/media/[fileName]
```

This remains a fallback for old values until DB migration is verified and deployed.

---

## File Structure

- Modify `lib/pipelines/prompt-sources/adapters/github-readme-yoomind.ts`: restore video extraction for direct `.mp4`, Cloudflare Stream thumbnail inference, and optional configured video patterns.
- Modify `tests/unit/prompt-readme-sync.test.ts`: add regression coverage for Seedance direct mp4 and thumbnail-derived videos in the new adapter.
- Create `lib/pipelines/r2-media-store.ts`: reusable R2 upload/head helpers for prompt media.
- Modify `lib/pipelines/media-pipeline.ts`: keep local post-processing, then optionally upload final files to R2 and return public URLs when enabled.
- Modify `lib/pipelines/prompt-sources/remote-sync.ts`: support R2-returned URLs and avoid treating public R2 URLs as local files for preview extraction.
- Modify `next.config.ts`: allow prompt R2 image host if required by `next/image`.
- Create `scripts/prompt-media-r2-migrate.mjs`: production migration tool with `audit`, `upload`, `verify`, `backup-db`, `dry-run-db`, `apply-db`, and `rollback-db`.
- Create `docs/运维/R2提示词媒体迁移与修复.md`: production runbook.
- Update `.env.example`: document prompt media R2 settings.

## Environment Contract

```env
PROMPT_MEDIA_STORAGE=r2
PROMPT_MEDIA_R2_BUCKET=knowledge-articles
PROMPT_MEDIA_R2_PREFIX=prompts/media
PROMPT_MEDIA_R2_PUBLIC_BASE_URL=https://assets.zgnknowledge.online/prompts/media
PROMPT_MEDIA_LOCAL_FALLBACK_DIR=/opt/mockingbird-knowledge-web/media
```

R2 credentials reuse:

```env
R2_ACCOUNT_ID=...
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
```

---

### Task 1: Repair Seedance Video Extraction

**Files:**
- Modify: `lib/pipelines/prompt-sources/adapters/github-readme-yoomind.ts`
- Modify: `tests/unit/prompt-readme-sync.test.ts`

- [ ] **Step 1: Add failing tests for new adapter video extraction**

Add tests under `describe('YouMind README source adapter', ...)` in `tests/unit/prompt-readme-sync.test.ts`:

```ts
it('extracts direct mp4 links into videoUrls', async () => {
    const readme = `
### No. 2: Direct MP4 Seedance Prompt

#### 📝 提示词

\`\`\`
video prompt body
\`\`\`

#### 🎬 视频

<a href="https://github.com/YouMind-OpenLab/awesome-seedance-2-prompts/releases/download/videos/594.mp4">
<img src="https://customer-qs6wnyfuv0gcybzj.cloudflarestream.com/e066fab457509bc6809ea212ae5d6a51/thumbnails/thumbnail.jpg" width="700">
</a>
`;

    const records = await githubReadmeYouMindAdapter.parse(readme, {
        id: 'yoomind-seedance-2',
        type: 'github-readme',
        owner: 'YouMind-OpenLab',
        repo: 'awesome-seedance-2-prompts',
        branch: 'main',
        file: 'README_zh.md',
        rawUrlTemplate: 'https://raw.githubusercontent.com/{owner}/{repo}/{branch}/{file}',
        repoUrlTemplate: 'https://github.com/{owner}/{repo}',
        adapter: 'github-readme-yoomind',
        defaultCategory: 'seedance-2',
        enabled: true,
    });

    expect(records[0].videoUrls).toEqual([
        'https://github.com/YouMind-OpenLab/awesome-seedance-2-prompts/releases/download/videos/594.mp4',
    ]);
});

it('infers Cloudflare Stream download URLs from thumbnail-only Seedance records', async () => {
    const readme = `
### No. 6: Thumbnail Only Seedance Prompt

#### 📝 提示词

\`\`\`
video prompt body
\`\`\`

#### 🎬 视频

<img src="https://customer-qs6wnyfuv0gcybzj.cloudflarestream.com/3a7fb0a6d706b9f568479bb720ce1ad4/thumbnails/thumbnail.jpg" width="700">

**[🎬 观看视频 →](https://youmind.com/zh-CN/seedance-2-0-prompts?id=2530)**
`;

    const records = await githubReadmeYouMindAdapter.parse(readme, {
        id: 'yoomind-seedance-2',
        type: 'github-readme',
        owner: 'YouMind-OpenLab',
        repo: 'awesome-seedance-2-prompts',
        branch: 'main',
        file: 'README_zh.md',
        rawUrlTemplate: 'https://raw.githubusercontent.com/{owner}/{repo}/{branch}/{file}',
        repoUrlTemplate: 'https://github.com/{owner}/{repo}',
        adapter: 'github-readme-yoomind',
        defaultCategory: 'seedance-2',
        enabled: true,
    });

    expect(records[0].videoUrls).toEqual([
        'https://customer-qs6wnyfuv0gcybzj.cloudflarestream.com/3a7fb0a6d706b9f568479bb720ce1ad4/downloads/default.mp4',
    ]);
});
```

- [ ] **Step 2: Run red test**

Run:

```bash
npm test -- tests/unit/prompt-readme-sync.test.ts
```

Expected: FAIL because `videoUrls` is still empty.

- [ ] **Step 3: Implement extraction helpers**

In `lib/pipelines/prompt-sources/adapters/github-readme-yoomind.ts`, add:

```ts
function inferCloudflareVideoDownloadUrl(imageUrl: string): string | null {
    try {
        const parsed = new URL(imageUrl);
        if (!parsed.hostname.endsWith('cloudflarestream.com')) return null;
        const match = parsed.pathname.match(/^\/([^/]+)\/thumbnails\//i);
        if (!match) return null;
        return `https://${parsed.hostname}/${match[1]}/downloads/default.mp4`;
    } catch {
        return null;
    }
}

function extractDirectVideoUrls(section: string): string[] {
    const htmlLinks = [...section.matchAll(/<a\s[^>]*href=["'](.*?\.mp4(?:\?[^"']*)?)["'][^>]*>/gi)]
        .map((match) => match[1].trim());
    const plainLinks = [...section.matchAll(/https?:\/\/[^\s"')]+\.mp4(?:\?[^\s"')]+)?/gi)]
        .map((match) => match[0].trim());
    return Array.from(new Set([...htmlLinks, ...plainLinks]));
}

function extractVideoUrls(section: string, imageUrls: string[]): string[] {
    const directUrls = extractDirectVideoUrls(section);
    if (directUrls.length > 0) return directUrls;

    return imageUrls
        .map((imageUrl) => inferCloudflareVideoDownloadUrl(imageUrl))
        .filter((videoUrl): videoUrl is string => Boolean(videoUrl));
}
```

Then change record construction:

```ts
const mediaUrls = extractImages(body);
const videoUrls = extractVideoUrls(body, mediaUrls);
```

And use:

```ts
mediaUrls,
videoUrls,
```

- [ ] **Step 4: Run green test**

Run:

```bash
npm test -- tests/unit/prompt-readme-sync.test.ts
```

Expected: PASS.

- [ ] **Step 5: Live parse audit**

Run a temporary live audit:

```bash
cat > tests/unit/prompt-source-live-video-audit.test.ts <<'EOF'
import { describe, it } from 'vitest';
import { loadPromptSourceConfigs } from '@/lib/pipelines/prompt-sources/source-config';
import { selectPromptSourceAdapter } from '@/lib/pipelines/prompt-sources/adapters';

describe('live prompt source video audit', () => {
    it('audits parsed media counts', async () => {
        const sources = await loadPromptSourceConfigs();
        for (const source of sources) {
            const adapter = selectPromptSourceAdapter(source)!;
            const input = await adapter.fetchSource(source);
            const records = await adapter.parse(input, source);
            console.log(`${source.id}\trecords=${records.length}\tvideos=${records.filter((record) => (record.videoUrls || []).length > 0).length}`);
        }
    }, 30000);
});
EOF
npm test -- tests/unit/prompt-source-live-video-audit.test.ts
rm tests/unit/prompt-source-live-video-audit.test.ts
```

Expected: `yoomind-seedance-2` reports non-zero videos.

---

### Task 2: Add Prompt Media R2 Store

**Files:**
- Create: `lib/pipelines/r2-media-store.ts`
- Create: `tests/unit/r2-media-store.test.ts`

- [ ] **Step 1: Write failing R2 media store tests**

Create `tests/unit/r2-media-store.test.ts`:

```ts
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@aws-sdk/client-s3', async () => {
    const actual = await vi.importActual<typeof import('@aws-sdk/client-s3')>('@aws-sdk/client-s3');
    return { ...actual, S3Client: vi.fn() };
});

describe('R2 prompt media store', () => {
    afterEach(() => {
        delete process.env.R2_ACCOUNT_ID;
        delete process.env.R2_ACCESS_KEY_ID;
        delete process.env.R2_SECRET_ACCESS_KEY;
        delete process.env.PROMPT_MEDIA_R2_BUCKET;
        delete process.env.PROMPT_MEDIA_R2_PREFIX;
        delete process.env.PROMPT_MEDIA_R2_PUBLIC_BASE_URL;
        vi.resetModules();
        vi.clearAllMocks();
    });

    it('uploads prompt media and returns the public R2 URL', async () => {
        process.env.R2_ACCOUNT_ID = 'account-id';
        process.env.R2_ACCESS_KEY_ID = 'access-key';
        process.env.R2_SECRET_ACCESS_KEY = 'secret-key';
        process.env.PROMPT_MEDIA_R2_BUCKET = 'knowledge-articles';
        process.env.PROMPT_MEDIA_R2_PREFIX = 'prompts/media';
        process.env.PROMPT_MEDIA_R2_PUBLIC_BASE_URL = 'https://assets.zgnknowledge.online/prompts/media';

        const send = vi.fn(async (command: PutObjectCommand) => {
            expect(command.input).toMatchObject({
                Bucket: 'knowledge-articles',
                Key: 'prompts/media/images/cat.webp',
                ContentType: 'image/webp',
            });
            return {};
        });
        vi.mocked(S3Client).mockImplementation(() => ({ send }) as unknown as S3Client);

        const { uploadPromptMediaToR2 } = await import('@/lib/pipelines/r2-media-store');
        await expect(uploadPromptMediaToR2({
            kind: 'images',
            fileName: 'cat.webp',
            body: Buffer.from('image'),
            contentType: 'image/webp',
        })).resolves.toBe('https://assets.zgnknowledge.online/prompts/media/images/cat.webp');
    });
});
```

- [ ] **Step 2: Run red test**

Run:

```bash
npm test -- tests/unit/r2-media-store.test.ts
```

Expected: FAIL because module does not exist.

- [ ] **Step 3: Implement R2 media upload helper**

Create `lib/pipelines/r2-media-store.ts`:

```ts
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

type PromptMediaKind = 'images' | 'videos' | 'previews' | 'legacy';

let cachedClient: S3Client | null = null;
let cachedSignature = '';

function getClient(): S3Client {
    const accountId = process.env.R2_ACCOUNT_ID?.trim();
    const accessKeyId = process.env.R2_ACCESS_KEY_ID?.trim();
    const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY?.trim();
    if (!accountId || !accessKeyId || !secretAccessKey) {
        throw new Error('R2 credentials are not configured');
    }

    const signature = `${accountId}:${accessKeyId}:${secretAccessKey}`;
    if (cachedClient && cachedSignature === signature) return cachedClient;

    cachedClient = new S3Client({
        region: 'auto',
        endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
        credentials: { accessKeyId, secretAccessKey },
    });
    cachedSignature = signature;
    return cachedClient;
}

function joinKey(...parts: string[]): string {
    return parts.map((part) => part.replace(/^\/+|\/+$/g, '')).filter(Boolean).join('/');
}

export async function uploadPromptMediaToR2(input: {
    kind: PromptMediaKind;
    fileName: string;
    body: Buffer;
    contentType: string;
}): Promise<string> {
    const bucket = process.env.PROMPT_MEDIA_R2_BUCKET?.trim();
    const prefix = process.env.PROMPT_MEDIA_R2_PREFIX?.trim() || 'prompts/media';
    const publicBaseUrl = process.env.PROMPT_MEDIA_R2_PUBLIC_BASE_URL?.trim();

    if (!bucket) throw new Error('PROMPT_MEDIA_R2_BUCKET is not configured');
    if (!publicBaseUrl) throw new Error('PROMPT_MEDIA_R2_PUBLIC_BASE_URL is not configured');

    const key = joinKey(prefix, input.kind, input.fileName);
    await getClient().send(new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: input.body,
        ContentType: input.contentType,
    }));

    return `${publicBaseUrl.replace(/\/+$/g, '')}/${input.kind}/${encodeURIComponent(input.fileName)}`;
}
```

- [ ] **Step 4: Run green test**

Run:

```bash
npm test -- tests/unit/r2-media-store.test.ts
```

Expected: PASS.

---

### Task 3: Upload New Prompt Media To R2 During Sync

**Files:**
- Modify: `lib/pipelines/media-pipeline.ts`
- Modify: `lib/pipelines/prompt-sources/remote-sync.ts`
- Modify: `tests/unit/media-pipeline.test.ts`
- Modify: `tests/unit/prompt-source-remote-sync.test.ts`

- [ ] **Step 1: Add failing test for R2 upload after local post-processing**

Extend `tests/unit/media-pipeline.test.ts` to mock `uploadPromptMediaToR2` and verify `downloadMedia()` returns the R2 URL when `PROMPT_MEDIA_STORAGE=r2`.

Use expected behavior:

```text
download source image -> local file -> post-process -> upload to R2 -> return https://assets.zgnknowledge.online/prompts/media/images/{file}
```

- [ ] **Step 2: Add failing test for existing R2 media values**

Extend `tests/unit/prompt-source-remote-sync.test.ts`:

```ts
it('does not try to generate local preview files from existing R2 video URLs', async () => {
    // existing.VideoPreviewUrl = 'https://assets.zgnknowledge.online/prompts/media/videos/demo.mp4'
    // expected: createCardPreviewVideo is not called, existing URL is preserved
});
```

- [ ] **Step 3: Implement R2 upload in `media-pipeline.ts`**

After `postProcessMedia()` returns local URL, resolve the processed local file path and upload to R2 when:

```ts
process.env.PROMPT_MEDIA_STORAGE === 'r2'
```

Kind mapping:

```text
image files -> images
video files -> videos
card preview files -> previews
legacy migration files -> legacy
```

Keep fallback behavior:

```text
if upload fails, log warning and return local /content/prompts/media/... path
```

- [ ] **Step 4: Update preview generation path handling**

In `remote-sync.ts`, only generate `CardPreviewVideoUrl` from a local video path when:

```ts
videoPreviewUrl.startsWith('/content/prompts/media/')
```

Do not attempt `path.basename()` and local filesystem preview generation for `https://assets...` URLs.

- [ ] **Step 5: Run tests**

Run:

```bash
npm test -- tests/unit/media-pipeline.test.ts tests/unit/prompt-source-remote-sync.test.ts tests/unit/r2-media-store.test.ts
```

Expected: PASS.

---

### Task 4: Build Migration Audit Manifest

**Files:**
- Create: `scripts/prompt-media-r2-migrate.mjs`
- Create: `docs/运维/R2提示词媒体迁移与修复.md`

- [ ] **Step 1: Implement `audit` command**

Create `scripts/prompt-media-r2-migrate.mjs` with command:

```bash
node scripts/prompt-media-r2-migrate.mjs audit \
  --media-dir=/opt/mockingbird-knowledge-web/media \
  --out=/tmp/prompt-media-audit.json
```

Audit output shape:

```json
{
  "generatedAt": "2026-06-03T00:00:00.000Z",
  "mediaDir": "/opt/mockingbird-knowledge-web/media",
  "db": {
    "prompts": 7086,
    "coverCount": 7086,
    "videoCount": 290,
    "cardVideoCount": 153,
    "imagesJsonCount": 7086
  },
  "files": {
    "total": 11639,
    "bytes": 2265359941,
    "byExtension": {
      ".webp": 8745,
      ".jpg": 2109,
      ".mp4": 767,
      ".png": 17,
      ".part": 1
    }
  },
  "references": [
    {
      "fileName": "428ad6e11caf41a18b85cfd3ed4650b5.jpg",
      "localPath": "/content/prompts/media/428ad6e11caf41a18b85cfd3ed4650b5.jpg",
      "r2Url": "https://assets.zgnknowledge.online/prompts/media/legacy/428ad6e11caf41a18b85cfd3ed4650b5.jpg",
      "fields": ["CoverImageUrl", "ImagesJson"],
      "promptIds": [7086]
    }
  ],
  "missingLocalFiles": [],
  "unreferencedLocalFiles": []
}
```

- [ ] **Step 2: Run audit on production read-only**

Run on server:

```bash
ssh mk_website 'cd /home/grank/apps/infra && docker compose exec -T mockingbird-knowledge-web node /app/scripts/prompt-media-r2-migrate.mjs audit --media-dir=/opt/mockingbird-knowledge-web/media --out=/tmp/prompt-media-audit.json'
```

Expected:

```text
audit complete
missingLocalFiles=0 or explicitly reviewed
```

- [ ] **Step 3: Document stop conditions**

In `docs/运维/R2提示词媒体迁移与修复.md`, add:

```md
Stop migration if:
- missingLocalFiles > 0 and they are referenced by live DB rows
- audit file cannot be written
- R2 credentials are missing
- database backup command fails
- R2 verification has any size mismatch
```

---

### Task 5: Upload Existing Media To R2

**Files:**
- Modify: `scripts/prompt-media-r2-migrate.mjs`

- [ ] **Step 1: Add `upload --dry-run` command**

Command:

```bash
node scripts/prompt-media-r2-migrate.mjs upload \
  --audit=/tmp/prompt-media-audit.json \
  --dry-run
```

Expected output:

```text
wouldUpload=11638
wouldSkipPartFiles=1
```

Rule:

```text
Skip .part files unless referenced by DB, and stop if a .part file is referenced.
```

- [ ] **Step 2: Add real `upload` command**

Command:

```bash
node scripts/prompt-media-r2-migrate.mjs upload \
  --audit=/tmp/prompt-media-audit.json \
  --concurrency=8
```

Behavior:

```text
Upload local files to knowledge-articles/prompts/media/legacy/{fileName}
Record uploaded keys and sizes into /tmp/prompt-media-upload-report.json
Retry transient failures up to 3 times
Exit non-zero if any upload fails
```

- [ ] **Step 3: Add `verify-r2` command**

Command:

```bash
node scripts/prompt-media-r2-migrate.mjs verify-r2 \
  --audit=/tmp/prompt-media-audit.json
```

Behavior:

```text
HEAD every referenced R2 object
Compare content-length to local file size
Report missing or mismatched objects
Exit non-zero if any mismatch
```

---

### Task 6: Backup And Rewrite Existing Database Media URLs

**Files:**
- Modify: `scripts/prompt-media-r2-migrate.mjs`

- [ ] **Step 1: Add `backup-db` command**

Command:

```bash
node scripts/prompt-media-r2-migrate.mjs backup-db \
  --out=/tmp/prompts-media-backup-2026-06-03.json
```

Backup only these columns:

```sql
SELECT Id, CoverImageUrl, VideoPreviewUrl, CardPreviewVideoUrl, ImagesJson
FROM Prompts
WHERE CoverImageUrl LIKE '/content/prompts/media/%'
   OR VideoPreviewUrl LIKE '/content/prompts/media/%'
   OR CardPreviewVideoUrl LIKE '/content/prompts/media/%'
   OR ImagesJson LIKE '%/content/prompts/media/%'
```

- [ ] **Step 2: Add `dry-run-db` command**

Command:

```bash
node scripts/prompt-media-r2-migrate.mjs dry-run-db \
  --backup=/tmp/prompts-media-backup-2026-06-03.json
```

Expected output:

```text
rowsToUpdate=7086
coverUpdates=7086
videoUpdates=290
cardVideoUpdates=153
imagesJsonUpdates=7086
```

- [ ] **Step 3: Add `apply-db` command**

Command:

```bash
node scripts/prompt-media-r2-migrate.mjs apply-db \
  --backup=/tmp/prompts-media-backup-2026-06-03.json
```

Update rule:

```text
/content/prompts/media/{fileName}
  -> https://assets.zgnknowledge.online/prompts/media/legacy/{fileName}
```

SQL behavior:

```text
Use transactions in batches of 200 rows.
Update only rows whose current values still match the backup old values.
Report skipped rows if values changed after backup.
```

- [ ] **Step 4: Add `rollback-db` command**

Command:

```bash
node scripts/prompt-media-r2-migrate.mjs rollback-db \
  --backup=/tmp/prompts-media-backup-2026-06-03.json
```

Rollback behavior:

```text
Use the backup JSON to restore original local paths.
Only update rows whose current values match expected migrated R2 URLs.
Report skipped rows.
```

---

### Task 7: Repair Existing Seedance Records Missing Videos

**Files:**
- Create: `scripts/prompt-video-repair.mjs`
- Test with dry-run first.

- [ ] **Step 1: Add `audit` command**

Command:

```bash
node scripts/prompt-video-repair.mjs audit --source=yoomind-seedance-2 --out=/tmp/seedance-video-repair-audit.json
```

Behavior:

```text
Fetch and parse yoomind-seedance-2.
Find records with videoUrls.
Match DB rows by SourceUrl first, then RawTitle.
Report:
  parsedVideoRecords
  dbMatches
  missingVideoPreviewUrl
  alreadyHasVideoPreviewUrl
  unmatchedParsedRecords
```

- [ ] **Step 2: Add `dry-run` command**

Command:

```bash
node scripts/prompt-video-repair.mjs dry-run --audit=/tmp/seedance-video-repair-audit.json
```

Expected:

```text
Would download/upload videos only for rows with missing VideoPreviewUrl.
Would not overwrite existing VideoPreviewUrl.
Would not update rows without a parsed video URL.
```

- [ ] **Step 3: Add `apply` command**

Command:

```bash
node scripts/prompt-video-repair.mjs apply --audit=/tmp/seedance-video-repair-audit.json --concurrency=2
```

Behavior:

```text
For each missing video:
  download video using existing media pipeline
  compress video
  upload to R2 videos/
  generate card preview if possible
  upload preview to R2 previews/
  update VideoPreviewUrl and CardPreviewVideoUrl only if still null/empty
```

Safety:

```text
Do not overwrite non-empty video fields.
Batch DB updates.
Write /tmp/seedance-video-repair-report.json.
```

- [ ] **Step 4: Verify repair**

Run:

```sql
SELECT Category,
       COUNT(*) AS total,
       SUM(VideoPreviewUrl IS NOT NULL AND VideoPreviewUrl <> '') AS videoCount,
       SUM(CardPreviewVideoUrl IS NOT NULL AND CardPreviewVideoUrl <> '') AS cardVideoCount
FROM Prompts
WHERE Category = 'seedance-2'
GROUP BY Category;
```

Expected:

```text
videoCount increases.
cardVideoCount increases when preview generation succeeds.
```

---

### Task 8: Production Deployment Sequence

**Files:**
- No source changes.

- [ ] **Step 1: Deploy code with backward compatibility**

Deploy only code changes first:

```bash
docker compose up -d --build --force-recreate mockingbird-knowledge-web
```

Required behavior:

```text
Existing /content/prompts/media URLs still work.
New prompt sync can write R2 URLs when PROMPT_MEDIA_STORAGE=r2.
```

- [ ] **Step 2: Enable prompt R2 env vars**

Set on server:

```env
PROMPT_MEDIA_STORAGE=r2
PROMPT_MEDIA_R2_BUCKET=knowledge-articles
PROMPT_MEDIA_R2_PREFIX=prompts/media
PROMPT_MEDIA_R2_PUBLIC_BASE_URL=https://assets.zgnknowledge.online/prompts/media
PROMPT_MEDIA_LOCAL_FALLBACK_DIR=/opt/mockingbird-knowledge-web/media
```

- [ ] **Step 3: Run migration commands in order**

Run:

```bash
node scripts/prompt-media-r2-migrate.mjs audit --media-dir=/opt/mockingbird-knowledge-web/media --out=/tmp/prompt-media-audit.json
node scripts/prompt-media-r2-migrate.mjs upload --audit=/tmp/prompt-media-audit.json --dry-run
node scripts/prompt-media-r2-migrate.mjs upload --audit=/tmp/prompt-media-audit.json --concurrency=8
node scripts/prompt-media-r2-migrate.mjs verify-r2 --audit=/tmp/prompt-media-audit.json
node scripts/prompt-media-r2-migrate.mjs backup-db --out=/tmp/prompts-media-backup-2026-06-03.json
node scripts/prompt-media-r2-migrate.mjs dry-run-db --backup=/tmp/prompts-media-backup-2026-06-03.json
node scripts/prompt-media-r2-migrate.mjs apply-db --backup=/tmp/prompts-media-backup-2026-06-03.json
```

- [ ] **Step 4: Run video repair**

Run:

```bash
node scripts/prompt-video-repair.mjs audit --source=yoomind-seedance-2 --out=/tmp/seedance-video-repair-audit.json
node scripts/prompt-video-repair.mjs dry-run --audit=/tmp/seedance-video-repair-audit.json
node scripts/prompt-video-repair.mjs apply --audit=/tmp/seedance-video-repair-audit.json --concurrency=2
```

- [ ] **Step 5: Verify public runtime**

Run:

```bash
curl -fsS "https://zgnknowledge.online/api/prompts?page=1&pageSize=20" > /tmp/prompts-api.json
node -e "const data=require('/tmp/prompts-api.json'); console.log(data.items.map(x => [x.id, x.coverImageUrl, x.videoPreviewUrl, x.cardPreviewVideoUrl]).slice(0,5))"
```

Expected:

```text
coverImageUrl starts with https://assets.zgnknowledge.online/prompts/media/
videoPreviewUrl starts with https://assets.zgnknowledge.online/prompts/media/ for repaired video rows
```

---

### Task 9: Final Verification

**Files:**
- No source changes.

- [ ] **Step 1: Run focused tests**

Run:

```bash
npm test -- tests/unit/prompt-readme-sync.test.ts tests/unit/prompt-source-config.test.ts tests/unit/prompt-source-remote-sync.test.ts tests/unit/media-pipeline.test.ts tests/unit/r2-media-store.test.ts tests/unit/prompt-media-route.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run build**

Run:

```bash
npm run build
```

Expected: PASS.

- [ ] **Step 3: Run production media integrity query**

Run:

```sql
SELECT
  COUNT(*) AS total,
  SUM(CoverImageUrl LIKE 'https://assets.zgnknowledge.online/prompts/media/%') AS r2Covers,
  SUM(VideoPreviewUrl LIKE 'https://assets.zgnknowledge.online/prompts/media/%') AS r2Videos,
  SUM(CardPreviewVideoUrl LIKE 'https://assets.zgnknowledge.online/prompts/media/%') AS r2CardVideos,
  SUM(ImagesJson LIKE '%https://assets.zgnknowledge.online/prompts/media/%') AS r2ImagesJson
FROM Prompts;
```

Expected:

```text
r2Covers = 7086
r2ImagesJson = 7086
r2Videos >= 290
r2CardVideos >= 153
```

- [ ] **Step 4: Sample public HEAD checks**

Run:

```bash
curl -I "https://assets.zgnknowledge.online/prompts/media/legacy/428ad6e11caf41a18b85cfd3ed4650b5.jpg"
curl -I "https://assets.zgnknowledge.online/prompts/media/videos/<sample>.mp4"
curl -I "https://assets.zgnknowledge.online/prompts/media/previews/<sample>.card.mp4"
```

Expected: HTTP 200 or 302-to-200 for all sampled assets.

---

## Rollback

If database URL rewrite causes runtime issues:

```bash
node scripts/prompt-media-r2-migrate.mjs rollback-db --backup=/tmp/prompts-media-backup-2026-06-03.json
```

If video repair causes bad video values:

```text
Use /tmp/seedance-video-repair-report.json to restore only rows touched by repair.
```

If R2 upload has missing objects:

```text
Do not apply DB rewrite. Re-run upload and verify-r2 until clean.
```

Do not delete local `/opt/mockingbird-knowledge-web/media` until at least one production deploy cycle after R2 URLs have been verified.

## Self-Review

- Spec coverage: covers R2 storage setup, code changes for new media, 7,086-row legacy migration, Seedance video extraction repair, database backup/update/rollback, production verification, and fallback behavior.
- Placeholder scan: no `TBD`, no "do later"; every production-changing action has dry-run or backup first.
- Type consistency: R2 prompt media env vars, object prefixes, and DB fields are named consistently across tasks.
- Scope check: large but coherent because all tasks serve one operational goal: prompt media migration and repair.

