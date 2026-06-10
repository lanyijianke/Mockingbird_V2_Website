'use client';

import { useEffect } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';

const STORAGE_PREFIX = 'mk:list-scroll:';

function getStorageKey(pathname: string, search: string): string {
    return `${STORAGE_PREFIX}${pathname}${search ? `?${search}` : ''}`;
}

function getHashTarget(): HTMLElement | null {
    const hash = window.location.hash.slice(1);
    if (!hash) return null;

    try {
        return document.getElementById(decodeURIComponent(hash));
    } catch {
        return document.getElementById(hash);
    }
}

export default function ListScrollRestoration() {
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const search = searchParams?.toString() ?? '';

    useEffect(() => {
        if (!pathname) return;

        const storageKey = getStorageKey(pathname, search);
        const saveScroll = () => {
            try {
                window.sessionStorage.setItem(storageKey, String(window.scrollY));
            } catch {
                // Ignore private browsing or blocked storage.
            }
        };

        const handleClick = (event: MouseEvent) => {
            const target = event.target instanceof Element
                ? event.target.closest('a[href]')
                : null;
            if (target) saveScroll();
        };

        window.addEventListener('pagehide', saveScroll);
        document.addEventListener('click', handleClick, { capture: true });

        return () => {
            saveScroll();
            window.removeEventListener('pagehide', saveScroll);
            document.removeEventListener('click', handleClick, { capture: true });
        };
    }, [pathname, search]);

    useEffect(() => {
        if (!pathname) return;

        let savedY: number | null = null;
        try {
            const raw = window.sessionStorage.getItem(getStorageKey(pathname, search));
            if (raw !== null) {
                const parsed = Number.parseInt(raw, 10);
                savedY = Number.isNaN(parsed) ? null : parsed;
            }
        } catch {
            savedY = null;
        }

        if (!window.location.hash && savedY === null) return;

        let attempts = 0;
        let timeoutId: number | undefined;
        const restore = () => {
            attempts += 1;
            const target = getHashTarget();
            if (target) {
                target.scrollIntoView({ block: 'center' });
                return;
            }

            if (savedY !== null) {
                window.scrollTo({ top: savedY });
            }

            if (attempts < 45) {
                timeoutId = window.setTimeout(restore, 80);
            }
        };

        timeoutId = window.setTimeout(restore, 0);
        return () => {
            if (timeoutId !== undefined) window.clearTimeout(timeoutId);
        };
    }, [pathname, search]);

    return null;
}
