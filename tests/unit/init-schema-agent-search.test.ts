import mysql, { type RowDataPacket } from 'mysql2/promise';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { initDatabase } from '@/lib/init-schema';
import { parseMySqlUrl } from '@/lib/db';

const TEST_MYSQL_URL = process.env.TEST_MYSQL_URL;

describe.skipIf(!TEST_MYSQL_URL)('initDatabase agent search schema', () => {
    let adminConn: mysql.Connection;

    beforeAll(async () => {
        adminConn = await mysql.createConnection(TEST_MYSQL_URL!);
    });

    afterAll(async () => {
        await adminConn?.end();
    });

    async function createIsolatedDatabase(name: string): Promise<mysql.PoolConnection> {
        await adminConn.query(`DROP DATABASE IF EXISTS \`${name}\``);
        await adminConn.query(`CREATE DATABASE \`${name}\` CHARACTER SET utf8mb4`);
        const pool = mysql.createPool({ ...parseMySqlUrl(TEST_MYSQL_URL!), database: name });
        return pool.getConnection();
    }

    async function dropIsolatedDatabase(name: string): Promise<void> {
        await adminConn.query(`DROP DATABASE IF EXISTS \`${name}\``);
    }

    it('creates agent search documents and chunks tables with lookup indexes', async () => {
        const dbName = `mockingbird_test_${Date.now()}_agent_search`;
        const conn = await createIsolatedDatabase(dbName);

        try {
            await initDatabase(conn);

            const [tables] = await conn.query<RowDataPacket[]>(
                `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
                 WHERE TABLE_SCHEMA = DATABASE()
                   AND TABLE_NAME IN ('AgentSearchDocuments', 'AgentSearchChunks')
                 ORDER BY TABLE_NAME`
            );
            expect(tables.map((row) => row.TABLE_NAME)).toEqual([
                'AgentSearchChunks',
                'AgentSearchDocuments',
            ]);

            const [indexes] = await conn.query<RowDataPacket[]>(
                `SELECT TABLE_NAME, INDEX_NAME
                 FROM INFORMATION_SCHEMA.STATISTICS
                 WHERE TABLE_SCHEMA = DATABASE()
                   AND TABLE_NAME IN ('AgentSearchDocuments', 'AgentSearchChunks')`
            );
            const indexNames = indexes.map((row) => `${row.TABLE_NAME}:${row.INDEX_NAME}`);
            expect(indexNames).toContain('AgentSearchDocuments:uniq_agent_search_document');
            expect(indexNames).toContain('AgentSearchChunks:idx_agent_chunks_document');
        } finally {
            conn.release();
            await dropIsolatedDatabase(dbName);
        }
    });
});
