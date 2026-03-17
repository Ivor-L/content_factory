import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getRequestUserContext } from '@/lib/authServer';

const DEFAULT_POINTS_API_BASE = 'https://api.atomx.top';
const POINTS_API_BASES = Array.from(
  new Set(
    [process.env.POINTS_API_BASE, DEFAULT_POINTS_API_BASE]
      .filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
      .map((v) => v.trim().replace(/\/$/, ''))
  )
);

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables for referrals API');
}

const baseClientOptions = {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
} as const;

const supabaseAdmin = supabaseServiceRoleKey
  ? createClient(supabaseUrl, supabaseServiceRoleKey, baseClientOptions)
  : null;

const USAGE_PAGE_SIZE = Number(process.env.REFERRAL_USAGE_PAGE_SIZE ?? 200);
const USAGE_MAX_PAGES = Number(process.env.REFERRAL_USAGE_MAX_PAGES ?? 5);

const UUID_REGEX = /^[0-9a-fA-F]{8}-?[0-9a-fA-F]{4}-?[0-9a-fA-F]{4}-?[0-9a-fA-F]{4}-?[0-9a-fA-F]{12}$/;

type ProfileRow = {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  api_key: string | null;
};

interface UsageSummary {
  consumed: number;
  eventCount: number;
  truncated: boolean;
  lastEventAt: string | null;
}

function ensureAdminClient() {
  if (!supabaseAdmin) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is required for referral operations');
  }
  return supabaseAdmin;
}

function readTextSafe(res: Response) {
  return res
    .text()
    .then((text) => text)
    .catch(() => '');
}

function looksLikeHtml(res: Response, bodyText: string) {
  const ct = res.headers.get('content-type') || '';
  return ct.includes('text/html') || bodyText.trimStart().startsWith('<!DOCTYPE html');
}

function decodeReferralCode(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (UUID_REGEX.test(trimmed)) {
    return normalizeUuid(trimmed);
  }
  try {
    const normalized = trimmed.replace(/-/g, '+').replace(/_/g, '/');
    const padding = normalized.length % 4;
    const padded = padding === 0 ? normalized : normalized + '='.repeat(4 - padding);
    const decoded = Buffer.from(padded, 'base64').toString('utf8');
    if (UUID_REGEX.test(decoded)) {
      return normalizeUuid(decoded);
    }
  } catch {
    // ignore decoding errors
  }
  return null;
}

function normalizeUuid(value: string) {
  return value
    .replace(/[^0-9a-fA-F]/g, '')
    .replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, '$1-$2-$3-$4-$5')
    .toLowerCase();
}

function parseNumberLike(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const num = Number(value);
    if (Number.isFinite(num)) return num;
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
    payload?.data?.data?.total,
    payload?.data?.records?.total,
    payload?.data?.pagination?.total,
    payload?.pagination?.total
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
    event?.time
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

function parseUsageDelta(event: any): number {
  const delta = parseNumberLike(event?.delta ?? event?.change ?? event?.credits_change ?? event?.creditsChange);
  if (delta !== null) {
    return delta < 0 ? Math.abs(delta) : 0;
  }
  const amount = parseNumberLike(event?.amount ?? event?.credit ?? event?.used ?? event?.usage ?? event?.deducted);
  return amount !== null ? Math.max(0, amount) : 0;
}

async function fetchUsageSummaryFromBase(base: string, apiKey: string): Promise<UsageSummary> {
  let consumed = 0;
  let eventCount = 0;
  let lastEventAt: string | null = null;
  let totalRecords: number | null = null;

  for (let page = 1; page <= USAGE_MAX_PAGES; page++) {
    const url = new URL('/usage/events', base);
    url.searchParams.set('apiKey', apiKey);
    url.searchParams.set('page', String(page));
    url.searchParams.set('size', String(USAGE_PAGE_SIZE));

    const res = await fetch(url.toString(), { cache: 'no-store' });
    if (!res.ok) {
      const body = await readTextSafe(res);
      throw new Error(`Usage events failed (${res.status}): ${body.slice(0, 200)}`);
    }

    const text = await readTextSafe(res);
    if (looksLikeHtml(res, text)) {
      throw new Error('Usage events returned HTML');
    }

    const payload = text ? JSON.parse(text) : {};
    const events = extractUsageArray(payload);
    totalRecords = totalRecords ?? extractTotalCount(payload);

    for (const event of events) {
      consumed += parseUsageDelta(event);
      const ts = parseEventTimestamp(event);
      if (ts && (!lastEventAt || ts > lastEventAt)) {
        lastEventAt = ts;
      }
    }

    eventCount += events.length;

    if (events.length < USAGE_PAGE_SIZE) {
      break;
    }
    if (totalRecords && page * USAGE_PAGE_SIZE >= totalRecords) {
      break;
    }
  }

  const truncated = Boolean(
    totalRecords && totalRecords > USAGE_PAGE_SIZE * USAGE_MAX_PAGES
  );

  return {
    consumed,
    eventCount,
    truncated,
    lastEventAt
  };
}

async function fetchUsageSummary(apiKey: string): Promise<UsageSummary | null> {
  if (!apiKey) return null;
  for (const base of POINTS_API_BASES) {
    try {
      return await fetchUsageSummaryFromBase(base, apiKey);
    } catch (error) {
      console.error('Failed to fetch usage summary from', base, error);
    }
  }
  return null;
}

async function mapWithLimit<T, R>(items: T[], limit: number, mapper: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  const executing = new Set<Promise<void>>();

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const p = (async () => {
      results[i] = await mapper(item, i);
    })();
    executing.add(p);
    p.finally(() => executing.delete(p));
    if (executing.size >= limit) {
      await Promise.race(executing);
    }
  }

  await Promise.all(executing);
  return results;
}

