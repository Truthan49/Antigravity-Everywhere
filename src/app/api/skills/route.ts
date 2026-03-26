import { NextResponse } from 'next/server';
import { getAllConnections, grpc } from '@/lib/bridge/gateway';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    if (searchParams.get('action') === 'store') {
      const { getCachedSkills } = await import('@/lib/skillhub-cache');
      const result = await getCachedSkills({
        page: searchParams.get('page') || '1',
        pageSize: searchParams.get('pageSize') || '24',
        sortBy: searchParams.get('sortBy') || 'score',
        order: searchParams.get('order') || 'desc',
        category: searchParams.get('category') || '',
        keyword: searchParams.get('keyword') || '',
      });
      return NextResponse.json(result);
    }

    const { getGlobalItems } = await import('@/lib/global-agents');
    const globalSkills = getGlobalItems('skills');

    const conns = await getAllConnections();
    const skillMap = new Map<string, any>();

    for (const skill of globalSkills) {
      skillMap.set(skill.name, skill);
    }

    for (const conn of conns) {
      try {
        const data = await grpc.getAllSkills(conn.port, conn.csrf);
        if (data?.skills) {
          for (const skill of data.skills) {
            if (!skillMap.has(skill.name)) {
              skillMap.set(skill.name, {
                name: skill.name,
                description: skill.description || '',
                path: skill.path || '',
                baseDir: skill.baseDir || '',
                scope: skill.scope?.globalScope ? 'global' : 'workspace',
                workspace: (conn as any).workspace || '',
              });
            }
          }
        }
      } catch {}
    }
    return NextResponse.json([...skillMap.values()].sort((a, b) => a.name.localeCompare(b.name)));
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    if (body.action === 'install') {
      const { sourceBaseDir, workspaceUri } = body;
      if (!sourceBaseDir || !workspaceUri) {
        return NextResponse.json({ error: 'Missing parameters' }, { status: 400 });
      }
      
      const wsPath = workspaceUri.replace(/^file:\/\//, '');
      const skillName = path.basename(sourceBaseDir);
      const targetDir = path.join(wsPath, '.agents', 'skills', skillName);
      
      if (!fs.existsSync(sourceBaseDir)) {
        return NextResponse.json({ error: 'Source skill not found' }, { status: 404 });
      }
      
      if (fs.existsSync(targetDir)) {
        return NextResponse.json({ error: 'Skill already installed in this workspace' }, { status: 400 });
      }
      
      fs.mkdirSync(path.dirname(targetDir), { recursive: true });
      fs.cpSync(sourceBaseDir, targetDir, { recursive: true });
      
      return NextResponse.json({ success: true, targetDir });
    }
    
    if (body.action === 'importGlobal') {
      const { sourceDir } = body;
      if (!sourceDir) {
        return NextResponse.json({ error: 'Missing source directory' }, { status: 400 });
      }

      const os = await import('os');
      const resolvedSource = sourceDir.replace(/^~/, os.homedir());
      if (!fs.existsSync(resolvedSource)) {
        return NextResponse.json({ error: 'Source directory not found' }, { status: 404 });
      }

      const skillName = path.basename(resolvedSource);
      const targetDir = path.join(os.homedir(), '.agents', 'skills', skillName);

      if (fs.existsSync(targetDir)) {
        return NextResponse.json({ error: 'Global skill with this name already exists' }, { status: 400 });
      }

      fs.mkdirSync(path.dirname(targetDir), { recursive: true });
      fs.cpSync(resolvedSource, targetDir, { recursive: true });

      return NextResponse.json({ success: true, targetDir });
    }
    
    if (body.action === 'installCloud') {
      const { slug } = body;
      if (!slug) {
        return NextResponse.json({ error: 'Missing slug' }, { status: 400 });
      }

      const os = await import('os');
      const { execSync } = await import('child_process');
      const targetDir = path.join(os.homedir(), '.agents', 'skills', slug);

      if (fs.existsSync(targetDir)) {
        return NextResponse.json({ error: 'Global skill already exists, please delete it first or update' }, { status: 400 });
      }

      const tmpZipPath = path.join(os.tmpdir(), `${slug}-${Date.now()}.zip`);
      
      try {
        const res = await fetch(`https://skillhub-1388575217.cos.ap-guangzhou.myqcloud.com/skills/${slug}.zip`);
        if (!res.ok) throw new Error(`Failed to download: ${res.statusText}`);
        
        const arrayBuffer = await res.arrayBuffer();
        fs.writeFileSync(tmpZipPath, Buffer.from(arrayBuffer));
        
        fs.mkdirSync(targetDir, { recursive: true });
        execSync(`unzip -q -o "${tmpZipPath}" -d "${targetDir}"`, { stdio: 'ignore' });
        
        return NextResponse.json({ success: true, targetDir });
      } catch (e: any) {
        if (fs.existsSync(targetDir)) fs.rmSync(targetDir, { recursive: true, force: true });
        throw new Error('Install failed: ' + e.message);
      } finally {
        if (fs.existsSync(tmpZipPath)) fs.unlinkSync(tmpZipPath);
      }
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (e: any) {
    console.error('Skill install error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
