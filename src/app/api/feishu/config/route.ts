import { NextResponse } from 'next/server';
import { feishuConfigStore } from '@/lib/feishu/config';
import { startFeishuClient } from '@/lib/feishu/bot';

export const dynamic = 'force-dynamic';

export async function GET() {
  const config = feishuConfigStore.get();
  // Don't mask secrets here since it's a local CLI tool and the user needs to see/edit them.
  return NextResponse.json(config);
}

export async function POST(req: Request) {
  try {
    const config = await req.json();
    const prev = feishuConfigStore.get();
    const nextAppId = config.appId !== undefined ? (config.appId || '') : prev.appId;
    const nextAppSecret = config.appSecret !== undefined ? (config.appSecret || '') : prev.appSecret;
    const nextShowThoughts = config.showThoughts !== undefined ? Boolean(config.showThoughts) : Boolean(prev.showThoughts);

    feishuConfigStore.set({
      appId: nextAppId,
      appSecret: nextAppSecret,
      showThoughts: nextShowThoughts,
    });

    // Only restart the WebSocket client when credentials changed or explicitly requested
    const credentialsChanged = nextAppId !== prev.appId || nextAppSecret !== prev.appSecret;
    if (!credentialsChanged && config.showThoughts !== undefined && !config.restart) {
      return NextResponse.json({ ok: true });
    }

    // Call the custom server to start/restart the WebSocket client 
    // This avoids spawning long-lived WebSockets inside the ephemeral Next.js API worker.
    const port = process.env.PORT || '3000';
    let wsResult = { success: false, error: 'Unknown error' };
    try {
      const resp = await fetch(`http://127.0.0.1:${port}/_internal/feishu/restart_global`, { 
        method: 'POST',
        headers: { 'x-internal-token': process.env.INTERNAL_ACCESS_TOKEN || '' }
      });
      wsResult = await resp.json();
    } catch (err: any) {
      wsResult.error = err.message;
    }
    
    if (!wsResult.success) {
      return NextResponse.json({ error: wsResult.error || '连线飞书失败' }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
