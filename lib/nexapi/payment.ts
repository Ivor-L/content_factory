import { AlipaySdk } from 'alipay-sdk';
import prisma from '@/lib/prisma';
import { requireEnv } from '@/lib/env';
import { adjustWalletCreditsInTransaction } from '@/lib/nexapi/wallet';

const CREDITS_PER_CNY = 100;

type CreateRechargeOrderInput = {
  userId: string;
  amountCny: number;
  clientIp?: string;
  userAgent?: string;
};

type CreateRechargeOrderResult = {
  orderId: string;
  payUrl: string;
  credits: bigint;
};

let cachedAlipay: AlipaySdk | null = null;

function getAlipayClient() {
  if (cachedAlipay) return cachedAlipay;
  const appId = requireEnv('ALIPAY_APP_ID');
  const privateKey = requireEnv('ALIPAY_APP_PRIVATE_KEY');
  const alipayPublicKey = requireEnv('ALIPAY_APP_PUBLIC_KEY');
  cachedAlipay = new AlipaySdk({
    appId,
    privateKey,
    alipayPublicKey,
    gateway: process.env.ALIPAY_GATEWAY || 'https://openapi.alipay.com/gateway.do',
    timeout: 3000,
  });
  return cachedAlipay;
}

export async function createRechargeOrder(
  input: CreateRechargeOrderInput
): Promise<CreateRechargeOrderResult> {
  const { userId, amountCny, clientIp, userAgent } = input;
  if (!Number.isFinite(amountCny) || amountCny <= 0) {
    throw new Error('amountCny must be positive');
  }
  const credits = BigInt(Math.round(amountCny * CREDITS_PER_CNY));

  const order = await prisma.rechargeOrder.create({
    data: {
      userId,
      amountCny,
      credits,
      status: 'pending',
      meta: {
        clientIp,
        userAgent,
      },
    },
  });

  const client = getAlipayClient();
  const payUrl = client.pageExecute('alipay.trade.page.pay', 'GET', {
    bizContent: {
      out_trade_no: order.id,
      product_code: 'FAST_INSTANT_TRADE_PAY',
      total_amount: amountCny.toFixed(2),
      subject: `NexAPI积分${credits.toString()}点`,
    },
    notifyUrl: process.env.ALIPAY_NOTIFY_URL,
    returnUrl: process.env.ALIPAY_RETURN_URL,
  });

  await prisma.rechargeOrder.update({
    where: { id: order.id },
    data: {
      payUrl,
    },
  });

  return {
    orderId: order.id,
    payUrl,
    credits,
  };
}

type NotifyParams = Record<string, string | undefined>;

export async function handleAlipayWebhook(params: NotifyParams) {
  const client = getAlipayClient();
  const verified = client.checkNotifySign(params);
  if (!verified) {
    throw new Error('Invalid alipay signature');
  }

  const outTradeNo = params.out_trade_no;
  const tradeNo = params.trade_no;
  const tradeStatus = params.trade_status;

  if (!outTradeNo) {
    throw new Error('Missing out_trade_no');
  }

  const order = await prisma.rechargeOrder.findUnique({ where: { id: outTradeNo } });
  if (!order) {
    throw new Error('Order not found');
  }

  if (order.status === 'paid') {
    return { success: true };
  }

  if (tradeStatus === 'TRADE_SUCCESS' || tradeStatus === 'TRADE_FINISHED') {
    await prisma.$transaction(async (tx) => {
      await tx.rechargeOrder.update({
        where: { id: order.id },
        data: {
          status: 'paid',
          alipayTradeNo: tradeNo,
        },
      });

      await adjustWalletCreditsInTransaction(
        tx,
        order.userId,
        order.credits,
        {
          reason: 'recharge',
          amountCny: Number(order.amountCny),
          channel: 'alipay',
          refId: order.id,
          meta: params,
        }
      );
    });
  } else if (tradeStatus === 'TRADE_CLOSED') {
    await prisma.rechargeOrder.update({
      where: { id: order.id },
      data: {
        status: 'failed',
        alipayTradeNo: tradeNo,
      },
    });
  }

  return { success: true };
}
