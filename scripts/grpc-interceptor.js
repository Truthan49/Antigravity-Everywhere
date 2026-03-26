#!/usr/bin/env node
/**
 * gRPC-Web Traffic Interceptor for Antigravity
 *
 * Uses GetAllCascadeTrajectories (the same method the gateway uses) to
 * discover conversations, then streams real-time events via
 * StreamAgentStateUpdates with proper Connect JSON envelope framing.
 *
 * Auto-polls every few seconds until conversations are found, then
 * attaches streaming listeners for real-time traffic capture.
 *
 * Usage:
 *   node scripts/grpc-interceptor.js            # Auto-discover & stream
 *   node scripts/grpc-interceptor.js --verbose   # Show full response bodies
 */

import https from 'https';
import { mkdirSync, appendFileSync } from 'fs';
import { join, dirname } from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const LOG_DIR = join(__dirname, '..', 'data');
const VERBOSE = process.argv.includes('--verbose');
const POLL_INTERVAL = 3000;

const agent = new https.Agent({ rejectUnauthorized: false });

// --- Colors ---
const c = {
  reset: '\x1b[0m', dim: '\x1b[2m', bold: '\x1b[1m',
  green: '\x1b[32m', yellow: '\x1b[33m', blue: '\x1b[34m',
  magenta: '\x1b[35m', cyan: '\x1b[36m', red: '\x1b[31m',
  bgGreen: '\x1b[42m', bgBlue: '\x1b[44m', bgRed: '\x1b[41m',
  bgMagenta: '\x1b[45m', bgCyan: '\x1b[46m',
};

function ts() { return new Date().toISOString().replace('T', ' ').slice(11, 23); }

// --- Connect Protocol ---
function buildEnvelope(json) {
  const payload = Buffer.from(JSON.stringify(json), 'utf-8');
  const header = Buffer.alloc(5);
  header.writeUInt8(0x00, 0);
  header.writeUInt32BE(payload.length, 1);
  return Buffer.concat([header, payload]);
}

function parseEnvelopes(buf) {
  const messages = [];
  let pos = 0;
  while (pos + 5 <= buf.length) {
    const length = buf.readUInt32BE(pos + 1);
    if (pos + 5 + length > buf.length) break;
    const payload = buf.subarray(pos + 5, pos + 5 + length);
    try { messages.push(JSON.parse(payload.toString('utf-8'))); } catch {}
    pos += 5 + length;
  }
  return { messages, remaining: buf.subarray(pos) };
}

// --- Discover servers ---
function discoverServers() {
  try {
    const raw = execSync(`ps aux | grep language_server_macos | grep -v grep`, { encoding: 'utf-8' });
    const servers = [];
    for (const line of raw.trim().split('\n')) {
      const csrfMatch = line.match(/--csrf_token\s+(\S+)/);
      const wsMatch = line.match(/--workspace_id\s+(\S+)/);
      const pidMatch = line.match(/^\S+\s+(\d+)/);
      if (!csrfMatch || !pidMatch) continue;
      const pid = pidMatch[1];
      const csrf = csrfMatch[1];
      const workspace = wsMatch?.[1] || 'unknown';
      try {
        const lsof = execSync(`lsof -nP -iTCP -sTCP:LISTEN -a -p ${pid} 2>/dev/null`, { encoding: 'utf-8' });
        const ports = [];
        for (const l of lsof.trim().split('\n')) {
          const m = l.match(/:(\d+)\s+\(LISTEN\)/);
          if (m) ports.push(parseInt(m[1]));
        }
        if (ports.length > 0) {
          ports.sort((a, b) => a - b);
          servers.push({ pid, csrf, workspace, port: ports[0] });
        }
      } catch {}
    }
    return servers;
  } catch { return []; }
}

// --- Unary gRPC call (plain JSON) ---
function grpcUnary(port, csrf, method, body = {}) {
  return new Promise((resolve, reject) => {
    const jsonBody = JSON.stringify(body);
    const req = https.request({
      hostname: '127.0.0.1', port, agent,
      path: `/exa.language_server_pb.LanguageServerService/${method}`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'connect-protocol-version': '1',
        'x-codeium-csrf-token': csrf,
        'Content-Length': Buffer.byteLength(jsonBody),
      },
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch { resolve(data); }
      });
    });
    req.on('error', reject);
    req.write(jsonBody);
    req.end();
  });
}

