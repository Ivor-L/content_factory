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

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 跳过静态资源和 API
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api') ||
    pathname.startsWith('/static') ||
    pathname.includes('.') ||
    pathname === '/'
  ) {
    // 首页重定向到默认租户
    if (pathname === '/') {
      const response = NextResponse.redirect(new URL('/dashboard', request.url));
      return response;
    }
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

    const response = NextResponse.rewrite(rewriteUrl);
    response.headers.set('x-tenant-slug', tenantSlug);

    return response;
  }

  // 非租户路径，默认使用 crossborder
  // 对于现有路径（如 /dashboard），添加租户 header
  const response = NextResponse.next();
  response.headers.set('x-tenant-slug', 'crossborder');

  return response;
}
