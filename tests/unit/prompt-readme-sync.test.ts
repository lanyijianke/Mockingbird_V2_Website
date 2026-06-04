import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    inferCloudflareVideoDownloadUrl,
    parseReadmeToPrompts,
} from '@/lib/pipelines/prompt-readme-sync';
import { githubReadmeYouMindAdapter } from '@/lib/pipelines/prompt-sources/adapters/github-readme-yoomind';

describe('prompt README sync parser', () => {
    it('infers a downloadable video URL from a Cloudflare Stream thumbnail when no mp4 link is present', () => {
        const thumbnailUrl = 'https://customer-qs6wnyfuv0gcybzj.cloudflarestream.com/c775ab66f6890ada3edde63c32b6d32d/thumbnails/thumbnail.jpg';

        expect(inferCloudflareVideoDownloadUrl(thumbnailUrl)).toBe(
            'https://customer-qs6wnyfuv0gcybzj.cloudflarestream.com/c775ab66f6890ada3edde63c32b6d32d/downloads/default.mp4'
        );
    });

    it('fills videos from the thumbnail-derived Cloudflare URL when the README only exposes an image and a watch link', () => {
        const readme = `
### 2D 动画动作序列：风之骑士 vs 暗影兽

#### 📝 提示词

\`\`\`
ultra cinematic test prompt
\`\`\`

<img src="https://customer-qs6wnyfuv0gcybzj.cloudflarestream.com/c775ab66f6890ada3edde63c32b6d32d/thumbnails/thumbnail.jpg" width="600" alt="2D 动画动作序列：风之骑士 vs 暗影兽">

**[🎬 观看视频 →](https://youmind.com/zh-CN/seedance-2-0-prompts?id=3427)**

**作者:** [Maercih](https://x.com/Maercihh) | **来源:** [Link](https://x.com/Maercihh/status/2046082494966186428) | **发布时间:** Apr 20, 2026
`;

        const prompts = parseReadmeToPrompts(readme, 'https://github.com/YouMind-OpenLab/awesome-seedance-2-prompts');

        expect(prompts).toHaveLength(1);
        expect(prompts[0].videos).toEqual([
            'https://customer-qs6wnyfuv0gcybzj.cloudflarestream.com/c775ab66f6890ada3edde63c32b6d32d/downloads/default.mp4',
        ]);
    });

    it('keeps the direct mp4 when the README already exposes one', () => {
        const readme = `
### Seedance 2.0：80 岁说唱歌手 MV

#### 📝 提示词

\`\`\`
another test prompt
\`\`\`

<a href="https://github.com/YouMind-OpenLab/awesome-seedance-2-prompts/releases/download/videos/1403.mp4">
<img src="https://customer-qs6wnyfuv0gcybzj.cloudflarestream.com/5e26e379346b402faadc751a06cf99e4/thumbnails/thumbnail.jpg" width="700" alt="Seedance 2.0：80 岁说唱歌手 MV">
</a>

📥 *点击图片下载视频* | **[🎬 观看视频 →](https://youmind.com/zh-CN/seedance-2-0-prompts?id=1403)**

**作者:** [Paskoboy](https://x.com/beranalogi) | **来源:** [Link](https://x.com/beranalogi/status/2046099943522464133) | **发布时间:** Apr 20, 2026
`;

        const prompts = parseReadmeToPrompts(readme, 'https://github.com/YouMind-OpenLab/awesome-seedance-2-prompts');

        expect(prompts).toHaveLength(1);
        expect(prompts[0].videos).toEqual([
            'https://github.com/YouMind-OpenLab/awesome-seedance-2-prompts/releases/download/videos/1403.mp4',
        ]);
    });
});

