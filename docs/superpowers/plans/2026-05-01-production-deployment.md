# 知更鸟知识库 SQLite→MySQL 升级发布计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将线上 zgnknowledge.online 从 SQLite 版本升级到 MySQL 版本，数据库迁移 + 代码发布。

**Architecture:** 在服务器上创建 MySQL 数据库和用户 → 更新 .env.production → rsync 同步新代码 → 备份旧代码 → build（自动建表）→ 重启 systemd 服务 → 验证。

**Tech Stack:** Next.js 16 + MySQL 8.0 + systemd + Nginx + rsync

---

## 服务器环境

| 项目 | 值 |
|------|------|
| IP / 端口 | 149.88.65.19 : 1501 |
| 用户 | grank |
| SSH 命令 | `ssh -p 1501 -i ~/.ssh/id_server149 grank@149.88.65.19` |
| systemd 服务 | `mockingbird-web.service`（active，当前运行 SQLite 版本） |
| 应用目录 | `/home/grank/apps/mockingbird-knowledge-web/current` |
| 环境变量文件 | `/home/grank/apps/mockingbird-knowledge-web/shared/.env.production` |
| 当前数据库 | SQLite（`/home/grank/apps/mockingbird-knowledge-web/shared/data/knowledge.db`） |
| 域名 | zgnknowledge.online |
| Nginx | 已配好反代 → :5046，无需改动 |

## 变更摘要

这次发布的核心变化：
1. **数据库从 SQLite 迁移到 MySQL** — 需要在服务器创建 MySQL 数据库和用户
2. **代码清理** — 删除了 better-sqlite3 依赖和所有 SQLite 相关代码
3. **新功能** — 登录和学社按钮拦截为"建设中"toast 提示
4. **mysql2 类型修复** — 兼容 mysql2@3.22 新类型签名

---

### Task 1: 在服务器上创建 MySQL 数据库和用户

**目标:** 为知更鸟应用创建专用数据库和用户。

**需要你提前准备:** MySQL root 密码（`sudo mysql` 可能可以直接免密登录）

- [ ] **Step 1: 测试 MySQL root 登录方式**

```bash
ssh -p 1501 -i ~/.ssh/id_server149 grank@149.88.65.19 "sudo mysql -e 'SELECT 1;'"
```

如果报 `Access denied`，尝试带密码的方式：
```bash
ssh -p 1501 -i ~/.ssh/id_server149 grank@149.88.65.19 "mysql -u root -p -e 'SELECT 1;'"
```

Expected: 成功输出 `1`

- [ ] **Step 2: 创建数据库和用户**

用上一步验证可用的 MySQL 登录方式执行：

```sql
CREATE DATABASE IF NOT EXISTS mockingbird_knowledge CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS 'mockingbird'@'127.0.0.1' IDENTIFIED BY 'Mb_Kn0wl3dge_2026!';
GRANT ALL PRIVILEGES ON mockingbird_knowledge.* TO 'mockingbird'@'127.0.0.1';
FLUSH PRIVILEGES;
```

> **重要:** 密码 `Mb_Kn0wl3dge_2026!` 是示例，建议替换为你自己的强密码。记住它，后面要用。

- [ ] **Step 3: 验证**

```bash
ssh -p 1501 -i ~/.ssh/id_server149 grank@149.88.65.19 \
  "mysql -u mockingbird -h 127.0.0.1 -p'Mb_Kn0wl3dge_2026!' -e 'SHOW DATABASES;'"
```

Expected: 输出中包含 `mockingbird_knowledge`

---

### Task 2: 更新服务器上的环境变量

**目标:** 在 `.env.production` 中添加 `MYSQL_URL`，移除旧的 `SQLITE_DB_PATH`。

**文件:** `/home/grank/apps/mockingbird-knowledge-web/shared/.env.production`

- [ ] **Step 1: 备份当前 .env.production**

```bash
ssh -p 1501 -i ~/.ssh/id_server149 grank@149.88.65.19 \
  "cp /home/grank/apps/mockingbird-knowledge-web/shared/.env.production \
     /home/grank/apps/mockingbird-knowledge-web/shared/.env.production.bak-$(date +%Y%m%d)"
```

