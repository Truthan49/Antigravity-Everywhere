import { NextResponse } from 'next/server';
import { tryAllServers, grpc } from '@/lib/bridge/gateway';
import { getGlobalModel, setGlobalModel } from '@/lib/bridge/statedb';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const data = await tryAllServers((p, c, a) => grpc.getModelConfigs(p, c, a));
    return NextResponse.json({ ...data, globalPreferredModel: getGlobalModel() });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const { model } = await req.json();
    if (model) setGlobalModel(model);
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
