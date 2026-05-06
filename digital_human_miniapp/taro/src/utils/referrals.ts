import Taro from '@tarojs/taro';

const REFERRAL_STORAGE_KEY = 'MINIAPP_PENDING_REFERRAL_CODE';
const REFERRAL_QUERY_KEYS = ['ref', 'referral', 'referralCode', 'invite', 'inviteCode'];

type ReferralQuery = Record<string, unknown> | null | undefined;

function getApiBaseUrl(): string {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fromDefine = typeof __API_BASE_URL__ !== 'undefined' ? String((__API_BASE_URL__ as any) || '').trim() : '';
    if (fromDefine) return fromDefine.replace(/\/$/, '');
  } catch {
    // ignore
  }
  return '';
}

function normalizeReferralCode(value: unknown): string {
  if (Array.isArray(value)) return normalizeReferralCode(value[0]);
  return String(value || '').trim();
}

export function getReferralCodeFromQuery(query: ReferralQuery): string {
  if (!query) return '';
  for (const key of REFERRAL_QUERY_KEYS) {
    const value = normalizeReferralCode(query[key]);
    if (value) return value;
  }
  return '';
}

export function persistReferralCode(code: string): void {
  const normalized = String(code || '').trim();
  if (!normalized) return;
  try {
    Taro.setStorageSync(REFERRAL_STORAGE_KEY, normalized);
  } catch {
    // ignore storage failures
  }
}

export function captureReferralFromQuery(query: ReferralQuery): string {
  const code = getReferralCodeFromQuery(query);
  if (code) persistReferralCode(code);
  return code;
}

export function readPendingReferralCode(): string {
  try {
    return String(Taro.getStorageSync(REFERRAL_STORAGE_KEY) || '').trim();
  } catch {
    return '';
  }
}

export function clearPendingReferralCode(): void {
  try {
    Taro.removeStorageSync(REFERRAL_STORAGE_KEY);
  } catch {
    // ignore storage failures
  }
}

export async function bindPendingReferral(apiKey?: string | null): Promise<boolean> {
  const referralCode = readPendingReferralCode();
  const key = String(apiKey || Taro.getStorageSync('API_KEY') || '').trim();
  if (!referralCode || !key) return false;

  const apiBaseUrl = getApiBaseUrl();
  if (!apiBaseUrl) return false;

  try {
    const res = await Taro.request({
      url: `${apiBaseUrl}/api/referrals`,
      method: 'POST',
      header: {
        'Content-Type': 'application/json',
        'X-User-Api-Key': key,
      },
      data: {
        referralCode,
        source: 'miniapp_share',
        metadata: {
          client: 'weapp',
          stored: true,
        },
      },
    });

    const payload = (res.data || {}) as { bound?: boolean; alreadyBound?: boolean; error?: string };
    if (res.statusCode >= 200 && res.statusCode < 300 && (payload.bound || payload.alreadyBound)) {
      clearPendingReferralCode();
      return true;
    }

    // Self-binding and duplicate/invalid historical codes should not block login forever.
    if (res.statusCode === 400 && /yourself|Invalid referral code/i.test(String(payload.error || ''))) {
      clearPendingReferralCode();
    }
  } catch {
    // Best-effort only. Keep pending code for the next successful login/open.
  }

  return false;
}

export function buildMiniappReferralPath(shareCode?: string | null): string {
  const code = String(shareCode || '').trim();
  const basePath = '/subpages/login/index';
  return code ? `${basePath}?ref=${encodeURIComponent(code)}` : basePath;
}
