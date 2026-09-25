// Memoria — poskladá kompaktný textový prehľad záznamov pre AI („Opýtaj sa Memorie“).
// Čisté funkcie bez prístupu k sieti, aby sa dali testovať.

// Stručné pravidlá zo stanov a zákona (zdroj: Estatutos 2007, LPH; overené v projekte Memoria).
export const GOVERNANCE_RULES = `
- Junta General (owners' meeting): highest body; approves accounts, budget, extraordinary levies, reserve fund use, election of president/vice-president/3 vocals/administrator; invitation min. 15 days before (Statutes art. XX); minutes closed within 10 days (LPH art. 19).
- Junta Directiva (board: president, vice-president, 3 vocals, 1-year mandate, unpaid): decides matters brought by the administrator or president (except those reserved to the Junta General); approves the agenda of general meetings; oversees the president, vice-president and administrator and supervises that resolutions are carried out (art. XXII.4); ratifies urgent unbudgeted expenses (art. XXX); approves exterior changes, awnings, signs (art. XIV). Meetings: convened by the president or half+1 of members, min. 8 days notice, quorum 3, majority decides, president's casting vote (art. XXII.5).
- President (art. XXIII): convenes and chairs meetings, represents the community, requests accounts from the administrator, may suspend a board resolution he considers contrary to the statutes (re-vote at next ordinary meeting or general meeting within 1 month), decides insurance cover (art. XXXIV), can appoint lawyers and sue debtors.
- Administrator (art. XXVI–XXVII): administration, accounts, executes resolutions, signs maintenance and supply contracts, works under the president's supervision; budget proposal to the president 8 weeks before the ordinary general meeting (art. XVII).
- Urgent unbudgeted expense: may be approved temporarily by president + administrator jointly, then must be ratified by the board (art. XXX).
- AGM 2026 resolution 6g: suppliers must not be owners, the administrator or companies linked to them (conflict of interest check).
- Reserve fund: at least 10% of the annual budget (LPH art. 9.1.f).
`.trim();

function money(n) {
  if (n === null || n === undefined || n === '') return '-';
  return `${Number(n).toFixed(2)}`;
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
  for (const c of data.contracts || []) {
    const notice = c.auto_renew && c.ends_on && c.notice_period_days !== null ? ` | notice ${c.notice_period_days} days` : '';
    out.push(
      `- ${c.subject}${demo(c)} | supplier ${sName[c.supplier_id] || '-'} | status ${c.status} | ${c.starts_on || '?'} to ${c.ends_on || 'open'}${c.auto_renew ? ' | auto-renews' : ''}${notice} | ${money(c.amount)} ${c.currency} ${c.payment_frequency || ''} | tender: ${c.tender_id ? 'yes' : 'NONE'} | approved by: ${dTitle[c.approved_by_decision_id] || '-'} | signed by ${c.signed_by || '-'}${c.notes ? ` | ${c.notes}` : ''}`
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

  out.push('\n## DECISIONS (newest first)');
  for (const d of [...(data.decisions || [])].sort((a, b) => (a.decided_on < b.decided_on ? 1 : -1))) {
    const votes = d.votes_for !== null && d.votes_for !== undefined ? ` | votes ${d.votes_for}-${d.votes_against ?? '?'}-${d.votes_abstain ?? '?'}` : '';
    out.push(
      `- ${d.decided_on} ${d.title}${demo(d)} | by ${d.body} | ${d.decision}${d.rationale ? ` | why: ${d.rationale}` : ''}${votes} | status ${d.status}${d.status_note ? ` (${d.status_note})` : ''}${d.outcome_review ? ` | later review: ${d.outcome_review}` : ''}`
    );
  }

  out.push('\n## FOLLOW-UP TASKS');
  for (const t of data.tasks || []) {
    const overdue = ['not_started', 'in_progress', 'blocked'].includes(t.status) && t.due_date && t.due_date < today ? ' OVERDUE' : '';
    out.push(
      `- ${t.title}${demo(t)} | status ${t.status}${overdue}${t.blocked_reason ? ` (${t.blocked_reason})` : ''} | due ${t.due_date || '-'} | by ${t.executor_role}${t.executor_name ? ` ${t.executor_name}` : ''} | checked by ${t.supervisor_name || '-'} | resolution: ${dTitle[t.decision_id] || '-'}`
    );
  }

  out.push('\n## OBLIGATIONS CALENDAR');
  for (const o of data.obligations || []) {
    out.push(`- ${o.title}${demo(o)} | ${o.category} | next due ${o.next_due_on}${o.active ? '' : ' (inactive)'} | repeats ${o.recurrence} | responsible ${o.responsible_name || '-'} | basis ${o.legal_basis || '-'}`);
  }

  out.push('\n## MEETINGS');
  const itemsBy = {};
  for (const i of data.meetingItems || []) (itemsBy[i.meeting_id] ||= []).push(i);
  for (const m of data.meetings || []) {
    out.push(`- ${m.meeting_on} ${m.title}${demo(m)} | ${m.body} | ${m.status} | invitation sent ${m.invitation_sent_on || '-'}`);
    for (const i of (itemsBy[m.id] || []).sort((a, b) => a.position - b.position)) {
      out.push(`   ${i.position}. ${i.title}${i.outcome ? ` → ${i.outcome}` : ''}`);
    }
  }

  // Faktúry: súhrny namiesto stoviek riadkov.
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
