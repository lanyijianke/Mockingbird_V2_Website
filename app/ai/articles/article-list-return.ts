import {
    getArticleDetailPath,
    getArticleListPath,
} from '@/lib/articles/article-route-paths';

export interface ArticleListReturnInput {
    page?: number;
    category?: string;
    q?: string;
}

export function buildArticleListReturnUrl({ page, category, q }: ArticleListReturnInput): string {
    const params = new URLSearchParams();
    if (page && page > 1) params.set('page', String(page));
    if (category) params.set('category', category);
    if (q) params.set('q', q);

    const query = params.toString();
    const listPath = getArticleListPath('ai');
    return query ? `${listPath}?${query}` : listPath;
}

export function buildArticleCardAnchorId(slug: string): string {
    return `article-${slug}`;
}

export function buildArticleDetailHref(slug: string, returnTo: string, anchorId?: string): string {
    const detailPath = getArticleDetailPath('ai', slug);
    const anchoredReturnTo = anchorId ? `${returnTo}#${anchorId}` : returnTo;

    if (!anchoredReturnTo || anchoredReturnTo === getArticleListPath('ai')) return detailPath;

    const params = new URLSearchParams({ returnTo: anchoredReturnTo });
    return `${detailPath}?${params.toString()}`;
}

export function normalizeArticleReturnTo(value: string | undefined): string | null {
    if (!value) return null;

    try {
        const parsed = new URL(value, 'https://zgnknowledge.online');
        if (parsed.origin !== 'https://zgnknowledge.online') return null;
        if (parsed.pathname !== getArticleListPath('ai')) return null;

        return `${parsed.pathname}${parsed.search}${parsed.hash}`;
    } catch {
        return null;
    }
}
