import { NextResponse } from 'next/server';
import { discoverLanguageServers } from '@/lib/bridge/gateway';
import { closeAntigravityWindow } from '@/lib/window-control';
import { createLogger } from '@/lib/logger';

const log = createLogger('Kill');

export const dynamic = 'force-dynamic';

/**
 * POST /api/workspaces/kill — Actually stop a workspace's language_server process.
 * 
 * ⚠️ WARNING: This kills the language_server process. If the workspace is also
 * open in Agent Manager, Agent Manager will lose connection and show errors.
 * Use POST /api/workspaces/close (hide) if you just want to remove it from the sidebar.
 */
export async function POST(req: Request) {
  const { workspace } = await req.json();
  if (!workspace) {
    return NextResponse.json({ error: 'Missing workspace' }, { status: 400 });
  }

  const servers = await discoverLanguageServers();
  const target = servers.find(s =>
    s.workspace === workspace ||
    s.workspace?.includes(workspace) ||
    workspace.includes(s.workspace || '\0')
  );

  if (!target) {
    return NextResponse.json({ error: 'No server found for this workspace' }, { status: 404 });
  }

  log.info({ workspace }, 'Trying to close Antigravity window');

  try {
    const success = await closeAntigravityWindow(workspace);
    if (!success) {
      log.warn({ pid: target.pid }, 'Window not found via AppleScript, falling back to process.kill (SIGKILL)');
      try { process.kill(target.pid, 'SIGKILL'); } catch (e) {}
    }
    return NextResponse.json({ ok: true, killed: { pid: target.pid, port: target.port, windowClosed: success } });
  } catch (e: any) {
    log.error({ err: e.message, workspace }, 'Failed to clean up workspace');
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
