import { NextResponse } from 'next/server';
import { readFileSync, existsSync } from 'fs';
import path from 'path';
import os from 'os';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const pathParam = searchParams.get('path');
  
  if (!pathParam) {
    return NextResponse.json({ error: 'Missing path parameter' }, { status: 400 });
  }
  
  let absolutePath = pathParam.replace('file://', '');
  
  // Security Fix: Prevent Local File Inclusion (LFI) / Path Traversal
  try {
    absolutePath = path.resolve(absolutePath); // Resolve to absolute path, neutralizing ../
    
    const homeDir = os.homedir();
    // Allow access to the user's home directory (since AI might edit files anywhere in home)
    if (!absolutePath.startsWith(homeDir)) {
      console.warn(`[Security] Blocked unauthorized file access: ${absolutePath}`);
      return NextResponse.json({ error: 'Forbidden path access' }, { status: 403 });
    }
  } catch (err) {
    return NextResponse.json({ error: 'Invalid path format' }, { status: 400 });
  }
  
  if (!existsSync(absolutePath)) {
    return NextResponse.json({ error: 'File not found' }, { status: 404 });
  }

  try {
    const fileBuffer = readFileSync(absolutePath);
    const ext = absolutePath.split('.').pop()?.toLowerCase() || '';
    
    // Extended MIME types for better browser rendering
    const mimeTypes: Record<string, string> = {
      'jpg': 'image/jpeg',
      'jpeg': 'image/jpeg',
      'png': 'image/png',
      'gif': 'image/gif',
      'webp': 'image/webp',
      'svg': 'image/svg+xml',
      'pdf': 'application/pdf',
      'mp4': 'video/mp4',
      'mp3': 'audio/mpeg',
      'json': 'application/json',
      'md': 'text/markdown',
      'txt': 'text/plain',
      'js': 'application/javascript',
      'css': 'text/css'
    };
    
    const contentType = mimeTypes[ext] || 'application/octet-stream';
    
    return new NextResponse(fileBuffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

