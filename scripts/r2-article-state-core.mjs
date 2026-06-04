import { createHash } from 'node:crypto';
import path from 'node:path';

export function normalizeR2Prefix(prefix) {
    return prefix.replace(/^\/+|\/+$/g, '');
}

export function joinR2Key(...parts) {
    return parts
        .map((part) => `${part}`.replace(/^\/+|\/+$/g, ''))
        .filter(Boolean)
        .join('/');
}

export function createR2StateChecksum(text) {
    return `sha256:${createHash('sha256').update(text).digest('hex')}`;
}

export function revisionFromDate(date) {
    return date.toISOString().replace(/[:.]/g, '-');
}

export function resolveArticleAssetPath(article) {
    if (!article.coverImage) return null;
    if (/^https?:\/\//i.test(article.coverImage)) return null;

    const baseDirectory = path.posix.dirname(article.contentPath);
    return path.posix.normalize(path.posix.join(baseDirectory, article.coverImage));
}

export async function verifyR2ArticleState(store, options) {
    const prefix = normalizeR2Prefix(options.prefix);
    const manifest = JSON.parse(await store.readText(options.bucket, joinR2Key(prefix, 'manifest.json')));
    const publishedArticles = (manifest.articles || []).filter((article) => article.status === 'published');
    const missing = [];
    const checksumMismatches = [];

    for (const article of publishedArticles) {
        const contentKey = joinR2Key(prefix, article.contentPath);

        try {
            const content = await store.readText(options.bucket, contentKey);
            if (article.checksum && article.checksum !== createR2StateChecksum(content)) {
                checksumMismatches.push(contentKey);
            }
        } catch {
            missing.push(contentKey);
        }

        const coverPath = resolveArticleAssetPath(article);
        if (!coverPath) continue;

        const coverKey = joinR2Key(prefix, coverPath);
        try {
            await store.readText(options.bucket, coverKey);
        } catch {
            missing.push(coverKey);
        }
    }

    return {
        publishedCount: publishedArticles.length,
        missing,
        checksumMismatches,
    };
}

export async function snapshotR2ArticleState(store, options) {
    const prefix = normalizeR2Prefix(options.prefix);
    const now = options.now || new Date();
    const revision = revisionFromDate(now);
    const manifest = JSON.parse(await store.readText(options.bucket, joinR2Key(prefix, 'manifest.json')));

    manifest.schemaVersion ??= 1;
    manifest.revision = revision;
    manifest.updatedAt = now.toISOString();

    const snapshotKey = joinR2Key(prefix, 'manifests', `${revision}.json`);
    await store.writeJson(options.bucket, snapshotKey, manifest);
    return snapshotKey;
}

export async function rollbackR2ArticleState(store, options) {
    const prefix = normalizeR2Prefix(options.prefix);
    const manifest = JSON.parse(await store.readText(options.bucket, options.snapshotKey));
    await store.writeJson(options.bucket, joinR2Key(prefix, 'manifest.json'), manifest);
}

export async function listR2ArticleStateKeys(store, options) {
    return store.listKeys(options.bucket, normalizeR2Prefix(options.prefix));
}
