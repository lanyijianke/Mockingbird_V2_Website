import type { PromptImportRecord, PromptSourceAdapter, PromptSourceConfig } from '../types';

function renderSourceTemplate(template: string, source: PromptSourceConfig): string {
    const values: Record<string, string> = {
        owner: source.owner || '',
        repo: source.repo || '',
        branch: source.branch || 'main',
        file: source.file || 'README.md',
    };

    return template.replace(/\{(owner|repo|branch|file)\}/g, (_match, key: string) => encodeURIComponent(values[key]));
}

function buildRawSourceUrl(source: PromptSourceConfig): string {
    if (source.url) return source.url;
    if (!source.rawUrlTemplate) {
        throw new Error(`GitHub README source ${source.id} requires url or rawUrlTemplate`);
    }
    return renderSourceTemplate(source.rawUrlTemplate, source);
}

function getRepoUrl(source: PromptSourceConfig): string {
    if (source.repoUrlTemplate) return renderSourceTemplate(source.repoUrlTemplate, source);
    return source.url || '';
}

function stripMarkdown(value: string): string {
    return value
        .replace(/!\[.*?\]\(.*?\)/g, '')
        .replace(/<img\s[^>]*>/gi, '')
        .replace(/\[([^\]]+)\]\(.*?\)/g, '$1')
        .replace(/<[^>]+>/g, '')
        .replace(/\n{2,}/g, '\n')
        .trim();
}

