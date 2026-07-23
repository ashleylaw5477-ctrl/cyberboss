# Cyberboss Dashboard

Cyberboss Dashboard 是内置的手机优先中文 PWA，用于查看 Knox 状态、日记、行动轨迹和表情包。Dashboard 与 Cyberboss 运行在同一个 Zeabur 服务里，直接读取现有的 `CYBERBOSS_STATE_DIR`，不会复制数据库。

## Zeabur 配置

在 Zeabur 服务的 Variables / Secrets 中至少添加：

```dotenv
CYBERBOSS_DASHBOARD_PASSWORD=请换成一个足够长且独立的密码
```

可选配置：

```dotenv
CYBERBOSS_DASHBOARD_SESSION_SECRET=独立的随机签名密钥
CYBERBOSS_DASHBOARD_AGENT_NAME=Knox
CYBERBOSS_DASHBOARD_ENABLED=true
CYBERBOSS_DASHBOARD_HOST=0.0.0.0
```

端口会自动使用 Zeabur 提供的 `PORT`，不需要手工填写。设置 Secret 后重新部署，再为服务绑定一个 Zeabur 域名即可访问。

如果没有设置 `CYBERBOSS_DASHBOARD_PASSWORD`，Dashboard 仍会启动并提供健康检查，但不会允许任何人登录或读取数据。

## 安全设计

- 登录状态保留 30 天，Cookie 使用 `HttpOnly`、`SameSite=Lax`，HTTPS 下自动添加 `Secure`
- 所有数据、图片和写操作 API 都需要鉴权，只有 `/healthz` 和登录状态检查例外
- 写操作额外校验同源请求和会话 CSRF Token
- 登录接口有限速
- API 不返回微信账号凭证、context token、环境变量或绝对表情包文件路径
- 日记在第一版中只读
- 表情包支持上传与修改描述/标签，不提供删除入口

## 本地开发

先安装依赖：

```bash
npm install
```

终端一：

```bash
CYBERBOSS_DASHBOARD_PASSWORD=dev-password npm run dashboard:start
```

终端二：

```bash
npm run dashboard:dev
```

生产构建：

```bash
npm run dashboard:build
npm run dashboard:start
```

## 数据来源

- 首页：`sessions.json`、进程 PID、check-in 配置、提醒队列和行动账本
- 日记：`diary/YYYY-MM-DD.md`
- 行动轨迹：`activity-log.jsonl`，并兼容读取已有日记和待处理提醒
- 表情包：`stickers/index.json`、`stickers/tags.json` 和 `stickers/assets/*.gif`

行动账本会记录新的 check-in、reminder、send_message、silent、日记写入和表情包发送动作。
