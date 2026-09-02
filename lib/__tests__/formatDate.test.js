import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { formatDate, formatTime, zonedTimeToUtc, InvalidLocalTimeError } from '../formatDate';

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

describe('zonedTimeToUtc — Europe/Madrid facility booking timezone correctness', () => {
  // Regression suite for a confirmed bug: the previous implementation
  // round-tripped through an unlabeled locale string
  // (`new Date(naiveUtc.toLocaleString(...))`), and parsing an unlabeled
  // string in JavaScript uses the CALLING ENVIRONMENT's own local
  // timezone - silently reintroducing exactly the system-timezone
  // dependency the function existed to eliminate. A booking for
  // "10:00 Europe/Madrid" could resolve to a different stored UTC instant
  // depending on the booking member's own browser/OS timezone.
  //
  // These tests simulate different calling-environment timezones via
  // process.env.TZ (Node respects this for all local-time-dependent
  // Date/Intl behaviour) and assert the result is byte-identical
  // regardless of which environment made the booking.
  const originalTZ = process.env.TZ;

  afterEach(() => {
    process.env.TZ = originalTZ;
  });

  const simulatedBrowserTimezones = ['UTC', 'Europe/Madrid', 'Europe/London', 'America/New_York'];

  it('WINTER (CET, UTC+1): 15 Jan 2026 10:00 Europe/Madrid always resolves to the same UTC instant', () => {
    const results = new Set();
    for (const tz of simulatedBrowserTimezones) {
      process.env.TZ = tz;
      results.add(zonedTimeToUtc('2026-01-15', '10:00').toISOString());
    }
    expect(results.size).toBe(1);
    expect([...results][0]).toBe('2026-01-15T09:00:00.000Z');
  });

  it('SUMMER (CEST, UTC+2): 1 Jul 2026 10:00 Europe/Madrid always resolves to the same UTC instant', () => {
    const results = new Set();
    for (const tz of simulatedBrowserTimezones) {
      process.env.TZ = tz;
      results.add(zonedTimeToUtc('2026-07-01', '10:00').toISOString());
    }
    expect(results.size).toBe(1);
    expect([...results][0]).toBe('2026-07-01T08:00:00.000Z');
  });

  it('correctly resolves each individual simulated timezone for the winter case', () => {
    for (const tz of simulatedBrowserTimezones) {
      process.env.TZ = tz;
      const result = zonedTimeToUtc('2026-01-15', '10:00');
      expect(result.toISOString()).toBe('2026-01-15T09:00:00.000Z');
    }
  });

  it('correctly resolves each individual simulated timezone for the summer case', () => {
    for (const tz of simulatedBrowserTimezones) {
      process.env.TZ = tz;
      const result = zonedTimeToUtc('2026-07-01', '10:00');
      expect(result.toISOString()).toBe('2026-07-01T08:00:00.000Z');
    }
  });

  it('SPRING-FORWARD gap (29 March 2026 02:30 does not exist on the Madrid clock): rejects the invalid local time identically regardless of browser timezone, never silently normalizing it to a different wall-clock time', () => {
    for (const tz of simulatedBrowserTimezones) {
      process.env.TZ = tz;
      expect(() => zonedTimeToUtc('2026-03-29', '02:30')).toThrow(InvalidLocalTimeError);
    }
  });

  it('FALL-BACK ambiguous hour (25 October 2026 02:30 occurs twice on the Madrid clock): resolves deterministically to the same UTC instant regardless of browser timezone', () => {
    const results = new Set();
    for (const tz of simulatedBrowserTimezones) {
      process.env.TZ = tz;
      results.add(zonedTimeToUtc('2026-10-25', '02:30').toISOString());
    }
    expect(results.size).toBe(1);
    // Documented, accepted product behaviour: an ambiguous fall-back local
    // time resolves to its SECOND (later, post-transition/standard-time
    // CET) occurrence. Kept as an explicit regression test so this
    // behaviour cannot change accidentally.
    expect([...results][0]).toBe('2026-10-25T01:30:00.000Z');
  });
});
