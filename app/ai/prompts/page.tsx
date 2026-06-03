import Link from 'next/link';
import { getSubcategories } from '@/lib/categories';
import { buildPromptsMetadata } from '@/lib/seo/metadata';
import PromptInfiniteGallery from './PromptInfiniteGallery';
import { buildPromptGalleryResetKey } from './infinite-gallery-utils';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const PROMPT_CATEGORY_CODES = new Set(getSubcategories('multimodal-prompts').map((item) => item.code));
const INTERNAL_LINKS = [
    {
        href: '/ai/articles',
        title: '阅读 AI 深度文章',
        description: '先看文章理解背景，再回到提示词库挑选更适合当前任务的模板。',
    },
    {
        href: '/ai/rankings/producthunt',
        title: '查看 ProductHunt 热榜',
        description: '结合最新产品趋势，判断哪些提示词玩法已经具备真实场景需求。',
    },
    {
        href: '/ai/rankings/skills-trending',
        title: '切换到 Skills Trending',
        description: '从技能社区的热度变化里，继续寻找值得实验的新工具和工作流。',
    },
];

function normalizePage(rawPage?: string): number {
    const parsed = Number.parseInt(rawPage || '1', 10);
    return Number.isNaN(parsed) || parsed < 1 ? 1 : parsed;
}

function normalizeCategory(rawCategory?: string): string | undefined {
    if (!rawCategory) return undefined;
    return PROMPT_CATEGORY_CODES.has(rawCategory) ? rawCategory : undefined;
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
    return buildPromptsMetadata({
        hasFilters: Boolean(params.page || params.category || params.q),
    });
}

export default async function PromptsPage({
    searchParams,
}: {
    searchParams: Promise<{ page?: string; category?: string; q?: string }>;
}) {
    const { getPagedPrompts } = await import('@/lib/services/prompt-service');
    const params = await searchParams;
    const page = normalizePage(params.page);
    const category = normalizeCategory(params.category);
    const q = normalizeSearchQuery(params.q);
    const result = await getPagedPrompts(page, 20, category, q);
    // 多模态提示词子类
    const promptCategories = getSubcategories('multimodal-prompts');

    return (
        <div className="prompts-page">
            {/* 粘性搜索栏 */}
            <div className="prompts-sticky-header">
                <form method="get" action="/ai/prompts" className="prompts-search-bar">
                    <i className="bi bi-search" />
                    <input
                        type="text"
                        name="q"
                        placeholder="搜索提示词..."
                        defaultValue={q}
                    />
                    {category && <input type="hidden" name="category" value={category} />}
                    <button type="submit"><i className="bi bi-arrow-return-left" /></button>
                </form>

                {/* 过滤胶囊 */}
                <div className="prompts-filter-row">
                    <Link
                        href="/ai/prompts"
                        className={`filter-pill ${!category ? 'active' : ''}`}
                    >
                        全部
                    </Link>
                    {promptCategories.map((cat) => (
                        <Link
                            key={cat.code}
                            href={`/ai/prompts?category=${cat.code}`}
                            className={`filter-pill ${category === cat.code ? 'active' : ''}`}
                        >
                            {cat.name}
                        </Link>
                    ))}
                </div>
            </div>

            <PromptInfiniteGallery
                key={buildPromptGalleryResetKey({ category, q })}
                initialItems={result.items}
                initialPage={result.page}
                pageSize={result.pageSize}
                totalPages={result.totalPages}
                category={category}
                q={q}
            />

            <section className="home-section" style={{ marginTop: '3rem' }}>
                <div className="section-bar">
                    <h2 className="section-title">提示词库延伸导航</h2>
                </div>
                <p className="zone-subtitle" style={{ marginBottom: '1.25rem' }}>
                    提示词页面更偏实操。继续结合文章和热榜栏目，能更快判断一个模板背后的方法论和真实需求场景。
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
