import { NextResponse } from 'next/server';
import { readFileSync, existsSync } from 'fs';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const pathParam = searchParams.get('path');
  
  if (!pathParam) {
    return NextResponse.json({ error: 'Missing path parameter' }, { status: 400 });
  }
  
  const absolutePath = pathParam.replace('file://', '');
  
  if (!existsSync(absolutePath)) {
    return NextResponse.json({ error: 'File not found' }, { status: 404 });
  }

  try {
    const fileBuffer = readFileSync(absolutePath);
    const ext = absolutePath.split('.').pop() || '';
    
    // Guess basic image mime types
    let contentType = 'application/octet-stream';
    if (ext.match(/^(jpg|jpeg)$/i)) contentType = 'image/jpeg';
    else if (ext.match(/^png$/i)) contentType = 'image/png';
    else if (ext.match(/^gif$/i)) contentType = 'image/gif';
    else if (ext.match(/^webp$/i)) contentType = 'image/webp';
    else if (ext.match(/^svg$/i)) contentType = 'image/svg+xml';
    
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
