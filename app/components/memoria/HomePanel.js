'use client';

// Úvodná obrazovka Memorie: „ako je na tom komunita dnes“ na jeden pohľad.
// Iba súhrn existujúcich záznamov; nič neodporúča ani nerozhoduje.

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../../lib/supabaseClient';
import { formatDate } from '../../../lib/formatDate';
import { mt, todayIso, addDaysIso, formatMoney, formatMoneyRound, relativeDue, OPEN_TASK_STATUSES } from '../../../lib/memoriaI18n';
import { Pill, DemoPill, StatTile } from './MemoriaUi';
import AlertsBar from './AlertsBar';
import { buildTimeline } from './timeline';
import { meetingChecks } from './MeetingsPanel';

const KIND_TONE = { obligation: 'harbor', statutory: 'ochre', task: 'neutral', contract: 'green' };

export default function HomePanel({ lang, profile, refreshKey, onOpenTab }) {
  const [data, setData] = useState(null);

  useEffect(() => {
    let active = true;
    (async () => {
      const year = todayIso().slice(0, 4);
      const [tRes, oRes, mRes, cRes, iRes, aRes] = await Promise.all([
        supabase.from('memoria_tasks').select('id, title, due_date, status, is_demo, decision_id'),
        supabase.from('memoria_obligations').select('*').eq('active', true),
        supabase.from('memoria_meetings').select('*').order('meeting_on', { ascending: true }),
        supabase.from('memoria_contracts').select('id, subject, ends_on, auto_renew, notice_period_days, status, is_demo').eq('status', 'active'),
        supabase.from('memoria_invoices').select('total_amount, currency, category, invoice_date').gte('invoice_date', `${year}-01-01`),
        supabase.from('memoria_activity').select('*').order('id', { ascending: false }).limit(6),
      ]);
      const actors = [...new Set((aRes.data || []).map((r) => r.actor_id).filter(Boolean))];
      const { data: profiles } = actors.length
        ? await supabase.from('profiles').select('id, full_name').in('id', actors)
        : { data: [] };
      if (!active) return;
      setData({
        year,
        tasks: tRes.data || [],
        obligations: oRes.data || [],
        meetings: mRes.data || [],
        contracts: cRes.data || [],
        invoices: iRes.data || [],
        activity: aRes.data || [],
        names: Object.fromEntries((profiles || []).map((p) => [p.id, p.full_name])),
      });
    })();
    return () => {
      active = false;
    };
  }, [refreshKey]);

  const view = useMemo(() => {
    if (!data) return null;
    const today = todayIso();
    const openTasks = data.tasks.filter((t) => OPEN_TASK_STATUSES.includes(t.status));
    const overdue = openTasks.filter((t) => t.due_date && t.due_date < today);
    const resolutionTasks = data.tasks.filter((t) => t.decision_id && t.status !== 'cancelled');
    const timeline = buildTimeline(
      { obligations: data.obligations, meetings: data.meetings, tasks: openTasks, contracts: data.contracts },
      lang,
      1
    ).filter((i) => i.date >= today && i.date <= addDaysIso(today, 30));
    const ending = data.contracts.filter((c) => c.ends_on && c.ends_on <= addDaysIso(today, 90));
    // Súčty podľa meny (spravidla iba EUR).
    const eur = data.invoices.filter((i) => (i.currency || 'EUR') === 'EUR');
    const total = eur.reduce((s, i) => s + Number(i.total_amount || 0), 0);
    const byCat = {};
    for (const i of eur) byCat[i.category || 'other'] = (byCat[i.category || 'other'] || 0) + Number(i.total_amount || 0);
    const cats = Object.entries(byCat).sort((a, b) => b[1] - a[1]).slice(0, 6);
    const nextMeeting = data.meetings.find((m) => m.status === 'planned' && m.meeting_on >= today) || null;
    return {
      openTasks,
      overdue,
      resolutionTasks,
      resolutionDone: resolutionTasks.filter((t) => t.status === 'done').length,
      timeline,
      ending,
      total,
      invoiceCount: data.invoices.length,
      cats,
      maxCat: cats.length ? cats[0][1] : 0,
      nextMeeting,
    };
  }, [data, lang]);

  const firstName = (profile?.full_name || '').split(' ')[0];

  return (
    <div className="space-y-6">
      <p className="text-ink/70">{mt(lang, 'homeGreeting', { name: firstName })}</p>

      {view && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <StatTile
            label={`${mt(lang, 'kpiOpenTasks')}${view.overdue.length ? ` · ${mt(lang, 'kpiOverdue', { n: view.overdue.length })}` : ''}`}
            value={view.openTasks.length}
            tone={view.overdue.length ? 'red' : 'neutral'}
            onClick={() => onOpenTab('tasks')}
          />
          <StatTile label={mt(lang, 'kpiNext30')} value={view.timeline.length} tone={view.timeline.length ? 'ochre' : 'neutral'} onClick={() => onOpenTab('calendar')} />
          <StatTile
            label={`${mt(lang, 'kpiContracts')}${view.ending.length ? ` · ${mt(lang, 'kpiContractsEnding', { n: view.ending.length })}` : ''}`}
            value={data.contracts.length}
            onClick={() => onOpenTab('contracts')}
          />
          <StatTile
            label={`${mt(lang, 'kpiSpendYear', { year: data.year })} · ${mt(lang, 'kpiInvoices', { n: view.invoiceCount })}`}
            value={formatMoneyRound(view.total, 'EUR', lang)}
            onClick={() => onOpenTab('report')}
          />
        </div>
      )}

      <AlertsBar lang={lang} refreshKey={refreshKey} onOpenTab={onOpenTab} />

      {view && (
        <div className="grid md:grid-cols-2 gap-4">
          {/* Najbližšie zasadnutie */}
          <div className="card p-4">
            <p className="text-sm font-semibold text-harbor mb-2">🗓️ {mt(lang, 'nextMeeting')}</p>
            {view.nextMeeting ? (
              <button className="text-left w-full" onClick={() => onOpenTab('meetings')}>
                <p className="font-semibold text-ink">
                  {view.nextMeeting.title} <DemoPill show={view.nextMeeting.is_demo} />
                </p>
                <p className="text-sm text-ink/70">
                  {formatDate(view.nextMeeting.meeting_on, lang)}
                  {view.nextMeeting.meeting_time ? ` · ${view.nextMeeting.meeting_time}` : ''} · {relativeDue(view.nextMeeting.meeting_on, lang)}
                </p>
                <ul className="mt-1">
                  {meetingChecks(view.nextMeeting, lang).map((c) => (
                    <li key={c.key} className={`text-xs ${c.tone === 'red' ? 'text-red-700' : c.tone === 'green' ? 'text-sea' : 'text-ink/70'}`}>
                      {c.tone === 'green' ? '✓' : c.tone === 'red' ? '⚠' : '⏰'} {c.text}
                    </li>
                  ))}
                </ul>
              </button>
            ) : (
              <p className="text-sm text-ink/60">{mt(lang, 'noMeetingPlanned')}</p>
            )}
            {view.resolutionTasks.length > 0 && (
              <div className="mt-4">
                <p className="text-sm font-semibold text-harbor mb-1">✅ {mt(lang, 'resolutionsProgress')}</p>
                <div className="h-2 rounded-full bg-sand-dark overflow-hidden">
                  <div
                    className="h-full bg-sea"
                    style={{ width: `${Math.round((view.resolutionDone / view.resolutionTasks.length) * 100)}%` }}
                  />
                </div>
                <p className="text-xs text-ink/60 mt-1">
                  {mt(lang, 'resolutionsProgressText', { done: view.resolutionDone, total: view.resolutionTasks.length })}
                </p>
              </div>
            )}
          </div>

          {/* Najbližších 30 dní */}
          <div className="card p-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-semibold text-harbor">📅 {mt(lang, 'next30')}</p>
              <button className="text-xs text-harbor hover:underline" onClick={() => onOpenTab('calendar')}>{mt(lang, 'seeAll')} →</button>
            </div>
            {view.timeline.length === 0 ? (
              <p className="text-sm text-ink/60">{mt(lang, 'nothingNext30')}</p>
            ) : (
              <ul className="space-y-1.5">
                {view.timeline.slice(0, 7).map((i, idx) => (
                  <li key={idx}>
                    <button className="w-full flex items-start gap-2 text-left hover:text-harbor" onClick={() => onOpenTab(i.tab)}>
                      <span className="text-xs text-ink/60 w-16 flex-shrink-0 pt-0.5">{formatDate(i.date, lang)}</span>
                      <span className="text-sm text-ink flex-1 min-w-0">
                        {i.text} <DemoPill show={i.isDemo} />
                      </span>
                      <Pill tone={KIND_TONE[i.kind]}>{mt(lang, `kind_${i.kind}`)}</Pill>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Výdavky podľa kategórie */}
          <div className="card p-4">
            <p className="text-sm font-semibold text-harbor mb-2">💶 {mt(lang, 'spendByCategory', { year: data.year })}</p>
            {view.cats.length === 0 ? (
              <p className="text-sm text-ink/60">{mt(lang, 'noSpend')}</p>
            ) : (
              <ul className="space-y-2">
                {view.cats.map(([cat, sum]) => (
                  <li key={cat}>
                    <div className="flex justify-between text-xs text-ink/70">
                      <span>{mt(lang, `invcat_${cat}`)}</span>
                      <span>{formatMoney(sum, 'EUR', lang)}</span>
                    </div>
                    <div className="h-2 rounded-full bg-sand-dark overflow-hidden mt-0.5">
                      <div className="h-full bg-harbor" style={{ width: `${Math.max(3, Math.round((sum / view.maxCat) * 100))}%` }} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Posledná aktivita */}
          <div className="card p-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-semibold text-harbor">🕒 {mt(lang, 'recentActivity')}</p>
              <button className="text-xs text-harbor hover:underline" onClick={() => onOpenTab('activity')}>{mt(lang, 'seeAll')} →</button>
            </div>
            {data.activity.length === 0 ? (
              <p className="text-sm text-ink/60">{mt(lang, 'empty')}</p>
            ) : (
              <ul className="space-y-1.5">
                {data.activity.map((r) => (
                  <li key={r.id} className="text-sm text-ink">
                    <span className="text-xs text-ink/50">{formatDate(r.occurred_at, lang)} · </span>
                    <strong className="font-semibold">{data.names[r.actor_id] || mt(lang, 'someone')}</strong>{' '}
                    {mt(lang, `actionVerb_${r.action}`)} {mt(lang, `entity_${r.table_name}`)}
                    {r.label ? <span className="text-ink/70">: {r.label}</span> : null}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      <div className="flex justify-center gap-3 flex-wrap">
        <button className="btn-primary" onClick={() => onOpenTab('ask')}>💬 {mt(lang, 'tabAsk')}</button>
        <button className="btn-secondary" onClick={() => onOpenTab('handover')}>📦 {mt(lang, 'openHandover')}</button>
      </div>
    </div>
  );
}
