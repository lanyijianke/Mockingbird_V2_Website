export type ThemeMode = 'system' | 'light' | 'dark';
export type ThemeResolved = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'mockingbird-theme-mode';
export const THEME_COOKIE_NAME = 'mockingbird_theme_mode';

const BRAND_LOGOS: Record<ThemeResolved, string> = {
    dark: '/images/logo-nav.png',
    light: '/images/logo-nav-light.png',
};

const FOOTER_LOGOS: Record<ThemeResolved, string> = {
    dark: '/images/logo-nav.png',
    light: '/images/logo-light.png',
};

export function resolveThemeMode(mode: ThemeMode, prefersDark: boolean): ThemeResolved {
    if (mode === 'light' || mode === 'dark') {
        return mode;
    }

    return prefersDark ? 'dark' : 'light';
}

export function getBrandLogoSrc(theme: ThemeResolved): string {
    return BRAND_LOGOS[theme];
}

export function getFooterLogoSrc(theme: ThemeResolved): string {
    return FOOTER_LOGOS[theme];
}

export function getThemeBootstrapScript(): string {
    return `(function(){try{var storageKey='${THEME_STORAGE_KEY}';var cookieName='${THEME_COOKIE_NAME}';var mode=localStorage.getItem(storageKey)||'';if(!mode){var match=document.cookie.match(new RegExp('(?:^|; )'+cookieName.replace(/[-/\\\\^$*+?.()|[\\]{}]/g,'\\\\$&')+'=([^;]*)'));mode=match?decodeURIComponent(match[1]):'';}if(mode!=='light'&&mode!=='dark'&&mode!=='system'){mode='system';}var prefersDark=window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches;var resolved=mode==='system'?(prefersDark?'dark':'light'):mode;var doc=document.documentElement;doc.dataset.theme=resolved;doc.style.colorScheme=resolved;doc.setAttribute('data-theme',resolved);}catch(e){}})();`;
}
