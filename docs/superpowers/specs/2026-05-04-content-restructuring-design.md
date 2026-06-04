# 知更鸟内容架构重构设计

> 日期：2026-05-04
> 状态：历史方案，学社入口与备案展示已不再适用于当前知识库项目

## 目标

将现有的单一站点重构为**门户式品牌首页 + 独立子站**的架构，实现内容领域的清晰划分和品牌气质的独立呈现。

## 设计原则

- **品牌首页立气质**：首页不再是内容列表，而是品牌宣言页
- **AI 子站保体验**：AI 子站功能完全保留，用户感受不变
- **金融子站轻起步**：只做文章，其余功能后续规划
- **学社入口不再纳入当前知识库项目**：当前项目聚焦知识库本体

## 架构总览

```
/                        → 品牌宣言页（新首页）
/ai/*                    → AI 知识库子站
/finance/*               → 金融知识库子站（轻量）
/login, /register, ...   → 认证页面（不变）
/api/*                   → API 路由
```

## 一、品牌宣言页（`/`）

### 定位
用户第一眼看到的页面，不是内容列表，而是气质页。像杂志封面，不是目录。

### 页面结构（从上到下）

1. **品牌区** — 全屏或大半屏视觉冲击区
   - "知更鸟" 品牌名 + Slogan（如"帮你在信息洪流中发掘真正有价值的东西"）
   - 1-2 句品牌描述
   - 深色系背景 + 微妙动态效果（渐变流动或粒子感），配合现有玻璃拟态风格

2. **双入口区** — 两个等大入口卡片，并排排列
   - 左：AI 知识库 — 图标 + 标题 + 一句话描述 + "进入"按钮
   - 右：金融知识库 — 图标 + 标题 + 一句话描述 + "进入"按钮
   - 悬停效果：卡片微放大或边框发光

3. **页脚** — 品牌信息

### 导航栏
简化为：`[知更鸟] [登录/注册]`
内容导航属于各子站，品牌首页不需要。

### 设计风格
保持深色主题 + 玻璃拟态，但比现有首页更留白。不需要信息密度，需要气质。

## 二、AI 子站（`/ai/*`）

### 定位
现有站点的完整搬迁，路由加 `/ai` 前缀，功能不变。

### 路由映射

| 现有路由 | 新路由 |
|---------|--------|
| `/` | `/ai` |
| `/ai/articles` | `/ai/articles`（不变） |
| `/ai/articles/[slug]` | `/ai/articles/[slug]`（不变） |
| `/ai/articles/categories/[cat]` | `/ai/articles/categories/[cat]`（不变） |
| `/prompts` | `/ai/prompts` |
| `/prompts/[id]` | `/ai/prompts/[id]` |
| `/prompts/categories/[cat]` | `/ai/prompts/categories/[cat]` |
| `/rankings/github` | `/ai/rankings/github` |
| `/rankings/producthunt` | `/ai/rankings/producthunt` |
| `/rankings/skills-trending` | `/ai/rankings/skills-trending` |
| `/rankings/skills-hot` | `/ai/rankings/skills-hot` |

### 导航栏
`[知更鸟(→/)] [ AI文章 ] [ 提示词 ] [ 热榜▼ ] [ 登录/注册 ]`

品牌名点击回到品牌首页 `/`，而非 `/ai`。

### AI 子站首页（`/ai`）
现有首页内容原样保留：三栏编辑式布局、分类展示、提示词画廊。仅 URL 从 `/` 变为 `/ai`。

### 关键原则
对 AI 子站用户来说，体验跟现在完全一样，不因架构调整丢失任何功能。

## 三、金融子站（`/finance/*`）

### 定位
与 AI 子站结构镜像但轻量，当前只包含文章模块。提示词、热榜等功能后续按需规划。

### 路由结构

| 路由 | 说明 |
|------|------|
| `/finance` | 金融子站首页（文章展示） |
| `/finance/articles` | 金融文章列表 |
| `/finance/articles/[slug]` | 文章详情 |
| `/finance/articles/categories/[cat]` | 分类页 |

### 导航栏
`[知更鸟(→/)] [ 金融文章 ] [ 学社 ] [ 登录/注册 ]`

### 金融子站首页（`/finance`）
- 结构与 AI 子站首页一致（三栏布局 + 分类）
- 内容区域显示优雅的空状态（插图 + "我们正在为你发掘金融领域的好内容，敬请期待"）
- 非粗暴空白，是设计好的空状态页面

### 关键原则
空壳不敷衍。页面结构完整，空状态美观。将来填内容只需往数据源加东西，不用改代码。

## 四、学社 & 认证页面

- **学社（`/academy/*`）**：保持不变
- **认证页面（`/login`、`/register`、`/forgot-password`、`/reset-password`、`/verify-email`）**：保持在根路由下，不属于任何子站
- **用户页面（`/profile`、`/membership`）**：保持在根路由下

## 五、技术实现要点

### 目录结构
- 品牌 `/` 页面：`app/page.tsx`（全新）
- AI 子站：`app/ai/` 目录 + `app/ai/layout.tsx`
- 金融子站：`app/finance/` 目录 + `app/finance/layout.tsx`
- 现有 `/prompts`、`/rankings` 迁移到 `/ai/prompts`、`/ai/rankings`

### API 调整
- 文章相关 API 已支持 `site` 参数（`article-service` 现有能力）
- 提示词、热榜 API 在 AI 子站路由下调用

### Middleware
- `middleware.ts` 路由保护规则需调整，适配新路由结构
- `/profile`、`/membership` 保持认证保护

### 数据源配置
- `ARTICLE_LOCAL_SOURCES` 环境变量已支持多站点（现有 `site: 'ai' | 'finance'` 配置）
- 金融站点只需添加对应的 `rootPath` 和内容目录

### SEO
- 各子站有独立的 metadata 和 JSON-LD
- 品牌首页的 SEO 聚焦品牌词而非内容关键词
- 子站间通过内部链接互相引流

### 扩展性
- 新增子站（如科技、商业）只需复制金融子站的模式
- 每个 `app/<site>/` 目录是独立单元，互不影响
