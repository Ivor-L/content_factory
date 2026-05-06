import { NextResponse } from 'next/server';
import { pollAgentCliDeviceLogin } from '@/lib/agent-auth/device-login';

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const deviceCode = typeof body?.device_code === 'string'
    ? body.device_code.trim()
    : typeof body?.deviceCode === 'string'
      ? body.deviceCode.trim()
      : '';

  if (!deviceCode) {
    return NextResponse.json({ error: 'invalid_request', error_description: 'device_code is required' }, { status: 400 });
  }

  const result = await pollAgentCliDeviceLogin(deviceCode);
  if (result.status === 'approved') {
    return NextResponse.json({
      access_token: result.apiKey,
      token_type: 'UserApiKey',
      user_id: result.userId,
      api_key_id: result.apiKeyId,
      label: result.label,
    });
  }

  if (result.status === 'pending') {
    return NextResponse.json({ error: 'authorization_pending' }, { status: 428 });
  }
  if (result.status === 'expired') {
    return NextResponse.json({ error: 'expired_token' }, { status: 400 });
  }
  if (result.status === 'denied') {
    return NextResponse.json({ error: 'access_denied' }, { status: 403 });
  }
  if (result.status === 'approved_missing_token') {
    return NextResponse.json({ error: 'server_error', error_description: 'approved login has no token' }, { status: 500 });
  }
  return NextResponse.json({ error: 'invalid_grant' }, { status: 400 });
}
