# CDP 辅助 gRPC 逆向工程方案

> 利用 Chrome DevTools Protocol 加速 Antigravity gRPC 接口发现、验证和理解

## 背景

我们当前的逆向方式：
1. 从二进制中提取 `.proto` 定义 → 拿到方法名和字段编号
2. 猜测字段含义 → 试错调用 → 观察返回
3. 通过 `blackboxprotobuf` 解码 SQLite 中的 protobuf blob

这个方式**能用但很慢**：不知道字段语义、不知道调用顺序、不知道还有哪些未发现的功能。

**CDP 的价值**：Antigravity 是 Electron 应用，前端通过 gRPC-Web 调用 language_server。开启 CDP 后，我们可以直接看到 Antigravity 前端发出的**真实请求**，相当于"抄作业"。

---

## CDP 能帮我们做什么

### 1. 🔍 Network 抓包 — 发现未知 API

通过 CDP 的 `Network.requestWillBeSent` + `Network.responseReceived`，可以拦截所有 gRPC-Web 请求：

```javascript
// CDP 命令
await cdp.send('Network.enable');

cdp.on('Network.requestWillBeSent', (params) => {
  const url = params.request.url;
  if (url.includes('LanguageServerService')) {
    console.log(`📡 ${params.request.method} ${url}`);
    console.log(`   Body: ${params.request.postData?.slice(0, 200)}`);
  }
});
```

**能发现的东西**：
- 我们没用过的 gRPC 方法（可能有逐字流式、文件操作、设置修改等）
- 每个操作（发消息、切模型、删对话）的确切调用链
- 请求体中每个字段的实际值

### 2. 📊 解码请求/响应 — 理解字段语义

gRPC-Web 用 `application/connect+json` 或 `application/grpc-web+proto`。JSON 格式的可以直接读：

```javascript
cdp.on('Network.responseReceived', async (params) => {
  if (params.response.url.includes('LanguageServerService')) {
    const body = await cdp.send('Network.getResponseBody', {
      requestId: params.requestId
    });
    console.log(`Response: ${body.body.slice(0, 500)}`);
  }
});
```

**能搞清楚的：**
- `stepsUpdate` 中 `indices`、`totalLength` 各字段的确切含义
- `StreamAgentStateUpdates` 的完整 delta 格式
- protobuf field 9 vs field 17 到底哪个是 workspace（之前靠猜）

### 3. ⏱️ 调用时序图 — 理解业务流程

抓包记录全部请求的时间戳，自动生成调用序列：

```
T+0ms    SendUserCascadeMessage     → 发送消息
T+50ms   StreamAgentStateUpdates    → 收到 status RUNNING
T+120ms  StreamAgentStateUpdates    → delta: USER_INPUT 步骤
T+2300ms StreamAgentStateUpdates    → delta: PLANNER_RESPONSE 步骤
T+2400ms GetCascadeModelConfigData  → 刷新模型配额？
T+2500ms StreamAgentStateUpdates    → status IDLE
```

这样就能搞清楚：
- Agent Manager 是如何实现"逐字流式"效果的（是不是有多次 delta 推送？）
- 删除对话的完整流程（哪些 API？顺序？）
- 对话 rename 是怎么做的
- workspace 切换触发了什么

### 4. 🎯 Console 监听 — 发现调试信息

Antigravity 前端可能有 `console.log` 调试信息：

```javascript
await cdp.send('Runtime.enable');
cdp.on('Runtime.consoleAPICalled', (params) => {
  const text = params.args.map(a => a.value || a.description).join(' ');
  if (text.includes('cascade') || text.includes('grpc') || text.includes('stream')) {
    console.log(`[Console] ${text}`);
  }
});
```

### 5. 📦 Source 提取 — 逆向前端代码

从 Electron 的 bundled JS 中搜索 gRPC 调用代码：

```javascript
// 获取所有已加载的脚本
const scripts = await cdp.send('Debugger.enable');
cdp.on('Debugger.scriptParsed', (params) => {
  if (params.url.includes('workbench') || params.url.includes('cascade')) {
    console.log(`Script: ${params.url} (${params.length} bytes)`);
    // 可以 getScriptSource 获取完整源码
  }
});
```

搜索 `SendUserCascadeMessage`、`StreamAgentStateUpdates` 等关键词，找到前端的调用参数构造逻辑。

---

## 实施方案

### Phase 1: 被动嗅探 (最低风险)

用一个脚本自动连 CDP，记录所有 gRPC 调用，不做任何操作：

```bash
# 启动 Antigravity with CDP
antigravity --remote-debugging-port=9222

# 运行嗅探脚本
node scripts/cdp-sniffer.js
```

脚本输出类似：
```
[12:30:01.123] → GetAllCascadeTrajectories     body: {}
[12:30:01.456] ← GetAllCascadeTrajectories     response: {trajectories: [...]}
[12:30:05.789] → SendUserCascadeMessage         body: {cascadeId: "abc...", text: "hello"}
[12:30:05.800] ← SendUserCascadeMessage         response: {}
[12:30:06.100] ⇐ StreamAgentStateUpdates        delta: {status: "RUNNING"}
[12:30:08.500] ⇐ StreamAgentStateUpdates        delta: {steps: [...], indices: [173]}
```

### Phase 2: 对比验证

拿 CDP 抓到的真实请求，和我们 Gateway 发的请求做 diff：
- 字段是否一致？
- 我们有没有漏传必要字段？
- 响应解析是否正确？

### Phase 3: 新功能开发

利用 CDP 发现的新 API，扩展 Gateway 能力：
- 对话重命名
- 对话删除
- Settings 修改
- 逐字流式（如果存在的话）

---

## 我们要不要变成 CDP 路线？

**不需要。** CDP 用来**辅助发现**，gRPC 路线保持不变：

| | CDP 路线 (竞品) | gRPC 路线 (我们) + CDP 辅助 |
|---|---|---|
| 运行时 | 必须开 CDP | 不需要 CDP |
| 稳定性 | DOM 变了就崩 | protobuf 兼容性好 |
| 可编程 | 只能模拟操作 | 原生 REST API |
| CDP 角色 | **核心依赖** | **开发调试工具** |

CDP 是我们的**望远镜**，不是**发动机**。只在开发阶段用来发现和验证接口，生产环境完全不需要。

---

## 优先要探索的问题

1. **逐字流式到底有没有？** — 抓 Antigravity 自己的 StreamAgentStateUpdates，看 PLANNER_RESPONSE 是一次性推送还是多次 partial
2. **对话删除 API** — 抓删除操作的完整调用链
3. **Settings API** — 抓设置修改（主题、快捷键等）的接口
4. **完整的 stepsUpdate 格式** — 确认 indices / totalLength 的精确语义
5. **模型切换** — 看切换模型时发了什么请求

---

## 快速开始

```bash
# 1. 启动 Antigravity with CDP
/Applications/Antigravity.app/Contents/MacOS/Antigravity --remote-debugging-port=9222

# 2. 确认 CDP 可连接
curl -s http://localhost:9222/json/list | jq '.[0].title'

# 3. 运行嗅探脚本（待开发）
node scripts/cdp-sniffer.js
```
