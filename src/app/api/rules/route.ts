import { NextResponse } from 'next/server';
import { getAllConnections, grpc } from '@/lib/bridge/gateway';
import fs, { existsSync } from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const { getGlobalItems } = await import('@/lib/global-agents');
    const globalRules = getGlobalItems('rules');
    
    const conns = await getAllConnections();
    const ruleMap = new Map<string, any>();
    
    // Seed with global rules first
    for (const rule of globalRules) {
      ruleMap.set(rule.name, rule);
    }
    for (const conn of conns) {
      if (!conn.workspace) continue;
      const wsPath = conn.workspace.replace(/^file:\/\//, '');

      // 1. Manually parse local rules from `.agents/rules.md` and `.agents/rules/*.md`
      const tryAddRule = (filepath: string, defaultName: string) => {
        if (!existsSync(filepath)) return;
        try {
          const content = fs.readFileSync(filepath, 'utf-8');
          const name = path.basename(filepath, '.md');
          const descMatch = content.match(/^description:\s*(.*)$/m);
          const key = filepath;
          if (!ruleMap.has(key)) {
            ruleMap.set(key, {
              name: name === 'rules' ? defaultName : name,
              description: descMatch ? descMatch[1].trim() : '',
              path: filepath,
              content,
              scope: 'workspace',
              baseDir: path.dirname(filepath),
              workspace: conn.workspace
            });
          }
        } catch(e) {}
      };

      try {
        // Single file check
        tryAddRule(path.join(wsPath, '.agents', 'rules.md'), 'project-rules');
        tryAddRule(path.join(wsPath, '.cursorrules'), 'cursor-rules');
        tryAddRule(path.join(wsPath, '.clinerules'), 'cline-rules');
        
        // Directory check
        const rulesDir = path.join(wsPath, '.agents', 'rules');
        if (existsSync(rulesDir) && fs.statSync(rulesDir).isDirectory()) {
          const files = fs.readdirSync(rulesDir);
          for (const file of files) {
            if (file.endsWith('.md')) {
              tryAddRule(path.join(rulesDir, file), file.replace('.md', ''));
            }
          }
        }
      } catch(e) { console.error('Error reading local rules', e) }

      // 2. Try gRPC as fallback
      try {
        const data = await grpc.getAllRules(conn.port, conn.csrf);
        if (data?.rules) {
          for (const rule of data.rules) {
            const key = rule.path || rule.name || JSON.stringify(rule);
            if (!ruleMap.has(key)) {
              ruleMap.set(key, {
                name: rule.name || '',
                description: rule.description || '',
                path: rule.path || '',
                content: rule.content || '',
                scope: rule.scope?.globalScope ? 'global' : 'workspace',
                baseDir: rule.baseDir || '',
                workspace: (conn as any).workspace || '',
              });
            }
          }
        }
      } catch {}
    }
    return NextResponse.json([...ruleMap.values()]);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

import { mkdirSync, copyFileSync, rmSync, writeFileSync } from 'fs';
import { homedir } from 'os';
import { exec } from 'child_process';

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
      const rulesDir = path.join(wsPath, '.agents', 'rules');
      if (!existsSync(rulesDir)) mkdirSync(rulesDir, { recursive: true });

      const safeName = name.replace(/[^a-zA-Z0-9_-]/g, '-').toLowerCase();
      const filepath = path.join(rulesDir, `${safeName}.md`);
      if (existsSync(filepath)) throw new Error('Rule already exists');

      const content = `---
description: ${description || ''}
---

# ${name}

Write your custom rule guidelines here...
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

      const globalDir = path.join(homedir(), '.agents', 'rules');
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
