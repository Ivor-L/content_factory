export async function syncServerSession(accessToken: string | null): Promise<void> {
  const method = accessToken ? 'POST' : 'DELETE';
  const init: RequestInit = {
    method,
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
    },
  };

  if (accessToken) {
    init.body = JSON.stringify({ accessToken });
  }

  const response = await fetch('/api/auth/session', init);
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    const message = (payload && payload.error) || 'Failed to sync auth session';
    throw new Error(message);
  }
}
