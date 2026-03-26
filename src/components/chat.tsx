import { useMemo, useRef, useEffect, useState, useCallback } from 'react';
import type { Step, StepsData } from '@/lib/types';
import { marked } from 'marked';
import { markedHighlight } from 'marked-highlight';
import hljs from 'highlight.js';
import 'highlight.js/styles/github-dark.css';
import { cn } from '@/lib/utils';
import {
  Eye, Search, Terminal, Globe, FolderOpen, AlertTriangle,
  FileCode, FilePen, Sparkles, ChevronDown, ExternalLink,
  CheckCircle2, XCircle, Clock, Wrench, Rocket, MessageCircle, RotateCcw,
  Trash2, Keyboard, MonitorPlay, FileSearch, Loader2, Ban, BookPlus, Save, Edit2
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Card, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { api } from '@/lib/api';

interface ChatProps {
  steps: StepsData | null;
  loading: boolean;
  currentModel: string;
  onProceed?: (uri: string) => void;
  onRevert?: (stepIndex: number) => void;
  onResubmit?: (stepIndex: number, newText: string) => void;
  onCancel?: () => void;
  totalSteps?: number;
}

const TOOL_TYPES = new Set([
  'CORTEX_STEP_TYPE_CODE_ACTION',
  'CORTEX_STEP_TYPE_VIEW_FILE',
  'CORTEX_STEP_TYPE_GREP_SEARCH',
  'CORTEX_STEP_TYPE_RUN_COMMAND',
  'CORTEX_STEP_TYPE_SEARCH_WEB',
  'CORTEX_STEP_TYPE_LIST_DIRECTORY',
  'CORTEX_STEP_TYPE_FIND',
  'CORTEX_STEP_TYPE_COMMAND_STATUS',
  'CORTEX_STEP_TYPE_SEND_COMMAND_INPUT',
  'CORTEX_STEP_TYPE_BROWSER_SUBAGENT',
]);

const VISIBLE = new Set([
  'CORTEX_STEP_TYPE_USER_INPUT',
  'CORTEX_STEP_TYPE_PLANNER_RESPONSE',
  'CORTEX_STEP_TYPE_TASK_BOUNDARY',
  'CORTEX_STEP_TYPE_NOTIFY_USER',
  'CORTEX_STEP_TYPE_ERROR_MESSAGE',
  ...TOOL_TYPES,
]);

// Step status helpers
const isGenerating = (s?: string) => s === 'CORTEX_STEP_STATUS_GENERATING';
const isPending = (s?: string) => s === 'CORTEX_STEP_STATUS_PENDING';
const isRunning = (s?: string) => s === 'CORTEX_STEP_STATUS_RUNNING';
const isCanceled = (s?: string) => s === 'CORTEX_STEP_STATUS_CANCELED';
const isError = (s?: string) => s === 'CORTEX_STEP_STATUS_ERROR';

const modeStyles: Record<string, { label: string; bg: string; border: string; iconColor: string }> = {
  planning: { label: 'PLANNING', bg: 'bg-amber-500/10 text-amber-500', border: 'border-amber-500/30', iconColor: 'text-amber-500' },
  execution: { label: 'EXECUTION', bg: 'bg-indigo-500/10 text-indigo-500', border: 'border-indigo-500/30', iconColor: 'text-indigo-500' },
  verification: { label: 'VERIFICATION', bg: 'bg-emerald-500/10 text-emerald-500', border: 'border-emerald-500/30', iconColor: 'text-emerald-500' },
};

marked.use(
  markedHighlight({
    langPrefix: 'hljs language-',
    highlight(code, lang) {
      if (lang && hljs.getLanguage(lang)) {
        return hljs.highlight(code, { language: lang }).value;
      }
      return hljs.highlightAuto(code).value;
    }
  })
);

function escapeHtml(unsafe: string) {
  return unsafe.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

function renderMarkdown(text: string): string {
  try { 
    // Format diff blocks for our React listener
    let processedText = text.replace(/\[diff_block_start\]([\s\S]*?)\[diff_block_end\]/g, (match, diff) => {
      // Encode diff to base64 so we don't break HTML attributes
      const encoded = typeof btoa !== 'undefined' ? btoa(encodeURIComponent(diff)) : '';
      return `\n\n<div class="diff-mount-point my-4"><button class="diff-review-btn inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-medium transition-colors h-9 rounded-md px-4 bg-indigo-500/10 text-indigo-500 hover:bg-indigo-500/20 border border-indigo-500/20" data-diff="${encoded}"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 3h5v5"/><path d="M8 3H3v5"/><path d="M12 22v-8"/><path d="m8 8 4-4 4 4"/><path d="m3 21 9-9"/><path d="m21 21-9-9"/></svg>Review Code Changes</button></div>\n\n`;
    });
    return marked.parse(processedText, { async: false }) as string; 
  }
  catch { return text; }
}

function getToolLabel(step: Step): { icon: React.ReactNode; text: string; statusIcon?: React.ReactNode } {
  const t = step.type || '';
  const status = step.status || '';

  // Status indicator
  let statusIcon: React.ReactNode = null;
  if (isPending(status)) statusIcon = <Clock className="w-3 h-3 text-muted-foreground animate-pulse" />;
  else if (isRunning(status) || isGenerating(status)) statusIcon = <Loader2 className="w-3 h-3 text-indigo-400 animate-spin" />;
  else if (isCanceled(status)) statusIcon = <Ban className="w-3 h-3 text-orange-400" />;
  else if (isError(status)) statusIcon = <XCircle className="w-3 h-3 text-destructive" />;

  if (t === 'CORTEX_STEP_TYPE_CODE_ACTION') {
    const ca = step.codeAction || {};
    const spec = ca.actionSpec || {};
    const isNew = !!spec.createFile;
    const isDel = !!spec.deleteFile;
    const file = (spec.createFile?.absoluteUri || spec.editFile?.absoluteUri || spec.deleteFile?.absoluteUri || '').split('/').pop() || '';
    return {
      icon: isDel ? <Trash2 className="w-3.5 h-3.5 text-red-500" /> : isNew ? <Sparkles className="w-3.5 h-3.5 text-emerald-500" /> : <FilePen className="w-3.5 h-3.5 text-indigo-500" />,
      text: `${isDel ? '删除' : isNew ? '创建' : '编辑'} ${file}`,
      statusIcon,
    };
  }
  if (t === 'CORTEX_STEP_TYPE_VIEW_FILE') {
    return { icon: <Eye className="w-3.5 h-3.5 text-zinc-400" />, text: `查看 ${(step.viewFile?.absoluteUri || '').split('/').pop() || 'file'}`, statusIcon };
  }
  if (t === 'CORTEX_STEP_TYPE_GREP_SEARCH') {
    const gs = step.grepSearch || {};
    return { icon: <Search className="w-3.5 h-3.5 text-zinc-400" />, text: `搜索 "${gs.query || gs.searchPattern || '...'}"`, statusIcon };
  }
  if (t === 'CORTEX_STEP_TYPE_RUN_COMMAND') {
    const cmd = step.runCommand?.command || step.runCommand?.commandLine || '';
    const safe = step.runCommand?.safeToAutoRun;
    return { icon: <Terminal className="w-3.5 h-3.5 text-emerald-500" />, text: `${safe ? '⚡ ' : ''}${cmd.slice(0, 60)}`, statusIcon };
  }
  if (t === 'CORTEX_STEP_TYPE_SEARCH_WEB') {
    return { icon: <Globe className="w-3.5 h-3.5 text-sky-500" />, text: `网页搜索: ${step.searchWeb?.query || '...'}`, statusIcon };
  }
  if (t === 'CORTEX_STEP_TYPE_LIST_DIRECTORY') {
    return { icon: <FolderOpen className="w-3.5 h-3.5 text-amber-500/70" />, text: `目录 ${(step.listDirectory?.path || '').split('/').pop() || '...'}`, statusIcon };
  }
  if (t === 'CORTEX_STEP_TYPE_FIND') {
    const f = step.find || {};
    return { icon: <FileSearch className="w-3.5 h-3.5 text-cyan-500" />, text: `查找 ${f.pattern || '...'} 于 ${(f.searchDirectory || '').split('/').pop() || '...'}`, statusIcon };
  }
  if (t === 'CORTEX_STEP_TYPE_COMMAND_STATUS') {
    return { icon: <Terminal className="w-3.5 h-3.5 text-zinc-400" />, text: `提取命令输出`, statusIcon };
  }
  if (t === 'CORTEX_STEP_TYPE_SEND_COMMAND_INPUT') {
    return { icon: <Keyboard className="w-3.5 h-3.5 text-amber-400" />, text: `发送交互指令`, statusIcon };
  }
  if (t === 'CORTEX_STEP_TYPE_BROWSER_SUBAGENT') {
    const bs = step.browserSubagent || {};
    return { icon: <MonitorPlay className="w-3.5 h-3.5 text-purple-500" />, text: `浏览器: ${bs.taskName || bs.task?.slice(0, 40) || '...'}`, statusIcon };
  }
  return { icon: <Wrench className="w-3.5 h-3.5" />, text: '操作', statusIcon };
}

function ToolGroup({ steps }: { steps: Step[] }) {
  const [expanded, setExpanded] = useState(false);

  if (steps.length === 1) {
    const { icon, text, statusIcon } = getToolLabel(steps[0]);
    return (
      <div className={cn('flex items-center gap-3 px-3 py-1.5 mb-1 max-w-2xl bg-muted/20 rounded-md border text-[11px] text-muted-foreground ml-[52px]', isCanceled(steps[0].status) && 'opacity-40 line-through')}>
        <div className="shrink-0">{icon}</div>
        <span className="truncate font-mono flex-1">{text}</span>
        {statusIcon}
      </div>
    );
  }

  return (
    <div className="mb-2 max-w-2xl ml-[52px]">
      <Button
        variant="ghost"
        className="w-full justify-start gap-3 h-8 px-3 text-muted-foreground hover:text-foreground bg-muted/10 border border-transparent hover:border-border transition-all"
        onClick={() => setExpanded(!expanded)}
      >
        <Wrench className="w-3.5 h-3.5" />
        <span className="font-semibold text-[11px] uppercase tracking-wider">{steps.length} 个连续操作</span>
        <ChevronDown className={cn('w-3.5 h-3.5 transition-transform ml-auto', expanded && 'rotate-180')} />
      </Button>
      {expanded && (
        <div className="mt-1 space-y-1">
          {steps.map((s, i) => {
            const { icon, text, statusIcon } = getToolLabel(s);
            return (
              <div key={i} className={cn('flex items-center gap-3 px-3 py-1.5 text-[11px] text-muted-foreground bg-background/50 rounded-md border border-dashed hover:border-solid transition-all', isCanceled(s.status) && 'opacity-40 line-through')}>
                <div className="shrink-0">{icon}</div>
                <span className="truncate font-mono flex-1">{text}</span>
                {statusIcon}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

type RenderItem = { type: 'step'; step: Step; originalIndex: number } | { type: 'tools'; steps: Step[] };

function groupSteps(taggedSteps: { step: Step; originalIndex: number }[]): RenderItem[] {
  const items: RenderItem[] = [];
  let toolBuf: Step[] = [];

  function flushTools() {
    if (toolBuf.length > 0) {
      items.push({ type: 'tools', steps: [...toolBuf] });
      toolBuf = [];
    }
  }

  for (const t of taggedSteps) {
    if (TOOL_TYPES.has(t.step.type || '')) {
      toolBuf.push(t.step);
    } else {
      flushTools();
      items.push({ type: 'step', step: t.step, originalIndex: t.originalIndex });
    }
  }
  flushTools();
  return items;
}

function StepBubble({ step, originalIndex, totalSteps, allSteps, isFastMode, onProceed, onRevert, onSaveKnowledge, onResubmit, onCancel, cascadeStatus }: { step: Step; originalIndex: number; totalSteps: number; allSteps: Step[]; isFastMode?: boolean; onProceed?: (uri: string) => void; onRevert?: (stepIndex: number) => void; onSaveKnowledge?: (text: string) => void; onResubmit?: (stepIndex: number, text: string) => void; onCancel?: () => void; cascadeStatus?: string }) {
  const type = step.type || '';
  const contentRef = useRef<HTMLDivElement>(null);
  const [showThoughts, setShowThoughts] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState('');

  useEffect(() => {
    if (!contentRef.current) return;
    const blocks = contentRef.current.querySelectorAll('pre');
    blocks.forEach(pre => {
      if (pre.querySelector('.copy-btn')) return;

      const computedStyle = window.getComputedStyle(pre);
      if (computedStyle.position === 'static') {
        pre.style.position = 'relative';
      }

      const btn = document.createElement('button');
      btn.className = 'copy-btn absolute top-2 right-2 p-1.5 bg-zinc-800 text-zinc-300 hover:text-white rounded shadow text-xs flex items-center gap-1.5 opacity-0 transition-opacity hover:bg-zinc-700 cursor-pointer font-sans';
      
      pre.addEventListener('mouseenter', () => btn.classList.remove('opacity-0'));
      pre.addEventListener('mouseleave', () => btn.classList.add('opacity-0'));

      const copyIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>`;
      const checkIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>`;

      btn.innerHTML = copyIcon + " <span>Copy</span>";

      btn.onclick = () => {
        const codeText = pre.querySelector('code')?.innerText || '';
        navigator.clipboard.writeText(codeText);
        btn.innerHTML = checkIcon + " <span>Copied</span>";
        btn.classList.add('text-emerald-400');
        setTimeout(() => {
          btn.innerHTML = copyIcon + " <span>Copy</span>";
          btn.classList.remove('text-emerald-400');
        }, 2000);
      };

      pre.appendChild(btn);
    });

    // Extract diffs and bind click listeners
    const diffBtns = contentRef.current.querySelectorAll('.diff-review-btn');
    diffBtns.forEach(btn => {
      (btn as HTMLElement).onclick = (e) => {
         const diffB64 = (btn as HTMLElement).dataset.diff || '';
         const diff = decodeURIComponent(atob(diffB64));
         window.dispatchEvent(new CustomEvent('open-diff-modal', { detail: { diff } }));
      };
    });
  }, [step]);

  if (type === 'CORTEX_STEP_TYPE_USER_INPUT') {
    const items = step.userInput?.items || [];
    const media = step.userInput?.media || [];
    const plainText = items.filter(i => i.text).map(i => i.text).join('').trim();
    const files = items.filter(i => i.item?.file).map(i => Object.values(i.item!.file!.workspaceUrisToRelativePaths || {})[0] || i.item!.file!.absoluteUri?.split('/').pop());

    if (!plainText && files.length === 0 && media.length === 0) return null;
    return (
      <div className={cn('flex justify-end mb-6 max-w-4xl mx-auto w-full px-4 sm:px-6 group', isFastMode ? 'mt-4' : 'mt-8')}>
        <div className="flex gap-4 max-w-[85%] sm:max-w-[70%] items-start justify-end">
          <div className="flex flex-col gap-1 items-end opacity-0 group-hover:opacity-100 transition-opacity mt-1 shrink-0">
            {onResubmit && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground"
                onClick={() => { setIsEditing(true); setEditText(plainText); }}
                title="编辑并重新发送"
              >
                <Edit2 className="h-3.5 w-3.5" />
              </Button>
            )}
            {onRevert && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground"
                onClick={() => onRevert(originalIndex)}
                title="Revert to this message"
              >
                <RotateCcw className="h-3.5 w-3.5" />
              </Button>
            )}
            {onSaveKnowledge && plainText && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground"
                onClick={() => onSaveKnowledge(plainText)}
                title="保存到知识库"
              >
                <BookPlus className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
          <div className={cn("bg-primary text-primary-foreground rounded-2xl rounded-tr-sm px-5 py-3.5 text-sm leading-relaxed shadow-sm flex flex-col gap-3", isEditing && "min-w-[300px]")}>
            {isEditing ? (
              <div className="flex flex-col gap-2">
                <textarea 
                  className="w-full bg-primary-foreground/10 text-primary-foreground border border-primary-foreground/20 rounded p-2 focus:outline-none focus:ring-1 focus:ring-primary-foreground/50 resize-y min-h-[100px]" 
                  value={editText} 
                  onChange={e => setEditText(e.target.value)} 
                  autoFocus
                />
                <div className="flex justify-end gap-2 mt-1">
                  <Button variant="ghost" size="sm" className="h-7 px-2 text-primary-foreground/70 hover:text-primary-foreground hover:bg-primary-foreground/10" onClick={() => setIsEditing(false)}>取消</Button>
                  <Button variant="secondary" size="sm" className="h-7 px-3 bg-primary-foreground text-primary hover:bg-primary-foreground/90 font-medium" onClick={() => { setIsEditing(false); onResubmit?.(originalIndex, editText); }}>
                    保存并发送
                  </Button>
                </div>
              </div>
            ) : (
              <>
                {media.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {media.map((m, idx) => {
                      // Determine best image source
                      // gRPC returns: inlineData (often empty string), uri (bare filesystem path), thumbnail (base64 jpeg)
                      const rawB64 = typeof m.inlineData === 'string' ? m.inlineData : (m.inlineData as any)?.data || '';
                      const mime = m.mimeType || 'image/png';
                      
                      let src = '';
                      if (rawB64.length > 0) {
                        // Has actual base64 data
                        src = `data:${mime};base64,${rawB64}`;
                      } else if (m.uri) {
                        // Proxy local file paths through /api/file
                        if (m.uri.startsWith('file://')) {
                          src = `/api/file?path=${encodeURIComponent(m.uri.replace('file://', ''))}`;
                        } else if (m.uri.startsWith('/')) {
                          src = `/api/file?path=${encodeURIComponent(m.uri)}`;
                        } else {
                          src = m.uri;
                        }
                      } else if (m.thumbnail) {
                        src = `data:image/jpeg;base64,${m.thumbnail}`;
                      }
                      
                      if (!src) return null;
                      const thumbFallback = m.thumbnail ? `data:image/jpeg;base64,${m.thumbnail}` : '';
                      
                      return (
                        <img
                          key={idx}
                          src={src}
                          alt="Attached Graphic"
                          className="max-w-[200px] max-h-[200px] object-cover rounded-md border border-primary-foreground/20"
                          onError={(e) => {
                            const el = e.target as HTMLImageElement;
                            if (thumbFallback && el.src !== thumbFallback) el.src = thumbFallback;
                          }}
                        />
                      );
                    })}
                  </div>
                )}
                {plainText && <div className="whitespace-pre-wrap">{plainText}</div>}
                {files.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-1">
                    {files.map((file, idx) => (
                      <div key={idx} className="flex items-center gap-1.5 bg-background/20 text-primary-foreground text-xs px-2 py-1 rounded border border-primary-foreground/20">
                        <FileCode className="w-3 h-3" />
                        <span className="truncate max-w-[150px]">{file}</span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
          <Avatar className="h-8 w-8 shrink-0 border bg-background mt-1 hidden sm:flex">
            <AvatarFallback className="bg-zinc-800 text-white text-[10px] font-bold">USER</AvatarFallback>
          </Avatar>
        </div>
      </div>
    );
  }

  if (type === 'CORTEX_STEP_TYPE_PLANNER_RESPONSE') {
    const pr = step.plannerResponse || {};
    const rawText = pr.modifiedResponse || pr.response || '';
    const streaming = isGenerating(step.status);
    
    // Parse thoughts
    const thoughts: string[] = [];
    const thoughtRegex = /<thought>([\s\S]*?)(?:<\/thought>|$)/g;
    let match;
    while ((match = thoughtRegex.exec(rawText)) !== null) {
      if (match[1].trim()) thoughts.push(match[1].trim());
    }
    const text = rawText.replace(/<thought>[\s\S]*?(?:<\/thought>|$)/g, '').trim();

    // Show streaming text even if short; only hide empty DONE responses if no thoughts
    if (!streaming && (!text || text.length < 3) && thoughts.length === 0) return null;
    
    // Auto-expand thoughts while streaming if it's the only thing we have
    const isThinkingOnly = streaming && !text && thoughts.length > 0;

    return (
      <div className={cn('flex max-w-4xl mx-auto w-full px-4 sm:px-6 group', isFastMode ? 'mt-4 mb-2' : 'mt-8 mb-4')}>
        <div className="flex gap-4 max-w-full items-start w-full">
          <Avatar className="h-8 w-8 shrink-0 border bg-background mt-1">
            <AvatarFallback className={cn(
              'text-white text-[10px] font-bold',
              isFastMode ? 'bg-gradient-to-br from-purple-600 to-indigo-600' : 'bg-indigo-600'
            )}>
              {isFastMode ? '⚡' : 'AI'}
            </AvatarFallback>
          </Avatar>
          <div className={cn(
            'flex-1 rounded-2xl rounded-tl-sm px-6 py-5 text-[15px] leading-relaxed overflow-x-auto min-w-0',
            isFastMode ? 'bg-card/50 shadow-none' : 'bg-card border shadow-xs'
          )} ref={contentRef}>
            
            {/* Chain of Thought Terminal UI */}
            {thoughts.length > 0 && (
              <div className={cn("mb-3", text ? "border-b border-border/50 pb-3" : "")}>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="h-7 px-2 text-xs text-muted-foreground bg-muted/20 hover:bg-muted/40 border mb-2 font-mono flex items-center gap-2"
                  onClick={() => setShowThoughts(!showThoughts)}
                >
                  <Terminal className="w-3.5 h-3.5 text-emerald-500" />
                  {showThoughts || isThinkingOnly ? '隐藏思考链' : `展开思考过程 (${thoughts.length} 步)`}
                  <ChevronDown className={cn("w-3.5 h-3.5 transition-transform", (showThoughts || isThinkingOnly) && "rotate-180")} />
                </Button>
                {(showThoughts || isThinkingOnly) && (
                  <div className="p-3.5 bg-black/95 dark:bg-black/50 text-emerald-400/90 font-mono text-[11px] md:text-xs rounded-xl border border-emerald-900/30 overflow-x-auto shadow-inner flex flex-col gap-3">
                    {thoughts.map((t, i) => (
                      <div key={i} className="whitespace-pre-wrap leading-relaxed">
                        <span className="text-emerald-700 select-none mr-2 font-bold">❯</span>
                        <span>{t}</span>
                      </div>
                    ))}
                    {streaming && (
                      <div className="animate-pulse flex items-center h-4">
                        <span className="text-emerald-700 select-none mr-2 font-bold">❯</span>
                        <span className="inline-block w-1.5 h-3 bg-emerald-400 align-middle" />
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            <div className="chat-markdown">
              {text ? (
                <div dangerouslySetInnerHTML={{ __html: renderMarkdown(text) }} />
              ) : streaming && thoughts.length === 0 ? (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span className="text-sm">初始化节点...</span>
                </div>
              ) : null}
              {streaming && text && (
                <span className="inline-block w-0.5 h-5 bg-indigo-500 animate-pulse ml-0.5 align-text-bottom" />
              )}
            </div>
          </div>
          {!streaming && (onRevert || onSaveKnowledge) && (
            <div className="flex flex-col gap-1 items-start opacity-0 group-hover:opacity-100 transition-opacity mt-1 shrink-0">
              {onRevert && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground"
                  onClick={() => onRevert(originalIndex)}
                  title="撤回到此消息 (Revert)"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                </Button>
              )}
              {onSaveKnowledge && text && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground"
                  onClick={() => onSaveKnowledge(text)}
                  title="保存到知识库"
                >
                  <BookPlus className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  if (type === 'CORTEX_STEP_TYPE_TASK_BOUNDARY') {
    const tb = step.taskBoundary || {};
    const mode = (tb.mode || '').replace('AGENT_MODE_', '').toLowerCase();
    const ms = modeStyles[mode] || modeStyles.execution;
    return (
      <div className="max-w-4xl mx-auto w-full px-4 sm:px-6 my-10 pl-[52px]">
        <div className={cn('border-l-2 pl-6 py-1', ms.border)}>
          <div className="flex items-center gap-3">
            <span className={cn('text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-widest', ms.bg)}>
              {ms.label}
            </span>
            <span className="font-bold text-sm tracking-tight">{tb.taskName || '任务更新'}</span>
          </div>
          {tb.taskStatus && <div className="text-[13px] text-muted-foreground mt-2 font-medium">{tb.taskStatus}</div>}
          {tb.taskSummary && (
            <div className="text-[12px] text-muted-foreground/80 mt-3 leading-relaxed max-w-2xl bg-muted/10 p-4 rounded-lg border border-dashed">
              {tb.taskSummary}
            </div>
          )}
        </div>
      </div>
    );
  }

  if (type === 'CORTEX_STEP_TYPE_NOTIFY_USER') {
    const nu = step.notifyUser || {};
    const content = nu.notificationContent || '';
    // Use rich fields from gRPC, with fallbacks to legacy fields
    const blocked = nu.blockedOnUser ?? nu.isBlocking ?? false;
    const reviewPaths = nu.pathsToReview || nu.reviewAbsoluteUris || [];
    const autoProc = nu.shouldAutoProceed ?? false;
    const isLastStep = originalIndex === allSteps.length - 1;
    const isEffectivelyBlocked = blocked && isLastStep && cascadeStatus !== 'running';
    return (
      <div className="flex mt-8 mb-6 max-w-4xl mx-auto w-full px-4 sm:px-6">
        <div className="flex gap-4 max-w-full items-start w-full">
          <Avatar className="h-8 w-8 shrink-0 border bg-background mt-1">
            <AvatarFallback className="bg-indigo-600 text-white text-[10px] font-bold">AI</AvatarFallback>
          </Avatar>
          <div className="flex-1 bg-card border rounded-2xl rounded-tl-sm px-6 py-5 shadow-xs">
            {content && (
              <div className="chat-markdown text-[15px] leading-relaxed mb-4" dangerouslySetInnerHTML={{ __html: renderMarkdown(content) }} />
            )}
            {reviewPaths.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4">
                {reviewPaths.map(uri => {
                  const name = uri.replace('file://', '').split('/').pop();
                  return (
                    <Card 
                      key={uri} 
                      className="bg-muted/30 hover:bg-muted/50 transition-colors shadow-none border-dashed cursor-pointer" 
                      onClick={async () => {
                        try {
                          await fetch('/api/rules', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ action: 'open', filepath: uri.replace('file://', '') })
                          });
                        } catch {}
                      }}
                    >
                      <div className="flex items-center justify-between p-3">
                        <div className="flex items-center gap-3 min-w-0 pr-2">
                          <FileCode className="h-4 w-4 text-indigo-500 shrink-0" />
                          <span className="text-xs font-semibold truncate">{name}</span>
                        </div>
                        <ExternalLink className="h-3 w-3 text-muted-foreground shrink-0" />
                      </div>
                    </Card>
                  );
                })}
              </div>
            )}

            {/* Blocking approval section */}
            {isEffectivelyBlocked && (
              <div className="mt-8 p-5 rounded-xl border-l-4 border-l-amber-500 border bg-amber-500/[0.03] space-y-4">
                <div className="flex items-center gap-3 text-amber-600 dark:text-amber-500">
                  <Clock className="w-4 h-4 animate-pulse" />
                  <span className="text-sm font-bold uppercase tracking-wider">
                    {autoProc ? '配置允许自动通过中...' : '需要您的操作审批'}
                  </span>
                </div>
                {!autoProc && (
                  <div className="flex gap-3">
                    <Button onClick={() => onProceed?.(reviewPaths[0] || '')} className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-bold h-10 shadow-lg shadow-indigo-500/10">
                      <CheckCircle2 className="w-4 h-4 mr-2" /> 同意并继续
                    </Button>
                    <Button variant="outline" onClick={() => onCancel?.()} className="flex-1 border-zinc-500/20 hover:bg-zinc-500/5 font-bold h-10">
                      <XCircle className="w-4 h-4 mr-2" /> 拒绝执行
                    </Button>
                  </div>
                )}
              </div>
            )}

            {/* Auto-proceed indicator (when already proceeded) */}
            {autoProc && !isEffectivelyBlocked && (
              <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
                <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                <span>已被规则自动放行 (Auto-proceeded)</span>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (type === 'CORTEX_STEP_TYPE_ERROR_MESSAGE') {
    const em = step.errorMessage || {};
    return (
      <div className="max-w-4xl mx-auto w-full px-4 sm:px-6 my-6 pl-[52px]">
        <div className="inline-flex items-center gap-3 text-sm font-medium text-destructive bg-destructive/5 border border-destructive/20 rounded-full px-5 py-2.5">
          <AlertTriangle className="w-4 h-4" />
          <span className="truncate">{em.message || em.errorMessage || '执行中发生错误'}</span>
        </div>
      </div>
    );
  }

  return null;
}

export default function Chat({ steps, loading, currentModel, onProceed, onRevert, onResubmit, onCancel, totalSteps: totalStepsProp }: ChatProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const renderItems = useMemo(() => {
    if (!steps?.steps) return [];
    const visible = steps.steps
      .map((s, idx) => ({ step: s, originalIndex: idx }))
      .filter(x => VISIBLE.has(x.step.type || ''));
    return groupSteps(visible);
  }, [steps]);

  // Detect Fast mode: no TASK_BOUNDARY steps in the conversation
  const isFastMode = useMemo(() => {
    if (!steps?.steps || steps.steps.length === 0) return false;
    return !steps.steps.some(s => s.type === 'CORTEX_STEP_TYPE_TASK_BOUNDARY');
  }, [steps]);

  const totalSteps = steps?.steps?.length || 0;
  const allSteps = steps?.steps || [];

  // Robust auto-scroll to bottom
  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    bottomRef.current?.scrollIntoView({ behavior, block: 'end' });
  }, []);

  // Knowledge Save State
  const [knowledgeModalOpen, setKnowledgeModalOpen] = useState(false);
  const [knowledgeTitle, setKnowledgeTitle] = useState('');
  const [knowledgeSummary, setKnowledgeSummary] = useState('');
  const [knowledgeSaving, setKnowledgeSaving] = useState(false);

  const handleOpenKnowledgeSave = useCallback((text: string) => {
    setKnowledgeSummary(text);
    setKnowledgeTitle('Snippet ' + new Date().toLocaleDateString());
    setKnowledgeModalOpen(true);
  }, []);

  const handleSaveKnowledge = async () => {
    if (!knowledgeTitle || !knowledgeSummary) return;
    setKnowledgeSaving(true);
    try {
      await api.createKnowledge({ title: knowledgeTitle, summary: knowledgeSummary });
      setKnowledgeModalOpen(false);
    } catch (e: any) {
      alert('保存失败: ' + (e.message || '未知错误'));
    } finally {
      setKnowledgeSaving(false);
    }
  };

  // Diff Modal State
  const [diffModalContent, setDiffModalContent] = useState<string | null>(null);

  useEffect(() => {
    const handleOpenDiff = (e: Event) => {
      const customEvent = e as CustomEvent;
      setDiffModalContent(customEvent.detail.diff);
    };
    window.addEventListener('open-diff-modal', handleOpenDiff);
    return () => window.removeEventListener('open-diff-modal', handleOpenDiff);
  }, []);

  const highlightDiff = (raw: string) => {
    return raw.split('\n').map(line => {
      if (line.startsWith('+') && !line.startsWith('+++')) 
        return `<div class="bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded-sm font-mono">${escapeHtml(line)}</div>`;
      if (line.startsWith('-') && !line.startsWith('---')) 
        return `<div class="bg-rose-500/10 text-rose-400 px-2 py-0.5 rounded-sm font-mono">${escapeHtml(line)}</div>`;
      if (line.startsWith('@@')) 
        return `<div class="text-indigo-400 font-bold font-mono px-2 py-1 mt-3 mb-1 bg-indigo-500/10 rounded border border-indigo-500/20">${escapeHtml(line)}</div>`;
      if (line.startsWith('--- ') || line.startsWith('+++ '))
        return `<div class="text-zinc-300 font-bold font-mono px-2 py-0.5 mb-1 opacity-80">${escapeHtml(line)}</div>`;
      return `<div class="px-2 font-mono text-zinc-400 whitespace-pre-wrap">${escapeHtml(line)}</div>`;
    }).join('');
  };

  // Scroll on initial load and message updates
  useEffect(() => {
    if (renderItems.length > 0) {
      // Small timeout to ensure DOM is ready
      const timer = setTimeout(() => scrollToBottom('smooth'), 100);
      return () => clearTimeout(timer);
    }
  }, [renderItems, scrollToBottom]);

  if (!steps && !loading) {
    return (
      <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center">
        <div className="w-20 h-20 rounded-[2rem] bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center mb-10 shadow-xl shadow-indigo-500/5">
          <Rocket className="w-10 h-10 text-indigo-500" />
        </div>
        <h2 className="text-3xl font-extrabold tracking-tight mb-4">Antigravity Gateway</h2>
        <p className="text-muted-foreground text-base mb-10 max-w-sm leading-relaxed">基于 Google DeepMind 模型的企业级智能编程助手与自动化代理平台。</p>
        <div className="flex gap-6">
          <div className="flex flex-col items-center gap-3 opacity-60">
            <div className="w-12 h-12 rounded-xl border border-dashed flex items-center justify-center">
              <span className="font-mono text-xs">/</span>
            </div>
            <span className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">技能 (Skills)</span>
          </div>
          <div className="flex flex-col items-center gap-3 opacity-60">
            <div className="w-12 h-12 rounded-xl border border-dashed flex items-center justify-center">
              <span className="font-mono text-xs">@</span>
            </div>
            <span className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">文件 (Files)</span>
          </div>
        </div>
      </div>
    );
  }

  if (loading && !steps) {
    return (
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-5 text-muted-foreground">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        <span className="text-xs font-bold uppercase tracking-widest">正在初始化会话数据...</span>
      </div>
    );
  }

  return (
    <ScrollArea className="h-full w-full">
      <div className="py-12 min-h-full flex flex-col" ref={viewportRef}>
        {renderItems.map((item, i) =>
          item.type === 'tools'
            ? <div className="max-w-4xl mx-auto w-full px-4 sm:px-6" key={i}><ToolGroup steps={item.steps} /></div>
            : <StepBubble key={i} step={item.step} originalIndex={item.originalIndex} totalSteps={totalSteps} allSteps={allSteps} isFastMode={isFastMode} onProceed={onProceed} onRevert={onRevert} onSaveKnowledge={handleOpenKnowledgeSave} onResubmit={onResubmit} onCancel={onCancel} cascadeStatus={steps?.cascadeStatus} />
        )}
        <div ref={bottomRef} className="h-4 w-full shrink-0" />
      </div>

      <Dialog open={!!diffModalContent} onOpenChange={(o) => (!o && setDiffModalContent(null))}>
        <DialogContent className="max-w-4xl h-[85vh] flex flex-col p-0 gap-0 border-border bg-background shadow-2xl overflow-hidden rounded-xl">
          <DialogHeader className="p-4 sm:px-6 border-b shrink-0 flex flex-row items-center justify-between">
            <div>
              <DialogTitle className="text-lg flex items-center gap-2">
                <FilePen className="w-5 h-5 text-indigo-500" />
                Review Code Changes
              </DialogTitle>
              <DialogDescription className="mt-1">
                Preview of the modifications executed by the Agent.
              </DialogDescription>
            </div>
          </DialogHeader>
          <div className="flex-1 overflow-auto bg-zinc-950 p-6 overscroll-none">
            <div 
              className="text-[13px] leading-relaxed tracking-tight"
              dangerouslySetInnerHTML={{ __html: diffModalContent ? highlightDiff(diffModalContent) : '' }} 
            />
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={knowledgeModalOpen} onOpenChange={setKnowledgeModalOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BookPlus className="h-5 w-5 text-indigo-500" />
              保存到知识库
            </DialogTitle>
            <DialogDescription>
              将选中的对话内容保存到全局知识库中，以便 Agent 在未来的任务中引用。
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <label htmlFor="title" className="text-sm font-medium">标题</label>
              <input
                id="title"
                value={knowledgeTitle}
                onChange={(e) => setKnowledgeTitle(e.target.value)}
                placeholder="给这段内容起个简短的标题"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              />
            </div>
            <div className="grid gap-2">
              <label htmlFor="summary" className="text-sm font-medium">内容摘要</label>
              <textarea
                id="summary"
                value={knowledgeSummary}
                onChange={(e) => setKnowledgeSummary(e.target.value)}
                placeholder="内容摘要..."
                className="flex min-h-[120px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 resize-y"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setKnowledgeModalOpen(false)} disabled={knowledgeSaving}>取消</Button>
            <Button onClick={handleSaveKnowledge} disabled={knowledgeSaving || !knowledgeTitle.trim()}>
              {knowledgeSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ScrollArea>
  );
}
