// Memoria — mesačný report pre board (e-mail prvý pracovný deň v mesiaci).
// Čo sa za mesiac stalo, stav rozpočtu a rezervy, trendy a čo príde.
// Iba fakty zo záznamov; nič neodporúča.

import { escapeHtml } from './htmlEscape';
import { budgetStatus, reserveStatus } from './memoriaBudget';
import { supplierPriceChanges, categoryYearOnYear } from './memoriaTrends';

const OPEN_CASES = ['open', 'in_progress', 'waiting'];
const OPEN_TASKS = ['not_started', 'in_progress', 'blocked'];

const S = {
  en: {
    subject: 'Memoria · monthly report {month}', title: 'Monthly report', intro: 'What the records show for {month}.',
    decisions: 'Decisions recorded', tasksDone: 'Follow-up tasks completed', tasksOpen: '{n} tasks open, {o} overdue',
    invoices: 'Invoices dated {month}', invoicesLine: '{n} invoices, {sum}', coverage: 'Invoice data up to {date}; the administrator’s data arrives about one month late, so this month may still grow.',
    budget: 'Budget {year}', budgetLine: 'Invoiced {actual} of {total} ({pct})', over: 'Over budget', atRisk: 'May exceed at the current pace',
    reserve: 'Reserve fund: {balance} (legal minimum {minimum})', trends: 'Price changes and trends', priceLine: '{name}: {from} → {to} ({pct})', catLine: '{name}: {now} vs {before} in the same period last year ({pct})',
    cases: 'Claims and disputes', casesLine: '{open} open ({claimed} claimed); opened this month: {opened}; closed: {closed}',
    meetings: 'Meetings held', imports: 'Imports from the administrator', none: 'None.',
    open: 'Open Memoria', factsOnly: 'Facts from the records only. Every decision belongs to the board.', footer: 'You receive this because you are a member of the board. You can switch these emails off in Memoria → Board & mandates.',
    demoNote: 'This is a sample: records marked DEMO are fictional.',
  },
  es: {
    subject: 'Memoria · informe mensual {month}', title: 'Informe mensual', intro: 'Lo que muestran los registros de {month}.',
    decisions: 'Acuerdos registrados', tasksDone: 'Tareas de seguimiento terminadas', tasksOpen: '{n} tareas abiertas, {o} vencidas',
    invoices: 'Facturas con fecha de {month}', invoicesLine: '{n} facturas, {sum}', coverage: 'Facturas registradas hasta el {date}; los datos del administrador llegan con un mes de retraso, así que este mes aún puede crecer.',
    budget: 'Presupuesto {year}', budgetLine: 'Facturado {actual} de {total} ({pct})', over: 'Superado', atRisk: 'Podría superarse al ritmo actual',
    reserve: 'Fondo de reserva: {balance} (mínimo legal {minimum})', trends: 'Cambios de precio y tendencias', priceLine: '{name}: {from} → {to} ({pct})', catLine: '{name}: {now} frente a {before} en el mismo periodo del año pasado ({pct})',
    cases: 'Siniestros y disputas', casesLine: '{open} abiertos ({claimed} reclamados); abiertos este mes: {opened}; cerrados: {closed}',
    meetings: 'Reuniones celebradas', imports: 'Importaciones del administrador', none: 'Ninguno.',
    open: 'Abrir Memoria', factsOnly: 'Solo hechos de los registros. Toda decisión corresponde a la Junta.', footer: 'Recibe este email por ser miembro de la Junta. Puede desactivarlo en Memoria → Junta y mandatos.',
    demoNote: 'Es una prueba: los registros marcados DEMO son ficticios.',
  },
  fr: {
    subject: 'Memoria · rapport mensuel {month}', title: 'Rapport mensuel', intro: 'Ce que montrent les registres pour {month}.',
    decisions: 'Décisions enregistrées', tasksDone: 'Tâches de suivi terminées', tasksOpen: '{n} tâches ouvertes, {o} en retard',
    invoices: 'Factures datées de {month}', invoicesLine: '{n} factures, {sum}', coverage: 'Factures enregistrées jusqu’au {date} ; les données du syndic arrivent avec un mois de retard.',
    budget: 'Budget {year}', budgetLine: 'Facturé {actual} sur {total} ({pct})', over: 'Dépassé', atRisk: 'Risque de dépassement au rythme actuel',
    reserve: 'Fonds de réserve : {balance} (minimum légal {minimum})', trends: 'Évolutions de prix et tendances', priceLine: '{name} : {from} → {to} ({pct})', catLine: '{name} : {now} contre {before} sur la même période l’an dernier ({pct})',
    cases: 'Sinistres et litiges', casesLine: '{open} ouverts ({claimed} réclamés) ; ouverts ce mois : {opened} ; clos : {closed}',
    meetings: 'Réunions tenues', imports: 'Imports du syndic', none: 'Aucun.',
    open: 'Ouvrir Memoria', factsOnly: 'Uniquement des faits des registres. Toute décision revient au conseil.', footer: 'Vous recevez cet e-mail en tant que membre du conseil. Désactivable dans Memoria → Conseil et mandats.',
    demoNote: 'Ceci est un essai : les enregistrements marqués DÉMO sont fictifs.',
  },
  de: {
    subject: 'Memoria · Monatsbericht {month}', title: 'Monatsbericht', intro: 'Was die Aufzeichnungen für {month} zeigen.',
    decisions: 'Erfasste Beschlüsse', tasksDone: 'Erledigte Umsetzungsaufgaben', tasksOpen: '{n} offene Aufgaben, {o} überfällig',
    invoices: 'Rechnungen vom {month}', invoicesLine: '{n} Rechnungen, {sum}', coverage: 'Rechnungen erfasst bis {date}; die Daten des Verwalters kommen etwa einen Monat später.',
    budget: 'Budget {year}', budgetLine: 'Abgerechnet {actual} von {total} ({pct})', over: 'Überschritten', atRisk: 'Könnte beim aktuellen Tempo überschritten werden',
    reserve: 'Rücklage: {balance} (gesetzliches Minimum {minimum})', trends: 'Preisänderungen und Trends', priceLine: '{name}: {from} → {to} ({pct})', catLine: '{name}: {now} gegenüber {before} im gleichen Zeitraum des Vorjahres ({pct})',
    cases: 'Schäden und Streitfälle', casesLine: '{open} offen ({claimed} gefordert); diesen Monat eröffnet: {opened}; abgeschlossen: {closed}',
    meetings: 'Abgehaltene Sitzungen', imports: 'Importe vom Verwalter', none: 'Keine.',
    open: 'Memoria öffnen', factsOnly: 'Nur Fakten aus den Aufzeichnungen. Jede Entscheidung liegt beim Vorstand.', footer: 'Sie erhalten diese E-Mail als Vorstandsmitglied. Abschalten unter Memoria → Vorstand & Mandate.',
    demoNote: 'Dies ist eine Probe: mit DEMO markierte Einträge sind fiktiv.',
  },
};

