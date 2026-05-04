import { NextResponse } from 'next/server';
import {
  POINTS_API_BASES,
  resolveRequestApiKey,
  readTextSafe,
  looksLikeHtml
} from '@/lib/points-server';
import type { UsageEvent, UsageResponsePayload, UsageSummary } from '@/types/credits';

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

type LastError = { status: number; details: string; base: string };

function clampInt(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function parsePositiveInt(raw: string | null, fallback: number) {
  if (!raw) return fallback;
  const numeric = Number.parseInt(raw, 10);
  if (!Number.isFinite(numeric)) return fallback;
  return numeric;
}

function parseNumberLike(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const num = Number(value);
    if (Number.isFinite(num)) return num;
  }
  return null;
}

function parseString(value: unknown): string | null {
  if (typeof value === 'string' && value.trim().length > 0) {
    return value.trim();
  }
  return null;
}

function extractUsageArray(payload: any): any[] {
  if (!payload) return [];
  if (Array.isArray(payload?.data?.data)) return payload.data.data;
  if (Array.isArray(payload?.data?.records)) return payload.data.records;
  if (Array.isArray(payload?.data?.items)) return payload.data.items;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.records)) return payload.records;
  if (Array.isArray(payload?.items)) return payload.items;
  return Array.isArray(payload) ? payload : [];
}

function extractTotalCount(payload: any): number | null {
  const candidates = [
    payload?.data?.total,
    payload?.total,
    payload?.data?.pagination?.total,
    payload?.pagination?.total,
    payload?.data?.data?.total,
    payload?.data?.records?.total
  ];

  for (const candidate of candidates) {
    const num = parseNumberLike(candidate);
    if (num !== null) return num;
  }
  return null;
}

function parseEventTimestamp(event: any): string | null {
  const candidates = [
    event?.created_at,
    event?.createdAt,
    event?.timestamp,
    event?.ts,
    event?.time,
    event?.date
  ];
  for (const candidate of candidates) {
    if (typeof candidate === 'string') {
      return candidate;
    }
    if (candidate instanceof Date) {
      return candidate.toISOString();
    }
  }
  return null;
}

function parseUsageDelta(event: any): number | null {
  const delta = parseNumberLike(
    event?.delta ??
      event?.change ??
      event?.credits_change ??
      event?.creditsChange ??
      event?.credit_change ??
      event?.creditChange ??
      null
  );
  if (delta !== null) return delta;

  const amount = parseNumberLike(
    event?.amount ??
      event?.credit ??
      event?.used ??
      event?.usage ??
      event?.deducted ??
      event?.value ??
      event?.cost ??
      null
  );
  return amount ?? null;
}

function parseBalanceAfter(event: any): number | null {
  const candidates = [
    event?.balance_after,
    event?.balanceAfter,
    event?.balance_afterwards,
    event?.balance_afterwards,
    event?.balance_after_change,
    event?.balance,
    event?.remaining
  ];
  for (const candidate of candidates) {
    const num = parseNumberLike(candidate);
    if (num !== null) return num;
  }
  return null;
}

function parseWorkflowId(event: any): string | null {
  const candidates = [
    event?.workflow_id,
    event?.workflowId,
    event?.workflow,
    event?.workflow_code,
    event?.workflowCode,
    event?.route?.workflow_id,
    event?.route?.workflowId
  ];
  for (const candidate of candidates) {
    const str = parseString(candidate);
    if (str) return str;
  }
  return null;
}

function parseWorkflowName(event: any): string | null {
  const candidates = [
    event?.workflow_name,
    event?.workflowName,
    event?.workflow?.name,
    event?.workflow?.title,
    event?.route?.workflow_name,
    event?.route?.workflowName,
    event?.task?.workflow_name,
    event?.task?.workflowName
  ];
  for (const candidate of candidates) {
    const str = parseString(candidate);
    if (str) return str;
  }
  return null;
}

function parseReason(event: any): string | null {
  const candidates = [
    event?.reason,
    event?.description,
    event?.desc,
    event?.remark,
    event?.message,
    event?.event,
    event?.type,
    event?.action
  ];
  for (const candidate of candidates) {
    const str = parseString(candidate);
    if (str) return str;
  }
  return null;
}

