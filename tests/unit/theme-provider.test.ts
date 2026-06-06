import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ThemeProvider, useTheme } from '@/app/ThemeProvider';

function ThemeProbe() {
    const { mode, resolvedTheme } = useTheme();

    return createElement('span', {
        'data-mode': mode,
        'data-theme-resolved': resolvedTheme,
    });
}

describe('ThemeProvider', () => {
    it('uses a server-stable initial resolved theme before client effects run', () => {
        const originalWindow = globalThis.window;
        Object.defineProperty(globalThis, 'window', {
            configurable: true,
            value: {
                matchMedia: () => ({
                    matches: true,
                    addEventListener: () => undefined,
                    removeEventListener: () => undefined,
                }),
            },
        });

        try {
            const html = renderToStaticMarkup(
                createElement(ThemeProvider, { initialMode: 'system' }, createElement(ThemeProbe)),
            );

            expect(html).toContain('data-mode="system"');
            expect(html).toContain('data-theme-resolved="light"');
        } finally {
            Object.defineProperty(globalThis, 'window', {
                configurable: true,
                value: originalWindow,
            });
        }
    });
});