const CAT = {
  en: { maintenance: 'Maintenance', repair: 'Repair', insurance: 'Insurance', utilities: 'Utilities', staff_cleaning: 'Staff / cleaning', gardening: 'Gardening', pools: 'Pools', security: 'Security', administration: 'Administration', legal: 'Legal', improvement: 'Improvements', other: 'Other' },
  es: { maintenance: 'Mantenimiento', repair: 'Reparaciones', insurance: 'Seguros', utilities: 'Suministros', staff_cleaning: 'Personal / limpieza', gardening: 'Jardinería', pools: 'Piscinas', security: 'Seguridad', administration: 'Administración', legal: 'Jurídico', improvement: 'Mejoras', other: 'Otros' },
  fr: { maintenance: 'Entretien', repair: 'Réparations', insurance: 'Assurance', utilities: 'Fournitures', staff_cleaning: 'Personnel / nettoyage', gardening: 'Jardins', pools: 'Piscines', security: 'Sécurité', administration: 'Administration', legal: 'Juridique', improvement: 'Améliorations', other: 'Autres' },
  de: { maintenance: 'Wartung', repair: 'Reparaturen', insurance: 'Versicherung', utilities: 'Versorgung', staff_cleaning: 'Personal / Reinigung', gardening: 'Gärten', pools: 'Pools', security: 'Sicherheit', administration: 'Verwaltung', legal: 'Recht', improvement: 'Verbesserungen', other: 'Sonstiges' },
};

function fill(t, v) {
  let out = t;
  for (const [k, x] of Object.entries(v || {})) out = out.replace(`{${k}}`, x);
  return out;
}

function money(x, lang) {
  const loc = { en: 'en-GB', es: 'es-ES', fr: 'fr-FR', de: 'de-DE' }[lang] || 'en-GB';
  return new Intl.NumberFormat(loc, { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(Number(x || 0));
}

function pct(x) {
  return `${x >= 0 ? '+' : ''}${Math.round(x * 100)} %`;
}

function monthName(ym, lang) {
  const [y, m] = ym.split('-').map(Number);
  const loc = { en: 'en-GB', es: 'es-ES', fr: 'fr-FR', de: 'de-DE' }[lang] || 'en-GB';
  return new Intl.DateTimeFormat(loc, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, 15)));
}

