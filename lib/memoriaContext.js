import { budgetStatus, reserveStatus } from './memoriaBudget';
import { supplierPriceChanges, categoryYearOnYear } from './memoriaTrends';
// Memoria — poskladá kompaktný textový prehľad záznamov pre AI („Opýtaj sa Memorie“).
// Čisté funkcie bez prístupu k sieti, aby sa dali testovať.

// Stručné pravidlá zo stanov a zákona (zdroj: Estatutos 2007, LPH; overené v projekte Memoria).
export const GOVERNANCE_RULES = `
- Junta General (owners' meeting): highest body; approves accounts, budget, extraordinary levies, reserve fund use, election of president/vice-president/3 vocals/administrator; invitation min. 15 days before (Statutes art. XX); minutes closed within 10 days (LPH art. 19).
- Junta Directiva (board: president, vice-president, 3 vocals, 1-year mandate, unpaid): decides matters brought by the administrator or president (except those reserved to the Junta General); approves the agenda of general meetings; oversees the president, vice-president and administrator and supervises that resolutions are carried out (art. XXII.4); ratifies urgent unbudgeted expenses (art. XXX = 30); approves exterior changes, awnings, signs (art. XIV). Meetings: convened by the president or half+1 of members, min. 8 days notice, quorum 3, majority decides, president's casting vote (art. XXII.5).
- President (art. XXIII): convenes and chairs meetings, represents the community, requests accounts from the administrator, may suspend a board resolution he considers contrary to the statutes (re-vote at next ordinary meeting or general meeting within 1 month), decides insurance cover (art. XXXIV), can appoint lawyers and sue debtors.
- Administrator (art. XXVI–XXVII): administration, accounts, executes resolutions, signs maintenance and supply contracts, works under the president's supervision; budget proposal to the president 8 weeks before the ordinary general meeting (art. XVII).
- Urgent unbudgeted expense: may be approved temporarily by president + administrator jointly, then must be ratified by the board (art. XXX = 30).
- AGM 2026 resolution 6g: suppliers must not be owners, the administrator or companies linked to them (conflict of interest check).
- Reserve fund: at least 10% of the annual budget (LPH art. 9.1.f).
`.trim();

function money(n) {
  if (n === null || n === undefined || n === '') return '-';
  return `${Number(n).toFixed(2)}`;
}

// Rozdiel dní medzi dvoma dátumami 'YYYY-MM-DD' (b - a).
function dayDiff(a, b) {
  const [ay, am, ad] = a.split('-').map(Number);
  const [by, bm, bd] = b.split('-').map(Number);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86400000);
}

function addDays(iso, n) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

// „in 36 days“ / „23 days ago“ / „today“ — model nepočíta dátumy sám.
function rel(today, iso) {
  if (!iso) return '';
  const n = dayDiff(today, iso);
  if (n === 0) return 'today';
  return n > 0 ? `in ${n} days` : `${-n} days ago`;
}

function demo(r) {
  return r.is_demo ? ' [DEMO]' : '';
}

