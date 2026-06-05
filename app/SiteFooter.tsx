'use client';

import Link from 'next/link';
import Image from 'next/image';
import { getSiteBrandConfig } from '@/lib/site-config';
import { useTheme } from '@/app/ThemeProvider';
import { getFooterLogoSrc } from '@/lib/theme/theme';

const CONTENT_LINKS = [
  { href: '/ai/articles', label: '文章' },
  { href: '/ai/prompts', label: '提示词' },
];

const RANKING_LINKS = [
  { href: '/ai/rankings/github', label: 'GitHub 热榜' },
  { href: '/ai/rankings/producthunt', label: 'ProductHunt' },
  { href: '/ai/rankings/skills-trending', label: '技能趋势' },
  { href: '/ai/rankings/skills-hot', label: '热门技能' },
];

const SITE_LINKS = [
  { href: '/', label: '首页' },
  { href: '/about', label: '关于我' },
];

export default function SiteFooter() {
  const brand = getSiteBrandConfig();
  const { resolvedTheme } = useTheme();

  return (
    <footer className="site-footer">
      <div className="site-footer-inner">
        <div className="site-footer-brand">
          <Link href="/" className="site-footer-lockup" aria-label={brand.brandName}>
            <Image
              src={getFooterLogoSrc(resolvedTheme)}
              alt=""
              width={44}
              height={44}
              className="site-footer-logo"
              unoptimized
            />
            <span className="site-footer-title">{brand.brandName}</span>
          </Link>
          <p className="site-footer-description">
            文章、提示词和工具热榜的长期收藏夹。
          </p>
        </div>

        <nav className="site-footer-nav" aria-label="页脚导航">
          <div className="site-footer-group">
            <p className="site-footer-group-title">内容</p>
            <div className="site-footer-links">
              {CONTENT_LINKS.map((link) => (
                <Link key={link.href} href={link.href}>{link.label}</Link>
              ))}
            </div>
          </div>
          <div className="site-footer-group">
            <p className="site-footer-group-title">热榜</p>
            <div className="site-footer-links">
              {RANKING_LINKS.map((link) => (
                <Link key={link.href} href={link.href}>{link.label}</Link>
              ))}
            </div>
          </div>
          <div className="site-footer-group">
            <p className="site-footer-group-title">站点</p>
            <div className="site-footer-links">
              {SITE_LINKS.map((link) => (
                <Link key={link.href} href={link.href}>{link.label}</Link>
              ))}
            </div>
          </div>
        </nav>
      </div>
    </footer>
  );
}
