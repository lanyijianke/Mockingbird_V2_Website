#!/usr/bin/env node

function parseArgs(argv) {
    const result = { _: [] };
    for (const arg of argv) {
        if (!arg.startsWith('--')) {
            result._.push(arg);
            continue;
        }
        const [key, ...rest] = arg.slice(2).split('=');
        result[key] = rest.length > 0 ? rest.join('=') : 'true';
    }
    return result;
}

function baseUrl() {
    return (
        process.env.MOCKINGBIRD_KNOWLEDGE_BASE_URL ||
        process.env.MOCKINGBIRD_AGENT_ASSETS_BASE_URL ||
        'https://zgnknowledge.online'
    ).replace(/\/+$/g, '');
}

async function requestJson(url) {
    let response;
    try {
        response = await fetch(url);
    } catch (error) {
        throw new Error(`Request failed for ${url}: ${error instanceof Error ? error.message : String(error)}`);
    }
    const text = await response.text();
    if (!response.ok) {
        throw new Error(`API error ${response.status} for ${url}: ${text.slice(0, 500)}`);
    }
    return JSON.parse(text);
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    const query = args._.join(' ').trim() || args.q;
    if (!query) throw new Error('Search query is required');

    const url = new URL(`${baseUrl()}/api/agent/search`);
    url.searchParams.set('q', query);
    if (args.type) url.searchParams.set('type', String(args.type));
    if (args.site) url.searchParams.set('site', String(args.site));
    if (args.category) url.searchParams.set('category', String(args.category));
    if (args.limit) url.searchParams.set('limit', String(args.limit));
    if (args.media) url.searchParams.set('media', String(args.media));
    if (args.useCase) url.searchParams.set('useCase', String(args.useCase));

    const payload = await requestJson(url.toString());
    console.log(JSON.stringify(payload, null, 2));
}

main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
});
