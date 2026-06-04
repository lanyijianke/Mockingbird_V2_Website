---
name: video-article
description: "将视频/播客的字幕或转录文本整理成文章，翻译（如需）、排版后发布到微信公众号。当用户给了一个 YouTube/B站/播客链接并要求做成文章、写稿、发公众号、转录整理、翻译这个视频时，都应使用此技能。"
---

# Video-Article — 视频/播客转文章工作流

将视频/播客的字幕或转录文本整理成中文文章，校对排版后推送到微信公众号草稿，同时备份到 GitHub 仓库。

**版本**: 1.1.0（新增视频封面提取 + 截帧插图）
**作者**: Hermes Agent + grank
**平台**: macOS, Linux
**前置条件**: yt-dlp, youtube-transcript-api, gh CLI, ffmpeg；微信发布需 `WECHAT_MP_APP_ID` / `WECHAT_MP_APP_SECRET` 环境变量

## 触发条件

用户给一个视频/播客链接，并希望得到中文文章。链接格式：
- `https://youtube.com/watch?v=...`
- `https://youtu.be/...`
- `https://x.com/i/status/...` 或 `https://twitter.com/.../status/...`（X/Twitter 视频）
- B站、播客链接等

不限于明确说"写文章"——只要用户给了视频/播客链接并表达了"整理一下"、"做成文章"、"发公众号"等意图，就应触发。

## 文件结构

```
~/.hermes/skills/video-article/
  SKILL.md
  scripts/
    fetch_transcript.py      # 字幕提取 / 音视频下载 / 封面提取
    transcript_cleaner.py    # 字幕文本清洗
    extract_frames.py        # 视频截帧 + AI 选帧 + 上传微信图床
  templates/                 # （复用 web-article 的模板）
  references/                # （复用 web-article 的术语库）
```

**渲染、发布脚本和术语库直接复用 web-article：**

```python
import os, sys
T2A_DIR = os.path.expanduser("~/.hermes/skills/web-article")
V2A_DIR = os.path.expanduser("~/.hermes/skills/video-article")
sys.path.insert(0, T2A_DIR)
sys.path.insert(0, V2A_DIR)

from scripts.render_wxhtml import render          # 来自 web-article
from scripts.publish_wechat import WeChatPublisher  # 来自 web-article
from scripts.transcript_cleaner import clean_transcript  # 来自 video-article
from scripts.fetch_transcript import fetch_youtube_transcript, download_media, detect_platform  # 来自 video-article
```

## 工作流

### 第一步：识别平台与提取字幕

1. **检测平台**：用 `detect_platform(url)` 判断来源（YouTube / B站 / 播客 / 未知）
2. **尝试提取字幕**：

**YouTube（主要平台）：**
```python
from scripts.fetch_transcript import fetch_youtube_transcript

result = fetch_youtube_transcript(url, language='en', timestamps=False)
if 'error' in result:
    # 无字幕，走下载 → 手动转录流程
    pass
else:
    transcript = result['transcript']
    metadata = result['metadata']
```

- 优先尝试英文字幕， fallback 到任何可用语言
- 通过 yt-dlp 获取视频标题等元信息

**B站 / 其他平台：**
- 尝试 Jina Reader 抓取页面内容（有时页面包含字幕文本）
- 如果抓不到，走下载流程

**X/Twitter 视频：**
- X 平台没有字幕 API，只能通过 yt-dlp 下载视频后走手动转录流程
- yt-dlp 支持 X/Twitter 链接：`yt-dlp -o '/tmp/video-article/output.%(ext)s' 'https://x.com/user/status/...'`
- 注意：X 视频下载较慢（HLS 流，约 150-200 KiB/s），31 分钟视频约 15-50MB
- 下载后提示用户上传飞书妙记转录

**无字幕时：**
```python
from scripts.fetch_transcript import download_media

result = download_media(url, output_dir='/tmp/video-article')
# result['file_path'] 是下载的音频文件路径
```

⚠️ **无字幕时必须暂停并告知用户**：
- 告诉用户文件已下载到 `/tmp/video-article/` 下的具体路径
- 请用户手动上传到飞书妙记进行转录
- 用户完成转写后，提供飞书妙记链接或 minute_token，继续后续步骤
- 获取飞书妙记逐字稿用 `lark-cli vc +notes --minute-tokens <token>`

