'use client';

// Prehľad „čo si vyžaduje pozornosť“. Iba fakty zo záznamov (hranica ako pri MIA):
// nič neodporúča a nič nerozhoduje za board.

import { useEffect, useState } from 'react';
import { supabase } from '../../../lib/supabaseClient';
import { formatDate } from '../../../lib/formatDate';
import { mt, todayIso, addDaysIso, formatMoney, OPEN_TASK_STATUSES } from '../../../lib/memoriaI18n';
import { meetingChecks } from './MeetingsPanel';
import { mandateChecks } from '../../../lib/memoriaMandates';
import { budgetStatus, reserveStatus } from '../../../lib/memoriaBudget';
import { supplierPriceChanges, categoryYearOnYear } from '../../../lib/memoriaTrends';

const CONTRACT_WINDOW_DAYS = 90;
const NOTICE_WINDOW_DAYS = 60;

export default function AlertsBar({ lang, refreshKey, onOpenTab }) {
  const [alerts, setAlerts] = useState(null);

  useEffect(() => {
    let active = true;
    (async () => {
      const today = todayIso();
      const year = Number(today.slice(0, 4));
      const [cRes, iRes, tRes, qRes, sRes, taskRes, oRes, mRes, mandRes, profRes, bRes, blRes, rmRes, yiRes, riRes, caseRes, trRes, supRes] = await Promise.all([
        supabase.from('memoria_contracts').select('id, subject, ends_on, auto_renew, notice_period_days, status, tender_id').eq('status', 'active'),
        supabase.from('memoria_invoices').select('id, invoice_number, description, total_amount, currency, due_date, payment_status, is_urgent_unbudgeted, ratified_by_decision_id'),
        supabase.from('memoria_tenders').select('id, title, status, selection_reason').eq('status', 'decided'),
        supabase.from('memoria_quotes').select('tender_id'),
        supabase.from('memoria_suppliers').select('id, name, status, conflict_of_interest_checked').eq('status', 'active'),
        supabase.from('memoria_tasks').select('id, title, due_date, status, priority').in('status', OPEN_TASK_STATUSES),
        supabase.from('memoria_obligations').select('id, title, next_due_on, remind_days').eq('active', true),
        supabase.from('memoria_meetings').select('*').neq('status', 'cancelled'),
        supabase.from('memoria_mandates').select('*'),
        supabase.from('profiles').select('id, full_name, role, status').eq('role', 'board'),
        supabase.from('memoria_budgets').select('*').order('year', { ascending: false }),
        supabase.from('memoria_budget_lines').select('*'),
        supabase.from('memoria_reserve_movements').select('moved_on, kind, amount'),
        supabase.from('memoria_invoices').select('invoice_date, total_amount, category, funding_source').gte('invoice_date', `${year}-01-01`).range(0, 9999),
        supabase.from('memoria_invoices').select('total_amount').eq('funding_source', 'reserve_fund'),
        supabase.from('memoria_cases').select('id, title, status, next_step, next_step_due').in('status', ['open', 'in_progress', 'waiting']),
        supabase.from('memoria_invoices').select('supplier_id, invoice_date, total_amount, category, funding_source').gte('invoice_date', `${year - 2}-01-01`).range(0, 9999),
        supabase.from('memoria_suppliers').select('id, name'),
      ]);
      if (!active) return;
      const list = [];

      for (const c of cRes.data || []) {
        if (!c.tender_id) {
          list.push({ key: `ct-${c.id}`, tone: 'neutral', tab: 'contracts', sort: '98', text: mt(lang, 'alertContractNoTender', { name: c.subject }) });
        }
        if (c.auto_renew && c.ends_on && c.notice_period_days !== null) {
          const deadline = addDaysIso(c.ends_on, -Number(c.notice_period_days || 0));
          if (deadline >= today && deadline <= addDaysIso(today, NOTICE_WINDOW_DAYS)) {
            list.push({ key: `n-${c.id}`, tone: 'red', tab: 'contracts', sort: deadline, text: mt(lang, 'alertContractNotice', { name: c.subject, date: formatDate(deadline, lang) }) });
            continue;
          }
        }
        if (c.ends_on && c.ends_on <= addDaysIso(today, CONTRACT_WINDOW_DAYS)) {
          list.push({ key: `e-${c.id}`, tone: c.ends_on < today ? 'red' : 'ochre', tab: 'contracts', sort: c.ends_on, text: mt(lang, 'alertContractEnding', { name: c.subject, date: formatDate(c.ends_on, lang) }) });
        }
      }

      for (const inv of iRes.data || []) {
        const name = inv.invoice_number || inv.description || formatMoney(inv.total_amount, inv.currency, lang);
        if (inv.is_urgent_unbudgeted && !inv.ratified_by_decision_id) {
          list.push({ key: `u-${inv.id}`, tone: 'red', tab: 'invoices', sort: '0', text: mt(lang, 'alertUnratified', { name }) });
        }
        if (inv.due_date && inv.due_date < today && (inv.payment_status === 'pending' || inv.payment_status === 'overdue')) {
          list.push({ key: `o-${inv.id}`, tone: 'ochre', tab: 'invoices', sort: inv.due_date, text: mt(lang, 'alertOverdue', { name, date: formatDate(inv.due_date, lang) }) });
        }
      }

      for (const t of taskRes.data || []) {
        if (t.status === 'blocked') {
          list.push({ key: `tb-${t.id}`, tone: 'ochre', tab: 'tasks', sort: '1', text: mt(lang, 'alertTaskBlocked', { name: t.title }) });
        } else if (t.due_date && t.due_date < today) {
          list.push({ key: `to-${t.id}`, tone: 'red', tab: 'tasks', sort: t.due_date, text: mt(lang, 'alertTaskOverdue', { name: t.title, date: formatDate(t.due_date, lang) }) });
        }
      }

      for (const o of oRes.data || []) {
        if (o.next_due_on < today) {
          list.push({ key: `oo-${o.id}`, tone: 'red', tab: 'calendar', sort: o.next_due_on, text: mt(lang, 'alertObligationOverdue', { name: o.title, date: formatDate(o.next_due_on, lang) }) });
        } else if (o.next_due_on <= addDaysIso(today, o.remind_days ?? 30)) {
          list.push({ key: `os-${o.id}`, tone: 'ochre', tab: 'calendar', sort: o.next_due_on, text: mt(lang, 'alertObligationSoon', { name: o.title, date: formatDate(o.next_due_on, lang) }) });
        }
      }

      for (const m of mRes.data || []) {
        for (const c of meetingChecks(m, lang)) {
          if (c.tone === 'green') continue;
          // Pozvánku pripomíname až 14 dní pred lehotou, aby lišta nebola preplnená.
          if (c.tone === 'ochre' && c.date && c.date > addDaysIso(today, 14)) continue;
          const text =
            c.key === 'minutes' && c.date
              ? mt(lang, 'alertMinutes', { name: m.title, date: formatDate(c.date, lang) })
              : c.date && c.tone === 'red'
                ? mt(lang, 'alertMeetingInvitationMissed', { name: m.title, date: formatDate(c.date, lang) })
                : c.date
                  ? mt(lang, 'alertMeetingInvitation', { name: m.title, date: formatDate(c.date, lang) })
                  : `${m.title}: ${c.text}`;
          list.push({ key: `m-${m.id}-${c.key}`, tone: c.tone, tab: 'meetings', sort: c.date || '1', text });
        }
      }

      for (const c of mandateChecks(mandRes.data || [], profRes.data || [], today)) {
        if (c.kind === 'ending') {
          list.push({ key: `me-${c.mandateId}`, tone: 'ochre', tab: 'mandates', sort: c.date, text: mt(lang, 'alertMandateEnding', { name: c.name, position: mt(lang, `pos_${c.position}`), date: formatDate(c.date, lang) }) });
        } else if (c.kind === 'leftover_access') {
          list.push({ key: `ml-${c.profileId}`, tone: 'red', tab: 'mandates', sort: '0', text: mt(lang, 'alertLeftoverAccess', { name: c.name, date: formatDate(c.date, lang) }) });
        } else {
          list.push({ key: `mn-${c.profileId}`, tone: 'neutral', tab: 'mandates', sort: '97', text: mt(lang, 'alertNoMandate', { name: c.name }) });
        }
      }

      const budgets = bRes.data || [];
      const budget = budgets.find((b) => Number(b.year) === year);
      if (budget) {
        const st = budgetStatus({ budget, lines: (blRes.data || []).filter((l) => l.budget_id === budget.id), invoices: yiRes.data || [] });
        for (const r of st.rows) {
          const name = mt(lang, `invcat_${r.category}`);
          if (r.status === 'over') {
            list.push({ key: `bo-${r.category}`, tone: 'red', tab: 'budget', sort: '2', text: mt(lang, 'alertBudgetOver', { name, actual: formatMoney(r.actual, 'EUR', lang), planned: formatMoney(r.planned, 'EUR', lang) }) });
          } else if (r.status === 'at_risk') {
            list.push({ key: `br-${r.category}`, tone: 'ochre', tab: 'budget', sort: '8', text: mt(lang, 'alertBudgetAtRisk', { name, projection: formatMoney(r.projection, 'EUR', lang), planned: formatMoney(r.planned, 'EUR', lang) }) });
          }
        }
      }
      const rs = reserveStatus({ movements: rmRes.data || [], reserveInvoices: riRes.data || [], budget: budget || budgets[0] });
      if (rs.belowMinimum) {
        list.push({ key: 'reserve', tone: 'red', tab: 'budget', sort: '2', text: mt(lang, 'alertReserveBelow', { balance: formatMoney(rs.balance, 'EUR', lang), minimum: formatMoney(rs.minimum, 'EUR', lang) }) });
      }

      for (const c of caseRes.data || []) {
        if (!c.next_step_due) continue;
        if (c.next_step_due < today) {
          list.push({ key: `cs-${c.id}`, tone: 'red', tab: 'cases', sort: c.next_step_due, text: mt(lang, 'alertCaseOverdue', { name: c.title, date: formatDate(c.next_step_due, lang) }) });
        } else if (c.next_step_due <= addDaysIso(today, 14)) {
          list.push({ key: `cs-${c.id}`, tone: 'ochre', tab: 'cases', sort: c.next_step_due, text: mt(lang, 'alertCaseSoon', { name: c.title, date: formatDate(c.next_step_due, lang) }) });
        }
      }

      const supNames = Object.fromEntries((supRes.data || []).map((x) => [x.id, x.name]));
      for (const p of supplierPriceChanges(trRes.data || [], supNames).filter((x) => x.flagged)) {
        list.push({ key: `tp-${p.supplierId}`, tone: 'neutral', tab: 'budget', sort: '96', text: mt(lang, 'alertPriceRise', { name: p.name, pct: `+${Math.round(p.change * 100)} %`, from: p.fromYear, to: p.toYear }) });
      }
      for (const c of categoryYearOnYear(trRes.data || []).rows.filter((x) => x.flagged)) {
        list.push({ key: `tc-${c.category}`, tone: 'neutral', tab: 'budget', sort: '96', text: mt(lang, 'alertCategoryRise', { name: mt(lang, `invcat_${c.category}`), pct: `+${Math.round(c.change * 100)} %` }) });
      }

      const quoteCount = {};
      for (const q of qRes.data || []) quoteCount[q.tender_id] = (quoteCount[q.tender_id] || 0) + 1;
      for (const t of tRes.data || []) {
        if (!t.selection_reason || !t.selection_reason.trim()) {
          list.push({ key: `tr-${t.id}`, tone: 'neutral', tab: 'tenders', sort: '98', text: mt(lang, 'alertTenderNoReason', { name: t.title }) });
        }
        if ((quoteCount[t.id] || 0) < 2) {
          list.push({ key: `t-${t.id}`, tone: 'ochre', tab: 'tenders', sort: '9', text: mt(lang, 'alertSingleQuote', { name: t.title }) });
        }
      }

      for (const s of sRes.data || []) {
        if (!s.conflict_of_interest_checked) {
          list.push({ key: `s-${s.id}`, tone: 'neutral', tab: 'suppliers', sort: '99', text: mt(lang, 'alertConflict', { name: s.name }) });
        }
      }

      list.sort((a, b) => (a.sort < b.sort ? -1 : a.sort > b.sort ? 1 : 0));
      setAlerts(list);
    })();
    return () => {
      active = false;
    };
  }, [lang, refreshKey]);

  if (alerts === null) return null;

  const dot = { red: 'bg-red-500', ochre: 'bg-ochre', neutral: 'bg-ink/30' };

  return (
    <div className="card p-4 mb-6">
      <p className="text-sm font-semibold text-harbor mb-2">🔔 {mt(lang, 'alertsTitle')}</p>
      {alerts.length === 0 ? (
        <p className="text-sm text-ink/60">{mt(lang, 'alertsNone')}</p>
      ) : (
        <>
          <ul className="space-y-1">
            {alerts.slice(0, 12).map((a) => (
              <li key={a.key}>
                <button className="flex items-start gap-2 text-sm text-ink text-left hover:text-harbor" onClick={() => onOpenTab?.(a.tab)}>
                  <span className={`mt-1.5 w-2 h-2 rounded-full flex-shrink-0 ${dot[a.tone] || dot.neutral}`} />
                  <span>{a.text}</span>
                </button>
              </li>
            ))}
          </ul>
          {alerts.length > 12 && <p className="text-xs text-ink/50 mt-1">+{alerts.length - 12}</p>}
          <p className="text-xs text-ink/40 italic mt-3">{mt(lang, 'alertsFactsOnly')}</p>
        </>
      )}
    </div>
  );
}
