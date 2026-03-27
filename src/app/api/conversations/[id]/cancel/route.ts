import { NextResponse } from 'next/server';
import { getOwnerConnection, grpc } from '@/lib/bridge/gateway';

export const dynamic = 'force-dynamic';

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  let { id: cascadeId } = await params;
  const conn = await getOwnerConnection(cascadeId);
  if (!conn) return NextResponse.json({ error: 'No server available' }, { status: 503 });
  cascadeId = conn.resolvedCascadeId || cascadeId;
  try {
    const data = await grpc.cancelCascade(conn.port, conn.csrf, conn.apiKey, cascadeId);
    return NextResponse.json({ ok: true, data });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
