// Memoria — podklady na zasadanie boardu za zvolené obdobie (jedným klikom).
// Čo sa stalo (rozhodnutia, úlohy, faktúry, platby, noví dodávatelia, licitácie, zmluvy, spory, zasadania),
// kde sme v rozpočte a čo príde. Iba fakty zo záznamov; nič neodporúča.

import { budgetStatus, reserveStatus } from './memoriaBudget';
import { supplierPriceChanges, categoryYearOnYear } from './memoriaTrends';
import { noticeBy } from './memoriaListExport';
import { mt, formatMoney } from './memoriaI18n';

const OPEN_TASKS = ['not_started', 'in_progress', 'blocked'];
const OPEN_CASES = ['open', 'in_progress', 'waiting'];
const round2 = (x) => Math.round(Number(x || 0) * 100) / 100;
const sum = (rows, f) => round2(rows.reduce((s, r) => s + Number(f(r) || 0), 0));

function addDays(iso, days) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// Predvolené obdobia pre podklady.
export function reportPresets(today, meetings = []) {
  const d = new Date(`${today}T00:00:00Z`);
  const iso = (x) => x.toISOString().slice(0, 10);
  const prevStart = iso(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1)));
  const prevEnd = iso(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 0)));
  const lastBoard = [...meetings]
    .filter((m) => m.body === 'board' && m.status === 'held' && m.meeting_on && m.meeting_on <= today)
    .sort((a, b) => (a.meeting_on < b.meeting_on ? 1 : -1))[0];
  return {
    sinceMeeting: lastBoard ? { from: addDays(lastBoard.meeting_on, 1), to: today, meeting: lastBoard } : null,
    lastMonth: { from: prevStart, to: prevEnd },
    last30: { from: iso(new Date(d.getTime() - 30 * 86400000)), to: today },
  };
}

