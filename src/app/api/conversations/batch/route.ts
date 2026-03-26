import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import os from 'os';

export async function POST(req: Request) {
  try {
    const { action, ids } = await req.json();

    if (!action || !Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: 'Missing action or ids array' }, { status: 400 });
    }

    if (action === 'delete') {
      const convDir = path.join(os.homedir(), '.gemini', 'antigravity', 'conversations');
      let deletedCount = 0;
      let failedCount = 0;

      for (const id of ids) {
        // Sanitize ID to prevent directory traversal
        const safeId = path.basename(id);
        if (!safeId) continue;

        const dbPath = path.join(convDir, `${safeId}.pb`);
        try {
          if (fs.existsSync(dbPath)) {
            fs.rmSync(dbPath, { force: true });
            deletedCount++;
          }
        } catch (e: any) {
          console.error(`Failed to delete conversation ${safeId}:`, e.message);
          failedCount++;
        }
      }

      return NextResponse.json({ success: true, deletedCount, failedCount });
    }

    return NextResponse.json({ error: 'Unsupported action' }, { status: 400 });

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
