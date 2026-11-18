import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { getAllConnections, grpc } from '@/lib/bridge/gateway';
import { removeLocalConversations } from '@/lib/bridge/statedb';

export async function POST(req: Request) {
  try {
    const { action, ids } = await req.json();

    if (!action || !Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: 'Missing action or ids array' }, { status: 400 });
    }

    if (action === 'delete') {
      const convDir = path.join(os.homedir(), '.gemini', 'antigravity', 'conversations');
      const annotDir = path.join(os.homedir(), '.gemini', 'antigravity', 'annotations');
      const conns = await getAllConnections().catch(() => []);
      let deletedCount = 0;
      let failedCount = 0;
      const deletedIds: string[] = [];

      for (const id of ids) {
        // Sanitize ID to prevent directory traversal
        const safeId = path.basename(String(id || ''));
        if (!safeId) continue;

        let deletedThis = false;

        // 1. Delete via language_server gRPC so conversation_summaries.db and in-memory state stay in sync
        for (const conn of conns) {
          try {
            await grpc.deleteCascadeTrajectory(conn.port, conn.csrf, safeId);
            deletedThis = true;
          } catch {}
        }

        // 2. Clean up any remaining .pb / .db / annotation files on disk
        const candidates = [
          path.join(convDir, `${safeId}.pb`),
          path.join(convDir, `${safeId}.db`),
          path.join(convDir, `${safeId}.db-wal`),
          path.join(convDir, `${safeId}.db-shm`),
          path.join(annotDir, `${safeId}.pbtxt`),
        ];
        try {
          for (const target of candidates) {
            if (fs.existsSync(target)) {
              fs.rmSync(target, { force: true });
              deletedThis = true;
            }
          }
        } catch (e: any) {
          console.error(`Failed to delete conversation ${safeId}:`, e.message);
          if (!deletedThis) failedCount++;
        }

        if (deletedThis) {
          deletedCount++;
          deletedIds.push(safeId);
        }
      }

      if (deletedIds.length > 0) {
        removeLocalConversations(deletedIds);
      }

      return NextResponse.json({ success: true, deletedCount, failedCount });
    }

    return NextResponse.json({ error: 'Unsupported action' }, { status: 400 });

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
