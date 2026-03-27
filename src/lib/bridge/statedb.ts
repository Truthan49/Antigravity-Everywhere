import { execSync } from 'child_process';
import { homedir } from 'os';
import path from 'path';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';

const STATE_DB_PATH = path.join(
  homedir(),
  'Library/Application Support/Antigravity/User/globalStorage/state.vscdb'
);

const BRAIN_DIR = path.join(homedir(), '.gemini/antigravity/brain');
const LOCAL_CACHE_DIR = path.join(process.cwd(), 'data');
const LOCAL_CACHE_FILE = path.join(LOCAL_CACHE_DIR, 'local_conversations.json');
const GLOBAL_SETTINGS_FILE = path.join(LOCAL_CACHE_DIR, 'global-settings.json');

export function getGlobalModel(): string {
  try { return JSON.parse(readFileSync(GLOBAL_SETTINGS_FILE, 'utf-8')).preferredModel || ''; }
  catch { return ''; }
}

export function setGlobalModel(model: string) {
  try {
    mkdirSync(LOCAL_CACHE_DIR, { recursive: true });
    let existing = {};
    try { existing = JSON.parse(readFileSync(GLOBAL_SETTINGS_FILE, 'utf-8')); } catch {}
    writeFileSync(GLOBAL_SETTINGS_FILE, JSON.stringify({ ...existing, preferredModel: model }, null, 2));
  } catch {}
}

export interface ConversationInfo {
  id: string;
  title: string;
  workspace: string;
  stepCount: number;
  createdAt?: string;
}

// --- Local conversation cache ---
function readLocalCache(): ConversationInfo[] {
  try {
    return JSON.parse(readFileSync(LOCAL_CACHE_FILE, 'utf-8'));
  } catch {
    return [];
  }
}

function writeLocalCache(convs: ConversationInfo[]) {
  try {
    mkdirSync(LOCAL_CACHE_DIR, { recursive: true });
    writeFileSync(LOCAL_CACHE_FILE, JSON.stringify(convs, null, 2));
  } catch {}
}

export function addLocalConversation(id: string, workspace: string, title: string = 'New conversation') {
  const cache = readLocalCache();
  if (cache.some(c => c.id === id)) return;
  cache.unshift({ id, title, workspace, stepCount: 0, createdAt: new Date().toISOString() });
  writeLocalCache(cache);
}

export function updateLocalConversationTitle(id: string, title: string) {
  const cache = readLocalCache();
  const conv = cache.find(c => c.id === id);
  if (conv) {
    conv.title = title;
    writeLocalCache(cache);
  }
}

function queryDb(sql: string): string {
  try {
    return execSync(`sqlite3 "${STATE_DB_PATH}" "${sql}"`, {
      encoding: 'utf-8',
      timeout: 5000
    }).trim();
  } catch {
    return '';
  }
}

export function getApiKey(): string {
  const raw = queryDb("SELECT value FROM ItemTable WHERE key='antigravityAuthStatus';");
  if (!raw) return '';
  try { return JSON.parse(raw).apiKey || ''; } catch { return ''; }
}

export function getUserInfo(): { name: string; email: string; apiKey: string } {
  const raw = queryDb("SELECT value FROM ItemTable WHERE key='antigravityAuthStatus';");
  if (!raw) return { name: '', email: '', apiKey: '' };
  try {
    const data = JSON.parse(raw);
    return { name: data.name || '', email: data.email || '', apiKey: data.apiKey || '' };
  } catch { return { name: '', email: '', apiKey: '' }; }
}

