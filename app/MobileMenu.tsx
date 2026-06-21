'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect } from 'react';
import { getArticleListPath } from '@/lib/articles/article-route-paths';
import { isSkillMarketingPageEnabled } from '@/lib/agent-search/skill-page-config';
import { useTheme } from '@/app/ThemeProvider';
import type { ThemeMode } from '@/lib/theme/theme';

type MobileMenuProps = {
    open: boolean;
    onClose: () => void;
};

type ThemeOption = {
    value: ThemeMode;
    label: string;
    icon: string;
};

const THEME_OPTIONS: ReadonlyArray<ThemeOption> = [
    { value: 'system', label: '系统', icon: 'bi-circle-half' },
    { value: 'light', label: '亮色', icon: 'bi-sun' },
    { value: 'dark', label: '暗色', icon: 'bi-moon-stars' },
];

export default function MobileMenu({ open, onClose }: MobileMenuProps) {
    const pathname = usePathname();
    const { mode, setThemeMode } = useTheme();
    const skillMarketingPageEnabled = isSkillMarketingPageEnabled();

    // 路由切换时自动关闭
    useEffect(() => {
        if (open) onClose();
        // 仅在 pathname 变化时触发；onClose 在父组件中是稳定的 setter
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [pathname]);

    // ESC 关闭 + body 滚动锁定
    useEffect(() => {
        if (!open) return;

        const handleKey = (event: KeyboardEvent) => {
            if (event.key === 'Escape') onClose();
        };

        document.addEventListener('keydown', handleKey);

        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';

        return () => {
            document.removeEventListener('keydown', handleKey);
            document.body.style.overflow = previousOverflow;
        };
    }, [open, onClose]);

    const isActive = (href: string) =>
        href === '/' ? pathname === '/' : pathname.startsWith(href);

    return (
        <>
            <div
                className={`mobile-menu-overlay${open ? ' is-open' : ''}`}
                onClick={onClose}
                aria-hidden="true"
            />

            <aside
                className={`mobile-menu${open ? ' is-open' : ''}`}
                role="dialog"
                aria-modal="true"
                aria-label="导航菜单"
                aria-hidden={!open}
            >
                <header className="mobile-menu-header">
                    <span className="mobile-menu-title">导航菜单</span>
                    <button
                        type="button"
                        className="mobile-menu-close"
                        onClick={onClose}
                        aria-label="关闭菜单"
                    >
                        <i className="bi bi-x-lg" aria-hidden="true" />
                    </button>
                </header>

                <nav className="mobile-menu-nav" aria-label="主导航">
                    <Link
                        href="/about"
                        className={`mobile-menu-item${isActive('/about') ? ' is-active' : ''}`}
                        onClick={onClose}
                    >
                        <i className="bi bi-house-door mobile-menu-icon" aria-hidden="true" />
                        <span>关于我</span>
                    </Link>

                    <Link
                        href={getArticleListPath('ai')}
                        className={`mobile-menu-item${isActive(getArticleListPath('ai')) ? ' is-active' : ''}`}
                        onClick={onClose}
                    >
                        <i className="bi bi-journal-text mobile-menu-icon" aria-hidden="true" />
                        <span>文章</span>
                    </Link>

                    <Link
                        href="/ai/prompts"
                        className={`mobile-menu-item${isActive('/ai/prompts') ? ' is-active' : ''}`}
                        onClick={onClose}
                    >
                        <i className="bi bi-chat-quote mobile-menu-icon" aria-hidden="true" />
                        <span>提示词</span>
                    </Link>

                    {skillMarketingPageEnabled && (
                        <Link
                            href="/ai/skill"
                            className={`mobile-menu-item${isActive('/ai/skill') ? ' is-active' : ''}`}
                            onClick={onClose}
                        >
                            <i className="bi bi-stars mobile-menu-icon" aria-hidden="true" />
                            <span>Skill</span>
                        </Link>
                    )}
                </nav>

                <div className="mobile-menu-section">
                    <div className="mobile-menu-section-title">
                        <i className="bi bi-fire" aria-hidden="true" />
                        <span>热榜</span>
                    </div>
                    <nav className="mobile-menu-nav mobile-menu-nav-sub" aria-label="热榜子导航">
                        <Link
                            href="/ai/rankings/github"
                            className={`mobile-menu-item mobile-menu-item-sub${isActive('/ai/rankings/github') ? ' is-active' : ''}`}
                            onClick={onClose}
                        >
                            <i
                                className="bi bi-github mobile-menu-icon"
                                aria-hidden="true"
                                style={{ color: 'var(--theme-gh)' }}
                            />
                            <span>GitHub Trending</span>
                        </Link>
                        <Link
                            href="/ai/rankings/producthunt"
                            className={`mobile-menu-item mobile-menu-item-sub${isActive('/ai/rankings/producthunt') ? ' is-active' : ''}`}
                            onClick={onClose}
                        >
                            <i
                                className="bi bi-rocket-takeoff mobile-menu-icon"
                                aria-hidden="true"
                                style={{ color: 'var(--theme-ph)' }}
                            />
                            <span>ProductHunt</span>
                        </Link>
                        <Link
                            href="/ai/rankings/skills-trending"
                            className={`mobile-menu-item mobile-menu-item-sub${isActive('/ai/rankings/skills-trending') ? ' is-active' : ''}`}
                            onClick={onClose}
                        >
                            <i
                                className="bi bi-fire mobile-menu-icon"
                                aria-hidden="true"
                                style={{ color: 'var(--theme-skills)' }}
                            />
                            <span>Skills Trending</span>
                        </Link>
                    </nav>
                </div>

                <div className="mobile-menu-footer">
                    <div
                        className="theme-toggle theme-toggle-mobile"
                        role="tablist"
                        aria-label="主题切换"
                    >
                        {THEME_OPTIONS.map((option) => {
                            const active = mode === option.value;
                            return (
                                <button
                                    key={option.value}
                                    type="button"
                                    className={`theme-toggle-option${active ? ' active' : ''}`}
                                    aria-pressed={active}
                                    onClick={() => setThemeMode(option.value)}
                                >
                                    <i className={`bi ${option.icon}`} aria-hidden="true" />
                                    <span>{option.label}</span>
                                </button>
                            );
                        })}
                    </div>
                </div>
            </aside>
        </>
    );
}