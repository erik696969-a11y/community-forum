'use client';

// Prehľad „čo si vyžaduje pozornosť“. Iba fakty zo záznamov (hranica ako pri MIA):
// nič neodporúča a nič nerozhoduje za board.

import { useEffect, useState } from 'react';
import { supabase } from '../../../lib/supabaseClient';
import { formatDate } from '../../../lib/formatDate';
import { mt, todayIso, addDaysIso, formatMoney } from '../../../lib/memoriaI18n';

const CONTRACT_WINDOW_DAYS = 90;
const NOTICE_WINDOW_DAYS = 60;

export default function AlertsBar({ lang, refreshKey, onOpenTab }) {
  const [alerts, setAlerts] = useState(null);

  useEffect(() => {
    let active = true;
    (async () => {
      const today = todayIso();
      const [cRes, iRes, tRes, qRes, sRes] = await Promise.all([
        supabase.from('memoria_contracts').select('id, subject, ends_on, auto_renew, notice_period_days, status').eq('status', 'active'),
        supabase.from('memoria_invoices').select('id, invoice_number, description, total_amount, currency, due_date, payment_status, is_urgent_unbudgeted, ratified_by_decision_id'),
        supabase.from('memoria_tenders').select('id, title, status').eq('status', 'decided'),
        supabase.from('memoria_quotes').select('tender_id'),
        supabase.from('memoria_suppliers').select('id, name, status, conflict_of_interest_checked').eq('status', 'active'),
      ]);
      if (!active) return;
      const list = [];

      for (const c of cRes.data || []) {
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

      const quoteCount = {};
      for (const q of qRes.data || []) quoteCount[q.tender_id] = (quoteCount[q.tender_id] || 0) + 1;
      for (const t of tRes.data || []) {
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
