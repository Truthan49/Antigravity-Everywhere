# Antigravity Gateway — 对外 API 文档

> **Base URL**: `http://localhost:3000`  
> **WebSocket**: `ws://localhost:3000/ws`  
> **认证**: 无需客户端传 API Key（Gateway 内部从 `state.vscdb` 自动获取）  
> **Content-Type**: 所有 POST 请求均使用 `application/json`  
> **Last Updated**: 2026-03-18

本文档面向 **Headless CLI** 及所有需要程序化调用 Antigravity 对话能力的场景。

---

## 快速开始：一个完整的对话生命周期

```bash
# 1. 查看可用 workspace 及其 language_server
curl http://localhost:3000/api/servers

# 2. 创建对话（指定 workspace URI）
CID=$(curl -sX POST http://localhost:3000/api/conversations \
  -H 'Content-Type: application/json' \
  -d '{"workspace": "file:///path/to/mytools"}' | jq -r .cascadeId)

# 3. 发送消息
curl -sX POST "http://localhost:3000/api/conversations/$CID/send" \
  -H 'Content-Type: application/json' \
  -d '{"text": "帮我分析这个项目的架构", "model": "MODEL_PLACEHOLDER_M26"}'

# 4. 等待后获取全部步骤
sleep 15
curl -s "http://localhost:3000/api/conversations/$CID/steps" | jq '.steps | length'

# 5. 提取 AI 回复文本
curl -s "http://localhost:3000/api/conversations/$CID/steps" | \
  jq -r '.steps[] | select(.plannerResponse) | .plannerResponse.modifiedResponse'
```

---

## 可用模型速查表

通过 `GET /api/models` 获取实时列表。当前可用：

| 内部 Model ID | 显示名称 | 图片 | 推荐 | 说明 |
|---------------|----------|------|------|------|
| `MODEL_PLACEHOLDER_M37` | Gemini 3.1 Pro (High) | ✅ | ⭐ | Gemini 旗舰，支持 PDF/音频/视频 |
| `MODEL_PLACEHOLDER_M36` | Gemini 3.1 Pro (Low) | ✅ | ⭐ | Gemini 旗舰低配额版 |
| `MODEL_PLACEHOLDER_M47` | Gemini 3 Flash | ✅ | ⭐ | 快速模型，支持 PDF/音频/视频 |
| `MODEL_PLACEHOLDER_M35` | Claude Sonnet 4.6 (Thinking) | ✅ | ⭐ | Claude 思考模型 |
| `MODEL_PLACEHOLDER_M26` | Claude Opus 4.6 (Thinking) | ✅ | ⭐ | Claude 最强模型 |
| `MODEL_OPENAI_GPT_OSS_120B_MEDIUM` | GPT-OSS 120B (Medium) | ❌ | ⭐ | OpenAI 开源模型 |

> **在 `send` 接口中**，`model` 字段使用上表的 **"内部 Model ID"** 列的值。不传则使用服务器默认。

---

## 核心对话接口

### `GET /api/conversations` — 列出所有对话

**功能**: 从 `.pb` 文件扫描 + gRPC 实时查询 + SQLite 兜底，合并返回所有已知对话。

**Response** `200 OK`:
```json
[
  {
    "id": "7e95db6b-5b5d-4035-a387-d9fd1d882fdb",
    "title": "Documenting External APIs",
    "workspace": "file:///Applications/Antigravity.app/Contents/Resources/app",
    "mtime": 1773872543459.765,
    "steps": 515
  }
]
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | `string` | 对话唯一 UUID（即 `cascadeId`） |
| `title` | `string` | 对话标题（由 AI 自动生成的摘要；无标题时为 `Conversation {id前8位}`） |
| `workspace` | `string` | 所属工作空间的 `file://` URI |
| `mtime` | `number` | 最后修改时间戳（毫秒级 Unix epoch） |
| `steps` | `number` | 总步骤数（含 user/AI/tool 等所有类型） |

---

### `POST /api/conversations` — 创建新对话

**功能**: 创建一个新的 Cascade 对话。内部自动处理 `AddTrackedWorkspace`（非专属 server 时）和 `UpdateConversationAnnotations`（防幽灵对话过滤）。

