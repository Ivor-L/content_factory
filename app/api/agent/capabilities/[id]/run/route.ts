import { NextRequest, NextResponse } from 'next/server';
import { getAgentCapability } from '@/lib/agent-capabilities/registry';
import { runAgentCapability } from '@/lib/agent-capabilities/runner';
import type { AgentCapabilityRunInput } from '@/lib/agent-capabilities/types';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const capability = getAgentCapability(id);

  if (!capability) {
    return NextResponse.json(
      {
        error: {
          code: 'capability_not_found',
          message: `Capability ${id} was not found`,
        },
      },
      { status: 404 },
    );
  }

  let body: AgentCapabilityRunInput;
  try {
    const parsed = await request.json();
    body = (parsed?.run ?? parsed ?? {}) as AgentCapabilityRunInput;
  } catch {
    return NextResponse.json(
      {
        error: {
          code: 'invalid_json',
          message: 'Invalid JSON body',
        },
      },
      { status: 400 },
    );
  }

  const run = await runAgentCapability({
    capability,
    request: body,
    authHeaders: request.headers,
  });

  const status = run.status === 'failed' ? 400 : 200;
  return NextResponse.json({ run }, { status });
}
