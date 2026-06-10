'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Prompt, PagedResult } from '@/lib/types';
import { getCategoryName } from '@/lib/categories';
import PromptGalleryCard from './PromptGalleryCard';
import {
    buildPromptCardAnchorId,
    buildPromptDetailHref,
    buildPromptGalleryResetKey,
    buildPromptListReturnUrl,
    buildPromptPageApiUrl,
    hasNextPromptPage,
} from './infinite-gallery-utils';

interface PromptInfiniteGalleryProps {
    initialItems: Prompt[];
    initialPage: number;
    pageSize: number;
    totalPages: number;
    category?: string;
    q?: string;
}

interface PromptApiResponse {
    success: boolean;
    data?: PagedResult<Prompt>;
    error?: string;
}

export default function PromptInfiniteGallery({
    initialItems,
    initialPage,
    pageSize,
    totalPages,
    category,
    q,
}: PromptInfiniteGalleryProps) {
    const [items, setItems] = useState(initialItems);
    const [page, setPage] = useState(initialPage);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const sentinelRef = useRef<HTMLDivElement | null>(null);
    const loadingRef = useRef(false);
    const resetKey = buildPromptGalleryResetKey({ category, q });
    const returnTo = buildPromptListReturnUrl({ category, q });

    const canLoadMore = hasNextPromptPage(page, totalPages);

    useEffect(() => {
        setItems(initialItems);
        setPage(initialPage);
        setIsLoading(false);
        setError(null);
        loadingRef.current = false;
    }, [initialItems, initialPage, resetKey]);

    const loadNextPage = useCallback(async () => {
        if (loadingRef.current || !hasNextPromptPage(page, totalPages)) return;
        loadingRef.current = true;
        setIsLoading(true);
        setError(null);

        try {
            const nextPage = page + 1;
            const res = await fetch(buildPromptPageApiUrl({
                page: nextPage,
                pageSize,
                category,
                q,
            }));
            if (!res.ok) throw new Error(`HTTP ${res.status}`);

            const payload = await res.json() as PromptApiResponse;
            if (!payload.success || !payload.data) {
                throw new Error(payload.error || 'Failed to load prompts');
            }

            setItems((current) => [...current, ...payload.data!.items]);
            setPage(payload.data.page);
        } catch (err) {
            setError(err instanceof Error ? err.message : '加载失败');
        } finally {
            setIsLoading(false);
            loadingRef.current = false;
        }
    }, [category, page, pageSize, q, totalPages]);

    useEffect(() => {
        const sentinel = sentinelRef.current;
        if (!sentinel || !canLoadMore) return;

        const observer = new IntersectionObserver((entries) => {
            if (entries.some((entry) => entry.isIntersecting)) {
                void loadNextPage();
            }
        }, {
            rootMargin: '800px 0px',
        });

        observer.observe(sentinel);
        return () => observer.disconnect();
    }, [canLoadMore, loadNextPage]);

    if (items.length === 0) {
        return (
            <div className="empty-state glass">
                <i className="bi bi-collection" />
                <p>暂无提示词</p>
            </div>
        );
    }

    return (
        <>
            <div className="prompts-masonry">
                {items.map((prompt, idx) => {
                    const anchorId = buildPromptCardAnchorId(prompt.id);

                    return (
                        <PromptGalleryCard
                            key={prompt.id}
                            anchorId={anchorId}
                            href={buildPromptDetailHref(prompt.id, returnTo, anchorId)}
                            title={prompt.title}
                            categoryName={getCategoryName(prompt.category)}
                            copyCount={prompt.copyCount}
                            coverImageUrl={prompt.coverImageUrl}
                            cardPreviewVideoUrl={prompt.cardPreviewVideoUrl}
                            videoPreviewUrl={prompt.videoPreviewUrl}
                            animationDelay={`${idx * 0.04}s`}
                        />
                    );
                })}
            </div>

            <div ref={sentinelRef} className="prompts-infinite-status" aria-live="polite">
                {isLoading && (
                    <span><i className="bi bi-arrow-repeat" /> 正在加载更多提示词...</span>
                )}
                {error && (
                    <button type="button" onClick={() => void loadNextPage()}>
                        加载失败，点击重试
                    </button>
                )}
                {!isLoading && !error && !canLoadMore && (
                    <span>已经到底了</span>
                )}
            </div>
        </>
    );
}
