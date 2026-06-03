# SEO And GEO Rebuild Design

## Goal

Rebuild SEO after the legacy teardown around the real AI knowledge hub pages that still exist. The new system should make the site crawlable, understandable, and citable by search engines and AI answer engines without bringing back old SEO-only category, scenario, or topic landing pages.

## Scope

In scope:

- Site-level metadata defaults, canonical URLs, Open Graph, and robots policy.
- Per-page metadata for the homepage, AI article list/detail pages, prompt list/detail pages, ranking pages, about page, and finance pages that still exist.
- JSON-LD that matches visible page content.
- `robots.txt`, `sitemap.xml`, and `llms.txt`.
- A global footer that closes the page with real internal links, brand context, and ICP information.
- GEO/AEO foundations that make pages easier for LLM-backed search systems to parse and cite.

Out of scope:

- Recreating `/ai/articles/categories/[category]`.
- Recreating `/ai/prompts/categories/[category]`.
- Recreating `/ai/prompts/scenarios/*`.
- Recreating `/ai/rankings/topics/*`.
- Creating thin keyword pages whose only purpose is search capture.

## Keyword Ownership

Each keyword family gets one primary page type. Filtered list states can support discovery but are not canonical landing pages.

| Keyword family | Primary owner | Secondary support |
| --- | --- | --- |
| AI 知识库 | `/` | `/ai/articles`, `/ai/prompts`, ranking pages |
| AI 教程 | `/ai/articles` | article detail pages |
| AI 文章 | `/ai/articles` | article detail pages |
| AI 提示词库 | `/ai/prompts` | prompt detail pages |
| AI 提示词 / AI 提示词模板 | `/ai/prompts` | prompt detail pages |
| AI 工具榜单 | `/ai/rankings/github`, `/ai/rankings/producthunt`, `/ai/rankings/skills-trending`, `/ai/rankings/skills-hot` | homepage and article/prompt internal links |
| AI 文章和提示词 | `/` | article and prompt list pages |

## Page Map

### Homepage `/`

Primary query: `AI 知识库`

Role: Root hub for the whole AI content system. It introduces articles, tutorials, prompt templates, and ranking signals.

Title pattern:

`AI 知识库：AI 教程、提示词与工具榜单`

Description pattern:

`知更鸟 AI 知识库收录深度文章、AI 教程、提示词模板和工具榜单，帮助你系统追踪 AI 技术、产品和实操方法。`

Schema:

- `WebSite`
- `Organization`
- `CollectionPage`

Canonical:

- `/`

### Articles `/ai/articles`

Primary queries: `AI 教程`, `AI 文章`

Role: Main landing page for educational and editorial content.

Title pattern:

`AI 教程与深度文章`

Description pattern:

`阅读 AI 教程、技术解析和产品实践文章，系统理解模型能力、Agent 工作流、提示词方法和 AI 工具趋势。`

Schema:

- `CollectionPage`
- `BreadcrumbList`

Canonical:

- `/ai/articles`
- `q`, `category`, and pagination states should be `noindex,follow` and canonicalize to `/ai/articles`.

### Article Details `/ai/articles/[slug]`

Primary queries: article-specific long-tail tutorial and explainer intent.

Role: Rank and be cited for long-tail questions, tutorials, and explainers. Use article SEO fields when present; otherwise derive metadata from visible title and summary.

Title pattern:

`{seoTitle || articleTitle}`

Description pattern:

`{seoDescription || articleSummary}`

Schema:

- `Article`
- `BreadcrumbList`

Canonical:

- `/ai/articles/[slug]`

### Prompts `/ai/prompts`

Primary queries: `AI 提示词库`, `AI 提示词`, `AI 提示词模板`

Role: Main prompt template discovery page.

Title pattern:

`AI 提示词库：精选提示词模板`

Description pattern:

`浏览可复用的 AI 提示词模板，覆盖图像、视频、写作、编程和 Agent 工作流等场景。`

Schema:

- `CollectionPage`
- `BreadcrumbList`

Canonical:

- `/ai/prompts`
- `q`, `category`, and pagination states should be `noindex,follow` and canonicalize to `/ai/prompts`.

### Prompt Details `/ai/prompts/[id]`

Primary queries: specific prompt content and long-tail prompt use cases.

Role: Let individual templates rank and be cited when they contain enough unique text and media.

Title pattern:

`{promptTitle} - AI 提示词模板`

Description pattern:

Use prompt description when available; otherwise use a short slice of prompt content.

Schema:

