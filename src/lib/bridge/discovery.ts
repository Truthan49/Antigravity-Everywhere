import { exec } from 'child_process';
import { promisify } from 'util';
import { existsSync } from 'fs';
import { createLogger } from '../logger';

const execAsync = promisify(exec);

const log = createLogger('Discovery');

export interface LanguageServerInfo {
  pid: number;
  port: number;
  csrf: string;
  workspace?: string;
}

// Cache to avoid running ps aux + lsof on every single API request
let _cachedServers: LanguageServerInfo[] = [];
let _cacheTime = 0;
const CACHE_TTL_MS = 3000; // 3 seconds

/**
 * Decode Antigravity's workspace_id back to a real file:// URI.
 *
 * Antigravity encodes workspace paths by replacing BOTH `/` and `-` with `_`.
 * e.g. `/path/to/my-project-name`
 *    → `file_path_to_my_project_name`
 *
 * Naive `replace(/_/g, '/')` is WRONG because it can't distinguish separator `_`
 * from hyphens. We greedily resolve against the filesystem instead.
 */
function decodeWorkspaceId(wsId: string): string | undefined {
  // Non-file workspaces (e.g. untitled_xxx) — return as-is
  if (!wsId.startsWith('file_')) return wsId;

  const encoded = wsId.slice(5); // Strip 'file_' prefix → "path_to_my_project_name"
  const parts = encoded.split('_');

  let resolvedPath = '/';
  let i = 0;

  while (i < parts.length) {
    let found = false;

    // Try combining an increasing number of parts to form one path segment.
    // For each candidate, check if it exists on the filesystem with `-` or `_` as joiner.
    for (let len = 1; len <= parts.length - i; len++) {
      const subparts = parts.slice(i, i + len);
      const candidates: string[] = [];

      if (len === 1) {
        candidates.push(subparts[0]);
      } else {
        // Most directory/file names use one consistent separator.
        // Try hyphen-joined first (common in project names), then underscore-joined.
        candidates.push(subparts.join('-'));
        candidates.push(subparts.join('_'));
      }

      for (const candidate of candidates) {
        const testPath = resolvedPath + candidate;
        if (existsSync(testPath)) {
          resolvedPath = testPath + '/';
          i += len;
          found = true;
          break;
        }
      }
      if (found) break;
    }

    if (!found) {
      // Filesystem validation failed — fall back to treating remaining `_` as `/`
      resolvedPath += parts.slice(i).join('/');
      break;
    }
  }

  return 'file://' + resolvedPath.replace(/\/$/, '');
}

/**
 * Discover all running language_server instances with their ports and CSRF tokens.
 * Results are cached for 3 seconds to avoid expensive shell commands on every request.
 */
export async function discoverLanguageServers(): Promise<LanguageServerInfo[]> {
  if (Date.now() - _cacheTime < CACHE_TTL_MS && _cachedServers.length > 0) {
    return _cachedServers;
  }

  const servers: LanguageServerInfo[] = [];

  try {
    // Step 1: Get all language_server processes with their CSRF tokens + workspace
    let psOutput = '';
    try {
      const psRes = await execAsync('ps aux', { encoding: 'utf-8', timeout: 5000 });
      psOutput = psRes.stdout;
    } catch {}
    
    const psLines = psOutput.split('\n').filter(l => l.includes('language_server') && l.includes('--csrf_token'));

    // Step 2: Get all TCP LISTEN ports globally (once, not per-PID)
    let lsofOutput = '';
    try {
      const lsofRes = await execAsync('lsof -iTCP -sTCP:LISTEN -P -n 2>/dev/null', { encoding: 'utf-8', timeout: 10000 });
      lsofOutput = lsofRes.stdout;
    } catch {}

    for (const line of psLines) {
      const pidMatch = line.match(/^\S+\s+(\d+)/);
      const csrfMatch = line.match(/--csrf_token[=\s]+(\S+)/);
      if (!pidMatch || !csrfMatch) continue;

      const pid = parseInt(pidMatch[1]);
      const csrf = csrfMatch[1];

      // Find the first LISTEN port for this specific PID from lsof
      let port = 0;
      const pidRegex = new RegExp(`^language_\\S*\\s+${pid}\\s+.*:(\\d{4,5})\\s+\\(LISTEN\\)`, 'm');
      const portMatch = lsofOutput.match(pidRegex);
      if (portMatch) {
        port = parseInt(portMatch[1]);
      }

      if (port === 0) continue;

      // Extract and decode workspace ID from args
      const wsMatch = line.match(/--workspace_id[=\s]+(\S+)/);
      const workspace = wsMatch?.[1] ? decodeWorkspaceId(wsMatch[1]) : undefined;

      servers.push({ pid, port, csrf, workspace });
    }
  } catch { /* ps failed */ }

  if (servers.length !== _cachedServers.length || servers.some((s, i) => s.port !== _cachedServers[i]?.port)) {
    log.info({ count: servers.length, servers: servers.map(s => `pid=${s.pid} port=${s.port} ws="${s.workspace}"`).join(' | ') }, 'Servers discovered');
  }

  _cachedServers = servers;
  _cacheTime = Date.now();
  return servers;
}

/**
 * Get the first available language_server, or one matching a workspace path.
 */
export async function getLanguageServer(workspacePath?: string): Promise<LanguageServerInfo | null> {
  const servers = await discoverLanguageServers();
  if (servers.length === 0) return null;

  if (workspacePath) {
    // Exact match first
    const exact = servers.find(s => s.workspace === workspacePath);
    if (exact) {
      log.debug({ workspacePath, port: exact.port }, 'Exact workspace match');
      return exact;
    }

    // Partial match (one contains the other)  
    const partial = servers.find(s =>
      s.workspace?.includes(workspacePath) || workspacePath.includes(s.workspace || '\0')
    );
    if (partial) {
      log.debug({ workspacePath, port: partial.port, serverWs: partial.workspace }, 'Partial workspace match');
      return partial;
    }

    log.debug({ workspacePath, fallbackPort: servers[0].port, fallbackWs: servers[0].workspace }, 'No workspace match, using fallback');
  }

  return servers[0];
}
