import { NextResponse } from 'next/server';
import path from 'path';
import { homedir } from 'os';
import { readFileSync } from 'fs';

export const dynamic = 'force-dynamic';

export async function GET() {
  const mcpPath = path.join(homedir(), '.gemini/antigravity/mcp_config.json');
  try {
    const content = readFileSync(mcpPath, 'utf-8');
    if (!content.trim()) return NextResponse.json({ servers: [] });
    return NextResponse.json(JSON.parse(content));
  } catch {
    return NextResponse.json({ servers: [] });
  }
}
