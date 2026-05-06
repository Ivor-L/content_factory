import { NextRequest, NextResponse } from 'next/server';
import { requireAgentApiKey, agentAuthErrorResponse } from '@/lib/agent-auth/api-key';
import { assertAgentCapabilityCostAllowed, agentCostGuardErrorResponse } from '@/lib/agent-capabilities/cost-guard';
import { assertAgentCapabilityQuotaAvailable, agentQuotaPreflightErrorResponse } from '@/lib/agent-capabilities/quota-preflight';
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

  let auth;
  try {
    auth = await requireAgentApiKey(request);
  } catch (error) {
    return agentAuthErrorResponse(error);
  }

  if (capability.executionType === 'local_agent') {
    const run = await runAgentCapability({
      capability,
      request: body,
      authHeaders: request.headers,
      userId: auth.userId,
      userApiKey: auth.profile.api_key,
    });
    const status = run.status === 'failed' ? 400 : 200;
    return NextResponse.json({ run }, { status });
  }

  try {
    await assertAgentCapabilityCostAllowed({
      userId: auth.userId,
      capability,
      profile: auth.profile,
    });
  } catch (error) {
    return agentCostGuardErrorResponse(error);
  }

  let quotaPreflight;
  try {
    quotaPreflight = await assertAgentCapabilityQuotaAvailable({
      userId: auth.userId,
      capability,
      profile: auth.profile,
    });
  } catch (error) {
    return agentQuotaPreflightErrorResponse(error);
  }

  const run = await runAgentCapability({
    capability,
    request: body,
    authHeaders: request.headers,
    userId: auth.userId,
    userApiKey: auth.profile.api_key,
    creditHold: quotaPreflight.estimatedCredits > 0 && quotaPreflight.featureKey
      ? {
          estimatedCredits: quotaPreflight.estimatedCredits,
          featureKey: quotaPreflight.featureKey,
          source: quotaPreflight.creditConfigSource,
        }
      : undefined,
  });

  const status = run.status === 'failed' ? 400 : 200;
  return NextResponse.json({ run }, { status });
}
