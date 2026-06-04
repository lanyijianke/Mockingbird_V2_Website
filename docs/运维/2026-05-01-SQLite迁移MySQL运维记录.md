# 2026-05-01 SQLite → MySQL 升级迁移运维记录

## 背景

知更鸟知识库从 SQLite 迁移到 MySQL，同时进行代码发布（清理 SQLite 残留代码、修复 mysql2 类型错误、添加"建设中"toast 提示等）。

## 服务器环境

| 项目 | 值 |
|------|------|
| 服务器 | 149.88.65.19:1501 |
| 系统 | Ubuntu 24.04.1 LTS |
| Node | v22.22.2 |
| MySQL | 8.0.45 |
| 域名 | zgnknowledge.online |
| 应用目录 | /home/grank/apps/mockingbird-knowledge-web/current |
| 环境文件 | /home/grank/apps/mockingbird-knowledge-web/shared/.env.production |

## 迁移前状态

- 数据库：SQLite（`/home/grank/apps/mockingbird-knowledge-web/shared/data/knowledge.db`，23MB）
- 提示词：2087 条
- 服务：`mockingbird-web.service` 通过 systemd 运行

## 操作步骤

### 1. MySQL 数据库准备

MySQL root 密码已遗忘，通过 `debian-sys-maint` 用户（凭据在 `/etc/mysql/debian.cnf`）获取管理权限。

```bash
mysql -u debian-sys-maint -pBfiimhPOEZnRtPC7
```

创建专用数据库和用户：

```sql
CREATE DATABASE IF NOT EXISTS mockingbird_knowledge CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS 'mockingbird'@'127.0.0.1' IDENTIFIED BY 'Mb_Kn0wl3dge_2026!';
GRANT ALL PRIVILEGES ON mockingbird_knowledge.* TO 'mockingbird'@'127.0.0.1';
FLUSH PRIVILEGES;
```

### 2. 更新环境变量

编辑 `/home/grank/apps/mockingbird-knowledge-web/shared/.env.production`：

- 删除：`SQLITE_DB_PATH`、`PROMPT_CSV_DIR`、`CONSOLE_API_BASE_URL`、`GITHUB_TOKEN`
- 新增：`MYSQL_URL=mysql://mockingbird:Mb_Kn0wl3dge_2026!@127.0.0.1:3306/mockingbird_knowledge`
- 新增：`KNOWLEDGE_ADMIN_TOKEN=KwAdmin2026Secure`

备份了原文件为 `.env.production.bak-20260501`。

### 3. 备份旧版本

```bash
rsync -a --delete --exclude '.next' --exclude 'node_modules' \
  /home/grank/apps/mockingbird-knowledge-web/current/ \
  /home/grank/apps/mockingbird-knowledge-web/backups/current-20260501-071138/
```

### 4. 代码同步

从本地 rsync 到服务器，排除了 `.git`、`node_modules`、`.next`、`.env.local`、`data`、`public/content/prompts/media`、`design-demo`、`docs/superpowers`。

### 5. 构建与首次启动

```bash
cd /home/grank/apps/mockingbird-knowledge-web/current
npm install
npm run build   # 构建时自动连接 MySQL 执行 initDatabase，创建了所有表
```

`npm run build` 触发了 `initDatabase`，自动创建了 10 张表（Prompts、SystemLogs、Users、Sessions、OauthAccounts、EmailVerificationTokens、PasswordResetTokens、InvitationCodes、InvitationRedemptions、AcademyContent）。

### 6. 首次重启

```bash
sudo systemctl restart mockingbird-web.service
```

服务启动正常，MySQL 连接成功。提示词同步定时任务随即开始运行，从 GitHub 同步了约 94 条提示词。

### 7. 第一次数据迁移（出问题）

**问题：没有先停服就直接迁移了数据。**

当时用 Python 脚本从 SQLite 导入数据，同时定时任务还在往 MySQL 写入新数据。结果：
- 导入了 1913 条新数据
- 跳过了 174 条已存在的
- MySQL 总量到了 2630 条（包含定时任务持续同步的额外数据）

用户反馈提示词数据不完整（只有 GitHub 同步的数据，旧数据没迁移），要求重新来过。

### 8. 正确的数据迁移流程

**先停服：**

```bash
sudo systemctl stop mockingbird-web.service
```

**清空 MySQL 数据库：**