function escapeRegex(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function extractSectionText(section: string, headingNames: string[]): string {
    const names = headingNames.map(escapeRegex).join('|');
    const match = section.match(new RegExp(`####\\s*[^\\n]*?(?:${names})\\s*\\n([\\s\\S]*?)(?=####|$)`, 'i'));
    return match ? stripMarkdown(match[1]).slice(0, 500) : '';
}

function extractCodeBlocks(section: string): string[] {
    return [...section.matchAll(/```[^\n]*\n([\s\S]*?)```/g)]
        .map((match) => match[1].trim())
        .filter((block) => block.length > 5);
}

function extractImages(section: string): string[] {
    return [...section.matchAll(/<img\s[^>]*src=["'](.*?)["'][^>]*>/gi)]
        .map((match) => match[1])
        .filter((url) => !url.includes('shields.io') && !url.includes('badge'));
}

function inferCloudflareVideoDownloadUrl(imageUrl: string): string | null {
    try {
        const parsed = new URL(imageUrl);
        if (!parsed.hostname.endsWith('cloudflarestream.com')) return null;

        const match = parsed.pathname.match(/^\/([^/]+)\/thumbnails\//i);
        if (!match) return null;

        return `https://${parsed.hostname}/${match[1]}/downloads/default.mp4`;
    } catch {
        return null;
    }
}

function extractDirectVideoUrls(section: string): string[] {
    const htmlLinks = [...section.matchAll(/<a\s[^>]*href=["'](.*?\.mp4(?:\?[^"']*)?)["'][^>]*>/gi)]
        .map((match) => match[1].trim());
    const plainLinks = [...section.matchAll(/https?:\/\/[^\s"')]+\.mp4(?:\?[^\s"')]+)?/gi)]
        .map((match) => match[0].trim());

    return Array.from(new Set([...htmlLinks, ...plainLinks]));
}

function extractVideoUrls(section: string, imageUrls: string[]): string[] {
    const directUrls = extractDirectVideoUrls(section);
    if (directUrls.length > 0) return directUrls;

    return imageUrls
        .map((imageUrl) => inferCloudflareVideoDownloadUrl(imageUrl))
        .filter((videoUrl): videoUrl is string => Boolean(videoUrl));
}

function extractLinkedValue(section: string, labels: string[]): string | undefined {
    for (const label of labels) {
        const linked = section.match(new RegExp(`\\*\\*${escapeRegex(label)}:\\*\\*\\s*\\[(.*?)\\]\\((.*?)\\)`, 'i'));
        if (linked) return linked[1].trim();
    }
    return undefined;
}

function extractLinkedUrl(section: string, labels: string[]): string | undefined {
    for (const label of labels) {
        const linked = section.match(new RegExp(`\\*\\*${escapeRegex(label)}:\\*\\*\\s*\\[.*?\\]\\((.*?)\\)`, 'i'));
        if (linked) return linked[1].trim();
    }
    return undefined;
}

function extractPlainValue(section: string, labels: string[]): string | undefined {
    for (const label of labels) {
        const match = section.match(new RegExp(`\\*\\*${escapeRegex(label)}:\\*\\*\\s*([^\\n|]+)`, 'i'));
        if (match) return match[1].trim();
    }
    return undefined;
}

function extractFlags(section: string): string[] {
    const flags: string[] = [];
    if (/Featured/i.test(section)) flags.push('featured');
    if (/Raycast[_\s-]*Friendly|Raycast/i.test(section)) flags.push('raycast');
    return flags;
}

function buildExternalId(source: PromptSourceConfig, titleLine: string): string {
    const noMatch = titleLine.match(/^No\.\s*(\d+)/i);
    if (noMatch) return `${source.id}:no-${noMatch[1]}`;
    return `${source.id}:${titleLine.toLowerCase().replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '')}`;
}

function buildGitHubAnchorSourceUrl(source: PromptSourceConfig, titleLine: string): string | undefined {
    const repoUrl = getRepoUrl(source);
    if (!repoUrl) return undefined;
    const anchor = titleLine
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s-]/gu, '')
        .trim()
        .replace(/\s+/g, '-');
    return `${repoUrl}#${encodeURIComponent(anchor)}`;
}

export function parseYouMindReadmeToImportRecords(readme: string, source: PromptSourceConfig): PromptImportRecord[] {
    const records: PromptImportRecord[] = [];
    const sections = readme.split(/^###\s+/m).filter((section) => section.trim());

    for (const section of sections) {
        const lines = section.split('\n');
        const titleLine = lines[0]?.trim();
        if (!titleLine || titleLine.length < 3) continue;
        if (/^(📖|📊|🤝|📄|🙏|⭐|📚|🌐|🤔|🚀|🔥|🎬|📋|🐛)/.test(titleLine)) continue;

        const body = lines.slice(1).join('\n').trim();
        const codeBlocks = extractCodeBlocks(body);
        if (codeBlocks.length === 0) continue;

        const rawTitle = titleLine.replace(/^No\.\s*\d+:\s*/i, '').trim();
        const description = extractSectionText(body, ['描述', 'Description']) || codeBlocks.join('\n\n').slice(0, 200);
        const originalSourceUrl = extractLinkedUrl(body, ['来源', 'Source']);
        const mediaUrls = extractImages(body);
        const videoUrls = extractVideoUrls(body, mediaUrls);

        records.push({
            externalId: buildExternalId(source, titleLine),
            title: rawTitle || titleLine,
            rawTitle: rawTitle || titleLine,
            description,
            content: codeBlocks.join('\n\n'),
            category: source.defaultCategory,
            author: extractLinkedValue(body, ['作者', 'Author']) || extractPlainValue(body, ['作者', 'Author']),
            sourceUrl: originalSourceUrl || buildGitHubAnchorSourceUrl(source, titleLine),
            sourcePublishedAt: extractPlainValue(body, ['发布时间', 'Published']),
            mediaUrls,
            videoUrls,
            flags: extractFlags(body),
            metadata: {
                sourceId: source.id,
                sourceAdapter: source.adapter || githubReadmeYouMindAdapter.id,
                githubAnchorUrl: buildGitHubAnchorSourceUrl(source, titleLine),
            },
        });
    }

    return records;
}

export const githubReadmeYouMindAdapter: PromptSourceAdapter = {
    id: 'github-readme-yoomind',
    canHandle(source) {
        return source.type === 'github-readme' && (!source.adapter || source.adapter === this.id);
    },
    async fetchSource(source) {
        const res = await fetch(buildRawSourceUrl(source));
        if (!res.ok) throw new Error(`Failed to fetch ${source.id}: ${res.status} ${res.statusText}`);
        return res.text();
    },
    async parse(input, source) {
        return parseYouMindReadmeToImportRecords(input.toString(), source);
    },
};
