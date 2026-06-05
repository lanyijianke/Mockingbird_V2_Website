# Parchment Theme Toggle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a persistent parchment light theme alongside the existing dark theme, with a visible toggle and system fallback, so readers can switch to a softer light mode without losing the night mode option.

**Architecture:** Use `system | light | dark` as the only theme modes. Resolve the initial mode on the server, bootstrap the DOM before paint, and keep the current mode in a client provider so the toggle, navigation logos, and shell chrome stay in sync. Convert the current dark-first CSS into semantic theme tokens so the same stylesheets can render either a charcoal dark theme or a warm parchment reading theme.

**Tech Stack:** Next.js App Router, React 19, TypeScript, CSS variables, `next/script`, Vitest, server-rendered component tests.

---

## File Structure

- Create `lib/theme/theme.ts`: theme modes, storage key, cookie name, logo helpers, and the bootstrap script generator.
- Create `app/ThemeProvider.tsx`: client theme context, persistence, DOM sync, and `useTheme()` hook.
- Create `app/ThemeToggle.tsx`: compact 3-state segmented control for `system`, `light`, and `dark`.
- Modify `app/layout.tsx`: read the initial theme, inject the bootstrap script, and wrap the shell with the provider.
- Modify `app/SiteNav.tsx` and `app/SiteFooter.tsx`: render the toggle and switch brand assets by theme.
- Modify `app/globals.css`, `app/_styles/nav.css`, `app/_styles/shared-ui.css`, `app/_styles/editorial.css`, `app/_styles/articles-list.css`, `app/_styles/prompts.css`, `app/_styles/finance.css`, `app/_styles/about-page.css`, `app/articles/[slug]/article-reader.css`, and `app/ai/prompts/[id]/prompt-detail.css`: replace hardcoded dark-only values with semantic theme tokens and parchment-friendly surfaces.
- Modify `tests/unit/layout-nav.test.ts` and `tests/unit/site-footer.test.ts`: assert the shell still renders correctly with theme-aware assets.
- Create `tests/unit/theme.test.ts` and `tests/unit/theme-toggle.test.ts`: cover theme resolution, bootstrap script content, and toggle markup.

---

### Task 1: Theme Core

**Files:** Create `lib/theme/theme.ts`, Create `app/ThemeProvider.tsx`, Create `tests/unit/theme.test.ts`

- [ ] **Step 1: Write the failing tests for theme resolution, bootstrap script, and logo helpers**

Create `tests/unit/theme.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  THEME_COOKIE_NAME,
  THEME_STORAGE_KEY,
  getBrandLogoSrc,
  getFooterLogoSrc,
  getThemeBootstrapScript,
  resolveThemeMode,
} from '@/lib/theme/theme';

describe('theme helpers', () => {
  it('resolves system preference to a concrete theme', () => {
    expect(resolveThemeMode('system', true)).toBe('dark');
    expect(resolveThemeMode('system', false)).toBe('light');
    expect(resolveThemeMode('light', true)).toBe('light');
    expect(resolveThemeMode('dark', false)).toBe('dark');
  });

  it('returns theme-aware brand logos', () => {
    expect(getBrandLogoSrc('dark')).toBe('/images/logo-nav.png');
    expect(getBrandLogoSrc('light')).toBe('/images/logo-nav-light.png');
    expect(getFooterLogoSrc('dark')).toBe('/images/logo-nav.png');
    expect(getFooterLogoSrc('light')).toBe('/images/logo-light.png');
  });

  it('emits a bootstrap script that can restore the saved theme before paint', () => {
    const script = getThemeBootstrapScript();

    expect(script).toContain(THEME_STORAGE_KEY);
    expect(script).toContain(THEME_COOKIE_NAME);
    expect(script).toContain('matchMedia');
    expect(script).toContain('document.documentElement');
    expect(script).toContain('data-theme');
  });
});
```

- [ ] **Step 2: Run the focused test and confirm it fails before implementation**

Run:

```bash
npm run test -- tests/unit/theme.test.ts
```

