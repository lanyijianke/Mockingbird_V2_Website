export function buildContentSecurityPolicy(isDev: boolean): string {
    const cloudflareAnalyticsScript = 'https://static.cloudflareinsights.com';
    const busuanziScript = 'https://cdn.busuanzi.cc';
    const scriptSrc = isDev
        ? `script-src 'self' 'unsafe-inline' 'unsafe-eval' ${cloudflareAnalyticsScript} ${busuanziScript}`
        : `script-src 'self' 'unsafe-inline' ${cloudflareAnalyticsScript} ${busuanziScript}`;

    const connectSrc = isDev
        ? "connect-src 'self' https: http: ws: wss:"
        : "connect-src 'self' https:";

    return [
        "default-src 'self'",
        scriptSrc,
        "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net",
        "img-src 'self' data: blob: https:",
        "font-src 'self' data: https://cdn.jsdelivr.net https://fonts.gstatic.com",
        connectSrc,
        "media-src 'self' https: blob:",
        "frame-ancestors 'self'",
        "form-action 'self'",
        "base-uri 'self'",
        "object-src 'none'",
        "upgrade-insecure-requests",
    ].join('; ');
}
