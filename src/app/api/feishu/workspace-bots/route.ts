import { NextResponse } from 'next/server';
import { workspaceBotStore } from '@/lib/feishu/config';
import { startWorkspaceBotClient, stopWorkspaceBotClient, getWorkspaceBotStatuses } from '@/lib/feishu/bot';

export const dynamic = 'force-dynamic';

/**
 * GET /api/feishu/workspace-bots
 * 获取所有工作区专属机器人的配置与连接状态
 */
export async function GET() {
  const statuses = getWorkspaceBotStatuses();
  return NextResponse.json({ bots: statuses });
}

/**
 * POST /api/feishu/workspace-bots
 * 绑定/更新一个工作区的独立飞书机器人配置
 * Body: { workspaceUri, appId, appSecret, label?, enabled? }
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { workspaceUri, appId, appSecret, label, enabled, preferredModel } = body;

    if (!workspaceUri) {
      return NextResponse.json({ error: '缺少工作区 URI' }, { status: 400 });
    }

    const botConfig = {
      workspaceUri,
      appId: appId || '',
      appSecret: appSecret || '',
      label: label || '',
      preferredModel: preferredModel || undefined,
      enabled: enabled !== false // 默认启用
    };

    // Save config
    workspaceBotStore.upsert(botConfig);

    // Tell the main generic server process to restart the WS connection
    const port = process.env.PORT || '3000';
    if (botConfig.enabled && botConfig.appId && botConfig.appSecret) {
      let r = { success: false, error: 'Unknown' };
      try {
         const resp = await fetch(`http://127.0.0.1:${port}/_internal/feishu/restart_workspace`, {
            method: 'POST',
            headers: { 'x-internal-token': process.env.INTERNAL_ACCESS_TOKEN || '' },
            body: JSON.stringify({ action: 'upsert', workspaceUri, enabled: true, config: botConfig })
         });
         r = await resp.json();
      } catch (e: any) { r.error = e.message; }
      
      if (!r.success) {
        return NextResponse.json({ ok: false, error: `配置已保存，但机器人连接失败: ${r.error}` }, { status: 400 });
      }
      return NextResponse.json({ ok: true, message: '独立机器人已启动连接' });
    } else {
      try {
        await fetch(`http://127.0.0.1:${port}/_internal/feishu/restart_workspace`, {
           method: 'POST',
           headers: { 'x-internal-token': process.env.INTERNAL_ACCESS_TOKEN || '' },
           body: JSON.stringify({ action: 'upsert', workspaceUri, enabled: false })
        });
      } catch {}
      return NextResponse.json({ ok: true, message: '配置已保存（未启用或凭证不完整）' });
    }
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

/**
 * DELETE /api/feishu/workspace-bots
 * 解绑一个工作区的独立飞书机器人
 * Body: { appId }
 */
export async function DELETE(req: Request) {
  try {
    const body = await req.json();
    const { appId } = body;
    if (!appId) {
      return NextResponse.json({ error: '缺少 appId' }, { status: 400 });
    }

    // Lookup the workspace URI before removing so we can stop the client
    const bot = workspaceBotStore.getByAppId(appId);
    workspaceBotStore.remove(appId);
    
    if (bot) {
      try {
        const port = process.env.PORT || '3000';
        await fetch(`http://127.0.0.1:${port}/_internal/feishu/restart_workspace`, {
           method: 'POST',
           headers: { 'x-internal-token': process.env.INTERNAL_ACCESS_TOKEN || '' },
           body: JSON.stringify({ action: 'delete', workspaceUri: bot.workspaceUri })
        });
      } catch (e) {}
    }
    return NextResponse.json({ ok: true, message: '已解绑' });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