**Request Body**:

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `workspace` | `string` | 否 | workspace `file://` URI。不传默认 `file:///path/to/mytools` |

特殊值 `"playground"` 会自动在 `~/.gemini/antigravity/playground/` 下创建沙箱目录。

```json
{ "workspace": "file:///path/to/my-project" }
```

**Response** `200 OK`:
```json
{ "cascadeId": "3cb98b88-b875-4611-85d7-0782321db911" }
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `cascadeId` | `string` | 新建对话的 UUID，后续所有操作需用此 ID |

**内部执行流程**（客户端无需关心）:
```
1. getLanguageServer(wsUri) → 找专属 server？
   ├─ YES → 直接使用
   └─ NO  → fallback 到 servers[0] → 先调 AddTrackedWorkspace
2. grpc.startCascade(port, csrf, apiKey, wsUri)
3. grpc.updateConversationAnnotations(cascadeId, {lastUserViewTime: now})
4. addLocalConversation(cascadeId, wsUri, title) → 本地缓存
```

---

### `POST /api/conversations/:id/send` — 发送消息

**功能**: 异步提交用户消息给 AI。返回成功仅表示消息已提交，AI 回复需通过 WebSocket 或轮询 `/steps` 获取。

**URL 参数**: `:id` = `cascadeId`

**Request Body**:

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `text` | `string` | ✅ | 用户消息文本 |
| `model` | `string` | 否 | 模型 ID（见模型速查表）。不传使用默认 |

```json
{
  "text": "帮我重构这个函数",
  "model": "MODEL_PLACEHOLDER_M26"
}
```

**Response** `200 OK`:
```json
{ "ok": true, "data": {} }
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `ok` | `boolean` | 消息是否成功提交 |
| `data` | `object` | gRPC 原始返回（通常为空对象） |

**内部执行流程**:
```
1. refreshOwnerMap() → 确保 ownerMap 新鲜
2. getOwnerConnection(cascadeId) → 找到此对话所属的 server
3. grpc.sendMessage(port, csrf, apiKey, cascadeId, text, model)
```

---

### `GET /api/conversations/:id/steps` — 获取对话步骤

**功能**: 获取对话的完整步骤列表（从 checkpoint `.pb` 加载）。

**URL 参数**: `:id` = `cascadeId`

**Response** `200 OK`:
```json
{
  "steps": [
    {
      "type": "CORTEX_STEP_TYPE_USER_INPUT",
      "status": "CORTEX_STEP_STATUS_DONE",
      "userInput": {
        "items": [{ "text": "帮我分析这个项目" }]
      }
    },
    {
      "type": "CORTEX_STEP_TYPE_PLANNER_RESPONSE",
      "status": "CORTEX_STEP_STATUS_DONE",
      "plannerResponse": {
        "modifiedResponse": "这是一个 Next.js 项目，使用了..."
      }
    },
    {
      "type": "CORTEX_STEP_TYPE_RUN_COMMAND",
      "status": "CORTEX_STEP_STATUS_DONE",
      "runCommand": {
        "command": "ls -la",
        "output": "total 64\ndrwxr-xr-x..."
      }
    },
    {
      "type": "CORTEX_STEP_TYPE_CODE_ACTION",
      "status": "CORTEX_STEP_STATUS_DONE",
      "codeAction": {
        "filePath": "/path/to/file.ts",
        "diff": "--- a/file.ts\n+++ b/file.ts\n..."
      }
    }
  ]
}
```

**Step 对象完整字段**:

| 字段 | 类型 | 说明 |
|------|------|------|
| `type` | `string` | 步骤类型枚举（见下表） |
| `status` | `string` | `CORTEX_STEP_STATUS_DONE` / `_RUNNING` / `_PENDING` / `_ERROR` |
| `userInput` | `object?` | 用户输入（仅 `USER_INPUT` 类型） |
| `plannerResponse` | `object?` | AI 回复（仅 `PLANNER_RESPONSE` 类型） |
| `notifyUser` | `object?` | 用户审批请求（仅 `NOTIFY_USER` 类型） |
| `taskBoundary` | `object?` | 任务边界（仅 `TASK_BOUNDARY` 类型） |
| `codeAction` | `object?` | 代码操作（仅 `CODE_ACTION` 类型） |
| `runCommand` | `object?` | 命令执行（仅 `RUN_COMMAND` 类型） |
| `viewFile` | `object?` | 文件查看（仅 `VIEW_FILE` 类型） |
| `searchWeb` | `object?` | 网络搜索（仅 `SEARCH_WEB` 类型） |
| `grepSearch` | `object?` | 代码搜索（仅 `GREP_SEARCH` 类型） |
| `listDirectory` | `object?` | 目录列举（仅 `LIST_DIRECTORY` 类型） |
| `errorMessage` | `object?` | 错误信息（仅 `ERROR_MESSAGE` 类型） |

