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
