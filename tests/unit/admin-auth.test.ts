import { afterEach, describe, expect, it } from 'vitest';
import {
    extractAdminToken,
    isValidAdminToken,
    secureTokenEquals,
    verifyAdminHeaders,
} from '@/lib/utils/admin-auth';

describe('admin-auth', () => {
    const ORIGINAL_TOKEN = process.env.KNOWLEDGE_ADMIN_TOKEN;

    afterEach(() => {
        if (ORIGINAL_TOKEN === undefined) delete process.env.KNOWLEDGE_ADMIN_TOKEN;
        else process.env.KNOWLEDGE_ADMIN_TOKEN = ORIGINAL_TOKEN;
    });

    it('extractAdminToken should read x-admin-token header first', () => {
        const headers = new Headers({
            'x-admin-token': 'token-from-header',
            authorization: 'Bearer token-from-auth',
        });

        expect(extractAdminToken(headers)).toBe('token-from-header');
    });

    it('extractAdminToken should fallback to Bearer token', () => {
        const headers = new Headers({
            authorization: 'Bearer token-from-auth',
        });

        expect(extractAdminToken(headers)).toBe('token-from-auth');
    });

    it('secureTokenEquals should compare tokens exactly', () => {
        expect(secureTokenEquals('abc123', 'abc123')).toBe(true);
        expect(secureTokenEquals('abc123', 'abc124')).toBe(false);
        expect(secureTokenEquals('abc123', 'abc1234')).toBe(false);
    });

    it('verifyAdminHeaders should fail closed when token is not configured', () => {
        delete process.env.KNOWLEDGE_ADMIN_TOKEN;
        const headers = new Headers({ 'x-admin-token': 'anything' });

        const result = verifyAdminHeaders(headers);
        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.status).toBe(503);
        }
    });

    it('verifyAdminHeaders should reject missing request token', () => {
        process.env.KNOWLEDGE_ADMIN_TOKEN = 'my-admin-token';
        const result = verifyAdminHeaders(new Headers());

        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.status).toBe(401);
        }
    });

    it('verifyAdminHeaders should reject invalid request token', () => {
        process.env.KNOWLEDGE_ADMIN_TOKEN = 'my-admin-token';
        const headers = new Headers({ 'x-admin-token': 'wrong-token' });
        const result = verifyAdminHeaders(headers);

        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.status).toBe(403);
        }
    });

    it('verifyAdminHeaders should pass with valid token', () => {
        process.env.KNOWLEDGE_ADMIN_TOKEN = 'my-admin-token';
        const headers = new Headers({ 'x-admin-token': 'my-admin-token' });
        const result = verifyAdminHeaders(headers);

        expect(result.ok).toBe(true);
    });

    it('isValidAdminToken should validate raw token values', () => {
        process.env.KNOWLEDGE_ADMIN_TOKEN = 'my-admin-token';

        expect(isValidAdminToken('my-admin-token')).toBe(true);
        expect(isValidAdminToken('wrong-token')).toBe(false);
        expect(isValidAdminToken(null)).toBe(false);
    });
});
