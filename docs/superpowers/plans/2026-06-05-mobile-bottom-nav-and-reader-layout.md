# Mobile Bottom Nav and Reader Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the mobile experience feel like a native app by moving the primary navigation to a fixed bottom tab bar, simplifying the top bar, and reducing visual density on article and prompt detail pages.

**Architecture:** Keep desktop navigation unchanged. On mobile, use a fixed bottom tab bar with four primary destinations (`首页`, `文章`, `提示词`, `热榜`) and simplify the top bar to brand plus utility actions. Rework mobile detail-page layouts to single-column reading flows with lighter spacing, smaller fixed-position controls, and less intrusive image/stat/button blocks.

**Tech Stack:** Next.js App Router, React, CSS modules/scoped CSS files already in the repo, Vitest for unit/regression tests.

---

### Task 1: Add a mobile bottom tab bar shell

**Files:**
- Create: `app/MobileTabBar.tsx`
- Modify: `app/layout.tsx:1-60`
- Modify: `app/globals.css:145-340`
- Modify: `tests/unit/layout-nav.test.ts`
- Modify: `tests/unit/theme-styles.test.ts`

- [ ] **Step 1: Write the failing test**

Add assertions to `tests/unit/layout-nav.test.ts` that the layout HTML includes a mobile bottom nav shell with four entries and that the desktop nav still renders. Use a simple markup check against the rendered layout:

```ts
expect(html).toContain('mobile-tab-bar');
expect(html).toContain('mobile-tab-item');
expect(html).toContain('首页');
expect(html).toContain('文章');
expect(html).toContain('提示词');
expect(html).toContain('热榜');
```

Add a style regression check in `tests/unit/theme-styles.test.ts` for the new mobile nav classes:

```ts
expect(globalsCss).toContain('.mobile-tab-bar');
expect(globalsCss).toContain('.mobile-tab-item');
expect(globalsCss).toContain('.mobile-tab-item.active');
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
npm run test -- tests/unit/layout-nav.test.ts tests/unit/theme-styles.test.ts
```

Expected: fail because the mobile tab bar does not exist yet.

- [ ] **Step 3: Write minimal implementation**

Create `app/MobileTabBar.tsx` as a small client component that renders the four mobile destinations with `Link` and a simple active-state class based on `usePathname()`. Keep labels short and stable. Mount it in `app/layout.tsx` after `SiteFooter` so it is available globally on mobile.

Add CSS in `app/globals.css` for the mobile-only fixed bottom bar, safe-area padding, active state, and enough bottom padding on `.main-content` so content never sits behind the bar.

Use this structure:

```tsx
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const ITEMS = [
  { href: '/', label: '首页' },
  { href: '/ai/articles', label: '文章' },
  { href: '/ai/prompts', label: '提示词' },
  { href: '/ai/rankings/github', label: '热榜' },
];

export default function MobileTabBar() {
  const pathname = usePathname();

  return (
    <nav className="mobile-tab-bar" aria-label="移动端主导航">
      {ITEMS.map((item) => {
        const active =
          item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);

        return (
          <Link
            key={item.href}
            href={item.href}
            className={`mobile-tab-item${active ? ' active' : ''}`}
            aria-current={active ? 'page' : undefined}
          >
            <span className="mobile-tab-label">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
```

Update the layout to render `<MobileTabBar />` once inside the `ThemeProvider`.

- [ ] **Step 4: Run the test to verify it passes**

Run:

```bash
npm run test -- tests/unit/layout-nav.test.ts tests/unit/theme-styles.test.ts
```

Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add app/MobileTabBar.tsx app/layout.tsx app/globals.css tests/unit/layout-nav.test.ts tests/unit/theme-styles.test.ts
git commit -m "feat(mobile): add bottom tab navigation"
```

### Task 2: Simplify the mobile top navigation

**Files:**
- Modify: `app/_styles/nav.css:1-320`
- Modify: `app/SiteNav.tsx`
- Modify: `tests/unit/layout-nav.test.ts`

- [ ] **Step 1: Write the failing test**

Add a layout assertion that the mobile nav no longer depends on the desktop dropdown being visible in the mobile layout. Keep the desktop dropdown assertion intact. Add a CSS regression assertion for a mobile-specific class or media-query hook that hides the desktop-heavy right rail on small screens.

For example:

```ts
expect(navCss).toContain('@media (max-width: 768px)');
expect(navCss).toContain('.nav-right');
expect(navCss).toContain('overflow-x: auto');
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
npm run test -- tests/unit/layout-nav.test.ts
```

Expected: fail until the mobile top bar is simplified.

- [ ] **Step 3: Write minimal implementation**

Refactor `app/SiteNav.tsx` so the mobile view presents a smaller brand row and keeps only utility actions that are still worth top placement. Do not duplicate the entire desktop menu into the mobile bar; the bottom tab bar from Task 1 is now the primary mobile navigation.

In `app/_styles/nav.css`, make the mobile breakpoint:
- reduce the brand text size and gap
- keep the theme toggle compact
- suppress desktop-only dropdown behavior on mobile
- allow the top nav to consume less vertical space

Preserve the desktop nav behavior exactly as-is.

- [ ] **Step 4: Run the test to verify it passes**

Run:

```bash
npm run test -- tests/unit/layout-nav.test.ts
```

Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add app/SiteNav.tsx app/_styles/nav.css tests/unit/layout-nav.test.ts
git commit -m "feat(mobile): simplify top navigation"
```

