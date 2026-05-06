import { NextResponse } from 'next/server';
import { assertAgentRunReadable, requireAgentApiKey, agentAuthErrorResponse } from '@/lib/agent-auth/api-key';
import { getAgentCapabilityRunRecord, updateAgentCapabilityRunFromResult, serializeAgentRunRecord } from '@/lib/agent-runs/store';

const CANCELLABLE = new Set(['queued', 'running', 'waiting_callback']);

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const record = await getAgentCapabilityRunRecord(id);

  if (!record) {
    return NextResponse.json(
      { error: { code: 'run_not_found', message: `Run ${id} was not found` } },
      { status: 404 },
    );
  }

  try {
    const auth = await requireAgentApiKey(request);
    assertAgentRunReadable(auth, record);
  } catch (error) {
    return agentAuthErrorResponse(error);
  }

  if (!CANCELLABLE.has(record.status)) {
    return NextResponse.json(
      {
        run: serializeAgentRunRecord(record),
        error: {
          code: 'run_not_cancellable',
          message: `Run ${id} is ${record.status}; only queued/running/waiting_callback runs can be cancelled.`,
        },
      },
      { status: 409 },
    );
  }

  await updateAgentCapabilityRunFromResult({
    runId: record.id,
    capabilityId: record.capabilityId,
    mode: record.mode as 'wait' | 'submit',
    status: 'cancelled',
    createdAt: record.createdAt.toISOString(),
    finishedAt: new Date().toISOString(),
    result: record.resultJson,
    artifacts: [],
    usage: record.usageJson as { credits?: number; provider?: string; durationMs?: number } | undefined,
    error: {
      code: 'cancelled',
      message: 'Run was cancelled by user or admin.',
    },
  }, {
    businessType: record.businessType || undefined,
    businessId: record.businessId || undefined,
    businessTaskId: record.businessTaskId || undefined,
    businessStatus: 'cancelled',
  });

  const updated = await getAgentCapabilityRunRecord(id);
  return NextResponse.json({ run: serializeAgentRunRecord(updated) });
}