**Step Types 完整枚举**:

| Type 枚举值 | 含义 | 关键数据字段 |
|-------------|------|-------------|
| `CORTEX_STEP_TYPE_USER_INPUT` | 用户消息 | `userInput.items[].text` |
| `CORTEX_STEP_TYPE_PLANNER_RESPONSE` | AI 文本回复 | `plannerResponse.modifiedResponse` |
| `CORTEX_STEP_TYPE_NOTIFY_USER` | 需要用户审批/交互 | `notifyUser.message`, `.isBlocking`, `.pathsToReview[]`, `.shouldAutoProceed` |
| `CORTEX_STEP_TYPE_TASK_BOUNDARY` | 任务模式切换 | `taskBoundary.taskName`, `.mode` (`PLANNING`/`EXECUTION`/`VERIFICATION`), `.taskStatus`, `.taskSummary` |
| `CORTEX_STEP_TYPE_CODE_ACTION` | 创建/编辑文件 | `codeAction.filePath`, `.diff` |
| `CORTEX_STEP_TYPE_RUN_COMMAND` | 执行 Shell 命令 | `runCommand.command`, `.output`, `.exitCode` |
| `CORTEX_STEP_TYPE_VIEW_FILE` | 读取文件内容 | `viewFile.path`, `.content` |
| `CORTEX_STEP_TYPE_SEARCH_WEB` | 网络搜索 | `searchWeb.query`, `.results` |
| `CORTEX_STEP_TYPE_GREP_SEARCH` | 代码搜索 | `grepSearch.query`, `.results` |
| `CORTEX_STEP_TYPE_LIST_DIRECTORY` | 列出目录 | `listDirectory.path`, `.entries` |
| `CORTEX_STEP_TYPE_ERROR_MESSAGE` | 错误信息 | `errorMessage.message` |
| `CORTEX_STEP_TYPE_EPHEMERAL_MESSAGE` | 系统临时消息 | （通常无可用字段） |
| `CORTEX_STEP_TYPE_CHECKPOINT` | 状态检查点标记 | （无数据，仅分隔符） |

---

### `POST /api/conversations/:id/cancel` — 取消生成

**功能**: 停止 AI 当前的生成任务。

**Request Body**: 无需 Body。

**Response** `200 OK`:
```json
{ "ok": true, "data": {} }
```

---

### `POST /api/conversations/:id/proceed` — 审批继续

**功能**: 当 AI 在某个 `NOTIFY_USER` 步骤等待用户审批时（`isBlocking: true`），调用此接口让 AI 继续工作。

**Request Body**:

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `uri` | `string` | ✅ | 审批的文件/资源 URI |
| `model` | `string` | 否 | 模型 ID |

```json
{ "uri": "file:///path/to/reviewed/file.md", "model": "MODEL_PLACEHOLDER_M26" }
```

**Response** `200 OK`:
```json
{ "ok": true, "data": {} }
```

---

### `POST /api/conversations/:id/revert` — 回退步骤

**功能**: 回退对话到指定步骤索引处。

**Request Body**:

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `stepIndex` | `number` | ✅ | 目标步骤索引（0-indexed） |
| `model` | `string` | 否 | 模型 ID |

```json
{ "stepIndex": 5, "model": "MODEL_PLACEHOLDER_M26" }
```

---

### `GET /api/conversations/:id/revert-preview` — 回退预览

**功能**: 预览回退效果，不实际执行。

**Query 参数**:

| 参数 | 类型 | 说明 |
|------|------|------|
| `stepIndex` | `number` | 目标步骤索引 |
| `model` | `string` | 模型 ID |