describe('YouMind README source adapter', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('fetches README content from the configured raw URL template', async () => {
        const fetchMock = vi.fn(async () => ({
            ok: true,
            text: async () => '# README',
        }));
        vi.stubGlobal('fetch', fetchMock);

        await expect(githubReadmeYouMindAdapter.fetchSource({
            id: 'template-source',
            type: 'github-readme',
            owner: 'ExampleOrg',
            repo: 'example-prompts',
            branch: 'main',
            file: 'README_zh.md',
            rawUrlTemplate: 'https://example.invalid/{owner}/{repo}/{branch}/{file}',
            repoUrlTemplate: 'https://example.invalid/{owner}/{repo}',
            adapter: 'github-readme-yoomind',
            defaultCategory: 'gpt-image-2',
            enabled: true,
        })).resolves.toBe('# README');

        expect(fetchMock).toHaveBeenCalledWith('https://example.invalid/ExampleOrg/example-prompts/main/README_zh.md');
    });

    it('requires an explicit source URL or raw URL template', async () => {
        await expect(githubReadmeYouMindAdapter.fetchSource({
            id: 'missing-template',
            type: 'github-readme',
            owner: 'ExampleOrg',
            repo: 'example-prompts',
            branch: 'main',
            file: 'README_zh.md',
            adapter: 'github-readme-yoomind',
            defaultCategory: 'gpt-image-2',
            enabled: true,
        })).rejects.toThrow(/rawUrlTemplate|url/i);
    });

    it('extracts direct mp4 links into videoUrls', async () => {
        const readme = `
### No. 2: Direct MP4 Seedance Prompt

#### 📝 提示词

\`\`\`
video prompt body
\`\`\`

#### 🎬 视频

<a href="https://github.com/YouMind-OpenLab/awesome-seedance-2-prompts/releases/download/videos/594.mp4">
<img src="https://customer-qs6wnyfuv0gcybzj.cloudflarestream.com/e066fab457509bc6809ea212ae5d6a51/thumbnails/thumbnail.jpg" width="700">
</a>
`;

        const records = await githubReadmeYouMindAdapter.parse(readme, {
            id: 'yoomind-seedance-2',
            type: 'github-readme',
            owner: 'YouMind-OpenLab',
            repo: 'awesome-seedance-2-prompts',
            branch: 'main',
            file: 'README_zh.md',
            rawUrlTemplate: 'https://example.invalid/{owner}/{repo}/{branch}/{file}',
            repoUrlTemplate: 'https://repos.example.invalid/{owner}/{repo}',
            adapter: 'github-readme-yoomind',
            defaultCategory: 'seedance-2',
            enabled: true,
        });

        expect(records[0].videoUrls).toEqual([
            'https://github.com/YouMind-OpenLab/awesome-seedance-2-prompts/releases/download/videos/594.mp4',
        ]);
    });

    it('infers Cloudflare Stream download URLs from thumbnail-only Seedance records', async () => {
        const readme = `
### No. 6: Thumbnail Only Seedance Prompt

#### 📝 提示词

\`\`\`
video prompt body
\`\`\`

#### 🎬 视频

<img src="https://customer-qs6wnyfuv0gcybzj.cloudflarestream.com/3a7fb0a6d706b9f568479bb720ce1ad4/thumbnails/thumbnail.jpg" width="700">

**[🎬 观看视频 →](https://youmind.com/zh-CN/seedance-2-0-prompts?id=2530)**
`;

        const records = await githubReadmeYouMindAdapter.parse(readme, {
            id: 'yoomind-seedance-2',
            type: 'github-readme',
            owner: 'YouMind-OpenLab',
            repo: 'awesome-seedance-2-prompts',
            branch: 'main',
            file: 'README_zh.md',
            rawUrlTemplate: 'https://example.invalid/{owner}/{repo}/{branch}/{file}',
            repoUrlTemplate: 'https://repos.example.invalid/{owner}/{repo}',
            adapter: 'github-readme-yoomind',
            defaultCategory: 'seedance-2',
            enabled: true,
        });

        expect(records[0].videoUrls).toEqual([
            'https://customer-qs6wnyfuv0gcybzj.cloudflarestream.com/3a7fb0a6d706b9f568479bb720ce1ad4/downloads/default.mp4',
        ]);
    });

    it('parses GPT Image 2 Chinese README sections into normalized import records', async () => {
        const readme = `
### No. 1: 个人资料 / 头像 - 毛茸茸蓝眼小猫的影棚肖像

![Language-EN](https://img.shields.io/badge/Language-EN-blue)
![Raycast](https://img.shields.io/badge/🚀-Raycast_Friendly-purple)

#### 📖 描述

此提示词可生成一张简洁、写实的影棚宠物肖像。

#### 📝 提示词

\`\`\`
一张居中的影棚肖像，主角是一只毛茸茸的小猫。
\`\`\`

#### 🖼️ 生成图片

<img src="https://cms-assets.youmind.com/media/cat.jpg" width="600" alt="cat">

#### 📌 详情

- **作者:** [폴로 AI](https://x.com/polloai_kr)
- **来源:** [Twitter Post](https://x.com/polloai_kr/status/2047164497916539290#reversed-0)
- **发布时间:** 2026年4月23日

**[👉 立即尝试 →](https://youmind.com/zh-CN/gpt-image-2-prompts?id=13460)**
`;

        const records = await githubReadmeYouMindAdapter.parse(readme, {
            id: 'yoomind-gpt-image-2',
            type: 'github-readme',
            owner: 'YouMind-OpenLab',
            repo: 'awesome-gpt-image-2',
            branch: 'main',
            file: 'README_zh.md',
            rawUrlTemplate: 'https://example.invalid/{owner}/{repo}/{branch}/{file}',
            repoUrlTemplate: 'https://repos.example.invalid/{owner}/{repo}',
            adapter: 'github-readme-yoomind',
            locale: 'zh-CN',
            defaultCategory: 'gpt-image-2',
            enabled: true,
        });

        expect(records).toHaveLength(1);
        expect(records[0]).toMatchObject({
            externalId: 'yoomind-gpt-image-2:no-1',
            title: '个人资料 / 头像 - 毛茸茸蓝眼小猫的影棚肖像',
            rawTitle: '个人资料 / 头像 - 毛茸茸蓝眼小猫的影棚肖像',
            description: '此提示词可生成一张简洁、写实的影棚宠物肖像。',
            content: '一张居中的影棚肖像，主角是一只毛茸茸的小猫。',
            category: 'gpt-image-2',
            author: '폴로 AI',
            sourceUrl: 'https://x.com/polloai_kr/status/2047164497916539290#reversed-0',
            sourcePublishedAt: '2026年4月23日',
            mediaUrls: ['https://cms-assets.youmind.com/media/cat.jpg'],
            flags: ['raycast'],
        });
    });

    it('parses English headings and featured badges', async () => {
        const readme = `
### No. 2: VR Headset Exploded View Poster

![Featured](https://img.shields.io/badge/⭐-Featured-gold)

#### 📖 Description

Generates a high-tech exploded view diagram.

#### 📝 Prompt

\`\`\`
Create a VR headset exploded view poster.
\`\`\`

<img src="https://cms-assets.youmind.com/media/vr.jpg" width="700" alt="vr">

#### 📌 Details

- **Author:** [wory](https://x.com/wory37303852)
- **Source:** [Twitter Post](https://x.com/wory37303852/status/2045925660401795478)
- **Published:** April 19, 2026
`;

        const records = await githubReadmeYouMindAdapter.parse(readme, {
            id: 'yoomind-gpt-image-2',
            type: 'github-readme',
            owner: 'YouMind-OpenLab',
            repo: 'awesome-gpt-image-2',
            branch: 'main',
            file: 'README.md',
            rawUrlTemplate: 'https://example.invalid/{owner}/{repo}/{branch}/{file}',
            repoUrlTemplate: 'https://repos.example.invalid/{owner}/{repo}',
            adapter: 'github-readme-yoomind',
            defaultCategory: 'gpt-image-2',
            enabled: true,
        });

        expect(records[0]).toMatchObject({
            externalId: 'yoomind-gpt-image-2:no-2',
            title: 'VR Headset Exploded View Poster',
            author: 'wory',
            sourceUrl: 'https://x.com/wory37303852/status/2045925660401795478',
            sourcePublishedAt: 'April 19, 2026',
            mediaUrls: ['https://cms-assets.youmind.com/media/vr.jpg'],
            flags: ['featured'],
        });
    });
});
