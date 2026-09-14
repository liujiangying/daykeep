# 个人版轻量服务器部署

这套配置用于一台腾讯云轻量应用服务器，运行 Caddy、Node API、提醒 Worker 与 PostgreSQL。数据库端口不暴露到公网；Caddy 自动申请并续期 HTTPS 证书。

## 上线前条件

- Ubuntu 24.04 LTS，已安装 Docker Engine 与 Compose 插件。
- 域名 `daykeep.cn` 的 A 记录指向服务器公网 IP。
- 轻量服务器防火墙放行 TCP 80、443；SSH 22 仅允许可信来源。
- 域名和小程序备案按腾讯云、微信公众平台要求办理。
- 已创建广州地域的私有 COS Bucket，并为应用创建最小权限子账号密钥。

COS Bucket 必须保持“私有读写”。应用在数据库中只保存 `cos://` 对象引用，接口响应时才生成短期签名地址；不要为了让图片显示而改成公有读。

### COS 子账号权限

不要在服务器使用主账号永久密钥。在腾讯云 CAM 创建一个仅用于 Daykeep 服务端的子账号，并关联
[`tencent-cos-cam-policy.example.json`](./tencent-cos-cam-policy.example.json) 中的自定义策略。该策略只允许读写广州 Bucket
`lhcos-2cf51-1395841815` 的 `daykeep/` 目录，不允许删除 Bucket、修改权限或访问其他 Bucket。

创建子账号后，把它的 SecretId、SecretKey 直接填入服务器上的 `.env.server`。不要发到聊天、微信或提交到 Git。

## 首次启动

```bash
cd deploy/personal
cp env.server.example .env.server
chmod 600 .env.server
# 填写 .env.server 中的真实值
./preflight.sh
docker compose --env-file .env.server -f compose.yml config
docker compose --env-file .env.server -f compose.yml build
docker compose --env-file .env.server -f compose.yml up -d
docker compose --env-file .env.server -f compose.yml ps
curl -fsS https://daykeep.cn/readyz
```

真实 `.env.server` 被仓库根目录的 `.gitignore` 规则排除，禁止提交或发送给其他人。`preflight.sh` 会检查必填项、密码长度、文件权限和 Compose 配置，但不会打印密钥。

## 更新

```bash
git pull --ff-only
cd deploy/personal
docker compose --env-file .env.server -f compose.yml build api
docker compose --env-file .env.server -f compose.yml up -d --remove-orphans
```

## 备份与恢复

备份脚本使用 PostgreSQL 自定义压缩格式，并通过临时 rclone 容器上传到当前 Bucket 的 `daykeep/backups/postgres/`。先手工执行并在 COS 控制台确认文件存在：

```bash
chmod +x backup-postgres.sh restore-postgres.sh
./backup-postgres.sh
```

验证成功后再使用 root 的 crontab 配置每日任务，例如每天 03:20：

```cron
20 3 * * * /opt/daykeep/deploy/personal/backup-postgres.sh >> /var/log/daykeep-backup.log 2>&1
```

恢复会清理并替换当前数据库内容，必须显式确认：

```bash
RESTORE_CONFIRM=daykeep ./restore-postgres.sh ./backups/daykeep_TIMESTAMP.dump
```

首次正式开放前必须完成一次备份下载和恢复演练。

## 日常检查

```bash
docker compose --env-file .env.server -f compose.yml ps
docker compose --env-file .env.server -f compose.yml logs --tail=200 api worker caddy
curl -fsS https://daykeep.cn/healthz
curl -fsS https://daykeep.cn/readyz
```

不要开放 PostgreSQL 的 5432 端口。HTTPS 正常后，微信公众平台的服务器合法域名填写 `https://daykeep.cn`。
