# Content Restructuring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure the site into a portal-style brand homepage with independent AI and Finance subsites.

**Architecture:** Brand homepage at `/` serves as entry point with two subsite entry cards. AI subsite at `/ai/*` contains all current functionality (articles, prompts, rankings). Finance subsite at `/finance/*` starts with articles only. A path-aware `<SiteNav>` client component renders different navigation based on the current URL segment.

**Tech Stack:** Next.js App Router, React 19, TypeScript, CSS (globals.css)

---

## File Structure

### New Files
- `app/SiteNav.tsx` — Path-aware navigation client component
- `app/finance/page.tsx` — Finance subsite homepage

### Moved Directories
- `app/prompts/` → `app/ai/prompts/`
- `app/rankings/` → `app/ai/rankings/`

### Modified Files
- `app/layout.tsx` — Replace inline nav with `<SiteNav />`
- `app/page.tsx` — Replace with brand homepage
- `app/ai/page.tsx` — Create (adapted from current homepage, updated links)
- All moved prompt/ranking pages — Update internal links
- `app/ai/articles/page.tsx` — Update INTERNAL_LINKS
- `app/ai/articles/[slug]/page.tsx` — Update ARTICLE_EXPLORATION_LINKS
- `app/ai/articles/categories/[category]/page.tsx` — Update links
- `app/finance/articles/page.tsx` — Update INTERNAL_LINKS
- `app/finance/articles/[slug]/page.tsx` — Update ARTICLE_EXPLORATION_LINKS
- `lib/seo/internal-links.ts` — Update `/prompts` and `/rankings` to `/ai/prompts` and `/ai/rankings`
- `middleware.ts` — Add `/ai/` and `/finance/` to public prefixes
- `app/globals.css` — Add brand homepage styles

---

## Task 1: Create SiteNav Client Component

**Files:**
- Create: `app/SiteNav.tsx`

- [ ] **Step 1: Create `app/SiteNav.tsx`**

This client component renders different navigation based on `usePathname()`. Three variants:
- **AI subsite** (`/ai/*`): brand→`/`, AI文章, 提示词, 热榜▼, 学社, auth
- **Finance subsite** (`/finance/*`): brand→`/`, 金融文章, 学社, auth
- **Default** (brand home, auth pages, profile, etc.): brand, AI知识库, 金融知识库, 学社, auth

```tsx
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import NavAuthButton from './NavAuthButton';
import { getArticleListPath } from '@/lib/articles/article-route-paths';
import { getSiteSeoConfig } from '@/lib/seo/config';

const SITE_CONFIG = getSiteSeoConfig();

export default function SiteNav() {
  const pathname = usePathname();
  const segment = pathname.split('/')[1] || '';

  // ── AI Subsite Navigation ──
  if (segment === 'ai') {
    return (
      <nav className="top-nav">
        <div className="nav-left" />
        <div className="nav-center">
          <div className="nav-divider" />
          <div className="nav-brand-name">
            <Link href="/">{SITE_CONFIG.brandName}</Link>
          </div>
          <div className="nav-divider" />
        </div>
        <div className="nav-right">
          <Link href={getArticleListPath('ai')} className="nav-link">AI文章</Link>
          <Link href="/ai/prompts" className="nav-link">提示词</Link>
          <Link href="/ai/rankings/topics" className="nav-link nav-mobile-only">热榜</Link>
          <div className="nav-dropdown nav-desktop-only">
            <Link href="/ai/rankings/github" className="nav-link nav-dropdown-trigger">
              热榜 <i className="bi bi-chevron-down nav-dropdown-arrow" />
            </Link>
            <div className="nav-dropdown-menu">
              <Link href="/ai/rankings/github" className="nav-dropdown-item">
                <i className="bi bi-github" style={{ color: '#58a6ff' }} />
                <span>GitHub Trending</span>
              </Link>
              <Link href="/ai/rankings/producthunt" className="nav-dropdown-item">
                <i className="bi bi-rocket-takeoff" style={{ color: '#ff6154' }} />
                <span>ProductHunt</span>
              </Link>
              <Link href="/ai/rankings/skills-trending" className="nav-dropdown-item">
                <i className="bi bi-fire" style={{ color: '#f0883e' }} />
                <span>Skills Trending</span>
              </Link>
              <Link href="/ai/rankings/skills-hot" className="nav-dropdown-item">
                <i className="bi bi-lightning-charge" style={{ color: '#a371f7' }} />
                <span>Skills Hot</span>
              </Link>
            </div>
          </div>
          <Link href="/academy/narratives" className="nav-link academy-link">学社</Link>
          <NavAuthButton />
        </div>
      </nav>
    );
  }

  // ── Finance Subsite Navigation ──
  if (segment === 'finance') {
    return (
      <nav className="top-nav">
        <div className="nav-left" />
        <div className="nav-center">
          <div className="nav-divider" />
          <div className="nav-brand-name">
            <Link href="/">{SITE_CONFIG.brandName}</Link>
          </div>
          <div className="nav-divider" />
        </div>
        <div className="nav-right">
          <Link href={getArticleListPath('finance')} className="nav-link">金融文章</Link>
          <Link href="/academy/narratives" className="nav-link academy-link">学社</Link>
          <NavAuthButton />
        </div>
      </nav>
    );
  }

  // ── Default: Brand Home, Auth, Profile, etc. ──
  return (
    <nav className="top-nav">
      <div className="nav-left" />
      <div className="nav-center">
        <div className="nav-divider" />
        <div className="nav-brand-name">
          <Link href="/">{SITE_CONFIG.brandName}</Link>
        </div>
        <div className="nav-divider" />
      </div>
      <div className="nav-right">
        <Link href="/ai" className="nav-link">AI 知识库</Link>
        <Link href="/finance" className="nav-link">金融知识库</Link>
        <Link href="/academy/narratives" className="nav-link academy-link">学社</Link>
        <NavAuthButton />
      </div>
    </nav>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add app/SiteNav.tsx
git commit -m "feat: add path-aware SiteNav component for subsite navigation"
```

