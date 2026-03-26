/**
 * 租户中间件
 * 
 * 解析 URL 路径，识别租户
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { VALID_TENANT_SLUGS } from '@/lib/tenants/config';

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     * - api routes
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\..*$).*)',
  ],
};

function createTenantRequestHeaders(request: NextRequest, tenantSlug: string) {
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-tenant-slug', tenantSlug);
  return requestHeaders;
}

const SITE_ONLY_FLAG = process.env.SITE_ONLY_MODE?.toLowerCase() === 'true';
const SITE_ONLY_HOSTS = (process.env.SITE_ONLY_HOSTS ?? 'nextide.ai,www.nextide.ai')
  .split(',')
  .map((item) => item.trim().toLowerCase())
  .filter(Boolean);

function getRequestHost(request: NextRequest): string {
  const forwardedHost = request.headers.get('x-forwarded-host');
  const hostHeader = request.headers.get('host');
  return (forwardedHost || hostHeader || '').toLowerCase();
}

function isSiteOnlyHost(host: string): boolean {
  return SITE_ONLY_HOSTS.some((allowedHost) => host === allowedHost);
}

function withTenantHeader(request: NextRequest, tenantSlug: string) {
  const response = NextResponse.next({
    request: {
      headers: createTenantRequestHeaders(request, tenantSlug),
    },
  });
  response.headers.set('x-tenant-slug', tenantSlug);
  return response;
}

function inferTenantFromHost(request: NextRequest): string | null {
  const host = getRequestHost(request);

  if (
    host.includes('nextide.cpolar.top') ||
    host === 'nextide.ai' ||
    host === 'www.nextide.ai'
  ) {
    return 'nextide';
  }

  return null;
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const host = getRequestHost(request);
  const isSiteOnlyRequest = SITE_ONLY_FLAG || isSiteOnlyHost(host);
  const inferredTenantSlug = inferTenantFromHost(request);

  // Canvas runtime SPA fallback:
  // - serve static assets directly
  // - rewrite route paths (without file extension) to index.html
  if (pathname.startsWith('/canvas-runtime')) {
    const lastSegment = pathname.split('/').pop() || '';
    const hasFileExtension = lastSegment.includes('.');
    if (hasFileExtension) {
      return NextResponse.next();
    }

    const rewriteUrl = request.nextUrl.clone();
    rewriteUrl.pathname = '/canvas-runtime/index.html';
    return NextResponse.rewrite(rewriteUrl);
  }

  if (isSiteOnlyRequest) {
    if (
      pathname.startsWith('/_next') ||
      pathname.startsWith('/api') ||
      pathname.startsWith('/static') ||
      pathname.includes('.')
    ) {
      return NextResponse.next();
    }

    if (pathname === '/' || pathname === '/openclaw') {
      return withTenantHeader(request, 'nextide');
    }

    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = '/';
    return NextResponse.redirect(redirectUrl);
  }

  if (pathname === '/') {
    const target = inferredTenantSlug ? `/${inferredTenantSlug}/dashboard` : '/dashboard';
    return NextResponse.redirect(new URL(target, request.url));
  }

  // 跳过静态资源和 API
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api') ||
    pathname.startsWith('/static') ||
    pathname.includes('.')
  ) {
    return NextResponse.next();
  }

  // 解析路径第一个 segment
  const segments = pathname.split('/').filter(Boolean);
  const firstSegment = segments[0];

  // 检查是否为租户路径
  if (firstSegment && VALID_TENANT_SLUGS.includes(firstSegment)) {
    const tenantSlug = firstSegment;
    const remainingSegments = segments.slice(1);
    const rewrittenPath =
      remainingSegments.length === 0 ? '/dashboard' : `/${remainingSegments.join('/')}`;

    const rewriteUrl = request.nextUrl.clone();
    rewriteUrl.pathname = rewrittenPath;

    const response = NextResponse.rewrite(rewriteUrl, {
      request: {
        headers: createTenantRequestHeaders(request, tenantSlug),
      },
    });
    response.headers.set('x-tenant-slug', tenantSlug);

    return response;
  }

  if (inferredTenantSlug && !VALID_TENANT_SLUGS.includes(firstSegment)) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = `/${inferredTenantSlug}${pathname}`;
    return NextResponse.redirect(redirectUrl);
  }

  // 非租户路径，默认使用 nextide
  // 对于现有路径（如 /dashboard），添加租户 header
  return withTenantHeader(request, 'nextide');
}
