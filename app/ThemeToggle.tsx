'use client';

import { useTheme } from '@/app/ThemeProvider';
import type { ThemeMode } from '@/lib/theme/theme';

const OPTIONS: Array<{ value: ThemeMode; label: string }> = [
    { value: 'system', label: '系统' },
    { value: 'light', label: '亮色' },
    { value: 'dark', label: '暗色' },
];

export default function ThemeToggle() {
    const { mode, resolvedTheme, setThemeMode } = useTheme();

    return (
        <div className="theme-toggle" role="tablist" aria-label="主题切换">
            {OPTIONS.map((option) => {
                const active = mode === option.value;
                return (
                    <button
                        key={option.value}
                        type="button"
                        className={`theme-toggle-option${active ? ' active' : ''}`}
                        aria-pressed={active}
                        data-theme-resolved={resolvedTheme}
                        onClick={() => setThemeMode(option.value)}
                    >
                        {option.label}
                    </button>
                );
            })}
        </div>
    );
}
