import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Loader2, Activity, Database, MessageSquare, Zap, Target } from 'lucide-react';

interface AnalyticsData {
  totalEstimatedTokens: number;
  newConvsLast7Days: number;
  activeConvsLast30Days: number;
  newStepsLast30Days: number;
  feishuUsers: number;
  workspacesCount: number;
  skillsCount: number;
  activityHeatmap: { date: string; activity: number }[];
  quotaFraction: number;
  currentModelTag: string;
}

export function AnalyticsDialog({ open, onOpenChange }: { open: boolean, onOpenChange: (open: boolean) => void }) {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setError('');
    fetch('/api/analytics/local')
      .then(res => res.json())
      .then(res => {
        if (res.success) setData(res.data);
        else setError(res.error || 'Failed to load analytics.');
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [open]);

  const maxActivity = data ? Math.max(...data.activityHeatmap.map(d => d.activity), 1) : 1;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[700px] border-zinc-800 bg-background/95 backdrop-blur-md p-6 overflow-hidden">
        <DialogHeader className="mb-4">
          <DialogTitle className="flex items-center gap-2 text-xl font-bold tracking-tight">
            <Activity className="h-6 w-6 text-indigo-500" />
            Agent 活跃度看板
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground mb-4" />
            <span className="text-sm text-muted-foreground">正在聚合本地状态数据库...</span>
          </div>
        ) : error ? (
          <div className="py-20 text-center text-destructive text-sm">{error}</div>
        ) : data ? (
          <div className="space-y-6">
            
            {/* Top Metrics Row */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="p-4 rounded-xl bg-muted/30 border flex flex-col gap-1">
                <div className="text-muted-foreground text-[11px] font-bold tracking-wider flex items-center gap-1.5"><Database className="h-3.5 w-3.5 text-blue-500" /> 虚拟 Token 消耗记录 (30日)</div>
                <div className="text-2xl font-bold font-mono tracking-tighter">{(data.totalEstimatedTokens / 1000).toFixed(1)}k</div>
                <div className="text-[10px] text-muted-foreground/80 leading-relaxed mt-1.5">系统基于各端通信数据体积，反向估算出的近30天大模型 Token 整体消耗规模。</div>
              </div>
              <div className="p-4 rounded-xl bg-muted/30 border flex flex-col gap-1">
                <div className="text-muted-foreground text-[11px] font-bold tracking-wider flex items-center gap-1.5"><MessageSquare className="h-3.5 w-3.5 text-emerald-500" /> 新增自然会话 (7日)</div>
                <div className="text-2xl font-bold font-mono tracking-tighter">{data.newConvsLast7Days}</div>
                <div className="text-[10px] text-muted-foreground/80 leading-relaxed mt-1.5">近7天内系统响应的新建任务会话数量。近30天内有交互沉淀的总活跃会话为 {data.activeConvsLast30Days} 个。</div>
              </div>
              <div className="p-4 rounded-xl bg-muted/30 border flex flex-col gap-1">
                <div className="text-muted-foreground text-[11px] font-bold tracking-wider flex items-center gap-1.5"><Zap className="h-3.5 w-3.5 text-amber-500" /> 总交互轮次 (30日)</div>
                <div className="text-2xl font-bold font-mono tracking-tighter">{data.newStepsLast30Days}</div>
                <div className="text-[10px] text-muted-foreground/80 leading-relaxed mt-1.5">涵盖独立桌面端应用与飞书机器人端，最近30天内触发的所有对话交互总和。</div>
              </div>
              <div className="p-4 rounded-xl bg-muted/30 border flex flex-col gap-1">
                <div className="text-muted-foreground text-[11px] font-bold tracking-wider flex items-center gap-1.5"><Target className="h-3.5 w-3.5 text-rose-500" /> 扩展技能栈状况</div>
                <div className="text-2xl font-bold font-mono tracking-tighter">{data.skillsCount || 0}</div>
                <div className="text-[10px] text-muted-foreground/80 leading-relaxed mt-1.5">全局可供调用的高级代理技能 (Skills) 总计。当前处于监控状态的工作区：{data.workspacesCount} 个。</div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Quota Radar */}
              <div className="p-5 rounded-xl bg-muted/20 border">
                <h3 className="text-xs font-bold text-foreground mb-1">模型 API 请求水位限制监控</h3>
                <p className="text-[10px] text-muted-foreground/80 mb-4 leading-relaxed">实时监测当前主力模型提供商账户的请求并发配额与可用性限制。</p>
                <div className="space-y-4">
                  <div className="flex justify-between items-end mb-1">
                    <span className="text-sm font-medium">{data.currentModelTag}</span>
                    <span className="text-xl font-bold font-mono">{(data.quotaFraction * 100).toFixed(1)}%</span>
                  </div>
                  <div className="h-4 w-full bg-muted rounded-full overflow-hidden border">
                    <div 
                      className="h-full rounded-full transition-all duration-1000 ease-out"
                      style={{ 
                        width: `${Math.min(data.quotaFraction * 100, 100)}%`,
                        background: `linear-gradient(90deg, #3b82f6 ${data.quotaFraction > 0.8 ? '0%' : '100%'}, #ef4444 100%)`
                      }}
                    />
                  </div>
                  <p className="text-[10px] text-muted-foreground text-right">{data.quotaFraction > 0.8 ? '警告：已触及模型速率限制水位' : '资源充裕'}</p>
                </div>
              </div>

              {/* Weekly Heatmap Activity */}
              <div className="p-5 rounded-xl bg-muted/20 border">
                <h3 className="text-xs font-bold text-foreground mb-1">工作及交互活动热力图 (7日)</h3>
                <p className="text-[10px] text-muted-foreground/80 mb-4 leading-relaxed">过去7天内系统协助处理的各项自动化及自然语言指令活动密度的可视化追踪。</p>
                <div className="flex items-end justify-between h-[80px] gap-2">
                  {data.activityHeatmap.map((day, i) => {
                    // Use a square root scale so small activities aren't squished to invisibility by an outlier max
                    const heightPercent = maxActivity > 0 ? Math.pow(day.activity / maxActivity, 0.4) * 100 : 0;
                    return (
                      <div key={i} className="flex flex-col items-center flex-1 h-full justify-end gap-1 group">
                        <div className="relative w-full flex justify-center flex-1 items-end pb-1">
                          <div 
                            className={`w-full max-w-[24px] rounded-t-sm transition-all duration-700 ease-out group-hover:opacity-80 ${day.activity > 0 ? 'bg-indigo-500 shadow-[0_0_8px_rgba(99,102,241,0.5)]' : 'bg-muted/50'}`}
                            style={{ 
                              height: `${day.activity > 0 ? Math.max(heightPercent, 6) : 2}%`
                            }}
                          >
                            <span className="absolute -top-6 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 bg-foreground text-background text-[10px] px-1.5 py-0.5 rounded transition-opacity whitespace-nowrap z-10">
                              {day.activity} 次响应
                            </span>
                          </div>
                        </div>
                        <span className="text-[9px] text-muted-foreground uppercase font-mono">{day.date}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