```
GET /api/conversations/abc123/revert-preview?stepIndex=5&model=MODEL_PLACEHOLDER_M26
```

---

## 实时流：WebSocket

### 连接地址

```
ws://localhost:3000/ws
```

### 客户端 → 服务器消息

#### 订阅对话更新
```json
{ "type": "subscribe", "cascadeId": "uuid" }
```

### 服务器 → 客户端推送

#### 步骤更新（`steps` 类型）
```json
{
  "type": "steps",
  "cascadeId": "uuid",
  "data": {
    "steps": [ ... ],
    "status": "CASCADE_RUN_STATUS_RUNNING",
    "conversationId": "uuid",
    "trajectoryId": "uuid"
  }
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `type` | `"steps"` | 固定值 |
| `cascadeId` | `string` | 对话 UUID |
| `data.steps` | `Step[]` | **完整步骤数组**（后端已合并 delta，客户端直接替换即可） |
| `data.status` | `string` | `CASCADE_RUN_STATUS_RUNNING` = AI 工作中；`CASCADE_RUN_STATUS_IDLE` = AI 完成 |
| `data.conversationId` | `string` | 对话 UUID |
| `data.trajectoryId` | `string` | 轨迹 UUID |

### CLI 轮询替代方案

如果不方便使用 WebSocket，可以用轮询 `/steps` 替代：
```bash
while true; do
  STEPS=$(curl -s "http://localhost:3000/api/conversations/$CID/steps")
  COUNT=$(echo "$STEPS" | jq '.steps | length')
  LAST_TYPE=$(echo "$STEPS" | jq -r '.steps[-1].type // "none"')
  LAST_STATUS=$(echo "$STEPS" | jq -r '.steps[-1].status // "none"')
  echo "Steps: $COUNT | Last: $LAST_TYPE ($LAST_STATUS)"
  
  # 如果最后一步是 AI 回复且已完成，退出
  if [[ "$LAST_TYPE" == *"PLANNER_RESPONSE"* && "$LAST_STATUS" == *"DONE"* ]]; then
    echo "=== AI Reply ==="
    echo "$STEPS" | jq -r '.steps[-1].plannerResponse.modifiedResponse'
    break
  fi
  sleep 2
done
```

---

## 环境与配置接口

### `GET /api/servers` — Language Server 实例

**功能**: 列出所有正在运行的 `language_server_macos_arm` 进程及其端口、CSRF token、关联 workspace。

**Response** `200 OK`:
```json
[
  {
    "pid": 54642,
    "port": 52980,
    "csrf": "265bb393-840b-4f6b-8ce9-d02ddd7404e6",
    "workspace": "file:///path/to/Antigravity-Mobility-CLI"
  },
  {
    "pid": 4029,
    "port": 54187,
    "csrf": "023bbbe9-a7c0-4d2f-b034-f48f77f6b49c",
    "workspace": "file:///path/to/mytools"
  }
]
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `pid` | `number` | 操作系统进程 ID |
| `port` | `number` | gRPC HTTPS 端口 |
| `csrf` | `string` | CSRF Token（Gateway 内部使用） |
| `workspace` | `string` | 关联的 workspace `file://` URI |

---

### `GET /api/workspaces` — 所有已知 Workspace

**功能**: 从 SQLite `state.vscdb` 读取所有注册过的 workspace（含当前未运行的）。

**Response** `200 OK`:
```json
{
  "workspaces": [
    { "uri": "file:///path/to/mytools", "name": "mytools" }
  ],
  "playgrounds": [
    { "name": "vast-orion", "path": "~/.gemini/antigravity/playground/vast-orion" }
  ]
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `workspaces` | `Array` | 注册过的 workspace 列表 |
| `workspaces[].uri` | `string` | Workspace `file://` URI |
| `workspaces[].name` | `string` | 显示名称 |
| `playgrounds` | `Array` | 沙箱 playground 列表 |
| `playgrounds[].name` | `string` | Playground 名称 |
| `playgrounds[].path` | `string` | 磁盘绝对路径 |

---

### `POST /api/workspaces/launch` — 启动 Workspace

**功能**: 在 Antigravity IDE 中打开一个新的 workspace 窗口并启动其 language_server。

