import React from 'react';
import { cn } from '@/lib/utils';
import { Search, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';

interface WorkspaceSelectorProps {
  selectedWs: string;
  setSelectedWs: (val: string) => void;
  wsOptions: [string, { hidden: boolean; running: boolean; name: string }][];
  setSearchOpen: (open: boolean) => void;
  handleStartConversation: () => void;
}

export function WorkspaceSelector({
  selectedWs,
  setSelectedWs,
  wsOptions,
  setSearchOpen,
  handleStartConversation,
}: WorkspaceSelectorProps) {
  return (
    <>
      <div className="p-4 space-y-3 shrink-0">
          <div className="flex items-center gap-2">
            <Select value={selectedWs} onValueChange={(val) => val && setSelectedWs(val)}>
              <SelectTrigger className="w-full cursor-pointer">
                <SelectValue placeholder="选择工作空间" />
              </SelectTrigger>
              <SelectContent>
                {wsOptions.filter(([, info]) => !info.hidden).map(([uri, info]) => (
                  <SelectItem key={uri} value={uri}>
                    <div className="flex items-center gap-2">
                      <div className={cn("w-2 h-2 rounded-full", info.running ? "bg-emerald-500" : "bg-muted-foreground/30")} />
                      {info.name}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" size="icon" className="shrink-0 cursor-pointer" onClick={() => setSearchOpen(true)} title="搜索会话 (Cmd+K)">
              <Search className="h-4 w-4" />
            </Button>
          </div>
          <Button className="w-full cursor-pointer" onClick={handleStartConversation}>
            <Plus className="mr-2 h-4 w-4" /> 开始新对话
          </Button>
      </div>
      <Separator className="shrink-0" />
    </>
  );
}
