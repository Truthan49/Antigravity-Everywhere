import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import util from 'util';
import path from 'path';
import os from 'os';

const execAsync = util.promisify(exec);

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get('q');
  
  if (!q || q.trim().length < 2) {
    return NextResponse.json({ results: [] });
  }

  try {
    const convDir = path.join(os.homedir(), '.gemini', 'antigravity', 'conversations');
    // Use grep -a (process as text), -i (ignore case), -m 2 (max 2 matches per file), -H (print filename)
    // -o (only matching, maybe with context? No, just match the line to keep it simple)
    // grep might fail if no match is found, which is fine (exit code 1)
    const escapedQuery = q.replace(/"/g, '\\"');
    
    // Using grep -a -i -H "${q}" *.pb
    // Limit to latest modified files? For now, grep is fast enough for <1000 files.
    const cmd = `cd "${convDir}" && grep -a -i -H -m 2 "${escapedQuery}" *.pb || true`;
    
    const { stdout } = await execAsync(cmd, { timeout: 5000 });
    
    if (!stdout.trim()) {
      return NextResponse.json({ results: [] });
    }

    const lines = stdout.trim().split('\n');
    const matchedIds = new Set<string>();
    const snippets: Record<string, string[]> = {};

    for (const line of lines) {
      if (!line) continue;
      // Format is "filename.pb:matched text..." or "Binary file filename.pb matches" (if we forgot -a)
      const separatorIdx = line.indexOf(':');
      if (separatorIdx === -1) continue;
      
      const file = line.slice(0, separatorIdx);
      const text = line.slice(separatorIdx + 1);
      
      if (!file.endsWith('.pb')) continue;
      
      const id = file.replace('.pb', '');
      matchedIds.add(id);
      
      // Clean up the protobuf binary characters to make the snippet readable
      const cleanSnippet = text.replace(/[^\x20-\x7E\u4e00-\u9fa5]/g, ' ').replace(/\s+/g, ' ').trim();
      if (cleanSnippet.length > 0) {
        if (!snippets[id]) snippets[id] = [];
        // Only keep snippets that actually contain the query text (case-insensitive)
        if (cleanSnippet.toLowerCase().includes(q.toLowerCase())) {
           // highlight or truncate snippet
           const idx = cleanSnippet.toLowerCase().indexOf(q.toLowerCase());
           const start = Math.max(0, idx - 40);
           const end = Math.min(cleanSnippet.length, idx + q.length + 40);
           snippets[id].push((start > 0 ? '...' : '') + cleanSnippet.substring(start, end) + (end < cleanSnippet.length ? '...' : ''));
        }
      }
    }

    return NextResponse.json({ 
      success: true, 
      results: Array.from(matchedIds).map(id => ({ id, snippets: snippets[id] || [] })) 
    });

  } catch (error: any) {
    console.error('Search API Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
