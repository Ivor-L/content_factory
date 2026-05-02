import prisma from '@/lib/prisma';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { POINTS_API_BASES } from '@/lib/points-server';
import type { Prisma } from '@prisma/client';

const INTERNAL_SECRET = process.env.CREDITS_INTERNAL_SECRET?.trim() || '';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type LoginIdentityProvider = 'email' | 'phone' | 'wechat';

export interface LoginIdentityInput {
  provider: LoginIdentityProvider;
  providerUid: string;
  verifiedAt?: Date;
  meta?: Prisma.InputJsonValue;
}

export interface FinalizeLoginInput {
  userId: string;
  identities?: LoginIdentityInput[];
  profileUpdates?: {
    username?: string | null;
    full_name?: string | null;
    avatar_url?: string | null;
    role?: string;
    plan?: string;
    wechat_openid?: string | null;
  };
}

export interface FinalizeLoginResult {
  userId: string;
  apiKey: string;
  username: string | null;
  avatarUrl: string | null;
}

export class FinalizeLoginError extends Error {
  code: string;
  status: number;

  constructor(code: string, message: string, status = 500) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

type ProfileWritableFields = {
  username?: string | null;
  full_name?: string | null;
  avatar_url?: string | null;
  role?: string;
  plan?: string;
  wechat_openid?: string | null;
};

function buildProfileUpdateData(updates: FinalizeLoginInput['profileUpdates']): ProfileWritableFields {
  const data: ProfileWritableFields = {};
  if (!updates) return data;

  if (updates.username !== undefined) data.username = updates.username;
  if (updates.full_name !== undefined) data.full_name = updates.full_name;
  if (updates.avatar_url !== undefined) data.avatar_url = updates.avatar_url;
  if (updates.role !== undefined) data.role = updates.role;
  if (updates.plan !== undefined) data.plan = updates.plan;
  if (updates.wechat_openid !== undefined) data.wechat_openid = updates.wechat_openid;

  return data;
}

function normalizeIdentity(provider: LoginIdentityProvider, rawUid: string): string {
  const uid = String(rawUid || '').trim();
  if (!uid) {
    throw new FinalizeLoginError('INVALID_IDENTITY', `${provider} identity is required`, 400);
  }

  if (provider === 'email') {
    const email = uid.toLowerCase();
    if (!EMAIL_RE.test(email)) {
      throw new FinalizeLoginError('INVALID_IDENTITY', 'Invalid email identity', 400);
    }
    return email;
  }

  return uid;
}

async function getAuthUserSnapshot(userId: string) {
  const { data, error } = await supabaseAdmin.auth.admin.getUserById(userId);
  if (error || !data?.user) {
    throw new FinalizeLoginError(
      'AUTH_USER_NOT_FOUND',
      error?.message || 'Auth user not found',
      404
    );
  }

  const user = data.user;
  const fullName =
    String(user.user_metadata?.full_name || user.user_metadata?.name || '').trim() || null;
  const email = String(user.email || '').trim().toLowerCase() || null;

  return {
    email,
    fullName,
  };
}

async function ensureProfile(userId: string, profileUpdates?: FinalizeLoginInput['profileUpdates']) {
  const now = new Date();
  const updateData = buildProfileUpdateData(profileUpdates);

  let profile = await prisma.profiles.findUnique({
    where: { id: userId },
    select: {
      id: true,
      username: true,
      full_name: true,
      avatar_url: true,
      api_key: true,
    },
  });

  if (!profile) {
    const authUser = await getAuthUserSnapshot(userId);
    const fallbackName = authUser.fullName || (authUser.email ? authUser.email.split('@')[0] : '用户');
    const createData: Prisma.profilesUncheckedCreateInput = {
      id: userId,
      full_name: fallbackName,
      role: 'free',
      plan: 'free',
      updated_at: now,
      ...updateData,
    };

    await prisma.profiles.create({
      data: createData,
    });
  } else if (Object.keys(updateData).length > 0) {
    await prisma.profiles.update({
      where: { id: userId },
      data: {
        ...(updateData as Prisma.profilesUncheckedUpdateInput),
        updated_at: now,
      },
    });
  }

  const refreshed = await prisma.profiles.findUnique({
    where: { id: userId },
    select: {
      id: true,
      username: true,
      full_name: true,
      avatar_url: true,
      api_key: true,
    },
  });

  if (!refreshed) {
    throw new FinalizeLoginError('PROFILE_NOT_FOUND', 'Profile not found after ensure', 500);
  }

  return refreshed;
}

async function ensureIdentities(userId: string, identities: LoginIdentityInput[]) {
  for (const identity of identities) {
    const provider = identity.provider;
    const providerUid = normalizeIdentity(provider, identity.providerUid);

    const existing = await prisma.userAuthIdentity.findUnique({
      where: {
        provider_providerUid: {
          provider,
          providerUid,
        },
      },
      select: { userId: true },
    });

    if (existing?.userId && existing.userId !== userId) {
      throw new FinalizeLoginError(
        'IDENTITY_ALREADY_BOUND',
        `${provider} identity is already bound to another account`,
        409
      );
    }

    await prisma.userAuthIdentity.upsert({
      where: {
        provider_providerUid: {
          provider,
          providerUid,
        },
      },
      update: {
        userId,
        verifiedAt: identity.verifiedAt ?? new Date(),
        ...(identity.meta !== undefined ? { meta: identity.meta } : {}),
      },
      create: {
        userId,
        provider,
        providerUid,
        verifiedAt: identity.verifiedAt ?? new Date(),
        ...(identity.meta !== undefined ? { meta: identity.meta } : {}),
      },
    });
  }
}

async function ensureCreditsApiKey(userId: string, currentApiKey: string | null) {
  const existing = String(currentApiKey || '').trim();
  if (existing) return existing;

  if (!INTERNAL_SECRET) {
    throw new FinalizeLoginError(
      'CREDITS_CONFIG_MISSING',
      'CREDITS_INTERNAL_SECRET not configured',
      500
    );
  }

  const authUser = await getAuthUserSnapshot(userId);
  if (!authUser.email) {
    throw new FinalizeLoginError(
      'CREDITS_EMAIL_MISSING',
      'No email found for credits provisioning',
      400
    );
  }

  for (const base of POINTS_API_BASES) {
    try {
      const res = await fetch(`${base}/internal/provision`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-internal-secret': INTERNAL_SECRET,
        },
        body: JSON.stringify({ email: authUser.email }),
        cache: 'no-store',
      });
      if (!res.ok) continue;

      const payload = await res.json().catch(() => null) as Record<string, unknown> | null;
      const data = (payload?.data as Record<string, unknown> | undefined) || {};
      const apiKey = String(
        data.apiKey || data.api_key || payload?.apiKey || payload?.api_key || ''
      ).trim();

      if (!apiKey) continue;

      await prisma.profiles.update({
        where: { id: userId },
        data: {
          api_key: apiKey,
          updated_at: new Date(),
        },
      });

      return apiKey;
    } catch {
      continue;
    }
  }

  throw new FinalizeLoginError(
    'CREDITS_PROVISION_FAILED',
    'Failed to provision credits account',
    502
  );
}

export async function finalizeLogin(input: FinalizeLoginInput): Promise<FinalizeLoginResult> {
  const userId = String(input.userId || '').trim();
  if (!userId) {
    throw new FinalizeLoginError('INVALID_USER', 'userId is required', 400);
  }

  const profile = await ensureProfile(userId, input.profileUpdates);

  if (input.identities?.length) {
    await ensureIdentities(userId, input.identities);
  }

  const apiKey = await ensureCreditsApiKey(userId, profile.api_key ?? null);

  const refreshed = await prisma.profiles.findUnique({
    where: { id: userId },
    select: {
      id: true,
      username: true,
      full_name: true,
      avatar_url: true,
    },
  });

  if (!refreshed) {
    throw new FinalizeLoginError('PROFILE_NOT_FOUND', 'Profile not found after finalize', 500);
  }

  return {
    userId: refreshed.id,
    apiKey,
    username: refreshed.username ?? refreshed.full_name ?? null,
    avatarUrl: refreshed.avatar_url ?? null,
  };
}
