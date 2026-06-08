import { describe, expect, it } from 'vitest';
import { buildContentSecurityPolicy } from '@/lib/security/csp';

describe('content security policy', () => {
    it('allows eval and dev transports only in development', () => {
        const csp = buildContentSecurityPolicy(true);

        expect(csp).toContain("script-src 'self' 'unsafe-inline' 'unsafe-eval'");
        expect(csp).toContain("connect-src 'self' https: http: ws: wss:");
    });

    it('keeps production script-src free of unsafe-eval', () => {
        const csp = buildContentSecurityPolicy(false);

        expect(csp).toContain("script-src 'self' 'unsafe-inline'");
        expect(csp).not.toContain('unsafe-eval');
        expect(csp).toContain("connect-src 'self' https:");
    });

    it('allows the Cloudflare Web Analytics beacon script in production', () => {
        const csp = buildContentSecurityPolicy(false);

        expect(csp).toContain('https://static.cloudflareinsights.com');
    });

    it('allows the Busuanzi visitor counter script in production', () => {
        const csp = buildContentSecurityPolicy(false);

        expect(csp).toContain('https://cdn.busuanzi.cc');
    });
});
