import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import prisma from '@/lib/prisma';
import { getRequestUserContext } from '@/lib/authServer';
import { getActiveApiKeyRecord } from '@/lib/nexapi/apiKeys';
import { ensureWallet, adjustWalletCreditsInTransaction } from '@/lib/nexapi/wallet';
import { getModelPrice, computePricing } from '@/lib/nexapi/pricing';
import { listRouteConfigs } from '@/lib/nexapi/routes';

const DEFAULT_ROUTE = listRouteConfigs()[0];
const UPSTREAM_TIMEOUT_MS = 40_000;

function extractBearer(request: NextRequest) {
  const header = request.headers.get('authorization') || request.headers.get('Authorization');
  if (!header) return null;
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() ?? null;
}

function looksLikeNexApiKey(value: string | null | undefined) {
  if (!value) return false;
  const token = value.trim();
  return token.startsWith('nxt_') && token.length >= 16;
}

function looksLikeByokUpstreamKey(value: string | null | undefined) {
  if (!value) return false;
  const token = value.trim();
  return token.startsWith('sk-') && token.length >= 20;
}

function resolveRouteBase(request: NextRequest) {
  const headerRoute = request.headers.get('x-nexapi-route')?.trim();
  const url = new URL(request.url);
  const queryRoute = url.searchParams.get('route')?.trim();
  const candidate = headerRoute || queryRoute;
  if (candidate) {
    const matched = listRouteConfigs().find(
      (route) => route.id === candidate || route.baseUrl === candidate
    );
    if (matched) return matched.baseUrl;
  }
  return DEFAULT_ROUTE.baseUrl;
}

interface ProxyOptions {
  upstreamPath: string;
  disallowStream?: boolean;
}

export async function proxyOpenAiRequest(request: NextRequest, options: ProxyOptions) {
  const headerNexApiKey = request.headers.get('x-nexapi-key')?.trim() || null;
  const bearer = extractBearer(request);
  let secretKey = headerNexApiKey || (looksLikeNexApiKey(bearer) ? bearer : null);
  if (!secretKey) {
    const ctx = await getRequestUserContext(request, { allowDefaultApiKey: false });
    secretKey =
      ctx.nexApiKey
      || (looksLikeNexApiKey(ctx.apiKey) ? ctx.apiKey : null);
  }
  if (!secretKey) {
    return NextResponse.json({ error: 'Missing NexAPI key' }, { status: 401 });
  }

  const byokMode = looksLikeByokUpstreamKey(secretKey);
  const keyRecord = byokMode ? null : await getActiveApiKeyRecord(secretKey);
  if (!byokMode && !keyRecord) {
    return NextResponse.json({ error: 'Invalid or inactive NexAPI key' }, { status: 401 });
  }

  if (keyRecord) {
    const wallet = await ensureWallet(keyRecord.userId);
    if (wallet.balanceCredits <= BigInt(0)) {
      return NextResponse.json(
        { error: { code: 'INSUFFICIENT_CREDITS', message: '积分不足，请先充值' } },
        { status: 402 }
      );
    }
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (options.disallowStream && (body as { stream?: boolean }).stream) {
    return NextResponse.json(
      { error: { code: 'STREAM_UNSUPPORTED', message: '当前版本暂不支持流式输出' } },
      { status: 400 }
    );
  }

  const modelId = (body as { model?: string }).model;
  if (!modelId) {
    return NextResponse.json({ error: 'model is required' }, { status: 400 });
  }

  const modelPrice = await getModelPrice(modelId);
  if (!byokMode && !modelPrice) {
    return NextResponse.json(
      { error: { code: 'MODEL_UNAVAILABLE', message: `模型 ${modelId} 未配置` } },
      { status: 400 }
    );
  }

  const upstreamKey = byokMode ? secretKey : process.env.NEXAPI_UPSTREAM_KEY?.trim();
  if (!upstreamKey) {
    return NextResponse.json(
      { error: { code: 'UPSTREAM_KEY_MISSING', message: 'NEXAPI_UPSTREAM_KEY 未配置' } },
      { status: 500 }
    );
  }

  const routeBase = resolveRouteBase(request);
  const upstreamUrl = new URL(options.upstreamPath, `${routeBase.replace(/\/$/, '')}/`).toString();
  const upstreamHeaders = new Headers();
  upstreamHeaders.set('Content-Type', 'application/json');
  upstreamHeaders.set('Authorization', `Bearer ${upstreamKey}`);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);

  const startTime = Date.now();
  let upstreamResponse: Response;
  let responseBody = '';
  try {
    upstreamResponse = await fetch(upstreamUrl, {
      method: 'POST',
      headers: upstreamHeaders,
      body: JSON.stringify(body),
      cache: 'no-store',
      signal: controller.signal,
    });
    responseBody = await upstreamResponse.text();
  } catch (error) {
    const isTimeout = error instanceof DOMException && error.name === 'AbortError';
    console.error('[nexapi/proxy] upstream request failed', error);
    return NextResponse.json(
      { error: { code: isTimeout ? 'UPSTREAM_TIMEOUT' : 'UPSTREAM_ERROR', message: isTimeout ? '上游响应超时，请稍后重试' : '上游接口不可用，请稍后再试' } },
      { status: isTimeout ? 504 : 502 }
    );
  } finally {
    clearTimeout(timeoutId);
  }

  const headers = new Headers();
  const contentType = upstreamResponse.headers.get('content-type');
  if (contentType) headers.set('content-type', contentType);
  headers.set('x-nexapi-route', routeBase);

  let parsed: any = null;
  try {
    parsed = JSON.parse(responseBody);
  } catch {
    parsed = null;
  }

  if (upstreamResponse.ok && parsed?.usage && keyRecord && modelPrice) {
    const usage = parsed.usage;
    const promptTokens = Number(usage.prompt_tokens ?? 0);
    const completionTokens = Number(usage.completion_tokens ?? 0);
    const pricing = computePricing({
      model: modelPrice,
      promptTokens,
      completionTokens,
    });

    try {
      await prisma.$transaction(async (tx) => {
        await adjustWalletCreditsInTransaction(tx, keyRecord.userId, BigInt(-pricing.credits), {
          reason: 'deduct',
          channel: 'api',
          refId: modelId,
          meta: {
            port: 'api',
            source: 'API',
            model: modelId,
            route: routeBase,
            apiKeyId: keyRecord.id,
            promptTokens,
            completionTokens,
            priceCny: pricing.sellCost,
            chargedCredits: pricing.credits,
            responseMs: Date.now() - startTime,
          },
        });
      });
      headers.set('x-nexapi-credits-charged', String(pricing.credits));
    } catch (error: any) {
      if (error?.message?.includes('Insufficient credits')) {
        return NextResponse.json(
          { error: { code: 'INSUFFICIENT_CREDITS', message: '积分不足，请充值后再试' } },
          { status: 402 }
        );
      }
      console.error('[nexapi/proxy] billing failed', error);
      return NextResponse.json(
        { error: { code: 'BILLING_ERROR', message: '扣费失败，请稍后重试' } },
        { status: 500 }
      );
    }
  }

  return new NextResponse(responseBody, {
    status: upstreamResponse.status,
    headers,
  });
}
