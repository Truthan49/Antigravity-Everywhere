'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import type { Conversation, UserInfo, Skill, Workflow, Rule, Server, Workspace, AnalyticsData } from '@/lib/types';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import {
  Plus, ChevronRight, Puzzle, Zap, Gamepad2, MessageSquare, FolderOpen, ScrollText,
  Server as ServerIcon, Power, PowerOff, EyeOff, Eye, Loader2, ExternalLink, BookOpen, Terminal,
  Pin, PinOff, ChevronDown, ChevronUp, Search, Globe, BotMessageSquare, Pencil, Trash2, Check
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { FeishuConfigDialog } from '@/components/feishu-config-dialog';
import { TunnelConfigDialog } from '@/components/tunnel-config-dialog';
import { WorkspaceSelector } from './sidebar/workspace-selector';
import { ConversationList } from './sidebar/conversation-list';
import { AssetPanel } from './sidebar/asset-panel';
import { SearchDialog } from './sidebar/dialogs/search-dialog';
import { WorkspaceDialogs } from './sidebar/dialogs/workspace-dialogs';
import { AnalyticsDialog } from './analytics-dialog';

interface SidebarProps {
  activeId: string | null;
  onSelect: (id: string, title: string, workspace: string) => void;
  onNew: (workspace: string) => void;
  open: boolean;
  onClose: () => void;
  onKnowledgeOpen?: () => void;
  onLogsOpen?: () => void;
  onStoreOpen?: () => void;
  onBotManagementOpen?: () => void;
  activeCascadeIds?: Set<string>;
}

function getWorkspaceName(uri: string) {
  if (!uri) return 'Other';
  if (uri.includes('/playground/')) return 'Playground';
  const parts = uri.replace('file://', '').split('/');
  return parts[parts.length - 1] || parts[parts.length - 2] || uri;
}

