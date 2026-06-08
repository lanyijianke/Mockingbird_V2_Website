import { timingSafeEqual } from 'node:crypto';

export interface AdminAuthFailure {
    ok: false;
    status: 401 | 403 | 503;
    error: string;
}

export interface AdminAuthSuccess {
    ok: true;
}

export type AdminAuthResult = AdminAuthFailure | AdminAuthSuccess;

const BEARER_PREFIX = 'Bearer ';

export function getConfiguredAdminToken(): string {
    return process.env.KNOWLEDGE_ADMIN_TOKEN || process.env.ADMIN_API_TOKEN || '';
}

export function extractAdminToken(headers: Headers): string | null {
    const headerToken = headers.get('x-admin-token')?.trim();
    if (headerToken) return headerToken;

    const authorization = headers.get('authorization')?.trim();
    if (!authorization) return null;

    if (authorization.startsWith(BEARER_PREFIX)) {
        const bearerToken = authorization.slice(BEARER_PREFIX.length).trim();
        return bearerToken || null;
    }

    return null;
}

export function secureTokenEquals(expected: string, actual: string): boolean {
    const expectedBuffer = Buffer.from(expected, 'utf-8');
    const actualBuffer = Buffer.from(actual, 'utf-8');

    if (expectedBuffer.length !== actualBuffer.length) return false;
    return timingSafeEqual(expectedBuffer, actualBuffer);
}

export function isValidAdminToken(requestToken: string | null | undefined): boolean {
    const configuredToken = getConfiguredAdminToken();
    if (!configuredToken || !requestToken) return false;
    return secureTokenEquals(configuredToken, requestToken);
}

export function verifyAdminHeaders(headers: Headers): AdminAuthResult {
    const configuredToken = getConfiguredAdminToken();
    if (!configuredToken) {
        return {
            ok: false,
            status: 503,
            error: 'Admin token is not configured',
        };
    }

    const requestToken = extractAdminToken(headers);
    if (!requestToken) {
        return {
            ok: false,
            status: 401,
            error: 'Missing admin token',
        };
    }

    if (!secureTokenEquals(configuredToken, requestToken)) {
        return {
            ok: false,
            status: 403,
            error: 'Invalid admin token',
        };
    }

    return { ok: true };
}
