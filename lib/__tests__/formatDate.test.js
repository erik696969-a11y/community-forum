import { describe, it, expect } from 'vitest';
import { formatDate, formatTime } from '../formatDate';

describe('formatDate', () => {
  const sampleDate = '2026-08-16T10:30:00Z';

  it('formats a date differently for different app languages (locale actually applied)', () => {
    const de = formatDate(sampleDate, 'de');
    const en = formatDate(sampleDate, 'en');
    // German locale uses dots (15.08.2026-style), English/GB uses slashes -
    // this is exactly the visible symptom that proved the i18n fix worked.
    expect(de).toMatch(/\./);
    expect(en).toMatch(/\//);
  });

  it('falls back to en-GB for an unknown/unsupported language code', () => {
    const unknown = formatDate(sampleDate, 'xx');
    const en = formatDate(sampleDate, 'en');
    expect(unknown).toBe(en);
  });
});

describe('formatTime', () => {
  it('formats a time as hour:minute', () => {
    const result = formatTime('2026-08-16T14:05:00Z', 'en');
    expect(result).toMatch(/\d{1,2}[:.]\d{2}/);
  });
});
