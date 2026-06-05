'use client';

import {
    createContext,
    useContext,
    useEffect,
    useMemo,
    useState,
    type ReactNode,
} from 'react';
import {
    THEME_COOKIE_NAME,
    THEME_STORAGE_KEY,
    resolveThemeMode,
    type ThemeMode,
    type ThemeResolved,
} from '@/lib/theme/theme';

type ThemeContextValue = {
    mode: ThemeMode;
    resolvedTheme: ThemeResolved;
    setThemeMode: (mode: ThemeMode) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function getPrefersDark(): boolean {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
        return false;
    }

    return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function syncDocumentTheme(resolvedTheme: ThemeResolved): void {
    const doc = document.documentElement;
    doc.dataset.theme = resolvedTheme;
    doc.style.colorScheme = resolvedTheme;
    doc.setAttribute('data-theme', resolvedTheme);
}

function writeThemePreference(mode: ThemeMode): void {
    localStorage.setItem(THEME_STORAGE_KEY, mode);
    document.cookie = `${THEME_COOKIE_NAME}=${encodeURIComponent(mode)}; path=/; max-age=31536000; samesite=lax`;
}

export function ThemeProvider({
    children,
    initialMode = 'system',
}: {
    children: ReactNode;
    initialMode?: ThemeMode;
}) {
    const [mode, setMode] = useState<ThemeMode>(() => initialMode);
    const [prefersDark, setPrefersDark] = useState(getPrefersDark);

    useEffect(() => {
        const media = window.matchMedia?.('(prefers-color-scheme: dark)');
        if (!media) return;

        const handleChange = (event: MediaQueryListEvent) => {
            setPrefersDark(event.matches);
        };

        media.addEventListener?.('change', handleChange);
        return () => {
            media.removeEventListener?.('change', handleChange);
        };
    }, []);

    const resolvedTheme = useMemo(() => resolveThemeMode(mode, prefersDark), [mode, prefersDark]);

    useEffect(() => {
        syncDocumentTheme(resolvedTheme);
    }, [resolvedTheme]);

    useEffect(() => {
        writeThemePreference(mode);
    }, [mode]);

    const value = useMemo<ThemeContextValue>(() => ({
        mode,
        resolvedTheme,
        setThemeMode: setMode,
    }), [mode, resolvedTheme]);

    return (
        <ThemeContext.Provider value={value}>
            {children}
        </ThemeContext.Provider>
    );
}

export function useTheme(): ThemeContextValue {
    const context = useContext(ThemeContext);

    if (!context) {
        throw new Error('useTheme must be used within ThemeProvider');
    }

    return context;
}
