import { NextResponse } from 'next/server';
import { getOwnerConnection, grpc } from '@/lib/bridge/gateway';

export const dynamic = 'force-dynamic';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  let { id: cascadeId } = await params;
  const { searchParams } = new URL(req.url);
  const stepIndex = parseInt(searchParams.get('stepIndex') || '0');
  const model = searchParams.get('model') || '';
  const conn = await getOwnerConnection(cascadeId);
  if (!conn) return NextResponse.json({ error: 'No server available' }, { status: 503 });
  cascadeId = conn.resolvedCascadeId || cascadeId;
  try {
    const data = await grpc.getRevertPreview(conn.port, conn.csrf, conn.apiKey, cascadeId, stepIndex, model);
    return NextResponse.json(data);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
