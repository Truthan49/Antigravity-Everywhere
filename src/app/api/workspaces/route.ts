import { NextResponse } from 'next/server';
import { getWorkspaces, getPlaygrounds, getDynamicConversations, getAllConnections, grpc, normalizeWorkspaceUri } from '@/lib/bridge/gateway';

export const dynamic = 'force-dynamic';

export async function GET() {
  const workspaces = getWorkspaces().map(w => ({ ...w, uri: normalizeWorkspaceUri(w.uri) }));
  const seen = new Set(workspaces.map(w => w.uri));
  try {
    const conns = await getAllConnections();
    for (const conn of conns) {
      const projUris = await grpc.getAllProjectWorkspaces(conn.port, conn.csrf);
      for (const u of projUris) {
        const normalized = normalizeWorkspaceUri(u);
        if (normalized && !seen.has(normalized)) {
          seen.add(normalized);
          workspaces.push({ type: 'folder', uri: normalized });
        }
      }
    }
  } catch {}
  try {
    const convs = await getDynamicConversations();
    for (const c of convs) {
      const normalized = normalizeWorkspaceUri(c.workspace || '');
      if (normalized && !seen.has(normalized)) {
        seen.add(normalized);
        workspaces.push({ type: 'folder', uri: normalized });
      }
    }
  } catch {}
  const playgrounds = getPlaygrounds();
  return NextResponse.json({ workspaces, playgrounds });
}
