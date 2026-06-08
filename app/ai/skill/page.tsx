import Link from 'next/link';
import { notFound } from 'next/navigation';
import { isSkillMarketingPageEnabled } from '@/lib/agent-search/skill-page-config';
import { buildPageMetadata } from '@/lib/seo/metadata';

export const runtime = 'nodejs';
export const revalidate = 300;

export const metadata = buildPageMetadata({
    title: 'Mockingbird Skill：精选 AI Prompt 与技术文章',
    description: '给你的 Agent 装上精选 AI 技术文章、多模态提示词、图片示例和视频预览，快速查找当下最新、最流行的 AI 内容。',
    path: '/ai/skill',
});

const SCENARIOS = [
    {
        icon: 'bi-image',
        title: '找到当下值得收藏的图片 Prompt',
        description: '产品海报、头像、广告图、视觉概念稿，让 Agent 先从精选库里找成熟模板。',
    },
    {
        icon: 'bi-play-btn',
        title: '找到正在流行的视频 Prompt',
        description: '查找带视频预览的 prompt，快速判断镜头、运动、风格和最终效果方向。',
    },
    {
        icon: 'bi-file-text',
        title: '找到适合引用的技术文章',
        description: '让 Agent 在写作、研究和方案生成前，先读取筛选后的 AI 技术内容。',
    },
    {
        icon: 'bi-stars',
        title: '直接复用爆款 Prompt 写法',
        description: '让 Agent 从精选案例里提炼结构、风格词和镜头语言，少从空白页开始试。',
    },
    {
        icon: 'bi-eye',
        title: '先看效果，再决定要不要用',
        description: '图片示例和视频预览先摆出来，好不好用、适不适合，一眼就能判断。',
    },
    {
        icon: 'bi-collection',
        title: '把热门 AI 玩法存成素材库',
        description: '遇到值得收藏的新模型玩法和创作套路，沉淀下来，下次任务直接调用。',
    },
];

const SKILL_FOLDER_URL = 'https://github.com/lanyijianke/mockingbird-skills/tree/main/skills/mockingbird-knowledge';

export default function AgentAssetsPage() {
    if (!isSkillMarketingPageEnabled()) notFound();

    return (
        <div className="agent-assets-page">
            <nav className="breadcrumb">
                <Link href="/" className="crumb-link">
                    <i className="bi bi-house-door" /> 首页
                </Link>
                <span className="crumb-separator">/</span>
                <span className="crumb-current">Skill</span>
            </nav>

            <section className="agent-assets-hero">
                <div className="agent-assets-hero-copy">
                    <p className="agent-assets-kicker">Mockingbird Skill</p>
                    <h1>让你的 Agent 找到最新、最流行的 AI Prompt</h1>
                    <p>
                        Mockingbird Skill 把精选技术文章、精选多模态提示词、图片示例和视频预览，
                        变成你的 Agent 可以直接查找和引用的内容库。
                    </p>
                    <div className="agent-assets-actions">
                        <a href={SKILL_FOLDER_URL} className="agent-assets-button primary" target="_blank" rel="noreferrer">
                            <i className="bi bi-folder2-open" /> 获取 Skill 文件夹
                        </a>
                    </div>
                </div>
                <div className="agent-assets-terminal" aria-label="Mockingbird Skill command example">
                    <div className="terminal-bar">
                        <span />
                        <span />
                        <span />
                    </div>
                    <pre>{`请为我安装技能：

${SKILL_FOLDER_URL}`}</pre>
                </div>
            </section>

            <section className="agent-assets-fields" aria-label="为什么你的 Agent 需要 Mockingbird Skill">
                <div className="agent-assets-section-head">
                    <p className="agent-assets-kicker">Benefits</p>
                    <h2>为什么你的 Agent 需要它</h2>
                </div>
                <div className="agent-assets-field-grid">
                    {SCENARIOS.map((item) => (
                        <div className="agent-assets-field" key={item.title}>
                            <div className="agent-assets-field-heading">
                                <i className={`bi ${item.icon}`} />
                                <strong>{item.title}</strong>
                            </div>
                            <p>{item.description}</p>
                        </div>
                    ))}
                </div>
            </section>
        </div>
    );
}