// --- Server-streaming gRPC call (Connect JSON envelope) ---
function grpcStream(port, csrf, method, body, onMessage, onEnd) {
  const envelope = buildEnvelope(body);
  const req = https.request({
    hostname: '127.0.0.1', port, agent,
    path: `/exa.language_server_pb.LanguageServerService/${method}`,
    method: 'POST',
    headers: {
      'Content-Type': 'application/connect+json',
      'connect-protocol-version': '1',
      'x-codeium-csrf-token': csrf,
    },
  }, (res) => {
    let buffer = Buffer.alloc(0);
    res.on('data', (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);
      const { messages, remaining } = parseEnvelopes(buffer);
      buffer = remaining;
      for (const msg of messages) onMessage(msg);
    });
    res.on('end', () => {
      if (buffer.length > 0) {
        const { messages } = parseEnvelopes(buffer);
        for (const msg of messages) onMessage(msg);
      }
      onEnd?.();
    });
  });
  req.on('error', (err) => onEnd?.(err));
  req.write(envelope);
  req.end();
  return req;
}

// ============================================================
// MAIN
// ============================================================
async function main() {
  console.log(`${c.cyan}🔍 Antigravity gRPC Traffic Interceptor${c.reset}`);
  const servers = discoverServers();
  if (servers.length === 0) {
    console.error(`${c.red}❌ No language servers found. Is Antigravity running?${c.reset}`);
    process.exit(1);
  }

  console.log(`${c.green}Found ${servers.length} server(s):${c.reset}`);
  servers.forEach((s, i) => console.log(`  [${i}] PID=${s.pid} port=${s.port} ws=${s.workspace}`));

  mkdirSync(LOG_DIR, { recursive: true });
  const logFile = join(LOG_DIR, `grpc-intercept-${Date.now()}.jsonl`);
  console.log(`${c.dim}📝 ${logFile}${c.reset}\n`);
  const log = (entry) => appendFileSync(logFile, JSON.stringify({ ...entry, _ts: new Date().toISOString() }) + '\n');

  // Track discovered conversations and active streams
  const knownCascades = new Map(); // cascadeId → { server, title, streaming }
  let eventCount = 0;
  const methodStats = new Map();

  // --- Poll for conversations using GetAllCascadeTrajectories ---
  async function pollConversations() {
    for (const srv of servers) {
      try {
        const data = await grpcUnary(srv.port, srv.csrf, 'GetAllCascadeTrajectories', {});
        const summaries = data?.trajectorySummaries || {};

        for (const [id, info] of Object.entries(summaries)) {
          if (!knownCascades.has(id)) {
            const title = info.summary || `Conv ${id.slice(0, 8)}`;
            const steps = info.stepCount || 0;
            const ws = info.workspaces?.[0]?.workspaceFolderAbsoluteUri || '';
            console.log(
              `${c.green}[${ts()}]${c.reset} ${c.bgGreen} NEW CONVERSATION ${c.reset} ` +
              `${id.slice(0, 12)} "${title.slice(0, 40)}" (${steps} steps)`
            );
            if (ws) console.log(`  ${c.dim}workspace: ${ws}${c.reset}`);
            
            knownCascades.set(id, { server: srv, title, steps, streaming: false });
            log({ type: 'discovered', cascadeId: id, title, steps, server: srv.workspace });

            // Auto-attach stream to new conversations
            attachStream(id, srv);
          }
        }
      } catch (e) {
        if (VERBOSE) console.log(`${c.dim}Poll error on ${srv.workspace}: ${e.message}${c.reset}`);
      }
    }
  }

  // --- Attach StreamAgentStateUpdates to a specific conversation ---
  function attachStream(cascadeId, srv) {
    const entry = knownCascades.get(cascadeId);
    if (!entry || entry.streaming) return;
    entry.streaming = true;

    console.log(`${c.cyan}[${ts()}]${c.reset} 📡 Streaming ${cascadeId.slice(0, 12)}...`);

    grpcStream(srv.port, srv.csrf, 'StreamAgentStateUpdates',
      { conversationId: cascadeId, subscriberId: `interceptor-${Date.now()}` },
      (data) => {
        eventCount++;

        // Check for stream errors
        if (data.error) {
          console.log(`${c.red}[${ts()}] Stream error: ${data.error.message}${c.reset}`);
          log({ type: 'stream_error', cascadeId, error: data.error });
          return;
        }

        const update = data.update || data;
        const step = update.cortexStep || update;
        const stepType = (step.type || '').replace('CORTEX_STEP_TYPE_', '');
        const status = (step.status || '').replace('CORTEX_STEP_STATUS_', '');

        methodStats.set(stepType || 'raw', (methodStats.get(stepType || 'raw') || 0) + 1);

        // Pretty print by step type
        switch (stepType) {
          case 'PLANNER_RESPONSE': {
            const text = step.plannerResponse?.modifiedResponse || step.plannerResponse?.response || '';
            console.log(`${c.green}[${ts()}]${c.reset} ${c.bgGreen} AI ${c.reset} ${c.dim}${status}${c.reset}`);
            if (text) {
              const preview = text.slice(0, 300).replace(/\n/g, '↵');
              console.log(`  ${preview}${text.length > 300 ? '...' : ''}`);
            }
            break;
          }
          case 'USER_INPUT': {
            const items = step.userInput?.items || [];
            const text = items.map(i => i.text || '').join('');
            console.log(`${c.blue}[${ts()}]${c.reset} ${c.bgBlue} USER ${c.reset} ${text.slice(0, 200)}`);
            break;
          }
          case 'TASK_BOUNDARY': {
            const tb = step.taskBoundary || {};
            console.log(`${c.magenta}[${ts()}]${c.reset} ${c.bgMagenta} TASK ${c.reset} ${tb.taskName || ''} [${tb.mode || ''}] ${tb.taskStatus || ''}`);
            break;
          }
          case 'CODE_ACTION': {
            const ca = step.codeAction || {};
            const spec = ca.actionSpec || {};
            const file = spec.createFile?.absoluteUri || spec.editFile?.absoluteUri || spec.deleteFile?.absoluteUri || '';
            const desc = ca.description?.slice(0, 80) || '';
            console.log(`${c.yellow}[${ts()}]${c.reset} ✏️  ${desc} ${file ? '→ ' + file.split('/').pop() : ''} ${c.dim}${status}${c.reset}`);
            break;
          }
          case 'RUN_COMMAND': {
            const cmd = step.runCommand?.commandLine || '';
            console.log(`${c.cyan}[${ts()}]${c.reset} 💻 ${cmd.slice(0, 150)} ${c.dim}${status}${c.reset}`);
            break;
          }
          case 'SEARCH': {
            const search = step.search || {};
            console.log(`${c.dim}[${ts()}] 🔍 Search: ${search.query?.slice(0, 80) || ''} ${status}${c.reset}`);
            break;
          }
          case 'NOTIFY_USER': {
            const text = step.notifyUser?.notificationContent || '';
            console.log(`${c.green}[${ts()}]${c.reset} 📢 ${text.slice(0, 200).replace(/\n/g, '↵')}`);
            break;
          }
          case 'BROWSER_ACTION': {
            console.log(`${c.magenta}[${ts()}]${c.reset} 🌐 Browser Action ${c.dim}${status}${c.reset}`);
            break;
          }
          default: {
            if (stepType) {
              console.log(`${c.dim}[${ts()}] ${stepType} ${status}${c.reset}`);
            } else if (VERBOSE) {
              console.log(`${c.dim}[${ts()}] Raw: ${JSON.stringify(data).slice(0, 200)}${c.reset}`);
            }
          }
        }

        // Log everything
        log({ type: 'event', cascadeId, stepType, status, data });
      },
      (err) => {
        if (err) {
          console.log(`${c.yellow}[${ts()}] Stream ${cascadeId.slice(0, 12)} error: ${err.message}${c.reset}`);
        } else {
          console.log(`${c.dim}[${ts()}] Stream ${cascadeId.slice(0, 12)} ended${c.reset}`);
        }
        // Mark as not streaming so it can be re-attached
        if (knownCascades.has(cascadeId)) {
          knownCascades.get(cascadeId).streaming = false;
        }
      }
    );
  }

  // --- Initial poll ---
  console.log(`${c.yellow}Polling for conversations (every ${POLL_INTERVAL / 1000}s)...${c.reset}`);
  console.log(`${c.dim}Open a conversation in Antigravity and interact with it.${c.reset}\n`);

  await pollConversations();

  if (knownCascades.size === 0) {
    console.log(`${c.yellow}No conversations found yet. Waiting...${c.reset}\n`);
  }

  // --- Continuous polling ---
  const pollTimer = setInterval(async () => {
    await pollConversations();

    // Re-attach streams for conversations that lost connection
    for (const [id, info] of knownCascades) {
      if (!info.streaming) {
        attachStream(id, info.server);
      }
    }
  }, POLL_INTERVAL);

  // --- Exit handler ---
  process.on('SIGINT', () => {
    clearInterval(pollTimer);
    console.log(`\n${c.cyan}${'═'.repeat(60)}${c.reset}`);
    console.log(`${c.cyan}📊 Session Summary${c.reset}`);
    console.log(`${c.cyan}${'═'.repeat(60)}${c.reset}`);
    console.log(`Conversations discovered: ${knownCascades.size}`);
    console.log(`Events captured: ${eventCount}`);
    if (methodStats.size > 0) {
      console.log(`\nEvent types:`);
      const sorted = [...methodStats.entries()].sort((a, b) => b[1] - a[1]);
      for (const [key, count] of sorted) {
        console.log(`  ${key.padEnd(25)} ${String(count).padStart(4)} ${'█'.repeat(Math.min(count, 30))}`);
      }
    }
    for (const [id, info] of knownCascades) {
      console.log(`\n${c.dim}Conversation: ${id.slice(0, 16)} "${info.title?.slice(0, 40)}"${c.reset}`);
    }
    console.log(`\n${c.dim}Full log: ${logFile}${c.reset}`);
    process.exit(0);
  });
}

main().catch(err => {
  console.error(`${c.red}Fatal: ${err.message}${c.reset}`);
  process.exit(1);
});