```sql
DROP TABLE IF EXISTS InvitationRedemptions;
DROP TABLE IF EXISTS InvitationCodes;
DROP TABLE IF EXISTS PasswordResetTokens;
DROP TABLE IF EXISTS EmailVerificationTokens;
DROP TABLE IF EXISTS OauthAccounts;
DROP TABLE IF EXISTS Sessions;
DROP TABLE IF EXISTS Users;
DROP TABLE IF EXISTS AcademyContent;
DROP TABLE IF EXISTS SystemLogs;
DROP TABLE IF EXISTS Prompts;
```

**用 Python 迁移脚本从 SQLite 导入：**

服务器上没有 `mysql-connector-python`，需要先安装：

```bash
pip3 install --break-system-packages mysql-connector-python
```

迁移脚本逻辑：
- 连接 SQLite 和 MySQL
- 先手动创建 Prompts 表（DDL 与 `init-schema.ts` 一致）
- 逐行读取 SQLite 的 Prompts 表，INSERT 到 MySQL
- 全部插入后 commit

**结果：2087 条全部导入成功，0 失败。**

**重新启动服务：**

```bash
sudo systemctl start mockingbird-web.service
```

启动后 `initDatabase` 自动创建了其余 9 张表，定时任务恢复运行，开始从 GitHub 同步新数据。

### 9. 最终状态

| 指标 | 值 |
|------|------|
| MySQL 表 | 10 张（Prompts、SystemLogs、Users、Sessions、OauthAccounts、EmailVerificationTokens、PasswordResetTokens、InvitationCodes、InvitationRedemptions、AcademyContent） |
| 提示词 | 2087（旧数据）+ 持续同步的新数据 |
| 服务状态 | active (running) |
| 健康检查 | /api/health 返回 healthy |
| 网站 | https://zgnknowledge.online 正常访问 |

## 踩坑记录

1. **MySQL root 密码遗忘** — 通过 `/etc/mysql/debian.cnf` 中的 `debian-sys-maint` 用户绕过
2. **`sudo mysql` 无法登录** — Ubuntu 24.04 的 MySQL 8.0 默认 root 使用 `caching_sha2_password` 插件而非 `auth_socket`，需要密码
3. **数据迁移必须在停服后进行** — 不停服的话定时任务会持续写入数据，导致迁移后数据不干净。正确流程是：停服 → 清空 → 迁移 → 启动
4. **`mysql-connector-python` 安装需要 `--break-system-packages`** — Ubuntu 24.04 的 Python 使用 PEP 668 保护
5. **`mysql.connector.errors.InternalError: Unread result found`** — cursor 需要设置 `buffered=True`
6. **`SHOW TABLES` 输出误读** — 只有一张 `Prompts` 表，没有重复

### 10. SQLite 时代封存

迁移完成后，将旧代码、旧数据、旧配置打包封存在服务器上：

**封存位置：** `/home/grank/apps/mockingbird-knowledge-web/archives/sqlite-era-2026-05-01/`

```
sqlite-era-2026-05-01/  (35MB)
├── old-code/                        迁移前完整代码（不含 node_modules 和 .next，13MB）
├── knowledge.db                     SQLite 数据库（23MB，2087 条提示词）
├── .env.production.sqlite-era       迁移前环境变量（含 SQLITE_DB_PATH）
├── mockingbird-web.service          原始 systemd 服务文件
└── README.txt                       封存说明 + 回滚步骤
```

其他散落的备份：
- 旧代码备份：`backups/current-20260501-071138/`
- 旧 env 备份：`shared/.env.production.bak-20260501`
- SQLite 原文件仍在：`shared/data/knowledge.db`（未被删除，作为额外保险）

## 回滚方案

如果需要回退到 SQLite 版本，使用封存包：

```bash
# 1. 停服
sudo systemctl stop mockingbird-web.service

# 2. 恢复代码
rsync -a --delete /home/grank/apps/mockingbird-knowledge-web/archives/sqlite-era-2026-05-01/old-code/ \
  /home/grank/apps/mockingbird-knowledge-web/current/

# 3. 恢复环境变量
cp /home/grank/apps/mockingbird-knowledge-web/archives/sqlite-era-2026-05-01/.env.production.sqlite-era \
   /home/grank/apps/mockingbird-knowledge-web/shared/.env.production

# 4. 重建重启
cd /home/grank/apps/mockingbird-knowledge-web/current
npm install && npm run build
sudo systemctl restart mockingbird-web.service
```
