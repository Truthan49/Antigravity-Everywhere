import { NextResponse } from 'next/server';
import { getWorkspaces, getPlaygrounds } from '@/lib/bridge/gateway';

export const dynamic = 'force-dynamic';

export async function GET() {
  const workspaces = getWorkspaces();
  const playgrounds = getPlaygrounds();
  return NextResponse.json({ workspaces, playgrounds });
}
