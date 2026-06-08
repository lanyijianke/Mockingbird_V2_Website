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
    const slug = args._[0];
    if (!slug) throw new Error('Article slug is required');

    const url = new URL(`${baseUrl()}/api/agent/articles/${encodeURIComponent(slug)}`);
    if (args.site) url.searchParams.set('site', String(args.site));
    if (args.maxChars) url.searchParams.set('maxChars', String(args.maxChars));

    const payload = await requestJson(url.toString());
    console.log(JSON.stringify(payload, null, 2));
}

main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
});