### 第二步：提取视频封面 + 下载视频

**提取封面图**（YouTube 专用，其他平台跳过）：
```bash
# 提取 YouTube 缩略图（yt-dlp 自动获取最高清封面）
yt-dlp --skip-download --write-thumbnail -o '/tmp/video-article/cover.%(ext)s' 'VIDEO_URL'
```

封面图用途：
1. 微信公众号文章封面（优先使用）
2. 文章正文顶部引导图（可选）

⚠️ 封面图必须上传到微信图床才能在公众号正文中使用。上传方法见第十步。

### 第三步：字幕清洗

```python
from scripts.transcript_cleaner import clean_transcript

result = clean_transcript(raw_transcript)
cleaned_text = result['cleaned_text']
stats = result['stats']
```

清洗内容：
- 去除时间戳（`01:23:45`、`[01:23]`、ISO 格式等）
- 去除说话人标签（`Speaker 1:`、`[John]:` 等）
- 去除语气词和填充词（嗯、啊、那个、um、uh 等）
- 合并碎片句子（自动字幕常见问题）
- 修正断句错误
- 去除多余空白

**注意**：清洗后的文本要人工检查质量，特别是自动生成的字幕错误较多时。可以先把清洗后的文本展示给用户确认再继续。

### 第四步：判断语言，决定是否翻译
检查文本语言：
- **中文内容**：直接进入第五步（整理写稿）
- **英文内容**：翻译成中文，翻译规则同 web-article

**翻译规则**（英文内容时）：
- **必须加载术语库**：`skill_view(name='web-article', file_path='references/terminology.json')`
- 信达雅原则，符合中文阅读习惯
- 术语按术语库处理
- 人名/品牌名保留原文
- 中英混排间距：英文/术语前后各空半角空格
- 列表格式避免使用 `-` 或 `*` 标记，用段落或换行替代

**字幕特殊翻译注意**：
- 口语化的句子要整理成书面语，但保留演讲者的个人风格
- 如果是访谈，尽量区分不同说话人（如果原文有说话人信息的话）
- 删除重复的口头表达（"就是就是"、"对对对"等）

### 第五步：整理写稿

整理原则：
- **不改变原意**：整理是为了可读性，不是改写
- **添加结构**：根据内容自然分段，添加小标题（h2/h3）
- **生成文章标题**：从内容中提炼，简洁有力
- **生成编者推荐语**：说明内容价值，2-3 句话
- **演讲/访谈特殊处理**：
  - 演讲：按主题分段，添加小标题
  - 访谈：区分问答，用引用格式标示提问
  - 教程：保留步骤结构

```python
intro = "这是一篇来自 [来源] 的 [类型]，[主要内容和价值]..."
```

### 第六步：截帧插图（可选但推荐）

在文章定稿后，从视频中提取关键帧作为文章插图，提升阅读体验。

**执行流程：**

1. **下载视频**（如果第一步没有下载）：
```python
from scripts.fetch_transcript import download_media
result = download_media(url, output_dir='/tmp/video-article', media_type='video')
video_path = result['file_path']
```

2. **截帧提取**：推荐逐帧提取（不会超时），每 5 分钟一张：

```python
import subprocess, os

frames_dir = "/tmp/video-article/frames"
video_path = "/tmp/video-article/video.mp4.webm"  # 注意：可能是 webm 格式

# 计算时间戳（每5分钟，从30秒开始）
durations = [30] + [i * 300 for i in range(1, duration_seconds // 300)]

for t in durations:
    out = os.path.join(frames_dir, f"fm_{t}.jpg")
    cmd = f'ffmpeg -ss {t} -i "{video_path}" -frames:v 1 -q:v 3 -update 1 "{out}" -y'
    subprocess.run(cmd, shell=True, timeout=60)
```

**关键参数**：
- `-ss <seconds>`：跳到指定时间点（放在 `-i` 前面更快）
- `-frames:v 1`：只提取 1 帧
- `-update 1`：**必须加！** 没有 `-update 1` 时 ffmpeg 不会正确写入单帧文件（需要 `%03d` 模式）
- `-q:v 3`：高质量 JPEG（2-5 都行）

