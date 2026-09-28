import { describe, it, expect, vi } from 'vitest';
vi.mock('../supabaseClient', () => ({ supabase: {} }));
import { usageStep, formatMinutes, usageTotals, usagePresets, ACTIVE_WINDOW_MS, IDLE_CLOSE_MS } from '../memoriaUsage';

describe('usage tracking', () => {
  const now = 10_000_000;
  it('starts a visit, pings while active, and waits when idle or hidden', () => {
    expect(usageStep({ now, lastInteraction: now, lastPing: 0, sessionId: null, visible: true })).toBe('start');
    expect(usageStep({ now, lastInteraction: now - 1000, lastPing: now - 60000, sessionId: 'x', visible: true })).toBe('ping');
    expect(usageStep({ now, lastInteraction: now - ACTIVE_WINDOW_MS - 1, lastPing: now - 60000, sessionId: 'x', visible: true })).toBe('wait');
    expect(usageStep({ now, lastInteraction: now, lastPing: now - 60000, sessionId: 'x', visible: false })).toBe('wait');
    expect(usageStep({ now, lastInteraction: now, lastPing: now - IDLE_CLOSE_MS - 1, sessionId: 'x', visible: true })).toBe('start');
  });
  it('formats time and adds up the table', () => {
    expect(formatMinutes(0)).toBe('0:00');
    expect(formatMinutes(125.4)).toBe('2:05');
    expect(usageTotals([{ visits: 2, minutes: 10.25, added: 1 }, { visits: '3', minutes: 5, ai_requests: 4 }])).toMatchObject({ visits: 5, minutes: 15.3, added: 1, ai_requests: 4 });
  });
  it('offers the trial period and simple presets', () => {
    const p = usagePresets('2026-11-15');
    expect(p.trial).toEqual({ from: '2026-10-01', to: '2026-12-31' });
    expect(p.month).toEqual({ from: '2026-11-01', to: '2026-11-15' });
    expect(p.last30.from).toBe('2026-10-16');
  });
});
