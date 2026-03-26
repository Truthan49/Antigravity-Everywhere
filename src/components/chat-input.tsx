'use client';

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { SendHorizontal, Square, ChevronDown, Puzzle, Zap, Rocket, FileText, Loader2, X, BookOpen, UploadCloud } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { ModelConfig, Skill, Workflow } from '@/lib/types';

interface ChatInputProps {
  activeId?: string;
  onSend: (text: string, attachments?: any) => void;
  onCancel?: () => void;
  disabled?: boolean;
  isRunning?: boolean;
  connected?: boolean;
  models?: ModelConfig[];
  currentModel?: string;
  onModelChange?: (model: string) => void;
  skills?: Skill[];
  workflows?: Workflow[];
  agenticMode?: boolean;
  onAgenticModeChange?: (mode: boolean) => void;
}

interface AutocompleteItem {
  type: 'skill' | 'workflow' | 'file' | 'knowledge';
  name: string;
  description: string;
  prefix: string; // what gets inserted
  content?: string; // used for knowledge items
}

interface PastedImage {
  id: string;
  dataUrl: string;
  mimeType: string;
}

export default function ChatInput({ activeId, onSend, onCancel, disabled, isRunning, connected, models, currentModel, onModelChange, skills, workflows, agenticMode = true, onAgenticModeChange }: ChatInputProps) {
  const [text, setText] = useState('');
  const [showMenu, setShowMenu] = useState(false);
  const [menuItems, setMenuItems] = useState<AutocompleteItem[]>([]);
  const [fileItems, setFileItems] = useState<AutocompleteItem[]>([]);
  const [mountedItems, setMountedItems] = useState<AutocompleteItem[]>([]);
  const [isLoadingFiles, setIsLoadingFiles] = useState(false);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [triggerChar, setTriggerChar] = useState<'/' | '@' | null>(null);
  const [query, setQuery] = useState('');
  const [pastedImages, setPastedImages] = useState<PastedImage[]>([]);
  const [showKnowledgeDialog, setShowKnowledgeDialog] = useState(false);
  const [knowledgeItems, setKnowledgeItems] = useState<any[]>([]);
  const [isLoadingKnowledge, setIsLoadingKnowledge] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const fileSearchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        const file = items[i].getAsFile();
        if (!file) continue;
        const reader = new FileReader();
        reader.onload = (event) => {
          setPastedImages(prev => [...prev, {
            id: Math.random().toString(),
            dataUrl: event.target?.result as string,
            mimeType: file.type,
          }]);
        };
        reader.readAsDataURL(file);
      }
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.currentTarget === e.target) {
      setIsDragging(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    
    if (disabled) return;
    
    const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
    
    files.forEach(file => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const result = event.target?.result;
        if (typeof result === 'string') {
          setPastedImages(prev => [
            ...prev,
            { id: Math.random().toString(36).substring(7), dataUrl: result, mimeType: file.type }
          ]);
        }
      };
      reader.readAsDataURL(file);
    });
  }, [disabled]);
  
  useEffect(() => {
    if (ref.current) {
      ref.current.style.height = 'auto';
      ref.current.style.height = Math.min(ref.current.scrollHeight, 200) + 'px';
    }
  }, [text]);

  useEffect(() => {
    if (showKnowledgeDialog) {
      setIsLoadingKnowledge(true);
      api.knowledge().then(items => {
        setKnowledgeItems(items);
        setIsLoadingKnowledge(false);
      }).catch(() => setIsLoadingKnowledge(false));
    }
  }, [showKnowledgeDialog]);

  const insertKnowledge = useCallback((item: any) => {
    const tag: AutocompleteItem = {
      type: 'knowledge',
      name: item.title,
      description: item.summary,
      prefix: `@[Knowledge:${item.id}] `,
      content: item.summary
    };
    setMountedItems(prev => {
      if (!prev.find(p => p.prefix === tag.prefix)) return [...prev, tag];
      return prev;
    });
    setShowKnowledgeDialog(false);
  }, []);

  // Build autocomplete items
  const allItems = useMemo(() => {
    const items: AutocompleteItem[] = [];
    (workflows || []).forEach(w => {
      items.push({ type: 'workflow', name: w.name, description: w.description || '', prefix: `/${w.name} ` });
    });
    (skills || []).forEach(s => {
      items.push({ type: 'skill', name: s.name, description: s.description || '', prefix: `@${s.name} ` });
    });
    return items;
  }, [skills, workflows]);

  // Compute combined items for @ menu (skills + files)
  const combinedAtItems = useMemo(() => {
    return [...menuItems, ...fileItems];
  }, [menuItems, fileItems]);

  // Handle text changes — detect / and @ triggers
  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setText(val);

    const cursorPos = e.target.selectionStart || 0;
    const textBeforeCursor = val.slice(0, cursorPos);

    const slashMatch = textBeforeCursor.match(/(^|\s)\/([\w-]*)$/);
    const atMatch = textBeforeCursor.match(/(^|\s)@([\w\/\.-]*)$/);

    if (slashMatch) {
      const q = slashMatch[2].toLowerCase();
      setTriggerChar('/');
      setQuery(q);
      setFileItems([]);
      setIsLoadingFiles(false);
      const filtered = allItems
        .filter(i => i.type === 'workflow' && i.name.toLowerCase().includes(q))
        .slice(0, 8);
      setMenuItems(filtered);
      setShowMenu(filtered.length > 0);
      setSelectedIdx(0);
    } else if (atMatch) {
      const q = atMatch[2].toLowerCase();
      setTriggerChar('@');
      setQuery(q);
      
      // Immediately show matching skills
      const skillMatches = allItems
        .filter(i => i.type === 'skill' && i.name.toLowerCase().includes(q))
        .slice(0, 5);
      setMenuItems(skillMatches);
      setShowMenu(true);
      setSelectedIdx(0);

      // Debounced file search (300ms)
      if (fileSearchTimerRef.current) clearTimeout(fileSearchTimerRef.current);
      if (abortControllerRef.current) abortControllerRef.current.abort();

      if (activeId) {
        setIsLoadingFiles(true);
        fileSearchTimerRef.current = setTimeout(async () => {
          const controller = new AbortController();
          abortControllerRef.current = controller;
          try {
            const fileRes = await api.conversationFiles(activeId, q);
            if (controller.signal.aborted) return;
            if (fileRes.files && fileRes.files.length > 0) {
              setFileItems(fileRes.files.map((f: any) => ({
                type: 'file' as const,
                name: f.name,
                description: f.relativePath,
                prefix: `@[${f.relativePath}] `
              })));
            } else {
              setFileItems([]);
            }
          } catch {
            if (!controller.signal.aborted) setFileItems([]);
          } finally {
            if (!controller.signal.aborted) setIsLoadingFiles(false);
          }
        }, 300);
      } else {
        setFileItems([]);
        setIsLoadingFiles(false);
      }

    } else {
      setShowMenu(false);
      setTriggerChar(null);
      setFileItems([]);
      setIsLoadingFiles(false);
      if (fileSearchTimerRef.current) clearTimeout(fileSearchTimerRef.current);
      if (abortControllerRef.current) abortControllerRef.current.abort();
    }
  };

  // Insert selected autocomplete item
  const insertItem = useCallback((item: AutocompleteItem) => {
    const textarea = ref.current;
    if (!textarea) return;

    const cursorPos = textarea.selectionStart || 0;
    const textBeforeCursor = text.slice(0, cursorPos);
    const textAfterCursor = text.slice(cursorPos);

    // Find the trigger position (/ or @)
    const triggerRegex = triggerChar === '/'
      ? /(^|\s)\/([\w-]*)$/
      : /(^|\s)@([\w\/\.-]*)$/;
    const match = textBeforeCursor.match(triggerRegex);

    if (match) {
      if (item.type === 'skill' || item.type === 'file') {
        setMountedItems(prev => {
          if (!prev.find(p => p.prefix === item.prefix)) return [...prev, item];
          return prev;
        });
        const triggerStart = match.index! + (match[1] ? match[1].length : 0);
        const newText = text.slice(0, triggerStart) + textAfterCursor;
        setText(newText);
        setShowMenu(false);
        setTriggerChar(null);
        setTimeout(() => {
          textarea.selectionStart = triggerStart;
          textarea.selectionEnd = triggerStart;
          textarea.focus();
        }, 0);
        return;
      }

      const triggerStart = match.index! + match[1].length;
      const newText = text.slice(0, triggerStart) + item.prefix + textAfterCursor;
      setText(newText);
      setShowMenu(false);
      setTriggerChar(null);

      // Set cursor after inserted text
      setTimeout(() => {
        const newPos = triggerStart + item.prefix.length;
        textarea.selectionStart = newPos;
        textarea.selectionEnd = newPos;
        textarea.focus();
      }, 0);
    }
  }, [text, triggerChar]);

  const send = useCallback(() => {
    const trimmed = text.trim();
    if ((!trimmed && pastedImages.length === 0 && mountedItems.length === 0) || disabled) return;
    
    const attachments: any = {};
    if (pastedImages.length > 0) {
      attachments.media = pastedImages.map(img => ({
        mimeType: img.mimeType,
        inlineData: img.dataUrl.split(',')[1],
      }));
    }
    
    // Build knowledge text
    const kbItems = mountedItems.filter(m => m.type === 'knowledge');
    let knowledgeText = '';
    if (kbItems.length > 0) {
       knowledgeText = '\n\n【附加背景知识】\n' + kbItems.map(k => `<knowledge title="${k.name}">\n${k.content}\n</knowledge>`).join('\n\n');
    }
    
    // Prepend mounted items' prefixes to the text sent to the backend
    const prefixTags = mountedItems.filter(m => m.type !== 'knowledge').map(m => m.prefix).join('');
    const finalMessage = prefixTags ? `${prefixTags}\n\n${trimmed}${knowledgeText}`.trim() : `${trimmed}${knowledgeText}`;

    onSend(finalMessage, attachments);
    setText('');
    setShowMenu(false);
    setPastedImages([]);
    setMountedItems([]);
  }, [text, disabled, onSend, pastedImages, mountedItems]);

  // For @ menus, navigable items = skills + files; for / menus, just menuItems
  const navigableItems = triggerChar === '@' ? combinedAtItems : menuItems;

  const handleKey = (e: React.KeyboardEvent) => {
    if (showMenu && navigableItems.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIdx(i => (i + 1) % navigableItems.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIdx(i => (i - 1 + navigableItems.length) % navigableItems.length);
        return;
      }
      if (e.key === 'Tab' || e.key === 'Enter') {
        e.preventDefault();
        insertItem(navigableItems[selectedIdx]);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setShowMenu(false);
        return;
      }
    }
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  };

  // Derive display label for the current model
  const currentLabel = currentModel === 'MODEL_AUTO' 
    ? '✨ Auto - 智能选型' 
    : models?.find(m => m.modelOrAlias?.model === currentModel)?.label || currentModel || 'Model';

  return (
    <div 
      className={cn(
        "bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 p-4 border-t relative transition-colors",
        isDragging && !disabled ? "bg-primary/5" : ""
      )}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Drag & Drop Visual Overlay */}
      {isDragging && !disabled && (
        <div className="absolute inset-x-4 inset-y-2 z-50 rounded-xl border-2 border-dashed border-primary/50 bg-background/80 backdrop-blur-sm flex items-center justify-center pointer-events-none">
          <div className="flex flex-col items-center text-primary/80 animate-in zoom-in-95 duration-200">
            <UploadCloud className="w-10 h-10 mb-3 opacity-80 animate-bounce" />
            <span className="text-sm font-bold tracking-widest uppercase">发布文件到对话区</span>
          </div>
        </div>
      )}

      <div className="max-w-4xl mx-auto flex flex-col gap-2 relative">
        {/* Autocomplete Menu */}
        {showMenu && (navigableItems.length > 0 || isLoadingFiles) && (
          <div
            ref={menuRef}
            className="absolute bottom-full mb-1 left-0 right-0 z-50 bg-popover border rounded-lg shadow-lg overflow-hidden max-h-[300px] overflow-y-auto"
          >
            {triggerChar === '@' ? (
              /* ── Grouped @ Menu: Skills + Files ── */
              <>
                {/* Skills Section */}
                {menuItems.length > 0 && (
                  <>
                    <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground bg-muted/30 border-b">
                      Skills
                    </div>
                    {menuItems.map((item, idx) => (
                      <button
                        key={`skill-${item.name}`}
                        className={cn(
                          "w-full flex items-start gap-3 px-3 py-2 text-left transition-colors",
                          idx === selectedIdx ? "bg-accent" : "hover:bg-muted/50"
                        )}
                        onMouseDown={(e) => { e.preventDefault(); insertItem(item); }}
                        onMouseEnter={() => setSelectedIdx(idx)}
                      >
                        <Puzzle className="w-4 h-4 mt-0.5 text-indigo-500 shrink-0" />
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium truncate">@{item.name}</div>
                          {item.description && (
                            <div className="text-xs text-muted-foreground line-clamp-1 mt-0.5">{item.description}</div>
                          )}
                        </div>
                      </button>
                    ))}
                  </>
                )}

                {/* Files Section */}
                <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground bg-muted/30 border-y">
                  Files
                </div>
                {fileItems.length > 0 ? (
                  fileItems.map((item, rawIdx) => {
                    const globalIdx = menuItems.length + rawIdx;
                    return (
                      <button
                        key={`file-${item.description}`}
                        className={cn(
                          "w-full flex items-start gap-3 px-3 py-2 text-left transition-colors",
                          globalIdx === selectedIdx ? "bg-accent" : "hover:bg-muted/50"
                        )}
                        onMouseDown={(e) => { e.preventDefault(); insertItem(item); }}
                        onMouseEnter={() => setSelectedIdx(globalIdx)}
                      >
                        <FileText className="w-4 h-4 mt-0.5 text-blue-500 shrink-0" />
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium truncate">{item.name}</div>
                          <div className="text-xs text-muted-foreground line-clamp-1 mt-0.5">{item.description}</div>
                        </div>
                      </button>
                    );
                  })
                ) : isLoadingFiles ? (
                  <div className="flex items-center gap-2 px-3 py-2.5 text-xs text-muted-foreground">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    正在搜索文件...
                  </div>
                ) : (
                  <div className="px-3 py-2 text-xs text-muted-foreground">
                    {query ? '没有匹配的文件' : '输入以搜索文件'}
                  </div>
                )}
              </>
            ) : (
              /* ── Standard / Menu (Workflows) ── */
              navigableItems.map((item, idx) => (
                <button
                  key={`${item.type}-${item.name}`}
                  className={cn(
                    "w-full flex items-start gap-3 px-3 py-2.5 text-left transition-colors",
                    idx === selectedIdx ? "bg-accent" : "hover:bg-muted/50"
                  )}
                  onMouseDown={(e) => { e.preventDefault(); insertItem(item); }}
                  onMouseEnter={() => setSelectedIdx(idx)}
                >
                  <Zap className="w-4 h-4 mt-0.5 text-amber-500 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium truncate">/{item.name}</div>
                    {item.description && (
                      <div className="text-xs text-muted-foreground line-clamp-1 mt-0.5">{item.description}</div>
                    )}
                  </div>
                </button>
              ))
            )}
          </div>
        )}

        {/* Pasted Images Preview */}
        {pastedImages.length > 0 && (
          <div className="flex flex-wrap gap-2 px-1 mb-2">
            {pastedImages.map(img => (
              <div key={img.id} className="relative group rounded-md border bg-muted/50 overflow-hidden w-16 h-16 flex items-center justify-center">
                <img src={img.dataUrl} alt="Pasted" className="max-w-full max-h-full object-contain" />
                <button
                  type="button"
                  className="absolute inset-x-0 bottom-0 bg-black/60 text-white text-[10px] py-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={() => setPastedImages(prev => prev.filter(p => p.id !== img.id))}
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Mounted Contexts Preview */}
        {mountedItems.length > 0 && (
          <div className="flex flex-wrap gap-2 px-1 mb-2">
            {mountedItems.map(item => (
              <div key={item.prefix} className="flex items-center gap-1.5 bg-indigo-500/10 text-indigo-500 border border-indigo-500/20 text-xs px-2 py-1 rounded-md">
                {item.type === 'skill' ? <Puzzle className="w-3 h-3" /> : item.type === 'knowledge' ? <BookOpen className="w-3 h-3" /> : <FileText className="w-3 h-3" />}
                <span className="max-w-[150px] truncate">{item.name}</span>
                <button 
                  onClick={() => setMountedItems(prev => prev.filter(p => p.prefix !== item.prefix))}
                  className="hover:bg-indigo-500/20 rounded p-0.5 ml-1 transition-colors"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="relative flex items-end gap-2 bg-muted/50 rounded-lg border focus-within:ring-1 focus-within:ring-ring p-1 pl-3 transition-shadow">
          <Textarea
            ref={ref}
            value={text}
            onChange={handleChange}
            onKeyDown={handleKey}
            onPaste={handlePaste}
            onBlur={() => setTimeout(() => setShowMenu(false), 150)}
            placeholder="输入一条消息... (输入 / 调用工作流，输入 @ 引用技能与文件)"
            className="min-h-[44px] max-h-[200px] w-full resize-none border-0 shadow-none focus-visible:ring-0 px-0 py-3 bg-transparent"
            disabled={disabled}
            rows={1}
          />
          <div className="p-1 mb-0.5 sticky bottom-1">
            {isRunning ? (
              <Button
                variant="destructive"
                size="icon"
                className="h-9 w-9"
                onClick={onCancel}
              >
                <Square className="h-4 w-4" />
              </Button>
            ) : (
              <Button
                size="icon"
                className="h-9 w-9"
                onClick={send}
                disabled={disabled || !text.trim()}
              >
                <SendHorizontal className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
        
        <div className="flex items-center gap-2 px-1">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-medium uppercase tracking-wider">
            <span className={cn(
              'w-2 h-2 rounded-full',
              connected ? 'bg-emerald-500' : 'bg-destructive'
            )} />
            {connected ? '已连接' : '未连接'}
          </div>

          {/* Planning / Fast mode toggle */}
          {onAgenticModeChange && (
            <button
              className={cn(
                'inline-flex items-center gap-1 h-7 px-2.5 text-xs font-semibold rounded-md transition-all cursor-pointer border',
                agenticMode
                  ? 'bg-indigo-500/10 text-indigo-500 border-indigo-500/20 hover:bg-indigo-500/20'
                  : 'bg-purple-500/10 text-purple-500 border-purple-500/20 hover:bg-purple-500/20'
              )}
              onClick={() => onAgenticModeChange(!agenticMode)}
              title={agenticMode ? '规划模式：Agent 会在执行前进行规划和询问。点击切换为快速模式。' : '快速模式：Agent 会直接执行操作。点击切换为规划模式。'}
            >
              {agenticMode ? (
                <><Rocket className="w-3 h-3" /> 规划模式</>
              ) : (
                <><Zap className="w-3 h-3" /> 快速模式</>
              )}
            </button>
          )}

          {/* Model selector — inline in the input area */}
          {models && models.length > 0 && onModelChange && (
            <DropdownMenu>
              <DropdownMenuTrigger
                className="inline-flex items-center gap-1 h-7 px-2 text-xs text-muted-foreground hover:text-foreground font-medium rounded-md hover:bg-accent transition-colors cursor-pointer"
              >
                <span className="truncate max-w-[160px]">{currentLabel}</span>
                <ChevronDown className="h-3 w-3 shrink-0 opacity-50" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-64">
                <DropdownMenuItem
                  onClick={() => onModelChange('MODEL_AUTO')}
                  className={cn('flex justify-between gap-2 text-emerald-600 dark:text-emerald-400 font-semibold', currentModel === 'MODEL_AUTO' && 'bg-accent')}
                >
                  <span className="truncate">✨ Auto - 智能选型</span>
                </DropdownMenuItem>
                
                {models.map(m => {
                  const val = m.modelOrAlias?.model || '';
                  const pct = m.quotaInfo?.remainingFraction != null
                    ? `${Math.round(m.quotaInfo.remainingFraction * 100)}%`
                    : '';
                  const isSelected = val === currentModel;
                  return (
                    <DropdownMenuItem
                      key={val}
                      onClick={() => onModelChange(val)}
                      className={cn('flex justify-between gap-2', isSelected && 'bg-accent')}
                    >
                      <span className="truncate">{m.label}</span>
                      {pct && (
                        <span className={cn(
                          'text-[10px] font-mono shrink-0',
                          parseFloat(pct) > 50 ? 'text-emerald-500' : parseFloat(pct) > 20 ? 'text-amber-500' : 'text-destructive'
                        )}>
                          {pct}
                        </span>
                      )}
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          <div className="ml-auto flex items-center gap-2">
            {/* Knowledge base insertion */}
            <button
                className="inline-flex items-center gap-1 h-7 px-2 text-xs text-muted-foreground hover:text-foreground font-semibold rounded-md transition-colors border bg-blue-500/5 hover:bg-blue-500/10 border-blue-500/20"
                onClick={() => setShowKnowledgeDialog(true)}
                title="插入知识库上下文"
              >
                <BookOpen className="w-3.5 h-3.5 text-blue-500" /> 知识库...
            </button>
            
            {isRunning && (
              <div className="flex items-center gap-2 text-xs text-amber-500 font-medium bg-amber-500/10 px-2 py-1 rounded-md">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
                </span>
                运行中
              </div>
            )}
          </div>
        </div>
      </div>

      <Dialog open={showKnowledgeDialog} onOpenChange={setShowKnowledgeDialog}>
        <DialogContent className="sm:max-w-[600px] bg-background">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-blue-500" />
              选择知识库卡片以挂载
            </DialogTitle>
            <DialogDescription>选中的知识节点将作为背景上下文附带在当前 Prompt 中，指导 Agent 的行为逻辑。</DialogDescription>
          </DialogHeader>
          <div className="py-2">
            {isLoadingKnowledge ? (
              <div className="flex items-center justify-center p-8 text-muted-foreground"><Loader2 className="w-6 h-6 animate-spin" /></div>
            ) : knowledgeItems.length === 0 ? (
              <div className="text-center p-8 text-muted-foreground text-sm">暂无知识库内容。试着在聊天中保存片段！</div>
            ) : (
              <ScrollArea className="h-[300px]">
                <div className="grid gap-3 pr-4">
                  {knowledgeItems.map(item => (
                    <button
                      key={item.id}
                      onClick={() => insertKnowledge(item)}
                      className="flex flex-col text-left p-3 rounded-lg border bg-card hover:bg-accent hover:border-blue-500/50 transition-all cursor-pointer"
                    >
                      <span className="font-semibold text-sm text-foreground">{item.title}</span>
                      {item.summary && <span className="text-xs text-muted-foreground mt-1 line-clamp-2">{item.summary}</span>}
                    </button>
                  ))}
                </div>
              </ScrollArea>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
