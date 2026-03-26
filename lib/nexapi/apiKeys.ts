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

  const record = await prisma.api_keys.create({
    data: {
      user_id: userId,
      label,
      key_hash: keyHash,
      last_four: lastFour,
      status: 'active',
      scopes: [],
    },
  });

  return {
    id: record.id,
    secret,
    lastFour,
    label: record.label,
    createdAt: record.created_at,
  };
}

export async function listApiKeys(userId: string): Promise<ApiKeyRecord[]> {
  const keys = await prisma.api_keys.findMany({
    where: { user_id: userId },
    orderBy: { created_at: 'desc' },
  });

  return keys.map((key) => ({
    id: key.id,
    label: key.label,
    lastFour: key.last_four,
    status: key.status,
    createdAt: key.created_at,
    updatedAt: key.updated_at,
  }));
}

export async function revokeApiKey(userId: string, keyId: string) {
  await prisma.api_keys.updateMany({
    where: { id: keyId, user_id: userId },
    data: { status: 'revoked' },
  });
}

export async function getActiveApiKeyRecord(secret: string | null): Promise<ActiveApiKeyRecord | null> {
  if (!secret) return null;
  const keyHash = hashKey(secret);
  const record = await prisma.api_keys.findFirst({
    where: {
      key_hash: keyHash,
      status: 'active',
    },
    select: {
      id: true,
      user_id: true,
      label: true,
      last_four: true,
      status: true,
    },
  });
  if (!record) return null;
  return {
    id: record.id,
    userId: record.user_id,
    label: record.label,
    lastFour: record.last_four,
    status: record.status,
  };
}

export async function resolveUserIdFromApiKey(secret: string | null): Promise<string | null> {
  const record = await getActiveApiKeyRecord(secret);
  return record?.userId ?? null;
}
