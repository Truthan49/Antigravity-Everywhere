'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Sidebar from '@/components/sidebar';
import Chat from '@/components/chat';
import ChatInput from '@/components/chat-input';
import KnowledgePanel from '@/components/knowledge-panel';
import LogViewerPanel from '@/components/log-viewer-panel';
import StorePanel from '@/components/store-panel';
import BotManagementPanel from '@/components/bot-management-panel';
import { api, connectWs } from '@/lib/api';
import type { StepsData, ModelConfig, Skill, Workflow } from '@/lib/types';
import ActiveTasksPanel, { ActiveTask } from '@/components/active-tasks-panel';
import { Menu, Download, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export default function Home() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeTitle, setActiveTitle] = useState('Antigravity');
  const [steps, setSteps] = useState<StepsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [models, setModels] = useState<ModelConfig[]>([]);
  const [currentModel, setCurrentModel] = useState('MODEL_PLACEHOLDER_M26');
  const [skills, setSkills] = useState<Skill[]>([]);
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [connected, setConnected] = useState(false);
  const [isActive, setIsActive] = useState(false);
  const [cascadeStatus, setCascadeStatus] = useState('idle');
  const [knowledgePanelOpen, setKnowledgePanelOpen] = useState(false);
  const [logViewerOpen, setLogViewerOpen] = useState(false);
  const [storePanelOpen, setStorePanelOpen] = useState(false);
  const [botManagementOpen, setBotManagementOpen] = useState(false);
  const [agenticMode, setAgenticMode] = useState(true);
  const [activeTasks, setActiveTasks] = useState<ActiveTask[]>([]);
  const [dismissedTasks, setDismissedTasks] = useState<Set<string>>(new Set());
  const [sendError, setSendError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const lastStepCountRef = useRef(0);

  const loadLocalSkills = useCallback(() => {
    api.skills().then(setSkills).catch(() => {});
  }, []);

  useEffect(() => {
    api.models().then(d => {
      if (d.clientModelConfigs?.length) {
        // Enforce stable sorting by label length then alphabetically, keeping Recommended first
        const sortedModels = [...d.clientModelConfigs].sort((a, b) => {
          if (a.isRecommended !== b.isRecommended) return a.isRecommended ? -1 : 1;
          return a.label.localeCompare(b.label);
        });
        setModels(sortedModels);
        
        // Restore saved preference from Global backend, fallback to local storage or Auto
        const saved = d.globalPreferredModel || localStorage.getItem('antigravity_selected_model');
        const defaultModel = saved || 'MODEL_AUTO';
        
        // Only set if the saved model actually exists in the fetched list (or is Auto)
        const exists = defaultModel === 'MODEL_AUTO' || sortedModels.some(m => m.modelOrAlias?.model === defaultModel);
        if (exists) {
          setCurrentModel(defaultModel);
        } else {
          setCurrentModel('MODEL_AUTO'); // Fallback to Auto
        }
      }
    }).catch(() => {});

    // Fetch skills and workflows
    loadLocalSkills();
    api.workflows().then(setWorkflows).catch(() => {});
  }, [loadLocalSkills]);



  const handleModelChange = useCallback((model: string) => {
    setCurrentModel(model);
    if (typeof window !== 'undefined') {
      localStorage.setItem('antigravity_selected_model', model);
    }
    api.setModel(model).catch(console.error);
  }, []);

  useEffect(() => {
    wsRef.current = connectWs(
      (cascadeId, data, active, status, extra) => {
        // Update active tasks panel for ALL conversations
        setActiveTasks(prev => {
          const existing = prev.find(t => t.cascadeId === cascadeId);
          const newTask: ActiveTask = {
            cascadeId,
            title: existing?.title || cascadeId.slice(0, 8),
            workspace: existing?.workspace || extra?.workspace || '',
            stepCount: data.steps?.length || existing?.stepCount || 0,
            totalSteps: extra?.totalLength || existing?.totalSteps,
            lastTaskBoundary: extra?.lastTaskBoundary || existing?.lastTaskBoundary,
            isActive: active,
            cascadeStatus: status,
          };
          if (existing) {
            return prev.map(t => t.cascadeId === cascadeId ? newTask : t);
          }
          return [...prev, newTask];
        });

        // Update main chat view only for the current active conversation
        setActiveId(cur => {
          if (cur === cascadeId) {
            const newLen = data.steps?.length || 0;
            if (newLen > 0 && newLen >= lastStepCountRef.current) {
              lastStepCountRef.current = newLen;
              setSteps(data);
            } else if (newLen > 0) {
              console.warn(`[WS] Guard filtered: newLen=${newLen} < lastStepCount=${lastStepCountRef.current} for ${cascadeId.slice(0,8)}`);
            }
            setIsActive(active);
            setCascadeStatus(status);
          } else {
            console.log(`[WS] Ignored update for ${cascadeId.slice(0,8)} (active=${cur?.slice(0,8)})`);
          }
          return cur;
        });
      },
      setConnected,
      (newWs) => { wsRef.current = newWs; }
    );
    return () => { wsRef.current?.close(); };
  }, []);

  const loadSteps = useCallback(async (id: string) => {
    setLoading(true);
    try {
      const data = await api.conversationSteps(id);
      lastStepCountRef.current = data.steps?.length || 0;
      setSteps(data);
    } catch { setSteps(null); }
    setLoading(false);
  }, []);

  const handleSelect = (id: string, title: string, workspace?: string) => {
    console.log(`[Select] ${id.slice(0,8)} "${title}" | wsReady=${wsRef.current?.readyState} lastSteps=${lastStepCountRef.current}`);
    setActiveId(id);
    setActiveTitle(title || id.slice(0, 8));
    setSteps(null);
    setSendError(null);
    loadSteps(id);
    if (wsRef.current?.readyState === 1) {
      wsRef.current.send(JSON.stringify({ type: 'subscribe', cascadeId: id }));
    } else {
      console.warn(`[Select] WS not ready (state=${wsRef.current?.readyState}), subscribe skipped for ${id.slice(0,8)}`);
    }
    
    // Update the task title and workspace in activeTasks
    setActiveTasks(prev => {
      const exists = prev.find(t => t.cascadeId === id);
      if (!exists) {
        return [...prev, { cascadeId: id, title: title || id.slice(0, 8), workspace: workspace || '', stepCount: 0, isActive: false }];
      }
      return prev.map(t => t.cascadeId === id ? { ...t, title: title || id.slice(0, 8), workspace: workspace || t.workspace } : t);
    });
  };

  const handleNew = async (workspace: string) => {
    console.log(`[NewConv] Creating in workspace: ${workspace}`);
    try {
      const d = await api.createConversation(workspace);
      if (d.error) { alert(d.error); return; }
      if (d.cascadeId) {
        console.log(`[NewConv] Created ${d.cascadeId.slice(0,8)}, selecting...`);
        // Immediately seed the local activeTasks with the workspace so Slash Commands know the context before WS connects
        setActiveTasks(prev => {
          if (prev.find(t => t.cascadeId === d.cascadeId)) return prev;
          return [...prev, { cascadeId: d.cascadeId as string, title: '新对话', workspace, stepCount: 0, isActive: false }];
        });
        handleSelect(d.cascadeId, '新对话');
      }
    } catch (e: unknown) { alert('失败: ' + (e instanceof Error ? e.message : '未知错误')); }
  };

  const handleSend = async (text: string, attachments?: any) => {
    if (!activeId) return;
    setSendError(null);
    
    // Resolve Auto model if selected
    let targetModel = currentModel;
    if (targetModel === 'MODEL_AUTO') {
      // Fallback priority: M26(Opus) -> M37(Pro High) -> M36(Pro Low) -> M35(Sonnet) -> M47(Flash)
      const priority = ['MODEL_PLACEHOLDER_M26', 'MODEL_PLACEHOLDER_M37', 'MODEL_PLACEHOLDER_M36', 'MODEL_PLACEHOLDER_M35', 'MODEL_PLACEHOLDER_M47'];
      let found = false;
      for (const p of priority) {
        const conf = models.find(m => m.modelOrAlias?.model === p);
        if (conf && conf.quotaInfo && conf.quotaInfo.remainingFraction !== undefined && conf.quotaInfo.remainingFraction > 0) {
          targetModel = p;
          found = true;
          console.log(`[Auto Resolve] Resolved ${p} (quota=${conf.quotaInfo.remainingFraction})`);
          break;
        }
      }
      if (!found) {
        // If all quotas exhausted or info missing, fallback to Flash or whatever is first
        targetModel = models.find(m => m.modelOrAlias?.model === 'MODEL_PLACEHOLDER_M47')?.modelOrAlias?.model 
                      || models[0]?.modelOrAlias?.model || 'MODEL_PLACEHOLDER_M26';
        console.log(`[Auto Resolve] Fallback to ${targetModel} (no quota found)`);
      }
    }

    try {
      await api.sendMessage(activeId, text, targetModel, agenticMode, attachments);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Unknown error';
      console.error(`[Send] Failed for ${activeId.slice(0,8)}: ${msg}`);
      setSendError(`发送失败: ${msg}`);
      setTimeout(() => setSendError(null), 6000);
    }
  };

  const handleProceed = async (uri: string) => {
    if (!activeId || !uri) return;
    try { await api.proceed(activeId, uri, currentModel); } catch { /* */ }
  };

  const handleCancel = async () => {
    if (!activeId) return;
    try {
      await api.cancel(activeId);
      // Force refresh steps to escape stuck isRunning state
      setTimeout(() => loadSteps(activeId), 500);
    } catch { /* */ }
  };

  const handleRevert = async (stepIndex: number) => {
    if (!activeId) return;

    // Find the actual revert target:
    // If the step at stepIndex is USER_INPUT, revert to the step before it
    // so the user's own message is also removed.
    let targetIndex = stepIndex;
    if (steps?.steps?.[stepIndex]?.type === 'CORTEX_STEP_TYPE_USER_INPUT') {
      // Find the PREVIOUS actual state before this user input happened.
      // Usually, reverting a user input should revert to the step right before it.
      // But we need to make sure the user input itself is not in the remaining steps.
      targetIndex = Math.max(0, stepIndex - 1);
      // Walk backward to find the last non-ephemeral step before this USER_INPUT
      targetIndex = Math.max(0, stepIndex - 1);
      while (targetIndex > 0) {
        const t = steps.steps[targetIndex]?.type || '';
        if (t !== 'CORTEX_STEP_TYPE_EPHEMERAL_MESSAGE' && t !== 'CORTEX_STEP_TYPE_CHECKPOINT') break;
        targetIndex--;
      }
    }

    if (steps?.steps) {
      // Reverting to targetIndex means we KEEP steps 0 through targetIndex.
      // E.g., targetIndex = 2 means we keep steps 0, 1, 2. Length = 3.
      // If we revert a user input at index 3, targetIndex becomes 2.
      // The remaining steps should be [0, 1, 2].
      const truncated = steps.steps.slice(0, targetIndex + 1);
      lastStepCountRef.current = truncated.length;
      setSteps({ ...steps, steps: truncated });
    }

    try {
      await api.revert(activeId, targetIndex, currentModel);
      // Reset monotonic guard — revert produces a shorter steps array
      lastStepCountRef.current = 0;
      // Fallback refresh in case WS push is delayed
      setTimeout(() => loadSteps(activeId), 800);
    } catch { /* */ }
  };

  const handleResubmit = async (stepIndex: number, newText: string) => {
    if (!activeId || stepIndex < 0) return;
    
    let targetIndex = stepIndex;
    if (steps?.steps?.[targetIndex]?.type === 'CORTEX_STEP_TYPE_USER_INPUT') {
      targetIndex = Math.max(0, stepIndex - 1);
      while (targetIndex >= 0) {
        const t = steps.steps[targetIndex].type;
        if (t !== 'CORTEX_STEP_TYPE_EPHEMERAL_MESSAGE' && t !== 'CORTEX_STEP_TYPE_CHECKPOINT') break;
        targetIndex--;
      }
    }

    if (steps?.steps) {
      const truncated = steps.steps.slice(0, targetIndex + 1);
      lastStepCountRef.current = truncated.length;
      setSteps({ ...steps, steps: truncated });
    }

    try {
      await api.revert(activeId, targetIndex, currentModel);
      lastStepCountRef.current = 0;
      await handleSend(newText);
    } catch (e: any) {
      setSendError('重新发送失败: ' + (e?.message || '未知错误'));
    }
  };

  const handleExportMarkdown = useCallback(() => {
    if (!steps || !steps.steps || steps.steps.length === 0) return;
    
    let md = `# 对话: ${activeTitle}\n\n`;
    
    steps.steps.forEach(s => {
      const type = s.type || '';
      if (type === 'CORTEX_STEP_TYPE_USER_INPUT') {
        const text = (s.userInput?.items || []).filter(i => i.text).map(i => i.text).join('').trim();
        if (text) md += `**用户**:\n\n${text}\n\n---\n\n`;
      } else if (type === 'CORTEX_STEP_TYPE_PLANNER_RESPONSE') {
        const text = s.plannerResponse?.modifiedResponse || s.plannerResponse?.response || '';
        if (text) md += `**助手**:\n\n${text}\n\n---\n\n`;
      } else if (type === 'CORTEX_STEP_TYPE_TASK_BOUNDARY') {
        const tb = s.taskBoundary || {};
        md += `> **任务边界: ${tb.taskName || '任务'}**\n`;
        if (tb.taskStatus) md += `> 状态: ${tb.taskStatus}\n`;
        if (tb.taskSummary) md += `> ${tb.taskSummary}\n\n`;
      } else if (type === 'CORTEX_STEP_TYPE_NOTIFY_USER') {
        const text = s.notifyUser?.notificationContent || '';
        if (text) md += `**助手通知**:\n\n${text}\n\n---\n\n`;
      }
    });

    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${activeTitle.replace(/[^a-zA-Z0-9-_\u4e00-\u9fa5]/g, '_')}_export.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [steps, activeTitle]);

  // isActive comes from the backend's trajectory summary — authoritative, not stale.
  const isRunning = isActive;

  const activeTask = activeTasks.find(t => t.cascadeId === activeId);
  const activeWorkspace = activeTask?.workspace || '';

  const filteredSkills = skills.filter(s => 
    s.scope === 'global' || 
    (activeWorkspace && (
      (s as any).workspace === activeWorkspace || 
      activeWorkspace.includes((s as any).workspace) || 
      ((s as any).workspace && (s as any).workspace.includes(activeWorkspace))
    ))
  );

  const filteredWorkflows = workflows.filter(w => 
    w.scope === 'global' || 
    (activeWorkspace && (
      (w as any).workspace === activeWorkspace || 
      activeWorkspace.includes((w as any).workspace) || 
      ((w as any).workspace && (w as any).workspace.includes(activeWorkspace))
    ))
  );

  const activeCascadeIds = new Set(activeTasks.filter(t => t.isActive).map(t => t.cascadeId));
  const currentModelLabel = models.find(m => m.modelOrAlias?.model === currentModel)?.label || currentModel;

  return (
    <>
    <div className="flex h-dvh overflow-hidden bg-background">
      <Sidebar
        activeId={activeId}
        onSelect={handleSelect}
        onNew={handleNew}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        onKnowledgeOpen={() => setKnowledgePanelOpen(true)}
        onLogsOpen={() => setLogViewerOpen(true)}
        onStoreOpen={() => setStorePanelOpen(true)}
        onBotManagementOpen={() => setBotManagementOpen(true)}
        activeCascadeIds={activeCascadeIds}
      />

      <main className="flex flex-col flex-1 min-w-0 h-dvh">
        {/* ── Branded Header ── */}
        <header className="flex items-center gap-4 px-6 h-14 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 z-10 shrink-0 shadow-sm">
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden shrink-0 -ml-2"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu className="h-5 w-5" />
          </Button>
          
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary text-primary-foreground flex items-center justify-center font-bold">
              A
            </div>
            <h1 className="text-sm font-semibold truncate hidden sm:block">{activeTitle}</h1>
          </div>

          <div className="ml-auto flex items-center gap-2">
            {steps && steps.steps && steps.steps.length > 0 && (
              <Button variant="outline" size="sm" onClick={handleExportMarkdown} className="h-9 text-xs font-medium">
                <Download className="w-3.5 h-3.5 mr-1.5" />
                导出 MD
              </Button>
            )}
          </div>
        </header>

        {/* Chat Area */}
        <div className="flex-1 relative overflow-hidden bg-muted/20">
          <Chat 
            steps={steps} 
            loading={loading} 
            currentModel={currentModel} 
            onProceed={handleProceed} 
            onCancel={handleCancel}
            onRevert={handleRevert} 
            onResubmit={handleResubmit} 
            totalSteps={steps?.steps?.length} 
          />
          {sendError && (
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 bg-destructive text-destructive-foreground px-5 py-2.5 rounded-lg shadow-lg text-sm font-medium animate-in fade-in slide-in-from-bottom-2 duration-300">
              {sendError}
            </div>
          )}
        </div>

        {/* Input Area */}
        {activeId && (
          <div className="shrink-0 z-10">
            <ChatInput
              activeId={activeId}
              onSend={handleSend}
              onCancel={handleCancel}
              disabled={loading}
              isRunning={isRunning}
              connected={connected}
              models={models}
              currentModel={currentModel}
              onModelChange={handleModelChange}
              skills={filteredSkills}
              workflows={filteredWorkflows}
              agenticMode={agenticMode}
              onAgenticModeChange={setAgenticMode}
            />
          </div>
        )}
        {/* Status Bar */}
        <footer className="h-6 bg-[#007acc] text-white flex items-center justify-between px-3 text-[10.5px] shrink-0 font-medium">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5 cursor-default group" title={connected ? 'WebSocket connected' : 'WebSocket disconnected'}>
              <div className={cn("w-2 h-2 rounded-full", connected ? "bg-emerald-400 group-hover:bg-emerald-300" : "bg-destructive")} />
              <span>{connected ? 'Gateway OK' : 'Disconnected'}</span>
            </div>
            {activeCascadeIds.size > 0 && (
              <div className="flex items-center gap-1 text-sky-100 mix-blend-screen">
                <Loader2 className="w-3 h-3 animate-spin opacity-80" />
                <span>{activeCascadeIds.size} Active Agent{activeCascadeIds.size > 1 ? 's' : ''}</span>
              </div>
            )}
            <div className="flex items-center gap-1.5 opacity-80 hover:opacity-100 transition-opacity cursor-pointer mx-2" onClick={() => setLogViewerOpen(true)}>
              <Menu className="w-3 h-3" />
              <span>Logs</span>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5 lg:mr-4">
              <span className="opacity-70">Model:</span>
              <span className="truncate max-w-[150px]">{currentModelLabel}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="opacity-70">Mode:</span>
              <span>{agenticMode ? 'Agentic' : 'Standard'}</span>
            </div>
          </div>
        </footer>
      </main>
    </div>
    <KnowledgePanel open={knowledgePanelOpen} onClose={() => setKnowledgePanelOpen(false)} />
    <LogViewerPanel open={logViewerOpen} onClose={() => setLogViewerOpen(false)} />
    <StorePanel open={storePanelOpen} onClose={() => setStorePanelOpen(false)} skills={skills} loadLocalSkills={loadLocalSkills} />
    <BotManagementPanel open={botManagementOpen} onClose={() => setBotManagementOpen(false)} />
    <ActiveTasksPanel
      tasks={activeTasks.filter(t => !dismissedTasks.has(t.cascadeId))}
      onSelect={(id, title) => handleSelect(id, title)}
      onDismiss={(id) => setDismissedTasks(prev => new Set(prev).add(id))}
      activeCascadeId={activeId}
    />
    </>
  );
}
