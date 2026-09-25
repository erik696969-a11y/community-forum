// Memoria — e-mailové pripomienky pre board.
// Týždenný súhrn (pondelok) a denné upozornenie iba v „míľnikoch“
// (7 dní, 1 deň, dnes, prvý deň po termíne; pri výpovedi zmluvy aj 30 a 14 dní).
// Iba fakty zo záznamov — nič neodporúča a nič nerozhoduje (princíp MIA).

import { mandateChecks } from './memoriaMandates';
import { escapeHtml } from './htmlEscape';

const INVITATION_LEAD_DAYS = { board: 8, general_ordinary: 15, general_extraordinary: 15 };
const MINUTES_DAYS = 10;
const OPEN_TASK = ['not_started', 'in_progress', 'blocked'];
const DAILY_MILESTONES = [7, 1, 0, -1];
const NOTICE_MILESTONES = [30, 14, 7, 1, 0, -1];

function addDays(iso, days) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

export function daysBetweenIso(from, to) {
  const [ay, am, ad] = from.split('-').map(Number);
  const [by, bm, bd] = to.split('-').map(Number);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86400000);
}

export const DIGEST_STRINGS = {
  en: {
    subjectWeekly: 'Memoria · weekly summary for the board',
    subjectDaily: 'Memoria · deadlines that need attention',
    introWeekly: 'What the records show for the week starting {date}.',
    introDaily: 'These deadlines reached a reminder point today ({date}).',
    overdue: 'Overdue',
    soon: 'Next 30 days',
    waiting: 'Waiting for the board',
    nothing: 'Nothing overdue or due in the next 30 days.',
    open: 'Open Memoria',
    footer: 'You receive this because you are a member of the board. You can switch these emails off in Memoria → Board & mandates.',
    factsOnly: 'Facts from the records only. Every decision belongs to the board.',
    demo: 'DEMO',
    demoNote: 'This is a sample: records marked DEMO are fictional.',
    today: 'today',
    inDays: 'in {n} days',
    inDay: 'tomorrow',
    daysAgo: '{n} days overdue',
    dayAgo: '1 day overdue',
    task: 'Task: {name}',
    obligation: '{name}',
    contract_notice: 'Last day to give notice: {name}',
    contract_end: 'Contract ends: {name}',
    meeting_invitation: 'Send the invitation: {name}',
    meeting_minutes: 'Close the minutes: {name}',
    invoice_unratified: 'Urgent expense to ratify: {name}',
    mandate_ending: 'Mandate ends: {name}',
    leftover_access: 'Mandate ended but board access remains: {name}',
    no_mandate: 'Board access without a recorded mandate: {name}',
  },
  es: {
    subjectWeekly: 'Memoria · resumen semanal para la Junta',
    subjectDaily: 'Memoria · plazos que requieren atención',
    introWeekly: 'Lo que muestran los registros para la semana que empieza el {date}.',
    introDaily: 'Estos plazos han llegado hoy ({date}) a un punto de aviso.',
    overdue: 'Vencido',
    soon: 'Próximos 30 días',
    waiting: 'Pendiente de la Junta',
    nothing: 'Nada vencido ni con plazo en los próximos 30 días.',
    open: 'Abrir Memoria',
    footer: 'Recibe este email por ser miembro de la Junta. Puede desactivarlo en Memoria → Junta y mandatos.',
    factsOnly: 'Solo hechos de los registros. Toda decisión corresponde a la Junta.',
    demo: 'DEMO',
    demoNote: 'Es una prueba: los registros marcados DEMO son ficticios.',
    today: 'hoy',
    inDays: 'en {n} días',
    inDay: 'mañana',
    daysAgo: '{n} días de retraso',
    dayAgo: '1 día de retraso',
    task: 'Tarea: {name}',
    obligation: '{name}',
    contract_notice: 'Último día para comunicar la baja: {name}',
    contract_end: 'Fin del contrato: {name}',
    meeting_invitation: 'Enviar la convocatoria: {name}',
    meeting_minutes: 'Cerrar el acta: {name}',
    invoice_unratified: 'Gasto urgente pendiente de ratificar: {name}',
    mandate_ending: 'Fin de mandato: {name}',
    leftover_access: 'Mandato terminado pero con acceso de Junta: {name}',
    no_mandate: 'Acceso de Junta sin mandato registrado: {name}',
  },
  fr: {
    subjectWeekly: 'Memoria · résumé hebdomadaire pour le conseil',
    subjectDaily: 'Memoria · échéances à surveiller',
    introWeekly: 'Ce que montrent les registres pour la semaine du {date}.',
    introDaily: 'Ces échéances ont atteint aujourd’hui ({date}) un point de rappel.',
    overdue: 'En retard',
    soon: '30 prochains jours',
    waiting: 'En attente du conseil',
    nothing: 'Rien en retard ni à échéance dans les 30 prochains jours.',
    open: 'Ouvrir Memoria',
    footer: 'Vous recevez cet e-mail en tant que membre du conseil. Vous pouvez le désactiver dans Memoria → Conseil et mandats.',
    factsOnly: 'Uniquement des faits des registres. Toute décision revient au conseil.',
    demo: 'DÉMO',
    demoNote: 'Ceci est un essai : les enregistrements marqués DÉMO sont fictifs.',
    today: 'aujourd’hui',
    inDays: 'dans {n} jours',
    inDay: 'demain',
    daysAgo: '{n} jours de retard',
    dayAgo: '1 jour de retard',
    task: 'Tâche : {name}',
    obligation: '{name}',
    contract_notice: 'Dernier jour pour résilier : {name}',
    contract_end: 'Fin du contrat : {name}',
    meeting_invitation: 'Envoyer la convocation : {name}',
    meeting_minutes: 'Clore le procès-verbal : {name}',
    invoice_unratified: 'Dépense urgente à ratifier : {name}',
    mandate_ending: 'Fin de mandat : {name}',
    leftover_access: 'Mandat terminé mais accès du conseil maintenu : {name}',
    no_mandate: 'Accès du conseil sans mandat enregistré : {name}',
  },
  de: {
    subjectWeekly: 'Memoria · Wochenübersicht für den Vorstand',
    subjectDaily: 'Memoria · Fristen, die Aufmerksamkeit brauchen',
    introWeekly: 'Was die Aufzeichnungen für die Woche ab {date} zeigen.',
    introDaily: 'Diese Fristen haben heute ({date}) einen Erinnerungspunkt erreicht.',
    overdue: 'Überfällig',
    soon: 'Nächste 30 Tage',
    waiting: 'Wartet auf den Vorstand',
    nothing: 'Nichts überfällig und nichts fällig in den nächsten 30 Tagen.',
    open: 'Memoria öffnen',
    footer: 'Sie erhalten diese E-Mail als Vorstandsmitglied. Abschalten unter Memoria → Vorstand & Mandate.',
    factsOnly: 'Nur Fakten aus den Aufzeichnungen. Jede Entscheidung liegt beim Vorstand.',
    demo: 'DEMO',
    demoNote: 'Dies ist eine Probe: mit DEMO markierte Einträge sind fiktiv.',
    today: 'heute',
    inDays: 'in {n} Tagen',
    inDay: 'morgen',
    daysAgo: '{n} Tage überfällig',
    dayAgo: '1 Tag überfällig',
    task: 'Aufgabe: {name}',
    obligation: '{name}',
    contract_notice: 'Letzter Tag für die Kündigung: {name}',
    contract_end: 'Vertrag endet: {name}',
    meeting_invitation: 'Einladung versenden: {name}',
    meeting_minutes: 'Protokoll abschließen: {name}',
    invoice_unratified: 'Dringende Ausgabe zur Genehmigung: {name}',
    mandate_ending: 'Mandat endet: {name}',
    leftover_access: 'Mandat beendet, Vorstandszugang besteht noch: {name}',
    no_mandate: 'Vorstandszugang ohne erfasstes Mandat: {name}',
  },
};

