export interface PromptInfiniteGalleryQuery {
    page: number;
    pageSize: number;
    category?: string;
    q?: string;
}

export interface PromptInfiniteGalleryResetInput {
    category?: string;
    q?: string;
}

export interface PromptReturnInput {
    category?: string;
    q?: string;
}

export function hasNextPromptPage(page: number, totalPages: number): boolean {
    return page < totalPages;
}

export function buildPromptPageApiUrl({ page, pageSize, category, q }: PromptInfiniteGalleryQuery): string {
    const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
    });

    if (category) params.set('category', category);
    if (q) params.set('q', q);

    return `/api/prompts?${params.toString()}`;
}

export function buildPromptGalleryResetKey({ category, q }: PromptInfiniteGalleryResetInput): string {
    return `${category || 'all'}::${q || ''}`;
}

export function buildPromptListReturnUrl({ category, q }: PromptReturnInput): string {
    const params = new URLSearchParams();
    if (category) params.set('category', category);
    if (q) params.set('q', q);

    const query = params.toString();
    return query ? `/ai/prompts?${query}` : '/ai/prompts';
}

export function buildPromptCardAnchorId(promptId: number): string {
    return `prompt-${promptId}`;
}

export function buildPromptDetailHref(promptId: number, returnTo: string, anchorId?: string): string {
    const anchoredReturnTo = anchorId ? `${returnTo}#${anchorId}` : returnTo;

    if (!anchoredReturnTo || anchoredReturnTo === '/ai/prompts') return `/ai/prompts/${promptId}`;

    const params = new URLSearchParams({ returnTo: anchoredReturnTo });
    return `/ai/prompts/${promptId}?${params.toString()}`;
}
