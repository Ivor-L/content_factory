export const dynamic = 'force-dynamic';

import { handleAlipayWebhook } from '@/lib/nexapi/payment';

export async function POST(request: Request) {
  const contentType = request.headers.get('content-type') || '';
  let params: Record<string, string> = {};

  if (contentType.includes('application/x-www-form-urlencoded')) {
    const form = await request.formData();
    form.forEach((value, key) => {
      params[key] = typeof value === 'string' ? value : value.name || '';
    });
  } else {
    const body = await request.text();
    for (const part of body.split('&')) {
      const [key, value] = part.split('=');
      if (!key) continue;
      params[decodeURIComponent(key)] = decodeURIComponent(value ?? '');
    }
  }

  try {
    await handleAlipayWebhook(params);
    return new Response('success');
  } catch (error) {
    console.error('Alipay webhook failed', error);
    return new Response('fail', { status: 400 });
  }
}