export function getWorkspaces(): Array<{ type: 'folder' | 'workspace'; uri: string }> {
  const raw = queryDb("SELECT value FROM ItemTable WHERE key='history.recentlyOpenedPathsList';");
  if (!raw) return [];
  try {
    const data = JSON.parse(raw);
    const { existsSync } = require('fs');
    return (data.entries || []).map((e: any) => {
      if (e.folderUri) return { type: 'folder' as const, uri: e.folderUri };
      if (e.workspace) return { type: 'workspace' as const, uri: e.workspace.configPath };
      return null;
    }).filter((entry: any) => {
      if (!entry) return false;
      // Check if the directory still exists on disk
      try {
        const fsPath = entry.uri.replace(/^file:\/\//, '');
        return existsSync(decodeURIComponent(fsPath));
      } catch {
        return false;
      }
    });
  } catch { return []; }
}

export function getPlaygrounds(): string[] {
  const playgroundDir = path.join(homedir(), '.gemini/antigravity/playground');
  try {
    const output = execSync(`ls -1 "${playgroundDir}" 2>/dev/null`, { encoding: 'utf-8' });
    return output.trim().split('\n').filter(Boolean).map(name =>
      `file://${path.join(playgroundDir, name)}`
    );
  } catch { return []; }
}

/**
 * Get comprehensive conversation list by merging (priority order):
 * 1. Conversation .pb files (~/.gemini/antigravity/conversations/) — ALWAYS current, primary IDs
 * 2. SQLite trajectorySummaries — for titles + workspace metadata
 * 3. Brain directory scan — for task.md/walkthrough.md titles
 * 4. Local cache — for newly created conversations
 */
export function getConversations(): ConversationInfo[] {
  const convMap = new Map<string, ConversationInfo>();

  // Step 1: Scan .pb conversation files (primary source — always up-to-date)
  const CONV_DIR = path.join(homedir(), '.gemini/antigravity/conversations');
  try {
    // Get all .pb files sorted by modification time (newest first)
    const output = execSync(`ls -1t "${CONV_DIR}" 2>/dev/null`, {
      encoding: 'utf-8', timeout: 5000
    });
    const files = output.trim().split('\n').filter(f => f.endsWith('.pb'));
    for (const file of files) {
      const id = file.replace('.pb', '');
      if (id && id.includes('-') && id.length > 30) {
        let mtimeStr = '';
        try { mtimeStr = new Date(require('fs').statSync(path.join(CONV_DIR, file)).mtime).toISOString(); } catch {}
        convMap.set(id, {
          id,
          title: '', // Will be enriched below
          workspace: '',
          stepCount: 0,
          createdAt: mtimeStr
        });
      }
    }
  } catch {}

  // Step 2: Enrich with SQLite protobuf data (titles + workspace)
  const protoConvs = getConversationsFromProtobuf();
  for (const pc of protoConvs) {
    const existing = convMap.get(pc.id);
    if (existing) {
      // Enrich existing .pb entry with title/workspace from SQLite
      if (pc.title) existing.title = pc.title;
      if (pc.workspace) existing.workspace = pc.workspace;
      if (pc.stepCount) existing.stepCount = pc.stepCount;
    } else {
      // Conversation in SQLite but not in .pb dir (shouldn't happen, but include it)
      convMap.set(pc.id, pc);
    }
  }

  // Step 3: Merge local cache (newly created conversations or renamed ones)
  const localConvs = readLocalCache();
  for (const lc of localConvs) {
    const existing = convMap.get(lc.id);
    if (existing) {
      if (lc.title) existing.title = lc.title; // Local title overrides SQLite
      if (lc.workspace) existing.workspace = lc.workspace;
    } else {
      convMap.set(lc.id, lc);
    }
  }

  // Step 4: Scan brain directory for titles (task.md / walkthrough.md)
  try {
    const output = execSync(`ls -1t "${BRAIN_DIR}" 2>/dev/null`, {
      encoding: 'utf-8', timeout: 5000
    });
    const dirs = output.trim().split('\n').filter(d =>
      d && d.includes('-') && d.length > 30 && d !== 'tempmediaStorage'
    );

    for (const dir of dirs) {
      const existing = convMap.get(dir);
      if (existing && !existing.title) {
        // Try to get title from brain artifacts
        try {
          const taskMd = execSync(`head -3 "${path.join(BRAIN_DIR, dir, 'task.md')}" 2>/dev/null`, {
            encoding: 'utf-8', timeout: 1000
          }).trim();
          existing.title = taskMd.replace(/^#\s*/, '').split('\n')[0].trim();
        } catch {
          try {
            const wt = execSync(`head -3 "${path.join(BRAIN_DIR, dir, 'walkthrough.md')}" 2>/dev/null`, {
              encoding: 'utf-8', timeout: 1000
            }).trim();
            existing.title = wt.replace(/^#\s*/, '').split('\n')[0].trim();
          } catch {}
        }
      } else if (!existing) {
        // Conversation exists in brain but not in .pb dir
        let title = '';
        try {
          const taskMd = execSync(`head -3 "${path.join(BRAIN_DIR, dir, 'task.md')}" 2>/dev/null`, {
            encoding: 'utf-8', timeout: 1000
          }).trim();
          title = taskMd.replace(/^#\s*/, '').split('\n')[0].trim();
        } catch {
          try {
            const wt = execSync(`head -3 "${path.join(BRAIN_DIR, dir, 'walkthrough.md')}" 2>/dev/null`, {
              encoding: 'utf-8', timeout: 1000
            }).trim();
            title = wt.replace(/^#\s*/, '').split('\n')[0].trim();
          } catch {}
        }
        convMap.set(dir, { id: dir, title: title || '', workspace: '', stepCount: 0 });
      }
    }
  } catch {}

  // Step 5: Generate fallback titles for any without one
  for (const [id, conv] of convMap) {
    if (!conv.title) {
      conv.title = `Conversation ${id.slice(0, 8)}`;
    }
  }

  return Array.from(convMap.values());
}

function getConversationsFromProtobuf(): Array<{ id: string; title: string; workspace: string; stepCount: number }> {
  try {
    const script = `
import sqlite3, base64, json, os
import blackboxprotobuf

db = sqlite3.connect(os.path.expanduser("~/Library/Application Support/Antigravity/User/globalStorage/state.vscdb"))
raw = db.execute("SELECT value FROM ItemTable WHERE key='antigravityUnifiedStateSync.trajectorySummaries';").fetchone()
if not raw or not raw[0]:
    print("[]")
    exit()

decoded = base64.b64decode(raw[0])
msg, _ = blackboxprotobuf.decode_message(decoded)
trajectories = msg.get("1", [])
if not isinstance(trajectories, list):
    trajectories = [trajectories]

result = []
for t in trajectories:
    cid = t.get("1", b"")
    if isinstance(cid, bytes): cid = cid.decode()
    else: cid = str(cid)

    title = ""
    workspace = ""
    step_count = 0

    inner = t.get("2", {})
    inner_b64 = inner.get("1", b"")
    if isinstance(inner_b64, bytes): inner_b64 = inner_b64.decode()

    try:
        ib = base64.b64decode(inner_b64)
        im, _ = blackboxprotobuf.decode_message(ib)
        rt = im.get("1", b"")
        if isinstance(rt, bytes): title = rt.decode('utf-8', errors='replace')
        else: title = str(rt)
        sc = im.get("2", 0)
        if isinstance(sc, (int, float)): step_count = int(sc)
        ws9 = im.get("9", {})
        ws17 = im.get("17", {})
        if isinstance(ws9, dict):
            w = ws9.get("1", b"")
            if isinstance(w, bytes): workspace = w.decode('utf-8', errors='replace')
            elif isinstance(w, dict):
                ww = w.get("1", b"")
                if isinstance(ww, bytes): workspace = ww.decode('utf-8', errors='replace')
        if not workspace and isinstance(ws17, dict):
            w = ws17.get("7", b"")
            if isinstance(w, bytes): workspace = w.decode('utf-8', errors='replace')
            elif isinstance(w, str): workspace = w
            if not workspace:
                w1 = ws17.get("1", {})
                if isinstance(w1, dict):
                    ww = w1.get("1", b"")
                    if isinstance(ww, bytes): workspace = ww.decode('utf-8', errors='replace')
    except:
        pass
    result.append({"id": cid, "title": title, "workspace": workspace, "stepCount": step_count})
db.close()
print(json.dumps(result, ensure_ascii=False))
`;
    const output = execSync(`python3 -c '${script.replace(/'/g, "'\\''")}'`, {
      encoding: 'utf-8',
      timeout: 15000
    });
    return JSON.parse(output.trim());
  } catch {
    return [];
  }
}
