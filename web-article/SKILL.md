---
name: web-article
description: "将网页文章（X/Twitter、Substack、博客、新闻等）翻译成中文并排版发布到微信公众号。当用户给了一个链接并要求翻译、发公众号、做成文章、写一篇中文稿、\"这篇不错帮我翻一下\"时触发。也支持直接给原文内容。当用户给了一组文件（原文 + 译文 + 术语规则），直接进入 Maker-Checker 审校角色。"
---

# Web-Article — 网页文章翻译发布工作流

将网页文章（X/Twitter、Substack、博客、新闻等）翻译成中文，校对排版后推送到微信公众号草稿，同时备份到 GitHub 仓库。

**版本**: 1.1.0（目录状态机：drafts/ + published/，微信草稿预览）
**作者**: Hermes Agent + grank
**平台**: macOS, Linux
**前置条件**: gh CLI；第九步（微信草稿发布）需 `WECHAT_MP_APP_ID` / `WECHAT_MP_APP_SECRET` 环境变量

## 触发条件

用户给一个 Twitter/X 推文链接，并希望得到中文内容。链接格式：
- `https://x.com/user/status/123...`
- `https://twitter.com/user/status/123...`
- `x.com/user/status/123...`

不限于明确说"翻译"——只要用户给了 X 链接并表达了"处理一下"、"做成文章"、"发公众号"等意图，就应该触发。

## 分类体系

每篇文章必须归入以下 4 个分类之一：

| 分类 | 说明 |
|---|---|
| ai-tech | AI 技术：开发、Prompt、Agent、工作流、原理、实战 |
| ai-application | AI 应用：把 AI 用到具体场景和业务里 |
| ai-business | AI 商业：行业、公司、产品竞争、市场、投资、商业模式 |
| ai-opinion | AI 观点：趋势判断、方法论、UX 思考、认知和观点 |

## 文件结构

```
~/web-article/
  articles/
    drafts/          # 工作区：翻译完成后暂存，待确认发布
    published/       # 正式区：用户确认后移入，网站只读取这里
    <state>/<slug>/
      index.md      # 完整 frontmatter + 正文
      images/
        cover.jpg   # 封面图（16:9，≥1200x630）
        01.jpg      # 正文图片（按出现顺序编号）
        ...

~/.hermes/skills/web-article/
  SKILL.md
  scripts/
    clean_tweet.py      # 推文文本清洗
    render_wxhtml.py    # Markdown → HTML 渲染 + 模板填充
    publish_wechat.py   # 微信公众号草稿发布（下载图片→上传→创建草稿）
  templates/
    default.html        # 默认模板（杂志风，纯正文 + 文末原文链接）
  references/
    wechat-api.md       # 微信公众号 API 详细参考
    terminology.json    # 翻译术语库（200+ 条，AI/ML/VC/编程/通用）
```

**调用脚本前设置 sys.path（整个任务只需设置一次）：**
```python
import os, sys
SKILL_DIR = os.path.expanduser("~/.hermes/skills/web-article")
sys.path.insert(0, SKILL_DIR)
```

之后直接 `from scripts.xxx import yyy` 即可，无需重复设置。

## 模板系统

`render_wxhtml.py` 使用 `templates/` 目录下的 HTML 模板文件组装最终页面。模板基于 Python `string.Template`，变量用 `${变量名}` 占位。

### 可用模板变量

| 变量 | 说明 |
|---|---|
| `${title}` | 文章标题 |
| `${author}` | 原作者（如 @nickbaumann_），用于编者按和 footer 展示 |
| `${date}` | 发布日期（YYYY-MM-DD） |
| `${source_url}` | 原文链接 |
| `${stats}` | 互动数据（保留接口，暂未使用） |
| `${container_style}` | 容器内联样式（字体、字号、颜色、最大宽度等） |
| `${body_html}` | 渲染后的正文 HTML 片段 |
| `${footer}` | 文末原文链接（由脚本自动生成） |

### 新增模板

在 `templates/` 下新建 `.html` 文件即可。例如 `templates/minimal.html`：

```html
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title}</title>
</head>
<body style="${container_style}">
${body_html}
${footer}
</body>
</html>
```

调用时指定 `template="minimal"` 即可：

```python
html = render(..., body_only=False, template="minimal")
```

用 `list_templates()` 可列出所有可用模板名。

### 当前内置模板

- **default** — 杂志卡片风。白色圆角卡片 + 暖灰背景，顶部金色装饰条，居中标题 + 作者日期，Noto Serif SC 衬线标题，金色渐变下划线(h2) + 左竖线(h3)，深色代码块，引用块带引号装饰，图片圆角投影，文末原文链接。使用 Google Fonts + 完整 CSS（非内联样式）。

## 工作流

### 第一步：抓取推文内容

**必须使用 Hermes 浏览器工具（browser_navigate + browser_snapshot）抓取。**

**关于登录态：** Hermes 浏览器工具运行的是独立浏览器实例，无法复用本机 Safari/Chrome 的 X 登录 cookie。因此：
- **X Article 长文**（有 "Focus mode" 链接的）通常不需要登录即可阅读，可以直接抓取
- **普通推文**大概率无法抓取，需要让用户手动复制内容
- **备用方案：** 如果浏览器抓取失败，让用户手动复制推文内容

**Jina Reader（通过 Agent Reach）** 是抓取公开网页的最佳方式，一行 curl 返回干净 Markdown，无需登录不限平台：
```bash
curl -s "https://r.jina.ai/https://example.com/article"
```

**Crawl4AI 备选方案（本机已部署）：** 当 Hermes 浏览器抓取失败时，可尝试使用本机 Crawl4AI 作为备选。Crawl4AI 部署在 `localhost:11235`，支持 stealth 模式和 magic 模式，对部分非 X 站点效果较好。

调用方式（通过 API）：
```bash
# 基础抓取
curl -s -X POST http://localhost:11235/md \
  -H "Content-Type: application/json" \
  -d '{"url":"https://example.com/article"}' | python3 -m json.tool

# 带 magic 模式（模拟人类行为）
curl -s -X POST http://localhost:11235/crawl \
  -H "Content-Type: application/json" \
  -d '{"urls":["https://example.com/article"],"crawler_config":"CrawlerRunConfig(magic=True, simulate_user=True, wait_time=2.0)"}'
```

**注意：** Crawl4AI 同样没有 X 登录态，对 X/Twitter 推文大概率也无法抓取完整内容。但可以作为 Hermes 浏览器失败后的备选尝试，特别是对非 X 平台的链接（博客、新闻网站等）。

