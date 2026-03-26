# Antigravity SQLite (`state.vscdb`) 完整数据地图

## 1. 对话何时写入 SQLite？

`trajectorySummaries` (222KB, base64 protobuf) 是 Antigravity 的**异步定期快照**，不是实时的。

| 事件 | 是否立即写入 SQLite |
|------|---------------------|
| 创建新对话 (`StartCascade`) | ❌ 不会立即写入 |
| 发送消息 | ❌ 不会立即写入 |
| 对话完成/空闲 | ⚠️ 可能在下次同步时写入 |
| 窗口关闭/切换焦点 | ✅ 触发同步（最可靠的时机） |
| 定期同步 | ✅ 约每 5-15 分钟自动同步 |

> **根因**: Antigravity 的 sidebar 不依赖 SQLite —— 它通过 IPC 直接与 language_server 通信获取实时数据。SQLite 只是用于跨窗口/跨重启的持久状态。

### notification 键的作用
```
antigravity.notification.{cascadeId}-{stepId} = "true"
```
每次 `notify_user` 被审批（Proceed），Antigravity 就写入一条。这些 **是实时的**。格式: `{对话ID}-{步骤序号}`。这意味着：
- 我们可以通过 notification 键推断哪些对话存在且活跃
- 但这只有在 notify_user 被触发时才有

---

## 2. Antigravity 统一状态同步键 (`antigravityUnifiedStateSync.*`)

| 键 | 大小 | 内容 |
|----|------|------|
| `.trajectorySummaries` | 222 KB | 对话列表快照 (protobuf, ~44-50 条对话, 含标题+workspace) |
| `.artifactReview` | 59 KB | 所有 artifact 的审批状态 (per-file review state + metadata) |
| `.sidebarWorkspaces` | 10 KB | 32 个已知 workspace URI 列表 |
| `.userStatus` | 5 KB | 用户 profile + API 能力配置 (支持的 MIME types 等) |
| `.theme` | 20 KB | 完整主题配置 |
| `.oauthToken` | 732 B | OAuth token |
| `.modelCredits` | 116 B | 模型额度信息 |
| `.browserPreferences` | 776 B | 浏览器工具偏好 |
| `.agentPreferences` | 388 B | Agent 偏好 (见下) |
| `.agentManagerWindow` | 160 B | Agent Manager 窗口状态 |
| `.modelPreferences` | 68 B | 默认模型选择 |
| `.scratchWorkspaces` | 176 B | 当前 Playground workspace URI |
| `.windowPreferences` | 44 B | 窗口偏好 |
| `.tabPreferences` | 56 B | Tab 偏好 |
| `.editorPreferences` | 0 B | (空) |
| `.overrideStore` | 56 B | 覆盖配置 |
| `.enterprisePreferences` | 48 B | 企业版偏好 |
| `.onboarding` | 84 B | 新手引导状态 |
| `.seenNuxIds` | 52 B | 已看过的 NUX IDs |

### agentPreferences 解码

| 策略键 | 含义 |
|--------|------|
| `terminalAutoExecutionPolicySentinelKey` | 终端命令自动执行策略 (EAM = EAGER) |
| `artifactReviewPolicySentinelKey` | Artifact 审批策略 (EAE = ALWAYS) |
| `allowCascadeAccessGitignoreFilesSentinelKey` | 允许访问 .gitignore 文件 |
| `allowAgentAccessNonWorkspaceFilesSentinelKey` | 允许访问工作区外文件 |
| `enableSoundsForSpecialEventsSentinelKey` | 特殊事件提示音 (CAA = 关闭) |
| `planningModeSentinelKey` | 规划模式 (CAI) |

---

## 3. Skills, Workflows, Subagents, MCP — 不在 SQLite 中！

> [!IMPORTANT]
> **Skills, Workflows, Subagents, MCP 服务器的配置都不存储在 SQLite 中。**

### 它们的实际位置

| 类型 | 发现方式 | 存储位置 |
|------|----------|----------|
| **Skills** | 运行时文件系统扫描 | `{workspace}/.agents/skills/` 或 `~/.gemini/antigravity/skills/` |
| **Workflows** | 运行时文件系统扫描 | `{workspace}/.agents/workflows/` |
| **Subagents** | 内置于 language_server 二进制 | 不可配置 |
| **MCP Servers** | JSON 配置文件 | `~/.codeium/antigravity/mcp_config.json` 或 `~/.antigravity/mcp.json` |

### 工作区级 SQLite 中的相关键

每个工作区的 `workspaceStorage/{hash}/state.vscdb` 只存储 UI 状态：
```
antigravity.agentViewContainerId.state               (77 B) — Agent 面板展开/折叠
antigravity.agentViewContainerId.numberOfVisibleViews (1 B)  — 可见子面板数
workbench.view.extension.antigravity-skills-container.state (63 B) — Skills 面板状态
```
这些只是 **UI 展示状态**（面板是否折叠），不是 skill 定义本身。

---

## 4. 其他全局键

| 键 | 大小 | 内容 |
|----|------|------|
| `antigravityAuthStatus` | 4.5 KB | 登录状态 + API Key + 用户名 |
| `antigravity.profileUrl` | 578 B | 头像 URL |
| `antigravityChangelog/lastVersion` | 6 B | 最后看到的 changelog 版本 |
| `antigravityOnboarding` | 4 B | 新手引导完成状态 |
| `antigravityAnalytics.clearcutBuffer` | 2 B | 分析数据缓冲 |
| `antigravityAnalytics.lastUploadTime` | 13 B | 上次上报时间 |

