import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export interface AgentApiKeyAuthResult {
  userId: string;
  profile: {
    id: string;
    api_key: string | null;
    role: string;
    plan: string;
    is_banned: boolean;
    is_admin: boolean;
  };
}

export class AgentAuthError extends Error {
  code: string;
  status: number;

  constructor(code: string, message: string, status = 401) {
    super(message);
    this.name = 'AgentAuthError';
    this.code = code;
    this.status = status;
  }
}

export function extractAgentApiKey(request: Request): string {
  const direct = request.headers.get('x-user-api-key')
    || request.headers.get('x-nextide-api-key')
    || request.headers.get('x-nextide-api-key'.toLowerCase());
  if (direct) return direct.trim();

  const authorization = request.headers.get('authorization') || '';
  if (authorization.toLowerCase().startsWith('bearer ')) {
    return authorization.slice('bearer '.length).trim();
  }

  return '';
}

export async function requireAgentApiKey(request: Request): Promise<AgentApiKeyAuthResult> {
  const apiKey = extractAgentApiKey(request);
  if (!apiKey) {
    throw new AgentAuthError('unauthorized', 'Missing NexTide API Key. Run `nextide auth login` or pass `--user-api-key`.');
  }

  const profile = await prisma.profiles.findFirst({
    where: { api_key: apiKey },
    select: {
      id: true,
      api_key: true,
      role: true,
      plan: true,
      is_banned: true,
      is_admin: true,
    },
  });

  if (!profile) {
    throw new AgentAuthError('unauthorized', 'Invalid NexTide API Key.');
  }

  if (profile.is_banned) {
    throw new AgentAuthError('forbidden', 'This NexTide account is banned.', 403);
  }

  return {
    userId: profile.id,
    profile,
  };
}

export function assertAgentRunReadable(
  auth: AgentApiKeyAuthResult,
  record: { userId?: string | null },
) {
  if (auth.profile.is_admin) return;
  if (!record.userId) return;
  if (record.userId === auth.userId) return;
  throw new AgentAuthError('forbidden', 'You do not have permission to read this Agent run.', 403);
}

export function agentAuthErrorResponse(error: unknown) {
  const authError = error instanceof AgentAuthError
    ? error
    : new AgentAuthError('unauthorized', 'Missing or invalid NexTide API Key.');

  return NextResponse.json(
    {
      error: {
        code: authError.code,
        message: authError.message,
      },
    },
    { status: authError.status },
  );
}
