import { describe, it, expect, beforeEach } from 'vitest';
import { safeNext, takeStoredNext, LOGIN_NEXT_KEY } from '../safeNext';

describe('safeNext', () => {
  it('accepts in-app paths', () => {
    expect(safeNext('/admin/memoria')).toBe('/admin/memoria');
  });
  it('rejects external or odd targets', () => {
    for (const v of ['https://evil.com', '//evil.com', '/\\evil.com', 'admin', '', null, undefined, '/login', '/auth/callback']) {
      expect(safeNext(v)).toBeNull();
    }
  });
});

describe('takeStoredNext', () => {
  beforeEach(() => window.localStorage.clear());
  it('returns and clears the stored path', () => {
    window.localStorage.setItem(LOGIN_NEXT_KEY, '/admin/memoria');
    expect(takeStoredNext()).toBe('/admin/memoria');
    expect(window.localStorage.getItem(LOGIN_NEXT_KEY)).toBeNull();
  });
  it('ignores unsafe stored values', () => {
    window.localStorage.setItem(LOGIN_NEXT_KEY, '//evil.com');
    expect(takeStoredNext()).toBeNull();
  });
});
