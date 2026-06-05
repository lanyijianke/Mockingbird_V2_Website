---
name: console-knowledge-handoff
description: 当用户提供 Console 生成的 R2 交接定位符或交接 JSON URL，要求将 Console 长文导入知识库网站，或提及中台长文入知识库、R2 交接、knowledge-imports/console、审阅草稿、人工确认后发布时使用此技能。
---

# Console 知识交接

将 Console 长文交接包导入知识库网站的 R2 文章状态机。此技能仅适用于 Console 生成的交接 JSON，不适用于通用网页抓取或微信发布。

## 接受的输入

当用户提供以下内容时使用此技能：
- `r2://<bucket>/knowledge-imports/console/...json`
- `https://.../knowledge-imports/console/...json`
- 包含相同交接模式的本地 JSON 文件

交接 JSON 必须包含：
- `schemaVersion: 1`
- `source.sourceType`
- `source.sourceContentId`
- `article.content`
- `article.language`

## 工作流程

1. 读取交接 JSON。对于 `r2://bucket/key`，使用本地 S3/R2 兼容凭证。对于 HTTPS，直接获取 URL。
2. 校验必填字段。若 `schemaVersion` 不为 `1` 或文章内容为空，则停止。
3. 若 `article.language` 为 `zh`，保留中文原文，仅做 Markdown 格式规范化。
4. 若 `article.language` 为 `en`，加载 `references/terminology.json`，将标题、摘要和正文翻译为中文。
5. 生成文章元数据：`slug`、中文 `title`、中文 `summary`、`category`、`author`、`originalUrl`、`sourcePlatform`、`type` 和 `tags`。
6. 优先使用 `analysis.categoryHints`、`analysis.qualityScore`、`source.sourceUrl`、`source.sourcePlatform`、`article.authorHandle` 和 `article.authorName` 中的元数据。
7. 处理 `mediaAssets` 中的图片：仅使用 `assetType === "image"`、`processingStatus === "completed"` 且有 `publicUrl` 的资源。
8. 将图片下载到文章目录，命名为 `images/cover.jpg`、`images/01.jpg`、`images/02.jpg`，并将 Markdown 中的链接重写为相对路径。
9. 将文章暂存至 `ai/articles/review/<slug>/index.md`，并上传图片至 `ai/articles/review/<slug>/images/`。
10. 写入 `ai/state/articles/<slug>.json`，状态为 `status: "review"`。
11. 写入 `ai/events/<timestamp>-review-<slug>.json`。
12. 向用户报告审阅草稿，包含标题、slug、分类、摘要、原文 URL 和 R2 审阅路径。
13. 停止并等待用户明确确认后方可发布。
14. 确认后，将文章从 review 提升为 published：移至 `ai/articles/published/<slug>/`，更新状态为 `status: "published"`，更新 `ai/manifest.json`，写入 `ai/manifests/<revision>.json`，写入 `ai/events/<timestamp>-publish-<slug>.json`，调用知识库网站 `POST /api/revalidate/content`，携带管理 token 和 payload `{"type":"article","action":"publish","site":"ai","slug":"<slug>"}`，让统一重验证入口刷新并预热公开静态页面，然后验证 `/api/articles?action=slugs&site=ai`。

## 硬性规则

- 未经用户明确确认，绝不发布。
- 审阅暂存阶段绝不更新 `ai/manifest.json`。
- 绝不使用旧版 GitHub `articles/drafts` 流程处理 Console 交接。
- 绝不重新抓取 Console 内部数据，交接 JSON 即为唯一数据源。
- 若需翻译英文内容，必须使用 `references/terminology.json`。

## 验证清单

完整测试需运行一次中文交接和一次英文交接。

中文交接：
- 确认 `article.language` 为 `zh`。
- 确认暂存的审阅 Markdown 保留了中文正文，未进行翻译或大幅改写。
- 确认图片为 `images/` 下的本地相对路径。
- 确认 `ai/state/articles/<slug>.json` 状态为 `status: "review"`。
- 确认用户确认前 `ai/manifest.json` 未被修改。

英文交接：
- 确认 `article.language` 为 `en`。
- 确认翻译前已加载 `references/terminology.json`。
- 确认暂存的审阅 Markdown 为中文，而非原始英文正文。
- 确认保留的英文术语遵循术语表规则。
- 确认与中文交接相同的审阅状态和 manifest 限制。

发布确认：
- 仅在用户明确确认后，才从 `review` 提升为 `published`。
- 确认发布后 `ai/manifest.json` 包含该 slug。
- 确认 `/api/articles?action=slugs&site=ai` 返回该 slug。

## R2 文章目录结构

```text
ai/
  manifest.json
  manifests/{revision}.json
  state/articles/{slug}.json
  events/{timestamp}-{action}-{slug}.json
  articles/review/{slug}/index.md
  articles/review/{slug}/images/
  articles/published/{slug}/index.md
  articles/published/{slug}/images/
```
