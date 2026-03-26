import fs from 'fs';
import path from 'path';
import { homedir } from 'os';

export function getGlobalItems(type: 'workflows' | 'rules' | 'skills'): any[] {
  const globalDir = path.join(homedir(), '.agents', type);
  if (!fs.existsSync(globalDir)) return [];

  const items: any[] = [];
  try {
    const files = fs.readdirSync(globalDir);
    for (const file of files) {
      if (!file.endsWith('.md') && type !== 'skills') continue;
      
      const filepath = path.join(globalDir, file);
      const stat = fs.statSync(filepath);
      
      if (type === 'skills') {
        if (!stat.isDirectory()) continue;
        const skillMd = path.join(filepath, 'SKILL.md');
        if (!fs.existsSync(skillMd)) continue;
        
        const content = fs.readFileSync(skillMd, 'utf-8');
        const nameMatch = content.match(/^name:\s*(.*)$/m);
        const descMatch = content.match(/^description:\s*(.*)$/m);
        
        items.push({
          name: nameMatch ? nameMatch[1].trim() : file,
          description: descMatch ? descMatch[1].trim() : '',
          path: skillMd,
          content,
          scope: 'global',
          baseDir: filepath,
          workspace: 'global'
        });
      } else {
        if (!stat.isFile()) continue;
        const name = path.basename(file, '.md');
        const content = fs.readFileSync(filepath, 'utf-8');
        const descMatch = content.match(/^description:\s*(.*)$/m);
        
        items.push({
          name,
          description: descMatch ? descMatch[1].trim() : '',
          path: filepath,
          content,
          scope: 'global',
          baseDir: globalDir,
          workspace: 'global'
        });
      }
    }
  } catch (e) {
    console.error(`Failed to read global ${type}:`, e);
  }
  return items;
}
