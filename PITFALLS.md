# Antigravity Gateway — 技术踩坑记录

> 踩过的坑不要再踩。每次解决重大问题后更新此文件。

---

## 坑 1：多 Server 对话分叉 — "stepCount 最高 = owner" 是错的

**日期**: 2026-03-18  
**现象**: React 前端发送消息后，Agent Manager 看不到；Agent Manager 发送后刷新 React 前端能看到。两边对话不同步。

**根因**:

Antigravity 会启动多个 `language_server` 实例（每个 workspace 一个）。所有对话的 `.pb` 文件在磁盘上共享 (`~/.gemini/antigravity/conversations/*.pb`)，所以**任何 server 都能 `LoadTrajectory` 加载任何对话**。

加载后，每个 server 在自己内存里维护一份独立的对话状态（in-memory fork）。当消息发到某个 server，只有那个 server 的内存更新，其他 server 完全不知道。

之前的修复 (Phase 4) 用 `GetAllCascadeTrajectories` 查所有 server 的 `stepCount`，选最高的作为 owner：

```typescript
// ❌ 错误逻辑
if (!existing || steps > existing.stepCount) {
  newMap.set(id, { port, csrf, apiKey, stepCount: steps });
}
```

实测 7 个 server 上同一个对话的状态：

| Server Port | Workspace | Steps |
|------------|-----------|-------|
| 57452 | rsscollect | **173** ← Gateway 选了这个 |
| **53642** | **mytools** | **148** ← Agent Manager 用的是这个 |
| 55204 | whirlpool | 173 |
| 49999 | pulsar | 145 |
| 49286 | orion | 143 |
| 53634 | workspace | 46 |

Gateway 把消息发到了 port 57452（rsscollect），而 Agent Manager 直连 port 53642（mytools）。两个 server 各自维护独立分叉，互不可见。

**正确逻辑**: owner = **对话所属 workspace 对应的 server**，不是 stepCount 最高的。Agent Manager 就是这样做的。

**修复**: `refreshOwnerMap` 中通过 trajectory 的 `workspaces[].workspaceFolderAbsoluteUri` 匹配 server 的 workspace，选匹配的那个。

**教训**:  
- `.pb` 文件共享 ≠ 对话状态共享。内存状态是隔离的。
- stepCount 高只说明这个 server 的分叉更长，不代表它是正主。
- 永远跟着 workspace 走，Agent Manager 的实现是标准答案。

---

## 坑 2：StreamAgentStateUpdates 连到错误 Server（已修复）

**日期**: 2026-03-17  
**现象**: 对话标题显示错误（"Discovering FishAI Topics" vs "Creating OpenAI Pricing Article"），步骤数跳变。

**根因**: 用 `tryServer(0)` 随机选 server 来建 streaming 连接。不同 server 的 `.pb` checkpoint 时间不同，返回不同的标题和步骤。

**修复**: 所有 per-conversation 操作（send、stream、cancel、revert、proceed）统一走 `getOwnerConnection()`。

---

## 坑 3：Checkpoint + Live Fork 合并导致 UI 闪烁（已修复）

**日期**: 2026-03-17  
**现象**: 步骤数在两个值之间反复跳动，Stop 按钮闪烁。

**根因**: 把 `GetCascadeTrajectorySteps`（checkpoint .pb）和 `GetCascadeTrajectory`（live in-memory fork）合并展示，导致重复步骤和步数震荡。

**修复**: 改用 `StreamAgentStateUpdates` 作为唯一实时数据源，不做合并。前端加了 monotonic guard（步数只增不减）。

---

## 坑 4：`StreamCascadeReactiveUpdates` 不可用

**日期**: 2026-03-17  
**现象**: 调用返回 `"reactive state is disabled"`。

**教训**: `StreamCascadeReactiveUpdates` 和 `StreamCascadeSummariesReactiveUpdates` 都被禁用了。用 `StreamAgentStateUpdates` 代替。

---

