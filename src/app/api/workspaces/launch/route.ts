import { NextResponse } from 'next/server';
import { execFileSync } from 'child_process';
import { existsSync } from 'fs';
import path from 'path';
import { createLogger } from '@/lib/logger';

const log = createLogger('Launch');

export const dynamic = 'force-dynamic';

function getAntigravityCli(): string {
  if (process.platform === 'win32') {
    const localApp = process.env.LOCALAPPDATA || '';
    const winCli = path.join(localApp, 'Programs', 'antigravity', 'Antigravity.exe');
    if (existsSync(winCli)) return winCli;
    return 'antigravity';
  }
  return '/Applications/Antigravity.app/Contents/Resources/app/bin/antigravity';
}

/**
 * POST /api/workspaces/launch — Open a workspace in Antigravity (triggers language_server start)
 */
export async function POST(req: Request) {
  const { workspace } = await req.json();
  if (!workspace) {
    return NextResponse.json({ error: 'Missing workspace path' }, { status: 400 });
  }

  let wsPath = decodeURIComponent(workspace.replace(/^file:\/\//, ''));
  if (process.platform === 'win32' && /^\/[a-zA-Z]:/.test(wsPath)) {
    wsPath = wsPath.slice(1);
  }

  log.info({ wsPath }, 'Opening workspace');

  try {
    execFileSync(getAntigravityCli(), ['--new-window', wsPath], {
      timeout: 5000,
      stdio: 'ignore',
    });
    log.info({ wsPath }, 'Antigravity CLI executed');
    return NextResponse.json({ ok: true, launched: wsPath });
  } catch (e: any) {
    log.error({ err: e.message, wsPath }, 'Launch failed');
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

