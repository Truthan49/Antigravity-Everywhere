import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Bot, Network, FolderKanban, Users, ShieldAlert, Sparkles, Code2, Zap } from "lucide-react";

interface BotHelpDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function BotHelpDrawer({ open, onOpenChange }: BotHelpDrawerProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      {/* We use z-[70] so it appears above the BotManagementPanel which is z-[60] */}
      <SheetContent className="w-[450px] sm:w-[540px] p-0 flex flex-col h-full bg-background border-l z-[70]" side="right">
        <SheetHeader className="px-6 py-5 border-b shrink-0 bg-muted/30">
          <SheetTitle className="flex items-center gap-2 text-lg">
            <Bot className="w-5 h-5 text-primary" />
            飞书机器人使用指南
          </SheetTitle>
          <SheetDescription className="mt-1.5">
            了解如何配置全局调度机器人与工作区专属机器人，实现高效的多智能体协作开发。
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 min-h-0 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden px-6 py-6">
          <div className="space-y-8 pb-10">
            
            {/* Section 1: Core Concepts */}
            <section className="space-y-3">
              <h3 className="text-sm font-bold flex items-center gap-2 text-foreground">
                <Network className="w-4 h-4 text-blue-500" />
                双层机器人架构
              </h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Antigravity 采用双层机器人架构来兼顾体验与隔离性：
              </p>
              <div className="grid gap-3 mt-2">
                <div className="bg-muted/40 border rounded-lg p-3.5 space-y-2">
                  <div className="flex items-center gap-2 font-medium text-xs text-indigo-500">
                    <Sparkles className="w-3.5 h-3.5" />
                    全局机器⼈ (Global Bot)
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    你的私有 AI 研发管家。它不与任何具体代码目录绑定，主要负责：跨项目调度、问询额度、工作区管理。支持 `/new` 创建工作区或 `/p` 选择工作区进行指令下发。
                  </p>
                </div>
                <div className="bg-muted/40 border rounded-lg p-3.5 space-y-2">
                  <div className="flex items-center gap-2 font-medium text-xs text-amber-500">
                    <FolderKanban className="w-3.5 h-3.5" />
                    工作区专属机器人 (Workspace Bot)
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    绑定到具体代码目录的干活机器。收到消息后直接路由到该项目的底层 Language Server 进程，无需命令前缀。非常适合多人协作或作为特定项目的代码阅读器。
                  </p>
                </div>
              </div>
            </section>

            {/* Section 2: Multiple Bots per Workspace */}
            <section className="space-y-3">
              <h3 className="text-sm font-bold flex items-center gap-2 text-foreground">
                <Users className="w-4 h-4 text-emerald-500" />
                多机器⼈同项目开发 (Multi-Agent)
              </h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                现在支持<strong>多个不同的飞书机器人同时开发同一个项目目录</strong>（物理共享）。
              </p>
              <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-3.5 text-[11px] text-emerald-700 dark:text-emerald-400 space-y-2.5 leading-relaxed">
                <p>
                  <strong>场景案例：</strong>你可以在飞书开放平台创建“前端研发助理”和“测试审核助理”两个独立的机器人。在左侧面板中点击 <span className="inline-block p-1 bg-background rounded border shadow-sm"><Bot className="w-3 h-3 inline" /> 添加工作区机器人</span>，将它们的 App ID <strong>分别绑定到同一个目标项目工作区</strong>。
                </p>
                <p>
                  不仅如此，你还能<strong>为它们指定不同的 AI 模型</strong>。例如前端 Agent 使用 <code>Gemini 3 Pro</code>，而无需写代码的侧重推理的测试 Agent 使用 <code>Claude Opus 4.6 (Thinking)</code>。
                </p>
                <p className="mt-2 font-medium">✨ 工作原理：每个连入的机器人在底层对应一个独立的 Cascade 回话线程，互不污染历史记录与上下文。</p>
              </div>
            </section>

            {/* Section 3: Configuration Guide */}
            <section className="space-y-3">
              <h3 className="text-sm font-bold flex items-center gap-2 text-foreground">
                <Code2 className="w-4 h-4 text-rose-500" />
                如何在飞书端配置接入？
              </h3>
              <ol className="text-xs text-muted-foreground space-y-3 list-decimal list-outside ml-4 ps-1 marker:text-muted-foreground/50">
                <li className="leading-relaxed pl-1 pt-0.5">
                  前往 <a href="https://open.feishu.cn/app" target="_blank" rel="noreferrer" className="text-primary hover:underline font-medium">飞书开发者平台</a> 创建企业自建应用，在“凭证与基础信息”获取 <code>App ID</code> 和 <code>App Secret</code>。
                </li>
                <li className="leading-relaxed pl-1 pt-0.5">
                  在“应用功能 -&gt; 机器人”开启机器人能力。
                </li>
                <li className="leading-relaxed pl-1 pt-0.5">
                  在“事件订阅”页面配置 WebSocket 长链接（Antigravity 默认采用 WebSocket 连接，无需暴露公网 IP）。
                </li>
                <li className="leading-relaxed pl-1 pt-0.5">
                  在“权限管理”中开通必要的机器人权限（收发消息、获取群信息等）。
                </li>
                <li className="leading-relaxed pl-1 pt-0.5">
                  回到本管理面板，填入 <code>App ID</code> 和 <code>App Secret</code>，点击保存即可建立连接！
                </li>
              </ol>
            </section>

            {/* Section 4: Tips */}
            <section className="space-y-3">
              <h3 className="text-sm font-bold flex items-center gap-2 text-foreground">
                <Zap className="w-4 h-4 text-purple-500" />
                进阶提示
              </h3>
              <ul className="text-xs text-muted-foreground space-y-2 leading-relaxed">
                <li className="flex gap-2">
                  <ShieldAlert className="w-3.5 h-3.5 text-muted-foreground/70 shrink-0 mt-0.5" />
                  <span>修改专属机器人的“指定模型”会实时生效，下一条对话即采用新模型。</span>
                </li>
                <li className="flex gap-2">
                  <ShieldAlert className="w-3.5 h-3.5 text-muted-foreground/70 shrink-0 mt-0.5" />
                  <span>若专属机器人状态为“🟡 等待连接”，通常是因为对应的项目工作区（Language Server 进程）未随系统启动。在下方拉起该工作区后即可自动连接。</span>
                </li>
              </ul>
            </section>

          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
