#!/usr/bin/env node

function parseArgs(argv) {
    const options = {
        baseUrl: process.env.MOCKINGBIRD_KNOWLEDGE_BASE_URL || 'http://localhost:5046',
        afterId: 0,
        limit: 100,
        maxBatches: Number.POSITIVE_INFINITY,
    };

    for (const arg of argv) {
        if (arg.startsWith('--base-url=')) options.baseUrl = arg.slice('--base-url='.length).replace(/\/+$/, '');
        if (arg.startsWith('--after-id=')) options.afterId = Number.parseInt(arg.slice('--after-id='.length), 10);
        if (arg.startsWith('--limit=')) options.limit = Number.parseInt(arg.slice('--limit='.length), 10);
        if (arg.startsWith('--max-batches=')) options.maxBatches = Number.parseInt(arg.slice('--max-batches='.length), 10);
    }

    if (!Number.isInteger(options.afterId) || options.afterId < 0) throw new Error('--after-id must be a non-negative integer');
    if (!Number.isInteger(options.limit) || options.limit <= 0) throw new Error('--limit must be a positive integer');
    if (!Number.isFinite(options.maxBatches) && options.maxBatches !== Number.POSITIVE_INFINITY) {
        throw new Error('--max-batches must be a positive integer');
    }
    if (Number.isFinite(options.maxBatches) && (!Number.isInteger(options.maxBatches) || options.maxBatches <= 0)) {
        throw new Error('--max-batches must be a positive integer');
    }

    return options;
}

function adminToken() {
    const token = process.env.KNOWLEDGE_ADMIN_TOKEN || process.env.ADMIN_API_TOKEN;
    if (!token) throw new Error('KNOWLEDGE_ADMIN_TOKEN or ADMIN_API_TOKEN is required');
    return token;
}

async function postBatch(options, afterId) {
    const response = await fetch(`${options.baseUrl}/api/agent/index`, {
        method: 'POST',
        headers: {
            authorization: `Bearer ${adminToken()}`,
            'content-type': 'application/json',
        },
        body: JSON.stringify({
            type: 'prompt-batch',
            afterId,
            limit: options.limit,
        }),
    });
    const text = await response.text();
    if (!response.ok) {
        throw new Error(`Batch request failed ${response.status}: ${text.slice(0, 500)}`);
    }
    return JSON.parse(text).data;
}

async function main() {
    const options = parseArgs(process.argv.slice(2));
    let afterId = options.afterId;
    let batch = 0;
    let indexed = 0;
    let skipped = 0;
    let failed = 0;

    while (batch < options.maxBatches) {
        batch += 1;
        const report = await postBatch(options, afterId);
        for (const item of report.items || []) {
            if (item.status === 'indexed') indexed += 1;
            else if (item.status === 'skipped') skipped += 1;
            else if (item.status === 'failed') failed += 1;
        }

        console.log(JSON.stringify({
            batch,
            processed: report.processed,
            requestedLimit: report.requestedLimit,
            nextCursor: report.nextCursor,
            hasMore: report.hasMore,
            indexed,
            skipped,
            failed,
        }));

        if (!report.hasMore || !report.nextCursor || report.processed === 0) break;
        afterId = report.nextCursor;
    }

    if (failed > 0) process.exitCode = 2;
}

main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
});
