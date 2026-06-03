# SEO And GEO Rebuild Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the site's SEO and GEO foundations around real AI knowledge hub pages, without restoring deleted SEO-only routes.

**Architecture:** Add focused server-side SEO helpers under `lib/seo/`, attach metadata and JSON-LD to existing App Router pages, add a global footer, and expose `robots.txt`, `sitemap.xml`, and `llms.txt`. The implementation must only point crawlers and AI systems to canonical pages that exist today.

**Tech Stack:** Next.js App Router, TypeScript, React server components, Vitest, route handler tests, shell readiness script.

---

## File Map

- Create `lib/seo/metadata.ts`: metadata builders, canonical URL helpers, search/filter `noindex` behavior.
- Create `lib/seo/schema.tsx`: JSON-LD builders and a safe script component.
- Create `app/SiteFooter.tsx`: global footer with real internal links and ICP data.
- Modify `app/layout.tsx`: attach site metadata defaults and render `SiteFooter`.
- Modify existing page files under `app/`: attach page-level metadata and schema where content exists.
- Create `app/robots.ts`: crawler policy with AI bot visibility and `SEO_CAN_INDEX=false` handling.
- Create `app/sitemap.xml/route.ts`: sitemap index or direct URL set for canonical existing pages.
- Create `app/llms.txt/route.ts`: machine-readable AI context file.
- Modify `scripts/check-seo-launch-readiness.sh`: validate new SEO/GEO contract.
- Add tests under `tests/unit/`: metadata, schema, robots/sitemap/llms, footer, and page metadata coverage.

## Guardrails

- Do not recreate `app/ai/articles/categories/[category]/page.tsx`.
- Do not recreate `app/ai/prompts/categories/[category]/page.tsx`.
- Do not recreate `app/ai/prompts/scenarios/*`.
- Do not recreate `app/ai/rankings/topics/*`.
- Do not link to those removed routes from footer, nav, sitemap, robots, llms.txt, or metadata.
- Do not add FAQ schema unless visible FAQ content is present on the page.

### Task 1: Lock The New SEO/GEO Contract In Tests

**Files:**
- Create: `tests/unit/seo-metadata-rebuild.test.ts`
- Create: `tests/unit/seo-schema-rebuild.test.ts`
- Create: `tests/unit/seo-runtime-routes.test.ts`
- Create: `tests/unit/site-footer.test.ts`
- Modify: `tests/unit/seo-teardown.test.ts`

- [ ] **Step 1: Add failing metadata tests**

Create `tests/unit/seo-metadata-rebuild.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const ORIGINAL_SITE_URL = process.env.SITE_URL;
const ORIGINAL_SEO_CAN_INDEX = process.env.SEO_CAN_INDEX;

describe('SEO metadata rebuild', () => {
    beforeEach(() => {
        vi.resetModules();
        process.env.SITE_URL = 'https://aigcclub.com.cn';
        delete process.env.SEO_CAN_INDEX;
    });

    afterEach(() => {
        if (ORIGINAL_SITE_URL === undefined) delete process.env.SITE_URL;
        else process.env.SITE_URL = ORIGINAL_SITE_URL;

        if (ORIGINAL_SEO_CAN_INDEX === undefined) delete process.env.SEO_CAN_INDEX;
        else process.env.SEO_CAN_INDEX = ORIGINAL_SEO_CAN_INDEX;
    });

    it('builds canonical homepage metadata for the AI knowledge hub', async () => {
        const { buildHomeMetadata } = await import('@/lib/seo/metadata');

        const metadata = buildHomeMetadata();

        expect(metadata.title).toBe('AI 知识库：AI 教程、提示词与工具榜单');
        expect(metadata.description).toContain('知更鸟 AI 知识库');
        expect(metadata.alternates?.canonical).toBe('https://aigcclub.com.cn/');
        expect(metadata.openGraph?.url).toBe('https://aigcclub.com.cn/');
    });

    it('marks filtered list pages as noindex follow', async () => {
        const { buildArticlesMetadata } = await import('@/lib/seo/metadata');

        const metadata = buildArticlesMetadata({ hasFilters: true });

        expect(metadata.alternates?.canonical).toBe('https://aigcclub.com.cn/ai/articles');
        expect(metadata.robots).toMatchObject({
            index: false,
            follow: true,
        });
    });

    it('disables indexing when SEO_CAN_INDEX is false', async () => {
        process.env.SEO_CAN_INDEX = 'false';
        vi.resetModules();
        const { buildPromptsMetadata } = await import('@/lib/seo/metadata');

        const metadata = buildPromptsMetadata({ hasFilters: false });

        expect(metadata.robots).toMatchObject({
            index: false,
            follow: false,
        });
    });
});
```