**X Article 长文抓取优先级（2026-05 验证）：**
1. **opentwitter MCP `get_twitter_article_by_id`**（最推荐）：直接通过 API 获取完整文章内容、标题、封面图 URL，无需登录，不受 X 反爬限制。需先从推文链接提取 article ID（推文 text 中包含 `x.com/i/article/ID`），再调用此 API。返回的 `content` 字段即完整正文，`coverImage` 字段即封面图 URL。
2. **Hermes 浏览器**（备选）：独立实例，无法复用本机 X 登录 cookie。X Article 长文通常不需登录可阅读，但 Chrome 在 Ubuntu 23.10+ 可能因 AppArmor 限制无法启动（`--no-sandbox` 问题）。
3. **Jina Reader**（对 X 基本无效）：X 的登录墙会拦截 Jina Reader，返回登录页面内容而非文章正文。仅适用于非 X 的公开网页。

```bash
# 方法一（推荐）：opentwitter MCP
# 1. 先用 get_twitter_tweet_by_id 获取推文，从 text/urls 中提取 article ID
# 2. 再用 get_twitter_article_by_id 获取完整文章内容
# 返回：title, content, coverImage, userName, createdAt 等

# 方法二：browser_navigate 打开推文链接
# 2. browser_snapshot(full=true) 获取完整内容
# 3. browser_get_images 提取图片 URL
# 4. 从 snapshot 中提取：作者、发布时间、正文、互动数据
```

**图片抓取与位置映射：** 在 browser_snapshot 后立即用 browser_get_images 提取所有图片 URL。图片 URL 中 `name=small` 替换为 `name=large` 获取高清版。必须在同一 browser session 中完成，跳走再回来 cookie 可能失效。

**图片必须立即下载到本地：** 提取到图片 URL 后，立即下载到 `articles/drafts/<slug>/images/` 目录并转换为标准 JPG 格式（微信只接受 JPG/PNG），不要把外部 URL 留到后续步骤。操作：
```bash
curl -o images/01.jpg "https://example.com/image.png"
ffmpeg -y -i images/01.jpg -vf "scale=1200:-1" -q:v 3 images/01_final.jpg && mv images/01_final.jpg images/01.jpg
```
这样后续翻译、审校、发布都基于本地图片，不依赖外部 URL 的可用性。WebP 格式微信不支持，必须用 ffmpeg 转 JPG。

**GIF / 视频处理：** X/Twitter 文章中常见 GIF 动图（browser_snapshot 中显示 "Play Video" 或 "GIF" 文字）。微信不支持 GIF 动图，只接受 JPG/PNG。处理策略：

1. **`tweet_video_thumb/` URL**（如 `pbs.twimg.com/tweet_video_thumb/xxx.jpg`）：这是 Twitter 自动生成的静态缩略图，本身就是 JPG 格式，可直接使用，无需额外处理。
2. **`tweet_video/` URL**（如 `pbs.twimg.com/tweet_video/xxx.mp4`）：这是 MP4 视频文件，`publish_wechat.py` 已内置自动检测，会用 ffmpeg 或 PIL 提取首帧转为 JPG。
3. **普通 GIF URL**（Content-Type 为 `image/gif`）：同样由 `publish_wechat.py` 自动转换为静态 JPG。

**无需手动干预的情况：** 只要翻译稿中使用的图片 URL 是 `tweet_video_thumb/` 缩略图或普通 JPG/PNG，publish 脚本会自动处理。只有当原始 URL 是 `tweet_video/` 的 MP4 或 `.gif` 文件时，脚本才会触发自动转码。

**手动兜底（脚本失败时）：** 如果自动转换失败，可用 ffmpeg 手动提取首帧：`ffmpeg -y -i input.mp4 -frames:v 1 -q:v 2 output.jpg`。

**关键：必须记录图片在原文中的位置。** 从 snapshot 中观察每张图出现在哪段文字之后，建立一个"图片位置映射"（例如：图1 在引言段之后，图2 在"Codex threads"小节标题之前）。翻译时要严格按照这个映射，把 `![图片](url)` 插到翻译稿的对应位置。图片不能堆在文章末尾，必须跟随原文位置。

**X Article 长文：** 有 "Focus mode" 链接的长文 snapshot 可能被截断，需要多次 browser_scroll + browser_snapshot 拼接。

### 第二步：内容清洗

使用 `scripts/clean_tweet.py` 清洗抓取的原始文本。这一步的目的是去掉推文特有的噪音（短链接、占位符等），让后续翻译拿到干净的输入。

```python
from scripts.clean_tweet import clean_text, validate_cleaned_text
cleaned_text, report = clean_text(raw_text)
validation = validate_cleaned_text(cleaned_text)
```

处理内容：t.co 短链接移除、HTML 实体还原、thread 标记清理、图片占位移除、多余空白折叠。

