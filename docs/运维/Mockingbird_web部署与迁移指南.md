# Knowledge Web 运维手册（2026-06-05）

这份文档是 `Mockingbird_V2_Knowledge_Website` 当前生产环境的权威运维手册。

目标很简单：

- 不再重复探索服务器拓扑。
- 不再把已经过时的 `systemd + next start` 路径当成当前事实。
- 发布、回滚、排障都按同一套实际流程执行。

## 1. 当前生产拓扑

生产站点当前真实结构：

- 域名：`zgnknowledge.online`
- 服务器 SSH 别名：`mk_website`
- 服务器地址：`149.88.65.19:1501`
- 入口链路：`Cloudflare -> Nginx -> Docker -> Next.js`
- Nginx 反代目标：`127.0.0.1:5046`
- Docker Compose 目录：`/home/grank/apps/infra`
- Compose 文件：`/home/grank/apps/infra/docker-compose.yml`
- Compose 服务名：`mockingbird-knowledge-web`
- 容器名：`mockingbird-knowledge-web`
- 宿主应用目录：`/home/grank/apps/mockingbird-knowledge-web/current`
- 共享目录：`/home/grank/apps/mockingbird-knowledge-web/shared`
- 生产环境文件：`/home/grank/apps/mockingbird-knowledge-web/shared/.env.production`
- 当前镜像名：`infra-mockingbird-knowledge-web`

当前不是 `systemd` 直接启动 `next start`。线上服务运行在 Docker 容器里，必须按 Compose 流程发布。

## 2. 服务器上的关键路径

应用与共享目录：

- `/home/grank/apps/mockingbird-knowledge-web/current`
- `/home/grank/apps/mockingbird-knowledge-web/shared`
- `/home/grank/apps/mockingbird-knowledge-web/backups`

基础设施目录：

- `/home/grank/apps/infra/docker-compose.yml`
- `/home/grank/apps/infra/mockingbird-knowledge-web.Dockerfile`

共享数据与挂载：

- `/home/grank/apps/mockingbird-knowledge-web/shared/.env.production`
- `/home/grank/apps/mockingbird-knowledge-web/current/data`
- `/opt/mockingbird-knowledge-web/media`
- `/home/grank/web-article`：只读挂载，当前文章运行时已不依赖它作为主数据源

容器内关键挂载：

- `/app/shared`
- `/app/data`
- `/opt/mockingbird-knowledge-web/media`

## 3. 运行方式

查看服务状态：

```bash
ssh mk_website
sudo docker ps --format "table {{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}"
```

预期会看到：

- 容器名 `mockingbird-knowledge-web`
- 镜像 `infra-mockingbird-knowledge-web`
- 端口映射 `127.0.0.1:5046->5046/tcp`

查看日志：

```bash
ssh mk_website
sudo docker logs --tail 100 mockingbird-knowledge-web
```

进入容器：

```bash
ssh mk_website
cd /home/grank/apps/infra
sudo docker compose exec mockingbird-knowledge-web bash
```

## 4. 环境变量规范

### 4.1 当前规范

R2 相关配置现在以 `KNOWLEDGE_*` 为唯一规范命名：

```env
KNOWLEDGE_ARTICLE_R2_SOURCES=[{"site":"ai","source":"web-article","bucket":"knowledge-articles","prefix":"ai","manifestPath":"manifest.json","publicBaseUrl":"https://assets.zgnknowledge.online/ai"}]
KNOWLEDGE_R2_PUBLIC_ASSET_HOST=assets.zgnknowledge.online
KNOWLEDGE_R2_ACCOUNT_ID=...
KNOWLEDGE_R2_ACCESS_KEY_ID=...
KNOWLEDGE_R2_SECRET_ACCESS_KEY=...
KNOWLEDGE_PROMPT_MEDIA_R2_BUCKET=knowledge-articles
KNOWLEDGE_PROMPT_MEDIA_R2_PREFIX=prompts/media
KNOWLEDGE_PROMPT_MEDIA_R2_PUBLIC_BASE_URL=https://assets.zgnknowledge.online/prompts/media
```

文章运行时读取：

- `KNOWLEDGE_ARTICLE_R2_SOURCES`
- `KNOWLEDGE_R2_*`

提示词媒体写入读取：

- `KNOWLEDGE_PROMPT_MEDIA_R2_*`
- `KNOWLEDGE_R2_*`

### 4.2 兼容回退

代码目前暂时兼容旧变量名，避免漏改环境时整站直接掉空：

- `ARTICLE_R2_SOURCES`
- `ARTICLE_R2_PUBLIC_HOST`
- `R2_ACCOUNT_ID`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `PROMPT_MEDIA_R2_BUCKET`
- `PROMPT_MEDIA_R2_PREFIX`
- `PROMPT_MEDIA_R2_PUBLIC_BASE_URL`

