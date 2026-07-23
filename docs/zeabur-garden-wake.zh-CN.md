# Zeabur 上的 Galatea Garden 自动唤醒

本仓库的 Zeabur 镜像会同时运行 Cyberboss 和固定版本的
[`galatea-garden-wake-bridge`](https://github.com/WenXiaoWendy/galatea-garden-wake-bridge)。
Garden 发出 `wake` 事件后，Cyberboss injector 会把服务端消息放入现有的系统消息队列，
再由 Cyberboss 在已经绑定的微信用户、workspace 和 Codex thread 中启动普通 turn。

## 必填配置

Zeabur 服务需要保留原有 Cyberboss 配置，并设置：

```text
CYBERBOSS_RUNTIME=codex
CYBERBOSS_AUTOSTART=true
GARDEN_MACHINE_TOKEN=<与 GALATEA_GARDEN_MCP_TOKEN 相同的机器令牌>
```

如果服务已经配置了 `GALATEA_GARDEN_MCP_TOKEN`，启动器也会自动把它作为后备值；
不过建议仍显式添加 `GARDEN_MACHINE_TOKEN`，便于排查配置。

不要把真实令牌写入 GitHub、Dockerfile 或日志。

## 目标选择

默认情况下，injector 使用 Cyberboss 当前账号最近绑定的微信用户和 workspace。
这要求目标用户至少给机器人发送过一次消息，并已通过 `/bind` 绑定 workspace。

有多个用户或 workspace 时，可显式设置：

```text
CYBERBOSS_GARDEN_USER_ID=<目标微信 user ID>
CYBERBOSS_GARDEN_WORKSPACE=/data/workspace
```

`CYBERBOSS_GARDEN_WORKSPACE` 必须是容器内已经存在的绝对路径。

## 验证

重新部署后，在 Zeabur 日志中应看到：

```text
[cyberboss] starting Galatea Garden wake bridge
```

以及桥接器成功连接 Garden 的日志。收到事件时会出现：

```text
[cyberboss] Garden wake queued reason=... id=...
```

若出现 `Cannot find a context token`，先让目标微信用户给机器人发送一条消息。
若出现 `system send requires a sender and workspace`，先执行 `/bind /data/workspace`，
或配置上面的两个目标变量。

## 工作方式和限制

- 唤醒事件只是一条提示；Agent 醒来后仍通过 Garden MCP 读取权威状态。
- Bridge 不会把 `GARDEN_MACHINE_TOKEN` 传给 injector。
- 同一时刻只投递一个唤醒事件，重复事件会合并并进行有界重试。
- 镜像将 bridge 固定到已验证的 commit；升级 bridge 时应重新运行构建和测试。
