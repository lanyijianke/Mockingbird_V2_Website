import { buildAbsoluteUrl, getSiteBrandConfig } from '@/lib/site-config';

type JsonLdValue = Record<string, unknown> | Record<string, unknown>[];

function safeJsonLd(data: JsonLdValue): string {
    return JSON.stringify(data).replace(/</g, '\\u003c');
}

export function JsonLdScript({ data }: { data: JsonLdValue }) {
    return (
        <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{ __html: safeJsonLd(data) }}
        />
    );
}

export function buildOrganizationSchema() {
    const brand = getSiteBrandConfig();

    return {
        '@context': 'https://schema.org',
        '@type': 'Organization',
        name: brand.brandName,
        alternateName: brand.alternateName,
        url: buildAbsoluteUrl('/'),
    };
}

export function buildWebSiteSchema() {
    const brand = getSiteBrandConfig();

    return {
        '@context': 'https://schema.org',
        '@type': 'WebSite',
        name: brand.brandName,
        url: buildAbsoluteUrl('/'),
        inLanguage: 'zh-CN',
    };
}

export function buildCollectionPageSchema(input: {
    name: string;
    description: string;
    path: string;
}) {
    return {
        '@context': 'https://schema.org',
        '@type': 'CollectionPage',
        name: input.name,
        description: input.description,
        url: buildAbsoluteUrl(input.path),
        inLanguage: 'zh-CN',
    };
}

export function buildArticleSchema(input: {
    title: string;
    description: string;
    path: string;
    datePublished?: string | null;
    dateModified?: string | null;
}) {
    return {
        '@context': 'https://schema.org',
        '@type': 'Article',
        headline: input.title,
        description: input.description,
        url: buildAbsoluteUrl(input.path),
        datePublished: input.datePublished || undefined,
        dateModified: input.dateModified || input.datePublished || undefined,
        inLanguage: 'zh-CN',
    };
}

export function buildCreativeWorkSchema(input: {
    title: string;
    description: string;
    path: string;
}) {
    return {
        '@context': 'https://schema.org',
        '@type': 'CreativeWork',
        name: input.title,
        description: input.description,
        url: buildAbsoluteUrl(input.path),
        inLanguage: 'zh-CN',
    };
}
