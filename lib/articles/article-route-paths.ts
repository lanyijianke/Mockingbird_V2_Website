export function getArticleListPath(site: string): string {
    return `/${site}/articles`;
}

export function getArticleCategoryFilterPath(site: string, category: string): string {
    return `${getArticleListPath(site)}?category=${encodeURIComponent(category)}`;
}

export function getArticleDetailPath(site: string, slug: string): string {
    return `/${site}/articles/${slug}`;
}
