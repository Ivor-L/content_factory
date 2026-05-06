import crypto from 'node:crypto';
import type { Prisma } from '@prisma/client';
import prisma from '@/lib/prisma';
import { getProfileApiKeyForUser } from '@/lib/authServer';

const DEFAULT_EXPIRES_SECONDS = 10 * 60;
const POLL_INTERVAL_SECONDS = 3;

function randomToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString('base64url');
}

function userCode(): string {
  const raw = crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');
  return `${raw.slice(0, 3)}-${raw.slice(3)}`;
}

export function getPublicAppUrl(request?: Request): string {
  const configured = process.env.NEXTIDE_DEVICE_LOGIN_BASE_URL || process.env.NEXTIDE_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || 'https://atomx.top';
  if (configured) return configured.replace(/\/$/, '');
  if (request) {
    const url = new URL(request.url);
    return `${url.protocol}//${url.host}`;
  }
  return 'http://localhost:3000';
}

export async function createAgentCliDeviceLogin(input: {
  request?: Request;
  client?: unknown;
  label?: string;
  verificationBaseUrl?: string;
}) {
  const deviceCode = `ndc_${randomToken(32)}`;
  const code = userCode();
  const expiresAt = new Date(Date.now() + DEFAULT_EXPIRES_SECONDS * 1000);
  const label = input.label || 'NexTide CLI';

  const record = await prisma.agentCliDeviceLogin.create({
    data: {
      deviceCode,
      userCode: code,
      status: 'pending',
      label,
      clientJson: (input.client ?? {}) as Prisma.InputJsonValue,
      expiresAt,
    },
  });

  const baseUrl = (input.verificationBaseUrl || getPublicAppUrl(input.request)).replace(/\/$/, '');
  return {
    deviceCode: record.deviceCode,
    userCode: record.userCode,
    verificationUri: `${baseUrl}/agent-login`,
    verificationUriComplete: `${baseUrl}/agent-login?user_code=${encodeURIComponent(record.userCode)}`,
    expiresIn: DEFAULT_EXPIRES_SECONDS,
    interval: POLL_INTERVAL_SECONDS,
  };
}

export async function pollAgentCliDeviceLogin(deviceCode: string) {
  const record = await prisma.agentCliDeviceLogin.findUnique({ where: { deviceCode } });
  if (!record) return { status: 'not_found' as const };
  if (record.expiresAt.getTime() <= Date.now() && record.status === 'pending') {
    await prisma.agentCliDeviceLogin.update({ where: { id: record.id }, data: { status: 'expired' } });
    return { status: 'expired' as const };
  }
  if (record.status !== 'approved') {
    return { status: record.status as 'pending' | 'denied' | 'expired' };
  }
  if (!record.apiKeySecret || !record.userId) {
    return { status: 'approved_missing_token' as const };
  }
  return {
    status: 'approved' as const,
    userId: record.userId,
    apiKey: record.apiKeySecret,
    apiKeyId: record.apiKeyId,
    label: record.label,
  };
}

export async function approveAgentCliDeviceLogin(input: {
  userCode: string;
  userId: string;
}) {
  const code = input.userCode.trim().toUpperCase();
  const record = await prisma.agentCliDeviceLogin.findUnique({ where: { userCode: code } });
  if (!record) return { ok: false as const, code: 'device_code_not_found', message: '授权码不存在' };
  if (record.status !== 'pending') return { ok: false as const, code: `device_code_${record.status}`, message: `授权码状态为 ${record.status}` };
  if (record.expiresAt.getTime() <= Date.now()) {
    await prisma.agentCliDeviceLogin.update({ where: { id: record.id }, data: { status: 'expired' } });
    return { ok: false as const, code: 'device_code_expired', message: '授权码已过期' };
  }

  const systemApiKey = await getProfileApiKeyForUser(input.userId);
  if (!systemApiKey) {
    return { ok: false as const, code: 'profile_api_key_missing', message: '当前用户没有系统 API Key，请先完成注册初始化或在用户设置中生成 API Key。' };
  }
  const updated = await prisma.agentCliDeviceLogin.update({
    where: { id: record.id },
    data: {
      status: 'approved',
      userId: input.userId,
      apiKeyId: null,
      apiKeySecret: systemApiKey,
      approvedAt: new Date(),
    },
  });

  return {
    ok: true as const,
    userCode: updated.userCode,
    label: updated.label,
    apiKeyId: null,
    lastFour: systemApiKey.slice(-4),
  };
}

export async function denyAgentCliDeviceLogin(userCode: string) {
  const code = userCode.trim().toUpperCase();
  const record = await prisma.agentCliDeviceLogin.findUnique({ where: { userCode: code } });
  if (!record) return { ok: false as const, code: 'device_code_not_found', message: '授权码不存在' };
  await prisma.agentCliDeviceLogin.update({ where: { id: record.id }, data: { status: 'denied', deniedAt: new Date() } });
  return { ok: true as const };
}
