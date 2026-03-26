import type {
  Conversation, UserInfo, Server, Skill, Workflow, Rule,
  McpConfig, StepsData, ModelsResponse, WorkspacesResponse, AnalyticsData,
  KnowledgeItem, KnowledgeDetail,
} from './types';

const API = typeof window !== 'undefined' ? window.location.origin : '';

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${url}`, init);
  if (!res.ok) {
    let errMsg = `${res.status} ${res.statusText}`;
    try {
      const data = await res.json();
      if (data.error) errMsg = data.error;
    } catch {}
    throw new Error(errMsg);
  }
  return res.json();
}

export const api = {
  me: () => fetchJson<UserInfo>('/api/me'),
  models: () => fetchJson<ModelsResponse>('/api/models'),
  setModel: (model: string) => fetch('/api/models', { method: 'POST', body: JSON.stringify({ model }) }),
  servers: () => fetchJson<Server[]>('/api/servers'),
  workspaces: () => fetchJson<WorkspacesResponse>('/api/workspaces'),
  conversations: () => fetchJson<Conversation[]>('/api/conversations'),
  conversationSteps: (id: string) => fetchJson<StepsData>(`/api/conversations/${id}/steps`),
  skills: () => fetchJson<Skill[]>('/api/skills'),
  workflows: () => fetchJson<Workflow[]>('/api/workflows'),
  rules: () => fetchJson<Rule[]>('/api/rules'),
  mcp: () => fetchJson<McpConfig>('/api/mcp'),
  analytics: () => fetchJson<AnalyticsData>('/api/analytics'),
  conversationFiles: (id: string, q: string) => fetchJson<{ files: any[] }>(`/api/conversations/${id}/files?q=${encodeURIComponent(q)}`),

  createConversation: (workspace: string) =>
    fetchJson<{ cascadeId?: string; error?: string }>('/api/conversations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspace }),
    }),

  sendMessage: (id: string, text: string, model?: string, agenticMode: boolean = true, attachments?: any) =>
    fetchJson<{ ok: boolean }>(`/api/conversations/${id}/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, model, agenticMode, attachments }),
    }),

  proceed: (id: string, artifactUri: string, model?: string) =>
    fetchJson<{ ok: boolean }>(`/api/conversations/${id}/proceed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ artifactUri, model }),
    }),

  cancel: (id: string) =>
    fetchJson<{ ok: boolean }>(`/api/conversations/${id}/cancel`, {
      method: 'POST',
    }),

  revert: (id: string, stepIndex: number, model?: string) =>
    fetchJson<{ ok: boolean }>(`/api/conversations/${id}/revert`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stepIndex, model }),
    }),

  getRevertPreview: (id: string, stepIndex: number, model?: string) => 
    fetchJson<any>(`/api/conversations/${id}/revert-preview?stepIndex=${stepIndex}${model ? `&model=${encodeURIComponent(model)}` : ''}`),

  launchWorkspace: (workspace: string) =>
    fetchJson<{ ok: boolean; error?: string }>('/api/workspaces/launch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspace }),
    }),

  closeWorkspace: (workspace: string) =>
    fetchJson<{ ok: boolean; error?: string }>('/api/workspaces/close', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspace }),
    }),

  // Knowledge Items
  knowledge: () => fetchJson<KnowledgeItem[]>('/api/knowledge'),
  createKnowledge: (data: { title: string; summary?: string; references?: {type: string; value: string}[] }) =>
    fetchJson<{ id: string; title: string; summary: string }>('/api/knowledge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),
  knowledgeDetail: (id: string) => fetchJson<KnowledgeDetail>(`/api/knowledge/${encodeURIComponent(id)}`),
  updateKnowledge: (id: string, data: { title?: string; summary?: string; references?: {type: string; value: string}[] }) =>
    fetchJson<{ ok: boolean }>(`/api/knowledge/${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),
  deleteKnowledge: (id: string) =>
    fetchJson<{ ok: boolean }>(`/api/knowledge/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  updateKnowledgeArtifact: (id: string, path: string, content: string) =>
    fetchJson<{ ok: boolean }>(`/api/knowledge/${encodeURIComponent(id)}/artifacts/${path}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    }),

  // Feishu Config
  getFeishuConfig: () => fetchJson<any>('/api/feishu/config'),
  updateFeishuConfig: (config: any) =>
    fetchJson<{ ok: boolean }>('/api/feishu/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    }),

  // Workspace Bots
  getWorkspaceBots: () => fetchJson<{ bots: any[] }>('/api/feishu/workspace-bots'),
  bindWorkspaceBot: (data: { workspaceUri: string; appId: string; appSecret: string; label?: string; enabled?: boolean; preferredModel?: string }) =>
    fetchJson<{ ok: boolean; message?: string; error?: string }>('/api/feishu/workspace-bots', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),
  unbindWorkspaceBot: (appId: string) =>
    fetchJson<{ ok: boolean }>('/api/feishu/workspace-bots', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ appId }),
    }),
};

// WebSocket connection for live step updates
export interface WsExtra {
  totalLength?: number;
  stepCount?: number;
  lastTaskBoundary?: {
    mode?: string;
    taskName?: string;
    taskStatus?: string;
    taskSummary?: string;
  };
}

export function connectWs(
  onPush: (cascadeId: string, data: StepsData, active: boolean, status: string, extra?: { totalLength?: number, lastTaskBoundary?: any, workspace?: string }) => void,
  onConn: (connected: boolean) => void,
  onNewSocket?: (ws: WebSocket) => void,
): WebSocket | null {
  if (typeof window === 'undefined') return null;
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  console.log('[WS] Attempting to connect to:', `${proto}//${location.host}/ws`);
  const ws = new WebSocket(`${proto}//${location.host}/ws`);

  if (onNewSocket) onNewSocket(ws);

  ws.onmessage = (e) => {
    try {
      const m = JSON.parse(e.data);
      if (m.type === 'steps' || m.type === 'status') {
        const extra = { 
          totalLength: m.totalLength, 
          lastTaskBoundary: m.lastTaskBoundary,
          workspace: m.workspace 
        };
        onPush(m.cascadeId, m.data || { steps: [] }, m.isActive, m.cascadeStatus, extra);
      }
    } catch { /* ignore */ }
  };

  ws.onerror = (e) => console.error('[WS] Connection error:', e);
  ws.onopen = () => {
    console.log('[WS] Connection successful');
    onConn(true);
  };
  ws.onclose = () => {
    console.warn('[WS] Connection closed, reconnecting in 3s...');
    onConn(false);
    // auto-reconnect
    setTimeout(() => connectWs(onPush, onConn, onNewSocket), 3000);
  };

  return ws;
}
