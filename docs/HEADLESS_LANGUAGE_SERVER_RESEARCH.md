# 关于 Antigravity 语言服务器的 Headless 运行模式研究 (基于 cockpit-tools)

**研究背景**：
在 [cockpit-tools](https://github.com/jlcodes99/cockpit-tools) 项目中，发现了一种脱离主流 IDE (VSCode / Jetbrains) ，以 Headless（无头守护进程）模式直接启动并控制 Antigravity `language_server` 的高级用法。

目前 Antigravity Gateway 是基于“寄生”模式运行的，即依赖用户在 IDE 中开启工作区并启动插件后，Gateway 才能拦截并代理其端口。通过分析该项目的 `wakeup_gateway.rs` 源码，我们记录下了脱离 IDE 独立运行 AI Cascade 引擎的技术路线，以备未来架构演进之参考。

---

## 核心技术实现路径

cockpit-tools 通过实现一个伪造的“扩展服务端 (Extension Server)”，成功“欺骗”并拉起了官方的二进制文件，并在进程外构建了完整的 GRPC-HTTP 桥接调用链。具体分为三个核心步骤：

### 1. 强行拉起官方 `language_server` 二进制
程序会探测 `/Applications/Antigravity.app` 内部结构，定位到内部的 `language_server` 核心执行流。它作为子进程并携带特定环境参数启动：
- `--enable_lsp` / `--random_port`: 开启基础服务和随机端口
- `--csrf_token` / `--extension_server_csrf_token`: 注入伪造的防跨站校验 token
- `--extension_server_port`: **关键**，传入下一步中自己伪造的一个本地 TCP 端口
- 将生成的 `metadata` (伪造版本指纹如 `ide_name: "Antigravity"`, 设备指纹等) 以 Protobuf 格式直接写入到进程的标准输入 (stdin) 中完成握手。

### 2. 模拟 IDE Extension Server 握手
`language_server` 启动后会尝试回调传入的 `--extension_server_port` 报告它的状态。
- cockpit-tools 运行了一个基于 `tokio/rustls` 的本地 HTTPS Server。
- 实现了 `LanguageServerStarted` 的 RPC 解析，从而拿到真实的 `https_port` 和 `lsp_port`。
- 伪造 `SubscribeToUnifiedStateSyncTopic` 的返回（包含反序列化出的 `uss-oauth` 及 OAuth token），让 server 认为当前用户已经登录。 
- 对于所有其他不需要支持的功能探测（比如 `CheckTerminalShellSupport`, `GetBrowserOnboardingPort`），均返回空值。

### 3. 基于 GRPC-JSON 反向调用 AI 模块 (Cascade)
拿到语言服务器端口后，程序通过标准 HTTP POST 发送 JSON payload，调用内置的 GRPC 路由触发 AI 对话：
- `/exa.language_server_pb.LanguageServerService/StartCascade`: 开启一个新的对话轨迹 (获取 `cascadeId`)。
- `.../SendUserCascadeMessage`: 注入 JSON 解析得到的对话历史，并带上强行配置的 `cascadeConfig` (指定 `planModel` 和 `maxOutputTokens`) 从而给 AI 引擎发送指令。
- `.../GetCascadeTrajectory`: 此接口用来轮询对话状态。通过不断解析 `steps` 中的 `plannerResponse.value.modifiedResponse` 获得最终输出。

---

## 当前 Gateway 项目架构的对比与决策

### 对未来的潜在价值
1. **全局独立唤醒模式 (Spotlight 模式)**：未来如果需要做一个系统级的悬浮窗输入框，随时直接唤醒 Agent Manager，不需要依赖用户当前是否打开了某个 IDE 项目，即可采用此模式拉起一个虚拟的 `language_server` 守护进程。
2. **底层黑客级拓展 (Unified State Sync 注入)**：研究其中 Protobuf 的构造方式，使我们不仅能监听 IDE 状态，还可以强行给 language_server 推送虚拟的编辑器状态修改。

### 当前决策：暂不实施
这套机制目前对现有的 Antigravity Gateway 不是强需求：
1. **核心场景差异**：Gateway 和 Agent Manager 当前的核心使命是——**复用用户已在 IDE 中打开的成熟工作区 (Workspace)**，借助 IDE 里面已有的终端、上下文、文件树状态来跑代码和修 Bug。如果完全抽出在一个独立不可见的目录里跑 Headless server，它将失去获取用户真实编辑器视角的红利。
2. **高维护成本与被封禁风险**：该黑科技绕过了所有官方鉴权流程并大量使用非公开 RPC 接口 (如强行模拟 `Extension Server` 的内部互斥逻辑)，随着 Antigravity 客户端更新极易失效。

**结论**：这份极具启发性的源码研究已在此归档。在 Agent Manager 走向完全独立桌面客户端之前，目前依然维持基于 VSCode 等宿主 IDE 的平滑拦截架构。
