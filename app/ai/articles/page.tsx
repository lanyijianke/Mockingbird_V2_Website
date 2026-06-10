import Link from 'next/link';
import Image from 'next/image';
import { getArticleListPath } from '@/lib/articles/article-route-paths';
import { buildArticlesMetadata } from '@/lib/seo/metadata';
import ListScrollRestoration from '../ListScrollRestoration';
import {
    buildArticleCardAnchorId,
    buildArticleDetailHref,
    buildArticleListReturnUrl,
} from './article-list-return';

export const runtime = 'nodejs';
export const revalidate = 300;

const INTERNAL_LINKS = [
    {
        href: '/ai/prompts?category=gemini-3',
        title: 'Gemini 3 提示词',
        description: '把文章中的方法论快速落到具体提示词实践，适合继续上手实验。',
    },
    {
        href: '/ai/rankings/producthunt',
        title: '切换到 ProductHunt 热榜',
        description: '从内容研究延伸到新产品趋势，观察哪些方向正在快速增长。',
    },
    {
        href: '/ai/rankings/github',
        title: '查看 GitHub Trending',
        description: '同步关注开源项目热度，补齐开发者生态中的技术实现信号。',
    },
];

function normalizePage(rawPage?: string): number {
    const parsed = Number.parseInt(rawPage || '1', 10);
    return Number.isNaN(parsed) || parsed < 1 ? 1 : parsed;
}

function normalizeCategory(rawCategory: string | undefined, categoryCodes: Set<string>): string | undefined {
    if (!rawCategory) return undefined;
    return categoryCodes.has(rawCategory) ? rawCategory : undefined;
}

function normalizeSearchQuery(rawQuery?: string): string | undefined {
    const trimmed = rawQuery?.trim();
    if (!trimmed) return undefined;
    return trimmed.slice(0, 200);
}

export async function generateMetadata({
    searchParams,
}: {
    searchParams: Promise<{ page?: string; category?: string; q?: string }>;
}) {
    const params = await searchParams;
    return buildArticlesMetadata({
        hasFilters: Boolean(params.page || params.category || params.q),
    });
}