## 坑 5：`CancelCascadeSteps` vs `CancelCascadeInvocation`

**日期**: 2026-03-17  
**现象**: 取消运行中的 AI 生成不生效。

**教训**: 用 `CancelCascadeInvocation`，不是 `CancelCascadeSteps`。

---

## 坑 6：SQLite `state.vscdb` 是快照，不是实时数据

**日期**: 2026-03-17  
**现象**: 从 SQLite 读取的对话列表缺少最新对话。

**根因**: `trajectorySummaries` 是异步定期快照（5-15 分钟同步一次），不是实时的。窗口关闭/切换焦点时才可靠写入。

**教训**: 对话列表必须用 gRPC `GetAllCascadeTrajectories` 实时获取，SQLite 只作兜底。

---

## 坑 7：`.pb` 文件有完整列表但没标题

**日期**: 2026-03-17  

`~/.gemini/antigravity/conversations/*.pb` 有所有对话的文件，但文件名只有 UUID，没有标题信息。标题只能从 `GetAllCascadeTrajectories` 获取。

当前三层方案：
```
优先级 1: gRPC GetAllCascadeTrajectories → 实时标题 + workspace
优先级 2: 本地内存缓存 → 乐观 UI
优先级 3: SQLite → 兜底（老对话、server 未运行时）
底层:     .pb 文件扫描 → 完整列表 + 修改时间
```

---

## 坑 8：WebSocket 流订阅也必须刷新 ownerMap

**日期**: 2026-03-18  
**现象**: React 前端发送消息成功（路由修复后），但实时流没有推送 AI 回复。重新进入对话才能看到结果。

**根因**: WebSocket `subscribe` 时使用 `getOwnerConnection()` 但 **不刷新 ownerMap**。如果 ownerMap 是空的或过期的，流会连到错误的 server，自然收不到正确 server 上的实时更新。

**修复**: WebSocket subscribe handler 改为 async，订阅前先检查 ownerMap 是否过期（>30s）或缺失该对话，自动 `await refreshOwnerMap()`。断线重连时也刷新。

**教训**: 所有涉及特定对话的操作（send、stream、cancel、revert）都必须确保 ownerMap 是新鲜的。

---

## 坑 9：StreamAgentStateUpdates 发的是 delta，不是全量替换

**日期**: 2026-03-18  
**现象**: 发送消息后，WebSocket 连接正常，路由正确，但前端不显示新步骤。必须重新进入对话才能看到回复。

**根因**: `StreamAgentStateUpdates` 的推送模式是：
1. 订阅时推送一次 **全量步骤**（如 193 步）
2. 之后每次变化只推送 **delta**（1-2 个新步骤 + indices 位置信息）

之前的代码直接把 delta（1 步）作为完整数据发给前端，前端的 monotonic guard 看到 `newLen(1) < lastCount(193)` 就丢弃了。

**修复**: 后端维护一个 `fullSteps[]` 数组，用 `stepsUpdate.indices` 把 delta 合并进去，每次发送合并后的完整数组给前端。

```
修复前: 初始 193 步 → delta 1 步 → 前端收到 1 步 → guard 拒绝
修复后: 初始 193 步 → delta+合并 194 步 → 前端收到 194 步 → guard 通过 ✅
```

**教训**: `stepsUpdate.steps` 不是全量数据，必须配合 `stepsUpdate.indices` 和 `stepsUpdate.totalLength` 做合并。

---

## 关键 API 速查

| 方法 | 用途 | 注意 |
|------|------|------|
| `StreamAgentStateUpdates` | 实时对话状态 | **唯一可靠的实时源**，Connect 协议 |
| `GetCascadeTrajectorySteps` | checkpoint 步骤 | 只有 .pb 快照，不含最新内存数据 |
| `GetCascadeTrajectory` | live in-memory fork | 必须调正确的 server，否则 500 |
| `GetAllCascadeTrajectories` | 对话摘要列表 | 每个 server 各返回自己管理的 |
| `LoadTrajectory` | 加载 .pb 到内存 | 会创建新的 in-memory fork |
| `CancelCascadeInvocation` | 取消生成 | 不是 CancelCascadeSteps |

