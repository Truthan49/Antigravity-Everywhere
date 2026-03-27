import React from 'react';
import { cn } from '@/lib/utils';
import { ChevronDown, ChevronUp, BookOpen, Terminal, BotMessageSquare, Globe, Activity, Puzzle, Loader2, Zap, Pencil, Trash2, Plus, ScrollText, Eye, EyeOff, PowerOff, Power, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { Skill, Workflow, Rule, CloudSkill } from '@/lib/types';
import { CloudDownload, Star, Download as ArrowDownToLine } from 'lucide-react';

interface AssetPanelProps {
  bottomPanelOpen: boolean;
  setBottomPanelOpen: React.Dispatch<React.SetStateAction<boolean>>;
  filteredSkills: Skill[];
  filteredWorkflows: Workflow[];
  filteredRules: Rule[];
  wsOptions: [string, { hidden: boolean; running: boolean; name: string }][];
  activeWorkspace: string;
  skills: Skill[];
  skillInstallLoading: string | null;
  handleInstallSkill: (s: Skill) => void;
  setNewFlowDialogOpen: (open: boolean) => void;
  handleOpenWorkflow: (path: string) => void;
  handleDeleteWorkflow: (path: string, name: string) => void;
  handlePromoteWorkflow: (path: string) => void;
  setNewRuleDialogOpen: (open: boolean) => void;
  handleOpenRule: (path: string) => void;
  handleDeleteRule: (path: string, name: string) => void;
  handlePromoteRule: (path: string) => void;
  handleUnhideWorkspace: (uri: string) => void;
  handleCloseWorkspace: (uri: string) => void;
  closingWs: string | null;
  setCloseTarget: (uri: string) => void;
  setCloseDialogOpen: (open: boolean) => void;
  handleLaunchWorkspace: (uri: string) => void;
  onKnowledgeOpen?: () => void;
  onLogsOpen?: () => void;
  onBotManagementOpen?: () => void;
  setTunnelConfigOpen: (open: boolean) => void;
  setAnalyticsOpen: (open: boolean) => void;
  setImportSkillDialogOpen: (open: boolean) => void;
  onStoreOpen?: () => void;
}

export function AssetPanel({
  bottomPanelOpen,
  setBottomPanelOpen,
  filteredSkills,
  filteredWorkflows,
  filteredRules,
  wsOptions,
  activeWorkspace,
  skills,
  skillInstallLoading,
  handleInstallSkill,
  setNewFlowDialogOpen,
  handleOpenWorkflow,
  handleDeleteWorkflow,
  handlePromoteWorkflow,
  setNewRuleDialogOpen,
  handleOpenRule,
  handleDeleteRule,
  handlePromoteRule,
  handleUnhideWorkspace,
  handleCloseWorkspace,
  closingWs,
  setCloseTarget,
  setCloseDialogOpen,
  handleLaunchWorkspace,
  onKnowledgeOpen,
  onLogsOpen,
  onBotManagementOpen,
  setTunnelConfigOpen,
  setAnalyticsOpen,
  setImportSkillDialogOpen,
  onStoreOpen
}: AssetPanelProps) {

  return (
    <div className={cn("flex flex-col shrink-0 bg-muted/20 transition-all duration-300", bottomPanelOpen ? "h-[260px] p-4 pt-1 border-t" : "h-[45px] p-1 border-t")}>
      <div className="flex items-center justify-between mb-1 px-3 mt-1 cursor-pointer" onClick={() => setBottomPanelOpen(!bottomPanelOpen)}>
        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground hidden md:block group-hover:text-foreground transition-colors">资产与监控 (Assets)</span>
        <Button variant="ghost" size="icon" className="h-6 w-6 ml-auto hover:bg-muted">
          {bottomPanelOpen ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronUp className="h-4 w-4 text-muted-foreground" />}
        </Button>
      </div>
      {bottomPanelOpen && (
      <Tabs defaultValue="skills" className="w-full h-full flex flex-col min-h-0">
        <div className="w-full border-b overflow-x-auto scrollbar-hide">
          <TabsList className="flex w-fit justify-start h-8 px-1 py-0.5 bg-background border-none">
            <TabsTrigger 
              value="store_fake" 
              className="text-[10px] font-bold shrink-0 min-w-fit px-3 cursor-pointer text-indigo-500"
              onPointerDown={(e) => {
                e.preventDefault();
                onStoreOpen?.();
              }}
            >
              <CloudDownload className="w-3 h-3 mr-1" />云端发现
            </TabsTrigger>
            <TabsTrigger value="skills" className="text-[10px] font-bold shrink-0 min-w-fit px-3 cursor-pointer">
              本地技能
            </TabsTrigger>
            <TabsTrigger value="flows" className="text-[10px] font-bold shrink-0 min-w-fit px-3 cursor-pointer">
              工作流
            </TabsTrigger>
            <TabsTrigger value="rules" className="text-[10px] font-bold shrink-0 min-w-fit px-3 cursor-pointer">
              规则
            </TabsTrigger>
            <TabsTrigger value="servers" className="text-[10px] font-bold shrink-0 min-w-fit px-3 cursor-pointer">
              工作区
            </TabsTrigger>
            <TabsTrigger value="knowledge" className="text-[10px] font-bold shrink-0 min-w-fit px-3 cursor-pointer" onClick={() => onKnowledgeOpen?.()}>
              <BookOpen className="w-3 h-3 mr-0.5" />知识库
            </TabsTrigger>
            <TabsTrigger value="logs" className="text-[10px] font-bold shrink-0 min-w-fit px-3 cursor-pointer" onClick={() => onLogsOpen?.()}>
              <Terminal className="w-3 h-3 mr-0.5" />日志
            </TabsTrigger>
            <TabsTrigger 
              value="feishu_fake" 
              className="text-[10px] font-bold shrink-0 min-w-fit px-3 cursor-pointer"
              onPointerDown={(e) => {
                e.preventDefault();
                onBotManagementOpen?.();
              }}
            >
              <BotMessageSquare className="w-3 h-3 mr-0.5 text-indigo-500" />飞书配置
            </TabsTrigger>
            <TabsTrigger value="tunnel" className="text-[10px] font-bold shrink-0 min-w-fit px-3 cursor-pointer" onClick={() => setTunnelConfigOpen(true)}>
              <Globe className="w-3 h-3 mr-0.5 text-emerald-500" />内网穿透
            </TabsTrigger>
            <TabsTrigger 
              value="analytics_fake"
              className="text-[10px] font-bold shrink-0 min-w-fit px-3 cursor-pointer" 
              onPointerDown={(e) => {
                e.preventDefault(); // Prevent tab switch
                setAnalyticsOpen(true);
              }}
            >
              <Activity className="w-3 h-3 mr-0.5 text-blue-500" />周报看板
            </TabsTrigger>
          </TabsList>
        </div>
        
        <div className="flex-1 overflow-hidden min-h-0 mt-3">
          <ScrollArea className="h-full">
            <TabsContent value="skills" className="m-0 space-y-4 pr-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-muted-foreground">技能列表</span>
                <div 
                  className="flex items-center gap-1 h-5 px-1.5 rounded-sm bg-muted/50 hover:bg-muted text-[10px] text-muted-foreground hover:text-foreground cursor-pointer transition-colors"
                  onClick={() => setImportSkillDialogOpen(true)}
                  title="导入本地系统中的技能文件夹作为全局技能"
                >
                  <Plus className="h-3 w-3" /> 导入全局
                </div>
              </div>
              {filteredSkills.length > 0 ? filteredSkills.map(s => (
                <div key={s.name} className="space-y-1 group">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <Puzzle className="w-3.5 h-3.5 text-indigo-500/70 shrink-0" />
                      <span className="text-xs font-semibold truncate group-hover:text-primary transition-colors">{s.name}</span>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {s.scope === 'global' && activeWorkspace && !skills.some(local => local.scope === 'workspace' && local.name === s.name) && (
                        <button
                          disabled={skillInstallLoading === s.name}
                          onClick={() => handleInstallSkill(s)}
                          className="text-[9px] px-1.5 py-0.5 rounded border border-indigo-500/30 text-indigo-500 hover:bg-indigo-500/10 transition-colors disabled:opacity-50 flex items-center justify-center min-w-[32px] cursor-pointer"
                          title="安装技能到当前工作空间"
                        >
                          {skillInstallLoading === s.name ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : '安装'}
                        </button>
                      )}
                      <Badge variant="outline" className="text-[9px] uppercase h-4 px-1 opacity-50">{s.scope}</Badge>
                    </div>
                  </div>
                  <p className="text-[11px] text-muted-foreground pl-5 line-clamp-2 leading-tight">
                    {s.description}
                  </p>
                </div>
              )) : (
                <div className="text-center text-[11px] text-muted-foreground py-8">暂无技能</div>
              )}
            </TabsContent>
            <TabsContent value="flows" className="m-0 space-y-4 pr-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-muted-foreground">工作流列表</span>
                {activeWorkspace && (
                  <div 
                    className="flex items-center gap-1 h-5 px-1.5 rounded-sm bg-muted/50 hover:bg-muted text-[10px] text-muted-foreground hover:text-foreground cursor-pointer transition-colors"
                    onClick={() => setNewFlowDialogOpen(true)}
                  >
                    <Plus className="h-3 w-3" /> 新建
                  </div>
                )}
              </div>
              {filteredWorkflows.length > 0 ? filteredWorkflows.map(w => (
                <div key={w.name} className="space-y-1 group">
                  <div className="flex items-start justify-between gap-2">
                    <div 
                      className="flex items-center gap-2 min-w-0 cursor-pointer" 
                      onClick={() => w.path && handleOpenWorkflow(w.path as string)}
                      title={w.path ? "在本地编辑器打开" : ""}
                    >
                      <Zap className="w-3.5 h-3.5 text-amber-500/70 shrink-0" />
                      <span className="text-xs font-semibold truncate group-hover:text-primary transition-colors hover:underline">/{w.name}</span>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {w.path && (
                        <div 
                          className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0 p-1 rounded-sm hover:bg-muted-foreground/20 text-muted-foreground hover:text-foreground z-10 cursor-pointer" 
                          onClick={() => handleOpenWorkflow(w.path as string)}
                          title="在本地编辑器编辑此工作流"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </div>
                      )}
                      {w.path && (
                        <div 
                          className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0 p-1 rounded-sm hover:bg-destructive/10 text-muted-foreground hover:text-destructive z-10 cursor-pointer" 
                          onClick={() => handleDeleteWorkflow(w.path as string, w.name)}
                          title="删除此工作流"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </div>
                      )}
                      {w.scope === 'workspace' && w.path && (
                        <div 
                          className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0 p-1 rounded-sm hover:bg-muted-foreground/20 text-muted-foreground hover:text-foreground z-10 cursor-pointer" 
                          onClick={() => handlePromoteWorkflow(w.path as string)}
                          title="设为全局工作流 (移动到 ~/.agents/workflows)"
                        >
                          <Globe className="h-3.5 w-3.5" />
                        </div>
                      )}
                      {w.scope && <Badge variant="outline" className="text-[9px] uppercase h-4 px-1 opacity-50">{w.scope}</Badge>}
                    </div>
                  </div>
                  <p className="text-[11px] text-muted-foreground pl-5 line-clamp-2 leading-tight">
                    {w.description}
                  </p>
                </div>
              )) : (
                <div className="text-center text-[11px] text-muted-foreground py-8">暂无工作流</div>
              )}
            </TabsContent>
            <TabsContent value="rules" className="m-0 space-y-4 pr-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-muted-foreground">规则列表</span>
                {activeWorkspace && (
                  <div 
                    className="flex items-center gap-1 h-5 px-1.5 rounded-sm bg-muted/50 hover:bg-muted text-[10px] text-muted-foreground hover:text-foreground cursor-pointer transition-colors"
                    onClick={() => setNewRuleDialogOpen(true)}
                  >
                    <Plus className="h-3 w-3" /> 新建
                  </div>
                )}
              </div>
              {filteredRules.length > 0 ? filteredRules.map(r => (
                <div key={r.path || r.name} className="space-y-1 group">
                   <div className="flex items-start justify-between gap-2">
                    <div 
                      className="flex items-center gap-2 min-w-0 cursor-pointer" 
                      onClick={() => r.path && handleOpenRule(r.path as string)}
                      title={r.path ? "在本地编辑器打开" : ""}
                    >
                      <ScrollText className="w-3.5 h-3.5 text-emerald-500/70 shrink-0" />
                      <span className="text-xs font-semibold truncate group-hover:text-primary transition-colors hover:underline">{r.name || r.path.split('/').pop()}</span>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {r.path && (
                        <div 
                          className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0 p-1 rounded-sm hover:bg-muted-foreground/20 text-muted-foreground hover:text-foreground z-10 cursor-pointer" 
                          onClick={() => handleOpenRule(r.path as string)}
                          title="在本地编辑器编辑此规则"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </div>
                      )}
                      {r.path && (
                        <div 
                          className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0 p-1 rounded-sm hover:bg-destructive/10 text-muted-foreground hover:text-destructive z-10 cursor-pointer" 
                          onClick={() => handleDeleteRule(r.path as string, r.name || r.path.split('/').pop() || '')}
                          title="删除此规则"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </div>
                      )}
                      {r.scope === 'workspace' && r.path && (
                        <div 
                          className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0 p-1 rounded-sm hover:bg-muted-foreground/20 text-muted-foreground hover:text-foreground z-10 cursor-pointer" 
                          onClick={() => handlePromoteRule(r.path as string)}
                          title="设为全局规则 (移动到 ~/.agents/rules)"
                        >
                          <Globe className="h-3.5 w-3.5" />
                        </div>
                      )}
                      {r.scope && <Badge variant="outline" className="text-[9px] uppercase h-4 px-1 opacity-50">{r.scope}</Badge>}
                    </div>
                  </div>
                  {r.description && (
                    <p className="text-[11px] text-muted-foreground pl-5 line-clamp-2 leading-tight">
                      {r.description}
                    </p>
                  )}
                </div>
              )) : (
                <div className="text-center text-[11px] text-muted-foreground py-8">未定义规则</div>
              )}
            </TabsContent>
            <TabsContent value="servers" className="m-0 space-y-2.5 pr-3">
              {wsOptions.length > 0 ? wsOptions.map(([uri, info]) => (
                <div key={uri} className={cn("flex items-center gap-2 p-2 rounded-lg border bg-background group", info.hidden && "opacity-40")}>
                  <div className={cn("w-2 h-2 rounded-full shrink-0", info.running ? (info.hidden ? "bg-amber-500" : "bg-emerald-500") : "bg-muted-foreground/30")} />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-semibold truncate">{info.name}</div>
                    <div className="text-[10px] text-muted-foreground truncate">{uri.replace('file://', '')}</div>
                  </div>
                  {info.hidden ? (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground cursor-pointer"
                      onClick={() => handleUnhideWorkspace(uri)}
                      title="在侧边栏显示"
                    >
                      <Eye className="h-3 w-3" />
                    </Button>
                  ) : info.running ? (
                    <div className="flex gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-muted-foreground hover:text-foreground cursor-pointer"
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          handleCloseWorkspace(uri);
                        }}
                        disabled={closingWs === uri}
                        title="从侧边栏隐藏 (工作区保持运行)"
                      >
                        {closingWs === uri ? <Loader2 className="h-3 w-3 animate-spin" /> : <EyeOff className="h-3 w-3" />}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-destructive hover:text-destructive cursor-pointer"
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setCloseTarget(uri);
                          setTimeout(() => setCloseDialogOpen(true), 10);
                        }}
                        title="彻底关闭 (释放后台资源)"
                      >
                        <PowerOff className="h-3 w-3" />
                      </Button>
                    </div>
                  ) : (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity text-emerald-600 hover:text-emerald-600"
                      onClick={() => handleLaunchWorkspace(uri)}
                    >
                      <Power className="h-3 w-3" />
                    </Button>
                  )}
                </div>
              )) : (
                <div className="text-center text-[11px] text-muted-foreground py-8">没有找到工作空间</div>
              )}
            </TabsContent>
          </ScrollArea>
        </div>
      </Tabs>
      )}
    </div>
  );
}