**Request Body**:

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `workspace` | `string` | ✅ | workspace `file://` URI |

```json
{ "workspace": "file:///path/to/my-project" }
```

**Response** `200 OK`:
```json
{ "ok": true }
```

> ⚠️ 启动是异步的。响应成功仅表示命令已发送，language_server 可能需要 5-30 秒才能完全就绪。建议轮询 `GET /api/servers` 等待目标 server 出现。

---

### `POST /api/workspaces/close` — 隐藏 Workspace

**功能**: 从 React 前端侧边栏隐藏指定 workspace。**不会杀死 language_server 进程**。

> ⚠️ **重要**: 此接口仅在前端 UI 层面隐藏 workspace，language_server 保持运行。这是有意设计 — 杀死 language_server 会导致 Antigravity IDE 崩溃。

**Request Body**:

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `workspace` | `string` | ✅ | 要隐藏的 workspace `file://` URI |

```json
{ "workspace": "file:///path/to/mytools" }
```

**Response** `200 OK`:
```json
{ "ok": true, "hidden": true }
```

---

### `GET /api/workspaces/close` — 列出已隐藏 Workspace

**功能**: 返回当前被隐藏的 workspace URI 列表。

**Response** `200 OK`:
```json
["file:///path/to/mytools"]
```

---

### `DELETE /api/workspaces/close` — 取消隐藏 Workspace

**功能**: 将之前隐藏的 workspace 重新显示在侧边栏。

**Request Body**:

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `workspace` | `string` | ✅ | 要取消隐藏的 workspace `file://` URI |

```json
{ "workspace": "file:///path/to/mytools" }
```

**Response** `200 OK`:
```json
{ "ok": true, "hidden": false }
```

### `GET /api/me` — 当前用户

**Response** `200 OK`:
```json
{
  "name": "Leon Nelson",
  "email": "leonnelson19898@gmail.com",
  "hasApiKey": true,
  "credits": { "clientModelConfigs": [ ... ] }
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `name` | `string` | 用户名 |
| `email` | `string` | 邮箱 |
| `hasApiKey` | `boolean` | 是否已登录（有 API Key） |
| `credits` | `object` | 模型配额信息（同 `/api/models` 返回） |

> ⚠️ `apiKey` 字段被有意隐藏，不对外暴露。

---

### `GET /api/models` — 可用模型与配额

**功能**: 从 language_server 获取当前可用的 AI 模型列表，含实时配额信息。

**Response** `200 OK`:
```json
{
  "clientModelConfigs": [
    {
      "label": "Claude Opus 4.6 (Thinking)",
      "modelOrAlias": { "model": "MODEL_PLACEHOLDER_M26" },
      "supportsImages": true,
      "isRecommended": true,
      "allowedTiers": [
        "TEAMS_TIER_PRO", "TEAMS_TIER_TEAMS",
        "TEAMS_TIER_ENTERPRISE_SELF_HOSTED", "TEAMS_TIER_ENTERPRISE_SAAS",
        "TEAMS_TIER_HYBRID", "TEAMS_TIER_PRO_ULTIMATE"
      ],
      "quotaInfo": {
        "remainingFraction": 1,
        "resetTime": "2026-03-19T01:31:23Z"
      },
      "supportedMimeTypes": {
        "image/jpeg": true, "image/png": true, "image/webp": true,
        "image/heic": true, "image/heif": true
      }
    },
    {
      "label": "Gemini 3.1 Pro (High)",
      "modelOrAlias": { "model": "MODEL_PLACEHOLDER_M37" },
      "supportsImages": true,
      "isRecommended": true,
      "tagTitle": "New",
      "quotaInfo": { "remainingFraction": 1, "resetTime": "2026-03-19T01:13:26Z" },
      "supportedMimeTypes": {
        "application/pdf": true, "application/json": true,
        "audio/webm;codecs=opus": true,
        "video/mp4": true, "video/webm": true,
        "text/plain": true, "text/markdown": true,
        "image/jpeg": true, "image/png": true
      }
    }
  ]
}
```

**Model Config 字段**:

| 字段 | 类型 | 说明 |
|------|------|------|
| `label` | `string` | 面向用户的模型显示名 |
| `modelOrAlias.model` | `string` | **内部模型 ID**（用于 `send` 接口的 `model` 参数） |
| `supportsImages` | `boolean?` | 是否支持图片输入 |
| `isRecommended` | `boolean?` | 是否推荐模型 |
| `tagTitle` | `string?` | 标签（如 "New"） |
| `allowedTiers` | `string[]` | 允许使用的订阅层级 |
| `quotaInfo.remainingFraction` | `number` | 剩余配额比例（1 = 满额，0 = 耗尽） |
| `quotaInfo.resetTime` | `string` | 配额重置时间（ISO 8601） |
| `supportedMimeTypes` | `object` | 支持的文件 MIME 类型映射 |

---

### `GET /api/skills` — 所有 Skills

**功能**: 从所有 language_server 聚合 Skills（全局 + 工作空间），去重后返回。

**Response** `200 OK`:
```json
[
  {
    "name": "algorithmic-art",
    "description": "Creating algorithmic art using p5.js with seeded randomness and interactive parameter exploration...",
    "path": "~/.gemini/antigravity/skills/algorithmic-art/SKILL.md",
    "baseDir": "file://~/.gemini/antigravity",
    "scope": "global"
  },
  {
    "name": "frontend-design",
    "description": "Create distinctive, production-grade frontend interfaces with high design quality...",
    "path": "~/.gemini/antigravity/skills/frontend-design/SKILL.md",
    "baseDir": "file://~/.gemini/antigravity",
    "scope": "global"
  }
]
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `name` | `string` | Skill 名称（可用于 `@` 触发） |
| `description` | `string` | 功能描述 |
| `path` | `string` | `SKILL.md` 文件的绝对路径 |
| `baseDir` | `string` | Skill 所在的根目录 |
| `scope` | `"global" \| "workspace"` | 作用域（全局或特定工作空间） |

