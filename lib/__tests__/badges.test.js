import { describe, it, expect } from 'vitest';
import { badgeEmoji, BADGE_OPTIONS } from '../badges';

describe('badgeEmoji', () => {
  it('returns the correct emoji for each known badge key', () => {
    for (const badge of BADGE_OPTIONS) {
      expect(badgeEmoji(badge.key)).toBe(badge.emoji);
    }
  });

  it('returns an empty string for an unknown badge key', () => {
    expect(badgeEmoji('not_a_real_badge')).toBe('');
  });

  it('returns an empty string for undefined/null input', () => {
    expect(badgeEmoji(undefined)).toBe('');
    expect(badgeEmoji(null)).toBe('');
  });
});
