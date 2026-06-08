'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { getArticleListPath } from '@/lib/articles/article-route-paths';
import { isSkillMarketingPageEnabled } from '@/lib/agent-search/skill-page-config';
import ThemeToggle from '@/app/ThemeToggle';

const NAV_BRAND_NAME = '知更鸟 AI 知识库';

export default function SiteNav() {
  const pathname = usePathname();

  const isRootHome = pathname === '/';
  const isAbout = pathname.startsWith('/about');
  const isAi = isRootHome || isAbout || pathname.startsWith('/ai');
  const skillMarketingPageEnabled = isSkillMarketingPageEnabled();

  const brandHref = '/';

  return (
    <nav className="top-nav">
      <div className="nav-left">
        <Link href="/about" className="nav-link">关于我</Link>
      </div>

      <div className="nav-center">
        <div className="nav-divider" />
        <Link href={brandHref} className="nav-brand-lockup" aria-label={NAV_BRAND_NAME}>
          <span className="theme-logo theme-logo-dark" aria-hidden="true">
            <Image
              src="/images/logo-nav.png"
              alt=""
              width={42}
              height={42}
              className="nav-brand-logo"
              priority
              unoptimized
            />
          </span>
          <span className="theme-logo theme-logo-light" aria-hidden="true">
            <Image
              src="/images/logo-nav-light.png"
              alt=""
              width={42}
              height={42}
              className="nav-brand-logo"
              priority
              unoptimized
            />
          </span>
          <span className="nav-brand-name">
            <span className="nav-brand-primary">知更鸟</span>
            <span className="nav-brand-secondary">AI 知识库</span>
          </span>
        </Link>
        <div className="nav-divider" />
      </div>

      <div className="nav-right">
        {/* ── AI subsite navigation ── */}
        {isAi && (
          <>
            <Link href={getArticleListPath('ai')} className="nav-link">文章</Link>
            <Link href="/ai/prompts" className="nav-link">提示词</Link>
            {skillMarketingPageEnabled && <Link href="/ai/skill" className="nav-link">Skill</Link>}

            {/* Mobile: plain link */}
            <Link href="/ai/rankings/github" className="nav-link nav-mobile-only">
              热榜
            </Link>

            {/* Desktop: dropdown */}
            <div className="nav-dropdown nav-desktop-only">
              <Link href="/ai/rankings/github" className="nav-link nav-dropdown-trigger">
                热榜 <i className="bi bi-chevron-down nav-dropdown-arrow" />
              </Link>
              <div className="nav-dropdown-menu">
                <Link href="/ai/rankings/github" className="nav-dropdown-item">
                  <i className="bi bi-github" style={{ color: 'var(--theme-gh)' }} />
                  <span>GitHub Trending</span>
                </Link>
                <Link href="/ai/rankings/producthunt" className="nav-dropdown-item">
                  <i className="bi bi-rocket-takeoff" style={{ color: 'var(--theme-ph)' }} />
                  <span>ProductHunt</span>
                </Link>
                <Link href="/ai/rankings/skills-trending" className="nav-dropdown-item">
                  <i className="bi bi-fire" style={{ color: 'var(--theme-skills)' }} />
                  <span>Skills Trending</span>
                </Link>
              </div>
            </div>
          </>
        )}

        <ThemeToggle />

        {/* ── Default navigation ── */}
        {!isAi && (
          <>
            <Link href={getArticleListPath('ai')} className="nav-link">AI</Link>
          </>
        )}
      </div>
    </nav>
  );
}
