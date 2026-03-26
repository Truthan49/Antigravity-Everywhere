#!/usr/bin/env node
/**
 * CDP Sniffer for Antigravity gRPC Reverse Engineering
 * (Electron-compatible version)
 * 
 * Connects to Antigravity's CDP debugging port and logs all gRPC-Web
 * requests/responses to help discover undocumented APIs.
 * 
 * Usage:
 *   1. Start Antigravity with BOTH flags:
 *      /Applications/Antigravity.app/Contents/MacOS/Electron \
 *        /Applications/Antigravity.app/Contents/Resources/app \
 *        --remote-debugging-port=9222 \
 *        --remote-allow-origins=*
 *   2. Run: node scripts/cdp-sniffer.js
 *   3. Use Antigravity normally — all gRPC calls will be logged
 * 
 * Output goes to both console and data/cdp-capture-<timestamp>.jsonl
 */

import WebSocket from 'ws';
import { mkdirSync, appendFileSync } from 'fs';
import { join } from 'path';
import http from 'http';

// --- Config ---
const CDP_PORT = parseInt(process.env.CDP_PORT || '9222');
const LOG_DIR = join(process.cwd(), 'data');
const GRPC_FILTER = 'LanguageServerService';
const VERBOSE = process.argv.includes('--verbose');
const MAX_BODY_PREVIEW = 2000;

// --- Colors ---
const c = {
  reset: '\x1b[0m', dim: '\x1b[2m', bold: '\x1b[1m',
  green: '\x1b[32m', yellow: '\x1b[33m', blue: '\x1b[34m',
  magenta: '\x1b[35m', cyan: '\x1b[36m', red: '\x1b[31m',
  bgGreen: '\x1b[42m', bgBlue: '\x1b[44m', bgYellow: '\x1b[43m',
};

function ts() { return new Date().toISOString().replace('T', ' ').slice(11, 23); }
function extractMethod(url) { return url.match(/LanguageServerService\/(\w+)/)?.[1] || url; }
function truncate(str, maxLen = MAX_BODY_PREVIEW) {
  if (!str || str.length <= maxLen) return str;
  return str.slice(0, maxLen) + `... (${str.length} bytes)`;
}
function safeParseJson(str) { try { return JSON.parse(str); } catch { return str; } }

// --- HTTP helper ---
function httpGet(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, data }));
    }).on('error', reject);
  });
}

function httpPut(url) {
  return new Promise((resolve, reject) => {
    const req = http.request(url, { method: 'PUT' }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, data }));
    });
    req.on('error', reject);
    req.end();
  });
}