Expected: FAIL because `@/lib/theme/theme` does not exist yet.

- [ ] **Step 3: Implement the theme contract and client provider**

Create `lib/theme/theme.ts` with the following public surface:

```ts
export type ThemeMode = 'system' | 'light' | 'dark';
export type ThemeResolved = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'mockingbird-theme-mode';
export const THEME_COOKIE_NAME = 'mockingbird_theme_mode';

export function resolveThemeMode(mode: ThemeMode, prefersDark: boolean): ThemeResolved;
export function getBrandLogoSrc(theme: ThemeResolved): string;
export function getFooterLogoSrc(theme: ThemeResolved): string;
export function getThemeBootstrapScript(): string;
```

`resolveThemeMode()` should treat `system` as `prefers-color-scheme`, `getBrandLogoSrc()` and `getFooterLogoSrc()` should point to the existing light-safe image assets, and `getThemeBootstrapScript()` should read the saved preference, set `document.documentElement.dataset.theme`, and set `color-scheme` before first paint.

Create `app/ThemeProvider.tsx` as a client component that:

```tsx
type ThemeContextValue = {
  mode: ThemeMode;
  resolvedTheme: ThemeResolved;
  setThemeMode: (mode: ThemeMode) => void;
};
```

The provider should:

1. Initialize from the server-provided mode.
2. Keep `localStorage` and `document.cookie` in sync when the mode changes.
3. Update `document.documentElement.dataset.theme` and `document.documentElement.style.colorScheme` on mount and whenever the resolved theme changes.
4. Expose a `useTheme()` hook that throws if it is used outside the provider.

- [ ] **Step 4: Rerun the focused test and confirm it passes**

Run:

```bash
npm run test -- tests/unit/theme.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit the theme core**

Run:

```bash
git add lib/theme/theme.ts app/ThemeProvider.tsx tests/unit/theme.test.ts
git commit -m "feat(theme): add theme core"
```

---

### Task 2: Theme Toggle And Shell Wiring

**Files:** Create `app/ThemeToggle.tsx`, Modify `app/layout.tsx`, Modify `app/SiteNav.tsx`, Modify `app/SiteFooter.tsx`, Modify `tests/unit/layout-nav.test.ts`, Modify `tests/unit/site-footer.test.ts`, Create `tests/unit/theme-toggle.test.ts`

- [ ] **Step 1: Write the failing tests for toggle markup and theme-aware shell assets**

Create `tests/unit/theme-toggle.test.ts`:

```ts
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/app/ThemeProvider', () => ({
  useTheme: () => ({
    mode: 'light',
    resolvedTheme: 'light',
    setThemeMode: vi.fn(),
  }),
}));

describe('ThemeToggle', () => {
  it('renders system, light, and dark choices', async () => {
    const { default: ThemeToggle } = await import('@/app/ThemeToggle');
    const html = renderToStaticMarkup(createElement(ThemeToggle));

    expect(html).toContain('系统');
    expect(html).toContain('亮色');
    expect(html).toContain('暗色');
    expect(html).toContain('theme-toggle');
    expect(html).toContain('aria-pressed');
  });
});
```

Update `tests/unit/layout-nav.test.ts` to assert that the root layout now includes the theme bootstrap script and the navigation still keeps the AI links in the right place.

Update `tests/unit/site-footer.test.ts` to assert the footer uses the theme-safe logo asset and still links only to canonical sections.

- [ ] **Step 2: Run the focused test set and confirm it fails before implementation**

Run:

```bash
npm run test -- tests/unit/theme-toggle.test.ts tests/unit/layout-nav.test.ts tests/unit/site-footer.test.ts
```

Expected: FAIL because the toggle component, provider wiring, and theme-aware asset selection are not implemented yet.

- [ ] **Step 3: Wire the provider, toggle, and logo swaps into the shell**

Modify `app/layout.tsx` so the root layout:

1. Imports `Script` from `next/script`.
2. Reads the initial mode from the request cookie when present.
3. Wraps the body content with `ThemeProvider`.
4. Injects `getThemeBootstrapScript()` with `strategy="beforeInteractive"`.
5. Adds `suppressHydrationWarning` to the `html` element so the bootstrap script can settle the first paint safely.

Create `app/ThemeToggle.tsx` as a compact segmented control:

```tsx
const OPTIONS = [
  { value: 'system', label: '系统' },
  { value: 'light', label: '亮色' },
  { value: 'dark', label: '暗色' },
] as const;
```

The control should call `setThemeMode()` from the theme context, show the active state clearly, and remain small enough to fit inside the sticky nav on desktop and mobile.

Modify `app/SiteNav.tsx` to render `ThemeToggle` in the right-side nav area and use `getBrandLogoSrc(resolvedTheme)` for the brand image.

Modify `app/SiteFooter.tsx` to use `getFooterLogoSrc(resolvedTheme)` so the footer brand mark stays readable on parchment backgrounds.

- [ ] **Step 4: Rerun the focused tests and confirm they pass**

Run:

```bash
npm run test -- tests/unit/theme-toggle.test.ts tests/unit/layout-nav.test.ts tests/unit/site-footer.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit the shell wiring**