如果 validation 报告有 issues，检查并处理。如果原文有代码命令行但没有用 ``` 包裹，清洗后需手动识别并添加代码块标记，否则排版脚本会当成普通段落渲染。

### 第三步：生成编者推荐语

编者推荐语应简洁连贯地说明：
- 文章主要讲了什么
- 能给读者带来什么价值
- 表达文章的真实性和重要性

**固定版权声明：** 编者按底部会自动追加一句固定声明「原文版权归原作者所有，蓝衣剑客只保留翻译、编辑之所有权」，由 `_build_intro()` 和 `default.html` 模板自动渲染，无需在 `intro` 参数中手动添加。

**使用 render() 的 intro 参数：**
```python
intro = "这篇文章深入探讨了 Agent Harness 与记忆的关系..."
html = render(
    title="文章标题",
    author="@author",
    date="2026-04-11",
    source_url="https://x.com/...",
    body_md=translated_markdown,
    intro=intro,  # 编者推荐语（模板模式有效）
    body_only=False,
    template="default",
)
```

**注意：** `intro` 参数在模板模式（body_only=False）和 API 模式（body_only=True）下均生效。

### 第四步：AI 翻译

翻译原则：**信达雅**。

这不是字对字翻译——目标是让中文读者获得和英文读者一样的阅读体验。

**翻译前必须加载术语库。** 使用 `skill_view(name='web-article', file_path='references/terminology.json')` 加载 `references/terminology.json`，按术语库中的规则翻译。术语库包含 200+ 条术语，分为 AI/ML、创业/VC、编程/开发、产品/通用、作者特有、常见难译短语 6 个分类，每条标注 `keep`（保留英文）或 `translate`（翻译为中文）。

具体翻译规则：

- **保留原文意思和逻辑**：不要增删观点，不要替作者发挥
- **符合中文阅读习惯**：去掉翻译腔。英文的长从句、被动语态、插入语，拆开或重组为中文自然表达
- **术语按术语库处理**：标注 `keep` 的保留英文（API、SDK、CLI、LLM 等），标注 `translate` 的使用推荐中文翻译
- **人名/品牌名保留原文**：Nick、Typefully、Linear、OpenAI、Anthropic 等
- **适当调整语序**：英文的后置定语、定语从句，在中文里提前或拆分
- **中英混排间距**：英文/术语前后各空半角空格
- **比喻性表达意译**：如 moat → 护城河，unicorn → 独角兽，elephant in the room → 显而易见却被回避的问题
- **惯用语不可直译**：如 at the end of the day → 归根结底，reinvent the wheel → 重复造轮子

**注意：翻译稿文件开头不要重复写标题**，v0.9.1+ 版本会自动跳过正文开头的 h1/h2/h3 标题行，避免与公众号标题重复。

**图片回填：** 翻译时必须按照第一步建立的"图片位置映射"，将 `![图片](images/NN.jpg)` 插到翻译稿的对应位置。**图片引用统一使用本地相对路径**（如 `images/01.jpg`），不要引用外部 URL——图片应在第一步已下载到本地 `images/` 目录。图片位置必须与原文一致，不能全部堆在文末。

**图片不加图注：** 原文没有图注的，翻译稿也不要添加图注。直接用 `![图片](url)` 即可，不要写成 `![图注文字](url)`。

**列表格式注意：** 避免使用 `-` 或 `*` 等列表标记（会导致制表符转换问题），建议用段落或换行来替代。例如：

原文：
```
- 是开源的
- 是模型无关的
- 使用开放标准
```

建议翻译为：
```
是开源的。是模型无关的。使用开放标准、agents.md 和 skills 等。
```

这样微信不会显示空圆点。

### 第五步：Maker-Checker 审校（结构化校对）

翻译完成后，以 **Maker-Checker** 模式进行结构化审校：制作者（Maker）完成翻译，审校员（Checker）对照原文逐段审查。

#### 审校流程

1. **将原文和译文按章节拆分为 2 段**（不要超过 2 段，并行子 Agent 过多容易触发 API 限流），保存为临时文件（如 `/tmp/maker-checker/part-{n}-orig.txt` 和 `part-{n}-trans.txt`）
2. **用 `delegate_task` 并行启动 2 个子 Agent**，每个负责一段的审校。每个子 Agent 的 prompt 必须是自包含的：
   - 指定读取哪些文件（原文段落、译文段落、术语规则文件的路径）
   - **明确告知子 Agent 这是全文的第几段、共几段**（如"这是第 1 段，共 2 段"），避免子 Agent 因看不到其他段落而误报漏译
   - 包含完整的审校报告格式要求
   - 包含术语规则内容（或告诉子 Agent 去读术语文件）
   - toolsets 设为 `["terminal", "file"]`
3. **汇总各子 Agent 的审校报告**，合并为一份完整报告
4. **展示报告给用户**，等待确认
5. **按报告逐条修改译文**（严重问题必改，建议改进酌情采纳）
6. **保存修改后的版本为 v2**

如果 `delegate_task` 不可用（API key 未配置、超时等），退化为单 Agent 顺序审校：逐段读取原文和译文，输出完整审校报告。

#### 术语规则来源（按优先级）

1. **用户提供的自定义术语文件**：如果用户在任务中提供了 `terminology.md` 或类似的术语规则文件，优先按此文件执行
2. **内置术语库**：`references/terminology.json`（200+ 条，AI/ML/VC/编程/通用）

当用户提供了自定义术语文件时，内置术语库作为补充（自定义文件未覆盖的术语仍按内置库处理）。

#### 审校报告格式

```
## 审校报告

### 严重问题（必须修改）
- 误译、漏译、逻辑错误
- 术语不统一（同一个概念前后用不同译法）
- 每条格式：原文 → 当前译文 → 问题描述 → 建议修改

### 建议改进（推荐修改）
- 翻译腔、不够自然的中文表达
- 每条格式：原文 → 当前译文 → 建议译文 → 理由

### 术语一致性检查
- 所有术语是否按术语规则翻译
- 中英混排空格是否到位

### 风格检查
- 去翻译腔
- 列表格式（避免 - 或 * 列表标记）
- 代码块、图片引用格式
```

#### 触发方式

- **自动触发**：每次翻译完成后默认执行 Maker-Checker 审校
- **跳过**：如果用户明确说"不用审校""直接发""快点"，可以跳过审校直接排版发布
- **用户主动要求**：如果用户给了原文 + 译文 + 术语文件，直接进入 Checker 角色

### 第六步：排版

使用 `scripts/render_wxhtml.py` 渲染 HTML。

```python
from scripts.render_wxhtml import render

# body_only=True:  纯正文 HTML 片段，适合公众号 API
# body_only=False: 用模板组装完整 HTML，适合本地预览
html = render(
    title="文章标题",
    author="@author",
    date="2026-04-11",
    source_url="https://x.com/...",
    body_md=translated_markdown,
    intro=intro,  # 编者推荐语
    body_only=False,
    template="default",  # 可选，默认 "default"
)
```

**双渲染模式：**
- `body_only=True`：输出**内联样式** HTML（公众号 API 需要，无外部 CSS）
- `body_only=False`（模板模式）：输出**干净语义化** HTML（无内联样式），由模板 CSS 控制外观

**Markdown 渲染规则：**
- `![alt](url)` 图片引用自动渲染为 `<figure><img>` 标签（不显示 figcaption 图注）
- ``` ``` ``` 代码块渲染为 `<pre><code>` 标签
- `##` / `###` 标题渲染为 `<h2>` / `<h3>`
- `>` 引用块渲染为 `<blockquote>`
- `**bold**`、`*italic*`、`` `code` `` 正常处理
- 裸链接自动渲染为 `<a>` 标签
- body_only 模式下所有样式内联；模板模式下样式由 CSS 接管
- **列表项过滤**：空列表项不会生成 `<li>` 标签（避免微信显示空圆点）

### 第七步：生成 HTML（不预览）

生成预览 HTML 文件供用户参考，**不要打开浏览器预览**（容易卡死）：

```python
preview_html = render(..., intro=intro, body_only=False)
# 写入临时文件，告知用户文件路径，不要 open/浏览器预览
```

等待用户反馈：
- 用户说"发"/"OK"/"确认" → 执行第八步
- 用户提出修改意见 → 修改翻译后重新排版生成
- 用户说"不要了"/"取消" → 终止流程

