import mysql, { type RowDataPacket, type PoolConnection } from 'mysql2/promise';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { initDatabase } from '@/lib/init-schema';

const TEST_MYSQL_URL = process.env.MYSQL_URL;

describe.skipIf(!TEST_MYSQL_URL)('initDatabase', () => {
    let adminConn: mysql.Connection;

    beforeAll(async () => {
        adminConn = await mysql.createConnection(TEST_MYSQL_URL!);
    });

    afterAll(async () => {
        await adminConn.end();
    });

    async function getTableNames(conn: mysql.Connection): Promise<string[]> {
        const [rows] = await conn.query<RowDataPacket[]>(
            `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
             WHERE TABLE_SCHEMA = DATABASE()
             ORDER BY TABLE_NAME`,
        );
        return rows.map((row) => row.TABLE_NAME);
    }

    it('removes the legacy Articles table while keeping active tables available', async () => {
        const dbName = `mockingbird_test_${Date.now()}_articles`;

        await adminConn.query(`CREATE DATABASE ${dbName}`);
        const conn = await mysql.createConnection({ ...parseMySqlUrl(TEST_MYSQL_URL!), database: dbName });

        try {
            await conn.query(`
                CREATE TABLE Articles (
                    Id INT PRIMARY KEY AUTO_INCREMENT,
                    Title VARCHAR(500) NOT NULL DEFAULT ''
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
            `);

            await initDatabase(conn as unknown as PoolConnection);

            const tableNames = await getTableNames(conn);
            expect(tableNames).not.toContain('Articles');
            expect(tableNames).toContain('Prompts');
            expect(tableNames).toContain('SystemLogs');
        } finally {
            await conn.end();
            await adminConn.query(`DROP DATABASE ${dbName}`);
        }
    });

    it('drops and does not recreate legacy local auth, invitation, or academy tables', async () => {
        const dbName = `mockingbird_test_${Date.now()}_legacy_auth`;

        await adminConn.query(`CREATE DATABASE ${dbName}`);
        const conn = await mysql.createConnection({ ...parseMySqlUrl(TEST_MYSQL_URL!), database: dbName });

        try {
            for (const tableName of [
                'Users',
                'OauthAccounts',
                'Sessions',
                'EmailVerificationTokens',
                'PasswordResetTokens',
                'InvitationCodes',
                'InvitationRedemptions',
                'AcademyContent',
            ]) {
                await conn.query(`
                    CREATE TABLE ${tableName} (
                        Id INT PRIMARY KEY AUTO_INCREMENT
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
                `);
            }

            await initDatabase(conn as unknown as PoolConnection);

            const tableNames = await getTableNames(conn);
            expect(tableNames).not.toContain('Users');
            expect(tableNames).not.toContain('OauthAccounts');
            expect(tableNames).not.toContain('Sessions');
            expect(tableNames).not.toContain('EmailVerificationTokens');
            expect(tableNames).not.toContain('PasswordResetTokens');
            expect(tableNames).not.toContain('InvitationCodes');
            expect(tableNames).not.toContain('InvitationRedemptions');
            expect(tableNames).not.toContain('AcademyContent');
        } finally {
            await conn.end();
            await adminConn.query(`DROP DATABASE ${dbName}`);
        }
    });
});

function parseMySqlUrl(url: string): { host: string; port: number; user: string; password: string } {
    const parsed = new URL(url);
    return {
        host: parsed.hostname,
        port: parseInt(parsed.port || '3306', 10),
        user: decodeURIComponent(parsed.username),
        password: decodeURIComponent(parsed.password),
    };
}