- [ ] **Step 2: Add failing schema tests**

Create `tests/unit/seo-schema-rebuild.test.ts`:

```ts
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

describe('SEO schema rebuild', () => {
    it('builds website and organization schema for the homepage', async () => {
        const { buildOrganizationSchema, buildWebSiteSchema } = await import('@/lib/seo/schema');

        expect(buildOrganizationSchema()).toMatchObject({
            '@context': 'https://schema.org',
            '@type': 'Organization',
            name: expect.stringContaining('知更鸟'),
        });

        expect(buildWebSiteSchema()).toMatchObject({
            '@context': 'https://schema.org',
            '@type': 'WebSite',
            url: expect.stringContaining('http'),
        });
    });

    it('renders JSON-LD without escaping into invalid JSON', async () => {
        const { JsonLdScript } = await import('@/lib/seo/schema');

        const html = renderToStaticMarkup(
            JsonLdScript({
                data: {
                    '@context': 'https://schema.org',
                    '@type': 'CreativeWork',
                    name: 'AI 提示词 <模板>',
                },
            })
        );

        expect(html).toContain('type="application/ld+json"');
        expect(html).toContain('AI 提示词');
        expect(html).not.toContain('</script><script');
    });
});
```

- [ ] **Step 3: Add failing robots, sitemap, and llms tests**

Create `tests/unit/seo-runtime-routes.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/services/article-service', () => ({
    getArticleSitemapEntries: vi.fn(async () => [
        {
            slug: 'agent-workflow',
            site: 'ai',
            path: '/ai/articles/agent-workflow',
            lastModified: '2026-05-20T00:00:00.000Z',
        },
    ]),
}));

vi.mock('@/lib/services/prompt-service', () => ({
    getPromptSitemapEntries: vi.fn(async () => [
        { id: 101, lastModified: '2026-05-21T00:00:00.000Z' },
    ]),
}));

describe('SEO runtime routes', () => {
    it('robots allows AI citation crawlers and points to sitemap', async () => {
        process.env.SITE_URL = 'https://aigcclub.com.cn';
        const { default: robots } = await import('@/app/robots');

        const result = robots();

        expect(result.sitemap).toBe('https://aigcclub.com.cn/sitemap.xml');
        expect(result.rules).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ userAgent: 'GPTBot', allow: '/' }),
                expect.objectContaining({ userAgent: 'PerplexityBot', allow: '/' }),
                expect.objectContaining({ userAgent: 'ClaudeBot', allow: '/' }),
                expect.objectContaining({ userAgent: 'Google-Extended', allow: '/' }),
            ])
        );
    });

    it('sitemap includes canonical pages and excludes removed legacy SEO pages', async () => {
        process.env.SITE_URL = 'https://aigcclub.com.cn';
        const route = await import('@/app/sitemap.xml/route');

        const response = await route.GET();
        const xml = await response.text();

        expect(xml).toContain('<loc>https://aigcclub.com.cn/</loc>');
        expect(xml).toContain('<loc>https://aigcclub.com.cn/ai/articles</loc>');
        expect(xml).toContain('<loc>https://aigcclub.com.cn/ai/prompts</loc>');
        expect(xml).toContain('<loc>https://aigcclub.com.cn/ai/rankings/github</loc>');
        expect(xml).toContain('<loc>https://aigcclub.com.cn/ai/articles/agent-workflow</loc>');
        expect(xml).toContain('<loc>https://aigcclub.com.cn/ai/prompts/101</loc>');
        expect(xml).not.toContain('/ai/rankings/topics');
        expect(xml).not.toContain('/ai/prompts/categories');
        expect(xml).not.toContain('/ai/prompts/scenarios');
    });

    it('llms.txt explains the AI knowledge hub with canonical links', async () => {
        const route = await import('@/app/llms.txt/route');

        const response = await route.GET();
        const text = await response.text();

        expect(text).toContain('# 知更鸟 AI 知识库');
        expect(text).toContain('/ai/articles');
        expect(text).toContain('/ai/prompts');
        expect(text).toContain('/ai/rankings/github');
        expect(text).not.toContain('/ai/rankings/topics');
    });
});
```

