'use client';

// Memoria — používanie nástroja: kto koľko pracoval (návštevy, dni, čas, zmeny, AI).
// Transparentné pre celý board; export do Excelu so súhrnom, návštevami a všetkými zmenami.

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../../lib/supabaseClient';
import { formatDate } from '../../../lib/formatDate';
import { mt, todayIso } from '../../../lib/memoriaI18n';
import { ErrorBox, ExportListButton } from './MemoriaUi';
import { formatMinutes, usageTotals, usagePresets } from '../../../lib/memoriaUsage';
import { infoSheet, downloadXlsx, exportFileName } from '../../../lib/memoriaListExport';

const TAB_KEY = {
  home: 'tabHome', tasks: 'tabTasks', calendar: 'tabCalendar', meetings: 'tabMeetings', decisions: 'tabDecisions', mandates: 'tabMandates',
  cases: 'tabCases', suppliers: 'tabSuppliers', tenders: 'tabTenders', contracts: 'tabContracts', invoices: 'tabInvoices', budget: 'tabBudget',
  ask: 'tabAsk', help: 'tabHelp', report: 'tabReport', handover: 'tabHandover', activity: 'tabActivity', export: 'tabExport', usage: 'tabUsage',
};
const PAGE = 1000;

async function fetchAll(query) {
  const out = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await query().range(from, from + PAGE - 1);
    if (error) throw error;
    out.push(...(data || []));
    if (!data || data.length < PAGE) break;
  }
  return out;
}

