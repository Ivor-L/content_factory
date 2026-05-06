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

  if (record.businessType && record.businessId && ['queued', 'running', 'waiting_callback'].includes(record.status)) {
    const run = await resolveBusinessStatus({
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
    });
    return NextResponse.json({ run });
  }

  return NextResponse.json({ run: serializeAgentRunRecord(record) });
}