function fmtDate(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

// Predchádzajúci mesiac ku dňu 'YYYY-MM-DD' → 'YYYY-MM'
export function previousMonth(today) {
  const [y, m] = today.split('-').map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
}

// Prvý pracovný deň mesiaca (po–pi).
export function isFirstWorkingDay(today) {
  const [y, m, d] = today.split('-').map(Number);
  for (let day = 1; day <= 7; day++) {
    const wd = new Date(Date.UTC(y, m - 1, day)).getUTCDay();
    if (wd !== 0 && wd !== 6) return day === d;
  }
  return false;
}

// data: { decisions, tasks, invoices, meetings, cases, imports, budgets, budgetLines, reserveMovements, suppliers }
export function buildMonthly(data, month, today, { includeDemo = false } = {}) {
  const keep = (r) => includeDemo || !r.is_demo;
  const inMonth = (iso) => Boolean(iso) && iso.slice(0, 7) === month;
  const invoices = (data.invoices || []).filter(keep);
  const sName = Object.fromEntries((data.suppliers || []).map((s) => [s.id, s.name]));

  const monthInvoices = invoices.filter((i) => inMonth(i.invoice_date));
  const byCat = {};
  for (const i of monthInvoices) byCat[i.category || 'other'] = (byCat[i.category || 'other'] || 0) + Number(i.total_amount || 0);
  const coverageDate = invoices.reduce((mx, i) => (i.invoice_date && i.invoice_date > mx ? i.invoice_date : mx), '') || null;

  const year = Number(month.slice(0, 4));
  const budget = (data.budgets || []).filter(keep).find((b) => Number(b.year) === year) || null;
  const bs = budget ? budgetStatus({ budget, lines: (data.budgetLines || []).filter((l) => l.budget_id === budget.id && keep(l)), invoices }) : null;
  const rs = reserveStatus({
    movements: (data.reserveMovements || []).filter(keep),
    reserveInvoices: invoices.filter((i) => i.funding_source === 'reserve_fund'),
    budget: budget || (data.budgets || [])[0],
  });

  const tasks = (data.tasks || []).filter(keep);
  const cases = (data.cases || []).filter(keep);
  const openCases = cases.filter((c) => OPEN_CASES.includes(c.status));
  return {
    month,
    decisions: (data.decisions || []).filter(keep).filter((d) => inMonth(d.decided_on)).map((d) => ({ title: d.title, date: d.decided_on, isDemo: Boolean(d.is_demo) })),
    tasksDone: tasks.filter((t) => t.status === 'done' && inMonth(t.completed_on)).map((t) => ({ title: t.title, date: t.completed_on, isDemo: Boolean(t.is_demo) })),
    tasksOpen: tasks.filter((t) => OPEN_TASKS.includes(t.status)).length,
    tasksOverdue: tasks.filter((t) => OPEN_TASKS.includes(t.status) && t.due_date && t.due_date < today).length,
    invoiceCount: monthInvoices.length,
    invoiceSum: monthInvoices.reduce((s, i) => s + Number(i.total_amount || 0), 0),
    invoiceByCat: Object.entries(byCat).sort((a, b) => b[1] - a[1]),
    coverageDate,
    budget: budget ? { title: budget.title, total: Number(budget.total_amount), status: bs } : null,
    reserve: rs,
    prices: supplierPriceChanges(invoices, sName).filter((p) => p.flagged),
    categories: categoryYearOnYear(invoices).rows.filter((r) => r.flagged),
    meetings: (data.meetings || []).filter(keep).filter((m) => m.status === 'held' && inMonth(m.meeting_on)).map((m) => ({ title: m.title, date: m.meeting_on })),
    imports: (data.imports || []).filter(keep).filter((i) => inMonth((i.created_at || '').slice(0, 10))).map((i) => ({ file: i.file_name, n: i.rows_imported })),
    cases: {
      open: openCases.length,
      claimed: openCases.reduce((s, c) => s + Number(c.amount_claimed || 0), 0),
      opened: cases.filter((c) => inMonth(c.opened_on)).length,
      closed: cases.filter((c) => inMonth(c.closed_on)).length,
    },
  };
}

export function renderMonthly(report, { lang = 'en', appUrl = '', sample = false } = {}) {
  const s = S[lang] || S.en;
  const cat = CAT[lang] || CAT.en;
  const mName = monthName(report.month, lang);
  const sections = [];
  const list = (items) => (items.length ? items : [s.none]);

  sections.push([s.decisions, list(report.decisions.map((d) => `${fmtDate(d.date)} · ${d.title}${d.isDemo ? ' [DEMO]' : ''}`))]);
  sections.push([s.tasksDone, [...list(report.tasksDone.map((t) => `${fmtDate(t.date)} · ${t.title}${t.isDemo ? ' [DEMO]' : ''}`)), fill(s.tasksOpen, { n: report.tasksOpen, o: report.tasksOverdue })]]);
  sections.push([
    fill(s.invoices, { month: mName }),
    [
      fill(s.invoicesLine, { n: report.invoiceCount, sum: money(report.invoiceSum, lang) }),
      ...report.invoiceByCat.map(([c, v]) => `${cat[c] || c}: ${money(v, lang)}`),
      ...(report.coverageDate ? [fill(s.coverage, { date: fmtDate(report.coverageDate) })] : []),
    ],
  ]);
  if (report.budget) {
    const st = report.budget.status;
    const lines = [fill(s.budgetLine, { actual: money(st.actualTotal, lang), total: money(report.budget.total, lang), pct: `${Math.round((st.totalPct || 0) * 100)} %` })];
    for (const r of st.rows.filter((x) => x.status === 'over' || x.status === 'at_risk')) {
      lines.push(`${cat[r.category] || r.category}: ${money(r.actual, lang)} / ${money(r.planned, lang)} — ${r.status === 'over' ? s.over : s.atRisk}`);
    }
    if (report.reserve.hasData) lines.push(fill(s.reserve, { balance: money(report.reserve.balance, lang), minimum: report.reserve.minimum !== null ? money(report.reserve.minimum, lang) : '—' }));
    sections.push([fill(s.budget, { year: report.month.slice(0, 4) }), lines]);
  }
  const trendLines = [
    ...report.prices.map((p) => fill(s.priceLine, { name: p.name, from: money(p.from, lang), to: money(p.to, lang), pct: pct(p.change) })),
    ...report.categories.map((c) => fill(s.catLine, { name: cat[c.category] || c.category, now: money(c.now, lang), before: money(c.before, lang), pct: pct(c.change) })),
  ];
  if (trendLines.length) sections.push([s.trends, trendLines]);
  sections.push([s.cases, [fill(s.casesLine, { open: report.cases.open, claimed: money(report.cases.claimed, lang), opened: report.cases.opened, closed: report.cases.closed })]]);
  sections.push([s.meetings, list(report.meetings.map((m) => `${fmtDate(m.date)} · ${m.title}`))]);
  if (report.imports.length) sections.push([s.imports, report.imports.map((i) => `${i.file} (${i.n})`)]);

  const link = `${(appUrl || '').replace(/\/$/, '')}/admin/memoria`;
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;color:#2B3A44;font-size:14px;line-height:1.45;max-width:620px">
<h2 style="font-size:18px;color:#16364A;margin:0 0 4px 0">🧠 Memoria · ${escapeHtml(s.title)}</h2>
${sample ? `<p style="border:1px dashed #8A5A12;color:#8A5A12;padding:6px 10px;border-radius:6px">${escapeHtml(s.demoNote)}</p>` : ''}
<p style="margin:0 0 8px 0">${escapeHtml(fill(s.intro, { month: mName }))}</p>
${sections
  .map(
    ([h, lines]) =>
      `<h3 style="font-size:15px;color:#16364A;margin:18px 0 6px 0">${escapeHtml(h)}</h3><ul style="padding-left:18px;margin:0">${lines.map((l) => `<li style="margin:0 0 4px 0">${escapeHtml(l)}</li>`).join('')}</ul>`
  )
  .join('')}
<p style="margin:22px 0"><a href="${escapeHtml(link)}" style="background:#16364A;color:#F5F0E6;padding:10px 16px;border-radius:8px;text-decoration:none">${escapeHtml(s.open)}</a></p>
<p style="font-size:12px;color:#6A747B;margin:0 0 4px 0">${escapeHtml(s.factsOnly)}</p>
<p style="font-size:12px;color:#6A747B;margin:0">${escapeHtml(s.footer)}</p>
</div>`;
  const text = `Memoria · ${s.title}\n${sample ? `${s.demoNote}\n` : ''}${fill(s.intro, { month: mName })}\n\n${sections.map(([h, lines]) => `${h}\n${lines.map((l) => `- ${l}`).join('\n')}`).join('\n\n')}\n\n${s.open}: ${link}\n\n${s.factsOnly}\n${s.footer}`;
  return { subject: `${fill(s.subject, { month: mName })}${sample ? ' (DEMO)' : ''}`, html, text };
}
