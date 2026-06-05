#!/usr/bin/env node
import mysql from 'mysql2/promise';

const DEFAULT_CATEGORIES = ['gemini-3', 'seedream-45', 'gpt-image-15'];

function parseArgs(argv) {
    const options = {
        apply: false,
        categories: DEFAULT_CATEGORIES,
    };

    for (const arg of argv) {
        if (arg === '--apply') {
            options.apply = true;
            continue;
        }

        if (arg.startsWith('--categories=')) {
            options.categories = arg
                .slice('--categories='.length)
                .split(',')
                .map((category) => category.trim())
                .filter(Boolean);
        }
    }

    return options;
}

function requireMysqlUrl() {
    if (!process.env.MYSQL_URL) {
        throw new Error('MYSQL_URL is required');
    }

    return process.env.MYSQL_URL;
}

async function getSummary(conn, categories) {
    const [rows] = await conn.query(
        `SELECT Category,
                COUNT(*) AS total,
                SUM(CopyCount = 0 OR CopyCount IS NULL) AS zeroCount,
                MIN(CopyCount) AS minCopyCount,
                MAX(CopyCount) AS maxCopyCount
         FROM Prompts
         WHERE IsActive = 1 AND Category IN (?)
         GROUP BY Category
         ORDER BY Category`,
        [categories]
    );

    return rows;
}

async function backfillCopyCounts(conn, categories) {
    const [result] = await conn.query(
        `UPDATE Prompts
         SET CopyCount = 100 + MOD(CRC32(CONCAT(Category, ':', Id)), 9900),
             UpdatedAt = NOW()
         WHERE IsActive = 1
           AND Category IN (?)
           AND (CopyCount = 0 OR CopyCount IS NULL)`,
        [categories]
    );

    return result.affectedRows || 0;
}

async function main() {
    const options = parseArgs(process.argv.slice(2));

    if (options.categories.length === 0) {
        throw new Error('At least one category is required');
    }

    const conn = await mysql.createConnection({
        uri: requireMysqlUrl(),
        charset: 'utf8mb4',
    });

    try {
        const before = await getSummary(conn, options.categories);
        let affectedRows = 0;

        if (options.apply) {
            affectedRows = await backfillCopyCounts(conn, options.categories);
        }

        const after = await getSummary(conn, options.categories);
        console.log(JSON.stringify({
            mode: options.apply ? 'apply' : 'dry-run',
            categories: options.categories,
            affectedRows,
            before,
            after,
        }, null, 2));
    } finally {
        await conn.end();
    }
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