---

### `GET /api/skills/:name` — 单个 Skill 详情

**URL 参数**: `:name` = Skill 名称（如 `frontend-design`）

**Response** `200 OK`: 返回 gRPC 原始 Skill 对象（含完整定义）。

**Response** `404`: `{ "error": "Skill not found" }`

---

### `GET /api/workflows` — 所有 Workflows

**功能**: 从所有 language_server 聚合 Workflows，去重后返回。

**Response** `200 OK`:
```json
[
  {
    "name": "ai-topic-discovery",
    "description": "AI 赛道自媒体选题发现与评估。从 MeiliSearch 新闻数据库扫描近期 AI 热点标题...",
    "path": "~/.gemini/antigravity/global_workflows/ai-topic-discovery.md",
    "content": "---\ndescription: ...\n---\n具体 workflow 步骤内容...",
    "scope": "global",
    "baseDir": "file://~/.gemini/antigravity"
  }
]
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `name` | `string` | Workflow 名称（可用于 `/` 触发） |
| `description` | `string` | 功能描述 |
| `path` | `string` | Workflow `.md` 文件绝对路径 |
| `content` | `string` | **完整的 Workflow markdown 内容**（含 YAML frontmatter） |
| `scope` | `"global" \| "workspace"` | 作用域 |
| `baseDir` | `string` | 所在根目录 |

---

### `GET /api/rules` — 自定义规则

**功能**: 从所有 language_server 聚合用户自定义规则。

**Response** `200 OK`:
```json
[
  {
    "name": "rule-name",
    "description": "规则描述",
    "path": "/path/to/rules.md",
    "content": "规则内容...",
    "scope": "global",
    "baseDir": "file:///..."
  }
]
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `name` | `string` | 规则名称 |
| `description` | `string` | 描述 |
| `path` | `string` | 规则文件绝对路径 |
| `content` | `string` | 完整规则内容 |
| `scope` | `"global" \| "workspace"` | 作用域 |

---

### `GET /api/analytics` — 用户使用分析

**功能**: 获取用户使用统计信息（gRPC `GetUserAnalyticsSummary`）。

**Response** `200 OK`: gRPC 原始返回。

---

### `GET /api/mcp` — MCP 配置

**功能**: 读取 `~/.gemini/antigravity/mcp_config.json` 的 MCP 服务器配置。

**Response** `200 OK`:
```json
{
  "servers": []
}
```

