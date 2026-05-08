const SESSION_SYNC_TIMEOUT_MS = 8_000;

export async function syncServerSession(accessToken: string | null): Promise<void> {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), SESSION_SYNC_TIMEOUT_MS);
  const method = accessToken ? 'POST' : 'DELETE';
  const init: RequestInit = {
    method,
    credentials: 'same-origin',
    signal: controller.signal,
    headers: {
      'Content-Type': 'application/json',
    },
  };

  if (accessToken) {
    init.body = JSON.stringify({ accessToken });
  }

  try {
    const response = await fetch('/api/auth/session', init);
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      const message = (payload && payload.error) || 'Failed to sync auth session';
      throw new Error(message);
    }
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('Auth session sync timed out');
    }
    throw error;
  } finally {
    window.clearTimeout(timeoutId);
  }
}
