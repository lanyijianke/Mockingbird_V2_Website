import type { PromptImportRecord, PromptSourceAdapter, PromptSourceConfig } from '../types';

const YOUMIND_VIDEO_PROMPTS_ENDPOINT = 'https://youmind.com/youmarketing-api/video-prompts';
const YOUMIND_VIDEO_MODEL_BY_CATEGORY: Record<string, string> = {
    'seedance-2': 'seedance-2.0',
};

interface YouMindVideoPromptMedia {
    streamId?: string;
    customerCode?: string;
    thumbnail?: string;
    sourceUrl?: string;
    caption?: string;
}

interface YouMindVideoPrompt {
    id?: number | string;
    media?: YouMindVideoPromptMedia;
    videos?: YouMindVideoPromptMedia[];
    streamId?: string;
    customerCode?: string;
    thumbnail?: string;
    sourceUrl?: string;
    caption?: string;
}

interface YouMindVideoPromptResponse {
    prompts?: YouMindVideoPrompt[];
    hasMore?: boolean;
}

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

function buildCloudflareStreamDownloadUrl(streamId: string, customerCode?: string): string | null {
    if (!streamId) return null;
    const normalizedStreamId = streamId.trim();
    if (!normalizedStreamId) return null;

    try {
        const parsed = new URL(normalizedStreamId);
        if (parsed.hostname.endsWith('cloudflarestream.com')) {
            const streamMatch = parsed.pathname.match(/^\/([^/]+)(?:\/|$)/);
            return streamMatch
                ? `https://${parsed.hostname}/${streamMatch[1]}/downloads/default.mp4`
                : null;
        }
        if (parsed.hostname.endsWith('videodelivery.net')) {
            const streamMatch = parsed.pathname.match(/^\/([^/]+)(?:\/|$)/);
            return streamMatch
                ? `https://videodelivery.net/${streamMatch[1]}/downloads/default.mp4`
                : null;
        }
    } catch {
        // streamId is usually an opaque Cloudflare Stream id, not a full URL.
    }

    const normalizedCustomerCode = customerCode?.trim();
    if (normalizedCustomerCode) {
        return `https://customer-${normalizedCustomerCode}.cloudflarestream.com/${normalizedStreamId}/downloads/default.mp4`;
    }

    return `https://videodelivery.net/${normalizedStreamId}/downloads/default.mp4`;
}

function extractMp4Url(value: string | undefined): string | null {
    if (!value) return null;
    return value.match(/https?:\/\/[^\s"')]+\.mp4(?:\?[^\s"')]+)?/i)?.[0] || null;
}

function inferCustomerCodeFromCloudflareUrl(value: string | undefined): string | undefined {
    if (!value) return undefined;
    try {
        const parsed = new URL(value);
        const match = parsed.hostname.match(/^customer-([^.]+)\.cloudflarestream\.com$/i);
        return match?.[1];
    } catch {
        return undefined;
    }
}

function resolveYouMindVideoUrl(media: YouMindVideoPromptMedia): string | null {
    const directUrl = extractMp4Url(media.sourceUrl) || extractMp4Url(media.caption);
    if (directUrl) return directUrl;

    return buildCloudflareStreamDownloadUrl(
        media.streamId || '',
        media.customerCode || inferCustomerCodeFromCloudflareUrl(media.sourceUrl) || inferCustomerCodeFromCloudflareUrl(media.thumbnail)
    );
}

function extractDirectVideoUrls(section: string): string[] {
    const htmlLinks = [...section.matchAll(/<a\s[^>]*href=["'](.*?\.mp4(?:\?[^"']*)?)["'][^>]*>/gi)]
        .map((match) => match[1].trim());
    const plainLinks = [...section.matchAll(/https?:\/\/[^\s"')]+\.mp4(?:\?[^\s"')]+)?/gi)]
        .map((match) => match[0].trim());

    return Array.from(new Set([...htmlLinks, ...plainLinks]));
}

function extractYouMindWatchIds(section: string): number[] {
    const ids = [...section.matchAll(/https?:\/\/(?:www\.)?youmind\.com\/[^\s"')]+[?&]id=(\d+)/gi)]
        .map((match) => Number.parseInt(match[1], 10))
        .filter((id) => Number.isFinite(id) && id > 0);

    return Array.from(new Set(ids));
}

function extractVideoUrls(
    section: string,
    imageUrls: string[],
    youmindVideos: Map<number, string> = new Map(),
    fallbackUrl?: string
): string[] {
    const directUrls = extractDirectVideoUrls(section);
    if (directUrls.length > 0) return directUrls;

    const cloudflareUrls = imageUrls
        .map((imageUrl) => inferCloudflareVideoDownloadUrl(imageUrl))
        .filter((videoUrl): videoUrl is string => Boolean(videoUrl));
    if (cloudflareUrls.length > 0) return cloudflareUrls;

    const youmindUrls = extractYouMindWatchIds(section)
        .map((id) => youmindVideos.get(id))
        .filter((videoUrl): videoUrl is string => Boolean(videoUrl));
    if (youmindUrls.length > 0) return youmindUrls;

    if (extractYouMindWatchIds(section).length > 0 && fallbackUrl && /^https?:\/\/(?:www\.)?(?:x|twitter)\.com\//i.test(fallbackUrl)) {
        return [fallbackUrl];
    }

    return [];
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

function needsYouMindVideoLookup(source: PromptSourceConfig, readme: string): boolean {
    return Boolean(YOUMIND_VIDEO_MODEL_BY_CATEGORY[source.defaultCategory]) && /youmind\.com\/[^\s"')]+[?&]id=\d+/i.test(readme);
}

async function fetchYouMindVideoMap(source: PromptSourceConfig): Promise<Map<number, string>> {
    const model = YOUMIND_VIDEO_MODEL_BY_CATEGORY[source.defaultCategory];
    if (!model) return new Map();

    const locale = source.locale || 'zh-CN';
    const videoMap = new Map<number, string>();
    let page = 1;
    let hasMore = true;

    while (hasMore && page <= 50) {
        const response = await fetch(YOUMIND_VIDEO_PROMPTS_ENDPOINT, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': 'Mozilla/5.0',
            },
            body: JSON.stringify({
                model,
                page,
                limit: 100,
                locale,
            }),
        });

        if (!response.ok) break;

        const payload = await response.json() as YouMindVideoPromptResponse;
        for (const prompt of payload.prompts || []) {
            const promptId = typeof prompt.id === 'number' ? prompt.id : Number.parseInt(String(prompt.id || ''), 10);
            if (!Number.isFinite(promptId) || promptId <= 0) continue;

            const mediaCandidates = [
                ...(prompt.videos || []),
                prompt.media,
                prompt,
            ].filter((item): item is YouMindVideoPromptMedia => Boolean(item));
            const videoUrl = mediaCandidates
                .map((media) => resolveYouMindVideoUrl(media))
                .find((url): url is string => Boolean(url));
            if (videoUrl) videoMap.set(promptId, videoUrl);
        }

        hasMore = Boolean(payload.hasMore);
        page++;
    }

    return videoMap;
}

export async function parseYouMindReadmeToImportRecords(readme: string, source: PromptSourceConfig): Promise<PromptImportRecord[]> {
    const youmindVideos = needsYouMindVideoLookup(source, readme)
        ? await fetchYouMindVideoMap(source)
        : new Map<number, string>();
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
        const videoUrls = extractVideoUrls(body, mediaUrls, youmindVideos, originalSourceUrl);

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