- [ ] **Step 4: Add failing footer tests**

Create `tests/unit/site-footer.test.ts`:

```ts
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import SiteFooter from '@/app/SiteFooter';

describe('SiteFooter', () => {
    it('links only to real canonical sections', () => {
        const html = renderToStaticMarkup(createElement(SiteFooter));

        expect(html).toContain('知更鸟 AI 知识库');
        expect(html).toContain('href="/"');
        expect(html).toContain('href="/ai/articles"');
        expect(html).toContain('href="/ai/prompts"');
        expect(html).toContain('href="/ai/rankings/github"');
        expect(html).toContain('href="/about"');
        expect(html).not.toContain('/ai/rankings/topics');
        expect(html).not.toContain('/ai/prompts/categories');
        expect(html).not.toContain('/ai/articles/categories');
    });
});
```

- [ ] **Step 5: Extend teardown tests to guard active references**

In `tests/unit/seo-teardown.test.ts`, add a test that reads `app`, `lib`, and `scripts` files with `rg` is not appropriate inside Vitest. Instead, directly inspect the known active files:

```ts
it('does not link active navigation or readiness checks to removed SEO pages', () => {
    const activeFiles = [
        'app/SiteNav.tsx',
        'scripts/check-seo-launch-readiness.sh',
    ].map(readRepoFile).join('\n');

    expect(activeFiles).not.toContain('href="/ai/rankings/topics"');
    expect(activeFiles).not.toContain('/ai/prompts/categories/');
    expect(activeFiles).not.toContain('/ai/articles/categories/');
});
```

- [ ] **Step 6: Run tests and confirm they fail before implementation**

Run:

```bash
npm test -- tests/unit/seo-metadata-rebuild.test.ts tests/unit/seo-schema-rebuild.test.ts tests/unit/seo-runtime-routes.test.ts tests/unit/site-footer.test.ts tests/unit/seo-teardown.test.ts
```

Expected: FAIL because the new SEO helpers, runtime routes, and footer do not exist yet.

### Task 2: Add Metadata And Schema Helpers

**Files:**
- Create: `lib/seo/metadata.ts`
- Create: `lib/seo/schema.tsx`
- Test: `tests/unit/seo-metadata-rebuild.test.ts`
- Test: `tests/unit/seo-schema-rebuild.test.ts`

- [ ] **Step 1: Implement metadata helpers**

Create `lib/seo/metadata.ts`:

