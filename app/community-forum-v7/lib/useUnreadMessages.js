'use client';

import { useEffect, useRef, useState } from 'react';
import { supabase } from './supabaseClient';

// Polls for unread messages every 30 seconds and plays a short beep
// (via the Web Audio API, no external sound file needed) when the
// unread count increases while the app is open. The sound preference
// is stored per-device in localStorage.
export function useUnreadMessages(profile) {
  const [count, setCount] = useState(0);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const previousCount = useRef(null);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const stored = window.localStorage.getItem('soundEnabled');
      if (stored !== null) setSoundEnabled(stored === 'true');
    }
  }, []);

  function toggleSound() {
    setSoundEnabled((prev) => {
      const next = !prev;
      if (typeof window !== 'undefined') {
        window.localStorage.setItem('soundEnabled', String(next));
      }
      return next;
    });
  }

  function playBeep() {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      const ctx = new AudioCtx();
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.value = 880;
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
      oscillator.connect(gain);
      gain.connect(ctx.destination);
      oscillator.start();
      oscillator.stop(ctx.currentTime + 0.4);
    } catch (e) {
      // Audio not supported or blocked by the browser — fail silently
    }
  }

  async function fetchCount() {
    if (!profile || profile.role !== 'board' || profile.status !== 'approved') {
      setCount(0);
      return;
    }

    const { count: unread } = await supabase
      .from('messages')
      .select('id', { count: 'exact', head: true })
      .eq('is_read', false)
      .or(`recipient_id.eq.${profile.id},recipient_id.is.null`);

    const newCount = unread || 0;

    if (previousCount.current !== null && newCount > previousCount.current && soundEnabled) {
      playBeep();
    }
    previousCount.current = newCount;
    setCount(newCount);
  }

  useEffect(() => {
    fetchCount();
    const interval = setInterval(fetchCount, 30000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id, profile?.role, profile?.status, soundEnabled]);

  return { count, soundEnabled, toggleSound };
}
