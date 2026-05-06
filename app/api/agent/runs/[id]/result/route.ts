import { NextResponse } from 'next/server';
import { resolveBusinessStatus } from '@/lib/agent-runs/business-status';
import { getAgentCapabilityRunRecord, serializeAgentRunRecord } from '@/lib/agent-runs/store';

export async function GET(
  _request: Request,
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

  const run = record.businessType && record.businessId
    ? await resolveBusinessStatus({
        runId: record.id,
        capabilityId: record.capabilityId,
        mode: record.mode as 'wait' | 'submit',
        createdAt: record.createdAt,
        businessType: record.businessType,
        businessId: record.businessId,
        businessTaskId: record.businessTaskId,
        result: record.resultJson,
        artifacts: record.artifactsJson,
        usage: record.usageJson,
        error: record.errorJson,
      })
    : serializeAgentRunRecord(record);

  if (!run) {
    return NextResponse.json(
      { error: { code: 'run_not_found', message: `Run ${id} was not found` } },
      { status: 404 },
    );
  }

  if (['queued', 'running', 'waiting_callback'].includes(run.status)) {
    return NextResponse.json(
      {
        run,
        error: {
          code: 'run_not_finished',
          message: `Run ${id} is ${run.status}; result is not final yet.`,
        },
      },
      { status: 202 },
    );
  }

  return NextResponse.json({ run, result: run.result, artifacts: run.artifacts || [] });
}