- [ ] **Step 2: 添加 MYSQL_URL，移除 SQLITE_DB_PATH**

在 `.env.production` 中：
- **删除** `SQLITE_DB_PATH=...` 那一行
- **删除** `PROMPT_CSV_DIR=...` 那一行（如果存在，已废弃）
- **删除** `CONSOLE_API_BASE_URL=...` 那一行（如果存在，已废弃）
- **新增** `MYSQL_URL=mysql://mockingbird:Mb_Kn0wl3dge_2026!@127.0.0.1:3306/mockingbird_knowledge`

> 密码要和 Task 1 里设置的一致。

可以通过 sed 或手动编辑：
```bash
ssh -p 1501 -i ~/.ssh/id_server149 grank@149.88.65.19 \
  "cd /home/grank/apps/mockingbird-knowledge-web/shared && \
   sed -i '/^SQLITE_DB_PATH=/d' .env.production && \
   sed -i '/^PROMPT_CSV_DIR=/d' .env.production && \
   sed -i '/^CONSOLE_API_BASE_URL=/d' .env.production && \
   echo 'MYSQL_URL=mysql://mockingbird:Mb_Kn0wl3dge_2026!@127.0.0.1:3306/mockingbird_knowledge' >> .env.production"
```

- [ ] **Step 3: 验证更新后的 .env.production**

```bash
ssh -p 1501 -i ~/.ssh/id_server149 grank@149.88.65.19 \
  "cat /home/grank/apps/mockingbird-knowledge-web/shared/.env.production"
```

Expected: 包含 `MYSQL_URL=`，不再包含 `SQLITE_DB_PATH=`

---

### Task 3: 备份当前部署

**目标:** 按照已有的运维文档，备份当前 `current/` 目录。

- [ ] **Step 1: 执行备份**

```bash
ssh -p 1501 -i ~/.ssh/id_server149 grank@149.88.65.19 \
  "mkdir -p /home/grank/apps/mockingbird-knowledge-web/backups && \
   ts=\$(date +%Y%m%d-%H%M%S) && \
   backup=/home/grank/apps/mockingbird-knowledge-web/backups/current-\$ts && \
   mkdir -p \"\$backup\" && \
   rsync -a --delete --exclude '.next' --exclude 'node_modules' \
     /home/grank/apps/mockingbird-knowledge-web/current/ \"\$backup\"/ && \
   echo \"Backed up to: \$backup\""
```

Expected: 输出备份目录路径

---

### Task 4: 同步新代码到服务器

**目标:** 用 rsync 将本地最新代码同步到服务器 `current/`。

- [ ] **Step 1: 执行 rsync**

从本地项目根目录执行：

```bash
rsync -azv --delete \
  --exclude '.git' \
  --exclude '.DS_Store' \
  --exclude '.next' \
  --exclude 'node_modules' \
  --exclude '.env.local' \
  --exclude 'data' \
  --exclude 'raw-incoming' \
  --exclude 'public/content/prompts/media' \
  --exclude 'design-demo' \
  --exclude 'docs/superpowers' \
  ./ \
  -e "ssh -p 1501 -i ~/.ssh/id_server149" \
  grank@149.88.65.19:/home/grank/apps/mockingbird-knowledge-web/current/
```

Expected: 文件同步完成

---

### Task 5: 在服务器上安装依赖并构建

**目标:** npm install + npm run build，build 时会自动连接 MySQL 建表。

- [ ] **Step 1: 安装依赖**

```bash
ssh -p 1501 -i ~/.ssh/id_server149 grank@149.88.65.19 \
  "cd /home/grank/apps/mockingbird-knowledge-web/current && npm install"
```

Expected: 安装完成，无报错

- [ ] **Step 2: 构建生产版本**

```bash
ssh -p 1501 -i ~/.ssh/id_server149 grank@149.88.65.19 \
  "cd /home/grank/apps/mockingbird-knowledge-web/current && npm run build" 2>&1
```

Expected: 构建成功。**关键点:** build 过程中会连接 MySQL 执行 `initDatabase`，自动创建所有表（Users, Sessions, Prompts, SystemLogs 等）。日志中应看到 `[DB] MySQL 已连接`。

