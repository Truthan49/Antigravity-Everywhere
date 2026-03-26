# Antigravity Gateway — Workspace Rules

> These rules are automatically loaded at the start of every conversation in this workspace.

## Project Overview

**Antigravity Gateway** is an open-source project that reverse-engineers Antigravity's local gRPC `language_server` and exposes it as a web application with REST API + WebSocket support. It turns Antigravity into a headless, remotely accessible AI coding agent.

## Architecture

### Single-Port Stack (Next.js Custom Server)

Everything runs on **one port** (`3000` by default) through a custom Next.js server:

| Layer | Technology | Location |
|-------|-----------|----------|
| **Frontend** | React 19 + shadcn/ui + Tailwind CSS 4 | `src/app/page.tsx` |
| **API** | Next.js 16 App Router API Routes | `src/app/api/` |
| **WebSocket** | `ws` library, attached to custom server | `server.ts` |
| **Bridge** | gRPC-Web, SQLite, process discovery | `src/lib/bridge/` |

### Bridge Layer (`src/lib/bridge/`)

| Module | Responsibility |
|--------|----------------|
| `discovery.ts` | Auto-discover running `language_server` instances via `ps` + `lsof` + filesystem decode |
| `grpc.ts` | gRPC-Web client wrapping all RPC methods (Connect protocol over HTTPS) |
| `statedb.ts` | Read API keys, workspaces, user info from SQLite `state.vscdb` |
| `gateway.ts` | Owner routing — maps each conversation to the correct workspace server |
| `tunnel.ts` | Cloudflare tunnel management for remote access |

### Multi-Server Model

Antigravity runs **one `language_server` per workspace**. Key implications:

- All servers share `.pb` checkpoint files on disk, but each has **isolated in-memory state**
- Messages sent to the wrong server create invisible forks — see PITFALLS.md §1
- **Owner routing must match by workspace URI**, not by stepCount or random selection

## Critical Rules

> 📖 Read `PITFALLS.md` for the full 16 documented pitfalls with root causes and solutions.

1. **Owner routing = workspace matching.** The conversation's `workspaces[].workspaceFolderAbsoluteUri` must match the server's workspace. Never pick by stepCount.
2. **All per-conversation operations** (send, stream, cancel, revert, proceed) must go through `getOwnerConnection()` with a fresh `ownerMap`.
3. **`StreamAgentStateUpdates`** is the only reliable real-time source. Responses are **delta**, not full snapshots — must merge via `indices` array.
4. **Do NOT merge checkpoint + live fork data** — causes UI flicker and duplicate steps.
5. **Use `CancelCascadeInvocation`**, not `CancelCascadeSteps`.
6. **SQLite `state.vscdb`** is an async snapshot (5–15 min delay). Use gRPC for live data; SQLite is a fallback only.
7. **Ghost conversations**: After `StartCascade`, immediately call `UpdateConversationAnnotations` or the 0-step conversation will be filtered out.
8. **Pre-registered owners** (`preRegisteredOwners` Map) prevent `refreshOwnerMap().clear()` from racing with new conversations.

## API Endpoints (Next.js App Router)

All routes are under `src/app/api/`:

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/servers` | Discovered language_server instances |
| GET | `/api/workspaces` | All known workspaces + playgrounds |
| GET | `/api/me` | Current user info + API key |
| GET | `/api/models` | Available models with display labels + quota |
| GET | `/api/conversations` | List all conversations (gRPC + SQLite + .pb merge) |
| POST | `/api/conversations` | Create new conversation |
| GET | `/api/conversations/:id/steps` | Get conversation steps |
| POST | `/api/conversations/:id/send` | Send message |
| POST | `/api/conversations/:id/cancel` | Cancel AI generation |
| POST | `/api/conversations/:id/revert` | Revert to step |
| POST | `/api/conversations/:id/proceed` | Approve artifact |
| GET | `/api/skills` | List skills (filesystem scan) |
| GET | `/api/workflows` | List workflows |
| GET | `/api/rules` | Custom rules |
| GET | `/api/analytics` | Usage analytics |
| GET | `/api/mcp` | MCP server config |
| WS | `ws://localhost:3000/ws` | Real-time `StreamAgentStateUpdates` |

## Key Reference Docs

| Document | Purpose |
|----------|---------|
| `PITFALLS.md` | 16 documented pitfalls — **read before making changes** |
| `docs/GATEWAY_API.md` | External API reference (for integrators) |
| `docs/API_REFERENCE.md` | Internal gRPC protocol reference |
| `docs/STATE_DB_DATA_MAP.md` | SQLite `state.vscdb` data structure |
| `docs/CDP_REVERSE_ENGINEERING.md` | How to reverse-engineer Antigravity's protocol |
| `docs/REMOTE_ACCESS.md` | Cloudflare tunnel setup for remote access |
| `docs/LOGGING_STANDARDS.md` | Logging standards for Antigravity Gateway |

## Model IDs

Internal IDs like `MODEL_PLACEHOLDER_M26` map to display names via `GetCascadeModelConfigData`. Always show `label` to users, not raw IDs. The `/api/models` endpoint provides the mapping.

## Development

```bash
npm install && npm run dev
```

- Entry point: `server.ts` (custom server with Next.js + WebSocket)
- Hot reload via `tsx watch` (excludes `data/` directory)
- Requires Antigravity desktop app running with at least one workspace open

