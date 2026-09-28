'use client';

// Memoria — podklady na zasadanie boardu: čo sa stalo za obdobie, v jednom dokumente.
// Tlač / PDF, kopírovanie ako text do e-mailu, Excel.

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../../lib/supabaseClient';
import { mt, todayIso } from '../../../lib/memoriaI18n';
import { ErrorBox, ExportListButton } from './MemoriaUi';
import { buildBoardReport, reportPresets, reportSections, reportText } from '../../../lib/memoriaBoardReport';
import { downloadXlsx, exportFileName, infoSheet } from '../../../lib/memoriaListExport';

const TABLES = {
  decisions: 'memoria_decisions', tasks: 'memoria_tasks', invoices: 'memoria_invoices', suppliers: 'memoria_suppliers',
  tenders: 'memoria_tenders', quotes: 'memoria_quotes', contracts: 'memoria_contracts', cases: 'memoria_cases',
  meetings: 'memoria_meetings', obligations: 'memoria_obligations', budgets: 'memoria_budgets', budgetLines: 'memoria_budget_lines',
  reserveMovements: 'memoria_reserve_movements',
};
const TONE = { red: 'text-red-700', orange: 'text-ochre', muted: 'text-ink/50' };

export default function BoardReportPanel({ lang }) {
  const today = todayIso();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [period, setPeriod] = useState(null);
  const [includeDemo, setIncludeDemo] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    (async () => {
      const entries = await Promise.all(Object.entries(TABLES).map(async ([k, table]) => [k, await supabase.from(table).select('*').limit(10000)]));
      const bad = entries.find(([, r]) => r.error);
      if (bad) setError(mt(lang, 'saveError', { error: bad[1].error.message }));
      const d = Object.fromEntries(entries.map(([k, r]) => [k, r.data || []]));
      setData(d);
      const presets = reportPresets(today, d.meetings);
      setPeriod(presets.sinceMeeting || presets.lastMonth);
      // Kým sú v Memorii ukážkové dáta (pred ostrým spustením), zahrnúť ich – sú označené DEMO.
      setIncludeDemo(Object.values(d).flat().some((r) => r.is_demo));
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const presets = useMemo(() => (data ? reportPresets(today, data.meetings) : null), [data, today]);
  const report = useMemo(() => (data && period ? buildBoardReport(data, { from: period.from, to: period.to, today, includeDemo }) : null), [data, period, includeDemo, today]);
  const view = useMemo(() => (report ? reportSections(report, lang) : null), [report, lang]);

  if (!data || !period) return <p className="text-sm text-ink/50">{mt(lang, 'loading')}</p>;

  async function copyText() {
    try {
      await navigator.clipboard.writeText(reportText(view));
      setCopied(true);
      setTimeout(() => setCopied(false), 4000);
    } catch {
      setError(mt(lang, 'saveError', { error: 'clipboard' }));
    }
  }

  async function exportExcel() {
    const cols = [mt(lang, 'brSection'), mt(lang, 'brItem'), 'DEMO'];
    const rows = [];
    for (const s of view.sections) {
      for (const l of s.lines) rows.push({ [cols[0]]: s.title, [cols[1]]: `${l.level === 1 ? '   ' : ''}${l.text}`, DEMO: l.demo ? mt(lang, 'xYes') : '' });
    }
    await downloadXlsx(exportFileName(mt(lang, 'tabBoardReport')), [
      infoSheet(lang, { listKey: 'tabBoardReport', filters: [`${period.from} – ${period.to}`, includeDemo ? mt(lang, 'brIncludeDemo') : null].filter(Boolean), count: rows.length }),
      { name: mt(lang, 'brSheet'), columns: cols, rows },
    ]);
  }

  const chips = [
    presets.sinceMeeting && ['since', presets.sinceMeeting, mt(lang, 'brSinceMeeting', { date: presets.sinceMeeting.meeting.meeting_on.split('-').reverse().join('/') })],
    ['month', presets.lastMonth, mt(lang, 'brLastMonth')],
    ['last30', presets.last30, mt(lang, 'brLast30')],
  ].filter(Boolean);

  return (
    <div className="space-y-4">
      <div className="space-y-3 print:hidden">
        <p className="text-sm text-ink/60">{mt(lang, 'brIntro')}</p>
        <div className="flex flex-wrap items-center gap-2">
          {chips.map(([k, p, label]) => {
            const active = period.from === p.from && period.to === p.to;
            return (
              <button key={k} type="button" onClick={() => setPeriod(p)} className={`text-sm rounded-full border px-3 py-1.5 ${active ? 'bg-harbor text-white border-harbor' : 'border-harbor/30 text-harbor bg-white hover:bg-harbor/5'}`}>
                {label}
              </button>
            );
          })}
          <label className="text-sm text-ink/70 flex items-center gap-1">
            {mt(lang, 'usageFrom')}
            <input type="date" className="input-field !w-auto !py-1.5" value={period.from} onChange={(e) => e.target.value && setPeriod((p) => ({ from: e.target.value, to: p.to }))} />
          </label>
          <label className="text-sm text-ink/70 flex items-center gap-1">
            {mt(lang, 'usageTo')}
            <input type="date" className="input-field !w-auto !py-1.5" value={period.to} onChange={(e) => e.target.value && setPeriod((p) => ({ from: p.from, to: e.target.value }))} />
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-sm text-ink">
            <input type="checkbox" checked={includeDemo} onChange={(e) => setIncludeDemo(e.target.checked)} />
            {mt(lang, 'brIncludeDemo')}
          </label>
          <span className="flex-1" />
          <button type="button" className="btn-primary text-sm" onClick={() => window.print()}>{mt(lang, 'brPrint')}</button>
          <button type="button" className="btn-secondary text-sm" onClick={copyText}>{mt(lang, 'brCopy')}</button>
          <ExportListButton label={mt(lang, 'brExcel')} hint={mt(lang, 'exportListHint')} count={1} onExport={exportExcel} />
        </div>
        {copied && <p className="text-sm text-green-700">✓ {mt(lang, 'brCopied')}</p>}
        <ErrorBox message={error} />
      </div>

      <article className="card p-6 space-y-5 print:shadow-none print:border-0 print:p-0">
        <header>
          <p className="text-xs text-ink/50">Comunidad de Propietarios La Hacienda del Señorío de Cifuentes</p>
          <h2 className="font-display text-2xl text-harbor">{view.heading}</h2>
          <p className="text-xs text-ink/50">{view.generated}</p>
        </header>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
          {view.kpis.map((k) => (
            <div key={k.label} className="rounded-lg border border-sand-dark px-3 py-2">
              <p className="text-lg font-semibold text-harbor tabular-nums">{k.value}</p>
              <p className="text-xs text-ink/60">{k.label}</p>
            </div>
          ))}
        </div>
        {view.sections.map((s) => (
          <section key={s.title} className="break-inside-avoid-page">
            <h3 className="font-display text-lg text-harbor border-b border-sand-dark pb-1 mb-2">{s.title}</h3>
            <ul className="space-y-1">
              {s.lines.map((l, i) =>
                l.level === -1 ? (
                  <li key={i} className="text-xs uppercase tracking-wide text-ink/50 font-semibold pt-2">{l.text}</li>
                ) : (
                  <li key={i} className={`text-sm ${l.level ? 'pl-5' : ''} ${TONE[l.tone] || 'text-ink'}`}>
                    {l.level ? '• ' : ''}
                    {l.text}
                    {l.demo && <span className="ml-1 text-[10px] font-semibold text-ochre border border-dashed border-ochre rounded px-1">DEMO</span>}
                  </li>
                )
              )}
            </ul>
          </section>
        ))}
        <p className="text-xs italic text-ink/50">{view.footer}</p>
      </article>
    </div>
  );
}
