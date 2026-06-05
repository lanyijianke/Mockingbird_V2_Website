import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const createPoolMock = vi.hoisted(() => vi.fn());

vi.mock('mysql2/promise', () => ({
    default: {
        createPool: createPoolMock,
    },
}));

vi.mock('@/lib/init-schema', () => ({
    initDatabase: vi.fn(),
}));

describe('database connection pool sizing', () => {
    const originalMysqlUrl = process.env.MYSQL_URL;
    const originalConnectionLimit = process.env.MYSQL_CONNECTION_LIMIT;

    beforeEach(() => {
        vi.resetModules();
        createPoolMock.mockReset();
    });

    afterEach(async () => {
        const { closePool } = await import('@/lib/db');
        await closePool();

        if (originalMysqlUrl === undefined) delete process.env.MYSQL_URL;
        else process.env.MYSQL_URL = originalMysqlUrl;

        if (originalConnectionLimit === undefined) delete process.env.MYSQL_CONNECTION_LIMIT;
        else process.env.MYSQL_CONNECTION_LIMIT = originalConnectionLimit;
    });

    it('uses a conservative default connection limit for static builds', async () => {
        process.env.MYSQL_URL = 'mysql://user:pass@localhost:3306/db';
        delete process.env.MYSQL_CONNECTION_LIMIT;
        createPoolMock.mockReturnValue({
            getConnection: vi.fn(async () => ({ release: vi.fn() })),
            end: vi.fn(),
        });

        const { default: getPool } = await import('@/lib/db');
        await getPool();

        expect(createPoolMock).toHaveBeenCalledWith(expect.objectContaining({
            connectionLimit: 2,
        }));
    });

    it('allows the connection limit to be tuned by environment', async () => {
        process.env.MYSQL_URL = 'mysql://user:pass@localhost:3306/db';
        process.env.MYSQL_CONNECTION_LIMIT = '4';
        createPoolMock.mockReturnValue({
            getConnection: vi.fn(async () => ({ release: vi.fn() })),
            end: vi.fn(),
        });

        const { default: getPool } = await import('@/lib/db');
        await getPool();

        expect(createPoolMock).toHaveBeenCalledWith(expect.objectContaining({
            connectionLimit: 4,
        }));
    });
});
