import { NextResponse } from 'next/server';
import { getRequestUserContext } from '@/lib/authServer';
import prisma from '@/lib/prisma';
import { createRechargeOrder } from '@/lib/nexapi/payment';

export async function GET(request: Request) {
  const ctx = await getRequestUserContext(request);
  if (!ctx.userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const orders = await prisma.recharge_orders.findMany({
    where: { user_id: ctx.userId },
    orderBy: { created_at: 'desc' },
    take: 20,
  });

  return NextResponse.json({
    ok: true,
    orders: orders.map((order) => ({
      id: order.id,
      amountCny: Number(order.amount_cny),
      credits: order.credits.toString(),
      status: order.status,
      payUrl: order.pay_url,
      alipayTradeNo: order.alipay_trade_no,
      createdAt: order.created_at,
      updatedAt: order.updated_at,
    })),
  });
}

export async function POST(request: Request) {
  const ctx = await getRequestUserContext(request);
  if (!ctx.userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const amountCny = typeof body.amountCny === 'number' ? body.amountCny : Number(body.amount);

  if (!Number.isFinite(amountCny) || amountCny <= 0) {
    return NextResponse.json({ error: 'Invalid amount' }, { status: 400 });
  }

  try {
    const order = await createRechargeOrder({
      userId: ctx.userId,
      amountCny,
      clientIp: request.headers.get('x-forwarded-for') ?? undefined,
      userAgent: request.headers.get('user-agent') ?? undefined,
    });

    return NextResponse.json({
      ok: true,
      order: {
        ...order,
        credits: order.credits.toString(),
      },
    });
  } catch (error: any) {
    console.error('Failed to create recharge order', error);
    return NextResponse.json(
      { error: 'Failed to create recharge order', details: error?.message },
      { status: 500 }
    );
  }
}
