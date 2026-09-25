'use client';

// Nastavenie e-mailových pripomienok Memorie pre prihláseného člena boardu.

import { useEffect, useState } from 'react';
import { supabase } from '../../../lib/supabaseClient';
import { mt } from '../../../lib/memoriaI18n';
import { ErrorBox } from './MemoriaUi';

async function authHeaders() {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token || ''}` };
}

export default function EmailSettings({ lang, profile }) {
  const [emailOn, setEmailOn] = useState(profile?.memoria_email !== false);
  const [autoEnabled, setAutoEnabled] = useState(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/memoria/digest-test', { headers: await authHeaders() });
        if (!res.ok) return;
        const json = await res.json();
        setAutoEnabled(Boolean(json.autoEnabled));
        setEmailOn(json.emailOn !== false);
      } catch {
        // stav nie je kritický
      }
    })();
  }, []);

  async function toggle(next) {
    setError('');
    setEmailOn(next);
    const { error: err } = await supabase.from('profiles').update({ memoria_email: next }).eq('id', profile.id);
    if (err) {
      setEmailOn(!next);
      setError(mt(lang, 'saveError', { error: err.message }));
    }
  }

  async function sendTest() {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const res = await fetch('/api/memoria/digest-test', { method: 'POST', headers: await authHeaders(), body: JSON.stringify({ lang }) });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || res.statusText);
      setMessage(mt(lang, 'emailTestSent', { email: json.email }));
    } catch (e) {
      setError(mt(lang, 'saveError', { error: e.message }));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card p-4 space-y-3">
      <p className="text-sm font-semibold text-harbor">✉️ {mt(lang, 'emailTitle')}</p>
      <p className="text-sm text-ink/70">{mt(lang, 'emailInfo')}</p>
      {autoEnabled !== null && (
        <p className={`text-xs font-semibold ${autoEnabled ? 'text-sea' : 'text-ochre'}`}>
          {autoEnabled ? mt(lang, 'emailAutoOn') : mt(lang, 'emailAutoOff')}
        </p>
      )}
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={emailOn} onChange={(e) => toggle(e.target.checked)} />
        {mt(lang, 'emailMine')}
      </label>
      <div className="flex items-center gap-3 flex-wrap">
        <button className="btn-secondary text-sm py-1" disabled={busy} onClick={sendTest}>
          {busy ? mt(lang, 'saving') : mt(lang, 'emailTest')}
        </button>
        <span className="text-xs text-ink/50">{mt(lang, 'emailTestNote')}</span>
      </div>
      {message && <p className="text-sm text-sea">{message}</p>}
      <ErrorBox message={error} />
    </div>
  );
}
