/**
 * Gateway — shared state and helpers for API routes and WebSocket server.
 * Extracted from the old Express src/index.ts.
 */
import path from 'path';
import { randomBytes } from 'crypto';
import { mkdirSync, existsSync, readdirSync, statSync } from 'fs';
import { homedir } from 'os';

import { discoverLanguageServers, getLanguageServer } from './discovery';
import { getApiKey } from './statedb';
import * as grpc from './grpc';
import { createLogger } from '../logger';
import { getConversations } from './statedb';

const log = createLogger('Gateway');

// Re-export bridge modules for convenience
export { discoverLanguageServers, getLanguageServer } from './discovery';
export { getApiKey, getUserInfo, getWorkspaces, getPlaygrounds, getConversations, addLocalConversation } from './statedb';
export * as grpc from './grpc';

export interface ConvCache { id: string; title: string; workspace: string; mtime: number; steps: number; }
let globalConvCache: ConvCache[] = [];

export async function getDynamicConversations(): Promise<ConvCache[]> {
  const CONVERSATIONS_DIR = path.join(homedir(), '.gemini/antigravity/conversations');
  try {
    const files = readdirSync(CONVERSATIONS_DIR)
      .filter((f: string) => f.endsWith('.pb'))
      .map((f: string) => {
        const id = f.replace('.pb', '');
        const stat = statSync(path.join(CONVERSATIONS_DIR, f));
        return { id, mtime: stat.mtimeMs, size: stat.size };
      })
      .sort((a: any, b: any) => b.mtime - a.mtime);

    await refreshOwnerMap();

    const sqliteConvs = getConversations();
    const sqliteMap = new Map<string, any>();
    sqliteConvs.forEach((c: any) => sqliteMap.set(c.id, c));

    const oldCacheMap = new Map<string, ConvCache>();
    globalConvCache.forEach(c => oldCacheMap.set(c.id, c));

    const conns = await getAllConnections();
    const serverTrajectories = new Map<string, Map<string, any>>();
    for (const conn of conns) {
      try {
        const data = await grpc.getAllCascadeTrajectories(conn.port, conn.csrf);
        const summaries = data?.trajectorySummaries || {};
        serverTrajectories.set(String(conn.port), new Map(Object.entries(summaries)));
      } catch { }
    }

    const results: ConvCache[] = [];

    for (const file of files) {
      let title = '';
      let workspace = '';
      let steps = 0;

      const owner = convOwnerMap.get(file.id);
      if (owner) {
        const ownerTraj = serverTrajectories.get(String(owner.port));
        const live = ownerTraj?.get(file.id);
        if (live) {
          title = live.summary || '';
          if (live.workspaces?.length > 0) {
            workspace = live.workspaces[0].workspaceFolderAbsoluteUri || '';
          }
          steps = live.stepCount || 0;
        }
      }

      if (!title) {
        const lc = oldCacheMap.get(file.id);
        if (lc?.title) { title = lc.title; workspace = workspace || lc.workspace; steps = Math.max(steps, lc.steps); }
      }

      const sqliteEntry = sqliteMap.get(file.id);
      if (!title && sqliteEntry?.title && sqliteEntry.title !== 'Untitled') {
        title = sqliteEntry.title; workspace = workspace || sqliteEntry.workspace || '';
        steps = Math.max(steps, sqliteEntry.steps || 0);
      }

      workspace = workspace || sqliteEntry?.workspace || '';
      results.push({ id: file.id, title: title || `Conversation ${file.id.slice(0, 8)}`, workspace, mtime: file.mtime, steps });
    }

    globalConvCache = results;
    return results;
  } catch (e: any) {
    const defaultConvs = getConversations();
    return defaultConvs.map(c => ({
      id: c.id,
      title: c.title,
      workspace: c.workspace,
      mtime: 0,
      steps: c.stepCount || 0
    }));
  }
}

// --- Helper: get all server connections ---
export async function getAllConnections() {
  const servers = await discoverLanguageServers();
  const apiKey = getApiKey();
  if (!apiKey || servers.length === 0) return [];
  return servers.map(s => ({ ...s, apiKey }));
}

export async function getDefaultConnection() {
  const srv = await getLanguageServer();
  const apiKey = getApiKey();
  if (!srv || !apiKey) return null;
  return { ...srv, apiKey };
}

// --- Conversation → Owner Server Mapping ---
export interface OwnerInfo { port: number; csrf: string; apiKey: string; stepCount: number; workspace?: string; }
export const convOwnerMap = new Map<string, OwnerInfo>();
export let ownerMapAge = 0;

/**
 * Pre-registered owners: conversations manually added by route.ts after creation.
 * These survive refreshOwnerMap() clears because the server's GetAllCascadeTrajectories
 * may take several seconds to include newly created conversations.
 * Each entry has a TTL — after 60s the server should have caught up.
 */