---

## 坑 10：Monotonic Guard 的 content-hash 优化反而吞掉了所有更新

**日期**: 2026-03-18  
**现象**: 发消息后前端完全无反应，必须手动刷新才能看到回复。重大退步。

**根因**:

为了支持流式文本（同一步 GENERATING 状态下文字增量更新），把原来的 `newLen > lastCount || statusChanged` guard 改为了 content-hash guard：

```typescript
// ❌ 错误优化
const hash = `${newLen}:${lastStatus}:${lastText.length}`;
if (hash !== lastUpdateHashRef.current) { setSteps(data); }
```

问题：**当最后一步不是 PLANNER_RESPONSE 时**（如 TASK_BOUNDARY、CODE_ACTION、EPHEMERAL_MESSAGE），`lastText.length` 始终为 0，hash 变成 `"N:DONE:0"`，每次都一样 → 所有后续更新被丢弃。

**修复**: 回到简单可靠的模式——只要步数不退步就接受更新：

```typescript
// ✅ 正确：接受 >= 当前步数的所有更新
if (newLen > 0 && newLen >= lastStepCountRef.current) {
  lastStepCountRef.current = newLen;
  setSteps(data);
}
```

**教训**: monotonic guard 只防一件事：步数退步（坑 9 的 delta 问题）。上面的 `>=` 既防退步，又允许同步数的流式更新通过。不要做"聪明"的优化。

---

## 坑 11：`workspace_id` 路径解码的深坑

**日期**: 2026-03-18  
**现象**: React 前端能创建对话，但在 Agent Manager 中的 `Antigravity-Mobility-CLI` 下看不到。

**根因**: 
通过解析 `ps` 命令中的 `--workspace_id` 参数来找语言服务器时，我们使用了朴素的 `replace(/_/g, '/')` 逻辑。
Antigravity 实际上把路径中的 `/` 和 `-` **都**替换成了 `_`。
例如: `/path/to/my-project-name`
被编码成了: `file_path_to_my_project_name`

朴素替换后变成了 `file:///path/to/my/project/name`。路径完全错误，导致我们的 Gateway 根据 URI 找不到对应的语言服务器，Fallback 到任意一个 server，把对话创建到了错的 server 上。

**修复**: 使用贪婪匹配 + `fs.existsSync` 的文件系统校验，尝试用 `-` 和 `_` 组合复原参数，真正还原正确的绝对路径。

---

## 坑 12：非 IDE 专属 Workspace 下的新建对话 (AddTrackedWorkspace)

**日期**: 2026-03-18  
**现象**: 给一个未通过 IDE (VSCode 环境) 打开的纯本地文件夹新建对话后，AI 无法获取该文件夹的内容上下文。

**根因**:
如果在没有专属 `language_server` 的目录下创建对话，Gateway 会 Fallback 到任意一个正在运行的 server。如果不做声明，这个被选中的 Server 根本不知道该 Workspace 文件夹的存在，无法挂载本地文件。

**修复**: 完全对标 Agent Manager，在请求 `StartCascade` 之前，必须先调用一次 `AddTrackedWorkspace` 强制让 Fallback server "认领"并监听这个文件夹。

---

## 坑 13：0 步的幽灵对话 (Ghost Conversations) 与视图注解

**日期**: 2026-03-18  
**现象**: 一旦创建 `StartCascade` 但未发送消息（0 个步骤），语言服务器在 `GetAllCascadeTrajectories` 时极大概率将其过滤掉（不返回），导致列表对不齐。

**根因**: Agent Manager 的标准操作是：创建后立刻打上一条 `UpdateConversationAnnotations`（写入 `lastUserViewTime`）。没有这个 Annotation 的 0 步空对话会被服务器判定为幽灵对话从而抛弃。

