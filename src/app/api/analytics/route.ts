import { NextResponse } from 'next/server';
import { tryAllServers, grpc } from '@/lib/bridge/gateway';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const data = await tryAllServers((p, c, a) => grpc.getUserAnalyticsSummary(p, c, a));
    return NextResponse.json(data);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
