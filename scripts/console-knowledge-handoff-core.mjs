import crypto from 'node:crypto';

function normalizePrefix(prefix) {
    return `${prefix}`.replace(/^\/+|\/+$/g, '');
}

function joinKey(...parts) {
    return parts
        .map((part) => `${part}`.replace(/^\/+|\/+$/g, ''))
        .filter(Boolean)
        .join('/');
}

function slugify(value) {
    return `${value}`
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

function createChecksum(content) {
    return `sha256:${crypto.createHash('sha256').update(content).digest('hex')}`;
}

function inferCategory(handoff) {
    return handoff.analysis?.typeTags?.contentCategory
        || handoff.analysis?.categoryHints?.[0]
        || 'ai-tech';
}

function inferSummary(handoff, translatedSummary) {
    return translatedSummary || handoff.analysis?.summary || '';
}

function inferSourcePlatform(handoff) {
    return handoff.source?.sourcePlatform || handoff.source?.sourceType || 'web';
}

function buildSlug(handoff) {
    const sourceType = slugify(handoff.source?.sourceType || 'article');
    const sourceContentId = slugify(handoff.source?.sourceContentId || handoff.source?.longformId || 'unknown');
    return `${sourceType}-${sourceContentId}`;
}

function splitMarkdownParagraphs(markdown) {
    const normalized = `${markdown}`.trim();
    const parts = normalized.split(/\n\s*\n/).map((part) => part.trim()).filter(Boolean);
    if (parts.length === 0) {
        return { heading: '', chunks: [] };
    }

    const [first, ...rest] = parts;
    if (first.startsWith('# ')) {
        return {
            heading: first.slice(2).trim(),
            chunks: rest,
        };
    }

    return {
        heading: '',
        chunks: parts,
    };
}

function extractFallbackTitle(handoff) {
    const explicitTitle = `${handoff.article?.title || ''}`.trim();
    if (explicitTitle) return explicitTitle;

    const content = `${handoff.article?.content || ''}`.trim();
    if (!content) return '未命名文章';

    const firstLine = content.split('\n').map((line) => line.trim()).find(Boolean) || '';
    if (firstLine.startsWith('# ')) {
        return firstLine.slice(2).trim() || '未命名文章';
    }

    return firstLine.slice(0, 80) || '未命名文章';
}

function deriveChineseTitle(handoff, terminology) {
    const title = extractFallbackTitle(handoff);
    if (!title) return '未命名文章';

    let output = title;
    output = output.replace(/reliable/gi, '可靠的');
    output = output.replace(/agent workflows?/gi, 'Agent 工作流');
    output = output.replace(/need review gates?/gi, '需要 review gate');
    output = output.replace(/^why\s+/i, '为什么');
    output = output.replace(/\s{2,}/g, ' ').replace(/\s+([，。！？])/g, '$1').trim();
    output = output.replace(/工作流\s+需要/g, '工作流需要');

    const keepTerms = collectKeptTerms(terminology);
    for (const term of keepTerms) {
        output = output.replace(new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), term);
    }

    return output;
}

function collectKeptTerms(terminology) {
    const result = new Set();
    for (const group of Object.values(terminology.terminology || {})) {
        for (const entry of Object.values(group || {})) {
            if (entry && entry.field === 'keep' && entry.en) {
                result.add(entry.zh || entry.en);
            }
        }
    }
    return Array.from(result);
}

function buildReviewMarkdown({ title, summary, body, hasCover }) {
    const lines = [`# ${title}`];

    if (summary) {
        lines.push('', `> ${summary}`);
    }

    if (hasCover) {
        lines.push('', '![封面](images/cover.jpg)');
    }

    if (body) {
        lines.push('', body.trim());
    }

    return `${lines.join('\n')}\n`;
}

async function downloadPrimaryImage(mediaAssets, fetchImpl) {
    const cover = (mediaAssets || []).find((asset) => (
        asset?.assetType === 'image'
        && asset?.processingStatus === 'completed'
        && typeof asset?.publicUrl === 'string'
        && asset.publicUrl.trim()
    ));

    if (!cover) return null;

    const response = await fetchImpl(cover.publicUrl);
    if (!response.ok) {
        throw new Error(`failed to download cover image: ${response.status}`);
    }

    const contentType = response.headers.get('content-type') || 'application/octet-stream';
    const body = new Uint8Array(await response.arrayBuffer());

    return {
        bytes: body,
        contentType,
    };
}