```ts
import type { Metadata } from 'next';
import { buildAbsoluteUrl, getSiteBrandConfig } from '@/lib/site-config';

type ListMetadataOptions = {
    hasFilters?: boolean;
};

type PageMetadataInput = {
    title: string;
    description: string;
    path: string;
    type?: 'website' | 'article';
    noIndex?: boolean;
};

function canIndex(): boolean {
    return process.env.SEO_CAN_INDEX !== 'false';
}

function buildRobots(noIndex?: boolean): Metadata['robots'] {
    if (!canIndex()) {
        return { index: false, follow: false };
    }

    if (noIndex) {
        return { index: false, follow: true };
    }

    return { index: true, follow: true };
}

export function buildPageMetadata(input: PageMetadataInput): Metadata {
    const brand = getSiteBrandConfig();
    const canonical = buildAbsoluteUrl(input.path);

    return {
        title: input.title,
        description: input.description,
        metadataBase: new URL(buildAbsoluteUrl('/')),
        alternates: {
            canonical,
        },
        openGraph: {
            title: input.title,
            description: input.description,
            url: canonical,
            siteName: brand.brandName,
            type: input.type || 'website',
            locale: 'zh_CN',
        },
        twitter: {
            card: 'summary_large_image',
            title: input.title,
            description: input.description,
        },
        robots: buildRobots(input.noIndex),
    };
}

export function buildHomeMetadata(): Metadata {
    return buildPageMetadata({
        title: 'AI 知识库：AI 教程、提示词与工具榜单',
        description: '知更鸟 AI 知识库收录深度文章、AI 教程、提示词模板和工具榜单，帮助你系统追踪 AI 技术、产品和实操方法。',
        path: '/',
    });
}

export function buildArticlesMetadata(options: ListMetadataOptions = {}): Metadata {
    return buildPageMetadata({
        title: 'AI 教程与深度文章',
        description: '阅读 AI 教程、技术解析和产品实践文章，系统理解模型能力、Agent 工作流、提示词方法和 AI 工具趋势。',
        path: '/ai/articles',
        noIndex: options.hasFilters,
    });
}

export function buildPromptsMetadata(options: ListMetadataOptions = {}): Metadata {
    return buildPageMetadata({
        title: 'AI 提示词库：精选提示词模板',
        description: '浏览可复用的 AI 提示词模板，覆盖图像、视频、写作、编程和 Agent 工作流等场景。',
        path: '/ai/prompts',
        noIndex: options.hasFilters,
    });
}

export function buildRankingMetadata(path: string, title: string, description: string): Metadata {
    return buildPageMetadata({
        title,
        description,
        path,
    });
}

export function buildArticleDetailMetadata(input: {
    title: string;
    description: string;
    path: string;
}): Metadata {
    return buildPageMetadata({
        title: input.title,
        description: input.description,
        path: input.path,
        type: 'article',
    });
}

export function buildPromptDetailMetadata(input: {
    title: string;
    description: string;
    path: string;
}): Metadata {
    return buildPageMetadata({
        title: `${input.title} - AI 提示词模板`,
        description: input.description,
        path: input.path,
    });
}
```

- [ ] **Step 2: Implement schema helpers**

Create `lib/seo/schema.tsx`:

```tsx
import { buildAbsoluteUrl, getSiteBrandConfig } from '@/lib/site-config';

type JsonLdValue = Record<string, unknown> | Record<string, unknown>[];

function safeJsonLd(data: JsonLdValue): string {
    return JSON.stringify(data).replace(/</g, '\\u003c');
}

export function JsonLdScript({ data }: { data: JsonLdValue }) {
    return (
        <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{ __html: safeJsonLd(data) }}
        />
    );
}

export function buildOrganizationSchema() {
    const brand = getSiteBrandConfig();

    return {
        '@context': 'https://schema.org',
        '@type': 'Organization',
        name: brand.brandName,
        alternateName: brand.alternateName,
        url: buildAbsoluteUrl('/'),
    };
}

export function buildWebSiteSchema() {
    const brand = getSiteBrandConfig();

    return {
        '@context': 'https://schema.org',
        '@type': 'WebSite',
        name: brand.brandName,
        url: buildAbsoluteUrl('/'),
        inLanguage: 'zh-CN',
    };
}

export function buildCollectionPageSchema(input: {
    name: string;
    description: string;
    path: string;
}) {
    return {
        '@context': 'https://schema.org',
        '@type': 'CollectionPage',
        name: input.name,
        description: input.description,
        url: buildAbsoluteUrl(input.path),
        inLanguage: 'zh-CN',
    };
}

export function buildArticleSchema(input: {
    title: string;
    description: string;
    path: string;
    datePublished?: string | null;
    dateModified?: string | null;
}) {
    return {
        '@context': 'https://schema.org',
        '@type': 'Article',
        headline: input.title,
        description: input.description,
        url: buildAbsoluteUrl(input.path),
        datePublished: input.datePublished || undefined,
        dateModified: input.dateModified || input.datePublished || undefined,
        inLanguage: 'zh-CN',
    };
}

export function buildCreativeWorkSchema(input: {
    title: string;
    description: string;
    path: string;
}) {
    return {
        '@context': 'https://schema.org',
        '@type': 'CreativeWork',
        name: input.title,
        description: input.description,
        url: buildAbsoluteUrl(input.path),
        inLanguage: 'zh-CN',
    };
}
```