**修复**: 我们的 Web UI 分离了创建（Start Conversation 按钮）和发送（输入框回车）两个动作。为了确保在发第一条消息之前，空对话能在双方界面持久留存，必须在 `StartCascade` 成功获得 Cascade ID 后立即无缝调用 `UpdateConversationAnnotations`。

---

## 坑 14：非激活 Workspace 需要独立的 language_server

**日期**: 2026-03-19  
**现象**: 为未在 IDE 中打开的 workspace 创建对话后，AI 汇报了错误的工作目录（显示了 Fallback server 的 workspace）。

**根因**:
Agent Manager 为每个 workspace 启动**独立的 `language_server` 进程**。通过 `ps aux` 可以看到每个进程带有 `--workspace_id` 参数。当用户在一个没有运行 server 的 workspace 下新建对话时，Agent Manager 会先 spawn 新进程，然后往**新 server** 发 `AddTrackedWorkspace` + `StartCascade`。

我们的 web 前端之前直接 Fallback 到 `servers[0]`（随机一个已有 server），那个 server 的 `workspace_id` 是别的项目。AI 从 server 获取的上下文就是那个项目的文件列表和 active document，导致工作目录错误。

**修复**: Web 前端在 sidebar 中检测 workspace 是否有 running server：
- ✅ 有 → 直接创建对话
- ❌ 没有 → 弹窗提示用户先打开 workspace，通过 `antigravity --new-window <path>` CLI 启动
- 底部新增 **Servers** 管理面板，可以查看/启动/关闭 workspace server

**关键发现**:
- Agent Manager 的 `AddTrackedWorkspace` + `StartCascade` curl 中的 port，经常不在我们 `ps aux` 发现的列表中 → 说明 Agent Manager 是新 spawn 的 server
- `--extension_server_port` 和 `--extension_server_csrf_token` 参数每个 server 都不同，连接到各自 IDE 窗口
- `language_server` 二进制位于 `/Applications/Antigravity.app/Contents/Resources/app/extensions/antigravity/bin/language_server_macos_arm`

---

## 坑 15：ownerMap 的 `clear()` 竞态吞掉新对话（已修复）

**日期**: 2026-03-19  
**现象**: 新建对话后发消息，ownerMap 找不到 cascadeId，即使刚手动 `convOwnerMap.set()` 过。日志复现：

```
📌 [OwnerMap] Pre-registered d2c64309 → port 58823    ← 创建后立即注册
✅ [NewConv] ====== DONE ======
🔄 port=58823 returned 11 conversation(s)             ← server 还没同步新对话
🔄 Rebuilt: 12 total conversations mapped              ← clear() 吃掉了预注册！
💬 [SendMsg] ownerMapHas=false                         ← 找不到了
```

**根因**:
`refreshOwnerMap()` 每次执行时调用 `convOwnerMap.clear()` 重建。但 `GetAllCascadeTrajectories` 不是即时一致的——新建的对话需要几秒才会出现在返回中。同时 `refreshOwnerMap` 被多处调用（sendMessage、subscribe、定时器），在创建后几百毫秒内就会清掉预注册。

server 的返回甚至会**来回波动**：
```
port=58823 returned 11  ← 没有新对话
port=58823 returned 12  ← 出现了
port=58823 returned 11  ← 又消失了
port=58823 returned 12  ← 又回来了
```

**修复**: 独立的 `preRegisteredOwners` Map（60s TTL），不被 `clear()` 清除：

```typescript
export const preRegisteredOwners = new Map<string, OwnerInfo & { registeredAt: number }>();

// refreshOwnerMap 重建后合并回来
for (const [id, preReg] of preRegisteredOwners.entries()) {
  if (now - preReg.registeredAt > 60_000) {
    preRegisteredOwners.delete(id);        // 过期清除
  } else if (!convOwnerMap.has(id)) {
    convOwnerMap.set(id, preReg);           // server 没追上，保留预注册
  } else {
    preRegisteredOwners.delete(id);         // server 追上了，清预注册
  }
}
```

