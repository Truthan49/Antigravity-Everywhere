# 对话功能差距分析

> 基于 42MB 实时 gRPC 流量（145 个流式事件、13 个对话、23 种 Step 类型）。  
> 日期: 2026-03-18

---

## Step 类型覆盖率

### ✅ 已实现（15 种）

| Step 类型 | 前端渲染 | 备注 |
|---|---|---|
| `USER_INPUT` | ✅ 消息气泡 | — |
| `PLANNER_RESPONSE` | ✅ Markdown + 流式光标 | GENERATING 显示打字动画 |
| `TASK_BOUNDARY` | ✅ 模式/名称卡片 | — |
| `NOTIFY_USER` | ✅ 通知 + Proceed/Reject | 含 `blockedOnUser`/`pathsToReview`/`shouldAutoProceed` |
| `ERROR_MESSAGE` | ✅ 错误提示 | — |
| `CODE_ACTION` | ✅ 可折叠工具卡片 | 含 Create/Edit/Delete + 状态图标 |
| `VIEW_FILE` | ✅ 可折叠工具卡片 | — |
| `GREP_SEARCH` | ✅ 可折叠工具卡片 | — |
| `RUN_COMMAND` | ✅ 可折叠工具卡片 | 含 `safeToAutoRun` ⚡ 标识 |
| `SEARCH_WEB` | ✅ 可折叠工具卡片 | — |
| `LIST_DIRECTORY` | ✅ 可折叠工具卡片 | — |
| `FIND` | ✅ 可折叠工具卡片 | 新增 |
| `COMMAND_STATUS` | ✅ 可折叠工具卡片 | 新增 |
| `SEND_COMMAND_INPUT` | ✅ 可折叠工具卡片 | 新增 |
| `BROWSER_SUBAGENT` | ✅ 可折叠工具卡片 | 新增 |

### ❌ 未实现（8 种，按出现频率排序）

| Step 类型 | 出现次数 | 优先级 | 说明 |
|---|---|---|---|
| `EPHEMERAL_MESSAGE` | 1337 | ⚪ 低 | 系统消息（任务提醒、上下文）— 应隐藏 |
| `CHECKPOINT` | 54 | ⚪ 低 | 对话检查点 — 应隐藏 |
| `CONVERSATION_HISTORY` | 56 | ⚪ 低 | 内部上下文加载 — 应隐藏 |
| `KNOWLEDGE_ARTIFACTS` | 32 | ⚪ 低 | 知识库引用 — 可淡化 |
| `VIEW_CONTENT_CHUNK` | 10 | ⚪ 低 | URL 内容读取 |
| `READ_URL_CONTENT` | 2 | ⚪ 低 | URL 抓取 |
| `GENERATE_IMAGE` | 1 | ⚪ 低 | 图片生成 |
| `CODE_ACKNOWLEDGEMENT` | 1 | ⚪ 低 | 代码 diff 确认 |

> 以上 8 种均为内部/辅助类型，优先级低，隐藏即可。

---

## 已实现的协议特性

| 特性 | 状态 | 实现位置 |
|---|---|---|
| 流式文本（GENERATING 光标） | ✅ | `chat.tsx` PLANNER_RESPONSE |
| `notifyUser` 丰富字段 | ✅ | `types.ts` + `chat.tsx` |
| 级联状态（RUNNING/IDLE） | ✅ | `index.ts` → `api.ts` → `page.tsx` |
| 步骤状态生命周期 | ✅ | `chat.tsx` PENDING/RUNNING/CANCELED/ERROR 图标 |
| 增量更新（indices 合并） | ✅ | `index.ts` 后端合并 + `page.tsx` `>=` guard |

---

## 仍缺失的交互能力

### 1. 🔴 拒绝 / 取消活跃任务

**现状**: Reject 按钮存在但无后端实现（UI 有 XCircle 按钮但 onClick 为空）。

**需要**: 点击 Reject 后发送用户输入或调用 Cancel API。

### 2. 🟡 审查 + 评论

**现状**: `NOTIFY_USER(blockedOnUser=true)` 后只有 Proceed/Reject 按钮。

**需要**: 在 Proceed 旁边加文字输入框，允许用户写评论反馈。

### 3. 🟡 Fast 模式视觉区分

**现状**: Fast 模式和 Agent 模式渲染完全相同。

**需要**: 无 `TASK_BOUNDARY` 的纯对话流可用更简洁的聊天视图。

---

## 事件序列参考（来自抓包）

### Agent 模式完整流程
```
USER_INPUT → CONVERSATION_HISTORY → EPHEMERAL_MESSAGE
  → PLANNER_RESPONSE (GENERATING×N → DONE)
  → TASK_BOUNDARY (mode=PLANNING)
  → CODE_ACTION (PENDING → RUNNING → DONE) × N
  → CHECKPOINT
  → PLANNER_RESPONSE (GENERATING×N → DONE)
  → NOTIFY_USER (blockedOnUser=true, pathsToReview=[...])
  → USER_INPUT (用户 proceed 或 reject)
```

### Fast 模式流程
```
USER_INPUT → CONVERSATION_HISTORY → EPHEMERAL_MESSAGE
  → PLANNER_RESPONSE (GENERATING×N → DONE)
  → CHECKPOINT
```

---

## 关键数据结构

```jsonc
// StreamAgentStateUpdates 推送格式
{
  "update": {
    "conversationId": "xxx",
    "status": "CASCADE_RUN_STATUS_RUNNING",  // or IDLE
    "mainTrajectoryUpdate": {
      "stepsUpdate": {
        "indices": [3, 5, 6],   // 只推送变化的步骤索引
        "steps": [...],          // 对应索引的步骤数据
        "totalLength": 26        // 完整步骤数组长度
      }
    }
  }
}

// 步骤状态生命周期
// PENDING → RUNNING → GENERATING → DONE / CANCELED / ERROR

// notifyUser 完整字段
{
  "blockedOnUser": true,
  "shouldAutoProceed": false,
  "pathsToReview": ["/path/to/file.md"],
  "notificationContent": "请审查计划"
}
```
