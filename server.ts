/**
 * Custom Next.js server with WebSocket support.
 * Runs both Next.js and WS server on a single port.
 *
 * IMPORTANT: Do NOT statically import bridge modules here.
 * tsx watch monitors all static imports — if bridge files change,
 * it restarts the server, but Next.js doesn't release .next/dev/lock
 * in time, causing lock conflicts and restart loops.
 * Use dynamic import() instead so tsx watch only watches this file.
 */
import { createServer } from 'http';
import next from 'next';
import { parse } from 'url';
import { WebSocketServer, WebSocket } from 'ws';
import { createLogger } from './src/lib/logger';
import crypto from 'crypto';

if (!process.env.INTERNAL_ACCESS_TOKEN) {
  process.env.INTERNAL_ACCESS_TOKEN = crypto.randomBytes(32).toString('hex');
}

const log = createLogger('Server');

const dev = process.env.NODE_ENV !== 'production';
const hostname = '0.0.0.0';
const port = parseInt(process.env.PORT || '3000');

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

// Lazy-loaded bridge modules (loaded on first WS connection, not at startup)
let bridgeLoaded = false;
let gateway: any = null;
let grpc: any = null;

async function ensureBridge() {
  if (!bridgeLoaded) {
    gateway = await import('./src/lib/bridge/gateway');
    grpc = await import('./src/lib/bridge/grpc');
    bridgeLoaded = true;
  }
}

  app.prepare().then(() => {
  const server = createServer(async (req, res) => {
    const parsedUrl = parse(req.url || '', true);
    
    // --- Security Fix: Prevent external access to internal routes ---
    if (parsedUrl.pathname?.startsWith('/_internal/')) {
      const providedToken = req.headers['x-internal-token'];
      if (providedToken !== process.env.INTERNAL_ACCESS_TOKEN) {
        log.warn({ ip: req.socket.remoteAddress, path: parsedUrl.pathname }, 'Blocked unauthorized internal access');
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Forbidden IP access' }));
        return;
      }
    }

    // --- Internal HTTP intercepts for Feishu WS Client Management ---
    // These must run in the main server process, bypassing Next.js API routes (workers)
    if (parsedUrl.pathname === '/_internal/feishu/restart_global' && req.method === 'POST') {
      const feishuBot = await import('./src/lib/feishu/bot');
      const result = await feishuBot.startFeishuClient();
      res.writeHead(result.success ? 200 : 400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
      return;
    }
    
    if (parsedUrl.pathname === '/_internal/feishu/restart_workspace' && req.method === 'POST') {
      let body = '';
      req.on('data', chunk => body += chunk.toString());
      req.on('end', async () => {
        try {
          const params = JSON.parse(body);
          const feishuBot = await import('./src/lib/feishu/bot');
          if (params.action === 'upsert') {
            feishuBot.stopWorkspaceBotClient(params.workspaceUri);
            if (params.enabled) {
              const r = await feishuBot.startWorkspaceBotClient(params.config);
              res.writeHead(r.success ? 200 : 400);
              res.end(JSON.stringify(r));
              return;
            }
          } else if (params.action === 'delete') {
            feishuBot.stopWorkspaceBotClient(params.workspaceUri);
          }
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true }));
        } catch (e: any) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: e.message }));
        }
      });
      return;
    }
    
    if (parsedUrl.pathname === '/api/feishu/workspace-bots' && req.method === 'GET') {
      // Intercept GET to return accurate WS connection status from the main process
      const feishuBot = await import('./src/lib/feishu/bot');
      const bots = feishuBot.getWorkspaceBotStatuses();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ bots }));
      return;
    }

    handle(req, res, parsedUrl);
  });

  // --- WebSocket Server ---
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (req, socket, head) => {
    const { pathname } = parse(req.url || '', true);
    if (pathname === '/ws') {
      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit('connection', ws, req);
      });
    }
    // Other upgrade requests (e.g. Next.js HMR) are handled by Next.js
  });

  wss.on('connection', (ws: WebSocket) => {
    const activeStreams = new Map<string, { abort: () => void; fullSteps: any[] }>();

    function startStreamForId(cascadeId: string, conn: { port: number; csrf: string; apiKey?: string; workspace?: string }) {

      // Clean up existing stream for this ID if any
      const existing = activeStreams.get(cascadeId);
      if (existing) { existing.abort(); activeStreams.delete(cascadeId); }

      let fullSteps: any[] = [];
      let abortFn = () => {};
      activeStreams.set(cascadeId, { abort: () => abortFn(), fullSteps });

      (async () => {
        try {
          // Force the language server to reload conversation from disk first
          await grpc.loadTrajectory(conn.port, conn.csrf, cascadeId);
          const apiKey = conn.apiKey || 'gateway';
          const hist = await grpc.getTrajectorySteps(conn.port, conn.csrf, apiKey, cascadeId);
          if (hist && hist.steps) fullSteps = [...hist.steps]; // Hydrate history
        } catch (e: any) {
          log.warn({ cascadeId: cascadeId.slice(0,8), err: e.message }, 'History fetch failed');
        }

        if (!activeStreams.has(cascadeId)) return;

        abortFn = grpc.streamAgentState(
          conn.port,
          conn.csrf,
          cascadeId,
          (update: any) => {
            const stepsUpdate = update?.mainTrajectoryUpdate?.stepsUpdate;
          const status = update?.status || '';
          const isActive = status !== 'CASCADE_RUN_STATUS_IDLE';
          const cascadeStatus = status.replace('CASCADE_RUN_STATUS_', '').toLowerCase();

          // Extract latest task boundary for progress panel
          let lastTaskBoundary: any = null;
          const allSteps = stepsUpdate?.steps || [];
          for (let i = allSteps.length - 1; i >= 0; i--) {
            if (allSteps[i]?.type === 'CORTEX_STEP_TYPE_TASK_BOUNDARY') {
              lastTaskBoundary = allSteps[i].taskBoundary;
              break;
            }
          }

          if (stepsUpdate?.steps?.length) {
            const indices: number[] = stepsUpdate.indices || [];
            const newSteps: any[] = stepsUpdate.steps || [];
            const totalLength: number = stepsUpdate.totalLength || 0;

            if (indices.length > 0 && indices.length === newSteps.length) {
              if (totalLength > fullSteps.length) {
                fullSteps.length = totalLength;
              }
              for (let i = 0; i < indices.length; i++) {
                fullSteps[indices[i]] = newSteps[i];
              }
            } else if (newSteps.length > fullSteps.length) {
              fullSteps = [...newSteps];
            } else if (newSteps.length === fullSteps.length) {
              fullSteps = [...newSteps];
            }

            // Search fullSteps for latest task boundary (more reliable)
            for (let i = fullSteps.length - 1; i >= 0; i--) {
              if (fullSteps[i]?.type === 'CORTEX_STEP_TYPE_TASK_BOUNDARY') {
                lastTaskBoundary = fullSteps[i].taskBoundary;
                break;
              }
            }

            const cleanSteps = fullSteps.filter(s => s != null);
            ws.send(JSON.stringify({
              type: 'steps', cascadeId, data: { steps: cleanSteps }, isActive, cascadeStatus,
              totalLength: stepsUpdate.totalLength || cleanSteps.length,
              lastTaskBoundary,
              workspace: conn.workspace,
            }));
          } else {
            ws.send(JSON.stringify({
              type: 'status', cascadeId, isActive, cascadeStatus,
              stepCount: fullSteps.filter(s => s != null).length,
              lastTaskBoundary,
              workspace: conn.workspace,
            }));
          }
        },
        async (err: Error) => {
          log.warn({ cascadeId: cascadeId.slice(0,8), err: err.message }, 'Stream ended, reconnecting...');
          setTimeout(async () => {
            try {
              if (ws.readyState === ws.OPEN) {
                await ensureBridge();
                await gateway.refreshOwnerMap();
                const newOwner = gateway.getOwnerConnection(cascadeId);
                if (newOwner) {
                  log.info({ cascadeId: cascadeId.slice(0,8), port: newOwner.port }, 'Stream reconnected');
                  startStreamForId(cascadeId, newOwner);
                } else {
                  log.warn({ cascadeId: cascadeId.slice(0,8) }, 'No server found during reconnect, retrying in 2s...');
                  // Second attempt after additional delay
                  setTimeout(async () => {
                    try {
                      if (ws.readyState === ws.OPEN) {
                        await gateway.refreshOwnerMap();
                        const retryOwner = gateway.getOwnerConnection(cascadeId);
                        if (retryOwner) {
                          log.info({ cascadeId: cascadeId.slice(0,8), port: retryOwner.port }, 'Stream reconnected (2nd attempt)');
                          startStreamForId(cascadeId, retryOwner);
                        }
                      }
                    } catch (e: any) {
                      log.error({ cascadeId: cascadeId.slice(0,8), err: e.message }, 'Stream reconnect (2nd attempt) failed');
                    }
                  }, 2000);
                }
              }
            } catch (e: any) {
              log.error({ cascadeId: cascadeId.slice(0,8), err: e.message }, 'Stream reconnect failed');
            }
          }, 500);
        }
      );
    })();
  }

    ws.on('message', async (raw: Buffer) => {
      try {
        await ensureBridge();
        const msg = JSON.parse(raw.toString());

        // Single subscribe (backward compatible — clears all previous streams)
        if (msg.type === 'subscribe' && msg.cascadeId) {
          const cascadeId = msg.cascadeId;
          // Close all existing streams
          for (const [, s] of activeStreams) s.abort();
          activeStreams.clear();

          if (!gateway.convOwnerMap.has(cascadeId) || Date.now() - gateway.ownerMapAge > 30_000) {
            await gateway.refreshOwnerMap();
          }

          const owner = gateway.getOwnerConnection(cascadeId);
          if (!owner) {
            ws.send(JSON.stringify({ type: 'error', message: 'No server found for this conversation' }));
            return;
          }
          log.info({ cascadeId: cascadeId.slice(0,8), port: owner.port }, 'Stream subscribe');
          startStreamForId(cascadeId, owner);
        }

        // Multi-subscribe (add streams without clearing existing)
        if (msg.type === 'multi-subscribe' && Array.isArray(msg.cascadeIds)) {
          if (Date.now() - gateway.ownerMapAge > 30_000) {
            await gateway.refreshOwnerMap();
          }
          for (const cascadeId of msg.cascadeIds) {
            if (activeStreams.has(cascadeId)) continue; // already streaming
            const owner = gateway.getOwnerConnection(cascadeId);
            if (owner) {
              log.info({ cascadeId: cascadeId.slice(0,8), port: owner.port }, 'Multi-subscribe');
              startStreamForId(cascadeId, owner);
            }
          }
        }

        if (msg.type === 'unsubscribe') {
          if (msg.cascadeId) {
            const s = activeStreams.get(msg.cascadeId);
            if (s) { s.abort(); activeStreams.delete(msg.cascadeId); }
          } else {
            for (const [, s] of activeStreams) s.abort();
            activeStreams.clear();
          }
        }
      } catch {}
    });

    ws.on('close', () => {
      for (const [, s] of activeStreams) s.abort();
      activeStreams.clear();
    });
  });

  server.listen(port, hostname, async () => {
    log.info({ hostname, port }, '🚀 Antigravity Gateway running');
    log.info('Single-port mode: Next.js + API + WebSocket');

    // --- Auto-start Feishu WebSocket ---
    log.info('🤖 Attempting Feishu WebSocket auto-start...');
    try {
      const feishuBot = await import('./src/lib/feishu/bot');
      log.info('🤖 Feishu bot module loaded successfully');
      const result = await feishuBot.startFeishuClient();
      if (result.success) {
        log.info('🤖 Feishu WebSocket client connected');
      } else {
        log.warn({ err: result.error }, '🤖 Feishu WS skipped');
      }
    } catch (e: any) {
      log.error({ err: e.message, stack: e.stack }, '🤖 Feishu WS auto-start FAILED');
    }

    // --- Auto-start Cloudflare Tunnel ---
    try {
      const tunnel = await import('./src/lib/bridge/tunnel');
      const config = tunnel.loadTunnelConfig();
      if (config?.autoStart && config.tunnelName) {
        log.info({ tunnelName: config.tunnelName }, '🌐 Auto-starting tunnel...');
        const result = await tunnel.startTunnel(port);
        if (result.success) {
          log.info({ url: result.url }, '🌐 Tunnel active');
        } else {
          log.warn({ error: result.error }, '🌐 Tunnel failed');
        }
      }
    } catch (err: any) {
      log.warn({ err: err.message }, '🌐 Tunnel auto-start skipped');
    }
  });

  // Clean up tunnel on exit
  const cleanup = async () => {
    try {
      const tunnel = await import('./src/lib/bridge/tunnel');
      tunnel.stopTunnel();
    } catch {}
    process.exit(0);
  };
  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);
});
