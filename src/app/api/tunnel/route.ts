import { NextResponse } from 'next/server';
import { getTunnelStatus } from '@/lib/bridge/tunnel';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json(getTunnelStatus());
}
