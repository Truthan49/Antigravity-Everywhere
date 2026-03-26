import { NextResponse } from 'next/server';
import { readFileSync, writeFileSync, rmSync, existsSync, readdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

export const dynamic = 'force-dynamic';

const KNOWLEDGE_DIR = join(homedir(), '.gemini', 'antigravity', 'knowledge');

function listArtifactFiles(artifactsDir: string, base = ''): string[] {
  const files: string[] = [];
  try {
    for (const entry of readdirSync(artifactsDir, { withFileTypes: true })) {
      const rel = base ? `${base}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        files.push(...listArtifactFiles(join(artifactsDir, entry.name), rel));
      } else if (entry.name.endsWith('.md')) {
        files.push(rel);
      }
    }
  } catch { /* dir missing */ }
  return files;
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const kiDir = join(KNOWLEDGE_DIR, id);
  const metaPath = join(kiDir, 'metadata.json');

  if (!existsSync(metaPath)) {
    return NextResponse.json({ error: 'Knowledge item not found' }, { status: 404 });
  }

  try {
    const meta = JSON.parse(readFileSync(metaPath, 'utf-8'));
    let timestamps = { created: '', modified: '', accessed: '' };
    try {
      timestamps = JSON.parse(readFileSync(join(kiDir, 'timestamps.json'), 'utf-8'));
    } catch { /* optional */ }

    const artifactsDir = join(kiDir, 'artifacts');
    const artifactFiles = listArtifactFiles(artifactsDir);

    // Read all artifact contents
    const artifacts: Record<string, string> = {};
    for (const f of artifactFiles) {
      try {
        artifacts[f] = readFileSync(join(artifactsDir, f), 'utf-8');
      } catch { /* skip unreadable */ }
    }

    return NextResponse.json({
      id,
      title: meta.title || id,
      summary: meta.summary || '',
      references: meta.references || [],
      timestamps,
      artifactFiles,
      artifacts,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const kiDir = join(KNOWLEDGE_DIR, id);
  const metaPath = join(kiDir, 'metadata.json');

  if (!existsSync(metaPath)) {
    return NextResponse.json({ error: 'Knowledge item not found' }, { status: 404 });
  }

  try {
    const body = await req.json();
    const meta = JSON.parse(readFileSync(metaPath, 'utf-8'));

    // Update allowed fields
    if (body.title !== undefined) meta.title = body.title;
    if (body.summary !== undefined) meta.summary = body.summary;
    if (body.references !== undefined) meta.references = body.references;

    writeFileSync(metaPath, JSON.stringify(meta, null, 2), 'utf-8');

    // Update timestamps
    const tsPath = join(kiDir, 'timestamps.json');
    let timestamps = { created: '', modified: '', accessed: '' };
    try {
      timestamps = JSON.parse(readFileSync(tsPath, 'utf-8'));
    } catch { /* */ }
    timestamps.modified = new Date().toISOString();
    writeFileSync(tsPath, JSON.stringify(timestamps, null, 2), 'utf-8');

    return NextResponse.json({ ok: true, title: meta.title, summary: meta.summary });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const kiDir = join(KNOWLEDGE_DIR, id);

  if (!existsSync(kiDir)) {
    return NextResponse.json({ error: 'Knowledge item not found' }, { status: 404 });
  }

  try {
    rmSync(kiDir, { recursive: true, force: true });
    return NextResponse.json({ ok: true, deleted: id });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
