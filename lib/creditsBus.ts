export const CREDITS_REFRESH_EVENT = 'atomx:credits-refresh';

export function emitCreditsRefresh() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(CREDITS_REFRESH_EVENT));
}

export function onCreditsRefresh(handler: () => void) {
  if (typeof window === 'undefined') return () => {};
  const listener = () => handler();
  window.addEventListener(CREDITS_REFRESH_EVENT, listener);
  return () => window.removeEventListener(CREDITS_REFRESH_EVENT, listener);
}
