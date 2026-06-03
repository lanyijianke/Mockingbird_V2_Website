# AI Homepage as Root Design

## Goal

Replace the current brand welcome homepage at `/` with the existing AI knowledge platform homepage. The root domain should immediately show the AI articles, prompts, and rankings experience instead of the "知更鸟" welcome screen.

## Scope

- `/` renders the AI knowledge platform homepage experience.
- `/ai` remains available for existing links and can reuse the same page implementation.
- The finance channel is not deleted, but finance entry points are removed from the root/default navigation and the old welcome homepage.
- The old brand hero, binary background, and `brand-home.css` dependency are no longer used by the root homepage.

## User Experience

Visitors landing on `/` see the same editorial AI homepage currently shown at `/ai`, including:

- AI article counts and prompt counts.
- Featured article grid.
- Category article sections.
- Prompt sections.
- Ranking links already present in the AI homepage.

The top navigation should behave as an AI-site navigation on both `/` and `/ai`, so users see AI articles, prompts, rankings, academy, and auth controls.

## SEO And Routing

The root homepage metadata and JSON-LD should describe the AI knowledge platform, not a generic brand welcome page. Existing `/ai` URLs should continue working to avoid breaking backlinks or internal references.

## Implementation Shape

Create a shared AI home component or helper so `/` and `/ai` do not duplicate a large page file. `app/page.tsx` and `app/ai/page.tsx` can both import and render that shared implementation.

Update navigation path detection so `/` is treated like the AI section. Remove finance from the default navigation shown on non-AI pages, while leaving `/finance` files intact.

## Verification

- Run `npm run lint`.
- Run a focused build or `npm run build` if feasible.
- Open `/` locally and verify it shows the AI knowledge platform, not the welcome hero.
- Verify `/ai` still loads.
