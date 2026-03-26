import { NextResponse } from 'next/server';
import { getUserInfo, getDefaultConnection, grpc } from '@/lib/bridge/gateway';

export const dynamic = 'force-dynamic';

export async function GET() {
  const user = getUserInfo();
  const conn = await getDefaultConnection();
  let credits = null;
  if (conn) {
    try {
      credits = await grpc.getModelConfigs(conn.port, conn.csrf, conn.apiKey);
    } catch {}
  }
  return NextResponse.json({ ...user, apiKey: undefined, hasApiKey: !!user.apiKey, credits });
}
