import { NextResponse } from 'next/server';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { homedir } from 'os';

export const dynamic = 'force-dynamic';

const KNOWLEDGE_DIR = join(homedir(), '.gemini', 'antigravity', 'knowledge');

export async function GET(_req: Request, { params }: { params: Promise<{ id: string; path: string[] }> }) {
  const { id, path } = await params;
  const filePath = join(KNOWLEDGE_DIR, id, 'artifacts', ...path);

  if (!existsSync(filePath)) {
    return NextResponse.json({ error: 'Artifact not found' }, { status: 404 });
  }

  try {
    const content = readFileSync(filePath, 'utf-8');
    return NextResponse.json({ path: path.join('/'), content });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string; path: string[] }> }) {
  const { id, path } = await params;
  const filePath = join(KNOWLEDGE_DIR, id, 'artifacts', ...path);

  // Security: ensure the path doesn't escape the knowledge directory
  const resolved = join(KNOWLEDGE_DIR, id, 'artifacts', ...path);
  if (!resolved.startsWith(join(KNOWLEDGE_DIR, id))) {
    return NextResponse.json({ error: 'Invalid path' }, { status: 400 });
  }

  try {
    const body = await req.json();
    if (typeof body.content !== 'string') {
      return NextResponse.json({ error: 'content field required (string)' }, { status: 400 });
    }

    // Ensure parent directory exists
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, body.content, 'utf-8');

    // Update timestamps
    const tsPath = join(KNOWLEDGE_DIR, id, 'timestamps.json');
    let timestamps = { created: '', modified: '', accessed: '' };
    try {
      timestamps = JSON.parse(readFileSync(tsPath, 'utf-8'));
    } catch { /* */ }
    timestamps.modified = new Date().toISOString();
    writeFileSync(tsPath, JSON.stringify(timestamps, null, 2), 'utf-8');

    return NextResponse.json({ ok: true, path: path.join('/') });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
