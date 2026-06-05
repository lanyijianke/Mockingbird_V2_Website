import { describe, expect, it } from 'vitest';
import {
    THEME_COOKIE_NAME,
    THEME_STORAGE_KEY,
    getThemeBootstrapScript,
    resolveThemeMode,
} from '@/lib/theme/theme';

describe('theme helpers', () => {
    it('resolves system preference to a concrete theme', () => {
        expect(resolveThemeMode('system', true)).toBe('dark');
        expect(resolveThemeMode('system', false)).toBe('light');
        expect(resolveThemeMode('light', true)).toBe('light');
        expect(resolveThemeMode('dark', false)).toBe('dark');
    });

    it('emits a bootstrap script that can restore the saved theme before paint', () => {
        const script = getThemeBootstrapScript();

        expect(script).toContain(THEME_STORAGE_KEY);
        expect(script).toContain(THEME_COOKIE_NAME);
        expect(script).toContain('matchMedia');
        expect(script).toContain('document.documentElement');
        expect(script).toContain('data-theme');
    });
});
