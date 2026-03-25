import { cookies, headers } from 'next/headers';
import { getRequestUserContext, type RequestUserContext } from '@/lib/authServer';

export async function getServerRequestUserContext(): Promise<RequestUserContext> {
  const requestHeaders = new Headers();

  try {
    const cookieStore = await cookies();
    let cookiePairs: string[] = [];

    // Try different methods to get all cookies (Next.js 16 API changes)
    if (typeof (cookieStore as any).getAll === 'function') {
      cookiePairs = (cookieStore as any).getAll().map((entry: any) => `${entry.name}=${entry.value}`);
    } else if (typeof (cookieStore as any).entries === 'function') {
      for (const [name, value] of (cookieStore as any).entries()) {
        cookiePairs.push(`${name}=${(value as any).value || value}`);
      }
    } else if (cookieStore && Symbol.iterator in (cookieStore as any)) {
      for (const entry of cookieStore as any) {
        if (entry && entry.name && entry.value) {
          cookiePairs.push(`${entry.name}=${entry.value}`);
        }
      }
    }

    if (cookiePairs.length > 0) {
      requestHeaders.set('cookie', cookiePairs.join('; '));
    }
  } catch (error) {
    console.error('Failed to get cookies:', error);
  }

  const request = new Request('https://content-factory.internal/server-context', {
    headers: requestHeaders,
  });

  return getRequestUserContext(request);
}
