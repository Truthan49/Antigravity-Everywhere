import { NextResponse } from 'next/server';
import { startTunnel } from '@/lib/bridge/tunnel';

export const dynamic = 'force-dynamic';

export async function POST() {
  const port = parseInt(process.env.PORT || '3000');
  const result = await startTunnel(port);
  return NextResponse.json(result);
}
