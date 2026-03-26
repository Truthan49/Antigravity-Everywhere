import { NextResponse } from 'next/server';
import { getAllConnections, grpc } from '@/lib/bridge/gateway';

export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: cascadeId } = await params;
  try {
    const conns = await getAllConnections();
    let checkpointData: any = null;
    for (const conn of conns) {
      try {
        await grpc.loadTrajectory(conn.port, conn.csrf, cascadeId);
        const data = await grpc.getTrajectorySteps(conn.port, conn.csrf, conn.apiKey, cascadeId);
        if (data?.steps?.length) {
          checkpointData = data;
          break;
        }
      } catch {}
    }

    if (!checkpointData) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
    }
    return NextResponse.json(checkpointData);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