// data = { suppliers, ratings, contracts, tenders, quotes, invoices, decisions, tasks, obligations, meetings, meetingItems }
export function buildMemoriaContext(data, today) {
  const sName = Object.fromEntries((data.suppliers || []).map((s) => [s.id, s.name]));
  const dTitle = Object.fromEntries((data.decisions || []).map((d) => [d.id, d.title]));
  const out = [];

  out.push(`TODAY: ${today}`);

  out.push('\n## SUPPLIERS');
  const ratingsBy = {};
  for (const r of data.ratings || []) (ratingsBy[r.supplier_id] ||= []).push(r);
  for (const s of data.suppliers || []) {
    const rs = (ratingsBy[s.id] || [])
      .sort((a, b) => (a.rated_on < b.rated_on ? -1 : 1))
      .map((r) => `${r.rated_on}:${r.rating}/5${r.comment ? ` "${r.comment}"` : ''}`)
      .join('; ');
    out.push(
      `- ${s.name}${demo(s)} | category ${s.category} | status ${s.status}${s.status_reason ? ` (${s.status_reason})` : ''} | tax id ${s.tax_id || '-'} | conflict-of-interest checked: ${s.conflict_of_interest_checked ? 'yes' : 'NO'}${s.first_engaged_on ? ` | since ${s.first_engaged_on}` : ''}${rs ? ` | ratings: ${rs}` : ''}${s.notes ? ` | notes: ${s.notes}` : ''}`
    );
  }

  out.push('\n## CONTRACTS');
  const upcoming = [];
  for (const c of data.contracts || []) {
    let notice = '';
    if (c.auto_renew && c.ends_on && c.notice_period_days !== null && c.notice_period_days !== undefined) {
      const nd = addDays(c.ends_on, -Number(c.notice_period_days));
      notice = ` | notice period ${c.notice_period_days} days → LAST DAY TO GIVE NOTICE ${nd} (${rel(today, nd)})`;
      if (c.status === 'active') upcoming.push({ date: nd, text: `last day to give notice on contract "${c.subject}"${demo(c)} (otherwise it renews automatically on ${c.ends_on})` });
    }
    if (c.status === 'active' && c.ends_on) {
      upcoming.push({ date: c.ends_on, text: `contract "${c.subject}"${demo(c)} ${c.auto_renew ? 'renews automatically unless notice is given' : 'ends (no automatic renewal)'}` });
    }
    out.push(
      `- ${c.subject}${demo(c)} | supplier ${sName[c.supplier_id] || '-'} | status ${c.status} | ${c.starts_on || '?'} to ${c.ends_on || 'open'}${c.ends_on ? ` (end ${rel(today, c.ends_on)})` : ''}${c.auto_renew ? ' | AUTO-RENEWS at the end date' : ' | no automatic renewal'}${notice} | ${money(c.amount)} ${c.currency} ${c.payment_frequency || ''} | tender: ${c.tender_id ? 'yes' : 'NONE'} | approved by: ${dTitle[c.approved_by_decision_id] || '-'} | signed by ${c.signed_by || '-'}${c.notes ? ` | ${c.notes}` : ''}`
    );
  }

  out.push('\n## TENDERS AND QUOTES');
  const quotesBy = {};
  for (const q of data.quotes || []) (quotesBy[q.tender_id] ||= []).push(q);
  for (const t of data.tenders || []) {
    out.push(
      `- ${t.title}${demo(t)} | status ${t.status} | opened ${t.opened_on || '-'} | budget limit ${money(t.approved_budget)} ${t.currency} | chosen: ${sName[t.selected_supplier_id] || '-'} | reason: ${t.selection_reason || '-'} | approved by: ${dTitle[t.approved_by_decision_id] || '-'}`
    );
    for (const q of quotesBy[t.id] || []) {
      out.push(`   · quote ${sName[q.supplier_id] || '-'}: ${money(q.amount)} ${q.currency} ${q.vat_included ? 'incl. VAT' : 'excl. VAT'} | ${q.submitted_on || '-'}${q.notes ? ` | ${q.notes.replace(/\n/g, ' ')}` : ''}`);
    }
  }

  if ((data.mandates || []).length) {
    out.push('\n## BOARD AND MANDATES');
    const state = (m) => {
      const end = m.ended_on || m.ends_on;
      if (m.starts_on > today) return 'starts later';
      if (end && end < today) return 'ended';
      return 'current';
    };
    for (const m of [...data.mandates].sort((a, b) => (a.starts_on < b.starts_on ? 1 : -1))) {
      const end = m.ended_on || m.ends_on;
      out.push(`- ${m.person_name}: ${m.position.replace('_', ' ')} (${state(m)}), ${m.starts_on}${end ? ` to ${end} (${rel(today, end)})` : ''}${m.appointed_by ? `; elected/appointed by ${m.appointed_by}` : ''}${m.access_removed_on ? `; board access removed ${m.access_removed_on}` : ''}${demo(m)}`);
    }
  }

  out.push('\n## DECISIONS (newest first)');
  for (const d of [...(data.decisions || [])].sort((a, b) => (a.decided_on < b.decided_on ? 1 : -1))) {
    const votes = d.votes_for !== null && d.votes_for !== undefined ? ` | votes ${d.votes_for}-${d.votes_against ?? '?'}-${d.votes_abstain ?? '?'}` : '';
    out.push(
      `- ${d.decided_on} ${d.title}${demo(d)} | by ${d.body} | ${d.decision}${d.rationale ? ` | why: ${d.rationale}` : ''}${votes} | status ${d.status}${d.status_note ? ` (${d.status_note})` : ''}${d.outcome_review ? ` | later review: ${d.outcome_review}` : ''}`
    );
  }

  out.push('\n## FOLLOW-UP TASKS');
  for (const t of data.tasks || []) {
    const open = ['not_started', 'in_progress', 'blocked'].includes(t.status);
    const overdue = open && t.due_date && t.due_date < today ? ' OVERDUE' : '';
    if (open && t.due_date) upcoming.push({ date: t.due_date, text: `task "${t.title}"${demo(t)} due` });
    out.push(
      `- ${t.title}${demo(t)} | status ${t.status}${overdue}${t.blocked_reason ? ` (${t.blocked_reason})` : ''} | due ${t.due_date || '-'}${t.due_date && open ? ` (${rel(today, t.due_date)})` : ''} | by ${t.executor_role}${t.executor_name ? ` ${t.executor_name}` : ''} | checked by ${t.supervisor_name || '-'} | resolution: ${dTitle[t.decision_id] || '-'}`
    );
  }

  out.push('\n## OBLIGATIONS CALENDAR');
  for (const o of data.obligations || []) {
    if (o.active) upcoming.push({ date: o.next_due_on, text: `obligation "${o.title}"${demo(o)} due` });
    out.push(`- ${o.title}${demo(o)} | ${o.category} | next due ${o.next_due_on} (${rel(today, o.next_due_on)})${o.active ? '' : ' (inactive)'} | repeats ${o.recurrence} | responsible ${o.responsible_name || '-'} | basis ${o.legal_basis || '-'}`);
  }

  out.push('\n## MEETINGS');
  const itemsBy = {};
  for (const i of data.meetingItems || []) (itemsBy[i.meeting_id] ||= []).push(i);
  for (const m of data.meetings || []) {
    if (m.status === 'planned') upcoming.push({ date: m.meeting_on, text: `meeting "${m.title}"${demo(m)}` });
    out.push(`- ${m.meeting_on} (${rel(today, m.meeting_on)}) ${m.title}${demo(m)} | ${m.body} | ${m.status} | invitation sent ${m.invitation_sent_on || '-'}`);
    for (const i of (itemsBy[m.id] || []).sort((a, b) => a.position - b.position)) {
      out.push(`   ${i.position}. ${i.title}${i.outcome ? ` → ${i.outcome}` : ''}`);
    }
  }

  // Hotová časová os, aby model nemusel počítať dátumy.
  out.push('\n## DATES ALREADY CALCULATED (overdue items and the next 180 days, sorted)');
  const horizon = addDays(today, 180);
  for (const u of upcoming.filter((x) => x.date <= horizon).sort((a, b) => (a.date < b.date ? -1 : 1))) {
    out.push(`- ${u.date} (${rel(today, u.date)}): ${u.text}${u.date < today ? ' — PAST' : ''}`);
  }

  // Faktúry: súhrny namiesto stoviek riadkov.
  // Súhrn faktúr po rokoch (počty a sumy sú spočítané tu, nie modelom).
  const lastInvoice = (data.invoices || []).reduce((mx, i) => (i.invoice_date && i.invoice_date > mx ? i.invoice_date : mx), '');
  out.push('\n## INVOICE DATA COVERAGE');
  out.push(
    lastInvoice
      ? `Invoices are recorded up to ${lastInvoice} (${rel(today, lastInvoice)}). Invoice data comes from the administrator's monthly export and arrives about one month late, so the most recent weeks may be missing.`
      : 'No invoices are recorded yet.'
  );

  if ((data.budgets || []).length || (data.reserveMovements || []).length) {
    out.push('\n## BUDGET BY CATEGORY AND RESERVE FUND (already calculated; ordinary-budget invoices only)');
    for (const b of data.budgets || []) {
      const lines = (data.budgetLines || []).filter((l) => l.budget_id === b.id);
      const st = budgetStatus({ budget: b, lines, invoices: data.invoices || [] });
      out.push(`- ${b.title} (${b.year})${demo(b)}: approved total ${money(b.total_amount)} EUR${b.approved_on ? `, approved ${b.approved_on}` : ''}${b.decision_id && dTitle[b.decision_id] ? ` (decision "${dTitle[b.decision_id]}")` : ''}. Invoiced so far ${money(st.actualTotal)} EUR${st.totalPct !== null ? ` (${Math.round(st.totalPct * 100)}% of the total)` : ''}${st.coverageDate ? `, invoice data up to ${st.coverageDate}` : ''}. Not yet allocated to categories: ${money(st.unallocated)} EUR.`);
      for (const r of st.rows) {
        const planned = r.status === 'unplanned' ? 'no budget line' : `budget ${money(r.planned)} EUR`;
        out.push(`  - ${r.category}: ${planned}; invoiced ${money(r.actual)} EUR (${r.count} invoices)${r.pct !== null ? `, ${Math.round(r.pct * 100)}% used` : ''}${r.projection !== null ? `; full-year pace ${money(r.projection)} EUR` : ''}; status ${r.status.replace('_', ' ').toUpperCase()}${r.isDemo ? ' [DEMO]' : ''}`);
      }
    }
    const latest = (data.budgets || []).slice().sort((a, b) => b.year - a.year)[0];
    const rs = reserveStatus({ movements: data.reserveMovements || [], reserveInvoices: (data.invoices || []).filter((i) => i.funding_source === 'reserve_fund'), budget: latest });
    if (rs.hasData) {
      out.push(`- Reserve fund balance per records: ${money(rs.balance)} EUR; legal minimum ${rs.minimum !== null ? `${money(rs.minimum)} EUR` : 'unknown'}${rs.belowMinimum ? ' — BELOW THE MINIMUM' : ''}.`);
      for (const m of [...(data.reserveMovements || [])].sort((a, b) => (a.moved_on < b.moved_on ? -1 : 1))) {
        out.push(`  - ${m.moved_on} ${m.kind.replace('_', ' ')} ${money(m.amount)} EUR${m.description ? ` — ${m.description}` : ''}${demo(m)}`);
      }
    }
  }

  {
    const prices = supplierPriceChanges(data.invoices || [], sName);
    const cats = categoryYearOnYear(data.invoices || []);
    if (prices.length || cats.rows.length) {
      out.push('\n## TRENDS (already calculated from invoices)');
      for (const p of prices) {
        out.push(`- Price ${p.name}: typical invoice ${money(p.from)} EUR in ${p.fromYear} → ${money(p.to)} EUR in ${p.toYear} (${p.change >= 0 ? '+' : ''}${Math.round(p.change * 1000) / 10}%)${p.annual ? ', one annual invoice' : ''}${p.flagged ? ' — NOTABLE RISE' : ''}`);
      }
      if (cats.windowEnd) out.push(`- Same period comparison, whole months (1 Jan – ${cats.windowEnd.slice(5)}), ${cats.year} vs ${cats.year - 1}, ordinary budget:`);
      for (const c of cats.rows) {
        out.push(`  - ${c.category}: ${money(c.now)} EUR vs ${money(c.before)} EUR${c.change !== null ? ` (${c.change >= 0 ? '+' : ''}${Math.round(c.change * 1000) / 10}%)` : ''}${c.flagged ? ' — NOTABLE RISE' : ''}`);
      }
    }
  }

  if ((data.cases || []).length) {
    out.push('\n## CLAIMS, DISPUTES, WARRANTY AND LEGAL CASES');
    for (const c of data.cases) {
      out.push(`- ${c.title}${demo(c)} | ${c.case_type} | ${c.status} | counterparty ${c.counterparty || sName[c.supplier_id] || '-'} | ref ${c.reference || '-'} | opened ${c.opened_on}${c.closed_on ? ` | closed ${c.closed_on}` : ''} | claimed ${c.amount_claimed !== null && c.amount_claimed !== undefined ? `${money(c.amount_claimed)} EUR` : '-'} | recovered ${c.amount_recovered !== null && c.amount_recovered !== undefined ? `${money(c.amount_recovered)} EUR` : '-'}${c.next_step ? ` | next step: ${c.next_step}${c.next_step_due ? ` by ${c.next_step_due} (${rel(today, c.next_step_due)})` : ''}` : ''}${c.responsible ? ` | responsible ${c.responsible}` : ''}`);
    }
  }

  out.push('\n## INVOICE TOTALS PER YEAR (incl. VAT, by invoice date; already calculated)');
  const byYear = {};
  for (const i of data.invoices || []) {
    const y = (i.invoice_date || '').slice(0, 4) || '?';
    const b = (byYear[y] ||= { n: 0, sum: 0, paidN: 0, paidSum: 0, openN: 0, openSum: 0 });
    const amt = Number(i.total_amount || 0);
    b.n += 1;
    b.sum += amt;
    if (i.payment_status === 'paid') {
      b.paidN += 1;
      b.paidSum += amt;
    } else {
      b.openN += 1;
      b.openSum += amt;
    }
  }
  for (const [y, b] of Object.entries(byYear).sort()) {
    out.push(`- ${y}${y === today.slice(0, 4) ? ` (year to date, until ${today})` : ''}: ${b.n} invoices, ${money(b.sum)} EUR | paid: ${b.paidN} invoices, ${money(b.paidSum)} EUR | not paid yet: ${b.openN} invoices, ${money(b.openSum)} EUR`);
  }

  out.push('\n## INVOICES — totals incl. VAT by supplier and year');
  const bySupYear = {};
  const byCatYear = {};
  for (const i of data.invoices || []) {
    const y = (i.invoice_date || '').slice(0, 4) || '?';
    const k1 = `${sName[i.supplier_id] || 'unknown supplier'}|${y}`;
    bySupYear[k1] = bySupYear[k1] || { n: 0, sum: 0, demo: i.is_demo };
    bySupYear[k1].n += 1;
    bySupYear[k1].sum += Number(i.total_amount || 0);
    const k2 = `${i.category}|${y}`;
    byCatYear[k2] = (byCatYear[k2] || 0) + Number(i.total_amount || 0);
  }
  for (const [k, v] of Object.entries(bySupYear).sort()) {
    const [s, y] = k.split('|');
    out.push(`- ${s} ${y}: ${v.n} invoices, ${money(v.sum)} EUR${v.demo ? ' [DEMO]' : ''}`);
  }
  out.push('\n## INVOICES — totals incl. VAT by category and year');
  for (const [k, v] of Object.entries(byCatYear).sort()) {
    const [c, y] = k.split('|');
    out.push(`- ${c} ${y}: ${money(v)} EUR`);
  }
  out.push('\n## INVOICES NEEDING ATTENTION');
  for (const i of data.invoices || []) {
    const late = i.payment_status === 'pending' && i.due_date && i.due_date < today;
    if ((i.is_urgent_unbudgeted && !i.ratified_by_decision_id) || ['overdue', 'disputed'].includes(i.payment_status) || late) {
      out.push(
        `- ${i.invoice_number || '-'} ${i.invoice_date} ${sName[i.supplier_id] || '-'} ${money(i.total_amount)} EUR | ${i.description || ''} | status ${i.payment_status}${i.is_urgent_unbudgeted ? ` | URGENT UNBUDGETED, ratified: ${i.ratified_by_decision_id ? 'yes' : 'NO'} (${i.urgency_reason || ''})` : ''}${demo(i)}`
      );
    }
  }
  return out.join('\n');
}