- `CreativeWork`
- `BreadcrumbList`

Canonical:

- `/ai/prompts/[id]`

### Rankings `/ai/rankings/*`

Primary queries: `AI 工具榜单`, `AI 工具排行榜`, source-specific ranking terms.

Role: Capture tool discovery and trend tracking searches.

Title patterns:

- `/ai/rankings/producthunt`: `AI 产品热榜：ProductHunt 每日榜单`
- `/ai/rankings/github`: `AI 开源项目榜单：GitHub Trending`
- `/ai/rankings/skills-trending`: `AI 技能趋势榜`
- `/ai/rankings/skills-hot`: `AI 热门技能榜`

Schema:

- `CollectionPage`
- `ItemList` only when list items are visible in the page HTML.

Canonical:

- Self-canonical for each existing ranking page.

### About `/about`

Role: Entity and trust page for the site and author/brand.

Schema:

- `AboutPage`
- `Person` or `Organization` only when matching visible content.

Canonical:

- `/about`

### Finance Pages

Finance pages are still real pages and should keep basic metadata and sitemap inclusion. They are secondary to the AI knowledge hub and should not compete with AI keyword ownership.

## Footer

Add a global `SiteFooter` below `<main>` in `app/layout.tsx`.

Footer content:

- Short brand description.
- Real internal links only: `/`, `/ai/articles`, `/ai/prompts`, `/ai/rankings/github`, `/ai/rankings/producthunt`, `/ai/rankings/skills-trending`, `/ai/rankings/skills-hot`, `/about`.
- Finance links may appear in a secondary section if finance remains public.
- ICP number and link from `lib/site-config.ts`.

Rules:

- Do not link to removed SEO-only pages.
- Keep footer styling in `app/globals.css` because it is site-wide.
- Footer should be visible on desktop and mobile without crowding the page.

## GEO / AI Search Layer

The site should be optimized for citation by AI answer engines, not just ranked in traditional search.

### Robots

`robots.txt` should:

- Allow regular search crawlers.
- Allow AI search/citation crawlers: `GPTBot`, `ChatGPT-User`, `PerplexityBot`, `ClaudeBot`, `anthropic-ai`, `Google-Extended`, and `Bingbot`.
- Point to `/sitemap.xml`.
- Respect `SEO_CAN_INDEX=false` by disallowing indexing in local/protected environments.

### llms.txt

Add `/llms.txt` as a static route or public file.

It should include:

- Site name and short purpose.
- Primary audience.
- Key canonical pages.
- Content types available: articles, tutorials, prompts, rankings.
- A note that removed category/scenario/topic pages are not canonical surfaces.

### Content Extractability

For page templates touched during implementation:

- Include a concise intro paragraph near the top.
- Keep headings clear and query-like.
- Show last updated dates where real data exists.
- Do not add FAQ schema unless there is visible FAQ content.
- Prefer structured visible lists over hidden metadata-only claims.

## Technical Rules

- Keep SEO helpers server-only; client components must not read env-backed SEO config.
- Use `lib/site-config.ts` and `SITE_URL` for origins and brand settings.
- Centralize metadata generation in `lib/seo/metadata.ts`.
- Centralize JSON-LD builders in `lib/seo/schema.tsx`.
- Add a small JSON-LD script component that safely serializes schema data.
- Search/filter/pagination pages should be `noindex,follow`.
- Sitemaps should include only canonical, indexable pages that exist.
- Sitemap should include dynamic article and prompt detail URLs from existing service functions when available.
- All canonical URLs should use the `/ai/...` route shape consistently, except the root homepage `/`.

## Testing

Add regression coverage for:

- Legacy SEO-only routes and helpers stay deleted.
- Metadata helpers generate title, description, canonical, robots, and Open Graph values.
- Query/filter metadata becomes `noindex,follow`.
- Schema builders emit only expected schema types.
- `robots.txt` includes sitemap and AI crawler policy.
- `sitemap.xml` includes existing canonical page families and excludes removed SEO-only pages.
- `llms.txt` includes the AI knowledge hub summary and canonical links.
- Footer links include only real pages and no removed SEO-only routes.

## Rebuild Sequence

1. Update tests around the new SEO/GEO contract.
2. Build metadata helpers and attach them to existing pages.
3. Build schema helpers and attach JSON-LD where it matches visible content.
4. Add global footer and footer tests.
5. Add robots, sitemap, and llms.txt routes/tests.
6. Update readiness script to validate the new contract.
7. Run focused tests, lint, and production build.