⚠️ **不要用 `fps=1/N` 批量提取**：长视频（>20分钟）会超时。用 `-ss` + `-frames:v 1` 逐帧提取更安全。

3. **AI 筛选最佳帧**：用 vision_analyze 分析每帧，选出最有代表性的 3-5 张
```
对每张截图用 vision_analyze 评估：
- 画面清晰度（是否模糊、黑屏）
- 内容相关性（是否有文字、图表、演讲者特写等）
- 构图质量
- 是否适合作为文章插图
```

**Vision API 不可用时（429 错误）的降级策略**：
- 直接用全部截帧（每 5 分钟一张，通常 6-10 张），均匀分布到文章各段落之间
- 不做质量筛选，技术演讲的 PPT 画面本身就有价值
- 每个一级标题/段落之间插一张即可

4. **确定插图位置**：根据文章结构和每张图的画面内容，决定插图放在哪个段落后面。原则：
   - 每张图应该和它前后的段落内容相关
   - 图与图之间至少间隔 800 字
   - 图太多会打断阅读节奏，3-5 张为宜
   - 如果是演讲/教程，图表、幻灯片截图优先保留

5. **记录插图清单**：
```
/tmp/video-article/frames/selected.json
[
  {"file": "frame_0012.jpg", "position": "after_section_2", "caption": "演讲者在解释共识机制", "score": 9},
  {"file": "frame_0025.jpg", "position": "after_section_5", "caption": "区块链架构图", "score": 8}
]
```

⚠️ **跳过条件**：视频是纯语音（播客）、用户说"不要插图"、"快点"。

### 第七步：Maker-Checker 审校

与 web-article 相同的审校流程：

1. 将原文和译文（如有）按章节拆分为 2 段，保存为临时文件
2. 用 `delegate_task` 并行启动 2 个子 Agent 审校
3. 汇总审校报告，展示给用户确认
4. 按报告修改

**审校重点**（相比 web-article 有额外关注点）：
- 自动字幕的识别错误是否已修正
- 口语化的表达是否已适当书面化
- 篇章结构是否合理
- 不同说话人是否区分清楚

**跳过条件**：用户说"不用审校""直接发""快点"。

### 第八步：排版

复用 web-article 的 `render_wxhtml.py`：

```python
from scripts.render_wxhtml import render

# 生成预览（模板模式）
preview_html = render(
    title="文章标题",
    author="@author",
    date="2026-04-18",
    source_url="https://youtube.com/watch?v=...",
    body_md=article_markdown,
    intro=intro,
    body_only=False,
    template="default",
)

# 生成发布内容（API 模式）
body_html = render(
    title="文章标题",
    author="@author",
    date="2026-04-18",
    source_url="https://youtube.com/watch?v=...",
    body_md=article_markdown,
    intro=intro,
    body_only=True,
)
```

**双渲染模式**：
- `body_only=True`：内联样式 HTML（公众号 API）
- `body_only=False`：模板模式（本地预览）

### 第九步：上传图片到微信图床 + 生成预览

微信公众号正文中不能直接引用本地图片，必须先上传到微信素材库（图床）获取微信 URL。

**需要上传的图片：**
1. 封面图（`/tmp/video-article/cover.*`）→ 用于文章封面和正文顶部
2. 截帧插图（`/tmp/video-article/frames/frame_*.jpg`）→ 用于正文中段

**上传方法**：用 `publish_wechat.py` 的底层方法：

```python
import sys, os

# execute_code 不继承环境变量，需先在主终端写入临时文件
with open('/tmp/wx_app_id.txt', 'r') as f:
    os.environ['WECHAT_MP_APP_ID'] = f.read().strip()
with open('/tmp/wx_app_secret.txt', 'r') as f:
    os.environ['WECHAT_MP_APP_SECRET'] = f.read().strip()

sys.path.insert(0, os.path.expanduser("~/.hermes/skills/web-article"))
from scripts.publish_wechat import WeChatPublisher

pub = WeChatPublisher()

# 上传正文图片（uploadimg 端点）→ 返回微信 URL，可直接用在 HTML <img src> 中
frame_url = pub._upload_image('/tmp/video-article/frames/fm_600.jpg')
# 返回: "http://mmbiz.qpic.cn/mmbiz_jpg/.../0?from=appmsg"

# 上传封面为永久素材（add_material 端点）→ 返回 media_id，用于 draft 的 thumb_media_id
thumb_media_id = pub._upload_permanent_image('/tmp/video-article/cover.jpg')
# 返回: "yXJJ-N2kFAm4_LM_BxejxA98zNasbZKCaNQYt1a43qBCYhsQchvqQ_Ke3j_G7b85"
```

