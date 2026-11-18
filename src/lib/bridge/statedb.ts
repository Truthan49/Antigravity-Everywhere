import { execSync } from 'child_process';
import { homedir } from 'os';
import path from 'path';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'fs';

const STATE_DB_PATH = process.platform === 'win32'
  ? path.join(process.env.APPDATA || path.join(homedir(), 'AppData', 'Roaming'), 'Antigravity/User/globalStorage/state.vscdb')
  : path.join(homedir(), 'Library/Application Support/Antigravity/User/globalStorage/state.vscdb');

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

export interface SummaryDbEntry {
  id: string;
  title: string;
  preview: string;
  workspace: string;
  stepCount: number;
  mtimeMs: number;
  killed: boolean;
  parentId: string;
}

export function normalizeWorkspaceUri(uri: string): string {
  if (!uri) return '';
  return uri
    .replace(/^file:\/\/\/([a-zA-Z])(?:%3[Aa]|:)(?:%5[Cc]|\\|\/)/, (_m, drive: string) => `file:///${drive.toLowerCase()}:/`)
    .replace(/%5[Cc]|\\/g, '/');
}

export function isPlaceholderTitle(title?: string): boolean {
  if (!title) return true;
  const t = title.trim();
  if (!t) return true;
  return (
    t === 'Untitled' ||
    t === 'New conversation' ||
    t === '来自飞书的新对话' ||
    t === '新对话' ||
    t.startsWith('New: ') ||
    t.startsWith('Playground: ') ||
    t.startsWith('来自 ') ||
    t.startsWith('Conversation ')
  );
}

function parseSummaryTimestamp(ts?: string): number {
  if (!ts || ts.startsWith('0001-01-01')) return 0;
  const normalized = ts.includes('T') ? ts : ts.replace(' ', 'T');
  const parsed = Date.parse(normalized);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

const SUMMARIES_DB_PATH = path.join(homedir(), '.gemini/antigravity/conversation_summaries.db');

export function readConversationSummariesDb(): SummaryDbEntry[] {
  if (!existsSync(SUMMARIES_DB_PATH)) return [];

  const mapRows = (rows: any[]): SummaryDbEntry[] =>
    rows.map((r) => {
      let workspace = '';
      if (r.workspace_uris) {
        try {
          const parsed = JSON.parse(r.workspace_uris);
          if (Array.isArray(parsed) && parsed.length > 0 && typeof parsed[0] === 'string') {
            workspace = normalizeWorkspaceUri(parsed[0]);
          }
        } catch {}
      }
      return {
        id: String(r.conversation_id || ''),
        title: String(r.title || ''),
        preview: String(r.preview || ''),
        workspace,
        stepCount: Number(r.step_count || 0),
        mtimeMs: parseSummaryTimestamp(r.last_modified_time),
        killed: Boolean(r.killed),
        parentId: String(r.parent_conversation_id || ''),
      };
    }).filter((r) => Boolean(r.id));

  try {
    const req = eval('require');
    const sqlite = req('node:sqlite');
    if (sqlite?.DatabaseSync) {
      const db = new sqlite.DatabaseSync(SUMMARIES_DB_PATH, { readOnly: true });
      try {
        const rows = db.prepare(
          'SELECT conversation_id, title, preview, step_count, last_modified_time, workspace_uris, parent_conversation_id, killed FROM conversation_summaries ORDER BY last_modified_time DESC'
        ).all();
        return mapRows(rows);
      } finally {
        db.close();
      }
    }
  } catch {}

  const pyScript = [
    'import sqlite3, json, sys',
    'conn = sqlite3.connect(sys.argv[1])',
    'conn.row_factory = sqlite3.Row',
    'rows = conn.execute("SELECT conversation_id, title, preview, step_count, last_modified_time, workspace_uris, parent_conversation_id, killed FROM conversation_summaries ORDER BY last_modified_time DESC").fetchall()',
    'print(json.dumps([dict(r) for r in rows], ensure_ascii=False))',
    'conn.close()',
  ].join('\n');

  for (const pyBin of process.platform === 'win32' ? ['python', 'python3'] : ['python3', 'python']) {
    try {
      const { execFileSync } = eval('require')('child_process');
      const output = execFileSync(pyBin, ['-c', pyScript, SUMMARIES_DB_PATH], {
        encoding: 'utf-8',
        timeout: 5000,
      });
      return mapRows(JSON.parse(output.trim() || '[]'));
    } catch {}
  }

  return [];
}

// --- Local conversation cache ---
export function readLocalCache(): ConversationInfo[] {
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

export function removeLocalConversations(ids: string[]) {
  const idSet = new Set(ids);
  const cache = readLocalCache();
  const next = cache.filter(c => !idSet.has(c.id));
  if (next.length !== cache.length) {
    writeLocalCache(next);
  }
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
  if (!existsSync(STATE_DB_PATH)) return '';
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
  if (!raw) return 'gateway';
  try { return JSON.parse(raw).apiKey || 'gateway'; } catch { return 'gateway'; }
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
        let fsPath = decodeURIComponent(entry.uri.replace(/^file:\/\//, ''));
        if (process.platform === 'win32' && /^\/[a-zA-Z]:/.test(fsPath)) {
          fsPath = fsPath.slice(1);
        }
        return existsSync(fsPath);
      } catch {
        return false;
      }
    });
  } catch { return []; }
}

