import { NextResponse } from 'next/server';
import { getRequestUserContext } from '@/lib/authServer';
import { FinalizeLoginError, finalizeLogin } from '@/lib/auth/finalizeLogin';

export async function POST(request: Request) {
  const { userId, token } = await getRequestUserContext(request, { skipProfileKeys: true });
  if (!userId || !token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const finalized = await finalizeLogin({ userId });
    return NextResponse.json({
      ok: true,
      bound: true,
      data: finalized,
    });
  } catch (error) {
    if (error instanceof FinalizeLoginError) {
      return NextResponse.json(
        {
          error: error.message,
          code: error.code,
        },
        { status: error.status },
      );
    }

    console.error('[auth/provision-credits] finalize failed', error);
    return NextResponse.json({ error: 'Failed to provision credits account' }, { status: 502 });
  }
}
