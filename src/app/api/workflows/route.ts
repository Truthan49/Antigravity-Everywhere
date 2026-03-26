import { NextResponse } from 'next/server';
import { getAllConnections, grpc } from '@/lib/bridge/gateway';
import { existsSync, mkdirSync, copyFileSync, rmSync, writeFileSync } from 'fs';
import { homedir } from 'os';
import path from 'path';
import { exec } from 'child_process';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const { getGlobalItems } = await import('@/lib/global-agents');
    const globalWorkflows = getGlobalItems('workflows');

    const conns = await getAllConnections();
    const workflowMap = new Map<string, {name: string, description: string, path: string, content: string, scope: string, baseDir: string, workspace: string}>();
    
    for (const wf of globalWorkflows) {
      workflowMap.set(wf.name, wf);
    }

    for (const conn of conns) {
      try {
        const data = await grpc.getAllWorkflows(conn.port, conn.csrf);
        if (data?.workflows) {
          for (const wf of data.workflows) {
            if (!workflowMap.has(wf.name)) {
              workflowMap.set(wf.name, {
                name: wf.name,
                description: wf.description || '',
                path: wf.path || '',
                content: wf.content || '',
                scope: wf.scope?.globalScope ? 'global' : 'workspace',
                baseDir: wf.baseDir || '',
                workspace: (conn as { workspace?: string }).workspace || '',
              });
            }
          }
        }
      } catch {}
    }
    return NextResponse.json([...workflowMap.values()].sort((a, b) => a.name.localeCompare(b.name)));
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

const openFileInEditor = (pathToOpen: string) => {
  exec(`code "${pathToOpen}"`, (err: Error | null) => {
    if (err) exec(`open "${pathToOpen}"`);
  });
};

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { action } = body;

    if (action === 'create') {
      const { workspace, name, description } = body;
      if (!workspace || !name) throw new Error('Workspace and name are required');

      const wsPath = workspace.replace('file://', '');
      const workflowsDir = path.join(wsPath, '.agents', 'workflows');
      if (!existsSync(workflowsDir)) mkdirSync(workflowsDir, { recursive: true });

      const filepath = path.join(workflowsDir, `${name}.md`);
      if (existsSync(filepath)) throw new Error('Workflow already exists');

      const content = `---
description: ${description || ''}
---

# ${name}

Write your workflow steps here...
`;
      writeFileSync(filepath, content, 'utf-8');
      
      openFileInEditor(filepath);
      
      return NextResponse.json({ success: true, path: filepath });
    }

    if (action === 'open') {
      const { filepath } = body;
      if (!filepath || !existsSync(filepath)) throw new Error('File not found at: ' + filepath);
      openFileInEditor(filepath);
      return NextResponse.json({ success: true });
    }

    if (action === 'promote') {
      const { filepath } = body;
      if (!filepath || !existsSync(filepath)) throw new Error('File not found at: ' + filepath);

      const globalDir = path.join(homedir(), '.agents', 'workflows');
      if (!existsSync(globalDir)) mkdirSync(globalDir, { recursive: true });

      const filename = path.basename(filepath);
      const destPath = path.join(globalDir, filename);

      copyFileSync(filepath, destPath);
      rmSync(filepath);

      return NextResponse.json({ success: true, path: destPath });
    }

    if (action === 'delete') {
      const { filepath } = body;
      if (!filepath || !existsSync(filepath)) throw new Error('File not found at: ' + filepath);
      rmSync(filepath);
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