function fill(text, vars) {
  let out = text;
  for (const [k, v] of Object.entries(vars || {})) out = out.replace(`{${k}}`, v);
  return out;
}

// Všetky položky, ktoré si vyžadujú pozornosť, s dátumom (ak ho majú).
// data: { tasks, obligations, contracts, meetings, invoices, mandates, profiles }
export function collectDigestItems(data, today, { includeDemo = false } = {}) {
  const items = [];
  const keep = (r) => includeDemo || !r.is_demo;
  const soonLimit = addDays(today, 30);

  for (const t of (data.tasks || []).filter(keep)) {
    if (!OPEN_TASK.includes(t.status) || !t.due_date) continue;
    if (t.due_date <= soonLimit) items.push({ kind: 'task', name: t.title, date: t.due_date, isDemo: Boolean(t.is_demo) });
  }
  for (const o of (data.obligations || []).filter(keep)) {
    if (o.active === false || !o.next_due_on) continue;
    const window = addDays(today, Math.max(30, Number(o.remind_days ?? 30)));
    if (o.next_due_on <= window) items.push({ kind: 'obligation', name: o.title, date: o.next_due_on, isDemo: Boolean(o.is_demo) });
  }
  for (const c of (data.contracts || []).filter(keep)) {
    if (c.status !== 'active' || !c.ends_on) continue;
    if (c.auto_renew && c.notice_period_days !== null && c.notice_period_days !== undefined) {
      const deadline = addDays(c.ends_on, -Number(c.notice_period_days || 0));
      if (deadline >= addDays(today, -1) && deadline <= addDays(today, 60)) {
        items.push({ kind: 'contract_notice', name: c.subject, date: deadline, isDemo: Boolean(c.is_demo) });
      }
    } else if (c.ends_on <= addDays(today, 60)) {
      items.push({ kind: 'contract_end', name: c.subject, date: c.ends_on, isDemo: Boolean(c.is_demo) });
    }
  }
  for (const m of (data.meetings || []).filter(keep)) {
    if (m.status === 'planned' && !m.invitation_sent_on && m.meeting_on) {
      const lead = INVITATION_LEAD_DAYS[m.body] ?? 8;
      const deadline = addDays(m.meeting_on, -lead);
      if (deadline <= addDays(today, 14) && m.meeting_on >= today) {
        items.push({ kind: 'meeting_invitation', name: m.title, date: deadline, isDemo: Boolean(m.is_demo) });
      }
    }
    if (m.status === 'held' && !m.minutes_closed_on && m.meeting_on) {
      items.push({ kind: 'meeting_minutes', name: m.title, date: addDays(m.meeting_on, MINUTES_DAYS), isDemo: Boolean(m.is_demo) });
    }
  }
  for (const i of (data.invoices || []).filter(keep)) {
    if (i.is_urgent_unbudgeted && !i.ratified_by_decision_id) {
      items.push({ kind: 'invoice_unratified', name: i.invoice_number || i.description || '—', date: null, isDemo: Boolean(i.is_demo) });
    }
  }
  const mandates = (data.mandates || []).filter(keep);
  for (const c of mandateChecks(mandates, data.profiles || [], today)) {
    items.push({ kind: c.kind === 'ending' ? 'mandate_ending' : c.kind, name: c.name, date: c.date, isDemo: c.isDemo });
  }

  for (const it of items) it.days = it.date ? daysBetweenIso(today, it.date) : null;
  items.sort((a, b) => (a.date || '9999') < (b.date || '9999') ? -1 : (a.date || '9999') > (b.date || '9999') ? 1 : 0);
  return items;
}

