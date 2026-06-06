import crypto from 'node:crypto';
import { copyFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

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

function isMarkdownImageOnly(value) {
    return /^!\[[^\]]*\]\([^)]+\)$/.test(`${value}`.trim());
}

function escapeHtml(value) {
    return `${value}`
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function renderMarkdownLite(markdown) {
    const lines = `${markdown}`.trim().split('\n');
    const html = [];
    let listOpen = false;

    const closeList = () => {
        if (listOpen) {
            html.push('</ul>');
            listOpen = false;
        }
    };

    for (const rawLine of lines) {
        const line = rawLine.trimEnd();
        if (!line.trim()) {
            closeList();
            continue;
        }
        if (line.startsWith('# ')) {
            closeList();
            html.push(`<h1>${escapeHtml(line.slice(2).trim())}</h1>`);
            continue;
        }
        if (line.startsWith('## ')) {
            closeList();
            html.push(`<h2>${escapeHtml(line.slice(3).trim())}</h2>`);
            continue;
        }
        if (line.startsWith('### ')) {
            closeList();
            html.push(`<h3>${escapeHtml(line.slice(4).trim())}</h3>`);
            continue;
        }
        if (line.startsWith('> ')) {
            closeList();
            html.push(`<blockquote>${escapeHtml(line.slice(2).trim())}</blockquote>`);
            continue;
        }
        const imageMatch = line.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
        if (imageMatch) {
            closeList();
            html.push(`<figure><img src="${escapeHtml(imageMatch[2].trim())}" alt="${escapeHtml(imageMatch[1].trim())}" loading="lazy" /></figure>`);
            continue;
        }
        if (/^- /.test(line)) {
            if (!listOpen) {
                html.push('<ul>');
                listOpen = true;
            }
            html.push(`<li>${escapeHtml(line.slice(2).trim())}</li>`);
            continue;
        }
        closeList();
        html.push(`<p>${escapeHtml(line.trim())}</p>`);
    }

    closeList();
    return html.join('\n');
}

function extractRelativeImagePaths(markdown) {
    const paths = [];
    const pattern = /!\[[^\]]*\]\((?!https?:\/\/|data:|mailto:|#)([^)]+)\)/g;
    for (const match of markdown.matchAll(pattern)) {
        const imagePath = match[1].trim().replace(/^\.\/+/, '');
        if (imagePath && !imagePath.includes('..')) {
            paths.push(imagePath);
        }
    }
    return Array.from(new Set(paths));
}

async function copyPreviewAssets({ outputDir, markdown, assetSourceDir, assets = {} }) {
    const imagePaths = extractRelativeImagePaths(markdown);
    for (const imagePath of imagePaths) {
        const outputPath = path.join(outputDir, imagePath);
        await mkdir(path.dirname(outputPath), { recursive: true });

        if (assets[imagePath]) {
            await writeFile(outputPath, assets[imagePath]);
            continue;
        }

        if (assetSourceDir) {
            await copyFile(path.join(assetSourceDir, imagePath), outputPath);
        }
    }
}

function buildPreviewHtml({ handoff, markdown, metadata, stateDocument }) {
    const translationReview = metadata.translationReview || {};
    const isEnglish = handoff.article.language === 'en';
    const evidence = [
        ['原文 URL', metadata.originalUrl || '-'],
        ['R2 handoff', metadata.sourceLocator || '-'],
        ['语言', metadata.language || '-'],
        ['翻译方式', translationReview.method || (isEnglish ? '未记录' : '中文原文，无需翻译')],
        ['分段数量', `${translationReview.translatedChunks ?? splitMarkdownParagraphs(markdown).chunks.length}`],
        ['Checker 状态', translationReview.checkerStatus || '-'],
        ['R2 review markdown', stateDocument.contentKey],
        ['Public manifest', '未更新，仍待人工确认'],
    ];

    return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(metadata.title)} - 临时审阅预览</title>
  <style>
    :root { color-scheme: light; --bg:#f6f7f9; --panel:#fff; --text:#17202a; --muted:#667085; --line:#d8dee8; --ok:#0f7b46; --warn:#a45f00; --accent:#2454d6; }
    * { box-sizing: border-box; }
    body { margin: 0; background: var(--bg); color: var(--text); font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; line-height: 1.65; }
    main { max-width: 1080px; margin: 0 auto; padding: 32px 24px 72px; }
    header, section { background: var(--panel); border: 1px solid var(--line); border-radius: 8px; padding: 20px; margin-bottom: 16px; }
    h1, h2, h3 { line-height: 1.25; margin: 0 0 12px; }
    .eyebrow { color: var(--muted); font-size: 13px; margin: 0 0 6px; }
    .summary { color: var(--muted); max-width: 860px; }
    .status { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 14px; }
    .pill { border: 1px solid var(--line); border-radius: 999px; padding: 4px 10px; font-size: 13px; background: #fafbfc; }
    .pill.ok { color: var(--ok); border-color: #a8dbc0; background: #effaf4; }
    .pill.warn { color: var(--warn); border-color: #ecd09b; background: #fff8e8; }
    .evidence { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; }
    .card { border: 1px solid var(--line); border-radius: 8px; padding: 12px; min-width: 0; }
    .label { color: var(--muted); font-size: 12px; margin-bottom: 4px; }
    .value { overflow-wrap: anywhere; font-size: 14px; }
    a { color: var(--accent); }
    .tools { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 12px; }
    .tool-link { border: 1px solid var(--line); border-radius: 6px; padding: 7px 10px; text-decoration: none; background: #fafbfc; font-size: 14px; }
    pre { white-space: pre-wrap; overflow-wrap: anywhere; margin: 0; font: inherit; }
    .article-preview { max-width: 820px; margin-left: auto; margin-right: auto; padding: 32px; }
    .article-preview h1 { font-size: 34px; margin-top: 0; }
    .article-preview h2 { font-size: 25px; margin-top: 34px; }
    .article-preview h3 { font-size: 20px; margin-top: 28px; }
    .article-preview p, .article-preview li { font-size: 17px; }
    .article-preview blockquote { border-left: 4px solid var(--line); color: var(--muted); margin: 18px 0; padding-left: 16px; }
    .article-preview img { display: block; max-width: 100%; height: auto; border-radius: 8px; border: 1px solid var(--line); margin: 20px auto; }
    .instruction { border-color: #b9c7f5; background: #f4f6ff; }
    @media (max-width: 900px) { .evidence { grid-template-columns: 1fr; } .article-preview { padding: 20px; } }
  </style>
</head>
<body>
  <main>
    <header>
      <p class="eyebrow">临时审阅预览</p>
      <h1>${escapeHtml(metadata.title)}</h1>
      <p class="summary">${escapeHtml(metadata.summary || '')}</p>
      <div class="status">
        <span class="pill warn">待人工审阅</span>
        <span class="pill ok">Public manifest 未更新</span>
        <span class="pill">${escapeHtml(metadata.language || '-')}</span>
        <span class="pill">${escapeHtml(metadata.category || '-')}</span>
      </div>
      <div class="tools">
        <a class="tool-link" href="translation.md">打开 Markdown 正文</a>
        <a class="tool-link" href="source.md">查看原始交接正文</a>
        <a class="tool-link" href="review.json">查看审阅元数据</a>
      </div>
    </header>

    <section>
      <h2>证据卡</h2>
      <div class="evidence">
        ${evidence.map(([label, value]) => `<div class="card"><div class="label">${escapeHtml(label)}</div><div class="value">${metadata.originalUrl && label === '原文 URL' ? `<a href="${escapeHtml(metadata.originalUrl)}" target="_blank" rel="noreferrer">${escapeHtml(value)}</a>` : escapeHtml(value)}</div></div>`).join('\n')}
      </div>
    </section>

    ${translationReview.checkerReport ? `<section><h2>Checker 报告</h2><pre>${escapeHtml(translationReview.checkerReport)}</pre></section>` : ''}

    <section class="article-preview">
      <p class="eyebrow">正文预览</p>
      ${renderMarkdownLite(markdown)}
    </section>

    <section class="instruction">
      <h2>审阅结论</h2>
      <p>如果通过，回复：发布这篇。</p>
      <p>如果不通过，直接指出要修改的小节、段落或术语问题；技能应先修订 review 草稿并重新生成本地预览。</p>
    </section>
  </main>
</body>
</html>
`;
}

export async function writeConsoleHandoffPreview({
    previewDir,
    slug,
    handoff,
    markdown,
    metadata,
    stateDocument,
    assetSourceDir,
    assets = {},
}) {
    if (!previewDir) return null;

    const outputDir = path.join(previewDir, slug);
    await mkdir(outputDir, { recursive: true });

    const indexPath = path.join(outputDir, 'index.html');
    const sourcePath = path.join(outputDir, 'source.md');
    const translationPath = path.join(outputDir, 'translation.md');
    const metadataPath = path.join(outputDir, 'review.json');

    await writeFile(sourcePath, `${handoff.article.content.trim()}\n`, 'utf8');
    await writeFile(translationPath, markdown, 'utf8');
    await writeFile(metadataPath, `${JSON.stringify({ metadata, state: stateDocument }, null, 2)}\n`, 'utf8');
    await copyPreviewAssets({ outputDir, markdown, assetSourceDir, assets });
    await writeFile(indexPath, buildPreviewHtml({ handoff, markdown, metadata, stateDocument }), 'utf8');

    return {
        directory: outputDir,
        indexPath,
        sourcePath,
        translationPath,
        metadataPath,
    };
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
        if (isMarkdownImageOnly(chunk)) {
            reviewedChunks.push(chunk.trim());
            continue;
        }

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
        previewDir = path.join(process.cwd(), '.tmp', 'knowledge-preview'),
        reviewMetadata = {},
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
    const reviewMetadataKey = joinKey(prefix, 'articles', 'review', slug, 'review.json');
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

    const metadataDocument = {
        schemaVersion: 1,
        sourceLocator: reviewMetadata.sourceLocator || null,
        originalUrl: handoff.source?.sourceUrl || null,
        sourcePlatform: inferSourcePlatform(handoff),
        sourceType: handoff.source?.sourceType || null,
        sourceContentId: handoff.source?.sourceContentId || null,
        exportedAt: handoff.exportedAt || null,
        title: content.title,
        summary: content.summary,
        category: inferCategory(handoff),
        language: handoff.article.language,
        translationReview: reviewMetadata.translationReview || null,
    };

    await store.writeJson(siteConfig.bucket, reviewMetadataKey, metadataDocument);

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

    const preview = await writeConsoleHandoffPreview({
        previewDir,
        slug,
        handoff,
        markdown,
        metadata: metadataDocument,
        stateDocument,
        assets: cover ? { 'images/cover.jpg': cover.bytes } : {},
    });

    return {
        slug,
        title: content.title,
        summary: content.summary,
        reviewContentKey,
        reviewImageKey,
        reviewMetadataKey,
        stateKey,
        eventKey,
        preview,
    };
}
