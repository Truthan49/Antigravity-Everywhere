import { NextResponse } from 'next/server';
import { discoverLanguageServers } from '@/lib/bridge/gateway';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json(await discoverLanguageServers());
}