### 第八步：写入 drafts/ 并推送到 GitHub

将文章保存为 Markdown 文件（含图片），写入 `articles/drafts/` 目录，推送到 GitHub。

仓库：`lanyijianke/web-article`（本地路径检查 `~/web-article` 是否存在）

文件路径：`articles/drafts/<slug>/index.md`，slug 从标题生成（英文，用 - 连接）。

```markdown
---
id: "<slug>"
slug: "<slug>"
title: "文章标题"
summary: "60-140字中文摘要（从编者推荐语提炼）"
category: "ai-tech"   # ai-tech / ai-application / ai-business / ai-opinion
author: "原作者"
original_url: "https://..."
source_platform: "x"  # x / youtube / substack / website
type: "tweet"          # tweet / article / video
cover_image: "images/cover.jpg"
published_at: "YYYY-MM-DDTHH:MM:SS+08:00"
updated_at: "YYYY-MM-DDTHH:MM:SS+08:00"
translated_at: "YYYY-MM-DDTHH:MM:SS+08:00"
status: draft
tags: []
---

正文内容（含图片引用）...
```

**同时更新 manifest.json**：在 `articles` 数组中新增一条记录。完整字段示例：
```json
{
  "id": "<slug>",
  "slug": "<slug>",
  "title": "文章标题",
  "summary": "60-140字中文摘要",
  "category": "ai-tech",
  "author": "@author",
  "contentPath": "articles/drafts/<slug>/index.md",
  "coverImage": "images/cover.jpg",
  "publishedAt": "YYYY-MM-DDTHH:MM:SS+08:00",
  "status": "draft",
  "tags": ["tag1", "tag2"]
}
```

**⚠️ manifest.json 必填字段检查清单（缺少任何一个都会导致网站异常）：**
- `id`：与 slug 相同，文章唯一标识
- `slug`：URL 路径段，网站路由依赖此字段（缺少 → 页面 404 + 封面图不显示）
- `contentPath`：Markdown 文件路径，必须与目录位置同步（drafts/ 或 published/）
- `status`：与目录位置同步（drafts/ → "draft"，published/ → "published"）
- `coverImage`：必须是相对路径（如 `images/cover.jpg`），不能包含目录前缀

写完 manifest 后，**必须验证**所有文章都包含 slug 字段。

正文图片统一用相对路径 `images/NN.jpg`（按出现顺序编号），封面图 `images/cover.jpg`。

**图片工作流（先本地化，再分发）：**
1. **下载 + 转换**：第一步抓到图片 URL 后立即下载到 `images/` 目录，用 ffmpeg 转为标准 JPG（`scale=1200:-1`，WebP 不支持）
2. **翻译稿引用**：`![图片](images/NN.jpg)`（相对路径，不引用外部 URL）
- **封面裁剪**：`ffmpeg -y -i images/01.jpg -vf "scale=1200:675:force_original_aspect_ratio=increase,crop=1200:675" -q:v 3 -update 1 images/cover.jpg`。注意：当源图宽度已经大于 16:9（如 1200x700）时，`crop=ih*16/9:ih` 会失败（输出为空），因为要裁的宽度大于原图宽度。改用 `scale+crop` 组合可以兼容任意比例的源图。`-update 1` 避免单帧输出时的 ffmpeg 警告。
4. **发布时分发**：第九步通过本地 HTTP server 将相对路径转为完整 URL，提供给 publish 脚本下载

git add 后 commit push。

### 第九步：微信草稿预览 + 确认发布

**预览方式：** 将文章推送到微信公众号草稿，用户在 mp.weixin.qq.com 后台查看效果。这是最接近最终呈现的预览方式，零额外依赖。

**前置条件**：环境变量 `WECHAT_MP_APP_ID` 和 `WECHAT_MP_APP_SECRET` 必须设置。如果未配置，跳过此步并告知用户。

使用 `scripts/publish_wechat.py` 完成发布：

```python
from scripts.publish_wechat import WeChatPublisher

# 1. 启动本地 HTTP server（提供本地图片给 publish 脚本下载）
import subprocess, time, socket, glob
subprocess.run(["bash", "-c", "pkill -f 'python3 -m http.server' 2>/dev/null; true"], timeout=5)
ARTICLE_DIR = os.path.expanduser("~/web-article/articles/drafts/<slug>")
s = socket.socket(); s.bind(("127.0.0.1", 0)); port = s.getsockname()[1]; s.close()
proc = subprocess.Popen(["python3", "-m", "http.server", str(port)], cwd=ARTICLE_DIR,
                         stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1)
base_url = f"http://127.0.0.1:{port}"

# 2. 将 HTML 中的相对路径替换为 HTTP URL
body_html = body_html.replace('src="images/', f'src="{base_url}/images/')

# 3. 发布（仅正文 + 图片，不含视频）
pub = WeChatPublisher()
result = pub.publish(
    title="文章标题",
    body_html=body_html,           # render(body_only=True) 的输出（路径已替换）
    cover_url=f"{base_url}/images/cover.jpg",  # 本地封面图
    source_url="https://x.com/...", # 原文链接，可选
)

# 4. 上传视频（与 publish 完全独立，单独调用）
import glob
video_paths = sorted(glob.glob(f"{ARTICLE_DIR}/videos/*.mp4"))
if video_paths:
    video_titles = [
        "视频标题1",  # 与 video_paths 一一对应
        "视频标题2",
    ]
    video_results = pub.upload_videos(video_paths, video_titles)
    for r in video_results:
        if r["success"]:
            print(f"视频已上传: {r['title']} -> media_id={r['media_id']}")
        else:
            print(f"视频上传失败: {r['title']}: {r.get('error', '')}")

# 5. 清理
proc.terminate()
```

**视频上传说明：** 视频上传与 `publish()` 完全独立，通过 `pub.upload_videos(video_paths, video_titles)` 单独调用。上传后视频进入微信素材库，需审核通过后在公众号后台编辑草稿手动插入。`upload_videos()` 会自动检查文件大小（≤20MB），超限的跳过并报告错误。

**关键：`publish_wechat.py` 只接受 HTTP URL，不接受本地文件路径。** 翻译稿中图片用相对路径 `images/NN.jpg`，发布前必须通过本地 HTTP server 转为完整 URL。脚本自动完成：
1. 获取 access_token（有效期 2 小时，同任务内复用）
2. 从 HTTP URL 下载正文中的所有图片到临时目录
3. 逐张上传正文图片到微信（uploadimg），返回微信 URL 并替换 HTML 中的 src
4. 上传封面图为永久素材（add_material），获取 thumb_media_id
5. 调用草稿接口（draft/add），创建草稿

