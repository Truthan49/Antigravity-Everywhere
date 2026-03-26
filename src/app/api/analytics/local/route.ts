import { NextResponse } from 'next/server';
import { getConversations, getWorkspaces, getGlobalModel } from '@/lib/bridge/statedb';
import { feishuStore } from '@/lib/feishu/store';
import { tryAllServers, grpc } from '@/lib/bridge/gateway';
import fs from 'fs';
import path from 'path';
import { homedir } from 'os';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    // 1. Get all local conversations
    const convs = getConversations();
    
    let totalEstimatedTokens = 0;
    const now = Date.now();
    const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;
    const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;
    
    let newConvsLast7Days = 0;
    let activeConvsLast30Days = 0;
    let newStepsLast30Days = 0;

    // Heatmap data: array of 7 days (YYYY-MM-DD) -> active interactions
    const heatmap: Record<string, number> = {};
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now - i * 24 * 60 * 60 * 1000);
      heatmap[d.toISOString().split('T')[0]] = 0;
    }

    const CONV_DIR = path.join(homedir(), '.gemini/antigravity/conversations');

    convs.forEach(c => {
      // Parse dates
      const createdTime = c.createdAt ? new Date(c.createdAt).getTime() : 0;
      
      // Compute estimated tokens using .pb file size if available
      try {
        const stat = fs.statSync(path.join(CONV_DIR, `${c.id}.pb`));
        // PB files contain full text history. English 1 char=1 byte≈0.25 tokens. Chinese 1 char=3 bytes≈1 token (0.33 tokens/byte).
        // A rough constant of 0.3 tokens per byte of the .pb payload.
        const fileTokens = Math.round(stat.size * 0.3);
        
        // Estimate steps if missing or zero (approx 10000 bytes/step as fallback)
        const estimatedSteps = c.stepCount && c.stepCount > 0 ? c.stepCount : Math.max(1, Math.round(stat.size / 10000));
        
        if (createdTime > thirtyDaysAgo) {
          totalEstimatedTokens += fileTokens;
          activeConvsLast30Days++;
          newStepsLast30Days += estimatedSteps;
        }

        if (createdTime > sevenDaysAgo) {
          newConvsLast7Days++;
        }

        const dateStr = new Date(createdTime).toISOString().split('T')[0];
        if (heatmap[dateStr] !== undefined) {
          heatmap[dateStr] += estimatedSteps; 
        }
      } catch {
        // Fallback or skip
      }
    });

    // 2. Format heatmap array for UI/Recharts
    const activityHeatmap = Object.keys(heatmap).sort().map(date => ({
      date: date.substring(5), // MM-DD
      activity: heatmap[date]
    }));

    // 3. Fetch quota and preferred model
    let quotaFraction = 0;
    let currentModelTag = getGlobalModel() || 'Auto';
    try {
      const gData = await tryAllServers((p, c, a) => grpc.getModelConfigs(p, c, a));
      const models = gData.clientModelConfigs || [];
      const currentLabel = models.find((m: any) => m.modelOrAlias?.model === currentModelTag);
      if (currentLabel) {
        currentModelTag = currentLabel.label;
        quotaFraction = currentLabel.quotaInfo?.remainingFraction || 0;
      }
    } catch {}

    // 4. Feishu Engagement
    let feishuUsers = 0;
    try {
      const fd = feishuStore.load();
      feishuUsers = Object.keys(fd).length;
    } catch {}

    const workspacesCount = getWorkspaces().length;
    
    let skillsCount = 0;
    try {
      const { getGlobalItems } = await import('@/lib/global-agents');
      const globalSkills = getGlobalItems('skills') || [];
      const skillNames = new Set<string>();
      globalSkills.forEach((s: any) => { if (s.name) skillNames.add(s.name); });
      
      const conns = await import('@/lib/bridge/gateway').then(m => m.getAllConnections());
      for (const conn of conns) {
        try {
          const data = await grpc.getAllSkills(conn.port, conn.csrf);
          if (data?.skills) {
            data.skills.forEach((s: any) => { if (s.name) skillNames.add(s.name); });
          }
        } catch {}
      }
      skillsCount = skillNames.size;
    } catch {}

    return NextResponse.json({
      success: true,
      data: {
        totalEstimatedTokens,
        newConvsLast7Days,
        activeConvsLast30Days,
        newStepsLast30Days,
        feishuUsers,
        workspacesCount,
        skillsCount,
        activityHeatmap,
        quotaFraction, // 0.0 to 1.0
        currentModelTag
      }
    });

  } catch (e: any) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}
