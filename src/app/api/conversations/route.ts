import { NextResponse } from 'next/server';
import { createLogger } from '@/lib/logger';
import path from 'path';
import { readdirSync, statSync } from 'fs';
import { homedir } from 'os';
import {
  getAllConnections, getConversations, addLocalConversation,
  refreshOwnerMap, convOwnerMap, preRegisterOwner, getApiKey,
  discoverLanguageServers, getLanguageServer, generatePlaygroundName,
  PLAYGROUND_DIR_PATH, grpc,
} from '@/lib/bridge/gateway';
import { mkdirSync } from 'fs';

export const dynamic = 'force-dynamic';

const log = createLogger('NewConv');

const CONVERSATIONS_DIR = path.join(homedir(), '.gemini/antigravity/conversations');

interface ConvCache { id: string; title: string; workspace: string; mtime: number; steps: number; }
let convCache: ConvCache[] = [];

import { getDynamicConversations } from '@/lib/bridge/gateway';

// GET /api/conversations — list conversations
export async function GET() {
  try {
    const results = await getDynamicConversations();
    return NextResponse.json(results);
  } catch (e: any) {
    const conversations = getConversations();
    return NextResponse.json(conversations);
  }
}

// POST /api/conversations — create new conversation
export async function POST(req: Request) {
  const apiKey = getApiKey();
  if (!apiKey) return NextResponse.json({ error: 'No API key' }, { status: 503 });
  
  let workspace = 'playground';
  try {
    const body = await req.json();
    if (body?.workspace) workspace = body.workspace;
  } catch (e) {}

  // --- Playground flow ---
  if (workspace === 'playground') {
    const name = generatePlaygroundName();
    const folderPath = path.join(PLAYGROUND_DIR_PATH, name);
    mkdirSync(folderPath, { recursive: true });

    let servers = await discoverLanguageServers();
    let pgServer = servers.find(s => s.workspace?.endsWith('/playground') || s.workspace?.includes('/playground/'));

    if (!pgServer) {
      log.info('No Playground server found, auto-launching...');
      try {
        const { execSync } = require('child_process');
        const ANTIGRAVITY_CLI = '/Applications/Antigravity.app/Contents/Resources/app/bin/antigravity';
        execSync(`"${ANTIGRAVITY_CLI}" --new-window "${PLAYGROUND_DIR_PATH}"`, {
          timeout: 5000,
          stdio: 'ignore',
        });
        
        // Wait up to 5 seconds for the language server to register
        let retries = 10;
        while (retries > 0 && !pgServer) {
          await new Promise(r => setTimeout(r, 500));
          servers = await discoverLanguageServers();
          pgServer = servers.find(s => s.workspace?.endsWith('/playground') || s.workspace?.includes('/playground/'));
          retries--;
        }
      } catch (e: any) {
        log.error({ err: e.message }, 'Failed to launch Playground');
      }
    }

    if (!pgServer) return NextResponse.json({ error: 'No Playground language_server found (failed to auto-launch)' }, { status: 503 });

    try {
      await grpc.addTrackedWorkspace(pgServer.port, pgServer.csrf, folderPath);
      const wsUri = `file://${folderPath}`;
      const data = await grpc.startCascade(pgServer.port, pgServer.csrf, apiKey, wsUri);
      if (data.cascadeId) {
        addLocalConversation(data.cascadeId, wsUri, `Playground: ${name}`);
        // Mimic Agent Manager: add view time annotation so it tracks properly
        await grpc.updateConversationAnnotations(pgServer.port, pgServer.csrf, apiKey, data.cascadeId, {
          lastUserViewTime: new Date().toISOString()
        }).catch(() => { });
      }
      return NextResponse.json(data);
    } catch (e: any) {
      return NextResponse.json({ error: e.message }, { status: 500 });
    }
  }

  // --- Normal workspace flow ---
  const wsUri = workspace;
  log.info({ workspace, wsUri }, 'New conversation started');
  log.debug({ rawWorkspace: workspace, resolvedUri: wsUri }, 'Request details');

  // Find a matching server for this workspace
  const srv = await getLanguageServer(wsUri);
  const isMatch = !!srv && (srv.workspace === wsUri || srv.workspace?.includes(wsUri) || wsUri.includes(srv.workspace || '\0'));

  if (!srv || !isMatch) {
    log.warn({ wsUri }, 'No matching server — workspace needs to be opened first');
    return NextResponse.json({
      error: 'workspace_not_running',
      message: `Workspace is not running. Please open it in Antigravity first.`,
      workspace: wsUri,
    }, { status: 503 });
  }

  log.info({ port: srv.port, pid: srv.pid, workspace: srv.workspace }, 'Matched server');

  try {
    // Step 1: AddTrackedWorkspace
    const workspacePath = wsUri.replace(/^file:\/\//, '');
    log.debug({ port: srv.port, workspacePath }, 'Step1 AddTrackedWorkspace');
    const addResult = await grpc.addTrackedWorkspace(srv.port, srv.csrf, workspacePath);
    log.debug({ response: addResult }, 'Step1 Response');

    // Step 2: StartCascade
    log.debug({ port: srv.port, wsUri }, 'Step2 StartCascade');
    const data = await grpc.startCascade(srv.port, srv.csrf, apiKey, wsUri);
    log.debug({ cascadeId: data.cascadeId }, 'Step2 Response');

    // Step 3: UpdateConversationAnnotations + local tracking
    if (data.cascadeId) {
      const wsName = wsUri.split('/').pop() || 'conversation';
      addLocalConversation(data.cascadeId, wsUri, `New: ${wsName}`);

      log.debug({ cascadeId: data.cascadeId }, 'Step3 UpdateAnnotations');
      const nowTs = new Date().toISOString();
      const annotResult = await grpc.updateConversationAnnotations(srv.port, srv.csrf, apiKey, data.cascadeId, {
        lastUserViewTime: nowTs,
        summary: `Antigravity Web: ${wsName} (${new Date().toLocaleTimeString()})`
      }).catch((e: any) => { log.error({ err: e.message }, 'Step3 Error'); return null; });
      log.debug({ response: annotResult }, 'Step3 Response');

      // Pre-register in ownerMap — survives refreshOwnerMap() clears for 60s
      preRegisterOwner(data.cascadeId, {
        port: srv.port,
        csrf: srv.csrf,
        apiKey,
        stepCount: 0,
      });
    }
    log.info({ cascadeId: data.cascadeId }, 'Conversation created successfully');
    return NextResponse.json(data);
  } catch (e: any) {
    log.error({ err: e.message }, 'Conversation creation failed');
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