**注意事项**：
- 微信只接受 JPG/PNG，每张 < 1MB
- 正文 HTML 中的图片必须是微信上传后返回的 URL，外链会被过滤
- 草稿创建后可在 mp.weixin.qq.com 后台查看/发布
- 无第三方依赖，只用 urllib + json
- **API 文档来源**：通过 Context7 实时查询（library ID: `/websites/developers_weixin_qq_doc_subscription_api`），确保接口不过时

等待用户反馈：
- 用户说"发"/"OK"/"确认" → 执行第十步（正式发布到 published/）
- 用户提出修改意见 → 修改翻译后重新排版，重新推微信草稿
- 用户说"不要了"/"取消" → 终止流程

### 第十步：正式发布（移入 published/）

用户确认后，执行以下操作：

1. **`git mv articles/drafts/<slug> articles/published/<slug>`**
2. **更新 manifest.json**：将该文章的 `contentPath` 从 `articles/drafts/<slug>/index.md` 改为 `articles/published/<slug>/index.md`，`status` 改为 `"published"`
3. **更新 index.md frontmatter**：将 `status: draft` 改为 `status: published`
4. **commit + push**

**状态机规则：**
- 文章只存在于 `drafts/` 或 `published/` 两个目录之一
- 状态以目录位置为准：在 `drafts/` 就是草稿，在 `published/` 就是已发布
- manifest.json 中的 `status` 和 `contentPath` 必须与目录位置同步
- 网站只读取 `published/` 目录下的文章

### 第十一步：反馈

向用户报告完成状态，包括：

- **GitHub 发布**：仓库链接 + `articles/published/<slug>/index.md` 路径
- **公众号草稿**：已在第九步推送，请到 mp.weixin.qq.com 后台审核并正式发布
- **跳过的步骤**：如果环境变量缺失导致第九步跳过，明确告知

## 批量处理

如果用户一次给多个链接，逐个处理，每个都走完整工作流。如果用户要求定时抓取指定账号，使用 cron job 配合此技能。

## 非 X 文章处理

web-article 也可用于非 X 来源的文章（博客、个人网站、新闻网站等），翻译/排版/发布步骤完全不变，只有**第一步内容抓取**不同。

### 内容抓取（按优先级排序）

**方法一：Jina Reader（推荐，最简单可靠）**

通过 Agent Reach 内置的 Jina Reader，一行 curl 搞定，返回干净 Markdown：

```bash
curl -s "https://r.jina.ai/https://example.com/article"
```

优点：自动转 Markdown、保留格式、无需登录、不限平台、不会被截断。
缺点：图片 URL 可能包含原始站点的 tracking 参数。

适用于绝大多数公开网页（博客、新闻、技术文章等）。

**方法二：Hermes 浏览器 + JS 提取（备选）**

当 Jina Reader 抓不到时（需要 JS 渲染的页面、反爬严格的站点）：

```bash
# 1. browser_navigate 打开链接
# 2. browser_console 提取全文：
#    - 通用：document.querySelector('article').innerText
#    - Paul Graham 网站：document.querySelector('td font').innerText
#    - 其他站点根据实际 DOM 结构选择
# 3. 注意：browser_snapshot(full=true) 对长文会截断，优先用 browser_console
```

**关键经验：browser_snapshot 即使设置 full=true 也会截断长文。** 对超过约 8000 字符的文章，必须用 browser_console 的 JS 表达式提取。

### 封面图处理

**非 X 文章通常无配图**，微信要求草稿必须有封面图。当正文无图时：

1. 用 `cover_url` 参数指定封面图 URL（脚本会单独下载）
2. 如果封面 URL 不可用（如 404），用 ffmpeg 生成文字封面：

```bash
ffmpeg -y -f lavfi -i "color=c=0x1a1a2e:s=900x500:d=1" \
  -vf "drawtext=text='文章标题':fontsize=48:fontcolor=white:x=(w-text_w)/2:y=80,drawbox=x=0:y=248:w=900:h=4:color=0xC9A84C:t=fill,drawtext=text='作者':fontsize=28:fontcolor=gray:x=(w-text_w)/2:y=340" \
  -frames:v 1 /tmp/cover.jpg
```

3. 用临时 HTTP server 提供本地文件给 publish 脚本下载：
```python
import subprocess, time, socket, signal
# 启动前先清理上次残留的孤儿 http.server 进程
subprocess.run(["bash", "-c", "pkill -f 'python3 -m http.server' 2>/dev/null; true"], timeout=5)
s = socket.socket(); s.bind(("127.0.0.1", 0)); port = s.getsockname()[1]; s.close()
proc = subprocess.Popen(["python3", "-m", "http.server", str(port)], cwd="/tmp")
time.sleep(1)
cover_url = f"http://127.0.0.1:{port}/cover.jpg"
# ... publish with cover_url ...
proc.terminate()
```

注意：`s.bind(("127.0.0.1", 0))` 只绑定本地回环，避免对外暴露端口。

### 嵌入视频处理

**重要：Jina Reader 和 Crawl4AI 的 Markdown 输出会完全忽略页面中嵌入的视频。** 如果原文包含 Vimeo/YouTube 等嵌入视频，必须额外从 HTML 中提取。

**视频处理有两条独立路径，互不耦合：**

| | 网站路径（GitHub） | 微信路径（WeChat API） |
|---|---|---|
| **视频存储** | `videos/` 目录，git push 到仓库 | 上传到微信素材库（永久素材） |
| **缩略图** | 下载到 `images/`，翻译稿中 `![图片](images/NN.jpg)` 引用 | 同左（缩略图随正文图片一起上传） |
| **视频文件** | 原始 MP4，前端自由渲染（video player） | ≤20MB，MP4 格式，`upload_videos()` 上传 |
| **超限处理** | 无限制 | ffmpeg 压缩（crf 28~32 + 缩分辨率） |
| **发布方式** | git push（自动） | `pub.upload_videos()` 独立调用（不经过 `publish()`） |
| **最终使用** | 前端 `<video>` 标签播放 | 素材库中手动插入草稿 |

#### 第一步：从 HTML 中发现视频

Crawl4AI 抓取的原始 HTML 中可以找到视频 embed URL。用正则提取：

