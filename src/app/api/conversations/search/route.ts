import { NextResponse } from 'next/server';
import { execFile } from 'child_process';
import util from 'util';
import path from 'path';
import os from 'os';
import * as fs from 'fs';

const execFileAsync = util.promisify(execFile);

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get('q');
  
  if (!q || q.trim().length < 2) {
    return NextResponse.json({ results: [] });
  }

  try {
    const convDir = path.join(os.homedir(), '.gemini', 'antigravity', 'conversations');
    if (!fs.existsSync(convDir)) {
      return NextResponse.json({ results: [] });
    }
    
    // Get all .pb files safely using Node.js
    const files = fs.readdirSync(convDir).filter(f => f.endsWith('.pb'));
    if (files.length === 0) {
      return NextResponse.json({ results: [] });
    }

    // Use child_process.execFile to safely pass user input as an argument.
    // This prevents Command Injection (RCE) by completely avoiding a shell.
    let stdout = '';
    try {
      const { stdout: out } = await execFileAsync('grep', ['-a', '-i', '-H', '-m', '2', q, ...files], { 
        cwd: convDir,
        timeout: 5000 
      });
      stdout = out;
    } catch (err: any) {
      // grep exits with 1 if no matches are found, which is fine.
      if (err.code === 1) {
        stdout = '';
      } else {
        throw err;
      }
    }

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
