import { ToastProvider } from '@/app/ToastContext';
import BusuanziScript from './BusuanziScript';
import SiteNav from './SiteNav';
import SiteFooter from './SiteFooter';
import MobileTabBar from './MobileTabBar';
import { ThemeProvider } from '@/app/ThemeProvider';
import { buildPageMetadata } from '@/lib/seo/metadata';
import { THEME_COOKIE_NAME, getThemeBootstrapScript, type ThemeMode } from '@/lib/theme/theme';
import { cookies } from 'next/headers';
import './globals.css';
import '@/app/_styles/nav.css';
import Script from 'next/script';

export const runtime = 'nodejs';
export const metadata = buildPageMetadata({
  title: '知更鸟 AI 知识库',
  description: '知更鸟 AI 知识库提供 AI 教程、深度文章、提示词模板和工具榜单。',
  path: '/',
});

async function getInitialThemeMode(): Promise<ThemeMode> {
  const cookieStore = await cookies();
  const raw = cookieStore.get(THEME_COOKIE_NAME)?.value;

  if (raw === 'system' || raw === 'light' || raw === 'dark') {
    return raw;
  }

  return 'system';
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const initialThemeMode = await getInitialThemeMode();

  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <head>
        <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.min.css" />
        <Script id="theme-bootstrap" strategy="beforeInteractive">
          {getThemeBootstrapScript()}
        </Script>
        <BusuanziScript />
      </head>
      <body>
        <ThemeProvider initialMode={initialThemeMode}>
          <ToastProvider>
          {/* ═══ Top Navigation ═══ */}
          <SiteNav />

          {/* ═══ Main Content ═══ */}
          <main className="main-content">
            <div className="container">
              {children}
            </div>
          </main>
          <SiteFooter />
          <MobileTabBar />
          </ToastProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
