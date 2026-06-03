import Image from 'next/image';
import Link from 'next/link';
import { buildPageMetadata } from '@/lib/seo/metadata';
import '@/app/_styles/about-page.css';

export const runtime = 'nodejs';
export const metadata = buildPageMetadata({
  title: '关于知更鸟 AI 知识库',
  description: '了解知更鸟 AI 知识库的创建背景、作者信息，以及本站如何整理 AI 文章、提示词和工具榜单。',
  path: '/about',
});

const PROFILE = {
  bannerSrc: '/about/banner.jpg',
  avatarSrc: '/about/avatar.jpg',
  twitterUrl: 'https://x.com/lanyi1992',
  name: '蓝衣剑客',
  handle: '@lanyi1992',
  bio: '博主、独立开发者、创业者｜BTC Holder｜横跨 web2 与 web3｜希望自己的作品能给他人带来价值',
  story: [
    '做这个知识库，是因为我自己长期在追 AI 文章、提示词和产品趋势。信息很多，但常常散在不同地方，切来切去很耗时间。',
    '所以我想把真正值得反复查看的内容整理成一个稳定、清爽、可持续更新的知识库。',
    '如果你也在持续关注 AI，希望这里能帮你更快找到有价值的文章、可复用的提示词，以及值得跟进的热门榜单。',
  ],
};

export default function AboutPage() {
  return (
    <section className="about-page">
      <div className="about-hero">
        <div className="about-hero-banner">
          <Image
            src={PROFILE.bannerSrc}
            alt=""
            fill
            priority
            sizes="(max-width: 768px) 100vw, 960px"
            className="about-hero-banner-image"
          />
        </div>

        <div className="about-hero-card">
          <div className="about-avatar-wrap">
            <Image
              src={PROFILE.avatarSrc}
              alt={PROFILE.name}
              width={112}
              height={112}
              className="about-avatar"
            />
          </div>

          <div className="about-identity">
            <h1 className="about-name">{PROFILE.name}</h1>
            <p className="about-handle">{PROFILE.handle}</p>
            <p className="about-bio">{PROFILE.bio}</p>
            <div className="about-actions">
              <a
                href={PROFILE.twitterUrl}
                className="about-x-link"
                target="_blank"
                rel="noopener noreferrer"
              >
                <span className="about-x-icon">𝕏</span>
                <span>关注我的 X</span>
              </a>
            </div>
          </div>
        </div>
      </div>

      <div className="about-story">
        <div className="about-story-header">
          <p className="about-story-kicker">知更鸟 AI 知识库</p>
          <h2 className="about-story-title">为什么做这个站</h2>
        </div>

        <div className="about-story-body">
          {PROFILE.story.map((paragraph) => (
            <p key={paragraph} className="about-story-paragraph">
              {paragraph}
            </p>
          ))}
        </div>

        <div className="about-back">
          <Link href="/">返回首页</Link>
        </div>
      </div>
    </section>
  );
}
