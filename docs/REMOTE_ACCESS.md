# 远程访问指南（Cloudflare Named Tunnel）

通过 Cloudflare Named Tunnel，你可以从手机、外网或任何地方通过**固定 HTTPS 域名**安全访问本地运行的 Antigravity Gateway。

> **原理**：`cloudflared` 在本地建立一条加密隧道到 Cloudflare 边缘网络，将你的自定义域名流量转发到 `localhost:3000`。无需开放端口、无需公网 IP。

---

## 前提条件

- Node.js 18+
- Antigravity IDE 已安装并登录
- 一个 Cloudflare 账号（免费即可）
- 一个托管在 Cloudflare 上的域名（用于映射固定 URL）

---

## 一、安装 cloudflared

```bash
# macOS
brew install cloudflared

# 验证
cloudflared --version
```

---

## 二、一次性设置

### 1. 登录 Cloudflare

```bash
cloudflared tunnel login
```

浏览器会弹出授权页面，选择你要使用的域名，授权完成后终端显示：

```
You have successfully logged in.
```

凭据文件自动保存在 `~/.cloudflared/cert.pem`。

### 2. 创建隧道

```bash
cloudflared tunnel create antigravity-gateway
```

输出示例：

```
Tunnel credentials written to /Users/你的用户名/.cloudflared/xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx.json
Created tunnel antigravity-gateway with id xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
```

> 记住这个 credentials JSON 文件路径，后面要用。

### 3. 绑定域名

```bash
cloudflared tunnel route dns antigravity-gateway ag.yourdomain.com
```

这会在 Cloudflare DNS 中自动创建一条 CNAME 记录，将 `ag.yourdomain.com` 指向你的隧道。

### 4. 创建隧道配置文件

编辑 `~/.cloudflared/config.yml`（如果不存在则创建）：

```yaml
tunnel: <你的隧道 ID>
credentials-file: /Users/<你的用户名>/.cloudflared/<你的隧道 ID>.json

ingress:
  - hostname: ag.yourdomain.com
    service: http://localhost:3000
  - service: http_status:404
```

> **重要**：`tunnel` 字段填隧道 ID（UUID 格式），可通过 `cloudflared tunnel list` 查看。`ingress` 中的 `hostname` 必须与第 3 步绑定的域名一致。最后一条 `http_status:404` 是兜底规则，不可省略。

---

## 三、配置 Gateway

启动 Gateway 后，通过 API 保存隧道配置：

```bash
curl -X POST http://localhost:3000/api/tunnel/config \
  -H 'Content-Type: application/json' \
  -d '{
    "tunnelName": "antigravity-gateway",
    "url": "https://ag.yourdomain.com",
    "autoStart": true
  }'
```

| 参数 | 说明 |
|------|------|
| `tunnelName` | 第二步创建的隧道名称 |
| `url` | 第三步绑定的域名（含 `https://`） |
| `autoStart` | 设为 `true` 则 Gateway 启动时自动连接隧道 |

配置持久化在 `~/.gemini/antigravity/tunnel_config.json`，只需设置一次。

---

## 四、启动 / 停止隧道

```bash
# 启动隧道
curl -X POST http://localhost:3000/api/tunnel/start
# → {"success":true,"url":"https://ag.yourdomain.com"}

# 查看状态
curl http://localhost:3000/api/tunnel
# → {"running":true,"url":"https://ag.yourdomain.com","configured":true,...}

# 停止隧道
curl -X POST http://localhost:3000/api/tunnel/stop
# → {"success":true}
```

如果设置了 `autoStart: true`，每次 `npm run dev` 启动 Gateway 会自动连接，无需手动调用。

---

## 五、使用远程访问

隧道启动后，在**任何设备**（手机、平板、远程电脑）上通过固定域名访问你的 Antigravity：

### 前端界面

直接在浏览器打开：
```
https://ag.yourdomain.com/
```
即可看到完整的 **Antigravity Agent Manager** 前端（对话列表、发消息、实时流等），与本地 `localhost:3000` 体验完全一致。

> 💡 **推荐**：在手机 Safari/Chrome 中「添加到主屏幕」，可当作 App 使用（已启用 PWA 支持）。

### API 调用

```bash
# REST API
curl https://ag.yourdomain.com/api/servers
curl https://ag.yourdomain.com/api/conversations

# WebSocket（实时流）
wscat -c wss://ag.yourdomain.com/ws
```

所有 Gateway API 均通过隧道完整暴露（REST + WebSocket），使用方式与 `localhost:3000` 完全一致。

---

## API 参考

| Method | Path | 说明 |
|--------|------|------|
| `GET` | `/api/tunnel` | 获取隧道状态 |
| `POST` | `/api/tunnel/config` | 保存隧道配置 |
| `POST` | `/api/tunnel/start` | 启动隧道 |
| `POST` | `/api/tunnel/stop` | 停止隧道 |

### `GET /api/tunnel` 响应示例

```json
{
  "running": true,
  "starting": false,
  "url": "https://ag.yourdomain.com",
  "error": null,
  "configured": true,
  "config": {
    "tunnelName": "antigravity-gateway",
    "url": "https://ag.yourdomain.com",
    "autoStart": true
  }
}
```

---

## 常见问题

| 问题 | 解决 |
|------|------|
| `cloudflared not found` | 执行 `brew install cloudflared` |
| `tunnel not found` | 确认隧道名称正确：`cloudflared tunnel list` |
| `unauthorized` / `credential` 错误 | 重新 `cloudflared tunnel login`，检查 credentials JSON |
| 隧道启动但域名不可达 | 确认 DNS 记录：`cloudflared tunnel route dns <name> <domain>` |
| Error 1033: Cloudflare Tunnel error | 检查 `~/.cloudflared/config.yml` 是否指向正确的隧道 ID 并包含 ingress 规则 |
| 隧道进程在跑但 connections 为 0 | `config.yml` 中的 `tunnel` ID 与实际使用的隧道不匹配，更新后重启 |
| Gateway 重启后隧道没有自动连接 | 配置中设置 `"autoStart": true` |