---

## Task 2: Update Root Layout

**Files:**
- Modify: `app/layout.tsx`

- [ ] **Step 1: Replace inline nav with `<SiteNav />`**

In `app/layout.tsx`:
- Remove the entire `<nav className="top-nav">` block
- Remove the `getArticleListPath` import (no longer used here)
- Add `import SiteNav from './SiteNav';`
- Replace the removed nav with `<SiteNav />`
- Remove the `const SITE_HOST` and `const CURRENT_YEAR` variables (SITE_HOST is used in footer, keep it; CURRENT_YEAR is used in footer, keep it)

The layout should end up looking like:

```tsx
import SiteNav from './SiteNav';
import { ToastProvider } from '@/app/ToastContext';
import { buildAbsoluteUrl, getSiteSeoConfig } from '@/lib/seo/config';
import { buildRootMetadata } from '@/lib/seo/metadata';
import { buildWebSiteJsonLd, JsonLdScript } from '@/lib/seo/schema';
import './globals.css';

export const runtime = 'nodejs';
export const metadata = buildRootMetadata();
const SITE_HOST = new URL(buildAbsoluteUrl('/')).host;
const SITE_CONFIG = getSiteSeoConfig();
const CURRENT_YEAR = new Date().getFullYear();

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <head>
        <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.min.css" />
      </head>
      <body>
        <ToastProvider>
        <SiteNav />
        <main className="main-content">
          <div className="container">
            {children}
          </div>
        </main>
        <footer className="site-footer">
          <div>© {CURRENT_YEAR} {SITE_CONFIG.siteName} · {SITE_CONFIG.alternateName} · {SITE_HOST}</div>
          <a
            href={SITE_CONFIG.icpUrl}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="site-footer-icp"
          >
            {SITE_CONFIG.icpNumber}
          </a>
        </footer>
        <JsonLdScript data={buildWebSiteJsonLd()} />
        </ToastProvider>
      </body>
    </html>
  );
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: Build passes (the SiteNav renders and old nav is gone).

- [ ] **Step 3: Commit**

```bash
git add app/layout.tsx
git commit -m "refactor: use SiteNav component in root layout"
```

---

## Task 3: Move Prompts and Rankings to AI Subsite

**Files:**
- Move: `app/prompts/` → `app/ai/prompts/`
- Move: `app/rankings/` → `app/ai/rankings/`

- [ ] **Step 1: Move directories via git**

```bash
git mv app/prompts app/ai/prompts
git mv app/rankings app/ai/rankings
```

- [ ] **Step 2: Commit (do NOT push yet)**

```bash
git add -A
git commit -m "refactor: move prompts and rankings under /ai/ subsite"
```

---

## Task 4: Update All Internal Links in Moved Files

Every reference to `/prompts` becomes `/ai/prompts` and every reference to `/rankings` becomes `/ai/rankings` within the moved files. The following is the exhaustive list of changes needed.

**Files:**
- Modify: `app/ai/prompts/page.tsx`
- Modify: `app/ai/prompts/[id]/page.tsx`
- Modify: `app/ai/prompts/[id]/PromptDetailClient.tsx`
- Modify: `app/ai/prompts/PromptInfiniteGallery.tsx`
- Modify: `app/ai/prompts/categories/[category]/page.tsx`
- Modify: `app/ai/prompts/scenarios/page.tsx`
- Modify: `app/ai/prompts/scenarios/[slug]/page.tsx`
- Modify: `app/ai/rankings/layout.tsx`
- Modify: `app/ai/rankings/github/page.tsx`
- Modify: `app/ai/rankings/producthunt/page.tsx`
- Modify: `app/ai/rankings/skills-trending/page.tsx`
- Modify: `app/ai/rankings/skills-hot/page.tsx`
- Modify: `app/ai/rankings/topics/page.tsx`
- Modify: `app/ai/rankings/topics/[slug]/page.tsx`

- [ ] **Step 1: Update prompt pages — replace all `/prompts` with `/ai/prompts`**

Run these replacements across all files in `app/ai/prompts/`:

| Old | New |
|-----|-----|
| `'/prompts'` | `'/ai/prompts'` |
| `"/prompts"` | `"/ai/prompts"` |
| `` `/prompts` `` | `` `/ai/prompts` `` |
| `'/prompts?` | `'/ai/prompts?` |
| `` `/prompts? `` | `` `/ai/prompts? `` |
| `'/prompts/categories/` | `'/ai/prompts/categories/` |
| `` `/prompts/categories/ `` | `` `/ai/prompts/categories/ `` |
| `` `/prompts/${ `` | `` `/ai/prompts/${ `` |
| `action="/prompts"` | `action="/ai/prompts"` |
| `href="/prompts"` | `href="/ai/prompts"` |

Also update INTERNAL_LINKS in prompt pages that reference `/rankings/*` → `/ai/rankings/*` and `/ai/articles` stays as-is.

In `app/ai/prompts/page.tsx`:
- `INTERNAL_LINKS[0].href`: `'/ai/articles'` (already correct, no change)
- `INTERNAL_LINKS[1].href`: `'/rankings/producthunt'` → `'/ai/rankings/producthunt'`
- `INTERNAL_LINKS[2].href`: `'/rankings/skills-trending'` → `'/ai/rankings/skills-trending'`

- [ ] **Step 2: Update ranking pages — replace all `/rankings` with `/ai/rankings`**

Run these replacements across all files in `app/ai/rankings/`:

| Old | New |
|-----|-----|
| `'/rankings/` | `'/ai/rankings/` |
| `"/rankings/` | `"/ai/rankings/` |
| `` `/rankings/ `` | `` `/ai/rankings/ `` |
| `'/rankings'` | `'/ai/rankings'` |

Specifically in `app/ai/rankings/layout.tsx`:
```typescript
const tabs = [
    { href: '/ai/rankings/github', icon: 'bi-github', label: 'GitHub Trending', color: '#58a6ff' },
    { href: '/ai/rankings/producthunt', icon: 'bi-rocket-takeoff', label: 'ProductHunt', color: '#ff6154' },
    { href: '/ai/rankings/skills-trending', icon: 'bi-fire', label: 'Skills Trending', color: '#f0883e' },
    { href: '/ai/rankings/skills-hot', icon: 'bi-lightning-charge', label: 'Skills Hot', color: '#e040fb' },
];
```

In `app/ai/rankings/topics/page.tsx`:
- All `rankingEntries` href values: `/rankings/...` → `/ai/rankings/...`
- `canonicalPath`: `/rankings/topics` → `/ai/rankings/topics`
- `buildAbsoluteUrl('/rankings/topics')` → `buildAbsoluteUrl('/ai/rankings/topics')`
- `buildAbsoluteUrl('/rankings/github')` → `buildAbsoluteUrl('/ai/rankings/github')`

Each ranking sub-page (github, producthunt, skills-trending, skills-hot) has similar patterns — update their `canonicalPath`, `PAGE_URL`, and cross-ranking links.

- [ ] **Step 3: Update `lib/seo/internal-links.ts`**

This file builds internal link groups used by prompt detail and other pages.

| Old | New |
|-----|-----|
| `href: '/prompts'` | `href: '/ai/prompts'` |
| `` href: `/prompts/categories/${...}` `` | `` href: `/ai/prompts/categories/${...}` `` |
| `href: '/prompts/scenarios'` | `href: '/ai/prompts/scenarios'` |
| `` href: `/prompts/${...}` `` | `` href: `/ai/prompts/${...}` `` |
| `href: '/rankings/github'` | `href: '/ai/rankings/github'` |
| `href: '/rankings/producthunt'` | `href: '/ai/rankings/producthunt'` |
| `href: '/rankings/skills-trending'` | `href: '/ai/rankings/skills-trending'` |
| `href: '/rankings/skills-hot'` | `href: '/ai/rankings/skills-hot'` |

Also check `buildArticleInternalLinkGroup` for any `/prompts` or `/rankings` references — update those too.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "fix: update all internal links for /ai/prompts and /ai/rankings"
```

---

## Task 5: Create AI Subsite Homepage

**Files:**
- Create: `app/ai/page.tsx`

- [ ] **Step 1: Create `app/ai/page.tsx`**

Copy the content of the current `app/page.tsx` and make these changes:
1. Update `PromptGalleryCard` import path: `'@/app/prompts/PromptGalleryCard'` → `'@/app/ai/prompts/PromptGalleryCard'`
2. Update all `href` values in `HOME_SEO.internalLinks`:
   - `/prompts` → `/ai/prompts`
   - `/rankings/producthunt` → `/ai/rankings/producthunt`
   - `getArticleListPath('ai')` stays as `/ai/articles`
3. Update `href="/prompts"` → `href="/ai/prompts"` in the prompt showcase section
4. Update `` href={`/prompts?category=${...}`} `` → `` href={`/ai/prompts?category=${...}`} ``
5. Update `` href={`/prompts/${prompt.id}`} `` → `` href={`/ai/prompts/${prompt.id}`} ``

The file structure remains otherwise identical to the current homepage — same data fetching, same editorial layout, same grid structure.

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: `/ai` page builds correctly with updated import paths.

- [ ] **Step 3: Commit**

```bash
git add app/ai/page.tsx
git commit -m "feat: add AI subsite homepage at /ai"
```

---

## Task 6: Create Brand Homepage

**Files:**
- Modify: `app/page.tsx` (full rewrite)

- [ ] **Step 1: Write new brand homepage**

Replace the entire `app/page.tsx` with a brand manifesto page. This page has three sections: brand hero, dual entry cards, and academy promo.

```tsx
import Link from 'next/link';
import { buildAbsoluteUrl, getSiteSeoConfig } from '@/lib/seo/config';
import { buildHomePageMetadata } from '@/lib/seo/metadata';
import { buildOrganizationJsonLd, buildWebPageJsonLd, JsonLdScript } from '@/lib/seo/schema';

export const runtime = 'nodejs';
export const revalidate = 3600;

const SITE_URL = buildAbsoluteUrl('/');
const SITE_CONFIG = getSiteSeoConfig();

export const metadata = buildHomePageMetadata();

const SUBSITE_ENTRIES = [
  {
    href: '/ai',
    icon: 'bi-cpu',
    title: 'AI 知识库',
    description: '深度文章、提示词精选与实时热榜，帮你站在 AI 浪潮前沿。',
    accent: 'var(--accent-cyan)',
  },
  {
    href: '/finance',
    icon: 'bi-graph-up-arrow',
    title: '金融知识库',
    description: '宏观研究、市场分析与策略文章，助你洞察金融趋势。',
    accent: 'var(--accent-gold)',
  },
];

export default function BrandHomePage() {
  return (
    <>
      <JsonLdScript data={[
        buildOrganizationJsonLd(),
        buildWebPageJsonLd(
          SITE_CONFIG.homeTitle,
          SITE_CONFIG.homeDescription,
          SITE_URL,
        ),
      ]} />

      {/* ── Brand Hero ── */}
      <section className="brand-hero">
        <div className="brand-hero-content">
          <h1 className="brand-hero-title">{SITE_CONFIG.brandName}</h1>
          <p className="brand-hero-slogan">
            帮你在信息洪流中，发掘真正有价值的东西
          </p>
          <p className="brand-hero-desc">
            {SITE_CONFIG.siteName} — 一个专注发掘与传递价值的知识平台。
            我们筛选、整理并呈现各领域最值得阅读的内容，让你的每一分钟都有收获。
          </p>
        </div>
      </section>

      {/* ── Dual Entry Cards ── */}
      <section className="brand-entries">
        <div className="brand-entries-grid">
          {SUBSITE_ENTRIES.map((entry) => (
            <Link key={entry.href} href={entry.href} className="brand-entry-card glass glass-card">
              <div className="brand-entry-icon" style={{ color: entry.accent }}>
                <i className={`bi ${entry.icon}`} />
              </div>
              <h2 className="brand-entry-title">{entry.title}</h2>
              <p className="brand-entry-desc">{entry.description}</p>
              <span className="brand-entry-action">
                进入 <i className="bi bi-arrow-right" />
              </span>
            </Link>
          ))}
        </div>
      </section>

      {/* Academy promo removed from the current knowledge-base-only project. */}
    </>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add app/page.tsx
