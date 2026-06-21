'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const ITEMS = [
  { href: '/', label: '首页', icon: 'bi-house-door' },
  { href: '/ai/articles', label: '文章', icon: 'bi-journal-text' },
  { href: '/ai/prompts', label: '提示词', icon: 'bi-chat-quote' },
  { href: '/ai/rankings/github', label: '热榜', icon: 'bi-fire' },
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
            <i className={`bi ${item.icon} mobile-tab-icon`} aria-hidden="true" />
            <span className="mobile-tab-label">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}