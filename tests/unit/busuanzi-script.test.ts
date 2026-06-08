import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import BusuanziScript from '@/app/BusuanziScript';

vi.mock('next/script', () => ({
    default: ({ id, src }: { id: string; src: string }) => createElement('script', { id, src }),
}));

describe('BusuanziScript', () => {
    const originalBusuanziEnabled = process.env.NEXT_PUBLIC_BUSUANZI_ENABLED;

    afterEach(() => {
        if (originalBusuanziEnabled === undefined) {
            delete process.env.NEXT_PUBLIC_BUSUANZI_ENABLED;
        } else {
            process.env.NEXT_PUBLIC_BUSUANZI_ENABLED = originalBusuanziEnabled;
        }
    });

    it('does not render the third-party script by default', () => {
        delete process.env.NEXT_PUBLIC_BUSUANZI_ENABLED;

        expect(renderToStaticMarkup(createElement(BusuanziScript))).not.toContain('busuanzi');
    });

    it('renders the Busuanzi script when explicitly enabled', () => {
        process.env.NEXT_PUBLIC_BUSUANZI_ENABLED = 'true';

        const html = renderToStaticMarkup(createElement(BusuanziScript));

        expect(html).toContain('cdn.busuanzi.cc');
        expect(html).toContain('busuanzi/3.6.9/busuanzi.min.js');
    });
});
