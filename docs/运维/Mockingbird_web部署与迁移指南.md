# Mockingbird Web 运维手册（2026-06-10）

这份文档是 `zgnknowledge.online` 和 `zgntools.online` 当前生产环境的权威运维手册。

2026-06-10 起，`mockingbird-knowledge-web` 和 `mockingbird-tools-api` 已从 Docker 迁移到宿主机 `systemd`。不要再按 Docker Compose 发布这两个服务。

## 1. 当前生产拓扑

### 1.1 Knowledge Web

- 域名：`zgnknowledge.online`
- SSH 别名：`mk_website`
- 入口链路：`Cloudflare -> Nginx -> systemd -> Next.js`
- Nginx 反代目标：`127.0.0.1:5046`
- systemd 服务：`mockingbird-knowledge-web.service`
- 应用目录：`/home/grank/apps/mockingbird-knowledge-web/current`
- 环境文件：`/home/grank/apps/mockingbird-knowledge-web/shared/.env.production`
- 启动命令：`npm run start -- --hostname 127.0.0.1 --port 5046`

### 1.2 Tools API

- 域名：`zgntools.online`
- SSH 别名：`mk_website`
- 入口链路：`Cloudflare -> Nginx -> systemd -> Node API`
- Nginx 反代目标：`127.0.0.1:43117`
- systemd 服务：`mockingbird-tools-api.service`
- 应用目录：`/home/grank/apps/mockingbird-tools-website/current`
- 环境文件：`/home/grank/apps/mockingbird-tools-website/current/.env`
- 启动命令：`npm run start --workspace @mockingbird/api`

### 1.3 Docker 当前状态

`mockingbird-knowledge-web` 和 `mockingbird-tools-api` 不再由 Docker 运行。

- `/home/grank/apps/infra/docker-compose.yml` 当前不应再声明这两个服务。
- 旧 Docker 容器如果还存在，也应保持 `Exited`，不能占用 `5046` 或 `43117`。
- `searxng` 已停用并从 Compose 中移除。
- `mihomo` 如仍在 Docker 中运行，不属于这两个 Web 服务迁移范围，不要误删。

## 2. 快速状态检查

```bash
ssh mk_website '
systemctl is-active mockingbird-knowledge-web mockingbird-tools-api nginx
systemctl is-enabled mockingbird-knowledge-web mockingbird-tools-api
ss -ltnp | grep -E ":(5046|43117)"
sudo docker ps -a --format "table {{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}"
'
```

预期：

- `mockingbird-knowledge-web`：`active`
- `mockingbird-tools-api`：`active`
- `nginx`：`active`
- `5046` 由宿主机 `next-server` 监听
- `43117` 由宿主机 `node` 监听
- Docker 里不应有正在运行的 `mockingbird-knowledge-web` 或 `mockingbird-tools-api`

## 3. 日志与健康检查

### 3.1 本机健康检查

```bash
ssh mk_website '
curl -fsS http://127.0.0.1:5046/api/health
curl -fsS http://127.0.0.1:43117/health
'
```

### 3.2 外网健康检查

```bash
curl -I https://zgnknowledge.online/
curl -fsS https://zgnknowledge.online/api/health
curl -fsS https://zgntools.online/health
```

### 3.3 查看日志

```bash
ssh mk_website '
sudo journalctl -u mockingbird-knowledge-web -n 120 --no-pager
sudo journalctl -u mockingbird-tools-api -n 120 --no-pager
'
```

实时跟日志：

```bash
ssh mk_website 'sudo journalctl -u mockingbird-knowledge-web -f'
ssh mk_website 'sudo journalctl -u mockingbird-tools-api -f'
```

## 4. Knowledge Web 发布流程

### 4.1 本地检查

在本地仓库执行：

```bash
npm run lint
npm run build
```

如改动涉及明确回归面，补跑相关测试：

```bash
npm test -- tests/unit/...
```

### 4.2 备份远端

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

环境文件变更前单独备份：

```bash
ssh mk_website '
cp /home/grank/apps/mockingbird-knowledge-web/shared/.env.production \
   /home/grank/apps/mockingbird-knowledge-web/shared/.env.production.bak-$(date +%Y%m%d-%H%M%S)
'
```

### 4.3 同步代码

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

### 4.4 宿主机构建并重启

```bash
ssh mk_website '
cd /home/grank/apps/mockingbird-knowledge-web/current &&
npm ci &&
npm run build &&
sudo systemctl restart mockingbird-knowledge-web
'
```

### 4.5 发布后验证

```bash
ssh mk_website '
systemctl is-active mockingbird-knowledge-web
curl -fsS http://127.0.0.1:5046/api/health
sudo journalctl -u mockingbird-knowledge-web -n 80 --no-pager
'

curl -I https://zgnknowledge.online/
curl -fsS "https://zgnknowledge.online/api/articles" | head
curl -fsS "https://zgnknowledge.online/api/prompts?page=1&pageSize=5" | head
```

