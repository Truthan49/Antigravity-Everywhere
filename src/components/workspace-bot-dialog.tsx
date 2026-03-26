'use client';

import { useState, useEffect, useCallback } from 'react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Loader2, BotMessageSquare, Plus, Trash2, Wifi, WifiOff } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface WorkspaceBotDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaces: { uri: string; name: string }[];
}

interface BotStatus {
  workspaceUri: string;
  label: string;
  appId: string;
  enabled: boolean;
  connected: boolean;
}

export function WorkspaceBotDialog({ open, onOpenChange, workspaces }: WorkspaceBotDialogProps) {
  const [bots, setBots] = useState<BotStatus[]>([]);
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);
  const [msg, setMsg] = useState('');

  // New bot form
  const [newForm, setNewForm] = useState({
    workspaceUri: '',
    appId: '',
    appSecret: '',
    label: ''
  });

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.getWorkspaceBots();
      setBots(data.bots || []);
    } catch { }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (open) refresh();
  }, [open, refresh]);

  const handleBind = async () => {
    if (!newForm.workspaceUri || !newForm.appId || !newForm.appSecret) {
      setMsg('请填写完整信息');
      return;
    }
    setSaving('new');
    setMsg('');
    try {
      const res = await api.bindWorkspaceBot({
        workspaceUri: newForm.workspaceUri,
        appId: newForm.appId,
        appSecret: newForm.appSecret,
        label: newForm.label || undefined,
        enabled: true
      });
      setMsg(res.message || '✅ 绑定成功');
      setAdding(false);
      setNewForm({ workspaceUri: '', appId: '', appSecret: '', label: '' });
      await refresh();
    } catch (e: any) {
      setMsg(`❌ ${e.message}`);
    }
    setSaving(null);
  };

  const handleUnbind = async (wsUri: string) => {
    setSaving(wsUri);
    try {
      await api.unbindWorkspaceBot(wsUri);
      setMsg('已解绑');
      await refresh();
    } catch (e: any) {
      setMsg(`❌ ${e.message}`);
    }
    setSaving(null);
  };

  // Filter out workspaces that already have a bot bound
  const availableWorkspaces = workspaces.filter(
    w => !bots.some(b => b.workspaceUri === w.uri)
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BotMessageSquare className="h-5 w-5 text-violet-500" /> 工作区独立飞书机器人
          </DialogTitle>
          <DialogDescription className="pt-2">
            为每个工作区绑定专属飞书机器人。独立机器人仅响应其绑定工作区的代码和任务，消息互不干扰，与全局机器人并存。
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="py-12 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : (
          <div className="space-y-4 py-2 max-h-[400px] overflow-y-auto">
            {/* Existing bots list */}
            {bots.length > 0 ? bots.map(bot => (
              <div key={bot.workspaceUri} className="flex items-center gap-3 p-3 rounded-lg border bg-muted/20 group">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold truncate">{bot.label || bot.workspaceUri.split('/').pop()}</span>
                    {bot.connected ? (
                      <Badge variant="outline" className="text-[9px] text-emerald-500 border-emerald-500/30 gap-0.5">
                        <Wifi className="h-2.5 w-2.5" /> 在线
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-[9px] text-muted-foreground gap-0.5">
                        <WifiOff className="h-2.5 w-2.5" /> 离线
                      </Badge>
                    )}
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-0.5 font-mono truncate">
                    appId: {bot.appId?.slice(0, 12)}...
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-destructive hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                  disabled={saving === bot.workspaceUri}
                  onClick={() => handleUnbind(bot.workspaceUri)}
                >
                  {saving === bot.workspaceUri ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                </Button>
              </div>
            )) : (
              <div className="text-center text-[11px] text-muted-foreground py-6">
                暂无独立飞书机器人，点击下方按钮添加
              </div>
            )}

            {/* Add new bot form */}
            {adding && (
              <div className="space-y-3 p-3 rounded-lg border border-dashed border-violet-500/30 bg-violet-500/5">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase text-muted-foreground">目标工作区</label>
                  <select
                    className="w-full h-8 rounded-md border bg-background px-2 text-xs font-mono"
                    value={newForm.workspaceUri}
                    onChange={e => setNewForm({ ...newForm, workspaceUri: e.target.value })}
                  >
                    <option value="">选择工作区...</option>
                    {availableWorkspaces.map(w => (
                      <option key={w.uri} value={w.uri}>{w.name}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase text-muted-foreground">机器人名称 (可选)</label>
                  <Input
                    value={newForm.label}
                    onChange={e => setNewForm({ ...newForm, label: e.target.value })}
                    placeholder="例如：前端专属助手"
                    className="font-mono text-xs h-8"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold uppercase text-muted-foreground">App ID</label>
                    <Input
                      value={newForm.appId}
                      onChange={e => setNewForm({ ...newForm, appId: e.target.value })}
                      placeholder="cli_a7xxxxxx"
                      className="font-mono text-[11px] h-8"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold uppercase text-muted-foreground">App Secret</label>
                    <Input
                      type="password"
                      value={newForm.appSecret}
                      onChange={e => setNewForm({ ...newForm, appSecret: e.target.value })}
                      placeholder="应用秘钥"
                      className="font-mono text-[11px] h-8"
                    />
                  </div>
                </div>
                <div className="flex gap-2 justify-end">
                  <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setAdding(false)}>取消</Button>
                  <Button size="sm" className="h-7 text-xs" onClick={handleBind} disabled={saving === 'new'}>
                    {saving === 'new' && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
                    绑定并启动
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        <DialogFooter className="flex items-center sm:justify-between">
          <div>
            {msg && <Badge variant="outline" className="text-[11px] font-normal tracking-wide">{msg}</Badge>}
          </div>
          <div className="flex gap-2">
            {!adding && (
              <Button variant="outline" size="sm" onClick={() => { setAdding(true); setMsg(''); }}>
                <Plus className="h-3.5 w-3.5 mr-1" /> 添加独立机器人
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>关闭</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