```python
import json, subprocess, re

# 先用 Crawl4AI 抓取原始 HTML
result = subprocess.run(
    ["curl", "-s", "-X", "POST", "http://localhost:11235/crawl",
     "-H", "Content-Type: application/json",
     "-d", json.dumps({
         "urls": ["https://example.com/article"],
         "crawler_params": {"magic": True, "wait_until": "networkidle", "page_timeout": 30000}
     })],
    capture_output=True, text=True, timeout=60
)
data = json.loads(result.stdout)
html = data["results"][0].get("html", "")

# 提取 Vimeo embed URL（带 h 参数）
vimeo_urls = re.findall(r'(https://player\.vimeo\.com/video/\d+\?h=[a-f0-9]+(?:&[^"\\]*)*)', html)

# 提取 YouTube embed URL
youtube_urls = re.findall(r'(https://www\.youtube(?:-nocookie)?\.com/embed/[a-zA-Z0-9_-]+)', html)
```

#### 第二步：获取视频元数据（Vimeo）

Vimeo 视频通常为 unlisted，不能直接用 video ID 访问，必须用完整 embed URL（含 `h` 参数）调用 oEmbed。Vimeo 有 TLS 指纹检测，需要 `curl_cffi`：

```bash
# 安装依赖（首次使用）
pip3 install --user --break-system-packages curl_cffi
```

```python
from curl_cffi import requests

# 用完整 embed URL 调用 oEmbed
r = requests.get(
    "https://vimeo.com/api/oembed.json?url=https://player.vimeo.com/video/1234567?h=abcdef",
    impersonate="chrome"  # 必须，否则 TLS 指纹被拦截
)
d = r.json()
# d["title"], d["duration"], d["thumbnail_url"], d["width"], d["height"]
```

**关键经验：**
- Vimeo oEmbed 用裸 video ID 会返回 404，**必须带 `h` 参数的完整 embed URL**
- `impersonate="chrome"` 是必须的，否则 Vimeo 拒绝请求（TLS fingerprint blocking）
- 数据中心 IP 访问 Vimeo 页面会被 403，但 oEmbed API 正常
- `curl_cffi` 安装在 `--user` 下，execute_code 沙箱找不到，必须在主终端或 heredoc 中运行

#### 第三步：下载完整视频 + 高清缩略图

用 yt-dlp 同时下载完整视频和高清缩略图。视频上传到微信素材库供手动插入，缩略图用于翻译稿配图。

```bash
# yt-dlp 已安装在 ~/.local/bin/yt-dlp，支持 Vimeo
# 同时下载视频（最高画质）和缩略图
yt-dlp --write-thumbnail \
  -o "articles/drafts/<slug>/videos/%(id)s.%(ext)s" \
  "https://player.vimeo.com/video/1234567?h=abcdef"
```

批量下载：

```bash
mkdir -p articles/drafts/<slug>/videos
for url in "https://player.vimeo.com/video/ID1?h=xxx" "https://player.vimeo.com/video/ID2?h=yyy"; do
  yt-dlp --write-thumbnail -o "articles/drafts/<slug>/videos/%(id)s.%(ext)s" "$url" 2>&1 | tail -3
done
```

**微信视频素材限制：**
- 格式：MP4（yt-dlp 默认输出 MP4）
- 大小：不超过 20MB
- 时长：建议不超过 10 分钟
- 上传后需审核通过才能使用

如果视频超过 20MB，需要用 ffmpeg 压缩：
```bash
ffmpeg -y -i input.mp4 -c:v libx264 -crf 28 -preset fast -c:a aac -b:a 128k output.mp4
```

**关键经验：**
- yt-dlp 需要安装 `curl_cffi` 后才能正常下载 Vimeo（TLS fingerprint）
- 缩略图默认为 1920x1080，适合微信
- 下载视频和缩略图到 `videos/` 子目录，缩略图转 JPG 后移到 `images/`

#### 第四步：转换并保存缩略图

```bash
IMAGES_DIR=articles/drafts/<slug>/images
ffmpeg -y -i /tmp/vimeo-thumb/1234567.jpg -vf "scale=1200:-1" -q:v 3 "$IMAGES_DIR/02-video-name.jpg"
```

#### 第五步：在翻译稿中插入

在翻译稿的对应位置插入缩略图，图片编号按出现顺序递增。视频在原文中的位置可通过以下方式推断：
- Crawl4AI HTML 中视频 embed URL 前后的文字上下文
- 视频标题通常暗示内容（如 `codex-artemis-demo` 对应 Artemis 太空任务段落）
- 参考原文 Markdown 中的 `[attached image]` 标记（Crawl4AI 有时会标记但丢失内容）

```
![图片](images/02-artemis-demo.jpg)
```

#### YouTube 视频处理

YouTube 视频相对简单：
1. 提取 video ID：`/embed/VIDEO_ID` 中的 `VIDEO_ID`
2. 缩略图 URL 直接拼接：`https://img.youtube.com/vi/{VIDEO_ID}/maxresdefault.jpg`（1280x720）
3. 如果 maxresdefault 404，降级到 `hqdefault.jpg`（480x360）
4. 无需 curl_cffi 或特殊工具

### 常见站点 DOM 选择器参考

| 站点 | 提取方式 |
|------|---------|
| Paul Graham | Jina Reader 或 `document.querySelector('td font').innerText` |
| 大多数博客 | Jina Reader 即可 |
| Medium/Substack | Jina Reader 即可 |
| OpenAI Blog | Jina Reader 获取正文；Crawl4AI 抓 HTML 提取 Vimeo 视频（Jina/Crawl4AI Markdown 都不含嵌入视频） |
| 需要 JS 渲染的 SPA | Hermes 浏览器 + browser_console |

## Pitfalls

