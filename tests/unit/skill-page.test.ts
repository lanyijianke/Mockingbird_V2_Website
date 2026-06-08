import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import SkillPage, { metadata } from '@/app/ai/skill/page';

vi.mock('next/navigation', () => ({
    notFound: () => {
        throw new Error('NEXT_NOT_FOUND');
    },
}));

describe('Skill page', () => {
    const originalSkillPageEnabled = process.env.NEXT_PUBLIC_SKILL_PAGE_ENABLED;

    afterEach(() => {
        if (originalSkillPageEnabled === undefined) {
            delete process.env.NEXT_PUBLIC_SKILL_PAGE_ENABLED;
        } else {
            process.env.NEXT_PUBLIC_SKILL_PAGE_ENABLED = originalSkillPageEnabled;
        }
    });

    it('is hidden by default while the skill is not publicly launched', () => {
        delete process.env.NEXT_PUBLIC_SKILL_PAGE_ENABLED;

        expect(() => renderToStaticMarkup(createElement(SkillPage))).toThrow('NEXT_NOT_FOUND');
    });

    it('explains the skill and exposes downloads when explicitly enabled', () => {
        process.env.NEXT_PUBLIC_SKILL_PAGE_ENABLED = 'true';

        const html = renderToStaticMarkup(createElement(SkillPage));

        expect(html).toContain('Mockingbird Skill');
        expect(html).toContain('让你的 Agent 找到最新、最流行的 AI Prompt');
        expect(html).toContain('精选技术文章');
        expect(html).toContain('精选多模态提示词');
        expect(html).toContain('图片示例和视频预览');
        expect(html).toContain('mockingbird-knowledge');
        expect(html).toContain('获取 Skill 文件夹');
        expect(html).toContain('为什么你的 Agent 需要它');
        expect(html).not.toContain('不用再到处翻找热门 prompt');
        expect(html).not.toContain('不错过正在流行的 AI 玩法');
        expect(html).not.toContain('Use Cases');
        expect(html).toContain('请为我安装技能');
        expect(html).toContain('https://github.com/lanyijianke/mockingbird-skills/tree/main/skills/mockingbird-knowledge');
        expect(html).not.toContain('请为我的 Agent 安装并使用 Mockingbird Skill');
        expect(html).not.toContain('安装要求');
        expect(html).not.toContain('用途：');
        expect(html).not.toContain('把整个 mockingbird-knowledge 文件夹');
        expect(html).not.toContain('SKILL.md、scripts、references 和 agents');
        expect(html).not.toContain('Skill 包');
        expect(html).not.toContain('mockingbird-knowledge-skill.tar.gz');
        expect(html).not.toContain('帮我查找适合当前任务的内容资产');
        expect(html).toContain('找到当下值得收藏的图片 Prompt');
        expect(html).toContain('找到正在流行的视频 Prompt');
        expect(html).toContain('找到适合引用的技术文章');
        expect(html).toContain('直接复用爆款 Prompt 写法');
        expect(html).toContain('先看效果，再决定要不要用');
        expect(html).toContain('把热门 AI 玩法存成素材库');
        expect(html).toContain('bi-image');
        expect(html).toContain('bi-play-btn');
        expect(html).toContain('bi-file-text');
        expect(html).toContain('bi-collection');
        expect(html).not.toContain('给团队一个统一内容来源');
        expect(html).not.toContain('把多模态案例带进工作流');
        expect(html).not.toContain('更快跟上最新 AI 玩法');
        expect(html).not.toContain('search.mjs');
        expect(html).not.toContain('get-prompt.mjs');
        expect(html).not.toContain('get-article.mjs');
        expect(html).not.toContain('--media=image');
        expect(html).not.toContain('--media=video');
        expect(html).not.toContain('API Contract');
        expect(html).not.toContain('只读、安全、可分发');
        expect(html).not.toContain('R2');
        expect(html).not.toContain('admin token');
        expect(html).not.toContain('href="/downloads/mockingbird-knowledge-skill.tar.gz"');
        expect(html).not.toContain('下载资料');
        expect(html).not.toContain('下载使用手册');
        expect(html).not.toContain('下载 Skill 说明');
        expect(html).not.toContain('Downloads');
    });

    it('has canonical metadata for the manual page', () => {
        expect(metadata.title).toBe('Mockingbird Skill：精选 AI Prompt 与技术文章');
        expect(String(metadata.alternates?.canonical)).toContain('/ai/skill');
    });
});
