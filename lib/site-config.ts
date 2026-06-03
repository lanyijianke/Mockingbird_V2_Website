export interface SiteBrandConfig {
    brandName: string;
    siteName: string;
    alternateName: string;
    homeTitle: string;
    homeDescription: string;
    defaultDescription: string;
    serviceName: string;
}

const DEFAULT_SITE_URL = 'http://localhost:5046';

function readConfiguredValue(...keys: string[]): string | undefined {
    for (const key of keys) {
        const value = process.env[key]?.trim();
        if (value) {
            return value;
        }
    }

    return undefined;
}

export function getSiteBrandConfig(): SiteBrandConfig {
    const brandName = readConfiguredValue('NEXT_PUBLIC_SITE_BRAND_NAME', 'SITE_BRAND_NAME') || '知更鸟 AI 知识库';
    const siteName = readConfiguredValue('NEXT_PUBLIC_SITE_NAME', 'SITE_NAME') || '知更鸟';
    const alternateName = readConfiguredValue('NEXT_PUBLIC_SITE_ALTERNATE_NAME', 'SITE_ALTERNATE_NAME') || 'Mockingbird';
    const homeTitle = readConfiguredValue('NEXT_PUBLIC_SITE_HOME_TITLE', 'SITE_HOME_TITLE') || '知更鸟 - AI 智能体情报团队';
    const homeDescription = readConfiguredValue('NEXT_PUBLIC_SITE_HOME_DESCRIPTION', 'SITE_HOME_DESCRIPTION')
        || '一群 AI 智能体组成的情报团队，帮你从信息洪流中看见真正重要的东西';
    const defaultDescription = readConfiguredValue('NEXT_PUBLIC_SITE_DEFAULT_DESCRIPTION', 'SITE_DEFAULT_DESCRIPTION')
        || '知更鸟：AI 智能体情报团队驱动的内容平台，提供深度文章、提示词精选与实时热榜。';
    const serviceName = readConfiguredValue('SITE_SERVICE_NAME', 'NEXT_PUBLIC_SITE_SERVICE_NAME') || `${siteName} Web`;

    return {
        brandName,
        siteName,
        alternateName,
        homeTitle,
        homeDescription,
        defaultDescription,
        serviceName,
    };
}

function normalizeSiteUrl(value: string | undefined): string {
    const input = value?.trim() || DEFAULT_SITE_URL;
    const normalized = new URL(input);

    normalized.pathname = '/';
    normalized.search = '';
    normalized.hash = '';

    return normalized.toString().replace(/\/$/, '');
}

export function getSiteUrl(): string {
    return normalizeSiteUrl(process.env.SITE_URL);
}

export function buildAbsoluteUrl(pathOrUrl: string): string {
    if (/^https?:\/\//.test(pathOrUrl)) {
        return pathOrUrl;
    }

    return new URL(pathOrUrl, `${getSiteUrl()}/`).toString();
}
