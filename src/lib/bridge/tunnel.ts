/**
 * Cloudflare Named Tunnel Manager
 *
 * Manages a persistent Cloudflare tunnel with a stable URL.
 * Config persisted at ~/.gemini/antigravity/tunnel_config.json
 *
 * One-time setup:
 *   1. brew install cloudflared
 *   2. cloudflared tunnel login
 *   3. cloudflared tunnel create antigravity-gateway
 *   4. cloudflared tunnel route dns antigravity-gateway <subdomain.yourdomain.com>
 */

import { spawn, ChildProcess } from 'child_process';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { createLogger } from '../logger';

const log = createLogger('Tunnel');

const CONFIG_DIR = join(homedir(), '.gemini', 'antigravity');
const CONFIG_PATH = join(CONFIG_DIR, 'tunnel_config.json');

export interface TunnelConfig {
  tunnelName: string;
  url: string;
  credentialsPath?: string;
  autoStart?: boolean;
}

export function loadTunnelConfig(): TunnelConfig | null {
  try {
    if (!existsSync(CONFIG_PATH)) return null;
    const raw = readFileSync(CONFIG_PATH, 'utf-8');
    if (!raw.trim()) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function saveTunnelConfig(config: TunnelConfig): void {
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8');
}

let tunnelProcess: ChildProcess | null = null;
let tunnelRunning = false;
let tunnelStarting = false;
let tunnelError: string | null = null;

export function startTunnel(port: number, timeoutMs = 30000): Promise<{ success: boolean; url?: string; error?: string }> {
  return new Promise((resolve) => {
    if (tunnelProcess) {
      const config = loadTunnelConfig();
      return resolve({ success: false, error: 'Tunnel already running', url: config?.url });
    }

    const config = loadTunnelConfig();
    if (!config?.tunnelName) {
      return resolve({ success: false, error: 'Tunnel not configured. POST /api/tunnel/config first.' });
    }

    tunnelStarting = true;
    tunnelRunning = false;
    tunnelError = null;

    const args: string[] = [];
    if (config.credentialsPath) {
      args.push('--credentials-file', config.credentialsPath.replace(/^~/, homedir()));
    }
    args.push('tunnel', 'run', config.tunnelName);

    try {
      tunnelProcess = spawn('cloudflared', args, {
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch {
      tunnelStarting = false;
      tunnelError = 'cloudflared not found. Install: brew install cloudflared';
      return resolve({ success: false, error: tunnelError });
    }

    let resolved = false;

    const timer = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        tunnelStarting = false;
        if (tunnelProcess && !tunnelProcess.killed) {
          tunnelRunning = true;
          tunnelError = null;
          log.info({ url: config.url }, 'Tunnel started');
          resolve({ success: true, url: config.url });
        } else {
          tunnelError = 'Timed out waiting for tunnel';
          resolve({ success: false, error: tunnelError });
        }
      }
    }, timeoutMs);

    const handleOutput = (data: Buffer) => {
      const text = data.toString();
      const connected = text.includes('Registered tunnel connection') ||
                        (text.includes('Connection') && text.includes('registered'));

      if (connected && !resolved) {
        resolved = true;
        tunnelStarting = false;
        tunnelRunning = true;
        tunnelError = null;
        clearTimeout(timer);
        log.info({ url: config.url }, 'Tunnel active');
        resolve({ success: true, url: config.url });
      }

      if (!resolved && (text.includes('tunnel not found') || text.includes('unauthorized'))) {
        resolved = true;
        tunnelStarting = false;
        tunnelError = text.split('\n').find(l => l.includes('ERR') || l.includes('error'))?.trim() || 'Tunnel error';
        clearTimeout(timer);
        resolve({ success: false, error: tunnelError });
      }
    };

    tunnelProcess.stdout?.on('data', handleOutput);
    tunnelProcess.stderr?.on('data', handleOutput);

    tunnelProcess.on('error', (err: any) => {
      tunnelStarting = false;
      tunnelRunning = false;
      tunnelError = err.code === 'ENOENT'
        ? 'cloudflared not found. Install: brew install cloudflared'
        : `Tunnel error: ${err.message}`;
      tunnelProcess = null;
      if (!resolved) {
        resolved = true;
        clearTimeout(timer);
        resolve({ success: false, error: tunnelError });
      }
    });

    tunnelProcess.on('exit', (code) => {
      tunnelStarting = false;
      const wasRunning = tunnelRunning;
      tunnelProcess = null;
      tunnelRunning = false;
      if (!resolved) {
        resolved = true;
        clearTimeout(timer);
        tunnelError = `cloudflared exited with code ${code}`;
        resolve({ success: false, error: tunnelError });
      } else if (wasRunning) {
        log.warn('Tunnel disconnected');
        tunnelError = 'Tunnel process exited unexpectedly';
      }
    });
  });
}

export function stopTunnel(): { success: boolean } {
  if (!tunnelProcess) return { success: true };
  try { tunnelProcess.kill('SIGTERM'); } catch { /* ignore */ }
  tunnelProcess = null;
  tunnelRunning = false;
  tunnelStarting = false;
  tunnelError = null;
  log.info('Tunnel stopped');
  return { success: true };
}

export function getTunnelStatus() {
  const config = loadTunnelConfig();
  return {
    running: tunnelRunning,
    starting: tunnelStarting,
    url: tunnelRunning ? (config?.url || null) : null,
    error: tunnelError,
    configured: config !== null && !!config.tunnelName,
    config,
  };
}
