import { notFound } from 'next/navigation';
import {
    getArticleDetailPath,
    getArticleListPath,
} from '@/lib/articles/article-route-paths';
import {
    buildArticleDetailMetadata,
    buildArticlesMetadata,
} from '@/lib/seo/metadata';
import {
    JsonLdScript,
    buildArticleSchema,
} from '@/lib/seo/schema';
import { buildAbsoluteUrl } from '@/lib/site-config';
import ArticleReaderClient from '@/app/articles/[slug]/ArticleReaderClient';
import '@/app/articles/[slug]/article-reader.css';

export const runtime = 'nodejs';
export const revalidate = 3600;

export async function generateStaticParams() {
    const { getAllSlugs } = await import('@/lib/services/article-service');
    const slugs = await getAllSlugs('ai');
    return slugs.map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
    const { getArticleBySlug } = await import('@/lib/services/article-service');
    const { slug } = await params;
    const article = await getArticleBySlug(slug, { site: 'ai' });

    if (!article) {
        return buildArticlesMetadata();
    }

    return buildArticleDetailMetadata({
        title: article.seoTitle || article.title,
        description: article.seoDescription || article.summary,
        path: getArticleDetailPath('ai', article.slug),
    });
}

interface TocItem {
    id: string;
    text: string;
    level: number;
}

function extractToc(markdown: string): TocItem[] {
    const headingRegex = /^(#{1,5})\s+(.+)$/gm;
    const toc: TocItem[] = [];
    let match: RegExpExecArray | null;
    while ((match = headingRegex.exec(markdown)) !== null) {
        const level = match[1].length;
        const text = match[2]
            .replace(/\*\*(.+?)\*\*/g, '$1')
            .replace(/\*(.+?)\*/g, '$1')
            .replace(/`(.+?)`/g, '$1')
            .replace(/\[(.+?)\]\(.+?\)/g, '$1')
            .trim();
        const id = text
            .toLowerCase()
            .replace(/[^\p{L}\p{N}\s-]/gu, '')
            .replace(/\s+/g, '-')
            .replace(/-+/g, '-')
            .replace(/^-|-$/g, '');
        if (text && id) {
            toc.push({ id, text, level });
        }
    }
    return toc;
}

function estimateReadingMinutes(content: string): number {
    const plain = content
        .replace(/```[\s\S]*?```/g, '')
        .replace(/`[^`]+`/g, '')
        .replace(/https?:\/\/\S+/g, '')
        .replace(/[#*\[\]()\>|_~`\-!]/g, '')
        .replace(/\s+/g, '');
    return Math.max(1, Math.ceil(plain.length / 600));
}

export default async function AiArticleDetailPage({
    params,
}: {
    params: Promise<{ slug: string }>;
}) {
    const { getArticleBySlug, getRelatedArticles } = await import('@/lib/services/article-service');
    const { slug } = await params;
    const article = await getArticleBySlug(slug, { site: 'ai' });
    if (!article) notFound();

    const content = article.content || '';
    const toc = extractToc(content);
    const readingMinutes = estimateReadingMinutes(content);
    const relatedArticles = await getRelatedArticles(article.category, slug, 6, { site: 'ai' });

    const dateStr = new Date(article.createdAt).toLocaleDateString('zh-CN', {
        timeZone: 'Asia/Shanghai',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
    });

    const { unified } = await import('unified');
    const remarkParse = (await import('remark-parse')).default;
    const remarkGfm = (await import('remark-gfm')).default;
    const remarkRehype = (await import('remark-rehype')).default;
    const rehypeSlug = (await import('rehype-slug')).default;
    const rehypeHighlight = (await import('rehype-highlight')).default;
    const rehypeStringify = (await import('rehype-stringify')).default;

    const result = await unified()
        .use(remarkParse)
        .use(remarkGfm)
        .use(remarkRehype)
        .use(rehypeSlug)
        .use(rehypeHighlight, { detect: true, ignoreMissing: true })
        .use(rehypeStringify)
        .process(content);

    const renderedHtml = String(result).replace(/<img /g, '<img loading="lazy" ');
    const articleUrl = getArticleDetailPath('ai', slug);
    const articleShareUrl = buildAbsoluteUrl(articleUrl);
    const explorationLinks = [
        {
            href: `${getArticleListPath('ai')}?category=${encodeURIComponent(article.category)}`,
            title: `更多 ${article.categoryName} 文章`,
            description: `按 ${article.categoryName} 分类继续浏览同主题文章。`,
        },
        {
            href: '/ai/prompts?category=gemini-3',
            title: '相关提示词',
            description: '从文章切到可直接复用的多模态提示词模板，缩短落地路径。',
        },
        {
            href: '/ai/rankings/producthunt',
            title: '跟进 ProductHunt 热榜',
            description: '结合热门新产品观察 AI 工具趋势，补充文章里的行业上下文。',
        },
    ];

    return (
        <>
            <JsonLdScript
                data={buildArticleSchema({
                    title: article.seoTitle || article.title,
                    description: article.seoDescription || article.summary,
                    path: articleUrl,
                    datePublished: article.createdAt,
                    dateModified: article.updatedAt,
                })}
            />
            <ArticleReaderClient
                renderedHtml={renderedHtml}
                toc={toc}
                title={article.title}
                categoryName={article.categoryName}
                dateStr={dateStr}
                readingMinutes={readingMinutes}
                summary={article.summary ?? ''}
                articleUrl={articleShareUrl}
                backHref={getArticleListPath('ai')}
                relatedArticles={relatedArticles.map((item) => ({
                    href: getArticleDetailPath('ai', item.slug),
                    slug: item.slug,
                    title: item.title,
                    coverUrl: item.coverUrl,
                    category: item.categoryName,
                    summary: item.summary,
                }))}
                explorationLinks={explorationLinks}
            />
        </>
    );
}
