import Link from 'next/link';
import Image from 'next/image';
import { getArticleDetailPath, getArticleListPath } from '@/lib/articles/article-route-paths';

export const runtime = 'nodejs';
export const revalidate = 300;

const INTERNAL_LINKS = [
    {
        href: '/ai/prompts',
        title: '查找研究类提示词',
        description: '把金融文章里的研究框架转成可复制的分析、摘要和对比提示词。',
    },
    {
        href: '/ai/rankings/github',
        title: '查看 GitHub Trending',
        description: '关注数据分析、量化工具和开发框架的开源趋势，补充技术信号。',
    },
    {
        href: '/ai/articles',
        title: '切换到 AI 文章库',
        description: '对照通用 AI 主题文章，建立从技术到金融应用的跨栏目理解。',
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

export default async function FinanceArticlesPage({
    searchParams,
}: {
    searchParams: Promise<{ page?: string; category?: string; q?: string }>;
}) {
    const { getArticleCategories, getPagedArticles } = await import('@/lib/services/article-service');
    const params = await searchParams;
    const page = normalizePage(params.page);
    const articleCategories = await getArticleCategories('finance');
    const categoryCodes = new Set(articleCategories.map((item) => item.code));
    const category = normalizeCategory(params.category, categoryCodes);
    const q = normalizeSearchQuery(params.q);

    const result = await getPagedArticles(page, 10, category, q, { site: 'finance' });

    function buildPageUrl(p: number) {
        const parts: string[] = [];
        if (p > 1) parts.push(`page=${p}`);
        if (category) parts.push(`category=${encodeURIComponent(category)}`);
        if (q) parts.push(`q=${encodeURIComponent(q)}`);
        const listPath = getArticleListPath('finance');
        return parts.length ? `${listPath}?${parts.join('&')}` : listPath;
    }

    return (
        <div className="articles-page">
            <nav className="breadcrumb">
                <Link href="/" className="crumb-link">
                    <i className="bi bi-house-door" /> 首页
                </Link>
                <span className="crumb-separator">/</span>
                <span className="crumb-current">金融文章</span>
            </nav>

            <div className="search-container">
                <form method="get" action={getArticleListPath('finance')} className="search-box glass">
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
                        href={getArticleListPath('finance')}
                        className={`filter-item ${!category ? 'active' : ''}`}
                    >
                        全部
                    </Link>
                    {articleCategories.map((cat) => (
                        <Link
                            key={cat.code}
                            href={`${getArticleListPath('finance')}?category=${cat.code}`}
                            className={`filter-item ${category === cat.code ? 'active' : ''}`}
                        >
                            {cat.name}
                        </Link>
                    ))}
                </div>
            </div>

            {result.items.length > 0 ? (
                <div className="articles-list">
                    {result.items.map((article, i) => (
                        <div
                            key={article.id}
                            className="animate-emerge"
                            style={{ animationDelay: `${(i * 0.1).toFixed(1)}s` }}
                        >
                            <Link
                                href={getArticleDetailPath('finance', article.slug)}
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
                    ))}
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
                    <h2 className="section-title">金融文章延伸导航</h2>
                </div>
                <p className="zone-subtitle" style={{ marginBottom: '1.25rem' }}>
                    金融文章适合做主题沉淀。继续搭配提示词库、GitHub 趋势和 AI 总栏目，会更容易形成可执行的研究流。
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
