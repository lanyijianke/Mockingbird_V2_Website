import { ToastProvider } from '@/app/ToastContext';
import { AuthModalProvider } from '@/app/AuthModalContext';
import SiteNav from './SiteNav';
import SiteFooter from './SiteFooter';
import { buildPageMetadata } from '@/lib/seo/metadata';
import './globals.css';
import '@/app/_styles/nav.css';

export const runtime = 'nodejs';
export const metadata = buildPageMetadata({
  title: '知更鸟 AI 知识库',
  description: '知更鸟 AI 知识库提供 AI 教程、深度文章、提示词模板和工具榜单。',
  path: '/',
});

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <head>
        <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.min.css" />
      </head>
      <body>
        <ToastProvider>
        <AuthModalProvider>
        {/* ═══ Top Navigation ═══ */}
        <SiteNav />

        {/* ═══ Main Content ═══ */}
        <main className="main-content">
          <div className="container">
            {children}
          </div>
        </main>
        <SiteFooter />

        </AuthModalProvider>
        </ToastProvider>
      </body>
    </html>
  );
}