export async function GET(request: Request) {
  try {
    const { userId } = await getRequestUserContext(request);
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const admin = ensureAdminClient();

    const { data: bindingRows, error: bindingError } = await admin
      .from('user_referrals')
      .select('id, referrer_id, invitee_id, created_at, source')
      .eq('referrer_id', userId)
      .order('created_at', { ascending: false });

    if (bindingError) {
      console.error('Failed to load referral bindings', bindingError);
      return NextResponse.json({ error: 'Failed to load referrals' }, { status: 500 });
    }

    const { data: boundRow, error: boundError } = await admin
      .from('user_referrals')
      .select('referrer_id, created_at')
      .eq('invitee_id', userId)
      .maybeSingle();

    if (boundError) {
      console.error('Failed to check existing referral binding', boundError);
    }

    const profileIds = new Set<string>();
    bindingRows?.forEach((row) => profileIds.add(row.invitee_id));
    if (boundRow?.referrer_id) {
      profileIds.add(boundRow.referrer_id);
    }

    const profileIdList = Array.from(profileIds);
    let profileRows: ProfileRow[] = [];
    if (profileIdList.length > 0) {
      const { data: profiles, error: profilesError } = await admin
        .from('profiles')
        .select('id, full_name, avatar_url, api_key')
        .in('id', profileIdList);
      if (profilesError) {
        console.error('Failed to load referral profiles', profilesError);
      } else if (profiles) {
        profileRows = profiles as ProfileRow[];
      }
    }

    const profileMap = profileRows.reduce<Record<string, ProfileRow>>((acc, row) => {
      acc[row.id] = row;
      return acc;
    }, {});

    const invitees = bindingRows ?? [];
    const inviteeSummaries = await mapWithLimit(invitees, 3, async (row) => {
      const profile = profileMap[row.invitee_id];
      const usage = profile?.api_key ? await fetchUsageSummary(profile.api_key) : null;

      return {
        bindingId: row.id,
        inviteeId: row.invitee_id,
        createdAt: row.created_at,
        source: row.source,
        name: profile?.full_name ?? null,
        avatarUrl: profile?.avatar_url ?? null,
        totalConsumed: usage?.consumed ?? null,
        usageEventCount: usage?.eventCount ?? null,
        usageTruncated: usage?.truncated ?? false,
        lastUsageAt: usage?.lastEventAt ?? null
      };
    });

    const summary = inviteeSummaries.reduce(
      (acc, item) => {
        if (typeof item.totalConsumed === 'number') {
          acc.totalConsumed += item.totalConsumed;
        }
        acc.inviteeCount += 1;
        return acc;
      },
      { inviteeCount: 0, totalConsumed: 0 }
    );

    const boundProfile = boundRow?.referrer_id ? profileMap[boundRow.referrer_id] : null;

    return NextResponse.json({
      ok: true,
      shareCode: userId,
      boundTo: boundRow
        ? {
            referrerId: boundRow.referrer_id,
            createdAt: boundRow.created_at,
            name: boundProfile?.full_name ?? null,
            avatarUrl: boundProfile?.avatar_url ?? null
          }
        : null,
      summary,
      invitees: inviteeSummaries
    });
  } catch (error) {
    console.error('Failed to fetch referrals', error);
    const message = error instanceof Error ? error.message : 'Internal Server Error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const referralCode = typeof body?.referralCode === 'string' ? body.referralCode : null;
    const metadata = body?.metadata && typeof body.metadata === 'object' ? body.metadata : null;
    const source = typeof body?.source === 'string' ? body.source : 'share_link';

    const normalizedReferrerId = decodeReferralCode(referralCode);
    if (!normalizedReferrerId) {
      return NextResponse.json({ error: 'Invalid referral code' }, { status: 400 });
    }

    const { userId } = await getRequestUserContext(request);
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (normalizedReferrerId === userId) {
      return NextResponse.json({ error: 'Cannot bind to yourself' }, { status: 400 });
    }

    const admin = ensureAdminClient();

    const { data: existingBinding } = await admin
      .from('user_referrals')
      .select('id, referrer_id')
      .eq('invitee_id', userId)
      .maybeSingle();

    if (existingBinding) {
      return NextResponse.json({
        ok: true,
        alreadyBound: true,
        referrerId: existingBinding.referrer_id
      });
    }

    const { data: refProfile } = await admin
      .from('profiles')
      .select('id')
      .eq('id', normalizedReferrerId)
      .maybeSingle();

    if (!refProfile) {
      return NextResponse.json({ error: 'Referral user not found' }, { status: 404 });
    }

    const insertPayload = {
      referrer_id: normalizedReferrerId,
      invitee_id: userId,
      source,
      metadata: metadata ? { ...metadata, referralCode } : { referralCode }
    };

    const { data, error } = await admin
      .from('user_referrals')
      .insert(insertPayload)
      .select('id, created_at')
      .single();

    if (error) {
      if ('code' in error && error.code === '23505') {
        return NextResponse.json({ ok: true, alreadyBound: true, referrerId: normalizedReferrerId });
      }
      console.error('Failed to insert referral binding', error);
      return NextResponse.json({ error: 'Failed to bind referral' }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      bound: true,
      referrerId: normalizedReferrerId,
      bindingId: data?.id,
      createdAt: data?.created_at
    });
  } catch (error) {
    console.error('Failed to bind referral', error);
    const message = error instanceof Error ? error.message : 'Internal Server Error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
