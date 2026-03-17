export const PROFILE_REFRESH_EVENT = 'atomx:profile-refresh';

export function emitProfileRefresh() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(PROFILE_REFRESH_EVENT));
}

export function onProfileRefresh(handler: () => void) {
  if (typeof window === 'undefined') return () => {};
  const listener = () => handler();
  window.addEventListener(PROFILE_REFRESH_EVENT, listener);
  return () => window.removeEventListener(PROFILE_REFRESH_EVENT, listener);
}
