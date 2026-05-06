import { NextResponse } from 'next/server';
import { pollAgentCliDeviceLogin } from '@/lib/agent-auth/device-login';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const deviceCode = url.searchParams.get('device_code') || url.searchParams.get('deviceCode') || '';
  if (!deviceCode) {
    return NextResponse.json({ error: 'device_code is required' }, { status: 400 });
  }
  const result = await pollAgentCliDeviceLogin(deviceCode);
  if (result.status !== 'approved') {
    return NextResponse.json({ status: result.status }, { status: result.status === 'pending' ? 202 : 400 });
  }
  return NextResponse.json({
    status: 'approved',
    token_type: 'UserApiKey',
    user_id: result.userId,
    api_key: result.apiKey,
    api_key_id: result.apiKeyId,
  });
}