export default function UsagePanel({ lang }) {
  const presets = useMemo(() => usagePresets(todayIso()), []);
  const [period, setPeriod] = useState(presets.last30);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      setError('');
      const { data, error: e } = await supabase.rpc('memoria_usage_summary', { p_from: period.from, p_to: period.to });
      if (!alive) return;
      if (e) setError(mt(lang, 'usageLoadError', { error: e.message }));
      setRows(data || []);
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [period.from, period.to, lang]);

  const totals = usageTotals(rows);
  const nameOf = useMemo(() => Object.fromEntries(rows.map((r) => [r.user_id, r.full_name || '—'])), [rows]);

  async function exportAll() {
    const end = new Date(`${period.to}T00:00:00Z`);
    end.setUTCDate(end.getUTCDate() + 1);
    const endIso = end.toISOString().slice(0, 10);
    const [sessions, changes] = await Promise.all([
      fetchAll(() => supabase.from('memoria_usage_sessions').select('user_id, started_at, last_seen_at, tabs').gte('started_at', period.from).lt('started_at', endIso).order('started_at')),
      fetchAll(() => supabase.from('memoria_activity').select('occurred_at, actor_id, action, table_name, label, changed_fields, is_demo').gte('occurred_at', period.from).lt('occurred_at', endIso).order('occurred_at')),
    ]);
    const L = (k) => mt(lang, k);
    const yn = (v) => (v ? L('xYes') : L('xNo'));
    const summary = {
      name: L('usageSheetSummary'),
      columns: [L('usageMember'), L('usageVisits'), L('usageDays'), L('usageMinutes'), L('usageAdded'), L('usageUpdated'), L('usageDeleted'), L('usageAi'), L('usageLastVisit')],
      rows: rows.map((r) => ({
        [L('usageMember')]: r.full_name + (r.is_board ? '' : ` (${L('usageFormer')})`),
        [L('usageVisits')]: Number(r.visits),
        [L('usageDays')]: Number(r.active_days),
        [L('usageMinutes')]: Number(r.minutes),
        [L('usageAdded')]: Number(r.added),
        [L('usageUpdated')]: Number(r.updated),
        [L('usageDeleted')]: Number(r.deleted),
        [L('usageAi')]: Number(r.ai_requests),
        [L('usageLastVisit')]: r.last_visit ? r.last_visit.slice(0, 16).replace('T', ' ') : null,
      })),
    };
    const visits = {
      name: L('usageSheetVisits'),
      columns: [L('usageMember'), L('usageStarted'), L('usageEnded'), L('usageMinutes'), L('usageTabs')],
      rows: sessions.map((s) => ({
        [L('usageMember')]: nameOf[s.user_id] || s.user_id,
        [L('usageStarted')]: s.started_at.slice(0, 16).replace('T', ' '),
        [L('usageEnded')]: s.last_seen_at.slice(0, 16).replace('T', ' '),
        [L('usageMinutes')]: Math.round(((new Date(s.last_seen_at) - new Date(s.started_at)) / 60000) * 10) / 10,
        [L('usageTabs')]: (s.tabs || []).map((t) => (TAB_KEY[t] ? L(TAB_KEY[t]) : t)).join(', '),
      })),
    };
    const changeSheet = {
      name: L('usageSheetChanges'),
      columns: [L('usageWhen'), L('usageWho'), L('usageAction'), L('usageRecordType'), L('usageRecord'), L('usageFields'), 'DEMO'],
      rows: changes.map((c) => ({
        [L('usageWhen')]: c.occurred_at.slice(0, 16).replace('T', ' '),
        [L('usageWho')]: nameOf[c.actor_id] || '—',
        [L('usageAction')]: L(`action_${c.action}`),
        [L('usageRecordType')]: L(`entity_${c.table_name}`),
        [L('usageRecord')]: c.label,
        [L('usageFields')]: (c.changed_fields || []).join(', '),
        DEMO: yn(c.is_demo),
      })),
    };
    await downloadXlsx(exportFileName(L('tabUsage')), [
      infoSheet(lang, { listKey: 'tabUsage', filters: [`${L('usagePeriod')}: ${period.from} – ${period.to}`], count: rows.length }),
      summary,
      visits,
      changeSheet,
    ]);
  }

  const presetButtons = [
    ['trial', 'usagePresetTrial'],
    ['month', 'usagePresetMonth'],
    ['last30', 'usagePresetLast30'],
    ['all', 'usagePresetAll'],
  ];
  const num = 'px-2 py-2 text-right tabular-nums';

  return (
    <div className="space-y-4">
      <p className="text-sm text-ink/60">{mt(lang, 'usageIntro')}</p>

      <div className="flex flex-wrap items-end gap-2">
        {presetButtons.map(([k, label]) => {
          const active = period.from === presets[k].from && period.to === presets[k].to;
          return (
            <button
              key={k}
              type="button"
              onClick={() => setPeriod(presets[k])}
              className={`text-sm rounded-full border px-3 py-1.5 ${active ? 'bg-harbor text-white border-harbor' : 'border-harbor/30 text-harbor bg-white hover:bg-harbor/5'}`}
            >
              {mt(lang, label)}
            </button>
          );
        })}
        <label className="text-sm text-ink/70 flex items-center gap-1">
          {mt(lang, 'usageFrom')}
          <input type="date" className="input-field !w-auto !py-1.5" value={period.from} onChange={(e) => e.target.value && setPeriod((p) => ({ ...p, from: e.target.value }))} />
        </label>
        <label className="text-sm text-ink/70 flex items-center gap-1">
          {mt(lang, 'usageTo')}
          <input type="date" className="input-field !w-auto !py-1.5" value={period.to} onChange={(e) => e.target.value && setPeriod((p) => ({ ...p, to: e.target.value }))} />
        </label>
        <span className="flex-1" />
        <ExportListButton label={mt(lang, 'usageExport')} hint={mt(lang, 'exportListHint')} count={rows.length} onExport={exportAll} />
      </div>

      <ErrorBox message={error} />

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-ink/60 border-b border-sand-dark">
              <th className="px-3 py-2 text-left">{mt(lang, 'usageMember')}</th>
              <th className={num}>{mt(lang, 'usageVisits')}</th>
              <th className={num}>{mt(lang, 'usageDays')}</th>
              <th className={num}>{mt(lang, 'usageTime')}</th>
              <th className={num}>{mt(lang, 'usageAdded')}</th>
              <th className={num}>{mt(lang, 'usageUpdated')}</th>
              <th className={num}>{mt(lang, 'usageDeleted')}</th>
              <th className={num}>{mt(lang, 'usageAi')}</th>
              <th className="px-3 py-2 text-left">{mt(lang, 'usageLastVisit')}</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={9} className="px-3 py-4 text-ink/50">{mt(lang, 'loading')}</td></tr>
            ) : (
              rows.map((r) => (
                <tr key={r.user_id} className="border-b border-sand-dark/60">
                  <td className="px-3 py-2">
                    <span className="font-semibold text-harbor">{r.full_name || '—'}</span>
                    {!r.is_board && <span className="block text-xs text-ink/50">{mt(lang, 'usageFormer')}</span>}
                  </td>
                  <td className={num}>{r.visits}</td>
                  <td className={num}>{r.active_days}</td>
                  <td className={num}>{formatMinutes(r.minutes)}</td>
                  <td className={num}>{r.added}</td>
                  <td className={num}>{r.updated}</td>
                  <td className={num}>{r.deleted}</td>
                  <td className={num}>{r.ai_requests}</td>
                  <td className="px-3 py-2 text-ink/70 whitespace-nowrap">{r.last_visit ? formatDate(r.last_visit, lang) : mt(lang, 'usageNever')}</td>
                </tr>
              ))
            )}
          </tbody>
          {!loading && rows.length > 0 && (
            <tfoot>
              <tr className="font-semibold text-harbor">
                <td className="px-3 py-2">{mt(lang, 'usageTotal')}</td>
                <td className={num}>{totals.visits}</td>
                <td className={num}>{totals.active_days}</td>
                <td className={num}>{formatMinutes(totals.minutes)}</td>
                <td className={num}>{totals.added}</td>
                <td className={num}>{totals.updated}</td>
                <td className={num}>{totals.deleted}</td>
                <td className={num}>{totals.ai_requests}</td>
                <td />
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      <p className="text-xs text-ink/50">{mt(lang, 'usageNotes')}</p>
      <p className="text-xs text-ink/60 border border-dashed border-sand-dark rounded-md px-3 py-2">🔒 {mt(lang, 'usageTransparency')}</p>
    </div>
  );
}
