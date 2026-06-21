import Link from 'next/link';
import Image from 'next/image';
import { getSiteBrandConfig } from '@/lib/site-config';
import BusuanziStats from './BusuanziStats';

const CONTENT_LINKS = [
  { href: '/ai/articles', label: '文章' },
  { href: '/ai/prompts', label: '提示词' },
];

const RANKING_LINKS = [
  { href: '/ai/rankings/github', label: 'GitHub 热榜' },
  { href: '/ai/rankings/producthunt', label: 'ProductHunt' },
  { href: '/ai/rankings/skills-trending', label: '技能趋势' },
];

const SITE_LINKS = [
  { href: '/', label: '首页' },
  { href: '/about', label: '关于我' },
];

export default function SiteFooter() {
  const brand = getSiteBrandConfig();
  // 拆分品牌名以匹配顶部 nav 的「主名 serif + 副名 sans」视觉层次
  // 例: brandName="知更鸟 AI 知识库", siteName="知更鸟" → primary="知更鸟", secondary="AI 知识库"
  const primaryName = brand.siteName || brand.brandName;
  const secondaryName = brand.brandName.startsWith(brand.siteName)
    ? brand.brandName.slice(brand.siteName.length).trim()
    : '';

  return (
    <footer className="site-footer">
      <div className="site-footer-inner">
        <div className="site-footer-brand">
          <Link href="/" className="site-footer-lockup" aria-label={brand.brandName}>
            <span className="theme-logo theme-logo-dark" aria-hidden="true">
              <Image
                src="/images/logo-nav.png"
                alt=""
                width={44}
                height={44}
                className="site-footer-logo"
                unoptimized
              />
            </span>
            <span className="theme-logo theme-logo-light" aria-hidden="true">
              <Image
                src="/images/logo-light.png"
                alt=""
                width={44}
                height={44}
                className="site-footer-logo"
                unoptimized
              />
            </span>
            <span className="site-footer-name">
              <span className="site-footer-name-primary">{primaryName}</span>
              {secondaryName && (
                <span className="site-footer-name-secondary">{secondaryName}</span>
              )}
            </span>
          </Link>
          <p className="site-footer-description">
            文章、提示词和工具热榜的长期收藏夹。
          </p>
          <BusuanziStats />
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