---

## 错误处理

所有接口统一的错误响应格式：
```json
{ "error": "错误描述信息" }
```

| HTTP Status | 含义 | 典型场景 |
|-------------|------|----------|
| `200` | 成功 | — |
| `404` | 未找到 | 对话 ID 不存在、Skill 名称不存在 |
| `500` | 服务器内部错误 | gRPC 调用失败、language_server 无响应 |
| `503` | 服务不可用 | 无运行中的 language_server、无 API Key（未登录） |

---

## Headless CLI 集成示例

### Python: 完整对话 + 等待回复

```python
import requests, time, json

BASE = "http://localhost:3000"

# 1. 查看有哪些 workspace 和模型
servers = requests.get(f"{BASE}/api/servers").json()
models = requests.get(f"{BASE}/api/models").json()
print("Workspaces:", [s["workspace"] for s in servers])
print("Models:", [(m["label"], m["modelOrAlias"]["model"]) 
                  for m in models["clientModelConfigs"]])

# 2. 创建对话
ws = servers[0]["workspace"]  # 使用第一个 workspace
r = requests.post(f"{BASE}/api/conversations", json={"workspace": ws})
cid = r.json()["cascadeId"]
print(f"Created conversation: {cid}")

# 3. 发送消息
requests.post(f"{BASE}/api/conversations/{cid}/send",
    json={"text": "列出项目中所有的 Python 文件", 
          "model": "MODEL_PLACEHOLDER_M26"})

# 4. 轮询等待 AI 完成
prev_count = 0
for i in range(60):
    time.sleep(2)
    r = requests.get(f"{BASE}/api/conversations/{cid}/steps")
    steps = r.json().get("steps", [])
    
    if len(steps) > prev_count:
        prev_count = len(steps)
        last = steps[-1]
        step_type = last.get("type", "").replace("CORTEX_STEP_TYPE_", "")
        status = last.get("status", "").replace("CORTEX_STEP_STATUS_", "")
        print(f"  [{i*2}s] Steps: {len(steps)} | {step_type} ({status})")
        
        # AI 回复完成
        if step_type == "PLANNER_RESPONSE" and status == "DONE":
            print("\n=== AI Reply ===")
            print(last["plannerResponse"]["modifiedResponse"])
            break
        
        # 需要审批
        if step_type == "NOTIFY_USER" and last.get("notifyUser", {}).get("isBlocking"):
            print("AI is waiting for approval!")
            # 自动 proceed
            requests.post(f"{BASE}/api/conversations/{cid}/proceed",
                json={"uri": "", "model": "MODEL_PLACEHOLDER_M26"})
```

### Shell: 一行式快速提问

```bash
CID=$(curl -sX POST http://localhost:3000/api/conversations \
  -H 'Content-Type: application/json' \
  -d '{"workspace":"file:///path/to/mytools"}' | jq -r .cascadeId) && \
curl -sX POST "http://localhost:3000/api/conversations/$CID/send" \
  -H 'Content-Type: application/json' \
  -d '{"text":"这个项目是做什么的？","model":"MODEL_PLACEHOLDER_M26"}' && \
echo "Waiting..." && sleep 15 && \
curl -s "http://localhost:3000/api/conversations/$CID/steps" | \
  jq -r '[.steps[] | select(.plannerResponse)] | last | .plannerResponse.modifiedResponse'
```

### Node.js: WebSocket 实时监听

```javascript
const WebSocket = require('ws');

const ws = new WebSocket('ws://localhost:3000/ws');
ws.on('open', () => {
  ws.send(JSON.stringify({ type: 'subscribe', cascadeId: 'your-cascade-id' }));
});
ws.on('message', (data) => {
  const msg = JSON.parse(data);
  if (msg.type === 'steps') {
    const { steps, status } = msg.data;
    console.log(`Steps: ${steps.length}, Status: ${status}`);
    
    const lastAI = [...steps].reverse().find(s => s.plannerResponse);
    if (lastAI) {
      console.log('AI:', lastAI.plannerResponse.modifiedResponse.slice(0, 200));
    }
    
    if (status === 'CASCADE_RUN_STATUS_IDLE') {
      console.log('AI finished.');
      ws.close();
    }
  }
});
```
