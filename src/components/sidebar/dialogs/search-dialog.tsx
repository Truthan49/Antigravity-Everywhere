import React from 'react';
import { cn } from '@/lib/utils';
import { Search, Loader2, MessageSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { Conversation } from '@/lib/types';

interface SearchDialogProps {
  searchOpen: boolean;
  setSearchOpen: (open: boolean) => void;
  isSearching: boolean;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  searchResults: Conversation[];
  fullTextResults: { id: string; snippets: string[] }[];
  conversations: Conversation[];
  activeCascadeIds: Set<string>;
  onSelect: (id: string, title: string, workspace: string) => void;
  onClose: () => void;
  getWorkspaceName: (uri: string) => string;
}

export function SearchDialog({
  searchOpen,
  setSearchOpen,
  isSearching,
  searchQuery,
  setSearchQuery,
  searchResults,
  fullTextResults,
  conversations,
  activeCascadeIds,
  onSelect,
  onClose,
  getWorkspaceName
}: SearchDialogProps) {
  return (
    <Dialog open={searchOpen} onOpenChange={setSearchOpen}>
      <DialogContent className="sm:max-w-[550px] p-0 gap-0 border-zinc-800 bg-background overflow-hidden" style={{ top: '20vh', transform: 'translate(-50%, 0)' }}>
        <DialogTitle className="sr-only">全局搜索</DialogTitle>
        <div className="flex items-center px-4 py-3 border-b">
          {isSearching ? <Loader2 className="h-5 w-5 text-indigo-500 mr-3 shrink-0 animate-spin" /> : <Search className="h-5 w-5 text-muted-foreground mr-3 shrink-0" />}
          <input 
            autoFocus
            className="flex-1 bg-transparent border-none outline-none text-sm placeholder:text-muted-foreground"
            placeholder="搜索会话... (支持标题、工作空间名称、步骤内容全文检索)"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <kbd className="hidden sm:inline-flex items-center gap-1 bg-muted px-1.5 py-0.5 rounded text-[10px] font-mono text-muted-foreground font-medium">ESC</kbd>
        </div>
        
        <ScrollArea className="max-h-[60vh] overflow-y-auto">
          <div className="p-2">
            {searchQuery.trim() === '' ? (
              <div className="text-center py-10 text-sm text-muted-foreground">
                输入关键词搜索历史会话
              </div>
            ) : searchResults.length === 0 && fullTextResults.length === 0 && !isSearching ? (
              <div className="text-center py-10 text-sm text-muted-foreground">
                未找到相关会话
              </div>
            ) : (
              <div className="space-y-1">
                {searchResults.length > 0 && searchResults.map(c => {
                  const wsName = getWorkspaceName(c.workspace || '');
                  return (
                    <Button
                      key={c.id}
                      variant="ghost"
                      className="w-full justify-start h-auto py-3 px-3 relative block group"
                      onClick={() => {
                        onSelect(c.id, c.title, c.workspace);
                        setSearchOpen(false);
                        onClose();
                      }}
                    >
                      <div className="flex items-start gap-3 w-full min-w-0">
                        <MessageSquare className="h-5 w-5 text-indigo-500 shrink-0 mt-0.5" />
                        <div className="flex flex-col items-start min-w-0 flex-1">
                          <span className="text-sm font-semibold truncate w-full text-left">{c.title || '未命名'}</span>
                          <div className="flex items-center gap-2 mt-1 w-full">
                            <span className="text-[10px] text-muted-foreground bg-muted/50 px-1.5 py-0.5 rounded truncate max-w-[150px]">
                              {wsName}
                            </span>
                            {activeCascadeIds.has(c.id) && (
                              <span className="flex items-center gap-1 text-[10px] text-indigo-500 font-medium">
                                <Loader2 className="w-3 h-3 animate-spin" /> 执行中
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="shrink-0 text-[10px] text-muted-foreground/60 transition-opacity whitespace-nowrap pt-1">
                          {new Date(c.mtime).toLocaleDateString()}
                        </div>
                      </div>
                    </Button>
                  );
                })}

                {fullTextResults.length > 0 && (
                  <div className="pt-2 mt-2 border-t border-muted/30">
                    <div className="px-3 py-2 text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-2">内容全文检索</div>
                    {fullTextResults.filter(r => !searchResults.some(s => s.id === r.id)).map(res => {
                      const c = conversations.find(conv => conv.id === res.id);
                      if (!c) return null;
                      const wsName = getWorkspaceName(c.workspace || '');
                      return (
                        <Button
                          key={`ft-${c.id}`}
                          variant="ghost"
                          className="w-full justify-start h-auto py-3 px-3 relative block group mt-1"
                          onClick={() => {
                            onSelect(c.id, c.title, c.workspace);
                            setSearchOpen(false);
                            onClose();
                          }}
                        >
                          <div className="flex items-start gap-3 w-full min-w-0">
                            <MessageSquare className="h-5 w-5 text-indigo-500/60 shrink-0 mt-0.5" />
                            <div className="flex flex-col items-start min-w-0 flex-1">
                              <span className="text-sm font-semibold truncate w-full text-left opacity-90">{c.title || '未命名'}</span>
                              <div className="flex items-center gap-2 mt-1 w-full opacity-80">
                                <span className="text-[10px] text-muted-foreground bg-muted/50 px-1.5 py-0.5 rounded truncate max-w-[150px]">
                                  {wsName}
                                </span>
                              </div>
                              <div className="mt-2 w-full text-[11px] leading-relaxed text-muted-foreground bg-muted/30 px-2 py-1.5 rounded border border-muted/50 text-left font-mono">
                                {res.snippets.map((snip, i) => <div key={i} className="truncate w-full text-emerald-500/80 mb-0.5 last:mb-0">.. {snip} ..</div>)}
                              </div>
                            </div>
                          </div>
                        </Button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
