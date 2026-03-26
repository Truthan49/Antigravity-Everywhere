import { NextResponse } from 'next/server';
import { getOwnerConnection, grpc } from '@/lib/bridge/gateway';

export const dynamic = 'force-dynamic';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: cascadeId } = await params;
  const { artifactUri, model } = await req.json();
  const conn = await getOwnerConnection(cascadeId);
  if (!conn) return NextResponse.json({ error: 'No server available' }, { status: 503 });
  try {
    const data = await grpc.proceedArtifact(conn.port, conn.csrf, conn.apiKey, cascadeId, artifactUri, model);
    return NextResponse.json({ ok: true, data });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