**两种上传端点的区别**：
- `_upload_image()`：uploadimg 端点，返回微信图片 URL（可在正文 HTML 中直接引用）
- `_upload_permanent_image()`：add_material 端点，返回 media_id（用于草稿的封面 thumb_media_id）

**将图片 URL 插入 body_only.html**：

截帧上传到微信后，直接在 HTML 中插入 `<img>` 标签：

```python
# 在 HTML 的对应段落位置插入图片
img_html = f'''<div style="margin:24px 0;text-align:center;">
<img src="{frame_url}" style="max-width:100%;border-radius:6px;" />
</div>'''

body_html = body_html.replace(
    '段尾文字。</p>',
    '段尾文字。</p>' + img_html,
    1  # 只替换第一个匹配
)
```

**用替换后的 HTML 重新渲染**（body_only=False 用于本地预览）。
然后用浏览器截图展示给用户确认。

⚠️ 注意：`_upload_image()` 和 `_upload_permanent_image()` 是内部方法（下划线前缀），没有 `upload_image()` 或 `get_image_url()` 这样的公开方法。

然后生成预览文件，用浏览器截图展示给用户：

```python
preview_html = render(..., intro=intro, body_only=False)
with open('/tmp/video-article/preview.html', 'w', encoding='utf-8') as f:
    f.write(preview_html)
```

```python
# 浏览器预览
browser_navigate('file:///tmp/video-article/preview.html')
browser_vision(question='排版效果如何，有无明显格式问题？')
```

注意：vision_analyze 可能 429 不可用，此时截图仍可生成但无法 AI 分析，告知用户自行查看即可。

等待反馈：
- 用户说"发"/"OK"/"确认" → 执行第十步
- 用户提出修改意见 → 修改后重新排版
- 用户说"不要了"/"取消" → 终止流程

### 第十步：备份到 GitHub 仓库

仓库：`lanyijianke/web-article`（与 web-article 共用，本地路径 `~/web-article`）

文件路径：`articles/<slug>/index.md`，slug 从标题生成（英文，用 - 连接）。
图片保存到 `articles/<slug>/images/`，封面图 `cover.jpg`，正文图 `01.jpg`、`02.jpg`... 按出现顺序编号。

```markdown
---
id: "<slug>"
slug: "<slug>"
title: "文章标题"
summary: "60-140字中文摘要"
category: "ai-tech"   # ai-tech / ai-application / ai-business / ai-opinion
author: "频道名/@author"
original_url: "https://youtube.com/watch?v=..."
source_platform: "youtube"
type: "video"
cover_image: "images/cover.jpg"
published_at: "YYYY-MM-DDTHH:MM:SS+08:00"
updated_at: "YYYY-MM-DDTHH:MM:SS+08:00"
translated_at: "YYYY-MM-DDTHH:MM:SS+08:00"
status: draft
tags: []
---

正文内容...
```

### 第十一步：推送到微信公众号草稿

复用 web-article 的 `publish_wechat.py`。有两种情况：

**情况 A：正文中已有图片（推荐）**

```python
from scripts.publish_wechat import WeChatPublisher
pub = WeChatPublisher()
result = pub.publish(
    title="文章标题",
    author="频道名/@author",
    body_html=body_html,           # 含 <img src="微信URL"> 的 HTML
    cover_url=cover_wx_url,        # 封面图的微信 URL（可选）
    source_url="https://youtube.com/watch?v=...",
)
```

**情况 B：正文无图片但需要封面**

当正文中没有 `<img>` 标签时，`publish()` 会报错。需要绕过 `publish()` 直接调用底层方法：

