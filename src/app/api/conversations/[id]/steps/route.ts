import { NextResponse } from 'next/server';
import { getOwnerConnection, getAllConnections, refreshOwnerMap, ownerMapAge, grpc } from '@/lib/bridge/gateway';

export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: cascadeId } = await params;
  try {
    // Ensure owner map is reasonably fresh (refresh if > 30s old)
    if (Date.now() - ownerMapAge > 30_000) {
      await refreshOwnerMap();
    }

    // 1. Try the smart owner connection first (workspace-matched, highest step count)
    let checkpointData: any = null;
    const owner = await getOwnerConnection(cascadeId);
    if (owner) {
      try {
        await grpc.loadTrajectory(owner.port, owner.csrf, cascadeId);
        const data = await grpc.getTrajectorySteps(owner.port, owner.csrf, owner.apiKey, cascadeId);
        if (data?.steps?.length) {
          checkpointData = data;
        }
      } catch {}
    }

    // 2. Fallback: scan all servers if owner didn't have it
    if (!checkpointData) {
      const conns = await getAllConnections();
      for (const conn of conns) {
        if (owner && conn.port === owner.port) continue; // already tried
        try {
          await grpc.loadTrajectory(conn.port, conn.csrf, cascadeId);
          const data = await grpc.getTrajectorySteps(conn.port, conn.csrf, conn.apiKey, cascadeId);
          if (data?.steps?.length) {
            // Pick the one with the most steps (most up-to-date)
            if (!checkpointData || data.steps.length > (checkpointData.steps?.length || 0)) {
              checkpointData = data;
            }
          }
        } catch {}
      }
    }

    if (!checkpointData) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
    }
    return NextResponse.json(checkpointData);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
