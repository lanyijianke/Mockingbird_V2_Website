#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
BASE_URL="${1:-http://localhost:5046}"

if ! command -v rg >/dev/null 2>&1; then
  echo "[seo-readiness] ripgrep (rg) is required but not installed."
  exit 1
fi

cd "$REPO_ROOT"

echo "[seo-readiness] 1/4 checking SEO and GEO endpoints..."
curl -fsS "${BASE_URL}/robots.txt" | rg "Sitemap: ${BASE_URL}/sitemap.xml|GPTBot|PerplexityBot|ClaudeBot|Google-Extended"
curl -fsS "${BASE_URL}/sitemap.xml" | rg "<loc>${BASE_URL}/</loc>|<loc>${BASE_URL}/ai/articles</loc>|<loc>${BASE_URL}/ai/prompts</loc>|<loc>${BASE_URL}/ai/rankings/github</loc>"
curl -fsS "${BASE_URL}/llms.txt" | rg "知更鸟 AI 知识库|/ai/articles|/ai/prompts|/ai/rankings/github"

echo "[seo-readiness] 2/4 checking public AI pages respond at runtime..."
curl -fsS "${BASE_URL}/" | rg "知更鸟|AI"
curl -fsS "${BASE_URL}/ai/articles" | rg "AI 文章|文章"
curl -fsS "${BASE_URL}/ai/prompts" | rg "提示词"
curl -fsS "${BASE_URL}/ai/rankings/github" | rg "GitHub|Trending|热榜"
curl -fsS "${BASE_URL}/ai/rankings/producthunt" | rg "ProductHunt|热榜"

echo "[seo-readiness] 3/4 checking removed legacy SEO pages stay absent..."
for path in \
  "/prompts/scenarios" \
  "/prompts/scenarios/video-generation" \
  "/rankings/topics" \
  "/rankings/topics/ai-launches-producthunt" \
  "/ai/prompts/categories/gemini-3" \
  "/ai/articles/categories/tech-practice" \
  "/ai/rankings/topics" \
  "/ai/rankings/topics/ai-launches-producthunt"; do
  status="$(curl -o /dev/null -s -w "%{http_code}" "${BASE_URL}${path}")"
  if [ "$status" != "404" ]; then
    echo "[seo-readiness][violation] ${path} returned ${status}, expected 404 after legacy SEO teardown"
    exit 1
  fi
done

echo "[seo-readiness] 4/4 checking search platform runbook/manual notes..."
if [ -f "docs/search-platform-operations.md" ] && ! rg -F -q "只能在真实域名上线后手动完成" "docs/search-platform-operations.md" "README.md"; then
  echo "[seo-readiness][violation] missing manual post-launch note for Search Console/Bing verification/submission"
  exit 1
fi

if [ -f "docs/search-platform-operations.md" ] && ! rg -F -q "search-platform-observation-log.md" "docs/search-platform-operations.md" "README.md"; then
  echo "[seo-readiness][violation] missing observation log reference"
  exit 1
fi

echo "[seo-readiness] all repo-controlled checks passed."
