import { NextResponse } from 'next/server';
import { createLogger } from '@/lib/logger';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import path from 'path';
import { minimizeAntigravityWindow } from '@/lib/window-control';

export const dynamic = 'force-dynamic';

const log = createLogger('Workspace');

const DATA_DIR = path.join(process.cwd(), '..', 'data');
const HIDDEN_FILE = path.join(DATA_DIR, 'hidden_workspaces.json');

function readHidden(): string[] {
  try { return JSON.parse(readFileSync(HIDDEN_FILE, 'utf-8')); } catch { return []; }
}

function writeHidden(list: string[]) {
  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(HIDDEN_FILE, JSON.stringify(list, null, 2));
}

/**
 * POST /api/workspaces/close — Hide a workspace from the React UI sidebar.
 * 
 * IMPORTANT: This does NOT kill the language_server process.
 * The server stays running in the background (same behavior as Agent Manager's "Keep in Background").
 * The workspace is simply hidden from the React frontend's server list.
 */
export async function POST(req: Request) {
  const { workspace } = await req.json();
  if (!workspace) {
    return NextResponse.json({ error: 'Missing workspace' }, { status: 400 });
  }

  const hidden = readHidden();
  if (!hidden.includes(workspace)) {
    hidden.push(workspace);
    writeHidden(hidden);
  }

  log.info({ workspace }, 'Hidden workspace from UI (server still running)');
  
  // Also try to minimize the actual Antigravity window so it's out of the way
  const windowMinimized = await minimizeAntigravityWindow(workspace);
  if (windowMinimized) {
    log.info({ workspace }, 'Minimized Antigravity window');
  }

  return NextResponse.json({ ok: true, hidden: true, windowMinimized });
}

/**
 * GET /api/workspaces/close — List currently hidden workspaces
 */
export async function GET() {
  return NextResponse.json(readHidden());
}

/**
 * DELETE /api/workspaces/close — Unhide a workspace (show it again in sidebar)
 */
export async function DELETE(req: Request) {
  const { workspace } = await req.json();
  if (!workspace) {
    return NextResponse.json({ error: 'Missing workspace' }, { status: 400 });
  }

  const hidden = readHidden().filter(w => w !== workspace);
  writeHidden(hidden);

  log.info({ workspace }, 'Unhidden workspace');
  return NextResponse.json({ ok: true, hidden: false });
}