export function getPlaygrounds(): string[] {
  const playgroundDir = path.join(homedir(), '.gemini/antigravity/playground');
  try {
    if (!existsSync(playgroundDir)) return [];
    const names = readdirSync(playgroundDir);
    return names.filter(Boolean).map(name => {
      const full = path.join(playgroundDir, name).replace(/\\/g, '/');
      return full.startsWith('/') ? `file://${full}` : `file:///${full}`;
    });
  } catch { return []; }
}

/**
 * Get comprehensive conversation list by merging (priority order):
 * 1. Conversation .pb / .db files (~/.gemini/antigravity/conversations/)
 * 2. Antigravity 2.0 conversation_summaries.db (titles, previews, workspaces, mtime)
 * 3. Legacy SQLite state.vscdb trajectorySummaries (Antigravity 1.x)
 * 4. Local cache — for newly created conversations
 * 5. Brain directory scan — fallback task.md/walkthrough.md titles
 */
export function getConversations(): ConversationInfo[] {
  const convMap = new Map<string, ConversationInfo>();
  const killedIds = new Set<string>();

  // Step 1: Scan .pb and .db conversation files
  const CONV_DIR = path.join(homedir(), '.gemini/antigravity/conversations');
  try {
    if (existsSync(CONV_DIR)) {
      const files = readdirSync(CONV_DIR)
        .filter(f => f.endsWith('.pb') || f.endsWith('.db'))
        .map(f => ({ f, mtimeMs: statSync(path.join(CONV_DIR, f)).mtimeMs }))
        .sort((a, b) => b.mtimeMs - a.mtimeMs);
      for (const { f: file, mtimeMs } of files) {
        const id = file.replace(/\.(pb|db)$/, '');
        if (id && id.includes('-') && id.length > 30 && !convMap.has(id)) {
          convMap.set(id, {
            id,
            title: '', // Will be enriched below
            workspace: '',
            stepCount: 0,
            createdAt: new Date(mtimeMs).toISOString()
          });
        }
      }
    }
  } catch {}

  // Step 2: Enrich from Antigravity 2.0 conversation_summaries.db
  const summaryRows = readConversationSummariesDb();
  for (const sr of summaryRows) {
    if (sr.killed || sr.parentId) {
      killedIds.add(sr.id);
      convMap.delete(sr.id);
      continue;
    }
    const resolvedTitle = sr.title || sr.preview || '';
    const existing = convMap.get(sr.id);
    if (existing) {
      if (resolvedTitle) existing.title = resolvedTitle;
      if (sr.workspace) existing.workspace = sr.workspace;
      if (sr.stepCount > existing.stepCount) existing.stepCount = sr.stepCount;
      if (sr.mtimeMs > 0) existing.createdAt = new Date(sr.mtimeMs).toISOString();
    } else {
      convMap.set(sr.id, {
        id: sr.id,
        title: resolvedTitle,
        workspace: sr.workspace,
        stepCount: sr.stepCount,
        createdAt: sr.mtimeMs > 0 ? new Date(sr.mtimeMs).toISOString() : undefined,
      });
    }
  }

  // Step 3: Enrich with legacy SQLite protobuf data (if state.vscdb exists)
  const protoConvs = getConversationsFromProtobuf();
  for (const pc of protoConvs) {
    if (killedIds.has(pc.id)) continue;
    const existing = convMap.get(pc.id);
    if (existing) {
      if (pc.title && isPlaceholderTitle(existing.title)) existing.title = pc.title;
      if (pc.workspace && !existing.workspace) existing.workspace = normalizeWorkspaceUri(pc.workspace);
      if (pc.stepCount > existing.stepCount) existing.stepCount = pc.stepCount;
    } else {
      convMap.set(pc.id, { ...pc, workspace: normalizeWorkspaceUri(pc.workspace) });
    }
  }

  // Step 4: Merge local cache (newly created conversations or renamed ones)
  const localConvs = readLocalCache();
  for (const lc of localConvs) {
    const existing = convMap.get(lc.id);
    if (existing) {
      if (lc.title && !isPlaceholderTitle(lc.title)) existing.title = lc.title;
      else if (lc.title && isPlaceholderTitle(existing.title)) existing.title = lc.title;
      if (lc.workspace && !existing.workspace) existing.workspace = normalizeWorkspaceUri(lc.workspace);
    } else {
      convMap.set(lc.id, { ...lc, workspace: normalizeWorkspaceUri(lc.workspace || '') });
    }
  }

  // Step 5: Scan brain directory for titles (task.md / walkthrough.md)
  try {
    if (existsSync(BRAIN_DIR)) {
      const dirs = readdirSync(BRAIN_DIR)
        .filter(d => d && d.includes('-') && d.length > 30 && d !== 'tempmediaStorage')
        .map(d => ({ d, mtimeMs: statSync(path.join(BRAIN_DIR, d)).mtimeMs }))
        .sort((a, b) => b.mtimeMs - a.mtimeMs)
        .map(x => x.d);

      const readBrainTitle = (dir: string): string => {
        for (const fname of ['task.md', 'walkthrough.md']) {
          const p = path.join(BRAIN_DIR, dir, fname);
          if (existsSync(p)) {
            try {
              const firstLine = readFileSync(p, 'utf-8').split('\n').slice(0, 3).join('\n').trim();
              if (firstLine) return firstLine.replace(/^#\s*/, '').split('\n')[0].trim();
            } catch {}
          }
        }
        return '';
      };

      for (const dir of dirs) {
        if (killedIds.has(dir)) continue;
        const existing = convMap.get(dir);
        if (existing && isPlaceholderTitle(existing.title)) {
          const bt = readBrainTitle(dir);
          if (bt) existing.title = bt;
        } else if (!existing) {
          convMap.set(dir, { id: dir, title: readBrainTitle(dir), workspace: '', stepCount: 0 });
        }
      }
    }
  } catch {}

  // Step 6: Generate fallback titles for any without one
  for (const [id, conv] of convMap) {
    if (!conv.title) {
      conv.title = `Conversation ${id.slice(0, 8)}`;
    }
  }

  return Array.from(convMap.values());
}

function getConversationsFromProtobuf(): Array<{ id: string; title: string; workspace: string; stepCount: number }> {
  if (!existsSync(STATE_DB_PATH)) return [];
  try {
    const script = `
import sqlite3, base64, json, sys
import blackboxprotobuf

db = sqlite3.connect(sys.argv[1])
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
    const pyBin = process.platform === 'win32' ? 'python' : 'python3';
    const { execFileSync } = eval('require')('child_process');
    const output = execFileSync(pyBin, ['-c', script, STATE_DB_PATH], {
      encoding: 'utf-8',
      timeout: 15000
    });
    return JSON.parse(output.trim());
  } catch {
    return [];
  }
}
