import React from 'react';
import { Server as ServerIcon, Loader2, Power, ExternalLink, Plus, PowerOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';

interface WorkspaceDialogsProps {
  launchDialogOpen: boolean;
  setLaunchDialogOpen: (open: boolean) => void;
  launchTarget: string;
  launchStatus: 'idle' | 'launching' | 'polling' | 'ready' | 'error';
  launchError: string;
  handleLaunchWorkspace: (uri: string) => void;
  pollRef: React.MutableRefObject<any>;
  onNew: (workspace: string) => void;
  onClose: () => void;
  
  closeDialogOpen: boolean;
  setCloseDialogOpen: (open: boolean) => void;
  closeTarget: string;
  closeLoading: boolean;
  closeError: string;
  handleKillWorkspace: (uri: string) => void;

  newFlowDialogOpen: boolean;
  setNewFlowDialogOpen: (open: boolean) => void;
  newFlowName: string;
  setNewFlowName: (name: string) => void;
  newFlowDesc: string;
  setNewFlowDesc: (desc: string) => void;
  newFlowLoading: boolean;
  handleCreateWorkflow: () => void;
  activeWorkspace: string;

  newRuleDialogOpen: boolean;
  setNewRuleDialogOpen: (open: boolean) => void;
  newRuleName: string;
  setNewRuleName: (name: string) => void;
  newRuleDesc: string;
  setNewRuleDesc: (desc: string) => void;
  newRuleLoading: boolean;
  handleCreateRule: () => void;
}

export function WorkspaceDialogs({
  launchDialogOpen, setLaunchDialogOpen, launchTarget, launchStatus, launchError, handleLaunchWorkspace, pollRef, onNew, onClose,
  closeDialogOpen, setCloseDialogOpen, closeTarget, closeLoading, closeError, handleKillWorkspace,
  newFlowDialogOpen, setNewFlowDialogOpen, newFlowName, setNewFlowName, newFlowDesc, setNewFlowDesc, newFlowLoading, handleCreateWorkflow, activeWorkspace,
  newRuleDialogOpen, setNewRuleDialogOpen, newRuleName, setNewRuleName, newRuleDesc, setNewRuleDesc, newRuleLoading, handleCreateRule
}: WorkspaceDialogsProps) {
  return (
    <>
      {/* Launch Workspace Dialog */}
      <Dialog open={launchDialogOpen} onOpenChange={(open) => {
        if (!open) {
          if (pollRef.current) clearInterval(pollRef.current);
          setLaunchDialogOpen(false);
        }
      }}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ServerIcon className="h-5 w-5 text-amber-500" />
              工作空间未运行
            </DialogTitle>
            <DialogDescription>
              <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">
                {launchTarget.replace('file://', '').split('/').pop()}
              </span>
              {' '}当前未在 Antigravity 中打开。请启动它以开始对话。
            </DialogDescription>
          </DialogHeader>

          <div className="py-2">
            {launchStatus === 'idle' && (
              <p className="text-sm text-muted-foreground">
                这将在新的 Antigravity 窗口中打开该工作空间，并启动其语言服务器。
              </p>
            )}
            {launchStatus === 'launching' && (
              <div className="flex items-center gap-3 text-sm">
                <Loader2 className="h-4 w-4 animate-spin text-amber-500" />
                <span>正在打开工作空间...</span>
              </div>
            )}
            {launchStatus === 'polling' && (
              <div className="flex items-center gap-3 text-sm">
                <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
                <span>等待本地工作区启动...</span>
              </div>
            )}
            {launchStatus === 'ready' && (
              <div className="flex items-center gap-3 text-sm text-emerald-600">
                <Power className="h-4 w-4" />
                <span className="font-medium">服务器已就绪！你现在可以开始在侧边栏选中它了。</span>
              </div>
            )}
            {launchStatus === 'error' && (
              <div className="text-sm text-destructive">{launchError}</div>
            )}
          </div>

          <DialogFooter>
            {launchStatus === 'idle' && (
              <>
                <Button variant="outline" onClick={() => setLaunchDialogOpen(false)}>取消</Button>
                <Button onClick={() => handleLaunchWorkspace(launchTarget)}>
                  <ExternalLink className="mr-2 h-4 w-4" />
                  在 Antigravity 中打开
                </Button>
              </>
            )}
            {(launchStatus === 'launching' || launchStatus === 'polling') && (
              <Button variant="outline" onClick={() => {
                if (pollRef.current) clearInterval(pollRef.current);
                setLaunchDialogOpen(false);
              }}>取消</Button>
            )}
            {launchStatus === 'ready' && (
              <Button onClick={() => {
                setLaunchDialogOpen(false);
                onNew(launchTarget);
                onClose();
              }}>
                <Plus className="mr-2 h-4 w-4" />
                开始新对话
              </Button>
            )}
            {launchStatus === 'error' && (
              <>
                <Button variant="outline" onClick={() => setLaunchDialogOpen(false)}>关闭</Button>
                <Button onClick={() => handleLaunchWorkspace(launchTarget)}>重试</Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Close Workspace Confirmation Dialog */}
      <Dialog open={closeDialogOpen} onOpenChange={(open) => { if (!open) setCloseDialogOpen(false); }}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <PowerOff className="h-5 w-5" />
              彻底关闭工作空间
            </DialogTitle>
            <DialogDescription className="sr-only">确认是否关闭此工作空间并停止其语言服务器</DialogDescription>
            <div className="space-y-4 pt-2 text-sm text-muted-foreground px-2">
              <div>
                这将<strong>停止语言服务器</strong>：
                <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded ml-1 text-foreground">
                  {closeTarget.replace('file://', '').split('/').pop()}
                </span>
              </div>
              <div className="text-amber-600 dark:text-amber-400 text-xs">
                ⚠️ 如果此工作空间在 Agent Manager 中打开，Agent Manager 将失去连接并显示错误。
              </div>
            </div>
          </DialogHeader>
          <div className="px-6 pb-2">
            {closeError && <div className="text-[11px] font-medium text-destructive bg-destructive/10 border border-destructive/20 rounded-md p-2">{closeError}</div>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCloseDialogOpen(false)} disabled={closeLoading}>取消</Button>
            <Button variant="destructive" onClick={() => handleKillWorkspace(closeTarget)} disabled={closeLoading}>
              {closeLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <PowerOff className="mr-2 h-4 w-4" />}
              彻底关闭
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New Workflow Dialog */}
      <Dialog open={newFlowDialogOpen} onOpenChange={setNewFlowDialogOpen}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>新建工作流</DialogTitle>
            <DialogDescription>
              将会在当前项目 <span className="font-mono text-xs bg-muted px-1 rounded">{activeWorkspace?.replace('file://', '').split('/').pop()}</span> 下创建一个新的工作流文件。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <label className="text-sm font-medium">指令名称 (Name)</label>
              <input 
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50" 
                placeholder="输入工作流触发名称 (如: build-project)" 
                value={newFlowName} 
                onChange={e => setNewFlowName(e.target.value)} 
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">描述 (Description)</label>
              <input 
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50" 
                placeholder="输入工作流的作用描述" 
                value={newFlowDesc} 
                onChange={e => setNewFlowDesc(e.target.value)} 
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewFlowDialogOpen(false)} disabled={newFlowLoading}>取消</Button>
            <Button onClick={handleCreateWorkflow} disabled={newFlowLoading || !newFlowName.trim()}>
              {newFlowLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
              创建
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New Rule Dialog */}
      <Dialog open={newRuleDialogOpen} onOpenChange={setNewRuleDialogOpen}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>新建规则</DialogTitle>
            <DialogDescription>
              将会在当前项目 <span className="font-mono text-xs bg-muted px-1 rounded">{activeWorkspace?.replace('file://', '').split('/').pop()}</span> 下创建一个新的规则文件。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <label className="text-sm font-medium">规则名称 (Name)</label>
              <input 
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50" 
                placeholder="输入规则标识符 (如: code-style)" 
                value={newRuleName} 
                onChange={e => setNewRuleName(e.target.value)} 
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">描述 (Description)</label>
              <input 
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50" 
                placeholder="输入规则的简要描述" 
                value={newRuleDesc} 
                onChange={e => setNewRuleDesc(e.target.value)} 
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewRuleDialogOpen(false)} disabled={newRuleLoading}>取消</Button>
            <Button onClick={handleCreateRule} disabled={newRuleLoading || !newRuleName.trim()}>
              {newRuleLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
              创建
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
