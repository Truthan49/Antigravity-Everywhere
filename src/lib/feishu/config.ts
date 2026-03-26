import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { homedir } from 'os';

const CONFIG_PATH = join(homedir(), '.gemini', 'antigravity', 'feishu-config.json');
const WS_BOT_DIR = join(homedir(), '.gemini', 'antigravity', 'workspace-bots');

export interface FeishuConfig {
  appId: string;
  appSecret: string;
}

export interface WorkspaceBotConfig extends FeishuConfig {
  workspaceUri: string;   // e.g. "file:///Users/hanyi/Projects/MyApp"
  label?: string;         // friendly name, e.g. "前端专属机器人"
  preferredModel?: string; // e.g. "MODEL_PLACEHOLDER_M26" — overrides global default for this bot
  enabled: boolean;
}

export interface AllBotsConfig {
  global: FeishuConfig;
  workspaceBots: WorkspaceBotConfig[];
}

// --- Global config (backward compat) ---
export const feishuConfigStore = {
  get(): FeishuConfig {
    try {
      if (!existsSync(CONFIG_PATH)) {
        return { appId: '', appSecret: '' };
      }
      return JSON.parse(readFileSync(CONFIG_PATH, 'utf-8'));
    } catch {
      return { appId: '', appSecret: '' };
    }
  },

  set(config: FeishuConfig) {
    try {
      mkdirSync(dirname(CONFIG_PATH), { recursive: true });
      writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8');
    } catch (e) {
      console.error('Failed to save feishu config', e);
    }
  }
};

// --- Workspace-level bot configs ---
function getWsBotsPath() {
  return join(WS_BOT_DIR, 'bots.json');
}

export const workspaceBotStore = {
  /** Get all workspace bot configs */
  getAll(): WorkspaceBotConfig[] {
    try {
      const p = getWsBotsPath();
      if (!existsSync(p)) return [];
      return JSON.parse(readFileSync(p, 'utf-8'));
    } catch {
      return [];
    }
  },

  /** Save entire list */
  saveAll(bots: WorkspaceBotConfig[]) {
    try {
      mkdirSync(WS_BOT_DIR, { recursive: true });
      writeFileSync(getWsBotsPath(), JSON.stringify(bots, null, 2), 'utf-8');
    } catch (e) {
      console.error('Failed to save workspace bots', e);
    }
  },

  /** Upsert a bot config keyed by appId (allows multiple bots per workspace) */
  upsert(config: WorkspaceBotConfig) {
    const bots = this.getAll();
    const idx = bots.findIndex(b => b.appId === config.appId);
    if (idx >= 0) {
      bots[idx] = config;
    } else {
      bots.push(config);
    }
    this.saveAll(bots);
  },

  /** Remove bot config by appId */
  remove(appId: string) {
    const bots = this.getAll().filter(b => b.appId !== appId);
    this.saveAll(bots);
  },

  /** Get all bot configs for a specific workspace */
  getAllByWorkspace(workspaceUri: string): WorkspaceBotConfig[] {
    return this.getAll().filter(b => b.workspaceUri === workspaceUri && b.enabled);
  },

  /** Get first bot config for a specific workspace */
  getByWorkspace(workspaceUri: string): WorkspaceBotConfig | undefined {
    return this.getAll().find(b => b.workspaceUri === workspaceUri);
  },

  /** Lookup bot by appId */
  getByAppId(appId: string): WorkspaceBotConfig | undefined {
    return this.getAll().find(b => b.appId === appId);
  }
};
