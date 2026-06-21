import Link from 'next/link';
import Image from 'next/image';
import {
  getArticleDetailPath,
  getArticleListPath,
} from '@/lib/articles/article-route-paths';
import { getCategoryName, getSubcategories } from '@/lib/categories';
import { formatBeijingDate } from '@/lib/utils/time-utils';
import PromptGalleryCard from '@/app/ai/prompts/PromptGalleryCard';
import {
  JsonLdScript,
  buildCollectionPageSchema,
  buildOrganizationSchema,
  buildWebSiteSchema,
} from '@/lib/seo/schema';

export const runtime = 'nodejs';
export const revalidate = 300;
const HOMEPAGE_PROMPT_CATEGORY_PRIORITY = [
  'gpt-image-2',
  'gemini-3',
  'seedream-45',
  'nano-banana',
  'seedance-2',
  'gpt-image-15',
];
const HOMEPAGE_RANKING_COUNT = 3;

function sortPromptCategoriesForHomepage<T extends { code: string }>(categories: T[]): T[] {
  return [...categories].sort((left, right) => {
    const leftPriority = HOMEPAGE_PROMPT_CATEGORY_PRIORITY.indexOf(left.code);
    const rightPriority = HOMEPAGE_PROMPT_CATEGORY_PRIORITY.indexOf(right.code);
    const normalizedLeft = leftPriority === -1 ? Number.MAX_SAFE_INTEGER : leftPriority;
    const normalizedRight = rightPriority === -1 ? Number.MAX_SAFE_INTEGER : rightPriority;

    if (normalizedLeft !== normalizedRight) {
      return normalizedLeft - normalizedRight;
    }

    return categories.indexOf(left) - categories.indexOf(right);
  });
}