- [ ] **Step 3: Run helper tests**

Run:

```bash
npm test -- tests/unit/seo-metadata-rebuild.test.ts tests/unit/seo-schema-rebuild.test.ts
```

Expected: PASS.

### Task 3: Attach Metadata And JSON-LD To Existing Pages

**Files:**
- Modify: `app/layout.tsx`
- Modify: `app/page.tsx`
- Modify: `app/ai/page.tsx`
- Modify: `app/ai/articles/page.tsx`
- Modify: `app/ai/articles/[slug]/page.tsx`
- Modify: `app/ai/prompts/page.tsx`
- Modify: `app/ai/prompts/[id]/page.tsx`
- Modify: `app/ai/rankings/github/page.tsx`
- Modify: `app/ai/rankings/producthunt/page.tsx`
- Modify: `app/ai/rankings/skills-trending/page.tsx`
- Modify: `app/ai/rankings/skills-hot/page.tsx`
- Modify: `app/about/page.tsx`

- [ ] **Step 1: Export root metadata**

In `app/page.tsx` and `app/ai/page.tsx`, export homepage metadata:

```ts
import { buildHomeMetadata } from '@/lib/seo/metadata';

export const metadata = buildHomeMetadata();
```

Keep the existing `runtime`, `revalidate`, and default export.

- [ ] **Step 2: Add homepage JSON-LD**

In `app/ai/AiHomePage.tsx`, render:

```tsx
import {
    JsonLdScript,
    buildCollectionPageSchema,
    buildOrganizationSchema,
    buildWebSiteSchema,
} from '@/lib/seo/schema';
```

Near the top of the returned fragment:

```tsx
<JsonLdScript
    data={[
        buildOrganizationSchema(),
        buildWebSiteSchema(),
        buildCollectionPageSchema({
            name: 'AI 知识库',
            description: 'AI 教程、提示词模板和工具榜单的知识入口。',
            path: '/',
        }),
    ]}
/>
```

- [ ] **Step 3: Add list page metadata**

In `app/ai/articles/page.tsx`, add:

```ts
import { buildArticlesMetadata } from '@/lib/seo/metadata';

export async function generateMetadata({
    searchParams,
}: {
    searchParams: Promise<{ page?: string; category?: string; q?: string }>;
}) {
    const params = await searchParams;
    return buildArticlesMetadata({
        hasFilters: Boolean(params.page || params.category || params.q),
    });
}
```

In `app/ai/prompts/page.tsx`, add the same pattern using `buildPromptsMetadata`.

- [ ] **Step 4: Add detail page metadata**

In article and prompt detail pages, use existing service calls in `generateMetadata` to build detail metadata from the visible item data. If a record is missing, return metadata for the list page rather than throwing from metadata generation.

Article detail shape:

```ts
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
    const { slug } = await params;
    const { getArticleBySlug } = await import('@/lib/services/article-service');
    const article = await getArticleBySlug(slug, { site: 'ai' });

    if (!article) {
        return buildArticlesMetadata();
    }

    return buildArticleDetailMetadata({
        title: article.seoTitle || article.title,
        description: article.seoDescription || article.summary,
        path: `/ai/articles/${article.slug}`,
    });
}
```

Prompt detail shape:

