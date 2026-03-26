import { NextRequest, NextResponse } from 'next/server';
import { saveTunnelConfig, TunnelConfig } from '@/lib/bridge/tunnel';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { tunnelName, url, credentialsPath, autoStart } = body;

  if (!tunnelName) {
    return NextResponse.json({ error: 'tunnelName is required' }, { status: 400 });
  }
  if (!url) {
    return NextResponse.json({ error: 'url is required' }, { status: 400 });
  }

  const config: TunnelConfig = {
    tunnelName,
    url,
    credentialsPath: credentialsPath || undefined,
    autoStart: autoStart || false,
  };

  saveTunnelConfig(config);
  console.log(`🌐 Tunnel configured: ${tunnelName} → ${url}`);
  return NextResponse.json({ success: true, config });
}
