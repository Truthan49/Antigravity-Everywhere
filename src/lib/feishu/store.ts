import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { homedir } from 'os';

const STORE_PATH = join(homedir(), '.gemini', 'antigravity', 'feishu-chats.json');

export type ChatState = 'idle' | 'selecting_workspace' | 'selecting_history' | 'selecting_workspace_history' | 'selecting_model' | 'selecting_delegation';

export interface FeishuUserSession {
  activeCascadeId?: string;
  state: ChatState;
  workspacesCache?: string[]; // Temp cache for numbered selection
  historyCache?: string[];    // Temp cache for numbered selection
  modelsCache?: string[];     // Temp cache for model selection
  preferredModel?: string;    // User's globally preferred model ID
  unionId?: string;           // User's cross-app union ID
  pendingWorkspaceUri?: string; // Cache for delegation flow
  botAppId?: string;          // Application ID of the bot handling this session
}

export const feishuStore = {
  load(): Record<string, FeishuUserSession> {
    try {
      if (!existsSync(STORE_PATH)) return {};
      return JSON.parse(readFileSync(STORE_PATH, 'utf-8'));
    } catch {
      return {};
    }
  },

  save(data: Record<string, FeishuUserSession>) {
    try {
      mkdirSync(dirname(STORE_PATH), { recursive: true });
      writeFileSync(STORE_PATH, JSON.stringify(data, null, 2), 'utf-8');
    } catch (e) {
      console.error('Failed to save feishu store', e);
    }
  },

  getSession(openId: string): FeishuUserSession {
    const data = this.load();
    return data[openId] || { state: 'idle' };
  },

  updateSession(openId: string, session: Partial<FeishuUserSession>) {
    const data = this.load();
    data[openId] = { ...(data[openId] || { state: 'idle' }), ...session };
    this.save(data);
  }
};
