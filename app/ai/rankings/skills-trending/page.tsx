import Link from 'next/link';
import { getSkillsShRankings } from '@/lib/services/ranking-cache';
import { buildRankingMetadata } from '@/lib/seo/metadata';

export const revalidate = 600;
export const metadata = buildRankingMetadata(
    '/ai/rankings/skills-trending',
    'AI 技能趋势榜',
    '查看 Skills.sh Trending 中持续升温的 AI 技能和工具，识别正在形成稳定关注的工作流方向。'
);
const INTERNAL_LINKS = [
    {
        href: '/ai/rankings/skills-hot',
        title: '查看 Skills Hot',
        description: '对照长期关注度和短期爆发热度，识别哪些技能只是短暂上升，哪些已经进入主流。',
    },
    {
        href: '/ai/prompts?category=gemini-3',
        title: 'Gemini 3 提示词',
        description: '把技能热度和提示词模板结合起来，快速验证是否有真实工作流价值。',
    },
    {
        href: '/ai/articles?category=tech-practice',
        title: '技术实战文章',
        description: '从技能与工具热度回流到系统化文章，补齐方法论和案例。',
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

export default async function SkillsTrendingPage() {
    const rankings = await getSkillsShRankings('trending');

    return (
        <div className="zone-skills">
            <div className="zone-header">
                <h1 className="zone-title zone-title-skills">
                    <i className="bi bi-fire" /> Skills.sh Trending
                </h1>
                <p className="zone-subtitle">
                    最受社区关注的 AI 技能与工具，实时追踪趋势变化。
                </p>
            </div>

            {rankings.length > 0 ? (
                <div className="skills-list">
                    {rankings.map((item, index) => (
                        <div key={item.id} className="skills-card">
                            <div className={`rank-badge ${index < 3 ? 'rank-top rank-skills' : ''}`}>
                                #{index + 1}
                            </div>
                            <div className="skills-body">
                                <div className="skills-header">
                                    <h3 className="skills-name">
                                        <i className="bi bi-cpu" />
                                        {(() => {
                                            const safeSkillUrl = sanitizeExternalUrl(item.skillUrl);
                                            if (!safeSkillUrl) return <span>{item.skillName}</span>;
                                            return (
                                                <a href={safeSkillUrl} target="_blank" rel="noopener noreferrer">
                                                    {item.skillName}
                                                </a>
                                            );
                                        })()}
                                    </h3>
                                    {item.installCount && (
                                        <span className="install-count">
                                            <i className="bi bi-download" /> {item.installCount}
                                        </span>
                                    )}
                                </div>
                                {item.repoFullName && (
                                    <div className="skills-repo">
                                        <i className="bi bi-github" />
                                        {(() => {
                                            const safeRepoUrl = sanitizeExternalUrl(`https://github.com/${item.repoFullName}`);
                                            if (!safeRepoUrl) return <span>{item.repoFullName}</span>;
                                            return (
                                                <a href={safeRepoUrl} target="_blank" rel="noopener noreferrer">
                                                    {item.repoFullName}
                                                </a>
                                            );
                                        })()}
                                    </div>
                                )}
                                {item.description && (
                                    <p className="skills-description">{item.description}</p>
                                )}
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
                    <h2 className="section-title">趋势线索延伸</h2>
                </div>
                <p className="zone-subtitle" style={{ marginBottom: '1.25rem' }}>
                    Skills Trending 更偏向“正在被讨论”的信号。继续查看 Hot、产品热榜和提示词模板，可以把关注度变成具体动作。
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
