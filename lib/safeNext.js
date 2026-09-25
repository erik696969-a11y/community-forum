// Bezpečná návratová adresa po prihlásení: iba cesta v rámci appky
// (začína „/“, nie „//“ ani „/\“), inak null.
export const LOGIN_NEXT_KEY = 'loginNext';

export function safeNext(value) {
  if (typeof value !== 'string') return null;
  const v = value.trim();
  if (!v.startsWith('/') || v.startsWith('//') || v.includes('\\')) return null;
  if (v.startsWith('/login') || v.startsWith('/auth')) return null;
  return v;
}

export function takeStoredNext() {
  if (typeof window === 'undefined') return null;
  try {
    const v = safeNext(window.localStorage.getItem(LOGIN_NEXT_KEY));
    window.localStorage.removeItem(LOGIN_NEXT_KEY);
    return v;
  } catch {
    return null;
  }
}
