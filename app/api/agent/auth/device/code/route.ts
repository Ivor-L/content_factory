import { NextResponse } from 'next/server';
import { createAgentCliDeviceLogin } from '@/lib/agent-auth/device-login';

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const client = body?.client && typeof body.client === 'object' ? body.client : {};
  const label = typeof body?.label === 'string' && body.label.trim() ? body.label.trim() : 'NexTide CLI';
  const verificationBaseUrl = typeof body?.verificationBaseUrl === 'string' && body.verificationBaseUrl.trim()
    ? body.verificationBaseUrl.trim()
    : typeof body?.verification_base_url === 'string' && body.verification_base_url.trim()
      ? body.verification_base_url.trim()
      : undefined;
  const login = await createAgentCliDeviceLogin({ request, client, label, verificationBaseUrl });
  return NextResponse.json({
    device_code: login.deviceCode,
    user_code: login.userCode,
    verification_uri: login.verificationUri,
    verification_uri_complete: login.verificationUriComplete,
    expires_in: login.expiresIn,
    interval: login.interval,
  });
}