// data: { decisions, tasks, invoices, suppliers, tenders, quotes, contracts, cases, meetings, obligations, budgets, budgetLines, reserveMovements }
export function buildBoardReport(data, { from, to, today, includeDemo = false }) {
  const keep = (r) => includeDemo || !r.is_demo;
  const inP = (iso) => Boolean(iso) && iso.slice(0, 10) >= from && iso.slice(0, 10) <= to;
  const L = (k) => (data[k] || []).filter(keep);
  const suppliers = L('suppliers');
  const sName = Object.fromEntries((data.suppliers || []).map((s) => [s.id, s.name]));
  const invoices = L('invoices');
  const tasks = L('tasks');
  const tenders = L('tenders');
  const quotes = L('quotes');
  const contracts = L('contracts');
  const cases = L('cases');
  const meetings = L('meetings');

  // Rozhodnutia
  const decisions = L('decisions')
    .filter((d) => inP(d.decided_on))
    .sort((a, b) => (a.decided_on < b.decided_on ? -1 : 1))
    .map((d) => ({ date: d.decided_on, title: d.title, body: d.body, decision: d.decision, status: d.status, isDemo: Boolean(d.is_demo) }));

  // Úlohy
  const openTasks = tasks.filter((t) => OPEN_TASKS.includes(t.status));
  const tasksDone = tasks.filter((t) => t.status === 'done' && inP(t.completed_on)).map((t) => ({ title: t.title, date: t.completed_on, who: t.executor_name, role: t.executor_role, isDemo: Boolean(t.is_demo) }));
  const tasksNew = tasks.filter((t) => inP(t.created_at)).length;
  const tasksOverdue = openTasks.filter((t) => t.due_date && t.due_date < today).sort((a, b) => (a.due_date < b.due_date ? -1 : 1)).map((t) => ({ title: t.title, due: t.due_date, who: t.executor_name, role: t.executor_role, isDemo: Boolean(t.is_demo) }));
  const tasksBlocked = openTasks.filter((t) => t.status === 'blocked').map((t) => ({ title: t.title, reason: t.blocked_reason, isDemo: Boolean(t.is_demo) }));

  // Faktúry a platby
  const dated = invoices.filter((i) => inP(i.invoice_date));
  const paid = invoices.filter((i) => i.payment_status === 'paid' && inP(i.paid_on));
  const byCat = {};
  for (const i of dated) byCat[i.category || 'other'] = round2((byCat[i.category || 'other'] || 0) + Number(i.total_amount || 0));
  const unpaid = invoices.filter((i) => ['pending', 'overdue'].includes(i.payment_status));
  const overdueUnpaid = unpaid.filter((i) => i.payment_status === 'overdue' || (i.due_date && i.due_date < today));
  const urgent = invoices.filter((i) => i.is_urgent_unbudgeted && !i.ratified_by_decision_id).map((i) => ({ supplier: sName[i.supplier_id] || '', number: i.invoice_number, total: Number(i.total_amount || 0), reason: i.urgency_reason, isDemo: Boolean(i.is_demo) }));
  const coverageDate = invoices.reduce((mx, i) => (i.invoice_date && i.invoice_date > mx ? i.invoice_date : mx), '') || null;

  // Rozpočet a rezerva (rok konca obdobia)
  const year = Number(to.slice(0, 4));
  const budget = L('budgets').find((b) => Number(b.year) === year) || null;
  const bs = budget ? budgetStatus({ budget, lines: L('budgetLines').filter((l) => l.budget_id === budget.id), invoices }) : null;
  const rs = reserveStatus({ movements: L('reserveMovements'), reserveInvoices: invoices.filter((i) => i.funding_source === 'reserve_fund'), budget: budget || L('budgets')[0] });

  // Dodávatelia, licitácie, zmluvy
  const newSuppliers = suppliers.filter((s) => inP(s.created_at)).map((s) => ({ name: s.name, category: s.category, conflictChecked: Boolean(s.conflict_of_interest_checked), isDemo: Boolean(s.is_demo) }));
  const quotesIn = quotes.filter((q) => inP(q.submitted_on || q.created_at));
  const tenderById = Object.fromEntries(tenders.map((t) => [t.id, t]));
  const openTenders = tenders.filter((t) => t.status === 'collecting').map((t) => ({ title: t.title, quotes: quotes.filter((q) => q.tender_id === t.id).length, isDemo: Boolean(t.is_demo) }));
  const newTenders = tenders.filter((t) => inP(t.opened_on || t.created_at)).map((t) => ({ title: t.title, status: t.status, isDemo: Boolean(t.is_demo) }));
  const newContracts = contracts.filter((c) => inP(c.signed_on || c.created_at)).map((c) => ({ subject: c.subject, supplier: sName[c.supplier_id] || '', amount: c.amount, frequency: c.payment_frequency, isDemo: Boolean(c.is_demo) }));
  const horizon = addDays(today, 60);
  const contractDeadlines = contracts
    .filter((c) => c.status === 'active')
    .map((c) => {
      const nb = noticeBy(c);
      if (nb && nb >= today && nb <= horizon) return { subject: c.subject, supplier: sName[c.supplier_id] || '', kind: 'notice', date: nb, isDemo: Boolean(c.is_demo) };
      if (!c.auto_renew && c.ends_on && c.ends_on >= today && c.ends_on <= horizon) return { subject: c.subject, supplier: sName[c.supplier_id] || '', kind: 'end', date: c.ends_on, isDemo: Boolean(c.is_demo) };
      return null;
    })
    .filter(Boolean)
    .sort((a, b) => (a.date < b.date ? -1 : 1));

  // Spory, zasadania, čo príde
  const openCases = cases.filter((c) => OPEN_CASES.includes(c.status));
  const upcoming = [
    ...L('obligations').filter((o) => o.active !== false && o.next_due_on && o.next_due_on >= today && o.next_due_on <= addDays(today, 30)).map((o) => ({ date: o.next_due_on, title: o.title, kind: 'obligation', isDemo: Boolean(o.is_demo) })),
    ...openTasks.filter((t) => t.due_date && t.due_date >= today && t.due_date <= addDays(today, 30)).map((t) => ({ date: t.due_date, title: t.title, kind: 'task', isDemo: Boolean(t.is_demo) })),
  ].sort((a, b) => (a.date < b.date ? -1 : 1));
  const nextMeeting = meetings.filter((m) => m.status === 'planned' && m.meeting_on >= today).sort((a, b) => (a.meeting_on < b.meeting_on ? -1 : 1))[0] || null;

  return {
    from, to, today, includeDemo,
    decisions,
    tasks: { done: tasksDone, newCount: tasksNew, open: openTasks.length, overdue: tasksOverdue, blocked: tasksBlocked },
    invoices: {
      count: dated.length, sum: sum(dated, (i) => i.total_amount),
      byCat: Object.entries(byCat).sort((a, b) => b[1] - a[1]),
      paidCount: paid.length, paidSum: sum(paid, (i) => i.total_amount),
      unpaidCount: unpaid.length, unpaidSum: sum(unpaid, (i) => i.total_amount),
      overdueCount: overdueUnpaid.length, overdueSum: sum(overdueUnpaid, (i) => i.total_amount),
      urgent, coverageDate,
    },
    budget: budget ? { title: budget.title, year, total: Number(budget.total_amount), status: bs } : null,
    reserve: rs,
    trends: {
      prices: supplierPriceChanges(invoices, sName).filter((p) => p.flagged),
      categories: categoryYearOnYear(invoices).rows.filter((r) => r.flagged),
    },
    suppliers: newSuppliers,
    tenders: { new: newTenders, open: openTenders, quotesIn: quotesIn.length, quotesInTenders: [...new Set(quotesIn.map((q) => tenderById[q.tender_id]?.title).filter(Boolean))] },
    contracts: { new: newContracts, deadlines: contractDeadlines },
    cases: {
      open: openCases.length,
      claimed: sum(openCases, (c) => c.amount_claimed),
      opened: cases.filter((c) => inP(c.opened_on)).map((c) => ({ title: c.title, type: c.case_type, isDemo: Boolean(c.is_demo) })),
      closed: cases.filter((c) => inP(c.closed_on)).map((c) => ({ title: c.title, status: c.status, recovered: Number(c.amount_recovered || 0), isDemo: Boolean(c.is_demo) })),
      nextSteps: openCases.filter((c) => c.next_step).sort((a, b) => ((a.next_step_due || '9') < (b.next_step_due || '9') ? -1 : 1)).map((c) => ({ title: c.title, step: c.next_step, due: c.next_step_due, isDemo: Boolean(c.is_demo) })),
    },
    meetings: { held: meetings.filter((m) => m.status === 'held' && inP(m.meeting_on)).map((m) => ({ title: m.title, date: m.meeting_on })), next: nextMeeting ? { title: nextMeeting.title, date: nextMeeting.meeting_on } : null },
    upcoming,
  };
}

