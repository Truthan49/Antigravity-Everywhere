import { NextResponse } from 'next/server';
import { getUserInfo, getDefaultConnection, grpc } from '@/lib/bridge/gateway';

export const dynamic = 'force-dynamic';

export async function GET() {
  const user = getUserInfo();
  const conn = await getDefaultConnection();
  let credits = null;
  if (conn) {
    if (!user.name) {
      try {
        const statusRes = await grpc.getUserStatus(conn.port, conn.csrf);
        const us = statusRes?.userStatus;
        if (us) {
          user.name = us.name || user.name;
          user.email = us.email || user.email;
        }
      } catch {}
    }
    try {
      credits = await grpc.getModelConfigs(conn.port, conn.csrf, conn.apiKey);
    } catch {}
  }
  return NextResponse.json({ ...user, apiKey: undefined, hasApiKey: !!user.apiKey, credits });
}