async function buildChineseReviewContent({ handoff, terminology, translator, reviewer }) {
    if (handoff.article.language === 'zh') {
        const fallbackTitle = extractFallbackTitle(handoff);
        return {
            title: fallbackTitle,
            summary: handoff.analysis?.summary || '',
            body: handoff.article.content.replace(/^# .+\n*/m, '').trim(),
        };
    }

    if (!translator?.translateChunk) {
        throw new Error('translator is required for English handoffs');
    }
    if (!reviewer?.reviewChunk) {
        throw new Error('reviewer is required for English handoffs');
    }

    const { heading, chunks } = splitMarkdownParagraphs(handoff.article.content);
    void heading;

    const reviewedChunks = [];
    for (const chunk of chunks) {
        const translatedChunk = await translator.translateChunk({
            chunk,
            terminology,
            handoff,
        });

        const reviewedChunk = await reviewer.reviewChunk({
            sourceChunk: chunk,
            translatedChunk,
            terminology,
            handoff,
        });

        reviewedChunks.push(`${reviewedChunk}`.trim());
    }

    return {
        title: deriveChineseTitle(handoff, terminology),
        summary: inferSummary(handoff, ''),
        body: reviewedChunks.join('\n\n').trim(),
    };
}

export async function stageConsoleHandoffReview(options) {
    const {
        handoff,
        siteConfig,
        store,
        fetchImpl = fetch,
        terminology,
        translator,
        reviewer,
        now = new Date(),
        updatedBy = 'console-knowledge-handoff',
    } = options;

    if (!handoff || handoff.schemaVersion !== 1) {
        throw new Error('handoff schemaVersion must be 1');
    }
    if (!handoff.article?.content?.trim()) {
        throw new Error('handoff article content is required');
    }

    const slug = buildSlug(handoff);
    const prefix = normalizePrefix(siteConfig.prefix);
    const content = await buildChineseReviewContent({
        handoff,
        terminology,
        translator,
        reviewer,
    });
    const cover = await downloadPrimaryImage(handoff.mediaAssets, fetchImpl);
    const reviewContentKey = joinKey(prefix, 'articles', 'review', slug, 'index.md');
    const reviewImageKey = cover ? joinKey(prefix, 'articles', 'review', slug, 'images', 'cover.jpg') : null;
    const stateKey = joinKey(prefix, 'state', 'articles', `${slug}.json`);
    const eventKey = joinKey(
        prefix,
        'events',
        `${now.toISOString().replace(/[:.]/g, '-')}-review-${slug}.json`,
    );
    const markdown = buildReviewMarkdown({
        title: content.title,
        summary: content.summary,
        body: content.body,
        hasCover: Boolean(cover),
    });

    await store.writeText(siteConfig.bucket, reviewContentKey, markdown, 'text/markdown; charset=utf-8');

    if (cover && reviewImageKey) {
        await store.writeBytes(siteConfig.bucket, reviewImageKey, cover.bytes, cover.contentType);
    }

    const stateDocument = {
        schemaVersion: 1,
        site: siteConfig.site,
        source: siteConfig.source,
        slug,
        state: 'review',
        version: 1,
        contentKey: reviewContentKey,
        assetPrefix: joinKey(prefix, 'articles', 'review', slug),
        checksum: createChecksum(markdown),
        updatedAt: now.toISOString(),
        updatedBy,
    };

    await store.writeJson(siteConfig.bucket, stateKey, stateDocument);
    await store.writeJson(siteConfig.bucket, eventKey, {
        schemaVersion: 1,
        action: 'review',
        slug,
        site: siteConfig.site,
        source: siteConfig.source,
        createdAt: now.toISOString(),
        originalUrl: handoff.source?.sourceUrl || null,
        sourcePlatform: inferSourcePlatform(handoff),
        category: inferCategory(handoff),
        language: handoff.article.language,
    });

    return {
        slug,
        title: content.title,
        summary: content.summary,
        reviewContentKey,
        reviewImageKey,
        stateKey,
        eventKey,
    };
}
