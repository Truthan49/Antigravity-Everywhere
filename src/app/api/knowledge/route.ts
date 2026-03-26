import { NextResponse } from 'next/server';
import { readdirSync, readFileSync, statSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { randomUUID } from 'crypto';

export const dynamic = 'force-dynamic';

const KNOWLEDGE_DIR = join(homedir(), '.gemini', 'antigravity', 'knowledge');

interface KnowledgeItem {
  id: string;
  title: string;
  summary: string;
  references: Array<{ type: string; value: string }>;
  timestamps: { created: string; modified: string; accessed: string };
  artifactFiles: string[];
}

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

export async function GET() {
  try {
    const entries = readdirSync(KNOWLEDGE_DIR, { withFileTypes: true });
    const items: KnowledgeItem[] = [];

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const kiDir = join(KNOWLEDGE_DIR, entry.name);
      const metaPath = join(kiDir, 'metadata.json');
      const tsPath = join(kiDir, 'timestamps.json');

      try {
        statSync(metaPath);
      } catch {
        continue; // skip dirs without metadata
      }

      const meta = JSON.parse(readFileSync(metaPath, 'utf-8'));
      let timestamps = { created: '', modified: '', accessed: '' };
      try {
        timestamps = JSON.parse(readFileSync(tsPath, 'utf-8'));
      } catch { /* optional */ }

      const artifactFiles = listArtifactFiles(join(kiDir, 'artifacts'));

      items.push({
        id: entry.name,
        title: meta.title || entry.name,
        summary: meta.summary || '',
        references: meta.references || [],
        timestamps,
        artifactFiles,
      });
    }

    // Sort by last accessed (most recent first)
    items.sort((a, b) => {
      const ta = new Date(a.timestamps.accessed || 0).getTime();
      const tb = new Date(b.timestamps.accessed || 0).getTime();
      return tb - ta;
    });

    return NextResponse.json(items);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const { title, summary, references } = await req.json();
    if (!title) {
      return NextResponse.json({ error: 'Title is required' }, { status: 400 });
    }

    const id = randomUUID().replace(/-/g, '');
    const kiDir = join(KNOWLEDGE_DIR, id);
    
    // Create directories
    mkdirSync(kiDir, { recursive: true });
    mkdirSync(join(kiDir, 'artifacts'), { recursive: true });
    
    const now = new Date().toISOString();
    const metadata = {
      title,
      summary: summary || '',
      references: references || []
    };
    const timestamps = {
      created: now,
      modified: now,
      accessed: now
    };
    
    writeFileSync(join(kiDir, 'metadata.json'), JSON.stringify(metadata, null, 2));
    writeFileSync(join(kiDir, 'timestamps.json'), JSON.stringify(timestamps, null, 2));
    
    return NextResponse.json({
      id,
      title: metadata.title,
      summary: metadata.summary,
      references: metadata.references,
      timestamps,
      artifactFiles: []
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}