## 5. Tools API 发布流程

### 5.1 备份远端

```bash
ssh mk_website '
mkdir -p /home/grank/apps/mockingbird-tools-website/backups
ts=$(date +%Y%m%d-%H%M%S)
tar -czf /home/grank/apps/mockingbird-tools-website/backups/source-$ts.tar.gz \
  --exclude=node_modules \
  --exclude=dist \
  -C /home/grank/apps/mockingbird-tools-website/current .
'
```

### 5.2 构建并重启

```bash
ssh mk_website '
cd /home/grank/apps/mockingbird-tools-website/current &&
npm ci &&
npm run build --workspace @mockingbird/api &&
sudo systemctl restart mockingbird-tools-api
'
```

### 5.3 发布后验证

```bash
ssh mk_website '
systemctl is-active mockingbird-tools-api
curl -fsS http://127.0.0.1:43117/health
sudo journalctl -u mockingbird-tools-api -n 80 --no-pager
'

curl -fsS https://zgntools.online/health
```

## 6. systemd 服务

### 6.1 Knowledge Web

服务文件：

```bash
/etc/systemd/system/mockingbird-knowledge-web.service
```

关键配置：

```ini
User=grank
Group=grank
WorkingDirectory=/home/grank/apps/mockingbird-knowledge-web/current
EnvironmentFile=/home/grank/apps/mockingbird-knowledge-web/shared/.env.production
Environment=NODE_ENV=production
Environment=NEXT_TELEMETRY_DISABLED=1
Environment=PORT=5046
ExecStart=/usr/bin/npm run start -- --hostname 127.0.0.1 --port 5046
```

### 6.2 Tools API

服务文件：

```bash
/etc/systemd/system/mockingbird-tools-api.service
```

关键配置：

```ini
User=grank
Group=grank
WorkingDirectory=/home/grank/apps/mockingbird-tools-website/current
EnvironmentFile=/home/grank/apps/mockingbird-tools-website/current/.env
Environment=API_HOST=127.0.0.1
Environment=API_PORT=43117
ExecStart=/usr/bin/npm run start --workspace @mockingbird/api
```

改服务文件后执行：

```bash
ssh mk_website '
sudo systemctl daemon-reload
sudo systemctl restart mockingbird-knowledge-web mockingbird-tools-api
sudo systemctl status mockingbird-knowledge-web mockingbird-tools-api --no-pager -l
'
```

## 7. 环境变量

### 7.1 Knowledge Web

生产环境变量文件：

```bash
/home/grank/apps/mockingbird-knowledge-web/shared/.env.production
```

R2 相关配置以 `KNOWLEDGE_*` 为规范命名：

```env
KNOWLEDGE_ARTICLE_R2_SOURCES=...
KNOWLEDGE_R2_PUBLIC_ASSET_HOST=assets.zgnknowledge.online
KNOWLEDGE_R2_ACCOUNT_ID=...
KNOWLEDGE_R2_ACCESS_KEY_ID=...
KNOWLEDGE_R2_SECRET_ACCESS_KEY=...
KNOWLEDGE_PROMPT_MEDIA_R2_BUCKET=knowledge-articles
KNOWLEDGE_PROMPT_MEDIA_R2_PREFIX=prompts/media
KNOWLEDGE_PROMPT_MEDIA_R2_PUBLIC_BASE_URL=https://assets.zgnknowledge.online/prompts/media
```

修改环境变量后必须重启服务：

```bash
ssh mk_website 'sudo systemctl restart mockingbird-knowledge-web'
```

### 7.2 Tools API

生产环境变量文件：

```bash
/home/grank/apps/mockingbird-tools-website/current/.env
```

修改后必须重启服务：

```bash
ssh mk_website 'sudo systemctl restart mockingbird-tools-api'
```

## 8. 文章与提示词数据源

### 8.1 文章

文章主数据源是 Cloudflare R2。

- bucket：`knowledge-articles`
- manifest：`ai/manifest.json`
- 正文：`ai/articles/published/{slug}/index.md`
- 图片：`ai/articles/published/{slug}/images/...`
- 公开域名：`https://assets.zgnknowledge.online`

### 8.2 提示词

提示词主数据源是 MySQL `Prompts` 表。

提示词图片和视频媒体最终写入 R2，数据库中保存公开 URL。Seedance 等视频模型如果页面只显示静态图，要优先检查数据库里的 `VideoPreviewUrl`、`CardPreviewVideoUrl` 是否有真实视频 URL，而不是只做前端 fallback。

相关手册：

- `docs/运维/R2文章状态机与发布流程.md`
- `docs/运维/R2提示词媒体迁移与修复.md`

