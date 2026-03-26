'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Loader2, Globe, Play, Square, CheckCircle2, AlertCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface TunnelConfigDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function TunnelConfigDialog({ open, onOpenChange }: TunnelConfigDialogProps) {
  const [config, setConfig] = useState({ tunnelName: '', url: '', credentialsPath: '', autoStart: true });
  const [status, setStatus] = useState({ running: false, starting: false, url: '', error: null as string | null, configured: false });
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [msg, setMsg] = useState('');

  const fetchStatus = async () => {
    try {
      const res = await fetch('/api/tunnel');
      if (res.ok) {
        const data = await res.json();
        setStatus({
          running: data.running,
          starting: data.starting,
          url: data.url,
          error: data.error,
          configured: data.configured
        });
        if (data.config) {
          setConfig({
            tunnelName: data.config.tunnelName || '',
            url: data.config.url || '',
            credentialsPath: data.config.credentialsPath || '',
            autoStart: data.config.autoStart ?? true
          });
        }
      }
    } catch (e: any) {
      console.error('Failed to fetch tunnel status', e);
    }
  };

  useEffect(() => {
    if (open) {
      setLoading(true);
      fetchStatus().finally(() => setLoading(false));
    }
  }, [open]);

  // Polling while starting or running (to catch disconnects or startup completion)
  useEffect(() => {
    if (!open) return;
    let interval: NodeJS.Timeout;
    if (status.starting || status.running || actionLoading) {
      interval = setInterval(fetchStatus, 2000);
    }
    return () => clearInterval(interval);
  }, [open, status.starting, status.running, actionLoading]);

  const showMsg = (m: string, ms = 5000) => {
    setMsg(m);
    if (ms) setTimeout(() => setMsg(''), ms);
  };

  const handleSave = async () => {
    setActionLoading(true);
    try {
      const res = await fetch('/api/tunnel/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
      });
      if (!res.ok) throw new Error(await res.text());
      showMsg('✅ 配置已保存');
      await fetchStatus();
    } catch (e: any) {
      showMsg(`❌ 保存失败: ${e.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  const handleStart = async () => {
    setActionLoading(true);
    try {
      const res = await fetch('/api/tunnel/start', { method: 'POST' });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Unknown error');
      showMsg('🚀 隧道启动中...');
    } catch (e: any) {
      showMsg(`❌ 启动失败: ${e.message}`);
    } finally {
      setActionLoading(false);
      fetchStatus();
    }
  };

  const handleStop = async () => {
    setActionLoading(true);
    try {
      const res = await fetch('/api/tunnel/stop', { method: 'POST' });
      if (!res.ok) throw new Error(await res.text());
      showMsg('⏹️ 隧道已停止');
    } catch (e: any) {
      showMsg(`❌ 停止失败: ${e.message}`);
    } finally {
      setActionLoading(false);
      fetchStatus();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Globe className="h-5 w-5 text-emerald-500" /> Cloudflare 内网穿透
          </DialogTitle>
          <DialogDescription className="pt-2 text-xs">
            配置并管理内置的 cloudflared 隧道，一键将本地网关暴露到公网。<br/>
            前提条件: 电脑已安装 <code className="bg-muted px-1 py-0.5 rounded">brew install cloudflared</code> 并完成 login。
          </DialogDescription>
        </DialogHeader>
        
        {loading ? (
          <div className="py-12 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : (
          <div className="space-y-5 py-4">
            {/* Status Panel */}
            <div className="bg-muted/30 border rounded-lg p-4 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold">运行状态</span>
                {status.starting ? (
                  <Badge variant="outline" className="border-amber-500/50 text-amber-500 bg-amber-500/10 gap-1.5 py-0.5">
                    <Loader2 className="w-3 h-3 animate-spin" /> 启动中...
                  </Badge>
                ) : status.running ? (
                  <Badge variant="outline" className="border-emerald-500/50 text-emerald-500 bg-emerald-500/10 gap-1.5 py-0.5">
                    <CheckCircle2 className="w-3 h-3" /> 运行中
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-muted-foreground gap-1.5 py-0.5">
                    <Square className="w-3 h-3" /> 已停止
                  </Badge>
                )}
              </div>
              
              {status.running && status.url && (
                <div className="text-xs flex items-center gap-2 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 p-2 rounded border border-emerald-500/20">
                  <Globe className="w-4 h-4 shrink-0" />
                  <a href={status.url} target="_blank" rel="noreferrer" className="underline font-mono truncate">{status.url}</a>
                </div>
              )}

              {status.error && (
                <div className="text-[11px] text-destructive bg-destructive/10 p-2 rounded border border-destructive/20 flex gap-2">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <span className="break-all">{status.error}</span>
                </div>
              )}

              <div className="flex gap-2 pt-1 border-t mt-1">
                {!status.running && !status.starting && (
                  <Button 
                    size="sm" 
                    className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white" 
                    onClick={handleStart}
                    disabled={actionLoading || !status.configured}
                  >
                    {actionLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Play className="w-4 h-4 mr-2" />}
                    启动隧道
                  </Button>
                )}
                {(status.running || status.starting) && (
                  <Button 
                    size="sm" 
                    variant="destructive" 
                    className="flex-1" 
                    onClick={handleStop}
                    disabled={actionLoading}
                  >
                    {actionLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Square className="w-4 h-4 mr-2" />}
                    停止隧道
                  </Button>
                )}
              </div>
            </div>

            <div className="space-y-3">
              <div className="space-y-1.5">
                <label className="flex items-center gap-2 text-xs font-semibold uppercase text-muted-foreground">
                  隧道名称 (Tunnel Name) <span className="text-destructive">*</span>
                </label>
                <Input 
                  value={config.tunnelName} 
                  onChange={e => setConfig({...config, tunnelName: e.target.value})} 
                  placeholder="antigravity-gateway"
                  className="font-mono text-sm h-8"
                  disabled={status.running || status.starting}
                />
              </div>
              
              <div className="space-y-1.5">
                <label className="flex items-center gap-2 text-xs font-semibold uppercase text-muted-foreground">
                  公开网址 (Public URL)
                </label>
                <Input 
                  value={config.url} 
                  onChange={e => setConfig({...config, url: e.target.value})} 
                  placeholder="https://ai.yourdomain.com"
                  className="font-mono text-sm h-8"
                  disabled={status.running || status.starting}
                />
                <p className="text-[10px] text-muted-foreground">
                  显示用途，请确保在 CLI 中执行过 `cloudflared tunnel route dns ...` 绑定
                </p>
              </div>

              <div className="space-y-1.5">
                <label className="flex items-center justify-between text-xs font-semibold uppercase text-muted-foreground">
                  <span>随服务自动启动 (Auto-start)</span>
                  <input 
                    type="checkbox"
                    className="w-4 h-4 cursor-pointer"
                    checked={config.autoStart} 
                    onChange={e => setConfig({...config, autoStart: e.target.checked})}
                    disabled={status.running || status.starting}
                  />
                </label>
              </div>
            </div>
          </div>
        )}

        <DialogFooter className="flex items-center sm:justify-between border-t pt-4">
          <div className="w-[60%]">
            {msg && <span className="text-xs font-medium text-emerald-500">{msg}</span>}
          </div>
          <div className="flex gap-2">
            <DialogClose asChild>
              <Button variant="outline" size="sm">关闭</Button>
            </DialogClose>
            <Button size="sm" onClick={handleSave} disabled={actionLoading || loading || status.running || status.starting || !config.tunnelName}>
              保存配置
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