---

## 5. 对 Agent Manager 的意义

### 可利用的数据
- ✅ `trajectorySummaries` — 对话列表（虽然有延迟）
- ✅ `notification` 键 — 判断哪些对话有活跃的审批操作
- ✅ `agentPreferences` — 读取/修改自动审批策略
- ✅ `artifactReview` — 读取所有 artifact 的审批状态

### 不在 SQLite 的数据
- ❌ 实时对话列表 — 只能通过 language_server API 或 brain 目录扫描
- ❌ Skill 定义 — 从文件系统 `.agents/skills/` 读取
- ❌ Workflow 定义 — 从文件系统 `.agents/workflows/` 读取
- ❌ MCP 服务器配置 — 从 `mcp_config.json` 读取

---

## 6. 对话列表数据源对比 — 最终结论 (2026-03-17)

> [!IMPORTANT]
> **已验证：不要再重复做此对比。当前三层方案是最优的。**

### 三种数据源实测

| 数据源 | 条数 | 有标题数 | 延迟 | 说明 |
|--------|------|----------|------|------|
| gRPC `getAllCascadeTrajectories` | 取决于运行中的 server | **最多** | **实时** | 每个 language_server 返回它管理的对话 |
| `state.vscdb` → `trajectorySummaries` | 59 | 54 | 5-15 min 快照 | 异步同步，窗口关闭时才可靠写入 |
| `.pb` 文件扫描 (`~/.gemini/antigravity/conversations/`) | **100** | 0 | **实时** | 只有文件时间戳，无标题 |

### 覆盖关系

```
vscdb 有标题而 API 没有: 0 条   ← vscdb 是 API 的子集
API 有标题而 vscdb 没有: 9 条   ← gRPC 实时数据更全
两者都有标题:           19 条
```

> [!CAUTION]
> `state.vscdb` 的 `trajectorySummaries` 是**快照**，比 gRPC 实时数据少。不要用它替代 gRPC。

### ✅ 最终采用的三层方案 (`/api/conversations`)

```
优先级 1: gRPC getAllCascadeTrajectories  → 实时标题 + workspace (最准)
优先级 2: 本地内存缓存                      → 乐观 UI (startCascade 后立即可见)
优先级 3: SQLite getConversations          → 兜底 (老对话、server 未运行时)
底层:     .pb 文件扫描                      → 完整列表 + 真实修改时间
```

### 关键 gRPC 方法  

| 方法 | 用途 | 状态 |
|------|------|------|
| `GetAllCascadeTrajectories` | 列出当前 server 管理的对话摘要 | ✅ 主力 |
| `LoadTrajectory(cascadeId)` | 加载 .pb 文件到 server 内存 | ✅ 可用 |
| `GetCascadeTrajectorySteps(cascadeId)` | 获取完整对话步骤 | ✅ 可用 |
| `StreamCascadeSummariesReactiveUpdates` | 实时推送 | ⚠️ `reactive state is disabled` |
| `GetCascadeTrajectory(cascadeId)` | 获取 **live 内存数据**（活跃分支） | ✅ 必须调用拥有该对话的 server |

### 不可行的方案（已排除）

| 方案 | 原因 |
|------|------|
| 纯 `state.vscdb` | 快照延迟 5-15min，只有 59 条（vs .pb 100 条） |
| 纯 `.pb` 文件扫描 | 没有标题，只有 UUID + 时间戳 |
| `StreamCascadeSummariesReactiveUpdates` | 返回 `reactive state is disabled` |
| `LoadTrajectory` + `GetSteps` 逐个加载 | 100 条太慢（每条 ~500ms）|

---

## 7. 活跃对话实时数据获取 — 最终方案 (2026-03-17 22:20)

> [!IMPORTANT]
> `GetCascadeTrajectorySteps` 只返回 **.pb 快照**（checkpoint 数据），**不包含内存中的最新交互**。活跃对话必须用 `GetCascadeTrajectory` 补充。

### 问题

| API | 返回步数 | 来源 | 说明 |
|-----|---------|------|------|
| `GetCascadeTrajectorySteps` | 681 | .pb checkpoint | 只到上次 checkpoint，缺失最新数据 |
| `GetCascadeTrajectory` | 262 | **live 内存** | 当前活跃 fork 分支 |
| `GetAllCascadeTrajectories.stepCount` | 1773 | 统计汇总 | 681 + 262 + overhead ≈ 1773 |

### 完整对话数据 = checkpoint + live fork

```
完整对话 = GetCascadeTrajectorySteps (checkpoint .pb)
          + GetCascadeTrajectory    (live in-memory fork)
```

### 关键注意

1. **`GetCascadeTrajectory` 必须调正确的 server** — 对话只在管理它的 language_server 上有内存数据。调错 server 返回 500 `trajectory not found`
2. **如何找正确的 server**: `GetAllCascadeTrajectories` 返回每个 server 管理的对话列表，`status: RUNNING` 表示活跃
3. **IDLE 对话**: `GetCascadeTrajectory` 对已完成对话可能返回空（数据已全部 checkpoint 到 .pb），此时 `GetCascadeTrajectorySteps` 就够了
4. **trajectoryId 会变**: 每次对话交互可能 fork 出新的 trajectoryId，以 `GetAllCascadeTrajectories` 返回的为准

### 实现建议

```
展示对话内容:
  1. GetCascadeTrajectorySteps(cascadeId)  → checkpoint 数据
  2. 如果 status == RUNNING:
       GetCascadeTrajectory(cascadeId)      → 追加 live fork 数据
  3. 合并渲染
```
