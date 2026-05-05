import { NextResponse } from 'next/server';
import { listAgentCapabilities } from '@/lib/agent-capabilities/registry';

export async function GET() {
  return NextResponse.json({
    capabilities: listAgentCapabilities(),
  });
}
