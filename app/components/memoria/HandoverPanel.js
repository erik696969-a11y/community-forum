'use client';

// Odovzdávací balík pri zmene prezidenta alebo boardu (mandát 1 rok, stanovy čl. XXII).
// Jedným klikom poskladá z Memorie všetko, čo nové vedenie potrebuje v prvý deň.
// Iba fakty zo záznamov — nenahrádza knihu zápisníc ani účtovníctvo administrátora.

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../../lib/supabaseClient';
import { mandateState } from '../../../lib/memoriaMandates';
import { budgetStatus, reserveStatus } from '../../../lib/memoriaBudget';
import { formatDate } from '../../../lib/formatDate';
import { mt, todayIso, addDaysIso, addMonthsIso, formatMoney, OPEN_TASK_STATUSES } from '../../../lib/memoriaI18n';
import { DemoPill } from './MemoriaUi';
import { buildTimeline } from './timeline';
import { noticeDeadline } from './ContractsPanel';

function Section({ title, children }) {
  return (
    <section className="mt-6 break-inside-avoid-page">
      <h3 className="font-display text-lg text-harbor border-b border-ink/15 pb-1 mb-2">{title}</h3>
      {children}
    </section>
  );
}

function Table({ head, rows, empty }) {
  if (rows.length === 0) return <p className="text-sm text-ink/60">{empty}</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-ink/50 uppercase">
            {head.map((h) => (
              <th key={h} className="py-1 pr-3 font-semibold">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-ink/5 align-top">
              {r.map((c, j) => (
                <td key={j} className="py-1.5 pr-3">{c}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function HandoverPanel({ lang, profile }) {
  const [d, setD] = useState(null);

  useEffect(() => {
    let active = true;
    (async () => {
      const since = addMonthsIso(todayIso(), -12);
      const yr = Number(todayIso().slice(0, 4));
      const [tRes, oRes, mRes, cRes, sRes, rRes, tdRes, qRes, iRes, dRes, mdRes, bRes, blRes, rmRes, yiRes, riRes, csRes] = await Promise.all([
        supabase.from('memoria_tasks').select('*').in('status', OPEN_TASK_STATUSES).order('due_date', { ascending: true, nullsFirst: false }),
        supabase.from('memoria_obligations').select('*').eq('active', true),
        supabase.from('memoria_meetings').select('*').order('meeting_on', { ascending: false }),
        supabase.from('memoria_contracts').select('*').eq('status', 'active').order('ends_on', { ascending: true, nullsFirst: false }),
        supabase.from('memoria_suppliers').select('*').eq('status', 'active').order('name', { ascending: true }),
        supabase.from('memoria_supplier_ratings').select('supplier_id, rating, rated_on').order('rated_on', { ascending: false }),
        supabase.from('memoria_tenders').select('*').eq('status', 'collecting'),
        supabase.from('memoria_quotes').select('tender_id'),
        supabase.from('memoria_invoices').select('*').gte('invoice_date', since),
        supabase.from('memoria_decisions').select('*').order('decided_on', { ascending: false }).limit(15),
        supabase.from('memoria_mandates').select('*').order('starts_on', { ascending: false }),
        supabase.from('memoria_budgets').select('*').order('year', { ascending: false }),
        supabase.from('memoria_budget_lines').select('*'),
        supabase.from('memoria_reserve_movements').select('moved_on, kind, amount'),
        supabase.from('memoria_invoices').select('invoice_date, total_amount, category, funding_source').gte('invoice_date', `${yr}-01-01`).range(0, 9999),
        supabase.from('memoria_invoices').select('total_amount').eq('funding_source', 'reserve_fund'),
        supabase.from('memoria_cases').select('*').in('status', ['open', 'in_progress', 'waiting']).order('opened_on', { ascending: true }),
      ]);
      const { count: decisionCount } = await supabase.from('memoria_decisions').select('id', { count: 'exact', head: true });
      if (!active) return;
      setD({
        tasks: tRes.data || [],
        obligations: oRes.data || [],
        meetings: mRes.data || [],
        contracts: cRes.data || [],
        suppliers: sRes.data || [],
        ratings: rRes.data || [],
        tenders: tdRes.data || [],
        quotes: qRes.data || [],
        invoices: iRes.data || [],
        decisions: dRes.data || [],
        decisionCount: decisionCount || 0,
        mandates: (mdRes.data || []).filter((m) => mandateState(m, todayIso()) !== 'past'),
        budget: (() => {
          const b = (bRes.data || []).find((x) => Number(x.year) === yr);
          return b ? { b, st: budgetStatus({ budget: b, lines: (blRes.data || []).filter((l) => l.budget_id === b.id), invoices: yiRes.data || [] }) } : null;
        })(),
        cases: csRes.data || [],
        reserve: reserveStatus({ movements: rmRes.data || [], reserveInvoices: riRes.data || [], budget: (bRes.data || [])[0] }),
      });
    })();
    return () => {
      active = false;
    };
  }, []);

  const v = useMemo(() => {
    if (!d) return null;
    const today = todayIso();
    const supplierName = Object.fromEntries(d.suppliers.map((s) => [s.id, s.name]));
    const lastRating = {};
    for (const r of d.ratings) if (!(r.supplier_id in lastRating)) lastRating[r.supplier_id] = r;
    const quoteCount = {};
    for (const q of d.quotes) quoteCount[q.tender_id] = (quoteCount[q.tender_id] || 0) + 1;
    const timeline = buildTimeline({ obligations: d.obligations, meetings: d.meetings, tasks: [], contracts: d.contracts }, lang, 6);
    const attentionInvoices = d.invoices.filter(
      (i) => (i.is_urgent_unbudgeted && !i.ratified_by_decision_id) || i.payment_status === 'overdue' || i.payment_status === 'disputed' || (i.payment_status === 'pending' && i.due_date && i.due_date < today)
    );
    const byCat = {};
    for (const i of d.invoices) {
      if ((i.currency || 'EUR') !== 'EUR') continue;
      byCat[i.category || 'other'] = (byCat[i.category || 'other'] || 0) + Number(i.total_amount || 0);
    }
    const spend = Object.entries(byCat).sort((a, b) => b[1] - a[1]);
    const spendTotal = spend.reduce((s, [, x]) => s + x, 0);
    const lastHeld = d.meetings.find((m) => m.status === 'held') || null;
    const nextPlanned = [...d.meetings].reverse().find((m) => m.status === 'planned' && m.meeting_on >= today) || null;
    return {
      supplierName,
      lastRating,
      quoteCount,
      timeline,
      attentionInvoices,
      spend,
      spendTotal,
      lastHeld,
      nextPlanned,
      overdue: d.tasks.filter((t) => t.due_date && t.due_date < today).length,
    };
  }, [d, lang]);

  if (!d || !v) return <p className="text-ink/60">{mt(lang, 'loading')}</p>;

  const dash = '—';
  const date = (x) => (x ? formatDate(x, lang) : dash);

  return (
    <div>
      <div className="flex items-start justify-between gap-3 flex-wrap mb-4 print:hidden">
        <p className="text-sm text-ink/60 max-w-xl">{mt(lang, 'handoverIntro')}</p>
        <button className="btn-primary text-sm" onClick={() => window.print()}>🖨 {mt(lang, 'print')}</button>
      </div>

      <article className="card p-6 print:shadow-none print:border-0 print:p-0">
        <p className="text-sm text-ink/60">{mt(lang, 'communityName')}</p>
        <h2 className="font-display text-2xl text-harbor mt-1">📦 {mt(lang, 'tabHandover')}</h2>
        <p className="text-xs text-ink/50 mt-1">
          {mt(lang, 'handoverGenerated', { date: formatDate(todayIso(), lang), name: profile?.full_name || mt(lang, 'someone') })}
        </p>

        <Section title={mt(lang, 'h_summary')}>
          <p className="text-sm text-ink">
            {mt(lang, 'handoverSummary', {
              tasks: d.tasks.length,
              overdue: v.overdue,
              contracts: d.contracts.length,
              deadlines: v.timeline.filter((i) => i.date >= todayIso()).length,
              decisions: d.decisionCount,
            })}
          </p>
        </Section>

        <Section title={mt(lang, 'mandatesCurrent')}>
          <Table
            head={[mt(lang, 'personName'), mt(lang, 'position'), mt(lang, 'mandateStarts'), mt(lang, 'mandateEndsPlanned'), mt(lang, 'appointedBy')]}
            empty={mt(lang, 'h_none')}
            rows={d.mandates.map((m) => [
              `${m.person_name}${m.is_demo ? ' (DEMO)' : ''}`,
              mt(lang, `pos_${m.position}`),
              date(m.starts_on),
              date(m.ended_on || m.ends_on),
              m.appointed_by || dash,
            ])}
          />
        </Section>

        <Section title={mt(lang, 'h_openTasks')}>
          <Table
            head={[mt(lang, 'title'), mt(lang, 'responsible'), mt(lang, 'supervisor'), mt(lang, 'dueDate'), mt(lang, 'status')]}
            empty={mt(lang, 'h_none')}
            rows={d.tasks.map((t) => [
              <>{t.title} <DemoPill show={t.is_demo} /></>,
              `${mt(lang, `role_${t.executor_role}`)}${t.executor_name && t.executor_name !== mt(lang, `role_${t.executor_role}`) ? `: ${t.executor_name}` : ''}`,
              t.supervisor_name || dash,
              <span className={t.due_date && t.due_date < todayIso() ? 'text-red-700 font-semibold' : ''}>{date(t.due_date)}</span>,
              `${mt(lang, `taskStatus_${t.status}`)}${t.status === 'blocked' && t.blocked_reason ? ` (${t.blocked_reason})` : ''}`,
            ])}
          />
        </Section>

        <Section title={mt(lang, 'h_deadlines')}>
          <Table
            head={[mt(lang, 'meetingOn'), mt(lang, 'description'), mt(lang, 'category')]}
            empty={mt(lang, 'h_none')}
            rows={v.timeline.map((i) => [
              <span className={i.date < todayIso() ? 'text-red-700 font-semibold' : ''}>{date(i.date)}</span>,
              <>{i.text} <DemoPill show={i.isDemo} /></>,
              mt(lang, `kind_${i.kind}`),
            ])}
          />
        </Section>

        <Section title={mt(lang, 'h_contracts')}>
          <Table
            head={[mt(lang, 'subject'), mt(lang, 'supplier'), mt(lang, 'amount'), mt(lang, 'endsOn'), mt(lang, 'noticeDeadline')]}
            empty={mt(lang, 'h_none')}
            rows={d.contracts.map((c) => [
              <>{c.subject} <DemoPill show={c.is_demo} /></>,
              v.supplierName[c.supplier_id] || dash,
              c.amount !== null ? `${formatMoney(c.amount, c.currency, lang)}${c.payment_frequency ? ` · ${mt(lang, `freq_${c.payment_frequency}`)}` : ''}` : dash,
              date(c.ends_on),
              c.auto_renew ? `↻ ${date(noticeDeadline(c))}` : dash,
            ])}
          />
        </Section>

        <Section title={mt(lang, 'h_suppliers')}>
          <Table
            head={[mt(lang, 'supplier'), mt(lang, 'category'), mt(lang, 'contactPerson'), mt(lang, 'lastRating')]}
            empty={mt(lang, 'h_none')}
            rows={d.suppliers.map((s) => [
              <>{s.name} <DemoPill show={s.is_demo} /></>,
              mt(lang, `cat_${s.category}`),
              [s.contact_person, s.phone, s.email].filter(Boolean).join(' · ') || dash,
              v.lastRating[s.id] ? `${'★'.repeat(v.lastRating[s.id].rating)} (${date(v.lastRating[s.id].rated_on)})` : dash,
            ])}
          />
        </Section>

        <Section title={mt(lang, 'h_tenders')}>
          <Table
            head={[mt(lang, 'title'), mt(lang, 'quotes')]}
            empty={mt(lang, 'h_none')}
            rows={d.tenders.map((t) => [<>{t.title} <DemoPill show={t.is_demo} /></>, mt(lang, 'quotesCount', { n: v.quoteCount[t.id] || 0 })])}
          />
        </Section>

        <Section title={mt(lang, 'h_money')}>
          <Table
            head={[mt(lang, 'invoiceDate'), mt(lang, 'supplier'), mt(lang, 'description'), mt(lang, 'totalAmount'), mt(lang, 'status')]}
            empty={mt(lang, 'h_none')}
            rows={v.attentionInvoices.map((i) => [
              date(i.invoice_date),
              v.supplierName[i.supplier_id] || dash,
              <>{[i.invoice_number, i.description].filter(Boolean).join(' · ')} <DemoPill show={i.is_demo} /></>,
              formatMoney(i.total_amount, i.currency, lang),
              i.is_urgent_unbudgeted && !i.ratified_by_decision_id ? mt(lang, 'notRatified') : mt(lang, `payment_${i.payment_status}`),
            ])}
          />
        </Section>

        <Section title={`${mt(lang, 'tabBudget')}`}>
          {d.budget ? (
            <>
              <p className="text-sm text-ink mb-2">
                {d.budget.b.title}:{' '}
                {mt(lang, 'budgetSpent', {
                  actual: formatMoney(d.budget.st.actualTotal, 'EUR', lang),
                  total: formatMoney(d.budget.b.total_amount, 'EUR', lang),
                  pct: `${Math.round((d.budget.st.totalPct || 0) * 100)} %`,
                })}
                {d.budget.st.coverageDate ? ` · ${mt(lang, 'invoiceDataUntil', { date: date(d.budget.st.coverageDate) })}` : ''}
              </p>
              <Table
                head={[mt(lang, 'category'), mt(lang, 'planned'), mt(lang, 'spent'), mt(lang, 'status')]}
                empty={mt(lang, 'h_none')}
                rows={d.budget.st.rows
                  .filter((r) => r.status !== 'ok')
                  .map((r) => [mt(lang, `invcat_${r.category}`), r.status === 'unplanned' ? dash : formatMoney(r.planned, 'EUR', lang), formatMoney(r.actual, 'EUR', lang), mt(lang, `bs_${r.status}`)])}
              />
            </>
          ) : (
            <p className="text-sm text-ink/60">{mt(lang, 'h_none')}</p>
          )}
          {d.reserve.hasData && (
            <p className="text-sm text-ink mt-2">
              🏦 {mt(lang, 'reserveBalance')}: <strong>{formatMoney(d.reserve.balance, 'EUR', lang)}</strong>
              {d.reserve.minimum !== null ? ` · ${mt(lang, 'reserveMinimum')}: ${formatMoney(d.reserve.minimum, 'EUR', lang)} (${d.reserve.belowMinimum ? mt(lang, 'reserveBelow') : mt(lang, 'reserveOk')})` : ''}
            </p>
          )}
        </Section>

        <Section title={mt(lang, 'tabCases')}>
          <Table
            head={[mt(lang, 'title'), mt(lang, 'caseCounterparty'), mt(lang, 'caseClaimed'), mt(lang, 'caseNextStep'), mt(lang, 'status')]}
            empty={mt(lang, 'h_none')}
            rows={d.cases.map((c) => [
              <>{c.title} <DemoPill show={c.is_demo} /></>,
              c.counterparty || dash,
              c.amount_claimed !== null && c.amount_claimed !== undefined ? formatMoney(c.amount_claimed, 'EUR', lang) : dash,
              c.next_step ? `${c.next_step}${c.next_step_due ? ` (${date(c.next_step_due)})` : ''}` : dash,
              mt(lang, `cs_${c.status}`),
            ])}
          />
        </Section>

        <Section title={mt(lang, 'h_spend')}>
          <Table
            head={[mt(lang, 'category'), mt(lang, 'totalAmount')]}
            empty={mt(lang, 'h_none')}
            rows={[
              ...v.spend.map(([cat, sum]) => [mt(lang, `invcat_${cat}`), formatMoney(sum, 'EUR', lang)]),
              ...(v.spend.length ? [[<strong key="t">Σ</strong>, <strong key="s">{formatMoney(v.spendTotal, 'EUR', lang)}</strong>]] : []),
            ]}
          />
        </Section>

        <Section title={mt(lang, 'h_meetings')}>
          <ul className="text-sm text-ink space-y-1">
            <li>
              <strong>{mt(lang, 'lastHeld')}:</strong>{' '}
              {v.lastHeld ? `${v.lastHeld.title} · ${date(v.lastHeld.meeting_on)}` : dash}
            </li>
            <li>
              <strong>{mt(lang, 'nextPlanned')}:</strong>{' '}
              {v.nextPlanned ? `${v.nextPlanned.title} · ${date(v.nextPlanned.meeting_on)}` : dash}
            </li>
          </ul>
        </Section>

        <Section title={mt(lang, 'h_decisions')}>
          {d.decisions.length === 0 ? (
            <p className="text-sm text-ink/60">{mt(lang, 'h_none')}</p>
          ) : (
            <ul className="space-y-2">
              {d.decisions.map((x) => (
                <li key={x.id} className="text-sm">
                  <p className="text-ink">
                    <strong>{date(x.decided_on)} · {x.title}</strong> <DemoPill show={x.is_demo} />
                    <span className="text-xs text-ink/50"> · {mt(lang, `body_${x.body}`)}</span>
                  </p>
                  <p className="text-ink/80">{x.decision}</p>
                  {x.rationale && <p className="text-ink/60 italic">{mt(lang, 'rationale')}: {x.rationale}</p>}
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title={mt(lang, 'h_checklist')}>
          <ul className="text-sm text-ink space-y-1">
            {['chk_bank', 'chk_access', 'chk_keys', 'chk_admin', 'chk_docs'].map((k) => (
              <li key={k}>☐ {mt(lang, k)}</li>
            ))}
          </ul>
        </Section>

        <p className="text-xs text-ink/40 italic mt-8">{mt(lang, 'handoverFooter')}</p>
      </article>
    </div>
  );
}
