export function getProfileInitial(value: string): string {
  if (!value) return 'U';
  const trimmed = value.trim();
  if (!trimmed) return 'U';
  const firstChar = trimmed[0];
  if (!firstChar) return 'U';
  if (/[A-Za-z]/.test(firstChar)) {
    return firstChar.toUpperCase();
  }
  return firstChar;
}
