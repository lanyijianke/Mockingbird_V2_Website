# Knowledge Web 当前部署说明（2026-04-23）

这份文档只描述 `Mockingbird_Web` 当前真实在用的生产部署方式。

旧版文档里关于 `.NET Console`、`MySQL`、`Qdrant`、`Crawler`、`Certbot` 的整套迁移流程，已经不再是现在这套 Knowledge Web 站点的实际部署路径，不应继续作为操作依据。

## 1. 当前生产拓扑

生产站点当前是：

- 域名：`zgnknowledge.online`
- 入口层：`Cloudflare -> Nginx -> Next.js`
- 应用服务：`mockingbird-web.service`
- 应用监听端口：`5046`
- 应用目录：`/home/grank/apps/mockingbird-knowledge-web/current`
- 环境文件：`/home/grank/apps/mockingbird-knowledge-web/shared/.env.production`
- 共享数据目录：`/home/grank/apps/mockingbird-knowledge-web/shared/`

当前站点不是通过 `next dev` 对外提供服务，而是通过 `systemd + next start` 运行。

## 2. 服务器上的关键文件

### 2.1 systemd 服务

服务名：

- `mockingbird-web.service`

当前服务定义要点：

```ini
[Service]
User=grank
WorkingDirectory=/home/grank/apps/mockingbird-knowledge-web/current
EnvironmentFile=/home/grank/apps/mockingbird-knowledge-web/shared/.env.production
ExecStart=/usr/bin/npm run start -- --hostname 0.0.0.0 --port 5046
Restart=always
```

### 2.1.1 文章内容存储

生产环境文章内容存储在 Cloudflare R2，不再依赖服务器本地 Git 内容仓库。

- R2 bucket：`knowledge-articles`
- 文章 manifest：`ai/manifest.json`
- 文章正文：`ai/articles/<slug>/index.md`
- 文章图片：`ai/articles/<slug>/images/...`
- 公开图片域名：`https://assets.zgnknowledge.online`

应用服务端通过 R2 S3 兼容 API 读取 `manifest.json` 和 markdown；浏览器直接从公开图片域名加载封面和正文图片。内容桥接流程上传完 R2 对象后，可以调用文章缓存刷新接口让网站立即读取最新内容。

### 2.2 Nginx 配置

当前站点配置文件：

- `/etc/nginx/sites-available/mockingbird-web`
- `/etc/nginx/sites-enabled/mockingbird-web`

当前规则要点：

- `http://zgnknowledge.online/*` 强制跳转到 `https://zgnknowledge.online/*`
- `http://149.88.65.19/*` 不再直出内容，统一跳转到 `https://zgnknowledge.online/*`
- `https://zgnknowledge.online/*` 反代到 `http://127.0.0.1:5046`
- `https://www.zgnknowledge.online/*` 301 到主域名

### 2.3 SSL 证书

当前 HTTPS 使用的是服务器本地已有证书文件：

- `/etc/nginx/ssl/aigcclub-origin.pem`
- `/etc/nginx/ssl/aigcclub-origin.key`

因此，当前这台机器的实际配置不是“现场跑 certbot 自动签发”，而是直接引用现有证书文件。

## 3. 当前发布方式

### 3.1 本地发布前检查

在本地仓库 `Mockingbird_Web` 目录执行：

```bash
npm run lint
npm run build
bash ../Scripts/test/check-knowledge-web-guards.sh
```

如果要跑测试，使用：

```bash
npm test
```

注意：

- 当前全量测试里如果有与本次改动无关的历史失败，不能直接忽略；要在发布记录里明确写清楚。
- 但发布的最低门槛至少应保证本次变更相关回归、`build`、守卫脚本通过。

### 3.2 生产发布步骤

当前可执行发布流程如下：

1. 在服务器上备份当前目录

```bash
mkdir -p /home/grank/apps/mockingbird-knowledge-web/backups
ts=$(date +%Y%m%d-%H%M%S)
backup=/home/grank/apps/mockingbird-knowledge-web/backups/current-$ts
mkdir -p "$backup"
rsync -a --delete --exclude ".next" --exclude "node_modules" \
  /home/grank/apps/mockingbird-knowledge-web/current/ "$backup"/
```

2. 从本地把代码同步到服务器 `current`

建议同步排除：

- `.git`
- `.next`
- `node_modules`
- `.env.local`
- `data`
- `raw-incoming`

提示词图片/视频现在走临时文件处理并直接上传 R2，不再依赖仓库外的持久媒体目录。不要再把 `current/public/content/prompts/media` 当作媒体工作目录，也不需要额外保留本地运行时媒体目录；发布同步只需继续排除 `.git`、`.next`、`node_modules`、`.env.local`、`data` 和 `raw-incoming`。

示例：

```bash
rsync -azv --delete \
  --exclude '.git' \
  --exclude '.DS_Store' \
  --exclude '.next' \
  --exclude 'node_modules' \
  --exclude '.env.local' \
  --exclude 'data' \
  --exclude 'raw-incoming' \
  /本地/Mockingbird_Web/ \
  服务器:/home/grank/apps/mockingbird-knowledge-web/current/
```

