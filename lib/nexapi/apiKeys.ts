import crypto from 'node:crypto';
import prisma from '@/lib/prisma';

export type ApiKeyRecord = {
  id: string;
  label: string | null;
  lastFour: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
};

export type ActiveApiKeyRecord = {
  id: string;
  userId: string;
  label: string | null;
  lastFour: string;
  status: string;
};

function hashKey(key: string) {
  return crypto.createHash('sha256').update(key).digest('hex');
}

function generateKey(): string {
  const raw = crypto.randomBytes(24).toString('base64url');
  return `nxt_${raw}`;
}

export async function createApiKey(userId: string, label?: string) {
  const secret = generateKey();
  const lastFour = secret.slice(-4);
  const keyHash = hashKey(secret);

  const record = await prisma.apiKey.create({
    data: {
      userId,
      label,
      keyHash,
      lastFour,
      status: 'active',
      scopes: [],
    },
  });

  return {
    id: record.id,
    secret,
    lastFour,
    label: record.label,
    createdAt: record.createdAt,
  };
}

export async function listApiKeys(userId: string): Promise<ApiKeyRecord[]> {
  const keys = await prisma.apiKey.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
  });

  return keys.map((key) => ({
    id: key.id,
    label: key.label,
    lastFour: key.lastFour,
    status: key.status,
    createdAt: key.createdAt,
    updatedAt: key.updatedAt,
  }));
}

export async function revokeApiKey(userId: string, keyId: string) {
  await prisma.apiKey.updateMany({
    where: { id: keyId, userId },
    data: { status: 'revoked' },
  });
}

export async function getActiveApiKeyRecord(secret: string | null): Promise<ActiveApiKeyRecord | null> {
  if (!secret) return null;
  const keyHash = hashKey(secret);
  const record = await prisma.apiKey.findFirst({
    where: {
      keyHash,
      status: 'active',
    },
    select: {
      id: true,
      userId: true,
      label: true,
      lastFour: true,
      status: true,
    },
  });
  if (!record) return null;
  return {
    id: record.id,
    userId: record.userId,
    label: record.label,
    lastFour: record.lastFour,
    status: record.status,
  };
}

export async function resolveUserIdFromApiKey(secret: string | null): Promise<string | null> {
  try {
    const record = await getActiveApiKeyRecord(secret);
    return record?.userId ?? null;
  } catch (error) {
    console.error('[nexapi] Failed to resolve API key record', error);
    return null;
  }
}
