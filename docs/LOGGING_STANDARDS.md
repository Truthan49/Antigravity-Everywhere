# Antigravity Gateway Logging Standards

为了保证系统稳定性与问题排查的高效性，Antigravity Gateway 坚决弃用传统的 `console.log`，全面采用 Pino 结构化日志系统。

本规范适用于所有新增模块开发与日常维护。

## 1. 日志分类架构

所有的日志必须归属到以下三个核心子系统之一：

| 分类 (Category) | 主要职责 | 匹配的 Module Name(示例) | 保存路径 |
|---|---|---|---|
| **Conversation** | 处理 LLM 消息流、Agent Manager 交互、轨迹生成与回退逻辑 | `NewConv`, `SendMsg`, `Proceed`, `Revert`, `Steps` | `logs/conversation.*.log` |
| **Workspace** | 工作区进程启停、IDE窗口管理、文件级操作 | `Launch`, `Close`, `Kill`, `FileSearch`, `Workspace` | `logs/workspace.*.log` |
| **System** | 底层连接与服务支持，如语言服务器发现、隧道构建、WebSocket 管理 | `Server`, `Discovery`, `Gateway`, `Tunnel` | `logs/system.*.log` |

> ⚠️ 如果你要开发一个**全新模块**（例如 `api/plugins`），请在 `src/lib/logger.ts` 的路由逻辑中，将你的 `module` 名称映射到上述某一分类中，或者如有必要，新增第四个分类流。

## 2. 如何记录日志？

**禁止使用**: `console.log`, `console.info`, `console.warn`, `console.error`

**推荐用法**:

```typescript
// 1. 在文件顶部引入 Logger
import { createLogger } from '@/lib/logger';

// 2. 声明 Module Name (首字母大写，简短有力)
const log = createLogger('PluginManager');

export function initPlugin() {
  // INFO: 正常业务流向与状态变更
  log.info({ pluginId: '123' }, 'Plugin loaded successfully');

  // DEBUG: 辅助排障的详细数据（平时不展示）
  log.debug({ rawPayload: { ... } }, 'Parsing intricate plugin data');

  try {
    // ...
  } catch(e: any) {
    // ERROR: 必须携带 err 信息以及上下文
    log.error({ err: e.message, pluginId: '123' }, 'Failed to load plugin due to syntax error');
  }
}
```

## 3. Pino 日志数据标准

为了在 `LogViewerPanel` 控制台中得到最好的展示效果，请遵守以下对象传递规范：

1. **附带上下文的对象必须放在第一个参数**:  
   ✅ 正确: `log.info({ userId: 123 }, "User logged in")`  
   ❌ 错误: `log.info("User logged in", { userId: 123 })`  
2. **记录错误时必须遵循 `err` 字段名**:  
   前端日志面板对 `err` 做了特定格式保护，请尽量写 `log.error({ err: e.message }, "Error message")`
3. **不要把过大的二进制/全文打进日志**:  
   大型文件、Base64 字符串应当被过滤计算为 `length` 后再进行记录。

## 4. 本地查看与排障

- **前端 UI**: 点击左下角的 `<Terminal /> Logs` 面板，支持多分类切换与自动轮询刷新。
- **纯终端**: `tail -f logs/conversation.1.log | npx pino-pretty`
- **动态开启 DEBUG**: `LOG_LEVEL=debug npm run dev`
