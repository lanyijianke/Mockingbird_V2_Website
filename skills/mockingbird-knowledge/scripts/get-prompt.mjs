#!/usr/bin/env node

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
    const id = process.argv[2];
    if (!/^[1-9]\d*$/.test(id || '')) throw new Error('Positive numeric prompt id is required');

    const payload = await requestJson(`${baseUrl()}/api/agent/prompts/${id}`);
    console.log(JSON.stringify(payload, null, 2));
}

main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
});
