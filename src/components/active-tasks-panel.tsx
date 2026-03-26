'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { Activity, X, ChevronUp, ChevronDown } from 'lucide-react';

export interface ActiveTask {
  cascadeId: string;
  title: string;
  workspace: string;
  stepCount: number;
  totalSteps?: number;
  lastTaskBoundary?: {
    mode?: string;
    taskName?: string;
    taskStatus?: string;
    taskSummary?: string;
  };
  isActive: boolean;
  cascadeStatus?: string;
}

interface ActiveTasksPanelProps {
  tasks: ActiveTask[];
  onSelect: (cascadeId: string, title: string) => void;
  onDismiss: (cascadeId: string) => void;
  activeCascadeId?: string | null;
}

const modeColors: Record<string, string> = {
  planning: 'bg-blue-500',
  execution: 'bg-emerald-500',
  verification: 'bg-amber-500',
};

function getModeLabel(mode?: string): string {
  if (!mode) return '';
  const m = mode.replace('AGENT_MODE_', '').toLowerCase();
  return m.charAt(0).toUpperCase() + m.slice(1);
}

function getModeColor(mode?: string): string {
  if (!mode) return 'bg-muted-foreground';
  const m = mode.replace('AGENT_MODE_', '').toLowerCase();
  return modeColors[m] || 'bg-muted-foreground';
}

function TaskItem({ task, isCurrentConversation, onSelect, onDismiss }: {
  task: ActiveTask;
  isCurrentConversation: boolean;
  onSelect: () => void;
  onDismiss: () => void;
}) {
  const touchRef = useRef({ startX: 0, currentX: 0, swiping: false });
  const itemRef = useRef<HTMLDivElement>(null);
  const [swipeX, setSwipeX] = useState(0);
  const [dismissed, setDismissed] = useState(false);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchRef.current.startX = e.touches[0].clientX;
    touchRef.current.swiping = true;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!touchRef.current.swiping) return;
    const dx = e.touches[0].clientX - touchRef.current.startX;
    touchRef.current.currentX = dx;
    setSwipeX(dx);
  };

  const handleTouchEnd = () => {
    if (Math.abs(touchRef.current.currentX) > 60) {
      setDismissed(true);
      setTimeout(onDismiss, 300);
    } else {
      setSwipeX(0);
    }
    touchRef.current.swiping = false;
    touchRef.current.currentX = 0;
  };

  if (dismissed) return null;

  const progressPct = task.totalSteps
    ? Math.min(100, Math.round((task.stepCount / task.totalSteps) * 100))
    : null;

  const mode = getModeLabel(task.lastTaskBoundary?.mode);
  const modeColor = getModeColor(task.lastTaskBoundary?.mode);

  return (
    <div
      ref={itemRef}
      className={cn(
        'px-3 py-2.5 cursor-pointer transition-all border-b border-border/50 last:border-b-0',
        isCurrentConversation ? 'bg-accent/50' : 'hover:bg-muted/50',
        dismissed && 'opacity-0 translate-x-full',
      )}
      style={{ transform: `translateX(${swipeX}px)`, opacity: dismissed ? 0 : 1 - Math.abs(swipeX) / 200 }}
      onClick={onSelect}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      <div className="flex items-center justify-between gap-2 mb-1">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <span className={cn(
            'w-2 h-2 rounded-full shrink-0',
            task.isActive ? 'bg-emerald-500 animate-pulse' : 'bg-muted-foreground/40'
          )} />
          <span className="text-xs font-medium truncate">{task.title || task.workspace}</span>
        </div>
        {mode && (
          <span className={cn(
            'text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded text-white shrink-0',
            modeColor
          )}>
            {mode}
          </span>
        )}
      </div>

      {/* Progress bar */}
      <div className="h-1.5 bg-muted rounded-full overflow-hidden mb-1">
        {progressPct !== null ? (
          <div
            className={cn(
              'h-full rounded-full transition-all duration-500',
              task.isActive ? 'bg-gradient-to-r from-indigo-500 to-purple-500' : 'bg-muted-foreground/40'
            )}
            style={{ width: `${progressPct}%` }}
          />
        ) : (
          <div className={cn(
            'h-full rounded-full w-2/3',
            task.isActive ? 'bg-gradient-to-r from-indigo-500 to-purple-500 animate-pulse-subtle' : 'bg-muted-foreground/30'
          )} />
        )}
      </div>

      <div className="flex items-center justify-between text-[10px] text-muted-foreground">
        <span className="truncate max-w-[200px]">
          {task.lastTaskBoundary?.taskStatus || (task.isActive ? '处理中...' : '空闲')}
        </span>
        <span className="shrink-0 ml-2 font-mono">
          {task.stepCount}{task.totalSteps ? `/${task.totalSteps}` : ''} 步
        </span>
      </div>
    </div>
  );
}

