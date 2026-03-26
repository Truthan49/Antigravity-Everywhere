'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { cn } from '@/lib/utils';
import { CloudDownload, X, Search, Loader2, Download, Star } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import type { Skill } from '@/lib/types';

interface StorePanelProps {
  open: boolean;
  onClose: () => void;
  skills: Skill[];
  loadLocalSkills: () => void;
}

interface CloudSkillItem {
  name: string;
  slug: string;
  description?: string;
  description_zh?: string;
  category?: string;
  version?: string;
  downloads?: number;
  stars?: number;
  ownerName?: string;
}

const CATEGORIES = [
  { key: 'All', label: '探索全部', icon: '🌐' },
  { key: 'ai-intelligence', label: 'AI 智能', icon: '🧠' },
  { key: 'developer-tools', label: '开发工具', icon: '💻' },
  { key: 'productivity', label: '效率提升', icon: '⚡' },
  { key: 'data-analysis', label: '数据分析', icon: '📊' },
  { key: 'content-creation', label: '内容创作', icon: '✍️' },
  { key: 'security-compliance', label: '安全合规', icon: '🛡️' },
  { key: 'communication', label: '通讯协作', icon: '💬' },
];

const PAGE_SIZE = 24;

export default function StorePanel({ open, onClose, skills, loadLocalSkills }: StorePanelProps) {
  const [items, setItems] = useState<CloudSkillItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [installingSlug, setInstallingSlug] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('All');
  const searchTimerRef = useRef<NodeJS.Timeout | null>(null);

  const fetchSkills = useCallback(async (p: number, cat: string, kw: string, append: boolean) => {
    if (append) setLoadingMore(true); else setLoading(true);
    try {
      const params = new URLSearchParams({
        action: 'store',
        page: String(p),
        pageSize: String(PAGE_SIZE),
        sortBy: 'score',
        order: 'desc',
      });
      if (cat && cat !== 'All') params.set('category', cat);
      if (kw) params.set('keyword', kw);

      const res = await fetch(`/api/skills?${params}`);
      const data = await res.json();
      const fetched: CloudSkillItem[] = data?.skills || [];
      const fetchedTotal: number = data?.total || 0;

      if (append) {
        setItems(prev => [...prev, ...fetched]);
      } else {
        setItems(fetched);
      }
      setTotal(fetchedTotal);
    } catch { /* silent */ }
    if (append) setLoadingMore(false); else setLoading(false);
  }, []);

  // Initial load & reload on category change
  useEffect(() => {
    if (!open) return;
    setPage(1);
    fetchSkills(1, category, search, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, category]);

  // Debounced search
  useEffect(() => {
    if (!open) return;
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      setPage(1);
      fetchSkills(1, category, search, false);
    }, 400);
    return () => { if (searchTimerRef.current) clearTimeout(searchTimerRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const loadMore = () => {
    const nextPage = page + 1;
    setPage(nextPage);
    fetchSkills(nextPage, category, search, true);
  };

  const handleInstall = async (slug: string) => {
    if (installingSlug) return;
    setInstallingSlug(slug);
    try {
      const res = await fetch('/api/skills', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'installCloud', slug })
      });
      if (!res.ok) {
        const err = await res.json();
        alert('下载失败: ' + err.error);
      } else {
        alert('🎉 安装成功！系统已将其注册为全局技能。');
        loadLocalSkills();
      }
    } catch {
      alert('安装发生异常，请检查网络');
    }
    setInstallingSlug(null);
  };

  if (!open) return null;

  const hasMore = items.length < total;

  return (
    <div className="fixed inset-0 z-[60] bg-background flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 px-6 h-14 border-b shrink-0 bg-card">
        <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 hover:bg-muted" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
        <CloudDownload className="h-5 w-5 text-indigo-500 shrink-0" />
        <div className="flex flex-col min-w-0">
          <h2 className="text-sm font-bold leading-tight">云端技能商店</h2>
          <span className="text-[10px] text-muted-foreground hidden md:block">收录 ClawHub 生态共 {total > 0 ? (total / 10000).toFixed(1) + ' 万' : '...'} 个 Skills</span>
        </div>
        <div className="flex-1" />
        <div className="relative w-full max-w-xs">
          <Search className="absolute left-3 top-2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="搜索名称或关键词..."
            className="h-8 pl-9 text-sm bg-muted/50 w-full"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Category Pills */}
      <div className="border-b bg-muted/30 overflow-x-auto scrollbar-hide shrink-0">
        <div className="flex items-center gap-2 px-6 py-2.5 min-w-fit">
          {CATEGORIES.map(c => (
            <button
              key={c.key}
              onClick={() => setCategory(c.key)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all border whitespace-nowrap cursor-pointer",
                category === c.key
                  ? "bg-indigo-500/10 border-indigo-300 text-indigo-600 shadow-sm"
                  : "bg-background border-border/50 hover:border-border hover:bg-muted text-muted-foreground"
              )}
            >
              <span>{c.icon}</span>
              <span>{c.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Content Grid */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="p-6 md:p-8">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-32 text-muted-foreground">
              <Loader2 className="h-8 w-8 animate-spin mb-4 text-indigo-500" />
              <span className="text-sm">正在同步云端榜单...</span>
            </div>
          ) : items.length === 0 ? (
            <div className="text-center py-32 text-muted-foreground">没有找到匹配的技能。</div>
          ) : (
            <>
              <div className="text-xs text-muted-foreground mb-4 pl-1">
                共找到 <strong className="text-foreground">{total.toLocaleString()}</strong> 个技能，当前展示 <strong className="text-foreground">{items.length}</strong> 个
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 max-w-screen-2xl mx-auto">
                {items.map((s, idx) => {
                  const isInstalled = skills.some(local => local.name === s.slug && local.scope === 'global');
                  return (
                    <div key={`${s.slug}-${idx}`} className="flex flex-col group border bg-card rounded-xl p-4 shadow-sm hover:shadow-md hover:border-indigo-500/50 transition-all h-[180px]">
                      <div className="flex items-start justify-between gap-3 mb-1">
                        <div className="flex flex-col min-w-0 flex-1">
                          <div className="flex items-center gap-2 mb-0.5">
                            <h3 className="text-sm font-bold truncate text-foreground leading-tight" title={s.name}>{s.name}</h3>
                            <Badge variant="secondary" className="text-[10px] h-4 px-1.5 shrink-0 bg-muted">v{s.version}</Badge>
                          </div>
                          <div className="text-[10px] text-muted-foreground truncate font-mono">@{s.ownerName || s.slug}</div>
                        </div>
                      </div>

                      <p className="text-xs text-muted-foreground line-clamp-3 leading-relaxed flex-1 mt-1 mb-2">
                        {s.description_zh || s.description}
                      </p>

                      <div className="flex items-center justify-between mt-auto pt-2.5 border-t border-border/50">
                        <div className="flex items-center gap-4 text-muted-foreground">
                          <div className="flex items-center gap-1 text-xs font-medium" title="下载量">
                            <Download className="w-3 h-3" /> {s.downloads ? (s.downloads > 9999 ? (s.downloads / 10000).toFixed(1) + '万' : s.downloads.toLocaleString()) : '0'}
                          </div>
                          <div className="flex items-center gap-1 text-xs font-medium text-amber-500" title="评分">
                            <Star className="w-3 h-3" /> {s.stars?.toLocaleString() || '0'}
                          </div>
                        </div>
                        {isInstalled ? (
                          <Badge variant="outline" className="text-[11px] h-6 px-2 border-emerald-500/50 text-emerald-500 bg-emerald-500/10">已安装</Badge>
                        ) : (
                          <Button
                            size="sm"
                            disabled={installingSlug === s.slug}
                            onClick={() => handleInstall(s.slug)}
                            className="h-6 text-[11px] px-2.5 bg-indigo-500 hover:bg-indigo-600 text-white transition-colors disabled:opacity-50 min-w-[60px]"
                          >
                            {installingSlug === s.slug ? <Loader2 className="w-3 h-3 animate-spin" /> : '一键安装'}
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Load More */}
              {hasMore && (
                <div className="flex justify-center mt-8">
                  <Button
                    variant="outline"
                    onClick={loadMore}
                    disabled={loadingMore}
                    className="h-9 px-8 text-sm font-medium"
                  >
                    {loadingMore ? (
                      <><Loader2 className="w-4 h-4 animate-spin mr-2" />加载中...</>
                    ) : (
                      `加载更多 (${items.length} / ${total.toLocaleString()})`
                    )}
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
