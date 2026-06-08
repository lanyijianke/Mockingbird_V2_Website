import { describe, expect, it } from 'vitest';
import { initDatabase } from '@/lib/init-schema';

describe('initDatabase prompt dedupe SQL', () => {
    it('deactivates duplicate active prompts that share category and source URL', async () => {
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
        expect(normalized).toContain('SELECT Category, SourceUrl, MAX(Id) AS KeepId');
        expect(normalized).toContain('ON dedupe.Category = p.Category AND dedupe.SourceUrl = p.SourceUrl');
        expect(normalized).toContain('SET p.IsActive = 0');
        expect(normalized).toContain("WHERE IsActive = 1 AND SourceUrl IS NOT NULL AND SourceUrl != ''");
    });
});