```python
pub = WeChatPublisher()

# 1. 上传封面图为永久素材
thumb_media_id = pub._upload_permanent_image('/tmp/video-article/cover.jpg')

# 2. 直接创建草稿
draft_media_id = pub._create_draft(
    title="文章标题",
    author="频道名/@author",
    content=body_html,
    thumb_media_id=thumb_media_id,
    content_source_url="https://youtube.com/watch?v=...",
    digest="文章摘要，最多128字",
)
```

**更新已发布的草稿（如追加图片）**：
- 微信 API 不支持修改已有草稿，只能创建新草稿
- 封面的 `thumb_media_id` 可复用（上传一次即可）
- 旧草稿仍留在草稿箱中，发布时选新的即可
- 新草稿的正文图片（`_upload_image()` 返回的 URL）也会保留，不会过期

**前置条件**：`WECHAT_MP_APP_ID` 和 `WECHAT_MP_APP_SECRET` 环境变量。

**execute_code 不继承环境变量**，需先在主终端写入临时文件：
```bash
echo "$WECHAT_MP_APP_ID" | tr -d '\n' > /tmp/wx_app_id.txt
echo "$WECHAT_MP_APP_SECRET" | tr -d '\n' > /tmp/wx_app_secret.txt
```

### 第十二步：反馈

向用户报告完成状态：
- GitHub 备份：仓库链接 + 文件路径
- 公众号草稿：已推送，请到后台审核发布
- 本地预览文件路径
- 跳过的步骤（如有）

## 飞书妙记集成（无字幕时）

当视频没有字幕时，走以下流程：

1. 下载音视频到 `/tmp/video-article/`（用 yt-dlp，优先下载音频 MP3）
2. 告知用户文件路径，请用户手动上传到飞书妙记
3. 用户转写完成后，提供飞书妙记链接（格式：`https://*.feishu.cn/minutes/<minute_token>`）
4. 从链接提取 `minute_token`
5. 用飞书 CLI 获取逐字稿：
   ```bash
   lark-cli vc +notes --minute-tokens <minute_token>
   ```
6. 从返回结果中提取逐字稿文本
7. 继续第三步（字幕清洗）

## 批量处理

如果用户一次给多个链接，逐个处理，每个都走完整工作流。

## Pitfalls

