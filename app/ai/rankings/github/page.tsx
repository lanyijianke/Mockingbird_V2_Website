import Link from 'next/link';
import { getGitHubTrendings } from '@/lib/services/ranking-cache';
import { buildRankingMetadata } from '@/lib/seo/metadata';

export const revalidate = 600;
export const metadata = buildRankingMetadata(
    '/ai/rankings/github',
    'AI 开源项目榜单：GitHub Trending',
    '查看 GitHub Trending 上正在升温的 AI 开源项目，追踪开发者生态中的工具、框架和产品信号。'
);
const INTERNAL_LINKS = [
    {
        href: '/ai/rankings/producthunt',
        title: '切换到 ProductHunt 热榜',
        description: '对照产品热度和开源趋势，观察哪些项目正在从代码走向产品化。',
    },
    {
        href: '/ai/prompts?category=gemini-3',
        title: 'Gemini 3 提示词',
        description: '继续结合多模态提示词模板，验证这些热门项目的实际可用场景。',
    },
    {
        href: '/ai/articles?category=tech-practice',
        title: '技术实战文章',
        description: '把排行榜信号和文章中的方法论、案例拆解放到一起阅读。',
    },
];

function sanitizeExternalUrl(url: string | null | undefined): string | null {
    if (!url) return null;
    try {
        const parsed = new URL(url);
        return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.toString() : null;
    } catch {
        return null;
    }
}

function formatNumber(num: number): string {
    if (num >= 1000) return `${(num / 1000).toFixed(1)}k`;
    return num.toString();
}

const LANGUAGE_COLORS: Record<string, string> = {
    python: '#3572A5', javascript: '#f1e05a', typescript: '#3178c6',
    java: '#b07219', 'c#': '#178600', 'c++': '#f34b7d', c: '#555555',
    go: '#00ADD8', rust: '#dea584', ruby: '#701516', swift: '#F05138',
    kotlin: '#A97BFF', dart: '#00B4AB', php: '#4F5D95', html: '#e34c26',
    css: '#563d7c', shell: '#89e051', lua: '#000080', vue: '#41b883',
    'jupyter notebook': '#DA5B0B', zig: '#ec915c', elixir: '#6e4a7e',
};

export default async function GitHubTrendingPage() {
    const trendings = await getGitHubTrendings();

    return (
        <div className="zone-github">
            <div className="zone-header">
                <h1 className="zone-title zone-title-gh">
                    <i className="bi bi-github" /> GitHub Trending
                </h1>
                <p className="zone-subtitle">
                    追踪 GitHub 全球最热门的开源项目，每 2 小时自动更新。
                </p>
            </div>

            {trendings.length > 0 ? (
                <div className="trending-list">
                    {trendings.map((item, index) => (
                        <div key={item.id} className="trending-card">
                            <div className={`rank-badge ${index < 3 ? 'rank-top rank-gh' : ''}`}>
                                #{index + 1}
                            </div>
                            <div className="trending-body">
                                <div className="repo-header">
                                    <h3 className="repo-name">
                                        <i className="bi bi-journal-bookmark-fill repo-icon" />
                                        {item.repoFullName}
                                    </h3>
                                    {item.language && (
                                        <span className="lang-tag">
                                            <span
                                                className="lang-dot"
                                                style={{ background: LANGUAGE_COLORS[item.language.toLowerCase()] || '#8b949e' }}
                                            />
                                            {item.language}
                                        </span>
                                    )}
                                </div>
                                <p className="repo-desc">
                                    {item.description || '暂无描述'}
                                </p>
                                <div className="card-footer">
                                    <div className="repo-stats">
                                        <span className="stat-item" title="Total Stars">
                                            <i className="bi bi-star-fill" /> {formatNumber(item.starsCount)}
                                        </span>
                                        <span className="stat-item" title="Forks">
                                            <i className="bi bi-diagram-2-fill" /> {formatNumber(item.forksCount)}
                                        </span>
                                        {item.todayStars > 0 && (
                                            <span className="stat-item stat-today" title="Stars Today">
                                                <i className="bi bi-graph-up-arrow" /> +{formatNumber(item.todayStars)} today
                                            </span>
                                        )}
                                    </div>
                                    {(() => {
                                        const safeRepoUrl = sanitizeExternalUrl(item.repoUrl || `https://github.com/${item.repoFullName}`);
                                        if (!safeRepoUrl) {
                                            return <span className="btn-visit btn-visit-gh">链接无效</span>;
                                        }
                                        return (
                                            <a href={safeRepoUrl} target="_blank" rel="noopener noreferrer" className="btn-visit btn-visit-gh">
                                                查看仓库 <i className="bi bi-box-arrow-up-right" />
                                            </a>
                                        );
                                    })()}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            ) : (
                <div className="empty-state">
                    <i className="bi bi-cloud-slash" />
                    <p>暂无 Trending 数据，请稍后再试。</p>
                </div>
            )}

            <section className="home-section" style={{ marginTop: '3rem' }}>
                <div className="section-bar">
                    <h2 className="section-title">趋势延伸阅读</h2>
                </div>
                <p className="zone-subtitle" style={{ marginBottom: '1.25rem' }}>
                    GitHub Trending 更适合观察技术实现层面的热度变化，结合产品热榜和专题文章会更容易判断哪些项目值得跟进。
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
                            className="glass glass-card"
                            style={{ padding: '1.25rem', textDecoration: 'none', color: 'inherit' }}
                        >
                            <div style={{ display: 'grid', gap: '0.45rem' }}>
                                <span className="pc2-category">继续探索</span>
                                <h3 className="pc2-title" style={{ margin: 0 }}>{link.title}</h3>
                                <p style={{ margin: 0, color: 'var(--text-muted)', lineHeight: 1.6 }}>
                                    {link.description}
                                </p>
                            </div>
                        </Link>
                    ))}
                </div>
            </section>
        </div>
    );
}
