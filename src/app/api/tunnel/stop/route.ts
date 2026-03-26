import { NextResponse } from 'next/server';
import { stopTunnel } from '@/lib/bridge/tunnel';

export const dynamic = 'force-dynamic';

export async function POST() {
  const result = stopTunnel();
  return NextResponse.json(result);
}
