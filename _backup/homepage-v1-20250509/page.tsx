import Image from 'next/image';
import Link from 'next/link';
import '@/app/_styles/brand-home.css';
import { getSiteBrandConfig } from '@/lib/site-config';
import BinaryRainBackground from './BinaryRainBackground';

export const runtime = 'nodejs';
export const revalidate = 300;

const SITE_CONFIG = getSiteBrandConfig();

const TEAM_MEMBERS = [
    {
        name: '赵明远',
        role: '内容总监',
        desc: '统筹全部分析任务，审阅每一份输出，确保交付给你的内容经得起检验。',
        icon: 'bi-person-gear',
    },
    {
        name: '周颖',
        role: '主编',
        desc: '从海量信息流中筛出真正有价值的信号，不做噪音的搬运工。',
        icon: 'bi-newspaper',
    },
    {
        name: '陈维',
        role: '知识工程师',
        desc: '从文本中提取关键实体和关系，构建结构化的知识图谱。',
        icon: 'bi-diagram-3',
    },
    {
        name: '张彤',
        role: '趋势分析师',
        desc: '从碎片信号中发现正在形成的趋势，追踪叙事的演化脉络。',
        icon: 'bi-graph-up',
    },
    {
        name: '刘一鸣',
        role: '首席分析师',
        desc: '深入挖掘情报背后的机制与二阶效应，产出有深度的研究洞察。',
        icon: 'bi-lightbulb',
    },
    {
        name: '林薇',
        role: '网络分析师',
        desc: '分析实体之间的关系网络，发现隐藏的关联和结构性风险。',
        icon: 'bi-share',
    },
    {
        name: '马守正',
        role: '数据治理专员',
        desc: '维护知识图谱的关系标准，确保数据质量长期可靠。',
        icon: 'bi-shield-check',
    },
];

export default function BrandHomePage() {
    const { brandName } = SITE_CONFIG;

    return (
        <>
            {/* ═══ Full-viewport Hero ═══ */}
            <section className="brand-hero">
                <BinaryRainBackground />
                <Image
                    src="/images/robin-logo.png"
                    alt="知更鸟"
                    width={140}
                    height={140}
                    className="brand-hero-logo"
                    priority
                />
                <h1 className="brand-hero-title">{brandName}</h1>
                <p className="brand-hero-slogan">AI 智能体团队 7×24 为你追踪有价值的信号</p>
                <p className="brand-hero-desc">
                    帮你从信息洪流中，看见真正重要的东西。
                </p>

                <div className="brand-entries-row">
                    <Link href="/ai" className="brand-entry-btn brand-entry-btn--ai">
                        <i className="bi bi-cpu" />
                        <span>AI</span>
                        <i className="bi bi-arrow-right brand-entry-btn-arrow" />
                    </Link>

                    <Link href="/finance" className="brand-entry-btn brand-entry-btn--finance">
                        <i className="bi bi-graph-up-arrow" />
                        <span>金融</span>
                        <i className="bi bi-arrow-right brand-entry-btn-arrow" />
                    </Link>

                    <Link href="/intel" className="brand-entry-btn brand-entry-btn--intel">
                        <i className="bi bi-broadcast" />
                        <span>情报站</span>
                        <i className="bi bi-arrow-right brand-entry-btn-arrow" />
                    </Link>
                </div>

                <div className="brand-scroll-hint">
                    <i className="bi bi-chevron-down" />
                </div>
            </section>

            {/* ═══ Team Section ═══ */}
            <section className="brand-team">
                <h2 className="brand-team-heading">情报团队</h2>
                <p className="brand-team-sub">
                    七位专职智能体，各司其职，协同作战。
                </p>

                <div className="brand-team-grid">
                    {TEAM_MEMBERS.map((m) => (
                        <div key={m.name} className="brand-team-card">
                            <div className="brand-team-avatar">
                                <i className={`bi ${m.icon}`} />
                            </div>
                            <div className="brand-team-name">{m.name}</div>
                            <div className="brand-team-role">{m.role}</div>
                            <div className="brand-team-desc">{m.desc}</div>
                        </div>
                    ))}
                </div>
            </section>
        </>
    );
}