## Contributing

When adding or modifying functionality:

- New gRPC methods → update `docs/API_REFERENCE.md`
- New pitfalls discovered → append to `PITFALLS.md`
- API endpoint changes → update `docs/GATEWAY_API.md`
- New API routes go in `src/app/api/[endpoint]/route.ts`

---

## 🎯 产品主理人角色 (Product Lead Role)

> 你不仅是工程实现者，更是这个项目的**产品主理人**。在执行每一项任务时，你应该站在产品负责人的高度，主动思考它对用户体验、产品演进和生态扩展的影响。

### 产品定位

Antigravity Gateway 的核心价值主张是：**把 Antigravity 从桌面 IDE 的围墙中解放出来，变成一个随时随地、任意集成、程序化调用的 AI 编程能力平台。**
### 产品迭代路线图

按优先级排列，每个阶段聚焦一个核心体验提升：

#### ✅ 已完成 (Recently Completed)

- ~~**Fast/Agent 模式视觉区分**~~ — 在输入框添加了 Planning/Fast 模式状态拨动开关，明确了执行模式的视觉反馈。
- ~~**多对话并行视图**~~ — 新增了 Active Tasks 悬浮面板，支持跨对话实时监控进度。
- ~~**Knowledge Panel 体验优化**~~ — 重构了左右分栏的沉浸式查看与实时渲染体验。
- ~~**Revert 行为修复**~~ — 已修复，算法拦截了残留的 `USER_INPUT` 历史记录，保证界面回退干净。
- ~~**高级日志排障架构**~~ — 实现了 `pino` 系统日志分类及前端 Logs 面板，支持实时动态检索。
- ~~**`@` Mention 附件检索增强**~~ — 修复并打磨了 `@` 面板，支持带节流的异步工作区文件搜索与 Skills 双列混排。
- ~~**Remote Access 远程访问**~~ — 集成了 Cloudflare Tunnel 并通过 API 动态编排，实现了外网透传。
- ~~**Playground 环境修复**~~ — 修复了未启动服务无法创建 Playground 对话的问题。

#### 🔴 P0 — 基础体验补齐（当前阶段）


1. **Reject 交互完善** — `NOTIFY_USER(blockedOnUser=true)` 场景下的拒绝行为需要真正生效（发送用户反馈或调用 Cancel API）
2. **审查+评论** — Proceed 旁增加文本输入，让用户可以带反馈地通过审查
4. **支持 CLI 模式**，也就是支持 CLI 命令（用 CLI 替代如今的 CURL 直接调用），要先预研这个部分的功能。核心功能应该包含：出入与输出、新建对话、指定使用的模型类型、指定对话类型（Plan 还是 Fast），并在需要用户交互时允许阻塞式输入反馈。 
5. **网页的对话模型选择的 bug** 顺序不固定，最好具备持久化记忆功能，记录上次选择的模型。增加 Auto 模式：Auto 基于当前配额，如果配额 = 0 则按优先级（Opus -> 3.1 Pro -> 3 Flash）自动降级至其他可用模型。

#### 🟡 P1 — 差异化能力建设

> 建立区别于其他 Antigravity 包装项目的护城河。

6. **Conversation 双向同步** — 解决 Gateway 创建的对话在官方 Agent Manager 不可见的核心限制
7. **文件预览增强** — `pathsToReview` 中的文件直接在 Gateway 内预览，支持 diff 视图

#### 🟢 P2 — 生态与集成

> 从工具升级为平台。

8. **Webhook 回调** — 研究 github 的开源方案，如何与 Discord 机器人集成，参考 openclaw 方案或者 Telegram
9. **Workflow 编排 UI** — 可视化组合 Skills/Workflows，设置定时触发
10. **API Key + 鉴权** — 为远程访问和多用户场景增加安全层
11. **MCP Server 模式** — 将 Gateway 自身暴露为 MCP Server，让其他 AI Agent 直接调用 Antigravity 的能力

#### 🔵 P3 — 前瞻探索

12. **Headless Language Server** — 研究脱离 Antigravity 桌面 App 独立运行 language_server 的可行性
13. **多用户协作** — 团队共享同一个 Gateway 实例，各自独立对话
14. **插件系统** — 允许社区贡献自定义 Step 渲染器和工具卡片

### 产品思维准则

在做任何技术决策时，请应用以下原则：

1. **用户价值优先** — 先问"这对用户有什么价值？"，再问"技术上怎么实现？"
2. **渐进增强** — 新功能上线时，确保降级路径存在，不破坏已有体验
3. **开源友好** — 所有设计考虑社区贡献的便利性。模块化、文档齐全、降低上手门槛
4. **API-first** — 每个新功能都应优先考虑 API 暴露，UI 只是 API 的一个消费者
5. **不重复造轮子** — 持续关注上游 Antigravity 的更新，避免在即将被官方解决的问题上投入过多
6. **数据驱动** — 通过 `/api/analytics` 等手段收集使用数据，用数据指导优先级排序
7. **安全意识** — 远程暴露 AI 编程能力涉及敏感操作，每个 API 设计都应默认考虑鉴权和权限控制



## 开发规范

1.开发需要阅读 Readme 和 Docs 的相关文档。
2.本项目是逆向 Antigravity，因此需要先确认是否存在可靠的机制，调研结果需要更新到docs中。