```ts
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const { getPromptById } = await import('@/lib/services/prompt-service');
    const prompt = await getPromptById(Number(id));

    if (!prompt) {
        return buildPromptsMetadata();
    }

    return buildPromptDetailMetadata({
        title: prompt.title,
        description: prompt.description || prompt.content.slice(0, 150),
        path: `/ai/prompts/${prompt.id}`,
    });
}
```

- [ ] **Step 5: Add ranking metadata**

For each ranking page, export static metadata with `buildRankingMetadata`. Example for GitHub:

```ts
export const metadata = buildRankingMetadata(
    '/ai/rankings/github',
    'AI 开源项目榜单：GitHub Trending',
    '查看 GitHub Trending 上正在升温的 AI 开源项目，追踪开发者生态中的工具、框架和产品信号。'
);
```

Use the title patterns from the spec for the other ranking pages.

- [ ] **Step 6: Run page import tests**

Run:

```bash
npm test -- tests/unit/server-entrypoint-lazy-imports.test.ts tests/unit/homepage-prompt-gallery.test.ts tests/unit/prompt-detail-layout.test.ts
```

Expected: PASS.

### Task 4: Add Global Footer

**Files:**
- Create: `app/SiteFooter.tsx`
- Modify: `app/layout.tsx`
- Modify: `app/globals.css`
- Test: `tests/unit/site-footer.test.ts`

- [ ] **Step 1: Implement footer component**

Create `app/SiteFooter.tsx`:

```tsx
import Link from 'next/link';
import { getSiteBrandConfig } from '@/lib/site-config';

const PRIMARY_LINKS = [
    { href: '/', label: 'AI 知识库' },
    { href: '/ai/articles', label: 'AI 文章' },
    { href: '/ai/prompts', label: '提示词库' },
    { href: '/ai/rankings/github', label: 'GitHub 热榜' },
    { href: '/ai/rankings/producthunt', label: 'ProductHunt 热榜' },
    { href: '/ai/rankings/skills-trending', label: '技能趋势' },
    { href: '/ai/rankings/skills-hot', label: '热门技能' },
    { href: '/about', label: '关于我' },
];

export default function SiteFooter() {
    const brand = getSiteBrandConfig();

    return (
        <footer className="site-footer">
            <div className="site-footer-inner">
                <div className="site-footer-brand">
                    <p className="site-footer-title">{brand.brandName}</p>
                    <p className="site-footer-description">
                        聚合 AI 教程、深度文章、提示词模板和工具榜单，帮助你持续跟踪 AI 技术与产品变化。
                    </p>
                </div>

                <nav className="site-footer-links" aria-label="页脚导航">
                    {PRIMARY_LINKS.map((link) => (
                        <Link key={link.href} href={link.href}>
                            {link.label}
                        </Link>
                    ))}
                </nav>

                <div className="site-footer-meta">
                    <a href={brand.icpUrl} target="_blank" rel="noopener noreferrer">
                        {brand.icpNumber}
                    </a>
                </div>
            </div>
        </footer>
    );
}
```

- [ ] **Step 2: Render footer in root layout**

In `app/layout.tsx`, import and render `SiteFooter` after `</main>`:

```tsx
import SiteFooter from './SiteFooter';
```

```tsx
<main className="main-content">
    <div className="container">{children}</div>
</main>
<SiteFooter />
```

- [ ] **Step 3: Add global footer styles**

Append to `app/globals.css`:

```css
.site-footer {
  border-top: 1px solid var(--glass-border);
  background: var(--bg-main);
  padding: 2rem;
}

.site-footer-inner {
  max-width: var(--container-max);
  margin: 0 auto;
  display: grid;
  gap: 1.25rem;
}

.site-footer-title {
  font-family: var(--font-serif);
  font-size: 1.25rem;
  color: var(--text-main);
}

.site-footer-description,
.site-footer-meta {
  color: var(--text-muted);
  font-size: 0.9rem;
}

.site-footer-links {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem 1rem;
}

.site-footer-links a,
.site-footer-meta a {
  color: var(--text-muted);
}

.site-footer-links a:hover,
.site-footer-meta a:hover {
  color: var(--primary);
}
```

