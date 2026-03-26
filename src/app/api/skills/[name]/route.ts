import { NextResponse } from 'next/server';
import { getAllConnections, grpc } from '@/lib/bridge/gateway';

export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  try {
    const conns = await getAllConnections();
    for (const conn of conns) {
      try {
        const data = await grpc.getAllSkills(conn.port, conn.csrf);
        if (data?.skills) {
          const skill = data.skills.find((s: any) => s.name === name);
          if (skill) return NextResponse.json(skill);
        }
      } catch {}
    }
    return NextResponse.json({ error: 'Skill not found' }, { status: 404 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
