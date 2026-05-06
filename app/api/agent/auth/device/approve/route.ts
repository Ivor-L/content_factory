import { NextResponse } from 'next/server';
import { getRequestUserContext } from '@/lib/authServer';
import { approveAgentCliDeviceLogin, denyAgentCliDeviceLogin } from '@/lib/agent-auth/device-login';

export async function POST(request: Request) {
  const ctx = await getRequestUserContext(request, { allowDefaultApiKey: false, useSystemApiKey: false });
  if (!ctx.userId) {
    return NextResponse.json(
      {
        error: 'Unauthorized',
        message: '未检测到本地 NexTide 登录态。请先在 localhost 登录，或在授权页填写当前账号 NexTide API Key。',
      },
      { status: 401 },
    );
  }

  const body = await request.json().catch(() => ({}));
  const userCode = typeof body?.user_code === 'string'
    ? body.user_code
    : typeof body?.userCode === 'string'
      ? body.userCode
      : '';
  const action = typeof body?.action === 'string' ? body.action : 'approve';

  if (!userCode.trim()) {
    return NextResponse.json({ error: 'user_code is required' }, { status: 400 });
  }

  const result = action === 'deny'
    ? await denyAgentCliDeviceLogin(userCode)
    : await approveAgentCliDeviceLogin({ userCode, userId: ctx.userId });

  if (!result.ok) {
    return NextResponse.json({ error: result.code, message: result.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, result });
}
