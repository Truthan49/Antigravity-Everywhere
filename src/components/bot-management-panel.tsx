'use client';

import { useState, useEffect, useCallback } from 'react';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import {
  BotMessageSquare, X, Plus, Trash2, Loader2, Check, Power,
  Server, ChevronRight, Shield, Wifi, WifiOff, Settings2,
  FolderOpen, Zap, HelpCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { BotHelpDrawer } from '@/components/bot-help-drawer';
import type { Server as ServerType, Workspace, ModelConfig } from '@/lib/types';

interface BotManagementPanelProps {
  open: boolean;
  onClose: () => void;
}

interface WorkspaceBotStatus {
  workspaceUri: string;
  label?: string;
  appId: string;
  preferredModel?: string;
  enabled: boolean;
  connected: boolean;
}

function getWsName(uri: string) {
  return uri.replace('file://', '').split('/').pop() || uri;
}

export default function BotManagementPanel({ open, onClose }: BotManagementPanelProps) {
  // Global bot state
  const [globalConfig, setGlobalConfig] = useState({ appId: '', appSecret: '' });
  const [globalModel, setGlobalModel] = useState('');
  const [globalSaving, setGlobalSaving] = useState(false);
  const [globalMsg, setGlobalMsg] = useState('');

  // Workspace bots
  const [wsBots, setWsBots] = useState<WorkspaceBotStatus[]>([]);
  const [selectedBot, setSelectedBot] = useState<string | null>(null); // appId of selected bot

  // Add form
  const [showAddForm, setShowAddForm] = useState(false);
  const [newBot, setNewBot] = useState({ workspaceUri: '', appId: '', appSecret: '', label: '', preferredModel: '' });
  const [addingBot, setAddingBot] = useState(false);
  const [addMsg, setAddMsg] = useState('');

  const [availableWorkspaces, setAvailableWorkspaces] = useState<{ uri: string; name: string; running: boolean }[]>([]);
  const [models, setModels] = useState<ModelConfig[]>([]);

  const [loading, setLoading] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [configData, botsData, serversData, wsData, modelsData] = await Promise.all([
        api.getFeishuConfig().catch(() => ({ appId: '', appSecret: '' })),
        api.getWorkspaceBots().catch(() => ({ bots: [] })),
        api.servers().catch(() => [] as ServerType[]),
        api.workspaces().catch(() => ({ workspaces: [] as Workspace[], playgrounds: [] })),
        api.models().catch(() => ({ clientModelConfigs: [] })),
      ]);
      setModels((modelsData as any).clientModelConfigs || []);
      setGlobalModel((modelsData as any).globalPreferredModel || localStorage.getItem('antigravity_selected_model') || '');
      setGlobalConfig({ appId: configData.appId || '', appSecret: configData.appSecret || '' });
      setWsBots(botsData.bots || []);

      // Build workspace list from servers + workspaces
      const wsMap = new Map<string, { name: string; running: boolean }>();
      (serversData as ServerType[]).forEach(s => {
        const ws = s.workspace || '';
        if (!ws || ws.includes('/playground/')) return;
        wsMap.set(ws, { name: getWsName(ws), running: true });
      });
      ((wsData as any).workspaces as Workspace[] || []).forEach(w => {
        const uri = w.uri || '';
        if (!uri || wsMap.has(uri) || uri.includes('/playground/')) return;
        wsMap.set(uri, { name: getWsName(uri), running: false });
      });
      setAvailableWorkspaces(
        [...wsMap.entries()]
          .map(([uri, info]) => ({ uri, ...info }))
          .sort((a, b) => (a.running === b.running ? a.name.localeCompare(b.name) : a.running ? -1 : 1))
      );
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => {
    if (open) { loadData(); setSelectedBot(null); setShowAddForm(false); }
  }, [open, loadData]);

  // ──── Global Bot ────
  const handleSaveGlobal = async () => {
    setGlobalSaving(true);
    setGlobalMsg('');
    try {
      await api.updateFeishuConfig(globalConfig);
      setGlobalMsg('✅ 全局机器人已连接');
      setTimeout(() => setGlobalMsg(''), 5000);
    } catch (e: any) {
      setGlobalMsg(`❌ ${e.message}`);
    }
    setGlobalSaving(false);
  };

  // ──── Add Workspace Bot ────
  const handleAddBot = async () => {
    if (!newBot.workspaceUri || !newBot.appId || !newBot.appSecret) {
      setAddMsg('⚠️ 请完整填写工作区和凭证信息');
      return;
    }
    setAddingBot(true);
    setAddMsg('');
    try {
      const res = await api.bindWorkspaceBot({
        workspaceUri: newBot.workspaceUri,
        appId: newBot.appId,
        appSecret: newBot.appSecret,
        label: newBot.label || undefined,
        preferredModel: newBot.preferredModel || undefined,
        enabled: true,
      });
      if (res.ok) {
        setAddMsg('✅ 已绑定并启动');
        setShowAddForm(false);
        setNewBot({ workspaceUri: '', appId: '', appSecret: '', label: '', preferredModel: '' });
        await loadData();
        setSelectedBot(newBot.appId);
      } else {
        setAddMsg(`❌ ${res.error || '绑定失败'}`);
      }
    } catch (e: any) {
      setAddMsg(`❌ ${e.message}`);
    }
    setAddingBot(false);
    setTimeout(() => setAddMsg(''), 5000);
  };

  // ──── Remove Workspace Bot ────
  const handleRemoveBot = async (appId: string) => {
    const bot = wsBots.find(b => b.appId === appId);
    if (!confirm(`确定要解绑 ${bot?.label || getWsName(bot?.workspaceUri || '')} 的专属机器人吗？`)) return;
    try {
      await api.unbindWorkspaceBot(appId);
      if (selectedBot === appId) setSelectedBot(null);
      await loadData();
    } catch {}
  };

  const selectedBotData = wsBots.find(b => b.appId === selectedBot);

  // All workspaces are available (multiple bots can point to the same workspace)

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] bg-background flex">
      {/* ══════ LEFT SIDEBAR ══════ */}
      <aside className={cn(
        'flex flex-col border-r bg-background shrink-0 h-full overflow-hidden w-full md:w-[320px]',
        selectedBot ? 'hidden md:flex' : 'flex',
      )}>
        {/* Header */}
        <div className="flex items-center gap-3 px-4 h-14 border-b shrink-0">
          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
          <BotMessageSquare className="h-4 w-4 text-indigo-500 shrink-0" />
          <h2 className="text-sm font-semibold flex-1 truncate">飞书机器人管理中心</h2>
          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground" onClick={() => setHelpOpen(true)} title="查看使用帮助">
            <HelpCircle className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden p-3 space-y-4">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              {/* ── Global Bot Section ── */}
              <div className="space-y-2">
                <div className="flex items-center gap-2 px-1">
                  <Shield className="h-3.5 w-3.5 text-emerald-500" />
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">全局机器人</span>
                </div>
                <div
                  className={cn(
                    'p-3 rounded-lg border bg-card cursor-pointer transition-all hover:shadow-sm group',
                    !selectedBot ? 'border-primary/40 bg-primary/5 shadow-sm' : '',
                  )}
                  onClick={() => setSelectedBot(null)}
                >
                  <div className="flex items-center gap-2.5">
                    <div className={cn('w-2.5 h-2.5 rounded-full shrink-0', globalConfig.appId ? 'bg-emerald-500' : 'bg-muted-foreground/30')} />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-semibold">全局调度机器人</div>
                      <div className="text-[10px] text-muted-foreground font-mono truncate mt-0.5">
                        {globalConfig.appId || '未配置'}
                      </div>
                    </div>
                    <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0" />
                  </div>
                </div>
              </div>

              <Separator />

              {/* ── Workspace Bots Section ── */}
              <div className="space-y-2">
                <div className="flex items-center justify-between px-1">
                  <div className="flex items-center gap-2">
                    <Zap className="h-3.5 w-3.5 text-indigo-500" />
                    <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                      工作区专属机器人 ({wsBots.length})
                    </span>
                  </div>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => { setShowAddForm(true); setSelectedBot(null); }}
                    title="绑定新的工作区机器人"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </Button>
                </div>

                {wsBots.length > 0 ? wsBots.map(bot => (
                  <div
                    key={bot.appId}
                    className={cn(
                      'p-3 rounded-lg border bg-card cursor-pointer transition-all hover:shadow-sm group',
                      selectedBot === bot.appId ? 'border-primary/40 bg-primary/5 shadow-sm' : '',
                    )}
                    onClick={() => { setSelectedBot(bot.appId); setShowAddForm(false); }}
                  >
                    <div className="flex items-center gap-2.5">
                      <div className={cn(
                        'w-2.5 h-2.5 rounded-full shrink-0',
                        bot.connected ? 'bg-emerald-500' : bot.enabled ? 'bg-amber-500' : 'bg-muted-foreground/30'
                      )} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-semibold truncate">{bot.label || getWsName(bot.workspaceUri)}</span>
                          {bot.connected && (
                            <Badge variant="outline" className="text-[7px] px-1 h-3.5 text-emerald-600 border-emerald-500/30 shrink-0">在线</Badge>
                          )}
                          {!bot.connected && bot.enabled && (
                            <Badge variant="outline" className="text-[7px] px-1 h-3.5 text-amber-600 border-amber-500/30 shrink-0">离线</Badge>
                          )}
                        </div>
                        <div className="text-[10px] text-muted-foreground truncate mt-0.5">
                          {getWsName(bot.workspaceUri)}
                        </div>
                      </div>
                      <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0" />
                    </div>
                  </div>
                )) : (
                  <div className="text-center text-[11px] text-muted-foreground py-6 border rounded-lg bg-muted/10">
                    暂未绑定任何工作区专属机器人
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </aside>

      {/* ══════ MAIN CONTENT ══════ */}
      <main className={cn(
        'flex-1 flex flex-col min-w-0',
        !selectedBot && !showAddForm ? 'hidden md:flex' : 'flex',
      )}>
        {/* ── Header ── */}
        <div className="flex items-center gap-3 px-4 md:px-6 h-14 border-b shrink-0 bg-background/95 backdrop-blur">
          <Button variant="ghost" size="icon" className="h-8 w-8 md:hidden shrink-0" onClick={() => { setSelectedBot(null); setShowAddForm(false); }}>
            <X className="h-4 w-4" />
          </Button>
          <Settings2 className="h-4 w-4 text-muted-foreground shrink-0" />
          <span className="text-sm font-semibold truncate">
            {showAddForm ? '绑定新机器人' : selectedBot ? `${selectedBotData?.label || getWsName(selectedBot)} 配置` : '全局机器人配置'}
          </span>
          {addMsg && (
            <Badge variant="outline" className="text-[10px] ml-auto">{addMsg}</Badge>
          )}
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="max-w-xl mx-auto p-6 md:p-10 space-y-8">
            {showAddForm ? (
              /* ══════ ADD WORKSPACE BOT FORM ══════ */
              <>
                <div>
                  <h3 className="text-lg font-bold tracking-tight mb-2">绑定工作区专属机器人</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    从已有工作区中选择一个项目，填入独立飞书应用的凭证。绑定后该机器人收到的所有消息将自动路由至对应工作区的 Agent 进程。
                  </p>
                </div>

                <div className="space-y-5">
                  {/* Workspace Selector */}
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-muted-foreground">选择工作区</label>
                    {availableWorkspaces.length > 0 ? (
                      <Select value={newBot.workspaceUri || undefined} onValueChange={(v) => setNewBot({ ...newBot, workspaceUri: v || '' })}>
                        <SelectTrigger className="h-9 text-xs">
                          <SelectValue placeholder="请选择一个工作区..." />
                        </SelectTrigger>
                        <SelectContent>
                          {availableWorkspaces.map(ws => (
                            <SelectItem key={ws.uri} value={ws.uri} className="text-xs">
                              <div className="flex items-center gap-2">
                                <div className={cn('w-1.5 h-1.5 rounded-full', ws.running ? 'bg-emerald-500' : 'bg-muted-foreground/30')} />
                                <FolderOpen className="h-3 w-3 text-muted-foreground" />
                                <span className="font-medium">{ws.name}</span>
                                <span className="text-[10px] text-muted-foreground font-mono ml-1 hidden sm:inline">{ws.uri.replace('file://', '').replace(new RegExp(`/${ws.name}$`), '/...')}</span>
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <div className="text-xs text-muted-foreground bg-muted/30 border rounded-lg p-3">
                        {availableWorkspaces.length === 0
                          ? '未找到可用工作区。请先在 Antigravity 中打开一个项目。'
                          : '所有工作区均已绑定机器人。'}
                      </div>
                    )}
                    {newBot.workspaceUri && (
                      <div className="text-[10px] text-muted-foreground font-mono bg-muted/20 px-2 py-1 rounded truncate">
                        {newBot.workspaceUri}
                      </div>
                    )}
                  </div>

                  {/* Label */}
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-muted-foreground">机器人昵称 <span className="text-muted-foreground/60">(可选)</span></label>
                    <Input
                      value={newBot.label}
                      onChange={e => setNewBot({ ...newBot, label: e.target.value })}
                      placeholder="例如: 前端专属助手、后端 Agent"
                      className="text-xs h-9"
                    />
                  </div>

                  {/* Model Selector */}
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-muted-foreground">指定模型 <span className="text-muted-foreground/60">(可选，默认跟随全局)</span></label>
                    <Select value={newBot.preferredModel || '__clear__'} onValueChange={(v) => setNewBot({ ...newBot, preferredModel: v === '__clear__' ? '' : (v || '') })}>
                      <SelectTrigger className="h-9 text-xs">
                        <SelectValue placeholder="跟随全局默认模型" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__clear__" className="text-xs text-muted-foreground">
                          跟随全局默认模型
                        </SelectItem>
                        {models.map(m => (
                          <SelectItem key={m.modelOrAlias?.model || m.label} value={m.modelOrAlias?.model || ''} className="text-xs">
                            {m.label}{m.isRecommended ? ' ⭐' : ''}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <Separator />

                  {/* App ID */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-xs font-semibold text-muted-foreground">App ID</label>
                      <Input
                        value={newBot.appId}
                        onChange={e => setNewBot({ ...newBot, appId: e.target.value })}
                        placeholder="cli_a7xxxxxx"
                        className="font-mono text-xs h-9"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-semibold text-muted-foreground">App Secret</label>
                      <Input
                        type="password"
                        value={newBot.appSecret}
                        onChange={e => setNewBot({ ...newBot, appSecret: e.target.value })}
                        placeholder="应用秘钥"
                        className="font-mono text-xs h-9"
                      />
                    </div>
                  </div>

                  <div className="bg-indigo-500/5 border border-indigo-500/20 rounded-lg p-3">
                    <p className="text-[11px] text-muted-foreground leading-relaxed">
                      <strong className="text-foreground">提示：</strong>
                      在飞书开放平台创建一个新应用，开启「接收消息」和「WebSocket 长链接」能力。
                      每个工作区对应一个独立应用，实现消息精准路由与权限隔离。
                    </p>
                  </div>

                  <div className="flex gap-3">
                    <Button onClick={handleAddBot} disabled={addingBot || !newBot.workspaceUri} className="flex-1">
                      {addingBot && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
                      确认绑定
                    </Button>
                    <Button variant="outline" onClick={() => setShowAddForm(false)} className="flex-1">
                      取消
                    </Button>
                  </div>
                </div>
              </>
            ) : selectedBot && selectedBotData ? (
              /* ══════ WORKSPACE BOT DETAIL ══════ */
              <>
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-lg font-bold tracking-tight mb-1">{selectedBotData.label || getWsName(selectedBot)}</h3>
                    <p className="text-xs text-muted-foreground font-mono">{selectedBot}</p>
                  </div>
                  <div className={cn(
                    'flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold',
                    selectedBotData.connected
                      ? 'bg-emerald-500/10 text-emerald-600'
                      : selectedBotData.enabled
                      ? 'bg-amber-500/10 text-amber-600'
                      : 'bg-muted text-muted-foreground'
                  )}>
                    {selectedBotData.connected ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
                    {selectedBotData.connected ? '在线' : selectedBotData.enabled ? '离线' : '已禁用'}
                  </div>
                </div>

                <Separator />

                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-xs font-semibold text-muted-foreground">App ID</label>
                      <div className="text-xs font-mono bg-muted/30 border rounded-lg p-2.5 truncate">{selectedBotData.appId}</div>
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-semibold text-muted-foreground">指定模型</label>
                      <div className="text-xs bg-muted/30 border rounded-lg p-2.5">
                        {selectedBotData.preferredModel 
                          ? `🎯 ${models.find(m => m.modelOrAlias?.model === selectedBotData.preferredModel)?.label || selectedBotData.preferredModel}`
                          : '🌐 跟随全局默认模型'}
                      </div>
                    </div>
                  </div>

                  <div className="bg-muted/20 border rounded-lg p-4 space-y-2">
                    <h4 className="text-xs font-bold">工作原理</h4>
                    <ul className="text-[11px] text-muted-foreground space-y-1.5 leading-relaxed">
                      <li className="flex gap-2"><span className="text-indigo-500">①</span> 用户在飞书中向此机器人发送消息</li>
                      <li className="flex gap-2"><span className="text-indigo-500">②</span> Gateway 识别 App ID 并路由到工作区 <strong>{selectedBotData ? getWsName(selectedBotData.workspaceUri) : ''}</strong></li>
                      <li className="flex gap-2"><span className="text-indigo-500">③</span> 对应的 Language Server 处理请求并返回结果</li>
                    </ul>
                  </div>
                </div>

                <Separator />

                <Button
                  variant="outline"
                  className="w-full text-destructive border-destructive/30 hover:bg-destructive/10"
                  onClick={() => handleRemoveBot(selectedBot!)}
                >
                  <Trash2 className="h-3.5 w-3.5 mr-1.5" /> 解绑此机器人
                </Button>
              </>
            ) : (
              /* ══════ GLOBAL BOT CONFIG ══════ */
              <>
                <div>
                  <h3 className="text-lg font-bold tracking-tight mb-2">全局机器人配置</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    全局机器人负责跨工作区调度（切换项目、查询额度、全局设置等），
                    在飞书开放平台开启 WebSocket 长链接模式即可对接。
                  </p>
                </div>

                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-xs font-semibold text-muted-foreground">App ID</label>
                      <Input
                        value={globalConfig.appId}
                        onChange={e => setGlobalConfig({ ...globalConfig, appId: e.target.value })}
                        placeholder="cli_a7xxxxxx"
                        className="font-mono text-xs h-9"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-semibold text-muted-foreground">App Secret</label>
                      <Input
                        type="password"
                        value={globalConfig.appSecret}
                        onChange={e => setGlobalConfig({ ...globalConfig, appSecret: e.target.value })}
                        placeholder="应用秘钥"
                        className="font-mono text-xs h-9"
                      />
                    </div>
                  </div>

                  {/* Global Model Selector */}
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-muted-foreground">全局默认模型</label>
                    <Select value={globalModel === 'MODEL_AUTO' || !globalModel ? '__auto__' : globalModel} onValueChange={(v) => {
                      const val = v === '__auto__' ? 'MODEL_AUTO' : (v || '');
                      setGlobalModel(val);
                      api.setModel(val).catch(console.error);
                      if (typeof window !== 'undefined') localStorage.setItem('antigravity_selected_model', val);
                      setGlobalMsg('✅ 模型已切换');
                      setTimeout(() => setGlobalMsg(''), 3000);
                    }}>
                      <SelectTrigger className="h-9 text-xs">
                        <SelectValue placeholder="选择默认模型" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__auto__" className="text-xs">
                          🎲 自动选择 (Auto)
                        </SelectItem>
                        {models.map(m => (
                          <SelectItem key={m.modelOrAlias?.model || m.label} value={m.modelOrAlias?.model || ''} className="text-xs">
                            {m.label}{m.isRecommended ? ' ⭐' : ''}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-[10px] text-muted-foreground">全局模型影响所有未指定独立模型的机器人，同时也同步到 Web UI 的模型选择。</p>
                  </div>

                  <div className="flex items-center gap-3">
                    <Button onClick={handleSaveGlobal} disabled={globalSaving}>
                      {globalSaving && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
                      保存并连接
                    </Button>
                    {globalMsg && <span className="text-xs text-muted-foreground">{globalMsg}</span>}
                  </div>
                </div>

                <Separator />

                <div className="bg-muted/20 border rounded-lg p-4 space-y-3">
                  <h4 className="text-xs font-bold flex items-center gap-2">
                    <Server className="h-3.5 w-3.5 text-muted-foreground" /> 架构说明
                  </h4>
                  <div className="text-[11px] text-muted-foreground leading-relaxed space-y-2">
                    <p>
                      <strong className="text-foreground">全局机器人</strong> 是默认入口，处理不属于任何工作区的通用对话。
                    </p>
                    <p>
                      <strong className="text-foreground">工作区专属机器人</strong> 绑定到特定项目目录，收到消息后自动路由至该工作区的 Agent 进程，
                      实现消息精准路由与权限隔离。多个团队成员可以通过不同的飞书应用与不同的项目工作区交互。
                    </p>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </main>
      {/* Help Drawer */}
      <BotHelpDrawer open={helpOpen} onOpenChange={setHelpOpen} />
    </div>
  );
}
