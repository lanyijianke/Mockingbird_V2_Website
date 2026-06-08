import type { PoolConnection, RowDataPacket } from 'mysql2/promise';

async function ensureIndex(
    conn: PoolConnection,
    indexName: string,
    sql: string,
): Promise<void> {
    const [rows] = await conn.query<RowDataPacket[]>(
        `SELECT INDEX_NAME FROM INFORMATION_SCHEMA.STATISTICS
         WHERE TABLE_SCHEMA = DATABASE() AND INDEX_NAME = ?`,
        [indexName],
    );
    if (rows.length > 0) {
        return;
    }
    await conn.query(sql);
}

async function ensureColumn(
    conn: PoolConnection,
    tableName: string,
    columnName: string,
    columnDefinition: string
): Promise<void> {
    const [rows] = await conn.query<RowDataPacket[]>(
        `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
        [tableName, columnName]
    );
    if (rows.length > 0) {
        return;
    }

    await conn.query(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnDefinition}`);
}

async function dropLegacyTables(conn: PoolConnection): Promise<void> {
    await conn.query('DROP TABLE IF EXISTS InvitationRedemptions');
    await conn.query('DROP TABLE IF EXISTS InvitationCodes');
    await conn.query('DROP TABLE IF EXISTS EmailVerificationTokens');
    await conn.query('DROP TABLE IF EXISTS PasswordResetTokens');
    await conn.query('DROP TABLE IF EXISTS OauthAccounts');
    await conn.query('DROP TABLE IF EXISTS AcademyContent');
    await conn.query('DROP TABLE IF EXISTS Articles');
    await conn.query('DROP TABLE IF EXISTS Sessions');
    await conn.query('DROP TABLE IF EXISTS Users');
}

// ════════════════════════════════════════════════════════════════
// MySQL 建表 — 应用启动时调用 initDatabase(conn) 自动执行
// ════════════════════════════════════════════════════════════════

