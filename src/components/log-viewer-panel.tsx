'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Play, Pause, Search, RefreshCw, Filter, Copy, X, Terminal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface LogViewerPanelProps {
  open: boolean;
  onClose: () => void;
}

interface LogEntry {
  level: number;
  time: number;
  pid: number;
  hostname: string;
  msg: string;
  module?: string;
  err?: any;
  [key: string]: any;
}

const LEVEL_COLORS: Record<number, { label: string; bg: string; text: string }> = {
  10: { label: 'TRACE', bg: 'bg-slate-500/10', text: 'text-slate-500' },
  20: { label: 'DEBUG', bg: 'bg-zinc-500/10', text: 'text-zinc-500' },
  30: { label: 'INFO', bg: 'bg-blue-500/10', text: 'text-blue-500' },
  40: { label: 'WARN', bg: 'bg-amber-500/10', text: 'text-amber-500' },
  50: { label: 'ERROR', bg: 'bg-red-500/10', text: 'text-red-500' },
  60: { label: 'FATAL', bg: 'bg-rose-500/10', text: 'text-rose-500' },
};

function getLevelInfo(level: number) {
  return LEVEL_COLORS[level] || { label: 'UNKNOWN', bg: 'bg-gray-500/10', text: 'text-gray-500' };
}

function extractExtraPayload(log: LogEntry) {
  const omit = ['level', 'time', 'pid', 'hostname', 'msg', 'module', 'v'];
  const extra: Record<string, any> = {};
  for (const k of Object.keys(log)) {
    if (!omit.includes(k)) {
      extra[k] = log[k];
    }
  }
  return Object.keys(extra).length > 0 ? extra : null;
}