但运维操作必须只编辑 `KNOWLEDGE_*` 这套。旧键只作为迁移回退，不应继续作为主配置来源。

### 4.3 这次踩过的坑

如果线上出现下面这个组合症状：

- 首页文章数变成 `0`
- `/api/articles` 返回空列表
- 提示词图片还能正常显示

优先检查的不是数据库，而是 R2 文章配置：

1. `KNOWLEDGE_ARTICLE_R2_SOURCES` 是否存在。
2. `KNOWLEDGE_R2_ACCOUNT_ID / ACCESS_KEY_ID / SECRET_ACCESS_KEY` 是否是当前有效值。
3. 不要被“提示词图片能显示”误导。

原因：

- 提示词图片通常直接使用数据库里的公开 URL。
- 文章列表和文章详情依赖先读 R2 `manifest.json` 和 markdown。
- 文章配置错了，文章会全部归零；提示词图片仍可能正常。

## 5. 文章与提示词的运行时数据源

### 5.1 文章

文章当前主数据源是 Cloudflare R2。

关键对象：

- bucket：`knowledge-articles`
- manifest：`ai/manifest.json`
- 正文：`ai/articles/published/{slug}/index.md`
- 图片：`ai/articles/published/{slug}/images/...`
- 公开域名：`https://assets.zgnknowledge.online`

网站会：

- 服务端从 R2 读取 `manifest.json`
- 服务端从 R2 读取 markdown 正文
- 浏览器直接加载 `https://assets.zgnknowledge.online/...` 的图片资源

### 5.2 提示词

提示词主数据源仍然是 MySQL `Prompts` 表。

提示词的图片/视频媒体：

- 最终写入 R2
- 数据库中保存公开 URL
- 不依赖文章 manifest

相关手册：

- `docs/运维/R2文章状态机与发布流程.md`
- `docs/运维/R2提示词媒体迁移与修复.md`：提示词媒体迁移、Seedance 视频回填、批量补库后的页面 revalidate 与缓存排障。

## 6. 标准发布流程

### 6.1 本地发布前检查

在仓库根目录执行：

```bash
npm run lint
npm run build
```

如果改动有明确回归面，补跑相关测试：

```bash
npm test -- tests/unit/...
```

### 6.2 备份远端当前版本

源码备份：

```bash
ssh mk_website '
mkdir -p /home/grank/apps/mockingbird-knowledge-web/backups
ts=$(date +%Y%m%d-%H%M%S)
tar -czf /home/grank/apps/mockingbird-knowledge-web/backups/source-$ts.tar.gz \
  --exclude=node_modules \
  --exclude=.next \
  --exclude=data \
  -C /home/grank/apps/mockingbird-knowledge-web/current .
'
```

环境文件变更前也要单独备份：

```bash
ssh mk_website '
cp /home/grank/apps/mockingbird-knowledge-web/shared/.env.production \
   /home/grank/apps/mockingbird-knowledge-web/shared/.env.production.bak-$(date +%Y%m%d-%H%M%S)
'
```

### 6.3 全量同步代码到 `current`

推荐命令：

```bash
rsync -az --delete \
  -e "ssh -p 1501 -i ~/.ssh/id_server149" \
  --exclude '.git/' \
  --exclude '.DS_Store' \
  --exclude '.next/' \
  --exclude 'node_modules/' \
  --exclude '.env.local' \
  --exclude 'data/' \
  --exclude '.playwright-mcp/' \
  --exclude '.superpowers/' \
  --exclude '_backup/' \
  --exclude 'tsconfig.tsbuildinfo' \
  --exclude 'console-knowledge-handoff/' \
  /Users/grank/Mockingbird_V2/Mockingbird_V2_Knowledge_Website/ \
  mk_website:/home/grank/apps/mockingbird-knowledge-web/current/
```

不要把下面这些部署态内容从本地覆盖上去：

- `.env.local`
- `data/`
- `node_modules/`
- `.next/`

### 6.4 重建并重启容器

```bash
ssh mk_website '
cd /home/grank/apps/infra &&
sudo docker compose build mockingbird-knowledge-web &&
sudo docker compose up -d mockingbird-knowledge-web
'
```

这是当前唯一正确的发版方式。不要再按 `npm run build && systemctl restart ...` 处理这个站点。

## 7. 发布后巡检

### 7.1 容器状态

```bash
ssh mk_website '
sudo docker ps --format "table {{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}" | rg "mockingbird-knowledge-web|NAMES"
'
```

### 7.2 外部站点

```bash
curl -I https://zgnknowledge.online/
curl -I https://zgnknowledge.online/ai/rankings/github
curl -I https://zgnknowledge.online/ai/rankings/skills-hot
```

预期：

