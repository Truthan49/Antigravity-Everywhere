import { NextResponse } from 'next/server';
import { getOwnerConnection, refreshOwnerMap, convOwnerMap, ownerMapAge, grpc } from '@/lib/bridge/gateway';
import { createLogger } from '@/lib/logger';

const log = createLogger('SendMsg');

export const dynamic = 'force-dynamic';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  let { id: cascadeId } = await params;
  let { text, model, agenticMode = true, attachments } = await req.json();

  const conn = await getOwnerConnection(cascadeId);
  if (!conn) return NextResponse.json({ error: 'No server available' }, { status: 503 });
  
  // Use the resolved full cascade ID (short IDs like 'd71eb6d5' → full UUID)
  cascadeId = conn.resolvedCascadeId || cascadeId;

  attachments = attachments || {};
  attachments.items = attachments.items || [];

  // Parse @[path/to/file] mentions
  const fileRegex = /@\[(.*?)\]/g;
  let match;
  let lastIndex = 0;
  let originalText = text;
  text = ""; // Clear text so grpc.ts doesn't duplicate

  // 1. Resolve Global Workflows and Skills
  try {
    const { getGlobalItems } = await import('@/lib/global-agents');
    const globalWorkflows = getGlobalItems('workflows');
    const globalSkills = getGlobalItems('skills');

    // Replace /workflow-name with its content
    for (const wf of globalWorkflows) {
      const wfRegex = new RegExp(`(^|\\s)/${wf.name}\\b`, 'g');
      if (wfRegex.test(originalText)) {
        originalText = originalText.replace(wfRegex, `$1【全局工作流: ${wf.name}】\\n${wf.content}\\n\\n`);
      }
    }

    // Replace @skill-name with its content
    for (const skill of globalSkills) {
      const skillRegex = new RegExp(`(^|\\s)@${skill.name}\\b`, 'g');
      if (skillRegex.test(originalText)) {
        originalText = originalText.replace(skillRegex, `$1【环境技能/规范: ${skill.name}】\\n${skill.content}\\n\\n`);
      }
    }
  } catch (e) {
    log.error({ err: (e as Error).message }, 'Failed to resolve global agents in send interceptor');
  }

  let workspacePath = conn.workspace?.replace(/^file:\/\//, '') || process.cwd();

  while ((match = fileRegex.exec(originalText)) !== null) {
    // Push text before the match
    if (match.index > lastIndex) {
      attachments.items.push({ text: originalText.substring(lastIndex, match.index) });
    }

    const rawPath = match[1];
    let absoluteUri = rawPath.startsWith('/') ? `file://${rawPath}` : `file://${workspacePath}/${rawPath}`;
    
    // We omit workspaceUrisToRelativePaths because absoluteUri is sufficient 
    // for the Gateway to resolve the file reference in most setups.
    attachments.items.push({
      item: {
        file: {
          absoluteUri
        }
      }
    });

    lastIndex = fileRegex.lastIndex;
  }

  // Push remaining text
  if (lastIndex < originalText.length) {
    attachments.items.push({ text: originalText.substring(lastIndex) });
  }

  log.info({ cascadeId, ownerMapHas: convOwnerMap.has(cascadeId), ownerMapAgeMs: Date.now() - ownerMapAge, mode: agenticMode ? 'planning' : 'fast' }, 'Send message');

  if (!convOwnerMap.has(cascadeId) || Date.now() - ownerMapAge > 30_000) {
    await refreshOwnerMap();
    log.debug({ cascadeId, ownerMapHas: convOwnerMap.has(cascadeId) }, 'OwnerMap refreshed');
  }

  log.debug({ port: conn.port, model: model || 'default' }, 'Routing to server');
  try {
    // We pass `text=""` because we packed all text and file mentions into attachments.items
    const data = await grpc.sendMessage(conn.port, conn.csrf, conn.apiKey, cascadeId, text, model, agenticMode, attachments);
    return NextResponse.json({ ok: true, data });
  } catch (e: any) {
    log.error({ err: e.message, cascadeId }, 'Send message failed');
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
