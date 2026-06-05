'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const ITEMS = [
  { href: '/', label: '首页' },
  { href: '/ai/articles', label: '文章' },
  { href: '/ai/prompts', label: '提示词' },
  { href: '/ai/rankings/github', label: '热榜' },
];

export default function MobileTabBar() {
  const pathname = usePathname();

  return (
    <nav className="mobile-tab-bar" aria-label="移动端主导航">
      {ITEMS.map((item) => {
        const active = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);

        return (
          <Link
            key={item.href}
            href={item.href}
            className={`mobile-tab-item${active ? ' active' : ''}`}
            aria-current={active ? 'page' : undefined}
          >
            <span className="mobile-tab-label">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