export default function LogViewerPanel({ open, onClose }: LogViewerPanelProps) {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [category, setCategory] = useState<'system'|'conversation'|'workspace'>('conversation');
  
  // Filters
  const [minLevel, setMinLevel] = useState<string>('0');
  const [searchQuery, setSearchQuery] = useState('');

  const fetchLogs = useCallback(async (isSilent = false) => {
    if (!isSilent) setLoading(true);
    try {
      const res = await fetch(`/api/logs?limit=1000&category=${category}`);
      const data = await res.json();
      if (data.logs) {
        setLogs(data.logs);
      }
    } catch { /* silent */ }
    if (!isSilent) setLoading(false);
  }, [category]);

  // Initial load or category change
  useEffect(() => {
    if (open) {
      setLogs([]); // clear on switch to avoid flash
      fetchLogs();
    }
  }, [open, category, fetchLogs]);

  // Auto refresh
  useEffect(() => {
    if (!open || !autoRefresh) return;
    const t = setInterval(() => {
      fetchLogs(true);
    }, 2000);
    return () => clearInterval(t);
  }, [open, autoRefresh, fetchLogs]);

  if (!open) return null;

  const filteredLogs = logs.filter(l => {
    if (l.level < parseInt(minLevel, 10)) return false;
    if (searchQuery) {
      const qs = searchQuery.toLowerCase();
      const raw = JSON.stringify(l).toLowerCase();
      if (!raw.includes(qs)) return false;
    }
    return true;
  });

  return (
    <div className="fixed inset-0 z-[60] bg-background flex flex-col font-mono">
      {/* ── Header ── */}
      <header className="flex items-center gap-3 px-4 h-12 border-b shrink-0 bg-background/95 backdrop-blur">
        <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
        <Terminal className="h-4 w-4 text-emerald-500 shrink-0 hidden lg:block" />
        <h2 className="text-sm font-semibold flex-1 truncate font-sans hidden lg:block">
          日志 <span className="text-muted-foreground font-normal text-xs ml-2">(logs/{category}.*.log)</span>
        </h2>

        {/* Category Tabs */}
        <div className="flex-1 lg:flex-none flex justify-center">
          <Tabs value={category} onValueChange={(v) => setCategory(v as any)} className="w-full lg:w-auto overflow-x-auto">
            <TabsList className="h-8">
              <TabsTrigger value="conversation" className="text-[10px] md:text-xs">会话日志 (Conversation)</TabsTrigger>
              <TabsTrigger value="workspace" className="text-[10px] md:text-xs">工作区日志 (Workspace)</TabsTrigger>
              <TabsTrigger value="system" className="text-[10px] md:text-xs">系统日志 (System)</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {/* Tools */}
        <div className="flex items-center gap-2">
          {/* Search */}
          <div className="relative hidden md:block">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <input
              type="text"
              placeholder="搜索日志内容..."
              className="h-8 w-48 rounded-md border bg-muted/50 pl-8 pr-3 text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
          </div>

          {/* Level Filter */}
          <Select value={minLevel} onValueChange={(val) => val && setMinLevel(val)}>
            <SelectTrigger className="h-8 w-[110px] text-xs">
              <Filter className="h-3 w-3 mr-2" />
              <SelectValue placeholder="日志级别" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="0" className="text-xs">所有级别</SelectItem>
              <SelectItem value="30" className="text-xs text-blue-500">INFO 及以上</SelectItem>
              <SelectItem value="40" className="text-xs text-amber-500">WARN 及以上</SelectItem>
              <SelectItem value="50" className="text-xs text-red-500">ERROR 及以上</SelectItem>
            </SelectContent>
          </Select>

          {/* Auto Refresh Toggle */}
          <Button
            variant={autoRefresh ? 'default' : 'outline'}
            size="sm"
            className="h-8 text-xs font-sans gap-1"
            onClick={() => setAutoRefresh(!autoRefresh)}
          >
            {autoRefresh ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3 ml-0.5" />}
            {autoRefresh ? '自动刷新' : '已暂停'}
          </Button>

          {/* Manual Refresh */}
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => fetchLogs()} disabled={loading}>
            <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
          </Button>
        </div>
      </header>

      {/* ── Mobile Search (if hidden on desktop) ── */}
      <div className="md:hidden p-2 border-b bg-muted/20">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            type="text"
            placeholder="搜索日志信息或负载内容..."
            className="h-8 w-full rounded-md border bg-background pl-8 pr-3 text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {/* ── Log List ── */}
      <main className="flex-1 min-h-0 overflow-y-auto bg-[#0d1117] text-[#c9d1d9] p-2 leading-relaxed text-[11px] md:text-xs">
        {filteredLogs.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground font-sans">
            <Terminal className="h-8 w-8 mb-2 opacity-20" />
            <p>未找到符合筛选条件的日志。</p>
          </div>
        ) : (
          <div className="space-y-0.5">
            {filteredLogs.map((log, i) => {
              const info = getLevelInfo(log.level);
              const extra = extractExtraPayload(log);
              return (
                <div key={i} className="flex items-start gap-2 hover:bg-white/5 p-1 rounded transition-colors group">
                  {/* Time */}
                  <div className="shrink-0 text-gray-500 w-20 md:w-24 overflow-hidden text-ellipsis">
                    {log.time ? new Date(log.time).toLocaleTimeString('en-US', { hour12: false, fractionalSecondDigits: 3 }) : '---'}
                  </div>

                  {/* Level Badge */}
                  <div className={cn('shrink-0 w-12 text-center font-bold text-[10px] rounded px-1', info.bg, info.text)}>
                    {info.label}
                  </div>

                  {/* Module Badge */}
                  {log.module && (
                    <div className="shrink-0 text-emerald-400 font-bold">
                      [{log.module}]
                    </div>
                  )}

                  {/* Message & Payload */}
                  <div className="flex-1 min-w-0 break-words">
                    <span className={cn('font-medium', log.level >= 50 ? 'text-red-400' : 'text-gray-200')}>
                      {log.msg}
                    </span>
                    
                    {/* JSON Payload */}
                    {extra && (
                      <div className="mt-1 text-gray-400 opacity-80 group-hover:opacity-100 transition-opacity">
                        {JSON.stringify(extra)}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
