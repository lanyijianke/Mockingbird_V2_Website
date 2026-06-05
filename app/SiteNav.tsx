'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { getArticleListPath } from '@/lib/articles/article-route-paths';
import ThemeToggle from '@/app/ThemeToggle';
import { getBrandLogoSrc } from '@/lib/theme/theme';
import { useTheme } from '@/app/ThemeProvider';

const NAV_BRAND_NAME = '知更鸟 AI 知识库';

export default function SiteNav() {
  const pathname = usePathname();
  const { resolvedTheme } = useTheme();

  const isRootHome = pathname === '/';
  const isAbout = pathname.startsWith('/about');
  const isAi = isRootHome || isAbout || pathname.startsWith('/ai');
  const isFinance = pathname.startsWith('/finance');

  const brandHref = isAi ? '/' : isFinance ? '/finance' : '/';

  return (
    <nav className="top-nav">
      <div className="nav-left">
        <Link href="/about" className="nav-link">关于我</Link>
      </div>

      <div className="nav-center">
        <div className="nav-divider" />
        <Link href={brandHref} className="nav-brand-lockup" aria-label={NAV_BRAND_NAME}>
          <Image
            src={getBrandLogoSrc(resolvedTheme)}
            alt=""
            width={42}
            height={42}
            className="nav-brand-logo"
            priority
            unoptimized
          />
          <span className="nav-brand-name">{NAV_BRAND_NAME}</span>
        </Link>
        <div className="nav-divider" />
      </div>

      <div className="nav-right">
        {/* ── AI subsite navigation ── */}
        {isAi && (
          <>
            <Link href={getArticleListPath('ai')} className="nav-link">文章</Link>
            <Link href="/ai/prompts" className="nav-link">提示词</Link>

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
                  <i className="bi bi-github" style={{ color: '#58a6ff' }} />
                  <span>GitHub Trending</span>
                </Link>
                <Link href="/ai/rankings/producthunt" className="nav-dropdown-item">
                  <i className="bi bi-rocket-takeoff" style={{ color: '#ff6154' }} />
                  <span>ProductHunt</span>
                </Link>
                <Link href="/ai/rankings/skills-trending" className="nav-dropdown-item">
                  <i className="bi bi-fire" style={{ color: '#f0883e' }} />
                  <span>Skills Trending</span>
                </Link>
                <Link href="/ai/rankings/skills-hot" className="nav-dropdown-item">
                  <i className="bi bi-lightning-charge" style={{ color: '#a371f7' }} />
                  <span>Skills Hot</span>
                </Link>
              </div>
            </div>
          </>
        )}

        {/* ── Finance subsite navigation ── */}
        {isFinance && (
          <>
            <Link href={getArticleListPath('finance')} className="nav-link">金融文章</Link>
          </>
        )}

        <ThemeToggle />

        {/* ── Default navigation ── */}
        {!isAi && !isFinance && (
          <>
            <Link href={getArticleListPath('ai')} className="nav-link">AI</Link>
          </>
        )}
      </div>
    </nav>
  );
}