export async function initDatabase(conn: PoolConnection): Promise<void> {
    await dropLegacyTables(conn);

    await conn.query(`
        CREATE TABLE IF NOT EXISTS Prompts (
            Id              INT PRIMARY KEY AUTO_INCREMENT,
            Title           VARCHAR(500) NOT NULL DEFAULT '',
            RawTitle        VARCHAR(500) DEFAULT '',
            Description     TEXT DEFAULT NULL,
            Content         LONGTEXT DEFAULT NULL,
            Category        VARCHAR(100) DEFAULT 'multimodal-prompts',
            Source          VARCHAR(200) DEFAULT NULL,
            Author          VARCHAR(200) DEFAULT NULL,
            SourceUrl       VARCHAR(1000) DEFAULT NULL,
            CoverImageUrl   VARCHAR(1000) DEFAULT NULL,
            VideoPreviewUrl VARCHAR(1000) DEFAULT NULL,
            CardPreviewVideoUrl VARCHAR(1000) DEFAULT NULL,
            ImagesJson      LONGTEXT DEFAULT NULL,
            CopyCount       INT DEFAULT 0,
            IsActive        TINYINT(1) DEFAULT 1,
            CreatedAt       DATETIME DEFAULT NOW(),
            UpdatedAt       DATETIME DEFAULT NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    await conn.query(`
        CREATE TABLE IF NOT EXISTS SystemLogs (
            Id          INT PRIMARY KEY AUTO_INCREMENT,
            Level       VARCHAR(20) NOT NULL DEFAULT 'info',
            Source      VARCHAR(200) NOT NULL DEFAULT '',
            Message     TEXT NOT NULL,
            Detail      TEXT DEFAULT NULL,
            CreatedAt   DATETIME DEFAULT NOW()
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    await conn.query(`
        CREATE TABLE IF NOT EXISTS AgentSearchDocuments (
            Id              INT PRIMARY KEY AUTO_INCREMENT,
            ContentType     VARCHAR(20) NOT NULL,
            ContentId       VARCHAR(200) NOT NULL,
            Site            VARCHAR(50) NOT NULL DEFAULT 'ai',
            Title           VARCHAR(500) NOT NULL DEFAULT '',
            Summary         TEXT DEFAULT NULL,
            Category        VARCHAR(100) DEFAULT NULL,
            PublicUrl       VARCHAR(1000) DEFAULT NULL,
            CoverUrl        VARCHAR(1000) DEFAULT NULL,
            SearchableText  LONGTEXT DEFAULT NULL,
            MetadataJson    LONGTEXT DEFAULT NULL,
            SourceUpdatedAt DATETIME DEFAULT NULL,
            ContentHash     VARCHAR(64) DEFAULT NULL,
            IndexedAt       DATETIME DEFAULT NOW()
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    await conn.query(`
        CREATE TABLE IF NOT EXISTS AgentSearchChunks (
            Id              INT PRIMARY KEY AUTO_INCREMENT,
            DocumentId      INT NOT NULL,
            ChunkIndex      INT NOT NULL DEFAULT 0,
            ChunkText       LONGTEXT NOT NULL,
            ChunkHash       VARCHAR(64) NOT NULL,
            EmbeddingJson   LONGTEXT DEFAULT NULL,
            EmbeddingModel  VARCHAR(100) DEFAULT NULL,
            EmbeddedAt      DATETIME DEFAULT NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    await ensureIndex(conn, 'idx_systemlogs_level', `CREATE INDEX idx_systemlogs_level ON SystemLogs(Level)`);
    await ensureIndex(conn, 'idx_systemlogs_source', `CREATE INDEX idx_systemlogs_source ON SystemLogs(Source)`);
    await ensureIndex(conn, 'idx_systemlogs_created', `CREATE INDEX idx_systemlogs_created ON SystemLogs(CreatedAt)`);

    await ensureColumn(conn, 'Prompts', 'Title', `VARCHAR(500) NOT NULL DEFAULT ''`);
    await ensureColumn(conn, 'Prompts', 'RawTitle', `VARCHAR(500) DEFAULT ''`);
    await ensureColumn(conn, 'Prompts', 'Description', `TEXT DEFAULT NULL`);
    await ensureColumn(conn, 'Prompts', 'Content', `LONGTEXT DEFAULT NULL`);
    await ensureColumn(conn, 'Prompts', 'Category', `VARCHAR(100) DEFAULT 'multimodal-prompts'`);
    await ensureColumn(conn, 'Prompts', 'Source', `VARCHAR(200) DEFAULT NULL`);
    await ensureColumn(conn, 'Prompts', 'Author', `VARCHAR(200) DEFAULT NULL`);
    await ensureColumn(conn, 'Prompts', 'SourceUrl', `VARCHAR(1000) DEFAULT NULL`);
    await ensureColumn(conn, 'Prompts', 'CoverImageUrl', `VARCHAR(1000) DEFAULT NULL`);
    await ensureColumn(conn, 'Prompts', 'VideoPreviewUrl', `VARCHAR(1000) DEFAULT NULL`);
    await ensureColumn(conn, 'Prompts', 'CardPreviewVideoUrl', `VARCHAR(1000) DEFAULT NULL`);
    await ensureColumn(conn, 'Prompts', 'ImagesJson', `LONGTEXT DEFAULT NULL`);
    await ensureColumn(conn, 'Prompts', 'CopyCount', `INT DEFAULT 0`);
    await ensureColumn(conn, 'Prompts', 'IsActive', `TINYINT(1) DEFAULT 1`);
    await ensureColumn(conn, 'Prompts', 'CreatedAt', `DATETIME DEFAULT NULL`);
    await ensureColumn(conn, 'Prompts', 'UpdatedAt', `DATETIME DEFAULT NULL`);

    await conn.query(`
        UPDATE Prompts
        SET CreatedAt = NOW()
        WHERE CreatedAt IS NULL
    `);

    await ensureIndex(conn, 'idx_prompts_created', `CREATE INDEX idx_prompts_created ON Prompts(CreatedAt)`);
    await ensureIndex(conn, 'idx_prompts_category', `CREATE INDEX idx_prompts_category ON Prompts(Category)`);
    await ensureIndex(conn, 'idx_prompts_active', `CREATE INDEX idx_prompts_active ON Prompts(IsActive)`);
    await ensureIndex(conn, 'idx_prompts_sourceurl', `CREATE INDEX idx_prompts_sourceurl ON Prompts(SourceUrl(255))`);
    await ensureIndex(conn, 'idx_prompts_rawtitle', `CREATE INDEX idx_prompts_rawtitle ON Prompts(RawTitle)`);

    await ensureIndex(conn, 'uniq_agent_search_document', `CREATE UNIQUE INDEX uniq_agent_search_document ON AgentSearchDocuments(ContentType, Site, ContentId)`);
    await ensureIndex(conn, 'idx_agent_documents_type_site', `CREATE INDEX idx_agent_documents_type_site ON AgentSearchDocuments(ContentType, Site)`);
    await ensureIndex(conn, 'idx_agent_documents_category', `CREATE INDEX idx_agent_documents_category ON AgentSearchDocuments(Category)`);
    await ensureIndex(conn, 'idx_agent_documents_updated', `CREATE INDEX idx_agent_documents_updated ON AgentSearchDocuments(SourceUpdatedAt)`);
    await ensureIndex(conn, 'idx_agent_documents_indexed', `CREATE INDEX idx_agent_documents_indexed ON AgentSearchDocuments(IndexedAt)`);
    await ensureIndex(conn, 'idx_agent_chunks_document', `CREATE INDEX idx_agent_chunks_document ON AgentSearchChunks(DocumentId)`);
    await ensureIndex(conn, 'idx_agent_chunks_hash', `CREATE INDEX idx_agent_chunks_hash ON AgentSearchChunks(ChunkHash)`);

}
