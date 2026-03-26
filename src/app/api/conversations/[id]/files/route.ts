import { NextResponse } from 'next/server';
import { getOwnerConnection } from '@/lib/bridge/gateway';
import { createLogger } from '@/lib/logger';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export const dynamic = 'force-dynamic';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const url = new URL(req.url);
  const q = url.searchParams.get('q') || '';
  
  const conn = await getOwnerConnection(id);
  const maxResults = 25;

  let workspacePath = conn?.workspace?.replace(/^file:\/\//, '') || process.cwd();
  
  try {
    // using fd if available, else fallback to find.
    // fd is significantly faster.
    const findCmd = `find "${workspacePath}" -type d \\( -name "node_modules" -o -name ".git" -o -name ".next" -o -name "dist" -o -name "out" \\) -prune -o -type f -iname "*${q}*" -print`;
    
    // Mac also supports fd, but we'll stick to 'find' as it's built-in.
    
    const { stdout } = await execAsync(findCmd);
    const lines = stdout.split('\n').filter(Boolean).slice(0, maxResults);
    
    const files = lines.map(f => {
      let relativePath = f.replace(workspacePath + '/', '');
      if (relativePath === f) {
        // if workspacePath wasn't matched (edge case), just try string replace
        relativePath = f.replace(workspacePath, '').replace(/^\//, '');
      }
      return {
        absolutePath: f,
        relativePath,
        name: f.split('/').pop() || ''
      };
    });
    
    return NextResponse.json({ files });
  } catch (e: any) {
    const log = createLogger('FileSearch');
    log.warn({ err: e.message }, 'Error running find command');
    return NextResponse.json({ files: [], error: e.message });
  }
}