- [ ] **Step 4: Run footer tests**

Run:

```bash
npm test -- tests/unit/site-footer.test.ts tests/unit/layout-nav.test.ts
```

Expected: PASS.

### Task 5: Add Robots, Sitemap, And llms.txt

**Files:**
- Create: `app/robots.ts`
- Create: `app/sitemap.xml/route.ts`
- Create: `app/llms.txt/route.ts`
- Test: `tests/unit/seo-runtime-routes.test.ts`

- [ ] **Step 1: Implement robots route**

Create `app/robots.ts`:

```ts
import type { MetadataRoute } from 'next';
import { buildAbsoluteUrl } from '@/lib/site-config';

const AI_CRAWLERS = [
    'GPTBot',
    'ChatGPT-User',
    'PerplexityBot',
    'ClaudeBot',
    'anthropic-ai',
    'Google-Extended',
    'Bingbot',
];

export default function robots(): MetadataRoute.Robots {
    if (process.env.SEO_CAN_INDEX === 'false') {
        return {
            rules: [{ userAgent: '*', disallow: '/' }],
            sitemap: buildAbsoluteUrl('/sitemap.xml'),
        };
    }

    return {
        rules: [
            { userAgent: '*', allow: '/' },
            ...AI_CRAWLERS.map((userAgent) => ({ userAgent, allow: '/' })),
        ],
        sitemap: buildAbsoluteUrl('/sitemap.xml'),
    };
}
```

- [ ] **Step 2: Implement sitemap route**

Create `app/sitemap.xml/route.ts`:

```ts
import { buildAbsoluteUrl } from '@/lib/site-config';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const STATIC_PATHS = [
    '/',
    '/ai/articles',
    '/ai/prompts',
    '/ai/rankings/github',
    '/ai/rankings/producthunt',
    '/ai/rankings/skills-trending',
    '/ai/rankings/skills-hot',
    '/about',
    '/finance',
    '/finance/articles',
];

function escapeXml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

function urlEntry(path: string, lastModified?: string | null): string {
    const loc = escapeXml(buildAbsoluteUrl(path));
    const lastmod = lastModified ? `<lastmod>${escapeXml(new Date(lastModified).toISOString())}</lastmod>` : '';
    return `<url><loc>${loc}</loc>${lastmod}</url>`;
}

export async function GET() {
    const [{ getArticleSitemapEntries }, { getPromptSitemapEntries }] = await Promise.all([
        import('@/lib/services/article-service'),
        import('@/lib/services/prompt-service'),
    ]);

    const [articles, prompts] = await Promise.all([
        getArticleSitemapEntries(),
        getPromptSitemapEntries(),
    ]);

    const urls = [
        ...STATIC_PATHS.map((path) => urlEntry(path)),
        ...articles
            .filter((article) => article.site === 'ai')
            .map((article) => urlEntry(article.path, article.lastModified)),
        ...prompts.map((prompt) => urlEntry(`/ai/prompts/${prompt.id}`, prompt.lastModified)),
    ];

    const xml = `<?xml version="1.0" encoding="UTF-8"?>` +
        `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.join('')}</urlset>`;

    return new Response(xml, {
        headers: {
            'Content-Type': 'application/xml; charset=utf-8',
            'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
        },
    });
}
```

- [ ] **Step 3: Implement llms.txt route**

Create `app/llms.txt/route.ts`:

