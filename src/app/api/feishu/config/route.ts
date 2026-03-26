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
    feishuConfigStore.set({
      appId: config.appId || '',
      appSecret: config.appSecret || ''
    });

    // Start or restart the WebSocket client
    const wsResult = await startFeishuClient();
    
    if (!wsResult.success) {
      return NextResponse.json({ error: wsResult.error || '连线飞书失败' }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
