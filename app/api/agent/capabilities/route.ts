import { NextResponse } from 'next/server';
import { auditAgentCapabilityCreditConfigs } from '@/lib/agent-capabilities/credit-audit';
import { listAgentCapabilities } from '@/lib/agent-capabilities/registry';

export async function GET(request: Request) {
  const capabilities = listAgentCapabilities();
  const url = new URL(request.url);
  const includeCreditAudit = url.searchParams.get('includeCreditAudit') === '1'
    || url.searchParams.get('include_credit_audit') === '1';

  return NextResponse.json({
    capabilities,
    creditAudit: includeCreditAudit ? await auditAgentCapabilityCreditConfigs(capabilities) : undefined,
  });
}