2.5 如果本次还包含文章内容更新，必须单独更新文章仓库

`web-article` 是独立仓库，不会随着 `current/` 的代码 rsync 自动更新。

```bash
cd /home/grank/web-article
git fetch origin
git checkout master
git pull --ff-only origin master
```

3. 在服务器上重新构建

```bash
cd /home/grank/apps/mockingbird-knowledge-web/current
npm run build
```

4. 重启应用服务

```bash
sudo systemctl restart mockingbird-web.service
systemctl is-active mockingbird-web.service
```

5. 如果改动了 Nginx，必须执行：

```bash
sudo nginx -t
sudo systemctl reload nginx
```

## 4. 生产环境变量

当前生产至少依赖这些变量：

- `SITE_URL=https://zgnknowledge.online`
- `SEO_CAN_INDEX=true`
- `ROBOTS_BLOCK_BAIDU=true`
- `ARTICLE_R2_SOURCES=[{"site":"ai","source":"web-article","bucket":"knowledge-articles","prefix":"ai","manifestPath":"manifest.json","publicBaseUrl":"https://assets.zgnknowledge.online/ai"}]`
- `ARTICLE_R2_PUBLIC_HOST=assets.zgnknowledge.online`
- `R2_ACCOUNT_ID=...`
- `R2_ACCESS_KEY_ID=...`
- `R2_SECRET_ACCESS_KEY=...`
- `PROMPT_MEDIA_R2_BUCKET=knowledge-articles`
- `PROMPT_MEDIA_R2_PREFIX=prompts/media`
- `PROMPT_MEDIA_R2_PUBLIC_BASE_URL=https://assets.zgnknowledge.online/prompts/media`

文章内容上传完成后刷新缓存：

```bash
curl -X POST https://zgnknowledge.online/api/articles/cache \
  -H "Authorization: Bearer $KNOWLEDGE_ADMIN_TOKEN"
```

媒体处理依赖这些系统命令：

- `ffmpeg`：视频压缩、首帧封面、卡片预览视频
- `yt-dlp`：从 X/Twitter 等源页下载视频
- `cwebp`：图片转 WebP（Ubuntu 包名 `webp`）

环境文件位置：

- `/home/grank/apps/mockingbird-knowledge-web/shared/.env.production`

修改环境变量后，必须重启 `mockingbird-web.service`。

## 5. 发布后巡检

### 5.1 外部巡检

```bash
curl -I https://zgnknowledge.online/
curl -I http://149.88.65.19/
curl -s https://zgnknowledge.online/robots.txt
curl -s https://zgnknowledge.online/sitemap.xml
curl -i -X POST "https://zgnknowledge.online/api/jobs?action=start"
```

预期：

- 主域名 HTTPS 返回 `200`
- IP 的 HTTP 返回 `301` 到 `https://zgnknowledge.online/`
- `/robots.txt`、`/sitemap.xml` 可访问
- 未带 token 的 `/api/jobs` 返回 `401/403/503` 之一

### 5.2 SEO 巡检脚本

```bash
bash ../Scripts/test/check-knowledge-web-seo-launch-readiness.sh "https://zgnknowledge.online"
```

### 5.3 服务状态巡检

```bash
systemctl status mockingbird-web.service --no-pager -n 50
journalctl -u mockingbird-web.service --no-pager -n 100
```

## 6. 回滚方式

如果发布后有问题，优先按“目录回滚 + 服务重启”处理。

步骤：

1. 找到最近一次备份目录

```bash
ls -la /home/grank/apps/mockingbird-knowledge-web/backups
```

2. 将备份内容恢复回 `current`

```bash
rsync -a --delete --exclude ".next" --exclude "node_modules" \
  /home/grank/apps/mockingbird-knowledge-web/backups/current-时间戳/ \
  /home/grank/apps/mockingbird-knowledge-web/current/
```

3. 重新构建并重启服务

```bash
cd /home/grank/apps/mockingbird-knowledge-web/current
npm run build
sudo systemctl restart mockingbird-web.service
```

4. 如果故障来自 Nginx 配置，恢复备份并 reload Nginx

```bash
sudo cp /etc/nginx/sites-available/mockingbird-web.bak-时间戳 /etc/nginx/sites-available/mockingbird-web
sudo nginx -t
sudo systemctl reload nginx
```

## 7. 不再使用的旧操作方式

以下内容不应再作为这份站点的默认部署指南：

- 以 `Certbot + --nginx` 作为当前唯一 HTTPS 部署方式
- 把 `149.88.65.19:80` 直接反代到站点内容
- 把 `Mockingbird_Web` 和 `.NET Console`、`MySQL`、`Qdrant`、`Crawler` 视为必须同时部署的一套系统
- 用“新服务器先完整迁移整个中台系统”来理解当前 Knowledge Web 发布

当前站点的正确理解是：

- 它是一个独立运行的 Next.js 生产服务
- 发布核心是 `同步代码 -> build -> restart service -> 巡检`
- 对外入口必须收敛到 `https://zgnknowledge.online`
