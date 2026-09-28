// Memoria — meranie používania (návštevy a čas) pre vyhodnotenie skúšobného obdobia.
// Návšteva = otvorená Memoria; čas beží iba keď je okno viditeľné a človek niečo robí.
// Po 10 minútach nečinnosti sa návšteva uzavrie a ďalšia aktivita otvorí novú.
// Čas na serveri nastavuje trigger (last_seen_at = now()), klient ho nevie zmeniť.

import { useEffect, useRef } from 'react';
import { supabase } from './supabaseClient';

export const PING_MS = 60 * 1000;
export const ACTIVE_WINDOW_MS = 3 * 60 * 1000; // aktivita za posledné 3 min = človek pracuje
export const IDLE_CLOSE_MS = 10 * 60 * 1000; // dlhšia pauza = nová návšteva

// Čisté rozhodnutie, čo urobiť pri tiku alebo akcii (testované).
export function usageStep({ now, lastInteraction, lastPing, sessionId, visible }) {
  if (!visible) return 'wait';
  if (now - lastInteraction > ACTIVE_WINDOW_MS) return 'wait';
  if (!sessionId || now - lastPing > IDLE_CLOSE_MS) return 'start';
  return 'ping';
}

export function useUsageTracking(tab, enabled) {
  const state = useRef({ sessionId: null, lastPing: 0, lastInteraction: Date.now(), busy: false });
  const tabRef = useRef(tab);
  tabRef.current = tab;

  async function act(force) {
    const s = state.current;
    if (s.busy) return;
    const now = Date.now();
    const step = usageStep({ now, lastInteraction: s.lastInteraction, lastPing: s.lastPing, sessionId: s.sessionId, visible: typeof document === 'undefined' || document.visibilityState === 'visible' });
    if (step === 'wait') return;
    if (step === 'ping' && !force && now - s.lastPing < PING_MS - 1000) return;
    s.busy = true;
    try {
      if (step === 'start') {
        const { data } = await supabase.from('memoria_usage_sessions').insert({ tabs: [tabRef.current] }).select('id').single();
        s.sessionId = data?.id || null;
      } else {
        await supabase.from('memoria_usage_sessions').update({ tabs: [tabRef.current] }).eq('id', s.sessionId);
      }
      s.lastPing = now;
    } catch {
      // Meranie nesmie nikdy prekážať práci.
    } finally {
      s.busy = false;
    }
  }

  useEffect(() => {
    if (!enabled) return undefined;
    const onInteract = () => {
      const s = state.current;
      const wasIdle = Date.now() - s.lastPing > IDLE_CLOSE_MS;
      s.lastInteraction = Date.now();
      if (wasIdle) act(true);
    };
    const events = ['pointerdown', 'keydown', 'scroll', 'visibilitychange'];
    events.forEach((ev) => window.addEventListener(ev, onInteract, { passive: true }));
    act(true);
    const timer = setInterval(() => act(false), PING_MS);
    return () => {
      clearInterval(timer);
      events.forEach((ev) => window.removeEventListener(ev, onInteract));
    };
  }, [enabled]); // eslint-disable-line react-hooks/exhaustive-deps

  // Zmena karty sa zapíše hneď (aj to je aktivita).
  useEffect(() => {
    if (!enabled) return;
    state.current.lastInteraction = Date.now();
    act(true);
  }, [tab, enabled]); // eslint-disable-line react-hooks/exhaustive-deps
}

export function formatMinutes(min) {
  const m = Math.round(Number(min) || 0);
  const h = Math.floor(m / 60);
  return `${h}:${String(m % 60).padStart(2, '0')}`;
}

export function usageTotals(rows) {
  const t = { visits: 0, active_days: 0, minutes: 0, added: 0, updated: 0, deleted: 0, ai_requests: 0 };
  for (const r of rows || []) for (const k of Object.keys(t)) t[k] += Number(r[k] || 0);
  t.minutes = Math.round(t.minutes * 10) / 10;
  return t;
}

// Obdobia na rýchly výber (RRRR-MM-DD).
export function usagePresets(today) {
  const d = new Date(`${today}T00:00:00Z`);
  const iso = (x) => x.toISOString().slice(0, 10);
  const monthStart = iso(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)));
  const minus = (days) => iso(new Date(d.getTime() - days * 86400000));
  return {
    trial: { from: '2026-10-01', to: '2026-12-31' },
    month: { from: monthStart, to: today },
    last30: { from: minus(30), to: today },
    all: { from: '2026-01-01', to: today },
  };
}
