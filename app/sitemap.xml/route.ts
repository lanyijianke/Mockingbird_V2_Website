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

  const xml = `<?xml version="1.0" encoding="UTF-8"?>`
    + `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.join('')}</urlset>`;

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
    },
  });
}
