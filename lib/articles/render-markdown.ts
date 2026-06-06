import { extractToc, rehypeUniqueHeadingIds } from '@/lib/articles/markdown-headings';

export interface RenderedArticleMarkdown {
    renderedHtml: string;
    toc: ReturnType<typeof extractToc>;
}

export async function renderArticleMarkdown(content: string): Promise<RenderedArticleMarkdown> {
    const { unified } = await import('unified');
    const remarkParse = (await import('remark-parse')).default;
    const remarkGfm = (await import('remark-gfm')).default;
    const remarkRehype = (await import('remark-rehype')).default;
    const rehypeHighlight = (await import('rehype-highlight')).default;
    const rehypeStringify = (await import('rehype-stringify')).default;

    const toc = extractToc(content);
    const result = await unified()
        .use(remarkParse)
        .use(remarkGfm)
        .use(remarkRehype)
        .use(rehypeUniqueHeadingIds)
        .use(rehypeHighlight, { detect: true, ignoreMissing: true })
        .use(rehypeStringify)
        .process(content);

    return {
        toc,
        renderedHtml: String(result).replace(/<img /g, '<img loading="lazy" '),
    };
}