```ts
import { buildAbsoluteUrl, getSiteBrandConfig } from '@/lib/site-config';

export const runtime = 'nodejs';

export async function GET() {
    const brand = getSiteBrandConfig();
    const lines = [
        `# ${brand.brandName}`,
        '',
        '知更鸟 AI 知识库是面向 AI 从业者、创作者和开发者的中文知识站点，聚合 AI 教程、深度文章、提示词模板和工具榜单。',
        '',
        '## Canonical Sections',
        `- AI 知识库首页: ${buildAbsoluteUrl('/')}`,
        `- AI 教程与文章: ${buildAbsoluteUrl('/ai/articles')}`,
        `- AI 提示词库: ${buildAbsoluteUrl('/ai/prompts')}`,
        `- GitHub AI 开源热榜: ${buildAbsoluteUrl('/ai/rankings/github')}`,
        `- ProductHunt AI 产品热榜: ${buildAbsoluteUrl('/ai/rankings/producthunt')}`,
        `- AI 技能趋势: ${buildAbsoluteUrl('/ai/rankings/skills-trending')}`,
        `- AI 热门技能: ${buildAbsoluteUrl('/ai/rankings/skills-hot')}`,
        `- 关于: ${buildAbsoluteUrl('/about')}`,
        '',
        '## Notes For AI Systems',
        '- Use article detail pages for long-tail tutorial and explainer citations.',
        '- Use prompt detail pages for specific prompt template citations.',
        '- Category, scenario, and ranking topic SEO-only pages are not canonical surfaces on this site.',
    ];

    return new Response(lines.join('\n'), {
        headers: {
            'Content-Type': 'text/plain; charset=utf-8',
            'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
        },
    });
}
```

- [ ] **Step 4: Run runtime route tests**

Run:

```bash
npm test -- tests/unit/seo-runtime-routes.test.ts
```

Expected: PASS.

### Task 6: Update Readiness Script And Final Verification

**Files:**
- Modify: `scripts/check-seo-launch-readiness.sh`
- Test: focused tests from previous tasks

- [ ] **Step 1: Add runtime checks for new SEO/GEO endpoints**

Update `scripts/check-seo-launch-readiness.sh` so step 1 checks:

```bash
curl -fsS "${BASE_URL}/robots.txt" | rg "Sitemap: ${BASE_URL}/sitemap.xml|GPTBot|PerplexityBot|ClaudeBot"
curl -fsS "${BASE_URL}/sitemap.xml" | rg "<loc>${BASE_URL}/</loc>|<loc>${BASE_URL}/ai/articles</loc>|<loc>${BASE_URL}/ai/prompts</loc>"
curl -fsS "${BASE_URL}/llms.txt" | rg "知更鸟 AI 知识库|/ai/articles|/ai/prompts|/ai/rankings/github"
```

Keep the legacy 404 loop added during teardown cleanup.

- [ ] **Step 2: Run all SEO/GEO tests**

Run:

```bash
npm test -- tests/unit/seo-metadata-rebuild.test.ts tests/unit/seo-schema-rebuild.test.ts tests/unit/seo-runtime-routes.test.ts tests/unit/site-footer.test.ts tests/unit/seo-teardown.test.ts tests/unit/layout-nav.test.ts tests/unit/about-nav.test.ts tests/unit/article-route-paths.test.ts
```

Expected: PASS.

- [ ] **Step 3: Run lint**

Run:

```bash
npm run lint
```

Expected: PASS with no errors. Existing warnings may remain if unrelated.

- [ ] **Step 4: Run production build**

Run:

```bash
npm run build
```

Expected: PASS. If the build fails because MySQL closes a connection during static prompt prerendering, stop and report that as a separate build blocker rather than changing SEO code to mask it.

- [ ] **Step 5: Run local readiness script**

Start the dev server:

```bash
npm run dev
```

Then run:

```bash
scripts/check-seo-launch-readiness.sh http://localhost:5046
```

Expected: PASS.

## Self-Review

- Spec coverage: The plan covers metadata, schema, footer, robots, sitemap, llms.txt, readiness, and tests.
- Legacy guardrails: The plan explicitly forbids recreating deleted SEO-only routes and adds tests/404 checks for them.
- GEO coverage: The plan adds AI crawler policy, `llms.txt`, extractable page metadata/schema foundations, and citation-friendly route discovery.
- Build risk: The plan calls out the existing MySQL prerender build failure as a separate blocker if it recurs.