### Task 3: Rework article-reader mobile layout

**Files:**
- Modify: `app/articles/[slug]/article-reader.css`
- Modify: `tests/unit/theme-styles.test.ts`

- [ ] **Step 1: Write the failing test**

Add style regression checks that the reader stylesheet defines mobile-specific rules for the main reader shell, back button, header, content padding, and TOC hiding. Examples:

```ts
expect(readerCss).toContain('@media (max-width: 768px)');
expect(readerCss).toContain('.reader-container');
expect(readerCss).toContain('.article-toc');
expect(readerCss).toContain('.reader-back-float');
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
npm run test -- tests/unit/theme-styles.test.ts
```

Expected: fail because the mobile reader rules are not yet tightened enough.

- [ ] **Step 3: Write minimal implementation**

Add mobile rules to `app/articles/[slug]/article-reader.css` so that on small screens:
- the layout becomes single-column
- the TOC is hidden or de-emphasized
- the back button is smaller and positioned so it does not cover content
- the header spacing and title size are reduced
- the content padding is trimmed and line length stays comfortable
- large media blocks keep breathing room and do not overflow the viewport

Keep desktop reading behavior unchanged.

- [ ] **Step 4: Run the test to verify it passes**

Run:

```bash
npm run test -- tests/unit/theme-styles.test.ts
```

Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add app/articles/[slug]/article-reader.css tests/unit/theme-styles.test.ts
git commit -m "feat(mobile): tighten article reader layout"
```

### Task 4: Rework prompt detail mobile layout

**Files:**
- Modify: `app/ai/prompts/[id]/prompt-detail.css`
- Modify: `tests/unit/theme-styles.test.ts`

- [ ] **Step 1: Write the failing test**

Add style regression checks that the prompt detail stylesheet contains mobile-specific rules for the split layout, media area, and metadata/content spacing:

```ts
expect(promptCss).toContain('@media (max-width: 767px)');
expect(promptCss).toContain('.pd-layout');
expect(promptCss).toContain('.pd-media');
expect(promptCss).toContain('.pd-content');
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
npm run test -- tests/unit/theme-styles.test.ts
```

Expected: fail until the mobile prompt layout is reduced enough.

- [ ] **Step 3: Write minimal implementation**

Tune `app/ai/prompts/[id]/prompt-detail.css` for mobile by:
- keeping the layout strictly single-column on small screens
- reducing padding on `.pd-container`
- making the floating back button smaller
- letting the media section stack above content
- softening image and stat blocks so the prompt text becomes the visual focus

Keep the desktop split view unchanged.

- [ ] **Step 4: Run the test to verify it passes**

Run:

```bash
npm run test -- tests/unit/theme-styles.test.ts
```

Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add app/ai/prompts/[id]/prompt-detail.css tests/unit/theme-styles.test.ts
git commit -m "feat(mobile): refine prompt detail layout"
```

### Task 5: Final verification and review

**Files:**
- Modify if needed: any of the files above

- [ ] **Step 1: Run the full targeted verification**

Run:

```bash
npm run test -- tests/unit/theme.test.ts tests/unit/theme-toggle.test.ts tests/unit/layout-nav.test.ts tests/unit/site-footer.test.ts tests/unit/theme-styles.test.ts
npm run lint
npm run build
```

Expected:
- all targeted tests pass
- ESLint reports no errors or warnings
- Next.js production build completes successfully

- [ ] **Step 2: Check the mobile UI in the browser**

Start the dev server if needed and inspect at least:
- `/`
- `/ai/articles`
- `/ai/articles/[slug]`
- `/ai/prompts/[id]`
- `/ai/rankings/github`

Verify:
- bottom tab bar is visible on mobile and does not cover content
- top nav is slimmer and less crowded
- article and prompt detail pages read in one column comfortably
- no element overflows horizontally

- [ ] **Step 3: Commit any final fixes**

If browser checks reveal issues, fix them and commit with a focused message:

```bash
git add <changed files>
git commit -m "fix(mobile): polish bottom nav and reader layout"
```

---

**Self-review coverage check**
- Bottom nav shell and mobile-first navigation: Task 1
- Top nav simplification: Task 2
- Article detail mobile layout: Task 3
- Prompt detail mobile layout: Task 4
- Validation across tests/lint/build/browser: Task 5
