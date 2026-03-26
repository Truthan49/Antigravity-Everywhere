'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Loader2, BotMessageSquare, Plus, Trash2, Power, PowerOff, ChevronRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface FeishuConfigDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface WorkspaceBotStatus {
  workspaceUri: string;
  label?: string;
  appId: string;
  enabled: boolean;
  connected: boolean;
}

export function FeishuConfigDialog({ open, onOpenChange }: FeishuConfigDialogProps) {
  const [config, setConfig] = useState({ appId: '', appSecret: '' });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');

  // Workspace bots state
  const [wsBots, setWsBots] = useState<WorkspaceBotStatus[]>([]);
  const [showAddBot, setShowAddBot] = useState(false);
  const [newBot, setNewBot] = useState({ workspaceUri: '', appId: '', appSecret: '', label: '' });
  const [addingBot, setAddingBot] = useState(false);
  const [botMsg, setBotMsg] = useState('');

  useEffect(() => {
    if (open) {
      setLoading(true);
      setSaveMsg('');
      setBotMsg('');
      Promise.all([
        api.getFeishuConfig().then(data => {
          setConfig({ appId: data.appId || '', appSecret: data.appSecret || '' });
        }),
        api.getWorkspaceBots().then(data => {
          setWsBots(data.bots || []);
        }).catch(() => {})
      ]).finally(() => setLoading(false));
    }
  }, [open]);

  const handleSave = async () => {
    setSaving(true);
    setSaveMsg('');
    try {
      await api.updateFeishuConfig(config);
      setSaveMsg('✅ 全局机器人长链接已连接！');
      setTimeout(() => setSaveMsg(''), 6000);
    } catch (e: any) {
      setSaveMsg(`❌ 连接失败: ${e.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleAddBot = async () => {
    if (!newBot.workspaceUri || !newBot.appId || !newBot.appSecret) {
      setBotMsg('⚠️ 请填写完整信息');
      return;
    }
    setAddingBot(true);
    setBotMsg('');
    try {
      const res = await api.bindWorkspaceBot({
        workspaceUri: newBot.workspaceUri,
        appId: newBot.appId,
        appSecret: newBot.appSecret,
        label: newBot.label || undefined,
        enabled: true
      });
      if (res.ok) {
        setBotMsg(`✅ ${res.message || '已绑定'}`);
        setShowAddBot(false);
        setNewBot({ workspaceUri: '', appId: '', appSecret: '', label: '' });
        // Refresh list
        const data = await api.getWorkspaceBots();
        setWsBots(data.bots || []);
      } else {
        setBotMsg(`❌ ${res.error || '绑定失败'}`);
      }
    } catch (e: any) {
      setBotMsg(`❌ ${e.message}`);
    } finally {
      setAddingBot(false);
      setTimeout(() => setBotMsg(''), 5000);
    }
  };

  const handleRemoveBot = async (uri: string) => {
    try {
      await api.unbindWorkspaceBot(uri);
      setWsBots(prev => prev.filter(b => b.workspaceUri !== uri));
      setBotMsg('✅ 已解绑');
      setTimeout(() => setBotMsg(''), 3000);
    } catch (e: any) {
      setBotMsg(`❌ ${e.message}`);
    }
  };

  const handleToggleBot = async (bot: WorkspaceBotStatus) => {
    try {
      await api.bindWorkspaceBot({
        workspaceUri: bot.workspaceUri,
        appId: bot.appId,
        appSecret: '', // We'll need to keep existing secret server-side
        label: bot.label,
        enabled: !bot.enabled
      });
      const data = await api.getWorkspaceBots();
      setWsBots(data.bots || []);
    } catch {}
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BotMessageSquare className="h-5 w-5 text-indigo-500" /> 飞书机器人管理中心
          </DialogTitle>
          <DialogDescription className="pt-2">
            管理全局机器人和各工作区的专属独立机器人。每个工作区可绑定独立的飞书应用，实现消息精准路由与权限隔离。
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="py-12 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : (
          <div className="space-y-6 py-2">
            {/* === Section 1: Global Bot === */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">全局机器人 (主入口)</span>
              </div>
              <p className="text-[10px] text-muted-foreground/80 leading-relaxed">
                全局机器人负责跨工作区调度（切换项目、查询额度、全局设置等），在飞书开放平台开启 WebSocket 长链接模式即可对接。
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-semibold uppercase text-muted-foreground">App ID</label>
                  <Input
                    value={config.appId}
                    onChange={e => setConfig({ ...config, appId: e.target.value })}
                    placeholder="cli_a7xxxxxx"
                    className="font-mono text-xs h-8"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-semibold uppercase text-muted-foreground">App Secret</label>
                  <Input
                    type="password"
                    value={config.appSecret}
                    onChange={e => setConfig({ ...config, appSecret: e.target.value })}
                    placeholder="应用秘钥"
                    className="font-mono text-xs h-8"
                  />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button size="sm" onClick={handleSave} disabled={saving} className="h-7 text-xs">
                  {saving && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
                  保存并连接
                </Button>
                {saveMsg && <span className="text-[10px] text-muted-foreground">{saveMsg}</span>}
              </div>
            </div>

            <div className="border-t" />

            {/* === Section 2: Workspace Bots === */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-indigo-500 shrink-0" />
                  <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">工作区专属机器人</span>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-6 text-[10px] px-2"
                  onClick={() => setShowAddBot(!showAddBot)}
                >
                  <Plus className="h-3 w-3 mr-0.5" /> 绑定新机器人
                </Button>
              </div>
              <p className="text-[10px] text-muted-foreground/80 leading-relaxed">
                每个工作区可绑定一个独立飞书应用。收到消息后自动识别来源并路由至对应工作区的 Agent 进程，实现精准隔离。
              </p>

              {/* Add New Bot Form */}
              {showAddBot && (
                <div className="p-3 rounded-lg border border-indigo-500/20 bg-indigo-500/5 space-y-2.5">
                  <div className="space-y-1">
                    <label className="text-[10px] font-semibold text-muted-foreground">工作区路径 (file:// URI)</label>
                    <Input
                      value={newBot.workspaceUri}
                      onChange={e => setNewBot({ ...newBot, workspaceUri: e.target.value })}
                      placeholder="file:///Users/hanyi/Projects/MyApp"
                      className="font-mono text-[10px] h-7"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-semibold text-muted-foreground">机器人昵称 (可选)</label>
                    <Input
                      value={newBot.label}
                      onChange={e => setNewBot({ ...newBot, label: e.target.value })}
                      placeholder="例: 前端专属助手"
                      className="text-xs h-7"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <label className="text-[10px] font-semibold text-muted-foreground">App ID</label>
                      <Input
                        value={newBot.appId}
                        onChange={e => setNewBot({ ...newBot, appId: e.target.value })}
                        placeholder="cli_a7xxxxxx"
                        className="font-mono text-[10px] h-7"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-semibold text-muted-foreground">App Secret</label>
                      <Input
                        type="password"
                        value={newBot.appSecret}
                        onChange={e => setNewBot({ ...newBot, appSecret: e.target.value })}
                        placeholder="秘钥"
                        className="font-mono text-[10px] h-7"
                      />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" className="h-7 text-xs" onClick={handleAddBot} disabled={addingBot}>
                      {addingBot && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
                      确认绑定
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setShowAddBot(false)}>
                      取消
                    </Button>
                  </div>
                </div>
              )}

              {/* Bot List */}
              {wsBots.length > 0 ? (
                <div className="space-y-2">
                  {wsBots.map(bot => (
                    <div key={bot.workspaceUri} className="flex items-center gap-2 p-2.5 rounded-lg border bg-background group">
                      <div className={`w-2 h-2 rounded-full shrink-0 ${bot.connected ? 'bg-emerald-500' : bot.enabled ? 'bg-amber-500' : 'bg-muted-foreground/30'}`} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-semibold truncate">{bot.label || bot.workspaceUri.split('/').pop()}</span>
                          {bot.connected && <Badge variant="outline" className="text-[8px] px-1 h-3.5 text-emerald-600 border-emerald-500/30">在线</Badge>}
                          {!bot.connected && bot.enabled && <Badge variant="outline" className="text-[8px] px-1 h-3.5 text-amber-600 border-amber-500/30">离线</Badge>}
                          {!bot.enabled && <Badge variant="outline" className="text-[8px] px-1 h-3.5">已禁用</Badge>}
                        </div>
                        <div className="text-[9px] text-muted-foreground truncate font-mono">{bot.appId}</div>
                      </div>
                      <div className="flex gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 text-destructive hover:text-destructive cursor-pointer"
                          onClick={() => handleRemoveBot(bot.workspaceUri)}
                          title="解绑此机器人"
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center text-[11px] text-muted-foreground py-4 border rounded-lg bg-muted/10">
                  暂未绑定任何工作区专属机器人
                </div>
              )}

              {botMsg && (
                <div className="text-[10px] text-muted-foreground px-1">{botMsg}</div>
              )}
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>关闭</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
