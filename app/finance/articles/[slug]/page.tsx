import { notFound } from 'next/navigation';
import { getArticleDetailPath, getArticleListPath } from '@/lib/articles/article-route-paths';
import { extractToc, rehypeUniqueHeadingIds } from '@/lib/articles/markdown-headings';
import ArticleReaderClient from '@/app/articles/[slug]/ArticleReaderClient';
import '@/app/articles/[slug]/article-reader.css';

export const runtime = 'nodejs';
export const revalidate = 3600;

const ARTICLE_EXPLORATION_LINKS = [
    {
        href: getArticleListPath('finance'),
        title: '继续浏览金融文章',
        description: '返回金融文章列表，查看同一主题下的宏观、市场与策略内容。',
    },
    {
        href: '/ai/rankings/github',
        title: '查看 GitHub 趋势项目',
        description: '把金融研究和开发工具趋势结合起来，快速发现值得跟进的项目。',
    },
    {
        href: '/ai/prompts',
        title: '查找分析类提示词',
        description: '补充适用于研究、摘要和数据整理场景的提示词模板。',
    },
];

export async function generateStaticParams() {
    const { getAllSlugs } = await import('@/lib/services/article-service');
    const slugs = await getAllSlugs('finance');
    return slugs.map((slug) => ({ slug }));
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

export default async function FinanceArticleDetailPage({
    params,
}: {
    params: Promise<{ slug: string }>;
}) {
    const { getArticleBySlug, getRelatedArticles } = await import('@/lib/services/article-service');
    const { slug } = await params;
    const article = await getArticleBySlug(slug, { site: 'finance' });
    if (!article) notFound();

    const content = article.content || '';
    const toc = extractToc(content);
    const readingMinutes = estimateReadingMinutes(content);
    const relatedArticles = await getRelatedArticles(article.category, slug, 6, { site: 'finance' });

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
    const rehypeHighlight = (await import('rehype-highlight')).default;
    const rehypeStringify = (await import('rehype-stringify')).default;

    const result = await unified()
        .use(remarkParse)
        .use(remarkGfm)
        .use(remarkRehype)
        .use(rehypeUniqueHeadingIds)
        .use(rehypeHighlight, { detect: true, ignoreMissing: true })
        .use(rehypeStringify)
        .process(content);

    const renderedHtml = String(result).replace(/<img /g, '<img loading="lazy" ');
    const articleUrl = getArticleDetailPath('finance', slug);

    return (
        <>
            <ArticleReaderClient
                renderedHtml={renderedHtml}
                toc={toc}
                title={article.title}
                categoryName={article.categoryName}
                dateStr={dateStr}
                readingMinutes={readingMinutes}
                summary={article.summary ?? ''}
                articleUrl={articleUrl}
                backHref={getArticleListPath('finance')}
                relatedArticles={relatedArticles.map((item) => ({
                    href: getArticleDetailPath('finance', item.slug),
                    slug: item.slug,
                    title: item.title,
                    coverUrl: item.coverUrl,
                    category: item.categoryName,
                    summary: item.summary,
                }))}
                explorationLinks={ARTICLE_EXPLORATION_LINKS}
            />
        </>
    );
}
