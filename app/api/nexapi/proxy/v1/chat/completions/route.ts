import { NextRequest } from 'next/server';
import { proxyOpenAiRequest } from '@/lib/nexapi/proxyHandler';

const UPSTREAM_PATH = '/v1/chat/completions';

export async function POST(request: NextRequest) {
  return proxyOpenAiRequest(request, { upstreamPath: UPSTREAM_PATH, disallowStream: true });
}