`getOwnerConnection()` 也增加了第二层查找：ownerMap → preRegistered → fallback。

---

## 坑 16：Agent Manager 看不到 Web 前端创建的对话（已确认，接受限制）

**日期**: 2026-03-19  
**现象**: Web 前端在正确的 server 上成功创建对话，AI 正确回复。但 Agent Manager 侧边栏始终看不到。

**根因**: Agent Manager 使用**独立的 IPC 状态同步机制** (`UnifiedStateSync`)，不通过 `GetAllCascadeTrajectories` 发现新对话。

**调查过程和验证结果**:

1. **gRPC 层无差异** — 完全复制 Agent Manager 的 curl 序列（AddTrackedWorkspace → StartCascade → UpdateAnnotations → SendMessage），语言服务器成功创建并存储对话，但 Agent Manager 仍看不到。

2. **逆向分析 extension.js** — Agent Manager 的对话列表来自扩展内部的 `subscribeToUnifiedStateSyncTopic(topic)` IPC 订阅。该订阅通过 `antigravityUnifiedStateSync.initIPCSubscription()` 获取初始状态，通过 `onDidUpdateTopicIPC` 接收增量推送。

3. **state.vscdb 注入测试** — 将对话写入 `antigravityUnifiedStateSync.trajectorySummaries` protobuf 数据后，重启 Antigravity 发现注入数据被覆盖。扩展在启动时用自己的内部记录重建 state.vscdb。

4. **对比验证** — 重启后 state.vscdb 中只保留了 Agent Manager 自己创建的对话（如 `fbd6fad1`），所有通过 gateway gRPC 创建的对话（包括 `0fe28d56`、`9bc3637d` 等）均不存在。

**数据流对比**:

```
Agent Manager 创建对话:
  Extension Host → gRPC (language_server) → 存储 .pb
                 → IPC (UnifiedStateSync) → 推送到 webview → 侧边栏显示 ✅

Gateway 创建对话:
  curl/Node.js → gRPC (language_server) → 存储 .pb
  ⚠️ Extension Host 的 IPC 层完全不知道 → 侧边栏不显示 ❌
```

**结论**: 这是 Antigravity 架构的内在限制。Extension Host 的 IPC 层是封闭的，外部无法注入对话到该层。**接受此限制**，Web 前端独立管理自己的对话列表。两端创建的对话在功能上完全等价（共享 .pb 文件），只是对话列表的可见性各自独立。

---

## 坑 17：关闭 Workspace ≠ 杀掉 Language Server

**日期**: 2026-03-19  
**现象**: 在 React 前端点击 Workspace 关闭按钮后，Antigravity IDE（Agent Manager）崩溃，报错 `Connection to server got closed. Server will restart.` + `ECONNREFUSED`。

**根因**: 原始实现直接调用 `process.kill(target.pid, 'SIGTERM')` 杀掉了 language_server 进程。这个进程是 Antigravity IDE 启动的，IDE 依赖它运行。杀掉后 IDE 失去连接并崩溃。

**修复**: 重新设计"关闭"语义 — **不杀进程，只隐藏**。

```
旧行为（危险）：
  PowerOff 按钮 → POST /api/workspaces/close → process.kill(pid, SIGTERM)
  → language_server 死亡 → Agent Manager 崩溃 ❌

新行为（安全）：
  EyeOff 按钮 → POST /api/workspaces/close → 写入 data/hidden_workspaces.json
  → 前端侧边栏隐藏该 workspace（server 继续运行）✅
  Eye 按钮 → DELETE /api/workspaces/close → 从隐藏列表移除 → 重新显示 ✅
```

**经验**: Web 前端**永远不应该**杀死 Antigravity 的内部进程。所有"关闭"操作都应该是前端级别的 UI 隐藏，不涉及后端资源销毁。Antigravity 自己的 Agent Manager 也为此提供了 "Keep in Background" 选项。