- **视频封面提取**：yt-dlp 的 `--write-thumbnail` 对 YouTube 有效，B站/其他平台可能需要从页面 HTML 中解析 og:image 标签
- **截帧数量控制**：短视频（<5分钟）提取 5-10 帧即可，长视频（>30分钟）提取 20-30 帧。截太多帧 AI 筛选耗时
- **ffmpeg 截帧参数**：`fps=1/N` 中 N 应根据视频总时长调整，确保提取 20-30 帧。公式：N = 视频秒数 / 目标帧数
- **微信图片上传限制**：单张图片不超过 10MB，格式支持 jpg/png。截帧前已 scale 到 1280px 宽度，一般不会超限
- **截图帧黑屏/模糊**：部分视频有片头黑屏、转场效果等，AI 筛选时必须排除这些帧
- **YouTube 字幕可能不完整**：自动生成的字幕有时不包含视频的全部内容（如访谈环节可能缺失）。提取后应检查字幕是否覆盖了视频的完整时长。如果发现缺失，走下载→飞书妙记转录流程
- **translate 阶段必须保存分段文件**：翻译时将原文分段保存为 `/tmp/video-article/part-{n}-orig.txt` 和 `part-{n}-zh.txt`，便于后续 Maker-Checker 审校引用
- **delegate_task 批量模式忽略 goal**：当提供 `tasks` 数组时，`goal` 参数会被忽略。如果需要并行翻译 3 段，必须全部放入 `tasks` 数组（上限 3 个）。不能用 `goal` 翻译一段 + `tasks` 翻译另外两段，否则 `goal` 那段会被丢弃
- **delegate_task 并行翻译**：可按 8000-13000 字符左右分段，用 delegate_task 的 tasks 数组并行翻译（最多 3 段）。每个子 Agent 的 prompt 必须自包含（文件路径、术语规则、格式要求）。子 Agent 可能需要 5-6 分钟完成 13K 字符的翻译
- **execute_code 找不到 .local pip 包**：youtube-transcript-api 通过 `pip install --break-system-packages` 装在 `~/.local/lib/python3.12/site-packages/`，但 execute_code 的 Python 不自动搜索此路径。解决：在 execute_code 开头加 `sys.path.insert(0, os.path.expanduser("~/.local/lib/python3.12/site-packages"))`
- **YouTube 反爬**：频繁请求可能触发限制，控制请求频率
- **自动字幕质量差**：清洗后仍可能有错误，建议展示给用户确认
- **yt-dlp 下载超时**：大文件可能超时，已设置 10 分钟上限
- **X/Twitter 视频下载慢**：X 的 HLS 流下载速度约 150-200 KiB/s，30 分钟视频约需 2-3 分钟下载，文件大小 15-50MB
- **X/Twitter 无字幕**：X 平台不提供字幕 API，只能下载后走飞书妙记转录流程
- **X/Twitter 链接可能包含转发**：用户提供 `x.com/i/status/...` 链接时，可能是转发视频。用 opentwitter 的 `get_twitter_tweet_by_id` 查找原始推文 ID 和视频信息
- **execute_code 不继承环境变量**：微信发布需先写临时文件
- **read_file 带行号前缀**：读凭证文件用 `terminal("cat file")` 而非 read_file
- **渲染脚本 sys.path**：必须同时加入 web-article 和 video-article 的目录
- **http.server 清理**：如果生成封面图用了 http.server，任务结束必须 kill
- **微信 IP 白名单**：首次发布前确认服务器 IP 已加白
- **transcript_cleaner.py 输出单行文本**：清洗后的字幕可能是没有换行的单个长字符串，导致 read_file 只能显示截断的一行。解决：用 `terminal("head -c 5000 file")` 和 `terminal("tail -c 5000 file")` 来分段查看，或用 execute_code 中间加分段写文件
- **ffmpeg 单帧提取必须加 `-update 1`**：用 `-ss <t> -frames:v 1` 提取单帧时，不加 `-update 1` 会导致输出为 0 字节或报错（ffmpeg 认为输出应该是图片序列）。正确写法：`ffmpeg -ss <t> -i <video> -frames:v 1 -q:v 3 -update 1 <output.jpg> -y`
- **ffmpeg 批量截帧可能超时**：`ffmpeg -vf "fps=1/120"` 一次提取所有帧，对长视频可能超时。更稳妥的方式是用 `-ss <offset> -frames:v 1 -update 1` 逐帧提取，虽然多几次调用但不会卡死
- **publish_wechat.py 内部方法**：`_upload_image()` 用于正文图片（返回 URL）、`_upload_permanent_image()` 用于封面素材（返回 media_id）。不存在 `upload_image()` 或 `get_image_url()` 这样的公开方法。注意下划线前缀
- **publish() 要求正文中至少有图片**：当 body_html 中无 `<img>` 且未提供 cover_url 时，`publish()` 会抛 ValueError。正文中无图但有本地封面时，必须绕过 `publish()` 直接调 `_upload_permanent_image()` + `_create_draft()`
- **微信草稿不可更新**：已创建的草稿无法通过 API 修改内容，只能创建新草稿。追加图片时需重新创建，旧草稿会留在草稿箱中
- **Vision API 可能不可用**：GLM-5V-Turbo 需要特定订阅计划，可能返回 429 错误。遇到此情况应跳过 AI 截帧筛选（Step 6）和 Maker-Checker 视觉审查，直接用封面图作为唯一配图，并在反馈中告知用户跳过了哪些步骤。截帧时改用均匀分布策略（每5分钟一张，不做质量筛选）
- **yt-dlp 视频下载格式**：YouTube 视频可能下载为 .webm 格式而非 .mp4，ffmpeg 处理不受影响，但文件名需注意（如 `video.mp4.webm`）
- **cover.jpg 需从 webp 转换**：yt-dlp `--write-thumbnail` 提取的封面可能是 .webp 格式，微信素材库不支持 webp，必须转换为 jpg/png：`ffmpeg -i cover.webp cover.jpg`
- **飞书妙记 CLI 获取逐字稿**：`lark-cli vc +notes --minute-tokens <token>`，需要 `vc:note:read` 和 `minutes:minutes:readonly` 权限（已授权）
- **飞书妙记无上传 API**：无法通过 API 上传音视频创建妙记，只能查询已有的
