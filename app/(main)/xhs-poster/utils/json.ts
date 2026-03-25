export function safeParseJson<T>(value?: string | T | null): T | null {
  if (value == null) return null;
  if (typeof value === 'object') {
    return value as T;
  }
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed) as T;
  } catch (error) {
    console.warn('[text2img] Failed to parse JSON payload', error);
    return null;
  }
}

export function prettifyJson(value: any): string {
  try {
    if (typeof value === 'string') {
      const parsed = JSON.parse(value);
      return JSON.stringify(parsed, null, 2);
    }
    return JSON.stringify(value, null, 2);
  } catch {
    return typeof value === 'string' ? value : '';
  }
}
