'use client';

// AI analýza ponúk k zákazke: porovnateľné ceny, najsilnejšia ponuka v každom
// kritériu, riziká, chýbajúce údaje, otázky na dodávateľov, história z Memorie
// a postup podľa stanov. Bez celkového víťaza — rozhoduje board.

import { useState } from 'react';
import { supabase } from '../../../lib/supabaseClient';
import { mt, formatMoney } from '../../../lib/memoriaI18n';
import { quotesFingerprint } from '../../../lib/quoteFingerprint';
import { ErrorBox } from './MemoriaUi';

function Section({ title, children }) {
  return (
    <div>
      <p className="text-xs font-semibold text-ink/50 uppercase tracking-wide mb-1">{title}</p>
      {children}
    </div>
  );
}

function PerSupplier({ items, field }) {
  if (!items || items.length === 0) return <p className="text-sm text-ink/40">—</p>;
  return (
    <ul className="space-y-1 text-sm text-ink">
      {items.map((it, i) => (
        <li key={i}>
          <span className="font-semibold">{it.supplier}:</span> {it[field]}
        </li>
      ))}
    </ul>
  );
}

export default function TenderAnalysis({ lang, tender, quotes, onSaved }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(Boolean(tender.ai_analysis));

  const analysis = tender.ai_analysis;
  const stale = analysis && tender.ai_analysis_quotes !== quotesFingerprint(quotes);
  const currency = tender.currency || 'EUR';

  async function run() {
    setBusy(true);
    setError('');
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const res = await fetch('/api/memoria/analyze-tender', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token || ''}` },
        body: JSON.stringify({ tenderId: tender.id, lang }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || res.statusText);
      // Uloženie v mene prihláseného člena boardu (autor v zázname aktivity).
      const { error: upErr } = await supabase
        .from('memoria_tenders')
        .update({ ai_analysis: json.analysis, ai_analysis_at: json.at, ai_analysis_quotes: json.fingerprint })
        .eq('id', tender.id);
      if (upErr) throw new Error(upErr.message);
      setOpen(true);
      await onSaved?.();
    } catch (e) {
      setError(mt(lang, 'askError', { error: e.message }));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3 rounded-lg border border-harbor/20 bg-white/70 p-3 space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-sm font-semibold text-harbor">🔎 {mt(lang, 'aiAnalysis')}</p>
        <div className="flex items-center gap-3">
          {analysis && (
            <button className="text-xs text-harbor hover:underline" onClick={() => setOpen((o) => !o)}>
              {open ? `▾ ${mt(lang, 'showLess')}` : `▸ ${mt(lang, 'showMore')}`}
            </button>
          )}
          <button className="btn-secondary text-sm py-1" disabled={busy} onClick={run}>
            {analysis ? mt(lang, 'aiAnalysisRerun') : mt(lang, 'aiAnalysisRun')}
          </button>
        </div>
      </div>
      {busy && <p className="text-sm text-ink/60 animate-pulse">🤖 {mt(lang, 'aiAnalysisRunning')}</p>}
      <ErrorBox message={error} />
      {analysis && tender.ai_analysis_at && (
        <p className="text-xs text-ink/50">
          {mt(lang, 'aiAnalysisMade', { date: new Date(tender.ai_analysis_at).toLocaleString({ en: 'en-GB', es: 'es-ES', fr: 'fr-FR', de: 'de-DE' }[lang] || 'en-GB') })}
        </p>
      )}
      {stale && <p className="text-xs text-ochre font-semibold">⚠ {mt(lang, 'aiAnalysisStale')}</p>}

      {analysis && open && (
        <div className="space-y-4">
          <Section title={mt(lang, 'an_summary')}>
            <p className="text-sm text-ink">{analysis.summary}</p>
          </Section>

          <Section title={mt(lang, 'an_prices')}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-ink/50">
                    <th className="py-1 pr-3">{mt(lang, 'supplier')}</th>
                    <th className="py-1 pr-3">{mt(lang, 'an_annualNet')}</th>
                    <th className="py-1 pr-3">{mt(lang, 'an_annualGross')}</th>
                    <th className="py-1 pr-3">{mt(lang, 'an_term')}</th>
                    <th className="py-1">{mt(lang, 'an_notIncluded')}</th>
                  </tr>
                </thead>
                <tbody>
                  {(analysis.normalized || []).map((r, i) => (
                    <tr key={i} className="border-t border-ink/10 align-top">
                      <td className="py-1.5 pr-3 font-semibold">{r.supplier}</td>
                      <td className="py-1.5 pr-3 whitespace-nowrap">{r.annual_net !== null && r.annual_net !== undefined ? formatMoney(r.annual_net, currency, lang) : '—'}</td>
                      <td className="py-1.5 pr-3 whitespace-nowrap">{r.annual_gross !== null && r.annual_gross !== undefined ? formatMoney(r.annual_gross, currency, lang) : '—'}</td>
                      <td className="py-1.5 pr-3">{r.contract_term || '—'}</td>
                      <td className="py-1.5">
                        {r.not_included || '—'}
                        {r.note && <span className="block text-xs text-ink/50">{r.note}</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>

          <Section title={mt(lang, 'an_best')}>
            <ul className="space-y-1 text-sm text-ink">
              {(analysis.best_by_criterion || []).map((b, i) => (
                <li key={i}>
                  <span className="font-semibold">{b.criterion}</span> → {b.supplier}
                  <span className="text-ink/60"> · {b.why}</span>
                </li>
              ))}
            </ul>
          </Section>

          <div className="grid sm:grid-cols-2 gap-4">
            <Section title={mt(lang, 'an_risks')}>
              <PerSupplier items={analysis.risks} field="risk" />
            </Section>
            <Section title={mt(lang, 'an_missing')}>
              <PerSupplier items={analysis.missing_info} field="item" />
            </Section>
            <Section title={mt(lang, 'an_questions')}>
              <PerSupplier items={analysis.questions} field="question" />
            </Section>
            <Section title={mt(lang, 'an_history')}>
              <PerSupplier items={analysis.history} field="fact" />
            </Section>
          </div>

          <Section title={mt(lang, 'an_procedure')}>
            <p className="text-sm text-ink">{analysis.procedure}</p>
          </Section>
        </div>
      )}
      <p className="text-xs text-ink/50 italic">{mt(lang, 'aiAnalysisDisclaimer')}</p>
    </div>
  );
}
