import React from 'react';
import { cn } from '@/lib/utils';
import { Pin, PinOff, Check, MessageSquare, ChevronRight, Gamepad2, FolderOpen, Trash2, ListChecks, CheckSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { Conversation } from '@/lib/types';

interface ConversationListProps {
  conversations: Conversation[];
  pinnedConversations: Conversation[];
  groups: Record<string, Conversation[]>;
  sortedGroupNames: string[];
  isBatchMode: boolean;
  selectedConversations: Set<string>;
  activeId: string | null;
  collapsed: Record<string, boolean>;
  activeCascadeIds: Set<string>;
  onSelect: (id: string, title: string, workspace: string) => void;
  onClose: () => void;
  toggleBatchMode: () => void;
  toggleSelectConversation: (id: string, e: React.MouseEvent) => void;
  handleBatchDelete: () => void;
  togglePin: (e: React.MouseEvent, id: string) => void;
  setCollapsed: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  setSelectedConversations: React.Dispatch<React.SetStateAction<Set<string>>>;
}

export function ConversationList({
  conversations,
  pinnedConversations,
  groups,
  sortedGroupNames,
  isBatchMode,
  selectedConversations,
  activeId,
  collapsed,
  activeCascadeIds,
  onSelect,
  onClose,
  toggleBatchMode,
  toggleSelectConversation,
  handleBatchDelete,
  togglePin,
  setCollapsed,
  setSelectedConversations
}: ConversationListProps) {
  return (
    <div className="flex-1 overflow-hidden min-h-0 flex flex-col">
      {/* Batch Mode Header */}
      <div className="px-5 py-2 flex items-center justify-between shrink-0 mb-1">
        <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
          会话列表 {isBatchMode && `(已选 ${selectedConversations.size})`}
        </span>
        <Button variant="ghost" size="sm" className="h-6 px-2 text-[11px] hover:bg-muted/50 cursor-pointer" onClick={toggleBatchMode}>
          {isBatchMode ? <CheckSquare className="h-3 w-3 mr-1" /> : <ListChecks className="h-3 w-3 mr-1" />}
          {isBatchMode ? '完成' : '批量管理'}
        </Button>
      </div>
      
      {isBatchMode && (
        <div className="px-4 pb-3 shrink-0 flex items-center gap-2 animate-in slide-in-from-top-2 duration-200">
          <Button 
            variant="outline" 
            size="sm" 
            className="h-7 text-xs flex-1 border-muted-foreground/20 cursor-pointer" 
            onClick={() => {
              if (selectedConversations.size === conversations.length) setSelectedConversations(new Set());
              else setSelectedConversations(new Set(conversations.map(c => c.id)));
            }}
          >
            {selectedConversations.size === conversations.length ? '取消全选' : '全选'}
          </Button>
          <Button 
            variant="outline" 
            size="sm" 
            className={cn("h-7 text-xs flex-1 cursor-pointer", selectedConversations.size > 0 ? "text-destructive border-destructive/30 hover:bg-destructive/10" : "text-muted-foreground border-muted-foreground/20 opacity-50")} 
            onClick={handleBatchDelete} 
            disabled={selectedConversations.size === 0}
          >
            <Trash2 className="h-3 w-3 mr-1" /> 删除
          </Button>
        </div>
      )}

      <ScrollArea className="flex-1 h-full">
        <div className="px-4 pb-6 space-y-6">
          {pinnedConversations.length > 0 && (
            <div className="space-y-2 mb-6">
              <div className="flex items-center gap-2 text-[10px] font-bold text-muted-foreground uppercase tracking-wider px-1">
                <Pin className="w-3.5 h-3.5" />
                <span className="flex-1">已置顶</span>
                <Badge variant="outline" className="px-1.5 py-0 min-w-5 h-5 justify-center opacity-60 font-mono">{pinnedConversations.length}</Badge>
              </div>
              <div className="space-y-0.5">
                {pinnedConversations.map(c => (
                  <div
                    key={c.id}
                    ref={activeId === c.id ? (el) => { el?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); } : undefined}
                    className={cn(
                      "w-full flex items-center justify-start font-normal h-8 px-2 text-sm rounded-md transition-all group relative cursor-pointer",
                      isBatchMode && selectedConversations.has(c.id) ? "bg-indigo-500/10 text-indigo-500" :
                      activeId === c.id && !isBatchMode ? "bg-secondary text-foreground font-semibold" : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                    )}
                    onClick={(e) => { 
                      if (isBatchMode) toggleSelectConversation(c.id, e);
                      else { onSelect(c.id, c.title, c.workspace); onClose(); }
                    }}
                  >
                    {isBatchMode ? (
                      <div className={cn("mr-2 h-3.5 w-3.5 flex items-center justify-center shrink-0 border rounded-[3px] transition-colors", selectedConversations.has(c.id) ? "bg-indigo-500 border-indigo-500" : "border-muted-foreground/40")}>
                        {selectedConversations.has(c.id) && <Check className="w-2.5 h-2.5 text-white" />}
                      </div>
                    ) : (
                      <MessageSquare className={cn("mr-2 h-3.5 w-3.5 shrink-0", activeId === c.id ? "text-indigo-500" : "text-muted-foreground/40")} />
                    )}
                    <span className="truncate flex-1 text-left">{c.title || '未命名'}</span>
                    {activeCascadeIds.has(c.id) && (
                      <span className="absolute right-8 flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-500"></span>
                      </span>
                    )}
                    <div 
                      className="opacity-0 group-hover:opacity-100 transition-opacity ml-auto shrink-0 p-1 rounded-sm hover:bg-muted-foreground/20 text-muted-foreground hover:text-foreground z-10 cursor-pointer"
                      onClick={(e) => togglePin(e, c.id)}
                      title="取消置顶"
                    >
                      <PinOff className="w-3.5 h-3.5" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {sortedGroupNames.map(wsName => (
            <div key={wsName} className="space-y-2">
              <button
                className="w-full flex items-center gap-2 text-[10px] font-bold text-muted-foreground uppercase tracking-wider hover:text-foreground transition-colors group cursor-pointer"
                onClick={() => setCollapsed(p => ({ ...p, [wsName]: !p[wsName] }))}
              >
                <ChevronRight className={cn('w-3.5 h-3.5 transition-transform', !collapsed[wsName] && 'rotate-90')} />
                {wsName === 'Playground' ? <Gamepad2 className="w-3.5 h-3.5" /> : <FolderOpen className="w-3.5 h-3.5" />}
                <span className="flex-1 text-left truncate">{wsName}</span>
                <Badge variant="outline" className="px-1.5 py-0 min-w-5 h-5 justify-center opacity-60 font-mono">{groups[wsName].length}</Badge>
              </button>

              {!collapsed[wsName] && (
                <div className="pl-3 space-y-0.5">
                  {groups[wsName].map(c => (
                    <div
                      key={c.id}
                      ref={activeId === c.id ? (el) => { el?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); } : undefined}
                      className={cn(
                        "w-full flex items-center justify-start font-normal h-8 px-2 text-sm rounded-md transition-all group relative cursor-pointer",
                        isBatchMode && selectedConversations.has(c.id) ? "bg-indigo-500/10 text-indigo-500" :
                        activeId === c.id && !isBatchMode ? "bg-secondary text-foreground font-semibold" : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                      )}
                      onClick={(e) => { 
                        if (isBatchMode) toggleSelectConversation(c.id, e);
                        else { onSelect(c.id, c.title, c.workspace); onClose(); }
                      }}
                    >
                      {isBatchMode ? (
                        <div className={cn("mr-2 h-3.5 w-3.5 flex items-center justify-center shrink-0 border rounded-[3px] transition-colors", selectedConversations.has(c.id) ? "bg-indigo-500 border-indigo-500" : "border-muted-foreground/40")}>
                          {selectedConversations.has(c.id) && <Check className="w-2.5 h-2.5 text-white" />}
                        </div>
                      ) : (
                        <MessageSquare className={cn("mr-2 h-3.5 w-3.5 shrink-0", activeId === c.id ? "text-indigo-500" : "text-muted-foreground/40")} />
                      )}
                      <span className="truncate flex-1 text-left">{c.title || '未命名'}</span>
                      {activeCascadeIds.has(c.id) && (
                        <span className="absolute right-8 flex h-2 w-2">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-500"></span>
                        </span>
                      )}
                      <div 
                        className="opacity-0 group-hover:opacity-100 transition-opacity ml-auto shrink-0 p-1 rounded-sm hover:bg-muted-foreground/20 text-muted-foreground hover:text-foreground z-10 cursor-pointer"
                        onClick={(e) => togglePin(e, c.id)}
                      >
                        <Pin className="w-3.5 h-3.5" />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
