import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

describe('SEO schema rebuild', () => {
    it('builds website and organization schema for the homepage', async () => {
        const { buildOrganizationSchema, buildWebSiteSchema } = await import('@/lib/seo/schema');

        expect(buildOrganizationSchema()).toMatchObject({
            '@context': 'https://schema.org',
            '@type': 'Organization',
            name: expect.stringContaining('知更鸟'),
        });

        expect(buildWebSiteSchema()).toMatchObject({
            '@context': 'https://schema.org',
            '@type': 'WebSite',
            url: expect.stringContaining('http'),
        });
    });

    it('renders JSON-LD without escaping into invalid JSON', async () => {
        const { JsonLdScript } = await import('@/lib/seo/schema');

        const html = renderToStaticMarkup(
            JsonLdScript({
                data: {
                    '@context': 'https://schema.org',
                    '@type': 'CreativeWork',
                    name: 'AI 提示词 <模板>',
                },
            })
        );

        expect(html).toContain('type="application/ld+json"');
        expect(html).toContain('AI 提示词');
        expect(html).not.toContain('</script><script');
    });
});