function parseEventId(event: any, fallbackIndex: number) {
  const candidates = [
    event?.id,
    event?._id,
    event?.event_id,
    event?.eventId,
    event?.record_id,
    event?.recordId,
    event?.uuid,
    event?.sn,
    event?.seq
  ];
  for (const candidate of candidates) {
    const str = parseString(candidate);
    if (str) return str;
  }
  const ts = parseEventTimestamp(event);
  return ts ? `${ts}-${fallbackIndex}` : `event-${fallbackIndex}`;
}

function normalizeUsageEvent(raw: any, index: number, includeRaw: boolean): UsageEvent {
  const delta = parseUsageDelta(raw);
  const amount = delta === null ? null : delta < 0 ? Math.abs(delta) : delta;
  const reason = parseReason(raw);
  const workflowName = parseWorkflowName(raw);

  return {
    id: parseEventId(raw, index),
    createdAt: parseEventTimestamp(raw),
    description: reason ?? workflowName ?? parseWorkflowId(raw),
    workflowId: parseWorkflowId(raw),
    workflowName,
    reason,
    amount,
    delta,
    balanceAfter: parseBalanceAfter(raw),
    raw: includeRaw ? (raw ?? null) : undefined
  };
}

function buildSummary(events: UsageEvent[]): UsageSummary {
  const latest = events[0];
  const netChange = events.reduce((sum, event) => {
    if (typeof event.delta === 'number') {
      return sum + event.delta;
    }
    if (typeof event.amount === 'number') {
      return sum - event.amount;
    }
    return sum;
  }, 0);
  return {
    pageConsumed: netChange,
    latestBalance: latest?.balanceAfter ?? null,
    latestAt: latest?.createdAt ?? null,
    eventCount: events.length
  };
}

function shouldIncludeRaw(searchParams: URLSearchParams) {
  const rawParam = searchParams.get('raw') ?? searchParams.get('debug');
  return rawParam === '1' || rawParam === 'true';
}

export async function GET(request: Request) {
  const apiKey = await resolveRequestApiKey(request);

  if (!apiKey) {
    return NextResponse.json({ error: 'Unauthorized or no API key linked' }, { status: 401 });
  }

  const url = new URL(request.url);
  const searchParams = url.searchParams;
  const requestedPage = clampInt(parsePositiveInt(searchParams.get('page'), 1), 1, Number.MAX_SAFE_INTEGER);
  const requestedSize = clampInt(parsePositiveInt(searchParams.get('size'), DEFAULT_PAGE_SIZE), 1, MAX_PAGE_SIZE);
  const includeRaw = shouldIncludeRaw(searchParams);

  let lastError: LastError | null = null;

  for (const base of POINTS_API_BASES) {
    try {
      const usageUrl = new URL('/usage/events', base);
      usageUrl.searchParams.set('apiKey', apiKey);
      usageUrl.searchParams.set('page', String(requestedPage));
      usageUrl.searchParams.set('size', String(requestedSize));

      const res = await fetch(usageUrl.toString(), { cache: 'no-store' });
      const text = await readTextSafe(res);

      if (!res.ok) {
        lastError = { status: res.status, details: text.slice(0, 500), base };
        continue;
      }

      if (looksLikeHtml(res, text)) {
        lastError = { status: res.status, details: text.slice(0, 500), base };
        continue;
      }

      let payload: any = {};
      try {
        payload = text ? JSON.parse(text) : {};
      } catch (error) {
        lastError = {
          status: 500,
          details: error instanceof Error ? error.message : 'Invalid JSON payload',
          base
        };
        continue;
      }

      const rawEvents = extractUsageArray(payload);
      const events = rawEvents.map((event, index) => normalizeUsageEvent(event, index, includeRaw));

      const response: UsageResponsePayload = {
        ok: true,
        events,
        summary: buildSummary(events),
        pagination: {
          page: requestedPage,
          size: requestedSize,
          total: extractTotalCount(payload),
          base
        }
      };

      return NextResponse.json(response);
    } catch (error) {
      lastError = {
        status: 500,
        details: error instanceof Error ? error.message : 'Unknown error',
        base
      };
    }
  }

  return NextResponse.json(
    {
      error: 'Failed to fetch usage records',
      status: lastError?.status ?? 502,
      details: lastError?.details ?? '',
      base: lastError?.base ?? null
    },
    { status: lastError?.status ?? 502 }
  );
}
