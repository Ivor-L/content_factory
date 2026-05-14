import type { Prisma } from '@prisma/client';

export const EARN_TASK_STATUSES = ['draft', 'active', 'paused', 'archived'] as const;
export const EARN_USER_TASK_STATUSES = [
  'doing',
  'pending',
  'approved',
  'rejected',
  'cancelled',
  'expired',
  'rewarded',
] as const;

export type EarnTaskStatus = (typeof EARN_TASK_STATUSES)[number];
export type EarnUserTaskStatus = (typeof EARN_USER_TASK_STATUSES)[number];

export function safeTrim(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed || null;
}

export function clampInt(value: unknown, min: number, max: number, fallback: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(Math.floor(parsed), min), max);
}

export function parseJsonObject(value: unknown): Prisma.InputJsonObject {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Prisma.InputJsonObject;
}

export function parseStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map(item => (typeof item === 'string' ? item.trim() : ''))
      .filter(Boolean);
  }

  if (typeof value === 'string') {
    return value
      .split(',')
      .map(item => item.trim())
      .filter(Boolean);
  }

  return [];
}

export function parseDateOrNull(value: unknown): Date | null {
  if (!value) return null;
  const parsed = Date.parse(String(value));
  if (Number.isNaN(parsed)) return null;
  return new Date(parsed);
}

export function isEarnTaskStatus(value: unknown): value is EarnTaskStatus {
  return EARN_TASK_STATUSES.includes(value as EarnTaskStatus);
}

export function isEarnUserTaskStatus(value: unknown): value is EarnUserTaskStatus {
  return EARN_USER_TASK_STATUSES.includes(value as EarnUserTaskStatus);
}

export function normalizeJsonForResponse<T>(value: T): T {
  return value;
}
