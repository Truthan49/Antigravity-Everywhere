'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import type { KnowledgeItem, KnowledgeDetail } from '@/lib/types';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { marked } from 'marked';
import {
  BookOpen, ChevronLeft, FileText, Trash2, Save, X, Clock,
  Link2, MessageSquare, FolderOpen, Loader2, Check, AlertTriangle,
  Pencil, Eye, ArrowLeft, Plus, Upload,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';

import { Separator } from '@/components/ui/separator';

interface KnowledgePanelProps {
  open: boolean;
  onClose: () => void;
}

function renderMarkdown(text: string): string {
  try { return marked.parse(text, { async: false }) as string; }
  catch { return text; }
}

function timeAgo(dateStr: string): string {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return '刚刚';
  if (mins < 60) return `${mins}分钟前`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}小时前`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}天前`;
  return new Date(dateStr).toLocaleDateString();
}

function refIcon(type: string) {
  if (type === 'workspace') return <FolderOpen className="w-3.5 h-3.5 shrink-0 text-blue-400" />;
  if (type === 'conversation_id') return <MessageSquare className="w-3.5 h-3.5 shrink-0 text-indigo-400" />;
  if (type === 'url') return <Link2 className="w-3.5 h-3.5 shrink-0 text-emerald-400" />;
  return <FileText className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />;
}

