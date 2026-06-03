# AI Homepage Root Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `/` show the AI knowledge platform homepage, keep `/ai` working, and hide finance from public entry navigation.

**Architecture:** Extract the current AI homepage into `app/ai/AiHomePage.tsx`, then make both `app/page.tsx` and `app/ai/page.tsx` render that shared server component. Treat `/` as part of the AI section in `SiteNav` so the root page gets the AI navigation instead of the old brand-home behavior.

**Tech Stack:** Next.js App Router, React server components, TypeScript, Vitest, React server rendering tests.

---

### Task 1: Add Regression Coverage

**Files:**
- Modify: `tests/unit/homepage-prompt-gallery.test.ts`
- Modify: `tests/unit/layout-nav.test.ts`

- [ ] **Step 1: Update homepage tests to assert the root imports the AI homepage**

In `tests/unit/homepage-prompt-gallery.test.ts`, keep the existing service mocks and update URL expectations so they match the AI route namespace:

```ts
expect(html).toContain('href="/ai/prompts?category=gemini-3"');
expect(html).toContain('href="/ai/prompts?category=gpt-image-2"');
expect(html).not.toContain('/ai/prompts/categories/');
```

- [ ] **Step 2: Add navigation tests for root-as-AI and no finance default entry**

In `tests/unit/layout-nav.test.ts`, mock `next/navigation` and `NavAuthButton`, then assert `/` renders AI navigation:

```ts
vi.mock('next/navigation', () => ({
    usePathname: () => '/',
}));

vi.mock('@/app/NavAuthButton', () => ({
    default: () => createElement('span', null, 'auth'),
}));
```

Replace the old expectations with:

```ts
expect(html).toContain('href="/ai/articles"');
expect(html).toContain('href="/ai/prompts"');
expect(html).toContain('href="/ai/rankings/topics"');
expect(html).toContain('href="/ai/rankings/producthunt"');
expect(html).not.toContain('href="/finance/articles"');
```

- [ ] **Step 3: Run tests and confirm they fail before implementation**

Run:

```bash
npm test -- tests/unit/homepage-prompt-gallery.test.ts tests/unit/layout-nav.test.ts
```

Expected: FAIL because `/` still renders the old brand welcome page and the root nav is hidden or not treated as AI.

### Task 2: Extract Shared AI Homepage

**Files:**
- Create: `app/ai/AiHomePage.tsx`
- Modify: `app/ai/page.tsx`
- Modify: `app/page.tsx`

- [ ] **Step 1: Move the AI page implementation**

Create `app/ai/AiHomePage.tsx` containing the current server component body from `app/ai/page.tsx`: imports for `Link`, `Image`, article route helpers, categories, SEO schema, time utils, and `PromptGalleryCard`; constants such as `HOME_SEO` and `HOMEPAGE_PROMPT_CATEGORY_PRIORITY`; `sortPromptCategoriesForHomepage`; and the async default component.

- [ ] **Step 2: Keep `/ai` rendering the shared component**

Replace the body of `app/ai/page.tsx` with:

```ts
import AiHomePage, { metadata, revalidate, runtime } from '@/app/ai/AiHomePage';

export { metadata, revalidate, runtime };

export default AiHomePage;
```

- [ ] **Step 3: Make `/` render the shared component**

Replace `app/page.tsx` with:

```ts
import AiHomePage, { metadata, revalidate, runtime } from '@/app/ai/AiHomePage';

export { metadata, revalidate, runtime };

export default AiHomePage;
```

This removes the old imports for `Image`, `BinaryRainBackground`, and `brand-home.css` from the root page.

- [ ] **Step 4: Run focused homepage tests**

Run:

```bash
npm test -- tests/unit/homepage-prompt-gallery.test.ts
```

Expected: PASS.

### Task 3: Update Navigation

**Files:**
- Modify: `app/SiteNav.tsx`
- Test: `tests/unit/layout-nav.test.ts`

- [ ] **Step 1: Treat `/` as AI**

In `app/SiteNav.tsx`, change route detection:

```ts
const isRootHome = pathname === '/';
const isAi = isRootHome || pathname.startsWith('/ai');
const isFinance = pathname.startsWith('/finance');
```

Remove the early `return null` for the brand home.

- [ ] **Step 2: Keep brand link on AI/root at `/`**

Update brand target:

```ts
const brandHref = isAi ? '/' : isFinance ? '/finance' : '/';
```

- [ ] **Step 3: Remove finance from default navigation**

In the default navigation block, remove:

```tsx
<Link href={getArticleListPath('finance')} className="nav-link">金融</Link>
```

Leave finance-specific navigation intact for direct `/finance` visits.

- [ ] **Step 4: Run navigation tests**

Run:

```bash
npm test -- tests/unit/layout-nav.test.ts
```

Expected: PASS.

### Task 4: Clean Up And Verify

**Files:**
- Inspect: `app/_styles/brand-home.css`
- Inspect: `app/BinaryRainBackground.tsx`

- [ ] **Step 1: Check whether old brand-home files are still referenced**

Run:

```bash
rg "brand-home|BinaryRainBackground|brand-hero|brand-entry" app lib tests
```

Expected: no active references outside backups. If only `_backup/` references remain, leave them untouched.

- [ ] **Step 2: Run lint**

Run:

```bash
npm run lint
```

Expected: PASS.

- [ ] **Step 3: Run production build**

Run:

```bash
npm run build
```

Expected: PASS.

- [ ] **Step 4: Browser smoke test**

Run the dev server:

```bash
npm run dev
```

Open `http://localhost:5046/` and `http://localhost:5046/ai`. Expected: both show the AI knowledge platform, and `/` does not show the old welcome hero or finance entry.