// ---- Zobrazenie: sekcie s riadkami (spoločné pre obrazovku, text do e-mailu a Excel) ----

const pctText = (x) => (x === null || x === undefined ? '—' : `${x >= 0 ? '+' : ''}${Math.round(x * 100)} %`);
const d = (iso, lang) => {
  if (!iso) return '—';
  const [y, m, dd] = iso.slice(0, 10).split('-');
  return lang === 'en' ? `${dd}/${m}/${y}` : lang === 'de' ? `${dd}.${m}.${y}` : `${dd}/${m}/${y}`;
};

// Vráti { heading, kpis:[{value,label}], sections:[{title, lines:[{text, level, demo, tone}]}], footer }
export function reportSections(r, lang) {
  const t = (k, v) => mt(lang, k, v);
  const money = (x) => formatMoney(x, 'EUR', lang);
  const line = (text, o = {}) => ({ text, level: o.level || 0, demo: Boolean(o.demo), tone: o.tone || null });
  const head = (text) => line(text, { level: -1 });
  const none = () => line(t('brNone'), { tone: 'muted' });
  const who = (x) => [x.role ? t(`role_${x.role}`) : null, x.who].filter(Boolean).join(': ');
  const S = [];

  S.push({ title: t('brS1'), lines: r.decisions.length ? r.decisions.map((x) => line(`${d(x.date, lang)} · ${x.title}${x.body ? ` (${t(`body_${x.body}`)})` : ''}${x.decision ? ` — ${x.decision}` : ''}`, { demo: x.isDemo })) : [none()] });

  const tk = r.tasks;
  S.push({
    title: t('brS2'),
    lines: [
      line(t('brTasksLine', { open: tk.open, new: tk.newCount })),
      head(t('brCompleted', { n: tk.done.length })),
      ...(tk.done.length ? tk.done.map((x) => line(`${d(x.date, lang)} · ${x.title}${who(x) ? ` — ${who(x)}` : ''}`, { level: 1, demo: x.isDemo })) : [line(t('brNone'), { level: 1, tone: 'muted' })]),
      head(t('brOverdue', { n: tk.overdue.length })),
      ...(tk.overdue.length ? tk.overdue.map((x) => line(`${x.title} — ${t('brDueOn', { date: d(x.due, lang) })}${who(x) ? ` · ${who(x)}` : ''}`, { level: 1, demo: x.isDemo, tone: 'red' })) : [line(t('brNone'), { level: 1, tone: 'muted' })]),
      ...(tk.blocked.length ? [head(t('brBlocked', { n: tk.blocked.length })), ...tk.blocked.map((x) => line(`${x.title}${x.reason ? ` — ${x.reason}` : ''}`, { level: 1, demo: x.isDemo, tone: 'red' }))] : []),
    ],
  });

  const iv = r.invoices;
  S.push({
    title: t('brS3'),
    lines: [
      line(t('brInvDated', { n: iv.count, sum: money(iv.sum) })),
      line(t('brInvPaid', { n: iv.paidCount, sum: money(iv.paidSum) })),
      line(t('brInvUnpaid', { n: iv.unpaidCount, sum: money(iv.unpaidSum), o: iv.overdueCount, osum: money(iv.overdueSum) }), { tone: iv.overdueCount ? 'red' : null }),
      ...(iv.byCat.length ? [head(t('brByCategory')), ...iv.byCat.map(([c, v]) => line(`${t(`invcat_${c}`)}: ${money(v)}`, { level: 1 }))] : []),
      ...(iv.urgent.length ? [head(t('brUrgent')), ...iv.urgent.map((x) => line(`${x.supplier} ${x.number || ''} · ${money(x.total)}${x.reason ? ` — ${x.reason}` : ''}`, { level: 1, demo: x.isDemo, tone: 'red' }))] : []),
      ...(iv.coverageDate ? [line(t('brCoverage', { date: d(iv.coverageDate, lang) }), { tone: 'muted' })] : []),
    ],
  });

  const year = Number(r.to.slice(0, 4));
  const bl = [];
  if (r.budget?.status) {
    const st = r.budget.status;
    bl.push(line(`${r.budget.title}: ${t('brBudgetLine', { actual: money(st.actualTotal), total: money(r.budget.total), pct: st.totalPct === null ? '—' : `${Math.round(st.totalPct * 100)} %` })}`));
    const bad = st.rows.filter((x) => x.status !== 'ok');
    if (bad.length) bad.forEach((x) => bl.push(line(`${t(`invcat_${x.category}`)}: ${money(x.actual)} / ${money(x.planned)} — ${t(`bs_${x.status}`)}`, { level: 1, tone: x.status === 'over' ? 'red' : 'orange' })));
    else bl.push(line(t('brBudgetOk'), { level: 1 }));
  } else {
    bl.push(line(t('brBudgetNone', { year }), { tone: 'muted' }));
  }
  if (r.reserve?.hasData) bl.push(line(t('brReserve', { balance: money(r.reserve.balance), minimum: r.reserve.minimum === null ? '—' : money(r.reserve.minimum) }), { tone: r.reserve.belowMinimum ? 'red' : null }));
  if (r.trends.prices.length || r.trends.categories.length) {
    bl.push(head(t('brTrends')));
    r.trends.prices.forEach((p) => bl.push(line(t('brPriceLine', { name: p.name, from: money(p.from), to: money(p.to), pct: pctText(p.change) }), { level: 1, tone: 'orange' })));
    r.trends.categories.forEach((c) => bl.push(line(t('brCatLine', { name: t(`invcat_${c.category}`), now: money(c.now), before: money(c.before), pct: pctText(c.change) }), { level: 1, tone: 'orange' })));
  }
  S.push({ title: t('brS4', { year }), lines: bl });

  S.push({ title: t('brS5'), lines: r.suppliers.length ? r.suppliers.map((x) => line(`${x.name} (${t(`cat_${x.category}`)}) — ${x.conflictChecked ? t('brConflictOk') : t('brConflictNo')}`, { demo: x.isDemo, tone: x.conflictChecked ? null : 'orange' })) : [none()] });

  const tn = r.tenders;
  S.push({
    title: t('brS6'),
    lines: [
      line(t('brQuotesIn', { n: tn.quotesIn }) + (tn.quotesInTenders.length ? ` (${tn.quotesInTenders.join(', ')})` : '')),
      ...(tn.new.length ? [head(t('brNewTenders')), ...tn.new.map((x) => line(`${x.title} — ${t(`tenderStatus_${x.status}`)}`, { level: 1, demo: x.isDemo }))] : []),
      head(t('brOpenTenders')),
      ...(tn.open.length ? tn.open.map((x) => line(`${x.title} — ${t('brQuotesN', { n: x.quotes })}`, { level: 1, demo: x.isDemo, tone: x.quotes < 2 ? 'orange' : null })) : [line(t('brNone'), { level: 1, tone: 'muted' })]),
    ],
  });

  const ct = r.contracts;
  S.push({
    title: t('brS7'),
    lines: [
      head(t('brNewContracts')),
      ...(ct.new.length ? ct.new.map((x) => line(`${x.subject} — ${x.supplier}${x.amount ? ` · ${money(x.amount)}${x.frequency ? ` / ${t(`freq_${x.frequency}`)}` : ''}` : ''}`, { level: 1, demo: x.isDemo })) : [line(t('brNone'), { level: 1, tone: 'muted' })]),
      head(t('brDeadlines60')),
      ...(ct.deadlines.length ? ct.deadlines.map((x) => line(`${x.subject} — ${x.supplier}: ${x.kind === 'notice' ? t('brNoticeBy', { date: d(x.date, lang) }) : t('brEndsOn', { date: d(x.date, lang) })}`, { level: 1, demo: x.isDemo, tone: 'orange' })) : [line(t('brNone'), { level: 1, tone: 'muted' })]),
    ],
  });

  const cs = r.cases;
  S.push({
    title: t('brS8'),
    lines: [
      line(t('brCasesLine', { open: cs.open, claimed: money(cs.claimed) })),
      ...(cs.opened.length ? [head(t('brOpened')), ...cs.opened.map((x) => line(`${x.title} (${t(`ct_${x.type}`)})`, { level: 1, demo: x.isDemo }))] : []),
      ...(cs.closed.length ? [head(t('brClosed')), ...cs.closed.map((x) => line(`${x.title}${x.recovered ? ` — ${money(x.recovered)}` : ''}`, { level: 1, demo: x.isDemo }))] : []),
      ...(cs.nextSteps.length ? [head(t('brNextSteps')), ...cs.nextSteps.map((x) => line(`${x.title}: ${x.step}${x.due ? ` — ${d(x.due, lang)}` : ''}`, { level: 1, demo: x.isDemo, tone: x.due && x.due < r.today ? 'red' : null }))] : []),
    ],
  });

  S.push({
    title: t('brS9'),
    lines: [
      head(t('brHeld')),
      ...(r.meetings.held.length ? r.meetings.held.map((x) => line(`${d(x.date, lang)} · ${x.title}`, { level: 1 })) : [line(t('brNone'), { level: 1, tone: 'muted' })]),
      ...(r.meetings.next ? [line(t('brNextMeeting', { title: r.meetings.next.title, date: d(r.meetings.next.date, lang) }))] : []),
      head(t('brUpcoming')),
      ...(r.upcoming.length ? r.upcoming.map((x) => line(`${d(x.date, lang)} · ${x.title}`, { level: 1, demo: x.isDemo })) : [line(t('brNone'), { level: 1, tone: 'muted' })]),
    ],
  });

  return {
    heading: t('brHeading', { from: d(r.from, lang), to: d(r.to, lang) }),
    generated: t('brGenerated', { date: d(r.today, lang) }),
    kpis: [
      { value: r.decisions.length, label: t('brKpiDecisions') },
      { value: r.tasks.done.length, label: t('brKpiTasksDone') },
      { value: `${r.invoices.count} · ${money(r.invoices.sum)}`, label: t('brKpiInvoices') },
      { value: `${r.invoices.paidCount} · ${money(r.invoices.paidSum)}`, label: t('brKpiPaid') },
      { value: r.suppliers.length, label: t('brKpiSuppliers') },
    ],
    sections: S,
    footer: t('brFooter'),
  };
}

// Obyčajný text (do e-mailu / Wordu).
export function reportText(view) {
  const out = [view.heading, view.generated, '', view.kpis.map((k) => `${k.value} ${k.label}`).join(' · '), ''];
  for (const s of view.sections) {
    out.push(s.title.toUpperCase());
    for (const l of s.lines) {
      const demo = l.demo ? ' [DEMO]' : '';
      if (l.level === -1) out.push(`  ${l.text}`);
      else out.push(`${l.level ? '     • ' : '  • '}${l.text}${demo}`);
    }
    out.push('');
  }
  out.push(view.footer);
  return out.join('\n');
}