export default async function AiArticlesPage({
    searchParams,
}: {
    searchParams: Promise<{ page?: string; category?: string; q?: string }>;
}) {
    const { getArticleCategories, getPagedArticles } = await import('@/lib/services/article-service');
    const params = await searchParams;
    const page = normalizePage(params.page);
    const articleCategories = await getArticleCategories('ai');
    const categoryCodes = new Set(articleCategories.map((item) => item.code));
    const category = normalizeCategory(params.category, categoryCodes);
    const q = normalizeSearchQuery(params.q);
    const result = await getPagedArticles(page, 10, category, q, { site: 'ai' });
    const returnTo = buildArticleListReturnUrl({ page, category, q });

    function buildPageUrl(p: number) {
        const parts: string[] = [];
        if (p > 1) parts.push(`page=${p}`);
        if (category) parts.push(`category=${encodeURIComponent(category)}`);
        if (q) parts.push(`q=${encodeURIComponent(q)}`);
        const listPath = getArticleListPath('ai');
        return parts.length ? `${listPath}?${parts.join('&')}` : listPath;
    }

    return (
        <div className="articles-page">
            <ListScrollRestoration />

            <nav className="breadcrumb">
                <Link href="/" className="crumb-link">
                    <i className="bi bi-house-door" /> 首页
                </Link>
                <span className="crumb-separator">/</span>
                <span className="crumb-current">文章</span>
            </nav>

            <div className="search-container">
                <form method="get" action={getArticleListPath('ai')} className="search-box glass">
                    <i className="bi bi-search search-icon" />
                    <input
                        type="text"
                        name="q"
                        className="search-input-full"
                        placeholder="输入关键词搜索文章..."
                        defaultValue={q}
                    />
                    {category && <input type="hidden" name="category" value={category} />}
                    <button type="submit" className="search-submit-btn">
                        <i className="bi bi-arrow-return-left" />
                    </button>
                </form>
            </div>

            <div className="filter-bar-container">
                <div className="filter-bar-scroll">
                    <Link
                        href={getArticleListPath('ai')}
                        className={`filter-item ${!category ? 'active' : ''}`}
                    >
                        全部
                    </Link>
                    {articleCategories.map((cat) => (
                        <Link
                            key={cat.code}
                            href={`${getArticleListPath('ai')}?category=${cat.code}`}
                            className={`filter-item ${category === cat.code ? 'active' : ''}`}
                        >
                            {cat.name}
                        </Link>
                    ))}
                </div>
            </div>

            {result.items.length > 0 ? (
                <div className="articles-list">
                    {result.items.map((article, i) => {
                        const anchorId = buildArticleCardAnchorId(article.slug);

                        return (
                            <div
                                key={article.id}
                                id={anchorId}
                                className="animate-emerge"
                                style={{ animationDelay: `${(i * 0.1).toFixed(1)}s` }}
                            >
                                <Link
                                    href={buildArticleDetailHref(article.slug, returnTo, anchorId)}
                                    className="article-item glass glass-card"
                                >
                                    <div className="article-cover">
                                        <Image
                                            src={article.coverUrl || '/images/default-cover.png'}
                                            alt={article.title}
                                            fill
                                            sizes="(max-width: 768px) 100vw, 320px"
                                            style={{ objectFit: 'cover' }}
                                        />
                                    </div>
                                    <div className="article-info">
                                        <div className="article-meta">
                                            <span className="category">{article.categoryName}</span>
                                            <span className="dot">·</span>
                                            <span className="date">
                                                {new Date(article.createdAt).toLocaleDateString('zh-CN', {
                                                    timeZone: 'Asia/Shanghai',
                                                })}
                                            </span>
                                        </div>
                                        <h2 className="article-title">{article.title}</h2>
                                        <p className="article-summary">{article.summary}</p>
                                        <div className="article-footer">
                                            <span className="read-more">
                                                阅读全文 <i className="bi bi-arrow-right" />
                                            </span>
                                            {typeof article.viewCount === 'number' && (
                                                <span className="views">
                                                    <i className="bi bi-eye" /> {article.viewCount.toLocaleString()}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </Link>
                            </div>
                        );
                    })}
                </div>
            ) : (
                <div className="empty-state glass">
                    <i className="bi bi-journal-x" />
                    <p>该分类下暂无文章，换个分类试试？</p>
                </div>
            )}

            {result.totalPages > 1 && (
                <nav className="pagination-nav">
                    {page > 1 && (
                        <Link href={buildPageUrl(page - 1)} className="page-btn">
                            <i className="bi bi-chevron-left" /> 上一页
                        </Link>
                    )}
                    <span className="page-info">第 {page} / {result.totalPages} 页</span>
                    {page < result.totalPages && (
                        <Link href={buildPageUrl(page + 1)} className="page-btn">
                            下一页 <i className="bi bi-chevron-right" />
                        </Link>
                    )}
                </nav>
            )}

            <section className="home-section" style={{ marginTop: '3rem' }}>
                <div className="section-bar">
                    <h2 className="section-title">文章延伸导航</h2>
                </div>
                <p className="zone-subtitle" style={{ marginBottom: '1.25rem' }}>
                    文章页适合做系统阅读。读完后可以继续切到提示词库和热榜页面，把方法论和实际工具趋势连接起来。
                </p>
                <div
                    style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                        gap: '1rem',
                    }}
                >
                    {INTERNAL_LINKS.map((link) => (
                        <Link
                            key={link.href}
                            href={link.href}
                            className="article-item glass glass-card"
                            style={{ display: 'block', padding: '1.25rem', textDecoration: 'none' }}
                        >
                            <div className="article-info">
                                <div className="article-meta">
                                    <span className="category">延伸阅读</span>
                                </div>
                                <h2 className="article-title">{link.title}</h2>
                                <p className="article-summary">{link.description}</p>
                            </div>
                        </Link>
                    ))}
                </div>
            </section>
        </div>
    );
}