export const preRegisteredOwners = new Map<string, OwnerInfo & { registeredAt: number }>();
const PRE_REG_TTL_MS = 60_000;

/** Pre-register a conversation owner immediately after creation */
export function preRegisterOwner(cascadeId: string, info: OwnerInfo) {
  preRegisteredOwners.set(cascadeId, { ...info, registeredAt: Date.now() });
  convOwnerMap.set(cascadeId, info);
  log.info({ cascadeId: cascadeId.slice(0,8), port: info.port }, 'Pre-registered owner');
}

/**
 * Resolve a potentially short cascade ID (e.g. 'd71eb6d5') to its full UUID
 * by prefix-matching against the convOwnerMap and preRegisteredOwners.
 */
export function resolveFullCascadeId(shortOrFullId: string): string {
  // Already a full UUID (contains dashes and is long enough)
  if (shortOrFullId.includes('-') && shortOrFullId.length > 30) return shortOrFullId;

  // Prefix match against ownerMap keys
  for (const key of convOwnerMap.keys()) {
    if (key.startsWith(shortOrFullId)) return key;
  }
  // Prefix match against pre-registered owners
  for (const key of preRegisteredOwners.keys()) {
    if (key.startsWith(shortOrFullId)) return key;
  }
  return shortOrFullId; // Return as-is if no match found
}

/** Get the owner server connection for a specific conversation */
export async function getOwnerConnection(cascadeId: string) {
  // Auto-resolve short IDs to full UUIDs
  const resolvedId = resolveFullCascadeId(cascadeId);
  
  // 1. Check main ownerMap (populated by refreshOwnerMap)
  const owner = convOwnerMap.get(resolvedId);
  if (owner) {
    log.debug({ cascadeId: cascadeId.slice(0,8), port: owner.port, source: 'ownerMap' }, 'Owner lookup');
    return { ...owner, resolvedCascadeId: resolvedId };
  }
  // 2. Check pre-registered owners (survives refresh cycles)
  const preReg = preRegisteredOwners.get(resolvedId);
  if (preReg && Date.now() - preReg.registeredAt < PRE_REG_TTL_MS) {
    log.debug({ cascadeId: cascadeId.slice(0,8), port: preReg.port, source: 'pre-reg', ageSec: Math.round((Date.now() - preReg.registeredAt)/1000) }, 'Owner lookup');
    return { ...preReg, resolvedCascadeId: resolvedId };
  }
  // 3. Fallback
  const conns = await getAllConnections();
  log.debug({ cascadeId: cascadeId.slice(0,8), serverCount: conns.length, source: 'fallback' }, 'Owner lookup fallback');
  return conns.length > 0 ? { ...conns[0], resolvedCascadeId: resolvedId } : null;
}

