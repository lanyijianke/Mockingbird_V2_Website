import Link from 'next/link';
import { getSkillsShRankings } from '@/lib/services/ranking-cache';
import { buildRankingMetadata } from '@/lib/seo/metadata';

export const revalidate = 600;
export const metadata = buildRankingMetadata(
    '/ai/rankings/skills-hot',
    'AI 热门技能榜',
    '查看 Skills.sh Hot 中当下最热门的 AI 技能、工具和项目，快速发现社区正在集中尝试的方向。'
);
const INTERNAL_LINKS = [
    {
        href: '/ai/rankings/skills-trending',
        title: '查看 Skills Trending',
        description: '从爆发热度切回持续趋势，判断哪些技能正在形成稳定关注。',
    },
    {
        href: '/ai/prompts?category=gemini-3',
        title: 'Gemini 3 提示词',
        description: '把热门技能和提示词模板联动起来，快速验证可复用的实操路径。',
    },
    {
        href: '/ai/articles?category=agents',
        title: '智能体文章',
        description: '把热门技能和系统化文章结合起来，快速补齐背景与方法论。',
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

export default async function SkillsHotPage() {
    const rankings = await getSkillsShRankings('hot');

    return (
        <div className="zone-skills">
            <div className="zone-header">
                <h1 className="zone-title zone-title-hot">
                    <i className="bi bi-lightning-charge" /> Skills.sh Hot
                </h1>
                <p className="zone-subtitle">
                    当下最火热的 AI 技能排行，发现社区最受欢迎的工具。
                </p>
            </div>

            {rankings.length > 0 ? (
                <div className="skills-grid">
                    {rankings.map((item, index) => (
                        <div key={item.id} className="skills-hot-card">
                            <div className={`rank-badge ${index < 3 ? 'rank-top rank-hot' : ''}`}>
                                #{index + 1}
                            </div>
                            <div className="skills-hot-body">
                                <h3 className="skills-hot-name">
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
                                {item.installCount && (
                                    <div className="skills-hot-installs">
                                        <i className="bi bi-download" /> {item.installCount} 安装
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
                    <p>暂无 Hot 数据，请稍后再试。</p>
                </div>
            )}

            <section className="home-section" style={{ marginTop: '3rem' }}>
                <div className="section-bar">
                    <h2 className="section-title">热门技能延伸探索</h2>
                </div>
                <p className="zone-subtitle" style={{ marginBottom: '1.25rem' }}>
                    Skills Hot 反映当下最强的短期关注度。继续对照 Trending、GitHub 和文章专题，能更快分辨“噪音”与“真实机会”。
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