export default function KnowledgePanel({ open, onClose }: KnowledgePanelProps) {
  const [items, setItems] = useState<KnowledgeItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<KnowledgeDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Current artifact being viewed/edited in the main panel
  const [activeArtifact, setActiveArtifact] = useState<string | null>(null);

  // Edit mode for artifact
  const [editMode, setEditMode] = useState(false);
  const [artifactDraft, setArtifactDraft] = useState('');

  // Add artifact mode
  const [isAddingArtifact, setIsAddingArtifact] = useState(false);
  const [newArtifactName, setNewArtifactName] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isCreating, setIsCreating] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newSummary, setNewSummary] = useState('');
  const [newReferences, setNewReferences] = useState<{type: string, value: string}[]>([]);
  const [newUrlInput, setNewUrlInput] = useState('');

  // Metadata editing
  const [editingMeta, setEditingMeta] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const [summaryDraft, setSummaryDraft] = useState('');
  const [referencesDraft, setReferencesDraft] = useState<{type: string, value: string}[]>([]);
  const [draftUrlInput, setDraftUrlInput] = useState('');

  // Save state
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState<KnowledgeItem | null>(null);
  const [deleting, setDeleting] = useState(false);

  const loadItems = useCallback(async () => {
    setLoading(true);
    try { setItems(await api.knowledge()); } catch { /* silent */ }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (open) { loadItems(); setSelectedId(null); setDetail(null); setActiveArtifact(null); }
  }, [open, loadItems]);

  const loadDetail = useCallback(async (id: string) => {
    setDetailLoading(true);
    setDetail(null);
    setActiveArtifact(null);
    setEditMode(false);
    setEditingMeta(false);
    setSaveMsg('');
    try {
      const data = await api.knowledgeDetail(id);
      setDetail(data);
      // Auto-select first artifact
      if (data.artifactFiles.length > 0) {
        setActiveArtifact(data.artifactFiles[0]);
      }
    } catch { /* silent */ }
    setDetailLoading(false);
  }, []);

  const handleSelect = (id: string) => {
    setSelectedId(id);
    loadDetail(id);
  };

  const handleBack = () => {
    setSelectedId(null);
    setDetail(null);
    setActiveArtifact(null);
    setEditMode(false);
    setEditingMeta(false);
    setIsAddingArtifact(false);
    setNewArtifactName('');
  };

  const handleCreate = async () => {
    if (!newTitle.trim()) return;
    try {
      setLoading(true);
      await api.createKnowledge({ title: newTitle.trim(), summary: newSummary.trim(), references: newReferences });
      setIsCreating(false);
      setNewTitle('');
      setNewSummary('');
      setNewReferences([]);
      setNewUrlInput('');
      await loadItems();
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveMeta = async () => {
    if (!detail) return;
    setSaving(true);
    try {
      await api.updateKnowledge(detail.id, { title: titleDraft, summary: summaryDraft, references: referencesDraft });
      setDetail({ ...detail, title: titleDraft, summary: summaryDraft, references: referencesDraft });
      setEditingMeta(false);
      setSaveMsg('已保存');
      setTimeout(() => setSaveMsg(''), 2000);
      loadItems();
    } catch { setSaveMsg('保存失败'); }
    setSaving(false);
  };

  const handleSaveArtifact = async () => {
    if (!detail || !activeArtifact) return;
    setSaving(true);
    try {
      await api.updateKnowledgeArtifact(detail.id, activeArtifact, artifactDraft);
      setDetail({ ...detail, artifacts: { ...detail.artifacts, [activeArtifact]: artifactDraft } });
      setEditMode(false);
      setSaveMsg('已保存');
      setTimeout(() => setSaveMsg(''), 2000);
    } catch { setSaveMsg('保存失败'); }
    setSaving(false);
  };

  const handleCreateArtifact = async () => {
    let name = newArtifactName.trim();
    if (!name || !detail) return;
    if (!name.endsWith('.md')) name += '.md';
    setSaving(true);
    const initialContent = '# ' + name.replace('.md', '') + '\n\n';
    try {
      await api.updateKnowledgeArtifact(detail.id, name, initialContent);
      setDetail({
        ...detail,
        artifactFiles: [...detail.artifactFiles.filter((f: string) => f !== name), name],
        artifacts: { ...detail.artifacts, [name]: initialContent },
      });
      setIsAddingArtifact(false);
      setNewArtifactName('');
      setActiveArtifact(name);
      setArtifactDraft(initialContent);
      setEditMode(true);
      loadItems(); // Refresh sidebar list item count
    } catch {
      setSaveMsg('创建物失败');
      setTimeout(() => setSaveMsg(''), 2000);
    }
    setSaving(false);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !detail) return;
    
    const reader = new FileReader();
    reader.onload = async (evt) => {
      const content = evt.target?.result as string;
      setSaving(true);
      try {
        await api.updateKnowledgeArtifact(detail.id, file.name, content);
        setDetail({
          ...detail,
          artifactFiles: [...detail.artifactFiles.filter((f: string) => f !== file.name), file.name],
          artifacts: { ...detail.artifacts, [file.name]: content },
        });
        setActiveArtifact(file.name);
        setArtifactDraft(content);
        setEditMode(true);
        loadItems();
      } catch {
        setSaveMsg('上传失败');
        setTimeout(() => setSaveMsg(''), 2000);
      } finally {
        setSaving(false);
      }
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.deleteKnowledge(deleteTarget.id);
      setDeleteTarget(null);
      if (selectedId === deleteTarget.id) handleBack();
      loadItems();
    } catch { /* silent */ }
    setDeleting(false);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] bg-background flex">
      {/* ══════ LEFT SIDEBAR ══════ */}
      <aside className={cn(
        'flex flex-col border-r bg-background shrink-0 h-full overflow-hidden',
        // On mobile: full width when no artifact selected, hidden when viewing
        selectedId && activeArtifact ? 'hidden md:flex md:w-[300px]' : 'w-full md:w-[300px]',
      )}>
        {/* Sidebar Header */}
        <div className="flex items-center gap-3 px-4 h-14 border-b shrink-0">
          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={selectedId ? handleBack : onClose}>
            {selectedId ? <ChevronLeft className="h-4 w-4" /> : <X className="h-4 w-4" />}
          </Button>
          <BookOpen className="h-4 w-4 text-indigo-500 shrink-0" />
          <h2 className="text-sm font-semibold flex-1 truncate">
            {selectedId ? '知识项详情' : '任务知识库'}
          </h2>
          {saveMsg && (
            <Badge variant="outline" className="text-[10px] h-5 text-emerald-500 border-emerald-500/30">
              <Check className="h-3 w-3 mr-1" />{saveMsg}
            </Badge>
          )}
          {!selectedId && (
            <Button
              variant="outline"
              size="icon"
              className="h-6 w-6 text-muted-foreground hover:bg-muted"
              onClick={() => setIsCreating(true)}
              title="新建知识项"
            >
              <Plus className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {!selectedId ? (
            /* ── KI List ── */
            <div className="p-3 space-y-2">
              {loading ? (
                <div className="flex items-center justify-center py-20">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : items.length === 0 ? (
                <div className="text-center py-20 text-muted-foreground text-sm">暂无知识库项目，等待首个 Agent 任务生成记录...</div>
              ) : items.map(item => (
                <div
                  key={item.id}
                  role="button"
                  tabIndex={0}
                  className="w-full text-left p-3 rounded-lg border bg-card hover:bg-accent/50 transition-all group space-y-1.5 cursor-pointer"
                  onClick={() => handleSelect(item.id)}
                  onKeyDown={(e) => { if(e.key === 'Enter' || e.key === ' ') handleSelect(item.id); }}
                >
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-xs font-semibold leading-tight group-hover:text-primary transition-colors line-clamp-2">
                      {item.title}
                    </h3>
                    <Button
                      variant="ghost" size="icon"
                      className="h-6 w-6 shrink-0 opacity-0 group-hover:opacity-100 text-destructive hover:text-destructive"
                      onClick={e => { e.stopPropagation(); setDeleteTarget(item); }}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                  <p className="text-[11px] text-muted-foreground line-clamp-2 leading-relaxed">{item.summary}</p>
                  <div className="flex items-center gap-3 text-[10px] text-muted-foreground/60">
                    <span className="flex items-center gap-1"><FileText className="h-2.5 w-2.5" />{item.artifactFiles.length}</span>
                    <span className="flex items-center gap-1"><Clock className="h-2.5 w-2.5" />{timeAgo(item.timestamps.accessed)}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : detailLoading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : detail ? (
            /* ── KI Detail Sidebar ── */
            <div className="p-3 space-y-4">
              {/* Metadata Card */}
              <div className="rounded-lg border bg-card p-3 space-y-3">
                {editingMeta ? (
                  <div className="space-y-3">
                    <div>
                      <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">标题 (Title)</label>
                      <input
                        className="w-full text-xs font-semibold bg-muted/50 border rounded-md px-2.5 py-1.5 mt-1 focus:outline-none focus:ring-2 focus:ring-primary/30"
                        value={titleDraft}
                        onChange={e => setTitleDraft(e.target.value)}
                        autoFocus
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">摘要 (Summary)</label>
                      <textarea
                        className="w-full text-[11px] bg-muted/50 border rounded-md px-2.5 py-1.5 mt-1 focus:outline-none focus:ring-2 focus:ring-primary/30 min-h-[80px] resize-y leading-relaxed"
                        value={summaryDraft}
                        onChange={(e: any) => setSummaryDraft(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">外部链接 (External Links)</label>
                      <div className="flex gap-1 mt-1">
                        <input
                          className="flex-1 text-[11px] bg-muted/50 border rounded-md px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary/30"
                          placeholder="https://..."
                          value={draftUrlInput}
                          onChange={(e: any) => setDraftUrlInput(e.target.value)}
                          onKeyDown={(e: any) => {
                            if (e.key === 'Enter' && draftUrlInput.trim()) {
                              e.preventDefault();
                              setReferencesDraft((prev: any[]) => [...prev, { type: 'url', value: draftUrlInput.trim() }]);
                              setDraftUrlInput('');
                            }
                          }}
                        />
                        <Button 
                          size="sm" variant="secondary" className="h-7 text-[11px]" 
                          onClick={() => {
                            if (draftUrlInput.trim()) {
                              setReferencesDraft((prev: any[]) => [...prev, { type: 'url', value: draftUrlInput.trim() }]);
                              setDraftUrlInput('');
                            }
                          }}
                        >
                          添加
                        </Button>
                      </div>
                      {referencesDraft.length > 0 && (
                        <div className="mt-2 space-y-1">
                          {referencesDraft.map((ref, idx) => (
                            <div key={idx} className="flex items-center gap-2 text-[10px] bg-muted/30 rounded px-2 py-1">
                              {refIcon(ref.type)}
                              <span className="truncate flex-1 font-mono">{ref.value}</span>
                              <Button 
                                variant="ghost" size="icon" className="h-4 w-4 shrink-0 text-muted-foreground hover:text-destructive"
                                onClick={() => setReferencesDraft((prev: any[]) => prev.filter((_: any, i: number) => i !== idx))}
                              >
                                <X className="h-3 w-3" />
                              </Button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="flex gap-2 justify-end">
                      <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setEditingMeta(false)}>取消</Button>
                      <Button size="sm" className="h-7 text-xs" onClick={handleSaveMeta} disabled={saving}>
                        {saving ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Save className="h-3 w-3 mr-1" />}保存
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div
                    className="cursor-pointer hover:bg-muted/30 rounded-md p-1 -m-1 transition-colors group/meta"
                    onClick={() => { setTitleDraft(detail.title); setSummaryDraft(detail.summary); setReferencesDraft(detail.references || []); setEditingMeta(true); }}
                  >
                    <div className="flex items-start justify-between">
                      <h3 className="text-xs font-bold leading-tight">{detail.title}</h3>
                      <Pencil className="h-3 w-3 text-muted-foreground/40 opacity-0 group-hover/meta:opacity-100 transition-opacity shrink-0 mt-0.5" />
                    </div>
                    <p className="text-[11px] text-muted-foreground leading-relaxed mt-1.5 line-clamp-4">{detail.summary}</p>
                  </div>
                )}
              </div>

              {/* Timestamps */}
              <div className="grid grid-cols-3 gap-1.5 text-[9px] text-muted-foreground/60">
                <div className="bg-muted/20 rounded px-2 py-1.5 text-center">
                  <div className="font-bold uppercase">创建时间</div>
                  <div>{timeAgo(detail.timestamps.created)}</div>
                </div>
                <div className="bg-muted/20 rounded px-2 py-1.5 text-center">
                  <div className="font-bold uppercase">修改时间</div>
                  <div>{timeAgo(detail.timestamps.modified)}</div>
                </div>
                <div className="bg-muted/20 rounded px-2 py-1.5 text-center">
                  <div className="font-bold uppercase">访问时间</div>
                  <div>{timeAgo(detail.timestamps.accessed)}</div>
                </div>
              </div>

              {/* References */}
              {detail.references.length > 0 && (
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">关联引用 (References)</label>
                  {detail.references.map((ref, i) => (
                    <div key={i} className="flex items-center gap-2 text-[10px] bg-muted/20 rounded-md px-2.5 py-1.5">
                      {refIcon(ref.type)}
                      <span className="truncate text-muted-foreground font-mono">{ref.value}</span>
                    </div>
                  ))}
                </div>
              )}

              <Separator />

              {/* Artifact Files List */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                    生成物 ({detail.artifactFiles.length})
                  </label>
                  <div className="flex">
                    <input type="file" ref={fileInputRef} className="hidden" accept=".md,.txt,.json" onChange={handleFileUpload} />
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="h-5 w-5 text-muted-foreground hover:bg-muted" 
                      onClick={() => fileInputRef.current?.click()}
                      title="上传本地文件"
                      disabled={saving}
                    >
                      <Upload className="h-3.5 w-3.5" />
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="h-5 w-5 text-muted-foreground hover:bg-muted" 
                      onClick={() => { setIsAddingArtifact(true); setNewArtifactName(''); }}
                      title="添加空白生成物"
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
                
                {isAddingArtifact && (
                  <div className="flex gap-1 mb-2">
                    <input
                      className="flex-1 border rounded-md px-2 h-7 text-[10px] font-mono focus:outline-none focus:ring-1 focus:ring-primary"
                      placeholder="文件名 (如: doc.md)"
                      autoFocus
                      value={newArtifactName}
                      onChange={(e: any) => setNewArtifactName(e.target.value)}
                      onKeyDown={(e: any) => {
                        if (e.key === 'Enter') handleCreateArtifact();
                        if (e.key === 'Escape') { setIsAddingArtifact(false); setNewArtifactName(''); }
                      }}
                    />
                    <Button 
                      size="sm" 
                      variant="secondary" 
                      className="h-7 px-2 text-[10px]" 
                      onClick={handleCreateArtifact} 
                      disabled={saving || !newArtifactName.trim()}
                    >
                      确认
                    </Button>
                  </div>
                )}
                {detail.artifactFiles.map(f => (
                  <button
                    key={f}
                    className={cn(
                      'w-full flex items-center gap-2 text-left p-2.5 rounded-lg border transition-all text-[11px]',
                      activeArtifact === f
                        ? 'bg-primary/10 border-primary/30 text-primary font-semibold'
                        : 'bg-card hover:bg-accent/50 text-muted-foreground hover:text-foreground',
                    )}
                    onClick={() => { setActiveArtifact(f); setEditMode(false); }}
                  >
                    <FileText className={cn('h-3.5 w-3.5 shrink-0', activeArtifact === f ? 'text-primary' : 'text-amber-500')} />
                    <span className="truncate flex-1">{f}</span>
                    <Badge variant="outline" className="text-[8px] h-4 px-1 opacity-40">
                      {((detail.artifacts[f]?.length || 0) / 1024).toFixed(1)}k
                    </Badge>
                  </button>
                ))}
              </div>

              <Separator />

              {/* Danger */}
              <Button
                variant="outline" size="sm"
                className="w-full text-destructive border-destructive/30 hover:bg-destructive/10 text-xs h-8"
                onClick={() => setDeleteTarget(detail)}
              >
                <Trash2 className="h-3 w-3 mr-1.5" />删除该知识项
              </Button>
            </div>
          ) : null}
        </div>
      </aside>

      {/* ══════ MAIN CONTENT AREA ══════ */}
      <main className={cn(
        'flex-1 flex flex-col min-w-0',
        // On mobile: hidden when no artifact selected (sidebar is full)
        !selectedId || !activeArtifact ? 'hidden md:flex' : 'flex',
      )}>
        {!selectedId || !detail ? (
          /* ── Empty State ── */
          <div className="flex-1 flex flex-col items-center justify-center text-center p-6">
            <div className="w-16 h-16 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center mb-6">
              <BookOpen className="w-8 h-8 text-indigo-500" />
            </div>
            <h2 className="text-xl font-bold tracking-tight mb-2">知识库</h2>
            <p className="text-muted-foreground text-sm max-w-sm leading-relaxed">
              从侧边栏选择一个知识项以查看和编辑其生成物 (Artifacts)。
            </p>
          </div>
        ) : !activeArtifact ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-6 bg-muted/10">
            <FileText className="w-12 h-12 text-muted-foreground/30 mb-4" />
            <h3 className="text-lg font-bold tracking-tight mb-2">生成物工作区</h3>
            <p className="text-muted-foreground text-sm max-w-[280px] leading-relaxed mb-6">
              该知识项还没有被选中的文件。您可以从左侧选择一个文件打开，或者直接在这里创建/上传 Markdown 文档。
            </p>
            <div className="flex gap-4">
              <Button onClick={() => { setIsAddingArtifact(true); setNewArtifactName(''); }}>
                <Plus className="w-4 h-4 mr-1.5" />新建空白文档
              </Button>
              <Button variant="outline" onClick={() => fileInputRef.current?.click()}>
                <Upload className="w-4 h-4 mr-1.5" />上传本地文件
              </Button>
            </div>
          </div>
        ) : (
          <>
            {/* Artifact Header */}
            <div className="flex items-center gap-3 px-4 md:px-6 h-12 border-b shrink-0 bg-background/95 backdrop-blur">
              {/* Mobile: back button */}
              <Button
                variant="ghost" size="icon" className="h-8 w-8 md:hidden shrink-0"
                onClick={() => setActiveArtifact(null)}
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <FileText className="h-4 w-4 text-amber-500 shrink-0" />
              <span className="text-sm font-medium truncate flex-1 font-mono">{activeArtifact}</span>

              {/* View/Edit toggle */}
              <div className="flex items-center border rounded-lg overflow-hidden h-8">
                <button
                  className={cn('px-3 h-full text-xs font-medium flex items-center gap-1.5 transition-colors',
                    !editMode ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground')}
                  onClick={() => setEditMode(false)}
                >
                  <Eye className="h-3 w-3" />预览
                </button>
                <button
                  className={cn('px-3 h-full text-xs font-medium flex items-center gap-1.5 transition-colors border-l',
                    editMode ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground')}
                  onClick={() => { setArtifactDraft(detail.artifacts[activeArtifact] || ''); setEditMode(true); }}
                >
                  <Pencil className="h-3 w-3" />编辑
                </button>
              </div>

              {editMode && (
                <Button size="sm" className="h-8 text-xs" onClick={handleSaveArtifact} disabled={saving}>
                  {saving ? <Loader2 className="h-3 w-3 animate-spin mr-1.5" /> : <Save className="h-3 w-3 mr-1.5" />}
                  保存
                </Button>
              )}
            </div>

            {/* Artifact Content */}
            {editMode ? (
              /* ── Split Editor (desktop: side-by-side, mobile: tabs) ── */
              <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
                {/* Editor */}
                <div className="flex-1 flex flex-col min-w-0 border-r">
                  <div className="px-3 py-1.5 border-b bg-muted/20 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                    Markdown 源码
                  </div>
                  <textarea
                    className="flex-1 w-full p-4 font-mono text-sm bg-background resize-none focus:outline-none leading-relaxed overflow-auto"
                    value={artifactDraft}
                    onChange={(e: any) => setArtifactDraft(e.target.value)}
                    spellCheck={false}
                    autoFocus
                  />
                </div>
                {/* Live Preview (desktop only) */}
                <div className="hidden md:flex flex-1 flex-col min-w-0">
                  <div className="px-3 py-1.5 border-b bg-muted/20 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                    渲染预览
                  </div>
                  <div className="flex-1 min-h-0 overflow-y-auto">
                    <div className="p-6 md:p-10 max-w-3xl mx-auto">
                      <div
                        className="chat-markdown text-[15px] leading-relaxed"
                        dangerouslySetInnerHTML={{ __html: renderMarkdown(artifactDraft) }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              /* ── Rendered Markdown View ── */
              <div className="flex-1 min-h-0 overflow-y-auto">
                <div className="p-6 md:p-10 lg:p-16 max-w-3xl mx-auto">
                  <div
                    className="chat-markdown text-[15px] leading-relaxed"
                    dangerouslySetInnerHTML={{ __html: renderMarkdown(detail.artifacts[activeArtifact] || '') }}
                  />
                </div>
              </div>
            )}
          </>
        )}
      </main>

      {/* Create Modal */}
      {isCreating && (
        <div className="absolute inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-card border rounded-xl shadow-xl p-5 space-y-4 font-sans">
            <h3 className="text-base font-semibold">新建知识项</h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-muted-foreground font-medium mb-1.5 block">标题 (必填)</label>
                <input
                  className="w-full border rounded-md px-3 h-8 text-xs font-sans placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/30"
                  placeholder="例如：系统架构文档"
                  value={newTitle}
                  onChange={(e: any) => setNewTitle(e.target.value)}
                  autoFocus
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground font-medium mb-1.5 block">摘要 (可选)</label>
                <Textarea
                  className="h-20 text-xs font-sans resize-none placeholder:text-muted-foreground/50"
                  placeholder="简略描述该知识项包含的内容..."
                  value={newSummary}
                  onChange={(e: any) => setNewSummary(e.target.value)}
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground font-medium mb-1.5 block">外部链接 (可选)</label>
                <div className="flex gap-2 mb-2">
                  <input
                    className="flex-1 border rounded-md px-3 h-8 text-xs font-sans placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/30"
                    placeholder="请输入URL如 https://github.com..."
                    value={newUrlInput}
                    onChange={(e: any) => setNewUrlInput(e.target.value)}
                    onKeyDown={(e: any) => {
                      if (e.key === 'Enter' && newUrlInput.trim()) {
                        e.preventDefault();
                        setNewReferences((prev: any[]) => [...prev, { type: 'url', value: newUrlInput.trim() }]);
                        setNewUrlInput('');
                      }
                    }}
                  />
                  <Button 
                    variant="secondary" className="h-8 text-xs px-3"
                    onClick={() => {
                      if (newUrlInput.trim()) {
                        setNewReferences((prev: any[]) => [...prev, { type: 'url', value: newUrlInput.trim() }]);
                        setNewUrlInput('');
                      }
                    }}
                  >
                    添加
                  </Button>
                </div>
                {newReferences.length > 0 && (
                  <div className="space-y-1.5 max-h-32 overflow-y-auto">
                    {newReferences.map((ref, idx) => (
                      <div key={idx} className="flex items-center gap-2 text-[11px] bg-muted/40 border rounded px-2.5 py-1.5">
                        {refIcon(ref.type)}
                        <span className="truncate flex-1 font-mono">{ref.value}</span>
                        <Button 
                          variant="ghost" size="icon" className="h-5 w-5 shrink-0 text-muted-foreground hover:text-destructive"
                          onClick={() => setNewReferences((prev: any[]) => prev.filter((_: any, i: number) => i !== idx))}
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div className="flex gap-2 pt-2">
              <Button
                variant="outline"
                className="flex-1 h-8 text-xs font-sans"
                onClick={() => { setIsCreating(false); setNewTitle(''); setNewSummary(''); setNewReferences([]); setNewUrlInput(''); }}
                disabled={loading}
              >
                取消
              </Button>
              <Button
                className="flex-1 h-8 text-xs font-sans bg-primary hover:bg-primary/90 text-primary-foreground"
                onClick={handleCreate}
                disabled={!newTitle.trim() || loading}
              >
                {loading ? '创建中...' : '创建'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {!!deleteTarget && (
        <div className="absolute inset-0 z-[70] bg-background/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-card border rounded-xl shadow-xl p-6 space-y-4 font-sans relative">
            <h3 className="text-lg font-semibold flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />确认删除知识项
            </h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              即将永久删除知识项 <strong className="text-foreground">{deleteTarget.title}</strong> 以及其所有内容。此操作无法撤销。
            </p>
            <div className="flex gap-2 justify-end pt-2 text-sm">
              <Button variant="outline" className="h-9" onClick={() => setDeleteTarget(null)} disabled={deleting}>取消</Button>
              <Button variant="destructive" className="h-9" onClick={handleDelete} disabled={deleting}>
                {deleting ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Trash2 className="h-4 w-4 mr-1.5" />}
                彻底删除
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