- **Hermes 浏览器可能无法启动**：Chrome 在 Ubuntu 23.10+ 因 AppArmor 限制可能报 `No usable sandbox!` 错误无法启动。此时应优先使用 opentwitter MCP 的 `get_twitter_article_by_id` 抓取 X Article，或用 Jina Reader 抓取非 X 网页。Hermes 浏览器是独立实例，不能复用本机 X 登录 cookie
- **Crawl4AI 备选**（`localhost:11235`）：Hermes 浏览器失败时可尝试，但对 X/Twitter 同样没有登录态，适用于非 X 平台链接
- **图片要在同一 session 中立即抓取并下载到本地**，跳走再回来可能失效。不要在翻译稿中引用外部图片 URL
- **图片工作流核心原则：先本地化，再分发。** 第一步抓到图片 URL 后立即下载到 `images/` 目录并转 JPG；翻译稿中用相对路径 `images/NN.jpg`；发布时通过本地 HTTP server 提供给 publish 脚本下载。全程不依赖外部 URL 的可用性
- **微信不支持 GIF 动图**，只接受 JPG/PNG。X/Twitter 中的 GIF 会以 `tweet_video/`（MP4）或 `tweet_video_thumb/`（静态 JPG 缩略图）两种 URL 形式出现。`publish_wechat.py` 已内置 GIF/MP4 → JPG 自动转码（PIL 或 ffmpeg），但 `tweet_video_thumb/` 缩略图可直接使用无需转换。如果翻译稿中直接引用了 `tweet_video_thumb/` URL，无需额外处理
- **GIF 首帧可能丢失信息**：动画 GIF 提取首帧作为静态图后，动态内容会丢失。如果 GIF 的信息价值主要在动画过程中（如逐步演示），应在翻译稿中用文字补充描述动画内容
- **Jina Reader 会丢失超链接**：X Article 中的 `repo:` 超链接（指向 GitHub 仓库）会被 Jina Reader 完全丢弃，只留下 `repo:` 纯文字。对于包含大量外链的列表式文章，抓取后必须检查是否有链接丢失。补救方案：根据原文已给出的 `owner/repo` 名称手动补全 GitHub 链接，格式 `[repo_name](https://github.com/owner/repo)`
- **X 反爬**：连续频繁请求会触发检测，尽量减少请求次数
- **图片位置必须跟随原文**，不能堆在文末
- **图片不加图注**，原文没有的不要自己加
- **代码命令行**：原文没 ``` 包裹的代码需手动添加标记
- **翻译稿不要重复标题**：文件开头不要写标题行（v0.9.1+ 自动跳过开头的 h1/h2/h3）
- **排版用 body_only=True**：公众号有自带头尾，只传正文 HTML
- **sys.path**：调用脚本前必须设置一次，指向技能根目录
- 公众号 API 不支持外链 CSS，所有样式必须内联
- 封面图必须上传为永久素材，临时素材不能用于草稿
- Thread 推文要全部抓取并合并翻译
- pbs.twimg.com 图片 URL 中 `name=small` 要换成 `name=large`
- **新增模板**时文件编码必须是 UTF-8，变量用 `${var}` 格式，不要用 Jinja2 的 `{{var}}`
- **微信发布**：正文中的图片必须是微信 uploadimg 返回的 URL，外链会被过滤
- **微信发布**：每张图片 < 1MB，只接受 JPG/PNG
- **微信发布**：封面图需要上传为永久素材（add_material），临时素材不能用于草稿
- **双渲染模式**：body_only=True 输出内联样式 HTML（给公众号），body_only=False 输出干净 HTML（给模板 CSS）。不要混淆
- **微信发布**：可使用 Context7（`/websites/developers_weixin_qq_doc_subscription_api`）查询最新 API 文档
- **微信发布 SSL 问题**：下载 pbs.twimg.com 图片时可能遇到 SSL 证书验证失败，publish_wechat.py 已内置 ssl._create_unverified_context() 处理。如果其他图片源也出现 SSL 错误，检查是否需要同样的处理
- **execute_code 不继承环境变量**：发布脚本需要 WECHAT_MP_APP_ID / WECHAT_MP_APP_SECRET，但 execute_code 沙箱读不到。解决方法：在主终端 `echo "$VAR" | tr -d '\n' > /tmp/file`，然后在 execute_code 里用 `terminal("cat /tmp/file")` 读取，设置 `os.environ` 后再初始化 WeChatPublisher
- **read_file 返回带行号前缀**：格式为 `1|content`，不要用 read_file 读取凭证文件，否则 `1|` 前缀会混入 API 参数导致请求失败。用 `terminal("cat file")` 读取原始内容
- **微信发布 IP 白名单**：微信公众号 API 要求调用方 IP 在白名单中（错误码 40164）。需到 mp.weixin.qq.com → 开发 → 基本配置 → IP 白名单中添加当前机器 IP。首次发布前应确认 IP 已加白，否则整个发布流程会失败
- **正文无图时的封面处理**：publish_wechat.py 已支持 cover_url 参数单独下载封面。当正文无图片但有 cover_url 时，封面会单独下载并上传为永久素材。封面图必须是 JPG/PNG 且 < 1MB
- **本地封面图需要 HTTP server**：publish() 只接受 URL 不接受本地路径。用 `python3 -m http.server` 启动临时服务，或用 ffmpeg 直接生成到 /tmp 再 serve
- **X Article 中的 GIF/视频处理**：X Article 可能包含 GIF 动图（browser snapshot 中显示 "Play Video" 按钮和 "GIF" 文字标签）。微信不支持 GIF，需转为静态图。两种方案：①Twitter 的 `tweet_video_thumb/{id}.jpg` URL 本身就是静态 JPG 缩略图（通常 150-200KB），可直接作为图片引用使用，无需 ffmpeg。browser_get_images 返回的 URL 中 `tweet_video_thumb` 前缀即为此类媒体。②如果缩略图不满足需求，用 ffmpeg 提取首帧：`ffmpeg -y -i video.mp4 -frames:v 1 -q:v 2 frame.jpg`。优先用方案①，更简单可靠。
- **WebP 图片处理**：部分 CDN（如 OpenAI 的 ctftassets.net）实际返回 WebP 格式，即使 URL 后缀是 .png。微信不支持 WebP，会报 40137（invalid image format）或 40113（unsupported file type）。`publish_wechat.py` 内置了 PIL 自动转码，但 execute_code 沙箱可能找不到 `--user` 安装的 Pillow。遇到 WebP 时的处理方案：①先 `file downloaded_file` 确认实际格式；②用 `ffmpeg -y -i input.webp -q:v 2 output.jpg` 手动转为 JPG；③用 localhost HTTP server 提供本地 JPG 给 publish 脚本（参照封面图处理方法）
- **⚠️ execute_code 中 read_file 返回内容不可直接传给脚本**：hermes_tools 的 `read_file()` 在 execute_code 沙箱中有时会返回包含 "File unchanged since last read..." 缓存提示的内容，传给 render_wxhtml.py 的 `render()` 后会导致渲染出的 HTML 包含垃圾文本、图片全部丢失。**解决方法**：需要将文件内容传给脚本时，用 Python 内置 `open()` 读取；仅在终端查看文件时使用 `read_file()`。
- **Twitter 图片可能是 PNG 格式**：部分 Twitter 图片 URL 使用 `format=png`，下载后是 PNG。微信支持 PNG，但为统一格式建议 ffmpeg 转 JPG。
- **⚠️ http.server 必须清理**：启动的 http.server 进程在任务结束后必须 kill 掉。否则会变成僵尸进程，监听 0.0.0.0 对公网暴露文件。使用 `subprocess.Popen` 时，务必在 finally 块中 `proc.terminate()`。定期检查残留：`ps aux | grep "http.server" | grep -v grep`
- **⚠️ Jina Reader 会丢失超链接**：`r.jina.ai` 抓取 X Article 时会保留正文文本，但**所有超链接都会被剥离**，只留下链接锚文本（如 "repo:"）或完全没有痕迹。Crawl4AI 对 X/Twitter 同样拿不到链接（无登录态）。**影响**：原文中嵌入的 GitHub 仓库链接、外链引用等全部丢失。**解决方案**：如果原文中给出了 `owner/repo` 格式的仓库名称，可以根据名称手动重建 GitHub 链接（`https://github.com/owner/repo`）。对于 owner 不明确的仓库，用 `gh search repos "name" --json fullName --limit 3` 查找，但注意搜索结果可能不精确，需人工确认。翻译完成后必须检查链接是否完整，发现丢失时要及时补回。

