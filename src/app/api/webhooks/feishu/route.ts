// This route is officially deprecated in v0.2.0 in favor of WebSockets.
// We keep this file to prevent Next.js from emitting TS2307 caching errors
// in existing user workspaces that haven't cleared their .next directory.

import { NextResponse } from 'next/server';

export async function POST() {
  return NextResponse.json(
    { error: 'Feishu Webhook integration is deprecated. Please use the WebSocket integration.' },
    { status: 410 }
  );
}

export async function GET() {
  return NextResponse.json(
    { error: 'Deprecated' },
    { status: 410 }
  );
}