- [ ] **Step 3: 验证数据库表已创建**

```bash
ssh -p 1501 -i ~/.ssh/id_server149 grank@149.88.65.19 \
  "mysql -u mockingbird -h 127.0.0.1 -p'Mb_Kn0wl3dge_2026!' mockingbird_knowledge -e 'SHOW TABLES;'"
```

Expected: 看到 `Prompts`, `SystemLogs`, `Users`, `Sessions` 等表

---

### Task 6: 重启服务并验证

**目标:** 重启 systemd 服务，确认网站正常运行。

- [ ] **Step 1: 重启服务**

```bash
ssh -p 1501 -i ~/.ssh/id_server149 grank@149.88.65.19 \
  "sudo systemctl restart mockingbird-web.service"
```

- [ ] **Step 2: 检查服务状态**

```bash
ssh -p 1501 -i ~/.ssh/id_server149 grank@149.88.65.19 \
  "sudo systemctl status mockingbird-web.service --no-pager -n 20"
```

Expected: `Active: active (running)`，日志中有 `[DB] MySQL 已连接`

- [ ] **Step 3: 本地 curl 验证**

```bash
curl -s -o /dev/null -w "%{http_code}" https://zgnknowledge.online
```

Expected: `200`

- [ ] **Step 4: 健康检查接口**

```bash
curl -s https://zgnknowledge.online/api/health
```

Expected: 返回健康状态 JSON

- [ ] **Step 5: 浏览器验证**

打开 https://zgnknowledge.online ，确认：
- 首页正常渲染
- 提示词、文章页面正常
- 点击"登录"→ 出现 toast "功能建设中，敬请期待"
- 点击"学社"→ 出现 toast "功能建设中，敬请期待"

---

### Task 7: 触发数据同步（提示词从 GitHub 同步到 MySQL）

**目标:** 让定时任务跑一次，把 GitHub 仓库的提示词同步到 MySQL。

- [ ] **Step 1: 手动触发同步**

```bash
curl -s -X POST "https://zgnknowledge.online/api/jobs?action=start" \
  -H "Authorization: Bearer YOUR_KNOWLEDGE_ADMIN_TOKEN"
```

> 把 `YOUR_KNOWLEDGE_ADMIN_TOKEN` 替换为 `.env.production` 中的 `KNOWLEDGE_ADMIN_TOKEN` 值。如果还没配，先加到 `.env.production` 里。

Expected: 返回成功响应

- [ ] **Step 2: 检查提示词数据**

```bash
ssh -p 1501 -i ~/.ssh/id_server149 grank@149.88.65.19 \
  "mysql -u mockingbird -h 127.0.0.1 -p'Mb_Kn0wl3dge_2026!' mockingbird_knowledge -e 'SELECT COUNT(*) FROM Prompts;'"
```

Expected: 有数据（非 0）

---

### Task 8: 更新运维文档

**目标:** 把部署指南中的 SQLite 引用更新为 MySQL。

**文件:** `docs/运维/Mockingbird_web部署与迁移指南.md`

- [ ] **Step 1: 更新文档**

主要改动：
- 移除 `SQLITE_DB_PATH` 的引用
- 添加 `MYSQL_URL` 到环境变量列表
- 添加 MySQL 数据库创建步骤到"首次部署"章节
- 更新数据库备份策略（从备份 .db 文件改为 `mysqldump`）

---

## 回滚方案

如果升级后出问题，按已有运维文档回滚：

1. 恢复旧代码：
```bash
rsync -a --delete --exclude ".next" --exclude "node_modules" \
  /home/grank/apps/mockingbird-knowledge-web/backups/current-备份时间戳/ \
  /home/grank/apps/mockingbird-knowledge-web/current/
```

2. 恢复旧 .env.production：
```bash
cp /home/grank/apps/mockingbird-knowledge-web/shared/.env.production.bak-日期 \
   /home/grank/apps/mockingbird-knowledge-web/shared/.env.production
```

3. 重新构建并重启：
```bash
cd /home/grank/apps/mockingbird-knowledge-web/current
npm install && npm run build
sudo systemctl restart mockingbird-web.service
```
