import Link from 'next/link';
import Image from 'next/image';
import { getArticleDetailPath, getArticleListPath } from '@/lib/articles/article-route-paths';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const LIST_PATH = getArticleListPath('finance');

export default async function FinanceHomePage() {
    const { getTopArticles, getArticleCategories, getTotalCount } =
        await import('@/lib/services/article-service');

    const [articles, articleCategories, articleCount] = await Promise.all([
        getTopArticles(10, { site: 'finance' }),
        getArticleCategories('finance'),
        getTotalCount({ site: 'finance' }),
    ]);

    return (
        <div className="articles-page">
            {/* Header */}
            <header className="editorial-header">
                <div className="editorial-stats">
                    <span className="stat-badge">{articleCount} 篇文章</span>
                    <span className="stat-divider">·</span>
                    <span className="stat-badge">{articleCategories.length} 个分类</span>
                </div>
                <h1 className="editorial-headline">金融</h1>
                <p className="editorial-sub">宏观研究、市场分析与策略文章，助你洞察金融趋势</p>
            </header>

            {articles.length > 0 ? (
                <>
                    {/* Filter bar */}
                    <div className="filter-bar-container">
                        <div className="filter-bar-scroll">
                            <Link
                                href={LIST_PATH}
                                className="filter-item active"
                            >
                                全部
                            </Link>
                            {articleCategories.map((cat) => (
                                <Link
                                    key={cat.code}
                                    href={`${LIST_PATH}?category=${cat.code}`}
                                    className="filter-item"
                                >
                                    {cat.name}
                                </Link>
                            ))}
                        </div>
                    </div>

                    {/* Articles list */}
                    <div className="articles-list">
                        {articles.map((article, i) => (
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
                                        </div>
                                    </div>
                                </Link>
                            </div>
                        ))}
                    </div>

                    {/* Browse all link */}
                    <div style={{ textAlign: 'center', marginTop: '2rem' }}>
                        <Link href={LIST_PATH} className="section-more" style={{ fontSize: '1.1rem' }}>
                            浏览全部 &rarr;
                        </Link>
                    </div>
                </>
            ) : (
                /* Empty state */
                <div className="finance-empty">
                    <div className="finance-empty-inner glass glass-card">
                        <i className="bi bi-journal-richtext finance-empty-icon" />
                        <h2 className="finance-empty-title">金融频道正在建设中</h2>
                        <p className="finance-empty-desc">
                            我们正在筹备宏观研究、市场分析与策略方向的精选内容，敬请期待。
                        </p>
                        <Link href="/ai" className="finance-empty-link">
                            先去看看 AI 频道
                            <i className="bi bi-arrow-right" />
                        </Link>
                    </div>
                </div>
            )}
        </div>
    );
}