// --- Electron-aware CDP Target Discovery ---
async function discoverTarget() {
  console.log(`${c.cyan}🔍 Antigravity CDP Sniffer (Electron-Compatible)${c.reset}`);
  console.log(`${c.dim}Connecting to CDP on port ${CDP_PORT}...${c.reset}\n`);

  // Step 1: Check if CDP port is reachable
  let versionInfo;
  try {
    const { data } = await httpGet(`http://127.0.0.1:${CDP_PORT}/json/version`);
    versionInfo = JSON.parse(data);
    console.log(`${c.green}✅ CDP endpoint reachable${c.reset}`);
    console.log(`${c.dim}   Browser: ${versionInfo['Browser'] || 'unknown'}${c.reset}`);
    console.log(`${c.dim}   Protocol: ${versionInfo['Protocol-Version'] || 'unknown'}${c.reset}`);
  } catch (e) {
    console.error(`\n${c.red}❌ Cannot connect to CDP on port ${CDP_PORT}${c.reset}`);
    console.error(`${c.yellow}Start Antigravity with:${c.reset}`);
    console.error(`  /Applications/Antigravity.app/Contents/MacOS/Electron \\`);
    console.error(`    /Applications/Antigravity.app/Contents/Resources/app \\`);
    console.error(`    --remote-debugging-port=9222 \\`);
    console.error(`    --remote-allow-origins=*\n`);
    process.exit(1);
  }

  // Step 2: Try /json/list (standard approach — usually empty for Electron)
  console.log(`\n${c.dim}Trying /json/list...${c.reset}`);
  try {
    const { data } = await httpGet(`http://127.0.0.1:${CDP_PORT}/json/list`);
    const targets = JSON.parse(data);
    if (targets.length > 0) {
      const target = targets.find(t => t.type === 'page') || targets[0];
      if (target?.webSocketDebuggerUrl) {
        console.log(`${c.green}✅ Found target via /json/list: ${target.title}${c.reset}`);
        return target.webSocketDebuggerUrl;
      }
    }
    console.log(`${c.yellow}⚠ /json/list is empty (normal for Electron)${c.reset}`);
  } catch { }

  // Step 3: Connect to browser-level WebSocket and use Target.getTargets
  const browserWsUrl = versionInfo?.webSocketDebuggerUrl;
  if (!browserWsUrl) {
    console.error(`${c.red}❌ No browser WebSocket URL in /json/version${c.reset}`);
    process.exit(1);
  }

  console.log(`${c.dim}Trying browser-level WebSocket...${c.reset}`);
  console.log(`${c.dim}   ${browserWsUrl}${c.reset}`);

  let pageWsUrl;
  try {
    pageWsUrl = await new Promise((resolve, reject) => {
      const ws = new WebSocket(browserWsUrl);
      const timeout = setTimeout(() => { ws.close(); reject(new Error('timeout')); }, 5000);

      ws.on('error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });

      ws.on('open', () => {
        // Ask browser for all targets
        ws.send(JSON.stringify({ id: 1, method: 'Target.getTargets', params: {} }));
      });

      ws.on('message', (raw) => {
        const msg = JSON.parse(raw.toString());
        if (msg.id === 1 && msg.result?.targetInfos) {
          clearTimeout(timeout);
          const targets = msg.result.targetInfos;
          console.log(`${c.dim}   Found ${targets.length} target(s):${c.reset}`);
          targets.forEach((t, i) => {
            console.log(`${c.dim}     [${i}] ${t.type}: ${(t.title || t.url || '').slice(0, 60)}${c.reset}`);
          });

          // Find a page target
          const page = targets.find(t => t.type === 'page') ||
                       targets.find(t => t.type === 'webview') ||
                       targets.find(t => t.type === 'other');

          if (page) {
            // Attach to target to get a session
            ws.send(JSON.stringify({
              id: 2,
              method: 'Target.attachToTarget',
              params: { targetId: page.targetId, flatten: true }
            }));
          } else {
            // No page targets — we'll sniff at browser level
            ws.close();
            resolve(browserWsUrl);
          }
        }

        if (msg.id === 2 && msg.result?.sessionId) {
          clearTimeout(timeout);
          console.log(`${c.green}✅ Attached to target (session: ${msg.result.sessionId.slice(0, 16)}...)${c.reset}`);
          ws.close();
          // Use browser WS with session-scoped commands
          resolve({ browserWsUrl, sessionId: msg.result.sessionId });
        }
      });
    });
  } catch (err) {
    if (err.message?.includes('403') || err.message?.includes('Unexpected server response')) {
      console.error(`\n${c.red}❌ CDP WebSocket connection rejected (403 Forbidden)${c.reset}`);
      console.error(`${c.yellow}You need to restart Antigravity with --remote-allow-origins=*:${c.reset}`);
      console.error(`  /Applications/Antigravity.app/Contents/MacOS/Electron \\`);
      console.error(`    /Applications/Antigravity.app/Contents/Resources/app \\`);
      console.error(`    --remote-debugging-port=9222 \\`);
      console.error(`    --remote-allow-origins=*\n`);
      process.exit(1);
    }
    // Fallback: create a new target
    console.log(`${c.yellow}⚠ Browser WS failed: ${err.message}. Trying PUT /json/new...${c.reset}`);
    try {
      const { data } = await httpPut(`http://127.0.0.1:${CDP_PORT}/json/new?about:blank`);
      const newTarget = JSON.parse(data);
      if (newTarget?.webSocketDebuggerUrl) {
        console.log(`${c.green}✅ Created new debug target${c.reset}`);
        return newTarget.webSocketDebuggerUrl;
      }
    } catch { }
    console.error(`${c.red}❌ All target discovery methods failed${c.reset}`);
    process.exit(1);
  }

  return pageWsUrl;
}

// --- Main sniffing logic ---
function startSniffer(wsUrlOrSession) {
  mkdirSync(LOG_DIR, { recursive: true });
  const logFile = join(LOG_DIR, `cdp-capture-${Date.now()}.jsonl`);
  console.log(`${c.dim}📝 Logging to: ${logFile}${c.reset}\n`);

  function logToFile(entry) {
    appendFileSync(logFile, JSON.stringify(entry) + '\n');
  }

  // Determine connection mode
  const isBrowserSession = typeof wsUrlOrSession === 'object' && wsUrlOrSession.sessionId;
  const wsUrl = isBrowserSession ? wsUrlOrSession.browserWsUrl : wsUrlOrSession;
  const sessionId = isBrowserSession ? wsUrlOrSession.sessionId : null;

  const ws = new WebSocket(wsUrl);
  let msgId = 100;
  const pending = new Map();
  const requestBodies = new Map();
  const requestMethods = new Map();

  function cdpSend(method, params = {}) {
    return new Promise((resolve) => {
      const id = msgId++;
      pending.set(id, resolve);
      const msg = { id, method, params };
      if (sessionId) msg.sessionId = sessionId;
      ws.send(JSON.stringify(msg));
    });
  }

  ws.on('open', async () => {
    console.log(`${c.green}📡 CDP connected${c.reset}`);
    console.log(`${c.dim}${'─'.repeat(70)}${c.reset}`);
    console.log(`${c.yellow}Waiting for gRPC calls... Use Antigravity normally.${c.reset}`);
    console.log(`${c.dim}${'─'.repeat(70)}${c.reset}\n`);

    // Enable network domain
    await cdpSend('Network.enable', { maxPostDataSize: 65536 });
    // Enable console (for debug logs)
    await cdpSend('Runtime.enable');

    let callCount = 0;
    const methodStats = new Map();

    ws.on('message', (raw) => {
      const msg = JSON.parse(raw.toString());

      // Handle responses to our CDP commands
      if (msg.id && pending.has(msg.id)) {
        pending.get(msg.id)(msg.result || {});
        pending.delete(msg.id);
        return;
      }

      // Handle CDP events (may be session-scoped)
      const event = msg.method || msg.params?.method;
      const params = msg.params?.params || msg.params;
      if (!event || !params) return;

      // --- gRPC Request Sent ---
      if (event === 'Network.requestWillBeSent') {
        const { requestId, request } = params;
        const url = request?.url || '';
        if (!url.includes(GRPC_FILTER)) return;

        const method = extractMethod(url);
        const body = request.postData || '';
        requestBodies.set(requestId, body);
        requestMethods.set(requestId, method);

        callCount++;
        methodStats.set(method, (methodStats.get(method) || 0) + 1);

        console.log(
          `${c.green}[${ts()}] → ${c.bgGreen} ${method} ${c.reset}` +
          `${c.dim} (#${callCount})${c.reset}`
        );
        if (body && body !== '{}') {
          try {
            const parsed = JSON.parse(body);
            const preview = JSON.stringify(parsed, null, 2).slice(0, 300);
            console.log(`${c.dim}  Request: ${preview}${c.reset}`);
          } catch {
            console.log(`${c.dim}  Request: ${truncate(body, 200)}${c.reset}`);
          }
        }

        logToFile({
          type: 'request', time: new Date().toISOString(),
          method, requestId,
          body: body ? safeParseJson(body) : null,
          url,
        });
      }

      // --- gRPC Response Received ---
      if (event === 'Network.responseReceived') {
        const { requestId, response } = params;
        const url = response?.url || '';
        if (!url.includes(GRPC_FILTER)) return;

        const method = requestMethods.get(requestId) || extractMethod(url);
        const status = response.status;
        const contentType = response.headers?.['content-type'] || '';

        console.log(
          `${c.blue}[${ts()}] ← ${c.bgBlue} ${method} ${c.reset}` +
          `${c.dim} status=${status} type=${contentType.slice(0, 30)}${c.reset}`
        );

        cdpSend('Network.getResponseBody', { requestId }).then((result) => {
          if (result.body) {
            if (VERBOSE) {
              console.log(`${c.dim}  Response: ${truncate(result.body, 500)}${c.reset}`);
            }
            logToFile({
              type: 'response', time: new Date().toISOString(),
              method, requestId, status, contentType,
              body: safeParseJson(result.body),
              base64Encoded: result.base64Encoded,
            });
          }
        }).catch(() => {});
      }

      // --- WebSocket frames (for streaming gRPC) ---
      if (event === 'Network.webSocketFrameReceived') {
        const payload = params.response?.payloadData;
        if (payload && (payload.includes('cascade') || payload.includes('trajectory'))) {
          console.log(
            `${c.magenta}[${ts()}] ⇐ WS frame${c.reset}` +
            `${c.dim} ${truncate(payload, 150)}${c.reset}`
          );
          logToFile({
            type: 'ws_frame', time: new Date().toISOString(),
            requestId: params.requestId,
            payload: safeParseJson(payload),
          });
        }
      }

      // --- Console messages ---
      if (event === 'Runtime.consoleAPICalled') {
        const args = params.args || [];
        const text = args.map(a => a.value || a.description || '').join(' ');
        if (text && /cascade|grpc|stream|trajectory/i.test(text)) {
          console.log(`${c.yellow}[${ts()}] 💬 ${truncate(text, 200)}${c.reset}`);
          logToFile({ type: 'console', time: new Date().toISOString(), text });
        }
      }
    });

    // Stats on exit
    process.on('SIGINT', () => {
      console.log(`\n${c.cyan}${'═'.repeat(70)}${c.reset}`);
      console.log(`${c.cyan}📊 Session Summary${c.reset}`);
      console.log(`${c.cyan}${'═'.repeat(70)}${c.reset}`);
      console.log(`Total gRPC calls captured: ${callCount}`);
      if (methodStats.size > 0) {
        console.log(`\nMethod frequency:`);
        const sorted = [...methodStats.entries()].sort((a, b) => b[1] - a[1]);
        for (const [method, count] of sorted) {
          const bar = '█'.repeat(Math.min(count, 30));
          console.log(`  ${method.padEnd(40)} ${String(count).padStart(3)} ${c.green}${bar}${c.reset}`);
        }
      }
      console.log(`\n${c.dim}Full log: ${logFile}${c.reset}`);
      process.exit(0);
    });
  });

  ws.on('error', (err) => {
    if (err.message?.includes('403')) {
      console.error(`\n${c.red}❌ CDP WebSocket rejected (403 Forbidden)${c.reset}`);
      console.error(`${c.yellow}Restart Antigravity with --remote-allow-origins=*${c.reset}\n`);
    } else {
      console.error(`${c.red}❌ CDP error: ${err.message}${c.reset}`);
    }
  });

  ws.on('close', () => {
    console.log(`${c.yellow}CDP connection closed.${c.reset}`);
    process.exit(0);
  });
}

// --- Entry ---
discoverTarget().then(startSniffer).catch(err => {
  console.error(`${c.red}❌ Fatal: ${err.message}${c.reset}`);
  process.exit(1);
});
