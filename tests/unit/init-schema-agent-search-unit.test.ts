import { describe, expect, it } from 'vitest';
import { initDatabase } from '@/lib/init-schema';

describe('initDatabase agent search SQL', () => {
    it('creates agent search document and chunk tables plus lookup indexes', async () => {
        const statements: string[] = [];
        const conn = {
            async query(sql: string) {
                statements.push(sql);
                if (sql.includes('INFORMATION_SCHEMA.STATISTICS')) return [[]];
                if (sql.includes('INFORMATION_SCHEMA.COLUMNS')) return [[{ COLUMN_NAME: 'existing' }]];
                return [[]];
            },
        };

        await initDatabase(conn as never);

        const normalized = statements.join('\n').replace(/\s+/g, ' ');
        expect(normalized).toContain('CREATE TABLE IF NOT EXISTS AgentSearchDocuments');
        expect(normalized).toContain('CREATE TABLE IF NOT EXISTS AgentSearchChunks');
        expect(normalized).toContain('CREATE UNIQUE INDEX uniq_agent_search_document');
        expect(normalized).toContain('CREATE INDEX idx_agent_chunks_document');
    });
});