- **⚠️ Jina Reader 会过滤掉所有图片**：`r.jina.ai` 返回的是**纯文本 Markdown**，会**完全忽略页面中的所有图片**（包括封面图、正文配图、截图等）。这是 Jina 的设计特性——它专注于提取文章文字内容，不是完整网页克隆。**影响**：翻译稿中不会有任何图片引用，微信公众号草稿会缺少配图。**解决方案**：
  1. **X/Twitter 文章**：用 `opentwitter` MCP 的 `get_twitter_tweet_by_id` 或 `get_twitter_article_by_id` 获取推文/文章中的媒体 URL（`media` 字段），然后 `curl` 下载到本地 `images/` 目录
  2. **非 X 网页**：用 `browser_navigate` + `browser_get_images` 提取页面所有图片 URL，立即下载到本地；或者从原作者 Twitter 帖子中找配图（如 OpenAI 官方 Developers 账号会配发文）
  3. **SearXNG 图片搜索备选**：本机 SearXNG (`http://149.88.65.19:8560`) 可用，但 `img_src` 字段可能为空（依赖的后端搜索引擎超时），建议优先用 Twitter 配图
  4. **无图时的兜底**：用 ffmpeg 生成文字封面（深色背景 + 标题 + 作者）
  5. **关键原则**：图片必须在第一步就下载到本地 `images/` 目录，翻译稿中用相对路径 `images/NN.jpg` 引用，不要依赖外部 URL
- **广告/推广内容剥离**：X Article 长文后半段常见作者推广自己产品或服务的软广（版本更新、新功能介绍、CTA 购买等）。这类内容与文章主题无关，翻译时应直接剔除，不保留在译文中。判断标准：①内容是否与文章主旨相关 ②是否在推销作者自己的产品/服务 ③读者能否从中获得独立于广告的知识价值。三者都不满足时，整段删除。

- **⚠️ 目录状态与 manifest 同步**：文章移动（drafts ↔ published）时，必须同时更新 manifest.json 中的 `contentPath` 和 `status`，以及 index.md frontmatter 中的 `status`。三者不一致会导致网站显示异常
- **⚠️ coverImage 保持相对路径**：manifest.json 中的 coverImage 必须写 `images/cover.jpg`（相对文章目录），不能写 `articles/<slug>/images/cover.jpg`。网站按 rootPath + contentPath 定位文章目录后，再拼接 coverImage 取封面图。git mv 迁移目录后，相对路径不受影响，绝对路径会断
- **publish_wechat.py 不感知目录状态**：微信草稿发布脚本只关心 HTML 和图片，不关心文章在 drafts 还是 published。文章在 drafts/ 时就可以推微信草稿预览

## 版本历史与调试要点

### v1.1.0 - 目录状态机改造
**变更**：将状态管理从 manifest.json 的 status 字段迁移到目录结构（`articles/drafts/` + `articles/published/`）。
**新流程**：翻译完成 → 写入 drafts/ → 微信草稿预览 → 用户确认 → git mv 到 published/
**原因**：网站前端即将上线，需要区分草稿和正式文章。目录状态比 JSON 字段更直观，git mv 天然有版本记录。
**注意**：manifest.json 保留，status 和 contentPath 必须与目录位置同步。等网站侧排期后再评估去掉 manifest。

### v0.9.1 - 修复正文重复标题
**问题**：正文开头如果有 h1/h2/h3 标题，会与公众号标题重复显示
**原因**：`_render_markdown()` 会渲染所有 Markdown 元素，包括开头的标题
**修复**：添加跳过逻辑，检测并跳过正文第一行的 h1/h2/h3 标题
**调试方法**：生成预览后检查 HTML，确认只有第一个 h2（正文小标题），没有额外的标题

### v0.9.2 - 修复编者按在 API 模式不显示
**问题**：编者按（intro）在模板模式显示，但发布到公众号的 API 模式不显示
**原因**：`render()` 函数在 `body_only=True` 时直接返回 `_render_markdown(body_md)`，忽略了 `intro` 参数
**修复**：
1. 新增 `_build_intro()` 函数，用内联样式渲染编者按（模仿模板样式）
2. 修改 `render()` 函数，在 `body_only=True` 时拼接 `intro_html + body_html`
**调试方法**：分别生成 template 和 body_only 两种模式的 HTML，对比是否都包含「编者按」

### v0.9.3 - 新增 Footer 原作者和翻译整理人
**需求**：文章底部需要显示原作者（动态）和翻译整理人（固定）
**实现**：
1. 修改 `templates/default.html`，添加 footer-meta 区域和 CSS
2. 修改 `_build_footer(author, source_url)`，生成内联样式的 footer HTML
3. 修改 `render()`，在 `body_only=True` 时也拼接 footer
**调试方法**：检查生成的 HTML 是否包含"原作者"、"翻译整理人"、"蓝衣剑客"

### 端到端验证流程
遇到问题时，建议按以下顺序验证：
1. 生成模板模式预览（body_only=False，template="default"）
2. 生成 API 模式正文（body_only=True）
3. 对比两者 HTML 的差异（尤其是 intro 和 footer）
4. 发布到微信草稿，检查公众号后台显示效果
- **v0.9.2 编者按显示修复**：从 v0.9.2 开始，`render()` 函数在 `body_only=True` 模式下也会渲染 intro 参数到正文开头。之前 intro 只在模板模式（`body_only=False`）下显示，导致发布到公众号时编者按丢失。现在两种模式都支持推荐语，样式保持一致（金色主题、分隔线装饰）。渲染时使用 `_build_intro()` 函数生成内联样式的 HTML