// Položky pre denné upozornenie (iba míľniky).
export function dailyItems(items) {
  return items.filter((it) => {
    if (it.days === null) return false;
    const marks = it.kind === 'contract_notice' ? NOTICE_MILESTONES : DAILY_MILESTONES;
    return marks.includes(it.days);
  });
}

function groupOf(it) {
  if (it.days === null || it.kind === 'leftover_access' || it.kind === 'no_mandate' || it.kind === 'invoice_unratified') return 'waiting';
  return it.days < 0 ? 'overdue' : 'soon';
}

function whenText(it, s) {
  if (it.days === null) return '';
  if (it.days === 0) return s.today;
  if (it.days === 1) return s.inDay;
  if (it.days > 1) return fill(s.inDays, { n: it.days });
  if (it.days === -1) return s.dayAgo;
  return fill(s.daysAgo, { n: -it.days });
}

function fmtDate(iso, lang) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return lang === 'en' || lang === 'es' || lang === 'fr' ? `${d}/${m}/${y}` : `${d}.${m}.${y}`;
}

// Vytvorí e-mail (predmet, HTML, text) v jazyku príjemcu.
export function renderDigest({ items, lang = 'en', weekly, appUrl, today, sample = false }) {
  const s = DIGEST_STRINGS[lang] || DIGEST_STRINGS.en;
  const groups = { overdue: [], soon: [], waiting: [] };
  for (const it of items) groups[groupOf(it)].push(it);
  const link = `${(appUrl || '').replace(/\/$/, '')}/admin/memoria`;

  const lineText = (it) => {
    const label = fill(s[it.kind] || '{name}', { name: it.name });
    const when = it.date ? ` — ${fmtDate(it.date, lang)}${whenText(it, s) ? ` (${whenText(it, s)})` : ''}` : '';
    return `${it.isDemo ? `[${s.demo}] ` : ''}${label}${when}`;
  };

  const order = ['overdue', 'soon', 'waiting'];
  const htmlSections = order
    .filter((g) => groups[g].length > 0)
    .map((g) => {
      const color = g === 'overdue' ? '#B42318' : g === 'soon' ? '#8A5A12' : '#16364A';
      const lis = groups[g].map((it) => `<li style="margin:0 0 6px 0">${escapeHtml(lineText(it))}</li>`).join('');
      return `<h3 style="font-size:15px;color:${color};margin:18px 0 6px 0">${escapeHtml(s[g])} (${groups[g].length})</h3><ul style="padding-left:18px;margin:0">${lis}</ul>`;
    })
    .join('');

  const intro = fill(weekly ? s.introWeekly : s.introDaily, { date: fmtDate(today, lang) });
  const subject = `${weekly ? s.subjectWeekly : s.subjectDaily}${sample ? ` (${s.demo})` : ''}`;
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;color:#2B3A44;font-size:14px;line-height:1.45;max-width:620px">
<h2 style="font-size:18px;color:#16364A;margin:0 0 8px 0">🧠 Memoria</h2>
${sample ? `<p style="border:1px dashed #8A5A12;color:#8A5A12;padding:6px 10px;border-radius:6px">${escapeHtml(s.demoNote)}</p>` : ''}
<p style="margin:0 0 8px 0">${escapeHtml(intro)}</p>
${htmlSections || `<p>${escapeHtml(s.nothing)}</p>`}
<p style="margin:22px 0"><a href="${escapeHtml(link)}" style="background:#16364A;color:#F5F0E6;padding:10px 16px;border-radius:8px;text-decoration:none">${escapeHtml(s.open)}</a></p>
<p style="font-size:12px;color:#6A747B;margin:0 0 4px 0">${escapeHtml(s.factsOnly)}</p>
<p style="font-size:12px;color:#6A747B;margin:0">${escapeHtml(s.footer)}</p>
</div>`;

  const textSections = order
    .filter((g) => groups[g].length > 0)
    .map((g) => `${s[g]} (${groups[g].length})\n${groups[g].map((it) => `- ${lineText(it)}`).join('\n')}`)
    .join('\n\n');
  const text = `Memoria\n${sample ? `${s.demoNote}\n` : ''}${intro}\n\n${textSections || s.nothing}\n\n${s.open}: ${link}\n\n${s.factsOnly}\n${s.footer}`;

  return { subject, html, text };
}

// Pondelok = týždenný súhrn (podľa dátumu 'YYYY-MM-DD').
export function isWeeklyDay(today) {
  const [y, m, d] = today.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay() === 1;
}