export default function Sidebar({ activeId, onSelect, onNew, open, onClose, onKnowledgeOpen, onLogsOpen, onStoreOpen, onBotManagementOpen, activeCascadeIds = new Set() }: SidebarProps) {
  const [user, setUser] = useState<UserInfo | null>(null);
  const [pinned, setPinned] = useState<string[]>([]);
  const [bottomPanelOpen, setBottomPanelOpen] = useState(true);

  useEffect(() => {
    try {
      const stored = localStorage.getItem('antigravity_pinned_chats');
      if (stored) setPinned(JSON.parse(stored));
    } catch {}
  }, []);

  const togglePin = (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();
    setPinned(prev => {
      const next = prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id];
      localStorage.setItem('antigravity_pinned_chats', JSON.stringify(next));
      return next;
    });
  };

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [servers, setServers] = useState<Server[]>([]);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [selectedWs, setSelectedWs] = useState('');
  const [rules, setRules] = useState<Rule[]>([]);
  const [loadError, setLoadError] = useState('');
  const [feishuConfigOpen, setFeishuConfigOpen] = useState(false);
  const [tunnelConfigOpen, setTunnelConfigOpen] = useState(false);
  const [isFeishuConfigured, setIsFeishuConfigured] = useState(false);
  
  // Batch Management State
  const [isBatchMode, setIsBatchMode] = useState(false);
  const [selectedConversations, setSelectedConversations] = useState<Set<string>>(new Set());

  const toggleBatchMode = () => {
    setIsBatchMode(prev => {
      if (prev) setSelectedConversations(new Set());
      return !prev;
    });
  };

  const toggleSelectConversation = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedConversations(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleBatchDelete = async () => {
    if (selectedConversations.size === 0) return;
    if (!window.confirm(`确定要删除选中的 ${selectedConversations.size} 个对话吗？\n删除后不可恢复。`)) return;
    
    try {
      await fetch('/api/conversations/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete', ids: Array.from(selectedConversations) })
      });
      setSelectedConversations(new Set());
      setIsBatchMode(false);
      load();
    } catch { }
  };

  useEffect(() => {
    api.getFeishuConfig().then(data => {
      setIsFeishuConfigured(!!(data.appId && data.appSecret));
    }).catch(() => setIsFeishuConfigured(false));
  }, [feishuConfigOpen]); // re-check when dialog closes

  // Calculate active workspace for filtering
  const activeConversation = conversations.find(c => c.id === activeId);
  const activeWorkspace = activeConversation?.workspace || '';

  const filteredSkills = skills.filter(s => 
    s.scope === 'global' || 
    (activeWorkspace && (
      (s as { workspace?: string }).workspace === activeWorkspace || 
      activeWorkspace.includes((s as { workspace?: string }).workspace || '') || 
      ((s as { workspace?: string }).workspace && (s as { workspace?: string }).workspace!.includes(activeWorkspace))
    ))
  );

  const filteredWorkflows = workflows.filter(w => 
    w.scope === 'global' || 
    (activeWorkspace && (
      (w as { workspace?: string }).workspace === activeWorkspace || 
      activeWorkspace.includes((w as { workspace?: string }).workspace || '') || 
      ((w as { workspace?: string }).workspace && (w as { workspace?: string }).workspace!.includes(activeWorkspace))
    ))
  );

  const filteredRules = rules.filter(r => 
    r.scope === 'global' || 
    (activeWorkspace && (
      (r as { workspace?: string }).workspace === activeWorkspace || 
      activeWorkspace.includes((r as { workspace?: string }).workspace || '') || 
      ((r as { workspace?: string }).workspace && (r as { workspace?: string }).workspace!.includes(activeWorkspace))
    ))
  );
  
  // Analytics dialog state
  const [analyticsOpen, setAnalyticsOpen] = useState(false);

  // Search dialog state
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [fullTextResults, setFullTextResults] = useState<{id: string, snippets: string[]}[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  

  useEffect(() => {
    if (searchQuery.trim().length <= 1) {
      setFullTextResults([]);
      setIsSearching(false);
      return;
    }
    setIsSearching(true);
    const handler = setTimeout(async () => {
      try {
        const res = await fetch(`/api/conversations/search?q=${encodeURIComponent(searchQuery)}`);
        const data = await res.json();
        setFullTextResults(data.results || []);
      } catch { }
      setIsSearching(false);
    }, 500);
    return () => clearTimeout(handler);
  }, [searchQuery]);

  const searchResults = searchQuery.trim() === '' ? [] : conversations.filter(c => 
    (c.title || '未命名').toLowerCase().includes(searchQuery.toLowerCase()) || 
    getWorkspaceName(c.workspace || '').toLowerCase().includes(searchQuery.toLowerCase())
  ).slice(0, 15);

  // Launch dialog state
  const [launchDialogOpen, setLaunchDialogOpen] = useState(false);
  const [launchTarget, setLaunchTarget] = useState('');
  const [launchStatus, setLaunchStatus] = useState<'idle' | 'launching' | 'polling' | 'ready' | 'error'>('idle');
  const [launchError, setLaunchError] = useState('');
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Close workspace state
  const [closingWs, setClosingWs] = useState<string | null>(null);
  const [hiddenWorkspaces, setHiddenWorkspaces] = useState<string[]>([]);
  // Close (kill) confirmation dialog state
  const [closeDialogOpen, setCloseDialogOpen] = useState(false);
  const [closeTarget, setCloseTarget] = useState('');
  const [closeLoading, setCloseLoading] = useState(false);
  const [closeError, setCloseError] = useState('');

  // New Workflow State
  const [newFlowDialogOpen, setNewFlowDialogOpen] = useState(false);
  const [newFlowName, setNewFlowName] = useState('');
  const [newFlowDesc, setNewFlowDesc] = useState('');
  const [newFlowLoading, setNewFlowLoading] = useState(false);

  // Skill Install State
  const [skillInstallLoading, setSkillInstallLoading] = useState<string | null>(null);

  // Global Skill Import State
  const [importSkillDialogOpen, setImportSkillDialogOpen] = useState(false);
  const [importSkillPath, setImportSkillPath] = useState('');
  const [importSkillLoading, setImportSkillLoading] = useState(false);
  const [importSkillError, setImportSkillError] = useState('');

  const handleImportGlobalSkill = async () => {
    if (!importSkillPath.trim()) return;
    setImportSkillLoading(true);
    setImportSkillError('');
    try {
      const res = await fetch('/api/skills', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'importGlobal', sourceDir: importSkillPath.trim() })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || '导入失败');
      }
      setImportSkillDialogOpen(false);
      setImportSkillPath('');
      load();
    } catch (e: any) {
      setImportSkillError(e.message);
    }
    setImportSkillLoading(false);
  };


  const handleInstallSkill = async (s: Skill) => {
    if (!activeWorkspace || skillInstallLoading) return;
    setSkillInstallLoading(s.name);
    try {
      const res = await fetch('/api/skills', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'install', sourceBaseDir: (s as any).baseDir, workspaceUri: activeWorkspace })
      });
      if (res.ok) {
        load();
      }
    } catch {}
    setSkillInstallLoading(null);
  };

  const handleCreateWorkflow = async () => {
    if (!activeWorkspace || !newFlowName.trim()) return;
    setNewFlowLoading(true);
    try {
      await fetch('/api/workflows', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'create', workspace: activeWorkspace, name: newFlowName.trim(), description: newFlowDesc.trim() })
      });
      setNewFlowDialogOpen(false);
      setNewFlowName('');
      setNewFlowDesc('');
      load();
    } catch { }
    setNewFlowLoading(false);
  };

  const handlePromoteWorkflow = async (path: string) => {
    try {
      await fetch('/api/workflows', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'promote', filepath: path })
      });
      load();
    } catch { }
  };

  const handleOpenWorkflow = async (path: string) => {
    try {
      await fetch('/api/workflows', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'open', filepath: path })
      });
    } catch { }
  };

  const handleDeleteWorkflow = async (path: string, name: string) => {
    if (!window.confirm(`确定要删除工作流 [${name}] 吗？\n该操作无法撤销。`)) return;
    try {
      await fetch('/api/workflows', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete', filepath: path })
      });
      load();
    } catch { }
  };

  // New Rule State
  const [newRuleDialogOpen, setNewRuleDialogOpen] = useState(false);
  const [newRuleName, setNewRuleName] = useState('');
  const [newRuleDesc, setNewRuleDesc] = useState('');
  const [newRuleLoading, setNewRuleLoading] = useState(false);

  const handleCreateRule = async () => {
    if (!activeWorkspace || !newRuleName.trim()) return;
    setNewRuleLoading(true);
    try {
      await fetch('/api/rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'create', workspace: activeWorkspace, name: newRuleName.trim(), description: newRuleDesc.trim() })
      });
      setNewRuleDialogOpen(false);
      setNewRuleName('');
      setNewRuleDesc('');
      load();
    } catch { }
    setNewRuleLoading(false);
  };

  const handlePromoteRule = async (path: string) => {
    try {
      await fetch('/api/rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'promote', filepath: path })
      });
      load();
    } catch { }
  };

  const handleOpenRule = async (path: string) => {
    try {
      await fetch('/api/rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'open', filepath: path })
      });
    } catch { }
  };

  const handleDeleteRule = async (path: string, name: string) => {
    if (!window.confirm(`确定要删除规则 [${name}] 吗？\n该操作无法撤销。`)) return;
    try {
      await fetch('/api/rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete', filepath: path })
      });
      load();
    } catch { }
  };

  const load = useCallback(async () => {
    try {
      let hasError = false;
      function safeFetch<T>(p: Promise<T>, fallback: T): Promise<T> {
        return p.catch((e) => {
          console.warn('[Sidebar Load] Fetch error:', e.message || e);
          hasError = true;
          return fallback;
        });
      }
      
      const [u, c, s, w, sv, ws, r, hidden] = await Promise.all([
        safeFetch(api.me(), null as UserInfo | null), 
        safeFetch(api.conversations(), [] as Conversation[]), 
        safeFetch(api.skills(), [] as Skill[]), 
        safeFetch(api.workflows(), [] as Workflow[]), 
        safeFetch(api.servers(), [] as Server[]), 
        safeFetch(api.workspaces(), { workspaces: [], playgrounds: [] }), 
        safeFetch(api.rules(), [] as Rule[]),
        safeFetch(fetch('/api/workspaces/close').then(r => r.json()), [] as string[]),
      ]);
      
      if (u) setUser(u); 
      if (c) setConversations(c); 
      if (s) setSkills(s); 
      if (w) setWorkflows(w); 
      if (sv) setServers(sv);
      if (ws && ws.workspaces) setWorkspaces(ws.workspaces);
      if (r) setRules(r);
      if (hidden) setHiddenWorkspaces(hidden);

      if (hasError) {
        setLoadError('部分数据加载失败，服务可能未响应');
        setTimeout(() => setLoadError(''), 5000);
      }
    } catch { /* silent */ }
  }, []);

  useEffect(() => { load(); const t = setInterval(load, 8000); return () => clearInterval(t); }, [load]);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  // Check if a workspace URI has a running server
  const isWsRunning = useCallback((wsUri: string) => {
    if (wsUri === 'playground') return true;
    return servers.some(s => {
      const sw = s.workspace || '';
      return sw === wsUri || sw.includes(wsUri) || wsUri.includes(sw);
    });
  }, [servers]);

  // Handle "Start Conversation" with workspace check
  const handleStartConversation = useCallback(() => {
    if (!selectedWs) return;
    if (selectedWs === 'playground' || isWsRunning(selectedWs)) {
      onNew(selectedWs);
      onClose();
      return;
    }
    // Workspace not running — show launch dialog
    setLaunchTarget(selectedWs);
    setLaunchStatus('idle');
    setLaunchError('');
    setLaunchDialogOpen(true);
  }, [selectedWs, isWsRunning, onNew, onClose]);

  // Launch workspace and poll for server
  const handleLaunchWorkspace = useCallback(async (wsUri: string) => {
    setLaunchStatus('launching');
    setLaunchError('');
    try {
      await api.launchWorkspace(wsUri);
      setLaunchStatus('polling');
      // Poll for server to appear
      let elapsed = 0;
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = setInterval(async () => {
        elapsed += 2;
        if (elapsed > 30) {
          if (pollRef.current) clearInterval(pollRef.current);
          setLaunchStatus('error');
          setLaunchError('Timed out waiting for server to start. Please try again.');
          return;
        }
        try {
          const freshServers = await api.servers();
          const found = freshServers.some((s: Server) => {
            const sw = s.workspace || '';
            return sw === wsUri || sw.includes(wsUri) || wsUri.includes(sw);
          });
          if (found) {
            if (pollRef.current) clearInterval(pollRef.current);
            setLaunchStatus('ready');
            // Re-load sidebar data
            load();
          }
        } catch { /* ignore polling errors */ }
      }, 2000);
    } catch (e: unknown) {
      setLaunchStatus('error');
      setLaunchError((e as Error).message || 'Failed to launch workspace');
    }
  }, [load]);

  // Hide workspace from sidebar (server stays running in background)
  const handleCloseWorkspace = useCallback(async (wsUri: string) => {
    setClosingWs(wsUri);
    try {
      await api.closeWorkspace(wsUri);
      load();
    } catch { /* silent */ }
    setClosingWs(null);
  }, [load]);

  // Unhide workspace
  const handleUnhideWorkspace = useCallback(async (wsUri: string) => {
    try {
      await fetch('/api/workspaces/close', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspace: wsUri }),
      });
      load();
    } catch { /* silent */ }
  }, [load]);

  // Close workspace completely (kill language_server)
  const handleKillWorkspace = useCallback(async (wsUri: string) => {
    setCloseLoading(true);
    setCloseError('');
    try {
      const res = await fetch('/api/workspaces/kill', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspace: wsUri }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || '无法停止语言服务器，请检查后端运行状态。');
      }
      setTimeout(() => { load(); setCloseLoading(false); setCloseDialogOpen(false); }, 2000);
    } catch (err: any) {
      setCloseError(err.message || '网络连接失败');
      setCloseLoading(false);
    }
  }, [load]);

  // Helper: check if a workspace URI is hidden
  const isWsHidden = useCallback((wsUri: string) => {
    return hiddenWorkspaces.some(h => wsUri === h || wsUri.includes(h) || h.includes(wsUri));
  }, [hiddenWorkspaces]);

  const wsOptions = (() => {
    const allWs = new Map<string, { name: string; running: boolean; hidden: boolean }>();
    servers.forEach(s => {
      const ws = s.workspace || '';
      if (!ws || ws.includes('/playground/')) return;
      const isHidden = hiddenWorkspaces.some(h => ws === h || ws.includes(h) || h.includes(ws));
      allWs.set(ws, { name: ws.replace('file://', '').split('/').pop() || ws, running: true, hidden: isHidden });
    });
    workspaces.forEach(w => {
      const uri = w.uri || '';
      if (!uri || allWs.has(uri) || uri.includes('/playground/')) return;
      const isHidden = hiddenWorkspaces.some(h => uri === h || uri.includes(h) || h.includes(uri));
      allWs.set(uri, { name: uri.replace('file://', '').split('/').pop() || uri, running: false, hidden: isHidden });
    });
    return [...allWs.entries()].sort((a, b) => {
      if (a[1].hidden !== b[1].hidden) return a[1].hidden ? 1 : -1;
      if (a[1].running !== b[1].running) return a[1].running ? -1 : 1;
      return a[1].name.localeCompare(b[1].name);
    });
  })();

  // Filter out hidden and non-running workspaces from conversation list
  const visibleConversations = conversations.filter(c => {
    const ws = c.workspace || '';
    if (isWsHidden(ws)) return false;
    if (!ws || ws === 'playground') return true;
    return isWsRunning(ws);
  });

  const groups: Record<string, Conversation[]> = {};
  const pinnedConversations: Conversation[] = [];
  
  visibleConversations.forEach(c => {
    if (pinned.includes(c.id)) {
      pinnedConversations.push(c);
    } else {
      const wsName = getWorkspaceName(c.workspace || '');
      if (!groups[wsName]) groups[wsName] = [];
      groups[wsName].push(c);
    }
  });
  const sortedGroupNames = Object.keys(groups).sort((a, b) => {
    if (a === 'Playground') return 1;
    if (b === 'Playground') return -1;
    if (a === 'Other') return 1;
    if (b === 'Other') return -1;
    return groups[b].length - groups[a].length;
  });

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      // ⌘K or Ctrl+K for Search
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setSearchOpen((open) => !open);
      }
      // ⌘N or Ctrl+N for New Conversation
      if (e.key === 'n' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        handleStartConversation();
      }
      // ⌘⇧W or Ctrl+Shift+W to cycle workspace
      if (e.key === 'w' && (e.metaKey || e.ctrlKey) && e.shiftKey) {
        e.preventDefault();
        if (wsOptions.length > 0) {
           const activeIndexes = wsOptions.filter(([, info]) => !info.hidden);
           if (activeIndexes.length > 0) {
             const currentIndex = activeIndexes.findIndex(([uri]) => uri === selectedWs);
             const nextIndex = (currentIndex + 1) % activeIndexes.length;
             setSelectedWs(activeIndexes[nextIndex][0]);
           }
        }
      }
    };
    document.addEventListener('keydown', down);
    return () => document.removeEventListener('keydown', down);
  }, [handleStartConversation, wsOptions, selectedWs]);

  return (
    <>
      {open && (
        <div className="fixed inset-0 z-40 bg-black/50 md:hidden" onClick={onClose} />
      )}
      <aside className={cn(
        'flex flex-col h-dvh z-50 transition-transform duration-300 ease-out bg-background border-r',
        'w-[85vw] max-w-[320px] md:w-[320px] md:relative md:translate-x-0',
        'fixed top-0 left-0 md:static',
        open ? 'translate-x-0 shadow-xl' : '-translate-x-full md:translate-x-0',
      )}>
        {/* User Header */}
        <div className="flex items-center gap-3 p-4 shrink-0">
          <Avatar className="h-9 w-9">
            <AvatarFallback className="bg-primary text-primary-foreground font-bold">
              {user?.name?.[0]?.toUpperCase() || '?'}
            </AvatarFallback>
          </Avatar>
          <div className="flex flex-col flex-1 min-w-0">
            <span className="text-sm font-semibold truncate leading-none mb-1">{user?.name || '加载中...'}</span>
            <span className="text-xs text-muted-foreground truncate">{user?.email || ''}</span>
          </div>
          <Button 
            variant="ghost" 
            size="icon" 
            className={cn(
              "h-8 w-8 shrink-0 cursor-pointer transition-colors shadow-sm border",
              isFeishuConfigured 
                ? "text-emerald-500 border-emerald-500/30 hover:text-emerald-400 hover:bg-emerald-500/10" 
                : "text-destructive border-destructive/30 hover:text-destructive hover:bg-destructive/10"
            )} 
            onClick={() => onBotManagementOpen?.()}
            title={isFeishuConfigured ? "飞书机器人管理 (已连接)" : "飞书机器人管理 (未连接) - 点击配置"}
          >
            <BotMessageSquare className="h-4 w-4" />
          </Button>
        </div>
        
        <Separator className="shrink-0" />

        
        <WorkspaceSelector 
          selectedWs={selectedWs} setSelectedWs={setSelectedWs} wsOptions={wsOptions} 
          setSearchOpen={setSearchOpen} handleStartConversation={handleStartConversation}
        />
        
        <ConversationList 
          conversations={conversations} pinnedConversations={pinnedConversations} groups={groups} 
          sortedGroupNames={sortedGroupNames} isBatchMode={isBatchMode} selectedConversations={selectedConversations} 
          activeId={activeId} collapsed={collapsed} activeCascadeIds={activeCascadeIds} 
          onSelect={(id, title, workspace) => { onSelect(id, title, workspace); onClose(); }} onClose={onClose} 
          toggleBatchMode={toggleBatchMode} toggleSelectConversation={toggleSelectConversation} 
          handleBatchDelete={handleBatchDelete} togglePin={togglePin} 
          setCollapsed={setCollapsed} setSelectedConversations={setSelectedConversations}
        />
        
        <AssetPanel 
          bottomPanelOpen={bottomPanelOpen} setBottomPanelOpen={setBottomPanelOpen} 
          filteredSkills={filteredSkills} filteredWorkflows={filteredWorkflows} filteredRules={filteredRules} 
          wsOptions={wsOptions} activeWorkspace={activeWorkspace} skills={skills} 
          skillInstallLoading={skillInstallLoading} handleInstallSkill={handleInstallSkill} 
          setNewFlowDialogOpen={setNewFlowDialogOpen} handleOpenWorkflow={handleOpenWorkflow} 
          handleDeleteWorkflow={handleDeleteWorkflow} handlePromoteWorkflow={handlePromoteWorkflow} 
          setNewRuleDialogOpen={setNewRuleDialogOpen} handleOpenRule={handleOpenRule} 
          handleDeleteRule={handleDeleteRule} handlePromoteRule={handlePromoteRule} 
          handleUnhideWorkspace={handleUnhideWorkspace} handleCloseWorkspace={handleCloseWorkspace} 
          closingWs={closingWs} setCloseTarget={setCloseTarget} setCloseDialogOpen={setCloseDialogOpen} 
          handleLaunchWorkspace={handleLaunchWorkspace} onKnowledgeOpen={onKnowledgeOpen} 
          onLogsOpen={onLogsOpen} setFeishuConfigOpen={setFeishuConfigOpen} setTunnelConfigOpen={setTunnelConfigOpen}
          setAnalyticsOpen={setAnalyticsOpen} setImportSkillDialogOpen={setImportSkillDialogOpen}
          onStoreOpen={onStoreOpen}
        />

        <SearchDialog 
          searchOpen={searchOpen} setSearchOpen={setSearchOpen} isSearching={isSearching} 
          searchQuery={searchQuery} setSearchQuery={setSearchQuery} searchResults={searchResults} 
          fullTextResults={fullTextResults} conversations={conversations} activeCascadeIds={activeCascadeIds} 
          onSelect={onSelect} onClose={onClose} getWorkspaceName={getWorkspaceName}
        />

        <WorkspaceDialogs 
          launchDialogOpen={launchDialogOpen} setLaunchDialogOpen={setLaunchDialogOpen} launchTarget={launchTarget} 
          launchStatus={launchStatus} launchError={launchError} handleLaunchWorkspace={handleLaunchWorkspace} 
          pollRef={pollRef} onNew={onNew} onClose={onClose} closeDialogOpen={closeDialogOpen} 
          setCloseDialogOpen={setCloseDialogOpen} closeTarget={closeTarget} closeLoading={closeLoading} 
          closeError={closeError} handleKillWorkspace={handleKillWorkspace} newFlowDialogOpen={newFlowDialogOpen} 
          setNewFlowDialogOpen={setNewFlowDialogOpen} newFlowName={newFlowName} setNewFlowName={setNewFlowName} 
          newFlowDesc={newFlowDesc} setNewFlowDesc={setNewFlowDesc} newFlowLoading={newFlowLoading} 
          handleCreateWorkflow={handleCreateWorkflow} activeWorkspace={activeWorkspace} 
          newRuleDialogOpen={newRuleDialogOpen} setNewRuleDialogOpen={setNewRuleDialogOpen} 
          newRuleName={newRuleName} setNewRuleName={setNewRuleName} newRuleDesc={newRuleDesc} 
          setNewRuleDesc={setNewRuleDesc} newRuleLoading={newRuleLoading} handleCreateRule={handleCreateRule}
        />

        {/* New Rule Dialog */}
        <Dialog open={newRuleDialogOpen} onOpenChange={setNewRuleDialogOpen}>
          <DialogContent className="sm:max-w-[420px]">
            <DialogHeader>
              <DialogTitle>新建规则</DialogTitle>
              <DialogDescription>
                将会在当前项目 <span className="font-mono text-xs bg-muted px-1 rounded">{activeWorkspace?.replace('file://', '').split('/').pop()}</span> 下创建一个新的规则文件。
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <label className="text-sm font-medium">规则名称 (Name)</label>
                <input 
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50" 
                  placeholder="输入规则标识符 (如: code-style)" 
                  value={newRuleName} 
                  onChange={e => setNewRuleName(e.target.value)} 
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">描述 (Description)</label>
                <input 
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50" 
                  placeholder="输入规则的简要描述" 
                  value={newRuleDesc} 
                  onChange={e => setNewRuleDesc(e.target.value)} 
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setNewRuleDialogOpen(false)} disabled={newRuleLoading}>取消</Button>
              <Button onClick={handleCreateRule} disabled={newRuleLoading || !newRuleName.trim()}>
                {newRuleLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
                创建
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        <FeishuConfigDialog open={feishuConfigOpen} onOpenChange={setFeishuConfigOpen} />
        <TunnelConfigDialog open={tunnelConfigOpen} onOpenChange={setTunnelConfigOpen} />
        <AnalyticsDialog open={analyticsOpen} onOpenChange={setAnalyticsOpen} />

        {/* Import Global Skill Dialog */}
        <Dialog open={importSkillDialogOpen} onOpenChange={setImportSkillDialogOpen}>
          <DialogContent className="sm:max-w-[450px]">
            <DialogHeader>
              <DialogTitle>从本地目录导入技能</DialogTitle>
              <DialogDescription>
                将本地的技能文件夹导入为全局技能，所有项目均可引用。
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <label className="text-sm font-medium">技能文件夹绝对路径</label>
                <input 
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50" 
                  placeholder="例如: /Users/xxx/Downloads/agent-team" 
                  value={importSkillPath} 
                  onChange={e => { setImportSkillPath(e.target.value); setImportSkillError(''); }} 
                />
              </div>
              {importSkillError && (
                <div className="text-[11px] text-destructive bg-destructive/10 p-2 rounded">
                  {importSkillError}
                </div>
              )}
              <div className="text-[11px] text-muted-foreground bg-muted p-2.5 rounded leading-relaxed">
                系统会将该文件夹复制到 <span className="font-mono bg-background px-1 border rounded opacity-80">~/.agents/skills/</span> 目录下。导入成功后原文件可删除。
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setImportSkillDialogOpen(false)} disabled={importSkillLoading}>取消</Button>
              <Button onClick={handleImportGlobalSkill} disabled={importSkillLoading || !importSkillPath.trim()}>
                {importSkillLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
                执行导入
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

    </aside>
    </>
  );
}
