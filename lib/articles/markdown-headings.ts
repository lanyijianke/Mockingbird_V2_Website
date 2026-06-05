export interface TocItem {
    id: string;
    text: string;
    level: number;
}

interface HastNode {
    type?: string;
    tagName?: string;
    value?: unknown;
    children?: HastNode[];
    properties?: Record<string, unknown>;
}

function slugifyHeadingText(text: string): string {
    return text
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s-]/gu, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');
}

function createHeadingSlugger() {
    const seen = new Map<string, number>();

    return (text: string): string => {
        const base = slugifyHeadingText(text);
        if (!base) return '';

        const count = seen.get(base) ?? 0;
        seen.set(base, count + 1);
        return count === 0 ? base : `${base}-${count + 1}`;
    };
}

function extractMarkdownHeadingText(rawText: string): string {
    return rawText
        .replace(/\*\*(.+?)\*\*/g, '$1')
        .replace(/\*(.+?)\*/g, '$1')
        .replace(/`(.+?)`/g, '$1')
        .replace(/\[(.+?)\]\(.+?\)/g, '$1')
        .trim();
}

export function extractToc(markdown: string): TocItem[] {
    const headingRegex = /^(#{1,5})\s+(.+)$/gm;
    const slug = createHeadingSlugger();
    const toc: TocItem[] = [];
    let match: RegExpExecArray | null;

    while ((match = headingRegex.exec(markdown)) !== null) {
        const level = match[1].length;
        const text = extractMarkdownHeadingText(match[2]);
        const id = slug(text);

        if (text && id) {
            toc.push({ id, text, level });
        }
    }

    return toc;
}

function extractHastText(node: HastNode): string {
    if (node.type === 'text' && typeof node.value === 'string') {
        return node.value;
    }

    return (node.children ?? []).map(extractHastText).join('');
}

function visitHeadings(node: HastNode, slug: (text: string) => string): void {
    if (node.type === 'element' && /^h[1-6]$/.test(node.tagName ?? '')) {
        const text = extractHastText(node).trim();
        const id = slug(text);

        if (id) {
            node.properties = { ...(node.properties ?? {}), id };
        }
    }

    for (const child of node.children ?? []) {
        visitHeadings(child, slug);
    }
}

export function rehypeUniqueHeadingIds() {
    return (tree: HastNode) => {
        visitHeadings(tree, createHeadingSlugger());
    };
}