export default function ActiveTasksPanel({ tasks, onSelect, onDismiss, activeCascadeId }: ActiveTasksPanelProps) {
  const [expanded, setExpanded] = useState(false);
  const [visible, setVisible] = useState(false);

  const activeTasks = tasks.filter(t => t.isActive);
  const taskCount = activeTasks.length;

  // Auto show/hide based on active tasks
  useEffect(() => {
    if (taskCount > 0) {
      setVisible(true);
    } else {
      const timer = setTimeout(() => setVisible(false), 3000);
      return () => clearTimeout(timer);
    }
  }, [taskCount]);

  // If nothing to show, render nothing
  if (!visible && taskCount === 0) return null;

  // Collapsed badge
  if (!expanded) {
    return (
      <button
        className={cn(
          'fixed bottom-24 right-6 z-50 flex items-center gap-2 px-3 py-2 rounded-full shadow-lg border transition-all',
          'bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80',
          'hover:scale-105 active:scale-95',
          taskCount > 0 ? 'border-indigo-500/30' : 'border-border opacity-60'
        )}
        onClick={() => setExpanded(true)}
      >
        <Activity className={cn('w-4 h-4', taskCount > 0 ? 'text-indigo-500' : 'text-muted-foreground')} />
        <span className={cn('text-xs font-semibold', taskCount > 0 ? 'text-indigo-500' : 'text-muted-foreground')}>
          {taskCount}
        </span>
        <ChevronUp className="w-3 h-3 text-muted-foreground" />
      </button>
    );
  }

  // Expanded panel
  return (
    <div className={cn(
      'fixed bottom-24 right-6 z-50 w-80 rounded-xl shadow-2xl border overflow-hidden',
      'bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80',
      'animate-in slide-in-from-bottom-4 fade-in duration-200',
    )}>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/30">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-indigo-500" />
          <span className="text-xs font-semibold">
            {taskCount} 个活跃任务
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            className="p-1 rounded hover:bg-muted transition-colors"
            onClick={() => setExpanded(false)}
          >
            <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
          </button>
          <button
            className="p-1 rounded hover:bg-muted transition-colors"
            onClick={() => { setExpanded(false); setVisible(false); }}
          >
            <X className="w-3.5 h-3.5 text-muted-foreground" />
          </button>
        </div>
      </div>

      {/* Task list */}
      <div className="max-h-[280px] overflow-y-auto">
        {tasks.length === 0 ? (
          <div className="px-3 py-6 text-center text-xs text-muted-foreground">
            暂无活跃任务
          </div>
        ) : (
          tasks.map(task => (
            <TaskItem
              key={task.cascadeId}
              task={task}
              isCurrentConversation={task.cascadeId === activeCascadeId}
              onSelect={() => {
                onSelect(task.cascadeId, task.title || task.workspace);
                setExpanded(false);
              }}
              onDismiss={() => onDismiss(task.cascadeId)}
            />
          ))
        )}
      </div>
    </div>
  );
}