git commit -m "feat: replace homepage with brand manifesto page"
```

---

## Task 7: Add Brand Homepage CSS

**Files:**
- Modify: `app/globals.css`

- [ ] **Step 1: Add brand homepage styles to globals.css**

Append these styles to `app/globals.css`:

```css
/* ════════════════════════════════════════════════════════════════
   Brand Homepage — 品牌宣言页
   ════════════════════════════════════════════════════════════════ */

.brand-hero {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 55vh;
  text-align: center;
  padding: 4rem 1rem;
}

.brand-hero-content {
  max-width: 640px;
}

.brand-hero-title {
  font-family: 'Playfair Display', serif;
  font-size: 3.5rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  margin: 0 0 1rem;
  background: linear-gradient(135deg, var(--accent-cyan), var(--accent-gold));
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.brand-hero-slogan {
  font-size: 1.35rem;
  line-height: 1.7;
  color: var(--text-secondary);
  margin: 0 0 1rem;
}

.brand-hero-desc {
  font-size: 1rem;
  line-height: 1.8;
  color: var(--text-muted);
  margin: 0;
}

.brand-entries {
  padding: 0 0 2rem;
}

.brand-entries-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 1.5rem;
}

.brand-entry-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: 2.5rem 2rem;
  text-decoration: none;
  color: inherit;
  transition: transform 0.25s ease, box-shadow 0.25s ease;
}

