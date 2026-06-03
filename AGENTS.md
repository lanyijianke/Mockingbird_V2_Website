# Repository Guidelines

## Project Structure & Module Organization
- `app/` contains the Next.js App Router UI and route handlers: `app/api/`, `app/(auth)/`, `app/ai/articles/`, `app/prompts/`, and `app/rankings/`.
- `lib/` contains shared TypeScript modules: SEO in `lib/seo/`, auth in `lib/auth/`, email in `lib/email/`, services in `lib/services/`, and cron jobs in `lib/jobs/`.
- `tests/unit/` contains Vitest coverage. `public/` stores static assets. `config/` stores static settings.

## Build, Test, and Development Commands
- `npm run dev` starts the local Next.js development server on port `5046`.
- `npm run build` creates a production build and catches App Router/runtime issues.
- `npm run lint` runs ESLint for TypeScript and Next.js checks.
- `npm test` runs the full Vitest suite once.
- `npm test -- tests/unit/auth-routes.test.ts` runs one test file.

## Coding Style & Naming Conventions
- Use TypeScript throughout.
- Preserve surrounding indentation: 4 spaces in many `lib/` files and route handlers, 2 spaces in many React components.
- Keep `runtime = 'nodejs'` on API routes using MySQL or Node-only dependencies.
- Use PascalCase for React components, camelCase for helpers, and App Router filenames such as `page.tsx`, `layout.tsx`, and `route.ts`.
- Reuse `lib/site-config.ts` and `lib/seo/config.ts` instead of hardcoding brand names, URLs, or callback origins.

## Testing Guidelines
- Tests use Vitest and follow the `tests/**/*.test.ts` pattern.
- Add regression tests for behavior changes, especially auth, SEO, sitemap output, and route handlers.
- Prefer route-level tests for API behavior. Isolate DB-backed tests with per-test MySQL databases.

## Commit & Pull Request Guidelines
- Follow the existing conventional commit style: `feat: ...`, `fix: ...`, `chore: ...`, `docs: ...`, or `refactor: ...`.
- Keep commits scoped to one concern.
- PRs should summarize user-facing impact, config changes, and verification run, such as `npm test`, `npm run lint`, and `npm run build`.
- Include screenshots for UI changes.

## CSS Architecture & Styling
- Keep `app/globals.css` limited to site-wide primitives: custom properties, reset, shared utilities, footer, scrollbar, animations, and toast.
- Do not add feature-specific styles to `app/globals.css`.
- Put feature CSS in `app/_styles/` or co-locate it with the feature. Import it only from that feature’s page or layout.

## Security & Configuration Tips
- Copy `.env.example` to `.env.local` for local development, and never commit secrets.
- Treat `SITE_URL`, OAuth credentials, admin tokens, and Resend settings as environment-owned.
- Use `KNOWLEDGE_ADMIN_TOKEN` or `ADMIN_API_TOKEN` for protected job endpoints.
- Route external links and absolute URLs through existing sanitization and config helpers.