## 9. 常见故障排查

### 9.1 网站打不开

按链路从外到内查：

```bash
curl -I https://zgnknowledge.online/
ssh mk_website 'sudo nginx -t && systemctl is-active nginx'
ssh mk_website 'systemctl is-active mockingbird-knowledge-web'
ssh mk_website 'curl -fsS http://127.0.0.1:5046/api/health'
```

如果 Nginx inactive：

```bash
ssh mk_website 'sudo systemctl start nginx'
```

如果应用 inactive：

```bash
ssh mk_website '
sudo systemctl restart mockingbird-knowledge-web
sudo journalctl -u mockingbird-knowledge-web -n 120 --no-pager
'
```

### 9.2 端口被 Docker 占用

```bash
ssh mk_website '
ss -ltnp | grep -E ":(5046|43117)"
sudo docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
'
```

如果看到 Docker 容器占用 `5046` 或 `43117`，先停掉对应旧容器，再启动 systemd：

```bash
ssh mk_website '
sudo docker stop mockingbird-knowledge-web mockingbird-tools-api || true
sudo systemctl restart mockingbird-knowledge-web mockingbird-tools-api
'
```

### 9.3 首页文章区为空

先查 API：

```bash
curl -fsS "https://zgnknowledge.online/api/articles"
```

如果返回空列表，检查 Knowledge Web 环境文件里的 R2 配置：

```bash
ssh mk_website '
rg -n "^KNOWLEDGE_ARTICLE_R2_SOURCES=|^KNOWLEDGE_R2_ACCOUNT_ID=|^KNOWLEDGE_R2_ACCESS_KEY_ID=|^KNOWLEDGE_R2_SECRET_ACCESS_KEY=" \
  /home/grank/apps/mockingbird-knowledge-web/shared/.env.production
'
```

再看日志是否有：

- `Unauthorized`
- `R2 credentials are not configured`
- `Failed to collect page data`

### 9.4 Seedance 视频变静态图

这通常不是单纯前端展示问题。检查顺序：

1. 查数据库对应行的 `VideoPreviewUrl` 和 `CardPreviewVideoUrl`。
2. 确认 URL 后缀和响应类型是真视频，例如 `.mp4` 和 `video/mp4`。
3. 查 R2 是否存在对应视频对象。
4. 如字段为空，使用现有修复脚本审计和回填，不要把图片 URL 写进视频字段。

可从宿主机运行修复脚本：

```bash
ssh mk_website '
cd /home/grank/apps/mockingbird-knowledge-web/current &&
node scripts/prompt-video-repair.mjs audit-missing-x --limit=300 --out=/tmp/seedance-missing-x-audit.json
'
```

先审计输出，再决定是否 `apply`。

## 10. 回滚

### 10.1 Knowledge Web 回滚代码

```bash
ssh mk_website '
rm -rf /home/grank/apps/mockingbird-knowledge-web/current/* &&
tar -xzf /home/grank/apps/mockingbird-knowledge-web/backups/source-时间戳.tar.gz \
  -C /home/grank/apps/mockingbird-knowledge-web/current &&
cd /home/grank/apps/mockingbird-knowledge-web/current &&
npm ci &&
npm run build &&
sudo systemctl restart mockingbird-knowledge-web
'
```

### 10.2 Knowledge Web 回滚环境变量

```bash
ssh mk_website '
cp /home/grank/apps/mockingbird-knowledge-web/shared/.env.production.bak-时间戳 \
   /home/grank/apps/mockingbird-knowledge-web/shared/.env.production &&
sudo systemctl restart mockingbird-knowledge-web
'
```

### 10.3 Tools API 回滚代码

```bash
ssh mk_website '
rm -rf /home/grank/apps/mockingbird-tools-website/current/* &&
tar -xzf /home/grank/apps/mockingbird-tools-website/backups/source-时间戳.tar.gz \
  -C /home/grank/apps/mockingbird-tools-website/current &&
cd /home/grank/apps/mockingbird-tools-website/current &&
npm ci &&
npm run build --workspace @mockingbird/api &&
sudo systemctl restart mockingbird-tools-api
'
```

## 11. 禁止继续沿用的旧操作

以下操作不再适用于 `mockingbird-knowledge-web` 和 `mockingbird-tools-api`：

- 进入 Docker 容器排查这两个服务。
- `docker compose build mockingbird-knowledge-web`
- `docker compose up -d mockingbird-knowledge-web`
- `docker compose build mockingbird-tools-api`
- `docker compose up -d mockingbird-tools-api`
- 把 Docker 容器视为线上真实运行环境。
- 用图片 fallback 掩盖视频字段缺失或错误。

当前正确操作是：

- 代码在宿主机目录构建。
- 服务由 systemd 启停。
- 日志看 `journalctl`。
- 端口必须由宿主机进程监听。