.brand-entry-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.3);
}

.brand-entry-icon {
  font-size: 2.5rem;
  margin-bottom: 1rem;
}

.brand-entry-title {
  font-family: 'Playfair Display', serif;
  font-size: 1.5rem;
  margin: 0 0 0.75rem;
}

.brand-entry-desc {
  font-size: 0.95rem;
  line-height: 1.7;
  color: var(--text-muted);
  margin: 0 0 1.5rem;
}

.brand-entry-action {
  font-size: 0.9rem;
  color: var(--accent-cyan);
  display: flex;
  align-items: center;
  gap: 0.3rem;
  transition: gap 0.2s ease;
}

.brand-entry-card:hover .brand-entry-action {
  gap: 0.6rem;
}

.brand-academy {
  padding: 0 0 3rem;
}

.brand-academy-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: 2rem;
  text-decoration: none;
  color: inherit;
  transition: transform 0.25s ease;
}

.brand-academy-card:hover {
  transform: translateY(-2px);
}

.brand-academy-badge {
  font-family: 'Playfair Display', serif;
  font-size: 1.15rem;
  color: var(--accent-gold);
  margin-bottom: 0.75rem;
}

.brand-academy-desc {
  font-size: 0.95rem;
  line-height: 1.7;
  color: var(--text-muted);
  margin: 0 0 1rem;
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: Build passes with new styles.

- [ ] **Step 3: Commit**

```bash
git add app/globals.css
git commit -m "feat: add brand homepage styles"
```

---

## Task 8: Create Finance Subsite Homepage

**Files:**
- Create: `app/finance/page.tsx`

- [ ] **Step 1: Create `app/finance/page.tsx`**

A finance homepage that shows articles with an elegant empty state if no content exists.

```tsx
import Link from 'next/link';
import Image from 'next/image';
import type { Metadata } from 'next';
import {
  getArticleDetailPath,
  getArticleListPath,
} from '@/lib/articles/article-route-paths';
import { getSiteSeoConfig } from '@/lib/seo/config';
import { buildArticlesListMetadata } from '@/lib/seo/metadata';
import { buildBreadcrumbJsonLd, buildCollectionPageJsonLd, JsonLdScript } from '@/lib/seo/schema';
import { formatBeijingDate } from '@/lib/utils/time-utils';

export const runtime = 'nodejs';
export const revalidate = 300;

const SITE_CONFIG = getSiteSeoConfig();
const SITE_URL = SITE_CONFIG.siteUrl;

export const metadata: Metadata = buildArticlesListMetadata({
  title: '金融知识库',
  description: `${SITE_CONFIG.siteName}的金融知识库 — 宏观研究、市场分析与策略文章`,
  canonicalPath: '/finance',
});

export default async function FinanceHomePage() {
  const { getTopArticles, getArticleCategories, getTotalCount } = await import('@/lib/services/article-service');

  let articles: Awaited<ReturnType<typeof getTopArticles>> = [];
  let categories: Awaited<ReturnType<typeof getArticleCategories>> = [];
  let totalCount = 0;

  try {
    [articles, categories, totalCount] = await Promise.all([
      getTopArticles(15, { site: 'finance' }),
      getArticleCategories('finance'),
      getTotalCount({ site: 'finance' }),
    ]);
  } catch (err) {
    console.error('[FinanceHomePage] 数据加载失败:', err);
  }

  return (
    <>
      <JsonLdScript data={[
        buildBreadcrumbJsonLd([
          { name: '首页', url: SITE_URL },
          { name: '金融知识库', url: `${SITE_URL}/finance` },
        ]),
        buildCollectionPageJsonLd('金融知识库', `${SITE_CONFIG.siteName}的金融知识库`, `${SITE_URL}/finance`),
      ]} />

      {/* ── Header ── */}
      <header className="editorial-header">
        <div className="editorial-stats">
          {totalCount > 0 && (
            <>
              <span className="stat-badge">{totalCount} 篇文章</span>
              <span className="stat-divider">·</span>
            </>
          )}
          <span className="stat-badge">{categories.length} 个分类</span>
        </div>
        <h1 className="editorial-headline">金融知识库</h1>
        <p className="editorial-sub">宏观研究、市场分析与策略文章，助你洞察金融趋势</p>
      </header>

      {articles.length > 0 ? (
        <>
          {/* ── Articles Grid (reuse existing styles) ── */}
          <section className="home-section">
            <div className="section-bar">
              <h2 className="section-title">最新文章</h2>
              <Link href={getArticleListPath('finance')} className="section-more">
                浏览全部 →
              </Link>
            </div>

            {categories.length > 0 && (
              <div className="filter-bar-container" style={{ marginBottom: '1.5rem' }}>
                <div className="filter-bar-scroll">
                  <Link href="/finance" className="filter-item active">全部</Link>
                  {categories.map((cat) => (
                    <Link
                      key={cat.code}
                      href={`${getArticleListPath('finance')}?category=${cat.code}`}
                      className="filter-item"
                    >
                      {cat.name}
                    </Link>
                  ))}
                </div>
              </div>
            )}

            <div className="articles-list">
              {articles.slice(0, 10).map((article, i) => (
                <div
                  key={article.id}
                  className="animate-emerge"
                  style={{ animationDelay: `${(i * 0.1).toFixed(1)}s` }}
                >
                  <Link
                    href={getArticleDetailPath('finance', article.slug)}
                    className="article-item glass glass-card"
                  >
                    <div className="article-cover">
                      <Image
                        src={article.coverUrl || '/images/default-cover.png'}
                        alt={article.title}
                        fill
                        sizes="(max-width: 768px) 100vw, 320px"
                        style={{ objectFit: 'cover' }}
                      />
                    </div>
                    <div className="article-info">
                      <div className="article-meta">
                        <span className="category">{article.categoryName}</span>
                        <span className="dot">·</span>
                        <span className="date">{formatBeijingDate(article.createdAt)}</span>
                      </div>
                      <h2 className="article-title">{article.title}</h2>
                      <p className="article-summary">{article.summary}</p>
                      <div className="article-footer">
                        <span className="read-more">
                          阅读全文 <i className="bi bi-arrow-right" />
                        </span>
                      </div>
                    </div>
                  </Link>
                </div>
              ))}
            </div>
          </section>
        </>
      ) : (
        /* ── Elegant Empty State ── */
        <section className="finance-empty">
          <div className="finance-empty-inner glass glass-card">
            <div className="finance-empty-icon">
              <i className="bi bi-journal-richtext" />
            </div>
            <h2 className="finance-empty-title">金融知识库正在建设中</h2>
            <p className="finance-empty-desc">
              我们正在为你发掘金融领域的高质量内容，涵盖宏观研究、市场分析与投资策略。
              敬请期待。
            </p>
            <div className="finance-empty-actions">
              <Link href="/ai" className="finance-empty-link">
                先去看看 AI 知识库 <i className="bi bi-arrow-right" />
              </Link>
            </div>
          </div>
        </section>
      )}
    </>
  );
}
```

- [ ] **Step 2: Add finance empty state CSS**

Append to `app/globals.css`:

```css
/* ═══ Finance Empty State ═══ */

.finance-empty {
  display: flex;
  justify-content: center;
  padding: 3rem 0;
}

.finance-empty-inner {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: 3rem 2rem;
  max-width: 480px;
}

.finance-empty-icon {
  font-size: 3rem;
  color: var(--accent-gold);
  margin-bottom: 1.5rem;
}

.finance-empty-title {
  font-family: 'Playfair Display', serif;
  font-size: 1.5rem;
  margin: 0 0 0.75rem;
}

.finance-empty-desc {
  font-size: 0.95rem;
  line-height: 1.7;
  color: var(--text-muted);
  margin: 0 0 1.5rem;
}

.finance-empty-link {
  display: flex;
  align-items: center;
  gap: 0.3rem;
  color: var(--accent-cyan);
  font-size: 0.9rem;
  text-decoration: none;
  transition: gap 0.2s ease;
}

.finance-empty-link:hover {
  gap: 0.6rem;
}
```

- [ ] **Step 3: Commit**

```bash
git add app/finance/page.tsx app/globals.css
git commit -m "feat: add finance subsite homepage with empty state"
```

---

## Task 9: Update Internal Links in Existing Pages

**Files:**
- Modify: `app/ai/articles/page.tsx`
- Modify: `app/ai/articles/[slug]/page.tsx`
- Modify: `app/ai/articles/categories/[category]/page.tsx`
- Modify: `app/finance/articles/page.tsx`
- Modify: `app/finance/articles/[slug]/page.tsx`

- [ ] **Step 1: Update AI articles page links**

In `app/ai/articles/page.tsx`, update `INTERNAL_LINKS`:

```typescript
const INTERNAL_LINKS = [
    {
        href: '/ai/prompts/categories/gemini-3',
        title: 'Gemini 3 提示词分类',
        description: '把文章中的方法论快速落到具体提示词实践，适合继续上手实验。',
    },
    {
        href: '/ai/rankings/producthunt',
        title: '切换到 ProductHunt 热榜',
        description: '从内容研究延伸到新产品趋势，观察哪些方向正在快速增长。',
    },
    {
        href: '/ai/rankings/github',
        title: '查看 GitHub Trending',
        description: '同步关注开源项目热度，补齐开发者生态中的技术实现信号。',
    },
];
```

- [ ] **Step 2: Update AI article detail page links**

In `app/ai/articles/[slug]/page.tsx`, update `ARTICLE_EXPLORATION_LINKS`:

```typescript
const ARTICLE_EXPLORATION_LINKS = [
    // ... existing article list link stays ...
    {
        href: '/ai/prompts/categories/gemini-3',
        title: '相关提示词分类',
        description: '从文章切到可直接复用的多模态提示词模板，缩短落地路径。',
    },
    {
        href: '/ai/rankings/producthunt',
        title: '跟进 ProductHunt 热榜',
        description: '结合热门新产品观察 AI 工具趋势，补充文章里的行业上下文。',
    },
];
```

- [ ] **Step 3: Update AI articles category page links**

In `app/ai/articles/categories/[category]/page.tsx`, update any references to `/prompts/...` → `/ai/prompts/...`.

- [ ] **Step 4: Update finance articles page links**

In `app/finance/articles/page.tsx`, update `INTERNAL_LINKS`:

```typescript
const INTERNAL_LINKS = [
    {
        href: '/ai/prompts',
        title: '查找研究类提示词',
        description: '把金融文章里的研究框架转成可复制的分析、摘要和对比提示词。',
    },
    {
        href: '/ai/rankings/github',
        title: '查看 GitHub Trending',
        description: '关注数据分析、量化工具和开发框架的开源趋势，补充技术信号。',
    },
    {
        href: '/ai/articles',
        title: '切换到 AI 文章库',
        description: '对照通用 AI 主题文章，建立从技术到金融应用的跨栏目理解。',
    },
];
```

- [ ] **Step 5: Update finance article detail page links**

In `app/finance/articles/[slug]/page.tsx`, update `ARTICLE_EXPLORATION_LINKS`:

```typescript
const ARTICLE_EXPLORATION_LINKS = [
    {
        href: getArticleListPath('finance'),
        title: '继续浏览金融文章',
        description: '返回金融文章列表，查看同一主题下的宏观、市场与策略内容。',
    },
    {
        href: '/ai/rankings/github',
        title: '查看 GitHub 趋势项目',
        description: '把金融研究和开发工具趋势结合起来，快速发现值得跟进的项目。',
    },
    {
        href: '/ai/prompts',
        title: '查找分析类提示词',
        description: '补充适用于研究、摘要和数据整理场景的提示词模板。',
    },
];
```

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "fix: update internal links in article pages for new subsite structure"
```

---

## Task 10: Update Middleware

**Files:**
- Modify: `middleware.ts`

- [ ] **Step 1: Update public prefixes**

In `middleware.ts`, update `PUBLIC_PREFIXES`:

```typescript
const PUBLIC_PREFIXES = [
    '/api/',
    '/ai/',           // AI subsite pages
    '/finance/',      // Finance subsite pages
    '/prompts/',      // Keep temporarily for any bookmarked URLs (will 404 naturally)
    '/rankings',      // Keep temporarily
    '/_next/',
    '/content/',
    '/media/',
    '/favicon',
];
```

Adding `/ai/` and `/finance/` ensures all subsite pages are publicly accessible without authentication checks.

- [ ] **Step 2: Update guest-only redirect**

In the `GUEST_ONLY_PATHS` handler, change the redirect from `'/'` to keep `'/'` (brand homepage is fine as redirect target).

- [ ] **Step 3: Commit**

```bash
git add middleware.ts
git commit -m "fix: update middleware public prefixes for subsite routes"
```

---

## Task 11: Update SEO & Sitemap

**Files:**
- Modify: `app/sitemap.xml/route.ts` (if needed)
- Check `lib/seo/metadata.ts` for any hardcoded paths
- Check `lib/seo/growth-pages.ts` for ranking topic pages

- [ ] **Step 1: Update ranking topic pages in growth-pages**

Grep for any ranking-related canonical paths in `lib/seo/growth-pages.ts` and update `/rankings/` → `/ai/rankings/`.

Run: `grep -rn '/rankings' lib/seo/ --include="*.ts"`
Update any found references.

- [ ] **Step 2: Update SEO metadata helpers**

Run: `grep -rn '/prompts' lib/seo/ --include="*.ts"`
Update any found references to `/prompts/...` → `/ai/prompts/...`.

- [ ] **Step 3: Verify sitemap service**

Run: `grep -rn '/prompts\|/rankings' lib/services/sitemap-service.ts`
Update any found references.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "fix: update SEO and sitemap paths for new subsite structure"
```

---

## Task 12: Final Verification & Cleanup

- [ ] **Step 1: Full build**

Run: `npm run build`
Expected: Build succeeds with no errors.

- [ ] **Step 2: Verify no stale references remain**

```bash
grep -rn "'/prompts'" app/ --include="*.tsx" --include="*.ts"
grep -rn "'/rankings" app/ --include="*.tsx" --include="*.ts"
grep -rn '"/prompts' app/ --include="*.tsx" --include="*.ts"
grep -rn '"/rankings' app/ --include="*.tsx" --include="*.ts"
```

Expected: No results (all references should be updated to `/ai/prompts` and `/ai/rankings`).

If any stale references remain, update them and amend the last commit.

- [ ] **Step 3: Verify dev server**

Run: `npm run dev`
Check these routes manually:
- `/` — Brand homepage renders with dual entry cards
- `/ai` — AI subsite homepage with editorial layout
- `/ai/prompts` — Prompt gallery works
- `/ai/rankings/github` — GitHub rankings work
- `/finance` — Finance homepage renders (empty state or articles)
- `/finance/articles` — Finance articles list works

- [ ] **Step 4: Final commit if any fixes needed**

```bash
git add -A
git commit -m "fix: resolve remaining build and link issues from restructuring"
```

---

## Summary of Commits

1. `feat: add path-aware SiteNav component for subsite navigation`
2. `refactor: use SiteNav component in root layout`
3. `refactor: move prompts and rankings under /ai/ subsite`
4. `fix: update all internal links for /ai/prompts and /ai/rankings`
5. `feat: add AI subsite homepage at /ai`
6. `feat: replace homepage with brand manifesto page`
7. `feat: add brand homepage styles`
8. `feat: add finance subsite homepage with empty state`
9. `fix: update internal links in article pages for new subsite structure`
10. `fix: update middleware public prefixes for subsite routes`
11. `fix: update SEO and sitemap paths for new subsite structure`
12. `fix: resolve remaining build and link issues from restructuring`