- 首页 `200`
- 现存榜单页 `200`
- 已移除的 `skills-hot` 为 `404`

### 7.3 API

```bash
curl -fsS "https://zgnknowledge.online/api/articles" | head
curl -fsS "https://zgnknowledge.online/api/articles?action=top&count=3" | head
curl -fsS "https://zgnknowledge.online/api/prompts?page=1&pageSize=5" | head
```

预期：

- `/api/articles` 非空
- `top` 接口非空
- 提示词接口正常返回

### 7.4 首页摘要

```bash
curl -sS https://zgnknowledge.online/ | rg -o "已收录.*个榜单" -m 1
```

用于快速确认：

- 文章数不是 `0`
- 榜单数是否符合当前公开页面数量

## 8. 环境变量更新流程

生产环境变量编辑位置：

- `/home/grank/apps/mockingbird-knowledge-web/shared/.env.production`

修改步骤：

1. 先备份 `.env.production`
2. 修改 `KNOWLEDGE_*` 规范键
3. 如需平滑兼容，同步更新对应旧键
4. 重建容器
5. 验证 `/api/articles`、首页、目标功能

单纯修改环境变量，不重建容器不会生效。因为当前环境通过 Compose `env_file` 注入，容器必须重建或至少重新创建。

## 9. 故障排查清单

### 9.1 首页文章区空白

先查：

```bash
curl -fsS "https://zgnknowledge.online/api/articles"
```

如果返回：

- `items: []`
- `totalCount: 0`

继续查：

```bash
ssh mk_website '
rg -n "^KNOWLEDGE_ARTICLE_R2_SOURCES=|^KNOWLEDGE_R2_ACCOUNT_ID=|^KNOWLEDGE_R2_ACCESS_KEY_ID=|^KNOWLEDGE_R2_SECRET_ACCESS_KEY=" \
  /home/grank/apps/mockingbird-knowledge-web/shared/.env.production
'
```

然后看容器日志是否有：

- `Unauthorized`
- `R2 credentials are not configured`
- `Failed to collect page data for /ai/articles/[slug]`

### 9.2 镜像构建失败，提示 `Unauthorized`

这通常不是 Docker 问题，是 R2 凭证失效或环境值错误。

重点确认：

- `KNOWLEDGE_R2_ACCOUNT_ID`
- `KNOWLEDGE_R2_ACCESS_KEY_ID`
- `KNOWLEDGE_R2_SECRET_ACCESS_KEY`

### 9.3 提示词图片正常但文章全没了

按“文章 R2 配置异常”处理，不要误判为静态资源故障。

### 9.4 首页榜单数不对

这是代码摘要数字和真实公开榜单页数量不一致。检查：

- `app/ai/AiHomePage.tsx`
- 当前 `app/ai/rankings/*` 实际公开页数量

## 10. 回滚流程

### 10.1 回滚代码版本

先看备份：

```bash
ssh mk_website 'ls -lah /home/grank/apps/mockingbird-knowledge-web/backups'
```

恢复源码：

```bash
ssh mk_website '
rm -rf /home/grank/apps/mockingbird-knowledge-web/current/* &&
tar -xzf /home/grank/apps/mockingbird-knowledge-web/backups/source-时间戳.tar.gz \
  -C /home/grank/apps/mockingbird-knowledge-web/current
'
```

然后重建容器：

```bash
ssh mk_website '
cd /home/grank/apps/infra &&
sudo docker compose build mockingbird-knowledge-web &&
sudo docker compose up -d mockingbird-knowledge-web
'
```

### 10.2 回滚环境变量

```bash
ssh mk_website '
cp /home/grank/apps/mockingbird-knowledge-web/shared/.env.production.bak-时间戳 \
   /home/grank/apps/mockingbird-knowledge-web/shared/.env.production &&
cd /home/grank/apps/infra &&
sudo docker compose up -d --force-recreate mockingbird-knowledge-web
'
```

### 10.3 回滚文章发布状态

文章 manifest 回滚不要改站点代码，按 R2 状态机文档处理：

- `docs/运维/R2文章状态机与发布流程.md`

## 11. 禁止继续沿用的旧认知

以下说法对当前站点都不成立：

- “这是 `systemd` 直接跑的 Next.js 服务”
- “改完代码去服务器里 `npm run build` 然后 `systemctl restart` 就行”
- “文章还是靠本地内容仓库直接读”
- “提示词图片能显示，说明 R2 配置没问题”
- “旧的 `ARTICLE_R2_*` / `R2_*` 是主配置”

当前正确理解是：

- 生产站点通过 Docker Compose 发布
- 文章主数据源是 R2 manifest
- 提示词媒体和文章内容虽然都在 R2，但读取链路不同
- `KNOWLEDGE_*` 才是规范配置