Run:

```bash
git add app/layout.tsx app/ThemeToggle.tsx app/SiteNav.tsx app/SiteFooter.tsx tests/unit/layout-nav.test.ts tests/unit/site-footer.test.ts tests/unit/theme-toggle.test.ts
git commit -m "feat(theme): wire toggle into shell"
```

---

### Task 3: Parchment Palette And Surface Conversion

**Files:** Modify `app/globals.css`, Modify `app/_styles/nav.css`, Modify `app/_styles/shared-ui.css`, Modify `app/_styles/editorial.css`, Modify `app/_styles/articles-list.css`, Modify `app/_styles/prompts.css`, Modify `app/_styles/finance.css`, Modify `app/_styles/about-page.css`, Modify `app/articles/[slug]/article-reader.css`, Modify `app/ai/prompts/[id]/prompt-detail.css`, Create `tests/unit/theme-styles.test.ts`

- [ ] **Step 1: Write the failing CSS expectations**

Create `tests/unit/theme-styles.test.ts`:

```ts
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('theme styles', () => {
  it('defines both dark and parchment tokens in globals.css', () => {
    const globalsCss = fs.readFileSync(path.resolve(__dirname, '../../app/globals.css'), 'utf-8');

    expect(globalsCss).toContain("html[data-theme='light']");
    expect(globalsCss).toContain('--theme-bg');
    expect(globalsCss).toContain('--theme-surface');
    expect(globalsCss).toContain('--theme-border');
    expect(globalsCss).toContain('--theme-accent-soft');
  });

  it('declares the theme toggle styles in nav.css', () => {
    const navCss = fs.readFileSync(path.resolve(__dirname, '../../app/_styles/nav.css'), 'utf-8');

    expect(navCss).toContain('.theme-toggle');
    expect(navCss).toContain('.theme-toggle-option');
  });
});
```

- [ ] **Step 2: Run the focused test and confirm it fails before the CSS refactor**

Run:

```bash
npm run test -- tests/unit/theme-styles.test.ts
```

Expected: FAIL because the parchment theme tokens and toggle styles are not present yet.

- [ ] **Step 3: Convert the global palette into semantic theme tokens and refactor the hardcoded surfaces**

Update `app/globals.css` to define the semantic theme palette and map the legacy variables onto it:

```css
:root {
  color-scheme: dark;
  --theme-bg: #090807;
  --theme-surface: rgba(19, 18, 17, 0.92);
  --theme-surface-strong: rgba(27, 25, 22, 0.96);
  --theme-border: rgba(255, 255, 255, 0.08);
  --theme-border-strong: rgba(255, 255, 255, 0.14);
  --theme-text: #f4efe6;
  --theme-text-muted: #a9a090;
  --theme-accent: #c0f0fb;
  --theme-accent-soft: rgba(192, 240, 251, 0.08);
}

html[data-theme='light'] {
  color-scheme: light;
  --theme-bg: #f4ead2;
  --theme-surface: rgba(250, 243, 227, 0.94);
  --theme-surface-strong: rgba(242, 231, 207, 0.98);
  --theme-border: rgba(124, 92, 56, 0.18);
  --theme-border-strong: rgba(124, 92, 56, 0.28);
  --theme-text: #3d3023;
  --theme-text-muted: #6f5a45;
  --theme-accent: #8f6230;
  --theme-accent-soft: rgba(143, 98, 48, 0.12);
}
```

Keep `--bg-main`, `--bg-secondary`, `--glass-bg`, `--glass-bg-hover`, `--glass-border`, `--glass-border-focus`, `--nav-bg`, `--text-main`, and `--text-muted` as compatibility aliases that point at the new theme tokens so the existing class names keep working while the page-specific files are updated.

Update the component styles to use those tokens instead of hardcoded black, white, or neon-green values. The important replacements are:

1. Navigation chrome, dropdowns, and scrollbar colors in `app/_styles/nav.css`.
2. Filter chips, pagination, search inputs, and buttons in `app/_styles/shared-ui.css`.
3. Editorial card borders, metadata, and divider lines in `app/_styles/editorial.css`.
4. Article list, prompt gallery, finance, and about-page surfaces so every content section keeps the same warmth on parchment.
5. Reader prose surfaces in `app/articles/[slug]/article-reader.css` and `app/ai/prompts/[id]/prompt-detail.css`, especially code blocks, blockquotes, tables, and inline links.

Use the parchment palette for hover and active states as well. The goal is to remove the current green-tinted UI accents where they read like a dark-terminal theme and replace them with a softer warm accent that still has enough contrast for long reading.

- [ ] **Step 4: Rerun the focused CSS test and confirm it passes**

Run:

```bash
npm run test -- tests/unit/theme-styles.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit the palette refactor**

Run:

```bash
git add app/globals.css app/_styles/nav.css app/_styles/shared-ui.css app/_styles/editorial.css app/_styles/articles-list.css app/_styles/prompts.css app/_styles/finance.css app/_styles/about-page.css app/articles/[slug]/article-reader.css app/ai/prompts/[id]/prompt-detail.css tests/unit/theme-styles.test.ts
git commit -m "feat(theme): add parchment palette"
```

---

### Task 4: Verification And Browser Pass

**Files:** None new; validate the edited shell, theme toggle, and content surfaces.

- [ ] **Step 1: Run the full lint and test commands**

Run:

```bash
npm run lint
npm run test
```

Expected: both commands complete without errors.

- [ ] **Step 2: Run a production build**

Run:

```bash
npm run build
```

Expected: the build succeeds with no theme-related hydration errors, missing imports, or CSS syntax failures.

- [ ] **Step 3: Verify the light and dark themes in a browser**

Open the local site and check:

1. `/` loads in the current theme and shows the new toggle in the nav.
2. Switching to `亮色` produces a warm parchment background, soft borders, and readable text on the homepage.
3. Switching back to `暗色` restores the existing dark reading mode.
4. Refreshing the page preserves the selected mode.
5. `/ai`, `/ai/articles/[slug]`, `/ai/prompts/[id]`, `/finance`, and `/about` all keep readable surfaces and theme-safe logos.

- [ ] **Step 4: Commit any last-mile fixes discovered during verification**

If the lint, test, build, or browser pass exposes a small follow-up issue, fix it immediately and commit it in a focused message before handing the work back.

---

### Self-Review

- Task 1 covers theme mode resolution, persistence keys, bootstrap timing, and logo helpers.
- Task 2 covers the visible user switch, shell wiring, and brand assets in both nav and footer.
- Task 3 covers the parchment palette and every shared content surface that depends on the current dark-first colors.
- Task 4 covers lint, unit tests, production build, and browser verification of both themes.
- No placeholders remain; every task names exact files, exact commands, and concrete expected outcomes.

