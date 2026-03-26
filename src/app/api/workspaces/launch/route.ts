import { NextResponse } from 'next/server';
import { execSync } from 'child_process';
import { createLogger } from '@/lib/logger';

const log = createLogger('Launch');

export const dynamic = 'force-dynamic';

const ANTIGRAVITY_CLI = '/Applications/Antigravity.app/Contents/Resources/app/bin/antigravity';

/**
 * POST /api/workspaces/launch — Open a workspace in Antigravity (triggers language_server start)
 */
export async function POST(req: Request) {
  const { workspace } = await req.json();
  if (!workspace) {
    return NextResponse.json({ error: 'Missing workspace path' }, { status: 400 });
  }

  // Remove file:// prefix if present
  const wsPath = workspace.replace(/^file:\/\//, '');

  log.info({ wsPath }, 'Opening workspace');

  try {
    execSync(`"${ANTIGRAVITY_CLI}" --new-window "${wsPath}"`, {
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