/** Refresh the owner map from all servers */
export async function refreshOwnerMap() {
  const conns = await getAllConnections();
  const serverWorkspaceMap = new Map<number, string>();
  const servers = await discoverLanguageServers();
  for (const conn of conns) {
    const srv = servers.find(s => s.port === conn.port);
    if (srv?.workspace) {
      serverWorkspaceMap.set(conn.port, srv.workspace);
    }
  }

  log.info({ serverCount: conns.length, servers: conns.map(c => `${c.port}(${serverWorkspaceMap.get(c.port)?.split('/').pop() || '?'})`).join(', ') }, 'OwnerMap refreshing');

  const wsMatched = new Map<string, OwnerInfo>();
  const scFallback = new Map<string, OwnerInfo>();

  for (const conn of conns) {
    try {
      const data = await grpc.getAllCascadeTrajectories(conn.port, conn.csrf);
      const summaries = data?.trajectorySummaries || {};
      const serverWs = serverWorkspaceMap.get(conn.port) || '';
      const convCount = Object.keys(summaries).length;
      log.debug({ port: conn.port, convCount, serverWs: serverWs.split('/').pop() }, 'Server trajectories loaded');

      for (const [id, info] of Object.entries(summaries) as [string, any][]) {
        const steps = info.stepCount || 0;
        const convWorkspaces: string[] = (info.workspaces || [])
          .map((w: any) => w.workspaceFolderAbsoluteUri || '')
          .filter(Boolean);
          
        const ownerWorkspace = convWorkspaces[0]?.replace('file://', '');
        const ownerEntry: OwnerInfo = { port: conn.port, csrf: conn.csrf, apiKey: conn.apiKey, stepCount: steps, workspace: ownerWorkspace };

        const matched = serverWs && convWorkspaces.some(ws => serverWs.includes(ws) || ws.includes(serverWs));
        if (matched) {
          const existing = wsMatched.get(id);
          if (!existing || steps > existing.stepCount) {
            wsMatched.set(id, ownerEntry);
          }
        }

        const existing = scFallback.get(id);
        if (!existing || steps > existing.stepCount) {
          scFallback.set(id, ownerEntry);
        }
      }
    } catch (e: any) {
      log.warn({ port: conn.port, err: e.message }, 'Failed to get trajectories');
    }
  }

  convOwnerMap.clear();
  const allIds = new Set([...wsMatched.keys(), ...scFallback.keys()]);
  for (const id of allIds) {
    const matched = wsMatched.get(id);
    const fallback = scFallback.get(id);
    if (matched) {
      convOwnerMap.set(id, matched);
    } else if (fallback) {
      convOwnerMap.set(id, fallback);
    }
  }

  // Merge back pre-registered owners that weren't found in server data yet
  const now = Date.now();
  for (const [id, preReg] of preRegisteredOwners.entries()) {
    if (now - preReg.registeredAt > PRE_REG_TTL_MS) {
      preRegisteredOwners.delete(id); // expired
    } else if (!convOwnerMap.has(id)) {
      convOwnerMap.set(id, preReg);
      log.debug({ cascadeId: id.slice(0,8), port: preReg.port, ageSec: Math.round((now - preReg.registeredAt)/1000) }, 'Preserved pre-reg');
    } else {
      // Server caught up, clean pre-registration
      preRegisteredOwners.delete(id);
    }
  }

  ownerMapAge = Date.now();
  log.info({ total: convOwnerMap.size, preRegPending: preRegisteredOwners.size }, 'OwnerMap rebuilt');

  for (const id of allIds) {
    const matched = wsMatched.get(id);
    const fallback = scFallback.get(id);
    if (matched && fallback && matched.port !== fallback.port) {
      log.debug({ cascadeId: id.slice(0,8), matchedPort: matched.port, fallbackPort: fallback.port, fallbackSteps: fallback.stepCount }, 'Owner routed by workspace match');
    }
  }
}

/**
 * Try a gRPC call on ALL servers until one succeeds.
 * Used ONLY for non-conversation-specific calls.
 */
export async function tryAllServers<T>(
  fn: (port: number, csrf: string, apiKey: string) => Promise<T>,
  timeoutMs = 5000
): Promise<T> {
  const conns = await getAllConnections();
  if (conns.length === 0) throw new Error('No language_server found');

  const errors: string[] = [];
  for (const conn of conns) {
    try {
      const result = await Promise.race([
        fn(conn.port, conn.csrf, conn.apiKey),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('timeout')), timeoutMs)
        )
      ]);
      return result;
    } catch (e: any) {
      errors.push(`port ${conn.port}: ${e.message}`);
    }
  }
  throw new Error(`All ${conns.length} servers failed: ${errors.join('; ')}`);
}

// --- Playground name generator ---
const PG_ADJECTIVES = [
  'astral','blazing','celestial','cosmic','crystal','dark','deep','distant',
  'dynamic','ecliptic','ethereal','frozen','galactic','giant','glacial',
  'golden','gravitic','harmonic','icy','inertial','interstellar','ionic',
  'iridescent','kinetic','lunar','nascent','nomad','orbital','polar',
  'prismic','prograde','pyro','radiant','resonant','shining','silent',
  'silver','spinning','stellar','synthetic','temporal','triple','twilight',
  'ultraviolet','vacant','vast','velvet','white','zero',
];
const PG_NOUNS = [
  'aldrin','andromeda','aurora','belt','cassini','chromosphere','copernicus',
  'cosmos','curie','disk','eagle','einstein','expanse','feynman','filament',
  'flare','galaxy','halley','hubble','ionosphere','kuiper','lagoon',
  'magnetar','meteorite','nadir','nebula','newton','oort','orbit','orion',
  'pathfinder','planetoid','planck','prominence','pulsar','radiation',
  'rocket','rosette','singularity','sunspot','supernova','trifid',
  'triangulum','whirlpool','zodiac',
];
const PLAYGROUND_DIR = path.join(homedir(), '.gemini/antigravity/playground');

export function generatePlaygroundName(): string {
  for (let i = 0; i < 50; i++) {
    const adj = PG_ADJECTIVES[randomBytes(1)[0] % PG_ADJECTIVES.length];
    const noun = PG_NOUNS[randomBytes(1)[0] % PG_NOUNS.length];
    const name = `${adj}-${noun}`;
    if (!existsSync(path.join(PLAYGROUND_DIR, name))) return name;
  }
  return `cosmic-${randomBytes(3).toString('hex')}`;
}

export const PLAYGROUND_DIR_PATH = PLAYGROUND_DIR;