export default async function HomePage() {
  const [
    { getArticleCategories, getTopArticles, getTotalCount: getArticleCount },
    { getPagedPrompts },
    { queryScalar },
  ] = await Promise.all([
    import('@/lib/services/article-service'),
    import('@/lib/services/prompt-service'),
    import('@/lib/db'),
  ]);

  let articles: Awaited<ReturnType<typeof getTopArticles>> = [];
  let articleCount = 0;
  let promptCount = 0;
  let articleCategories: Awaited<ReturnType<typeof getArticleCategories>> = [];
  const promptCategories = sortPromptCategoriesForHomepage(getSubcategories('multimodal-prompts'));
  let promptGroups: Array<{
    category: (typeof promptCategories)[number];
    prompts: Awaited<ReturnType<typeof getPagedPrompts>>['items'];
    totalCount: number;
  }> = [];

  try {
    [articles, articleCount, promptCount, articleCategories] = await Promise.all([
      getTopArticles(15, { site: 'ai' }),
      getArticleCount({ site: 'ai' }),
      (queryScalar<number>('SELECT COUNT(*) FROM Prompts WHERE IsActive = 1')).then(v => v ?? 0),
      getArticleCategories('ai'),
    ]);

    const promptGroupResults = await Promise.all(
      promptCategories.map(async (category) => ({
        category,
        result: await getPagedPrompts(1, 8, category.code),
      }))
    );
    promptGroups = promptGroupResults
      .filter(({ result }) => result.items.length > 0)
      .map(({ category, result }) => ({
        category,
        prompts: result.items,
        totalCount: result.totalCount,
      }));
  } catch (err) {
    console.error('[HomePage] 数据加载失败，使用空数据降级渲染:', err);
  }

  // Hero (center): first article with cover image
  const heroArticle = articles.find(a => a.coverUrl && a.coverUrl !== '/images/default-cover.png') || articles[0];
  // Left column: next 2 articles
  const leftArticles = articles.filter(a => a !== heroArticle).slice(0, 2);
  // Right column "Recent Essays": next 7 articles (filled to roughly match left column height)
  const recentArticles = articles.filter(a => a !== heroArticle && !leftArticles.includes(a)).slice(0, 7);
  // Group ALL articles by category for the category showcase (independent of editorial grid)
  const categoryGroups = new Map<string, typeof articles>();
  for (const article of articles) {
    const cat = article.category || 'industry-news';
    if (!categoryGroups.has(cat)) categoryGroups.set(cat, []);
    categoryGroups.get(cat)!.push(article);
  }
  return (
    <>
      <JsonLdScript
        data={[
          buildOrganizationSchema(),
          buildWebSiteSchema(),
          buildCollectionPageSchema({
            name: 'AI 知识库',
            description: 'AI 教程、提示词模板和工具榜单的知识入口。',
            path: '/',
          }),
        ]}
      />

      {/* ═══ 01 Editorial Header ═══ */}
      <header className="editorial-header editorial-header--summary">
        <p className="editorial-summary-line">
          已收录
          <strong>{articleCount}</strong>
          篇深度文章、
          <strong>{promptCount.toLocaleString('zh-CN')}</strong>
          个提示词和
          <strong>{HOMEPAGE_RANKING_COUNT}</strong>
          个榜单
        </p>
      </header>

      {/* ═══ 02 Editorial 3-Column Grid ═══ */}
      <section className="editorial-grid">
        {/* Left Column: Side articles */}
        <div className="editorial-left">
          {leftArticles.map(article => (
            <Link key={article.id} href={getArticleDetailPath('ai', article.slug)} className="side-card">
              {article.coverUrl && (
                <div className="side-card-cover">
                  <Image src={article.coverUrl || '/images/default-cover.png'} alt={article.title} fill sizes="(max-width: 768px) 100vw, 280px" style={{ objectFit: 'cover' }} />
                </div>
              )}
              <div className="side-card-info">
                <span className="side-card-meta">
                  {formatBeijingDate(article.createdAt)} IN <span className="meta-category">{article.categoryName}</span>
                </span>
                <h3 className="side-card-title">{article.title}</h3>
              </div>
            </Link>
          ))}
        </div>

        {/* Center Column: Hero article */}
        <div className="editorial-center">
          {heroArticle && (
            <Link href={getArticleDetailPath('ai', heroArticle.slug)} className="hero-card">
              {heroArticle.coverUrl && (
                <div className="hero-card-cover">
                  <Image src={heroArticle.coverUrl || '/images/default-cover.png'} alt={heroArticle.title} fill sizes="(max-width: 768px) 100vw, 560px" style={{ objectFit: 'cover' }} />
                </div>
              )}
              <div className="hero-card-info">
                <span className="hero-card-meta">
                  {formatBeijingDate(heroArticle.createdAt)} IN <span className="meta-category">{heroArticle.categoryName}</span>
                </span>
                <h2 className="hero-card-title">{heroArticle.title}</h2>
                {heroArticle.summary && (
                  <p className="hero-card-summary">{heroArticle.summary}</p>
                )}
              </div>
            </Link>
          )}
        </div>

        {/* Right Column: Recent Essays */}
        <aside className="editorial-right">
          <div className="recent-header">
            <span>最新文章</span>
            <Link href={getArticleListPath('ai')} className="recent-arrow">→</Link>
          </div>
          <div className="recent-list">
            {recentArticles.map(article => (
              <Link key={article.id} href={getArticleDetailPath('ai', article.slug)} className="recent-item">
                <div className="recent-thumb">
                  <Image src={article.coverUrl || '/images/default-cover.png'} alt={article.title} fill sizes="56px" style={{ objectFit: 'cover' }} />
                </div>
                <div className="recent-info">
                  <h4 className="recent-title">{article.title}</h4>
                  <span className="recent-category">{article.categoryName}</span>
                </div>
              </Link>
            ))}
          </div>
        </aside>
      </section>

      {/* ═══ 03 Category Articles Showcase ═══ */}
      <section className="home-section">
        <div className="section-bar">
          <h2 className="section-title">分类文章精选</h2>
          <Link href={getArticleListPath('ai')} className="section-more">
            浏览全部 →
          </Link>
        </div>

        <div className="category-showcase">
          {articleCategories.slice(0, 3).map((category) => {
            const catCode = category.code;
            const catArticles = categoryGroups.get(catCode) || [];
            return (
              <div key={catCode} className="category-group">
                <div className="category-group-header">
                  <Link
                    href={`${getArticleListPath('ai')}?category=${catCode}`}
                    className="category-group-name"
                    style={{ textDecoration: 'none', color: 'inherit' }}
                  >
                    {category.name}
                  </Link>
                  <span className="category-group-count">{catArticles.length} 篇</span>
                </div>
                {catArticles.length > 0 ? (
                  <div className="category-group-list">
                    {catArticles.slice(0, 3).map(article => (
                      <Link key={article.id} href={getArticleDetailPath('ai', article.slug)} className="category-article-card">
                        <div className="category-article-cover">
                          <Image
                            src={article.coverUrl || '/images/default-cover.png'}
                            alt={article.title}
                            fill
                            sizes="(max-width: 480px) 100vw, (max-width: 768px) 50vw, 33vw"
                            style={{ objectFit: 'cover' }}
                          />
                        </div>
                        <div className="category-article-info">
                          <h3 className="category-article-title">{article.title}</h3>
                          {article.summary && (
                            <p className="category-article-summary">{article.summary}</p>
                          )}
                          <span className="category-article-date">{formatBeijingDate(article.createdAt)}</span>
                        </div>
                      </Link>
                    ))}
                  </div>
                ) : (
                  <div className="category-group-empty">
                    <i className="bi bi-journal-text" />
                    <span>精彩内容即将上线，敬请期待</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* ═══ 04 Section Divider ═══ */}
      <div className="section-divider" />

      {/* ═══ 05 Prompt Showcase ═══ */}
      <section className="home-section">
        <div className="section-bar">
          <h2 className="section-title">模型提示词画廊</h2>
          <Link href="/ai/prompts" className="section-more">
            查看全部 →
          </Link>
        </div>
        <p className="zone-subtitle" style={{ marginBottom: '1.5rem' }}>
          按模型浏览最新可复用模板。每个模型展示最新 8 个，继续进入列表页可保留筛选语境。
        </p>

        {promptGroups.length > 0 ? (
          <div style={{ display: 'grid', gap: '2.5rem' }}>
            {promptGroups.map((group) => (
              <section key={group.category.code} aria-label={`${group.category.name} 最新提示词`}>
                <div className="section-bar" style={{ marginBottom: '1rem' }}>
                  <div>
                    <h3 className="section-title" style={{ fontSize: '1.25rem', marginBottom: '0.25rem' }}>
                      {group.category.name}
                    </h3>
                    <p className="zone-subtitle" style={{ margin: 0 }}>
                      最新 {group.prompts.length} 个 / 共 {group.totalCount} 个提示词
                    </p>
                  </div>
                  <Link href={`/ai/prompts?category=${group.category.code}`} className="section-more">
                    查看全部 →
                  </Link>
                </div>

                <div className="prompts-masonry">
                  {group.prompts.map((prompt, idx) => (
                    <PromptGalleryCard
                      key={prompt.id}
                      href={`/ai/prompts/${prompt.id}`}
                      title={prompt.title}
                      categoryName={getCategoryName(prompt.category)}
                      copyCount={prompt.copyCount}
                      coverImageUrl={prompt.coverImageUrl}
                      cardPreviewVideoUrl={prompt.cardPreviewVideoUrl}
                      videoPreviewUrl={prompt.videoPreviewUrl}
                      animationDelay={`${idx * 0.04}s`}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        ) : (
          <div className="empty-state glass">
            <i className="bi bi-collection" />
            <p>暂无提示词</p>
          </div>
        )}
      </section>

    </>
  );
}
