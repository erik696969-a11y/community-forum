// Site Manager reporting — výpočty KPI (prenesené z Google Apps Script Code.gs).
// Čisté funkcie bez prístupu k databáze: vstup sú dáta zo sm_read(), výstup čísla pre obrazovku a e-mail.
//
// Pravidlá, ktoré sa nesmú stratiť (odovzdávací dokument §4.5):
//  * čas „na hold“ (čakanie na dodávateľa, diel, board) sa odpočíta od každého KPI založeného na čase,
//  * počet ponúk sa ráta zo záznamov, nikdy nie z uvedeného čísla,
//  * vzorka na kontrolu sa vyberá náhodne systémom,
//  * farba nikdy nenesie význam sama — stav je vždy aj slovom.

export const LOCATIONS = [
  'Pool 1', 'Pool 2', 'Pool 3', 'Pool 4',
  'Gardens', 'Main gate', 'Gatehouse',
  'Block entrance', 'Lift', 'Common interiors',
  'Garage', 'Outdoor parking',
  'Lighting', 'Drainage',
  'Gym / social room',
  'Other',
];
export const TYPES = ['incident', 'defect', 'maintenance', 'procurement'];
export const URGENCIES = ['low', 'medium', 'high'];
export const TYPE_LABEL = { incident: 'Incident', defect: 'Defect', maintenance: 'Maintenance', procurement: 'Procurement' };
export const URGENCY_LABEL = { low: 'Low', medium: 'Medium', high: 'High' };
export const STATUS_LABEL = { open: 'Open', on_hold: 'On hold — external', closed: 'Closed' };
export const STATE_LABEL = { met: 'Met', below: 'Below target', missed: 'Not met', none: '—' };

export const DEFAULT_TARGETS = {
  urgent_within_hours: 24,
  routine_within_days: 10,
  stale_days: 30,
  maintenance_target: 90,
  quotation_threshold: 1000,
  quotations_required: 3,
};

// sm_targets_now() vracia {key: {value, minute_ref}} — pre výpočty stačia hodnoty.
export function targetValues(targets) {
  const out = { ...DEFAULT_TARGETS };
  for (const [k, v] of Object.entries(targets || {})) {
    const n = Number(v && typeof v === 'object' ? v.value : v);
    if (Number.isFinite(n)) out[k] = n;
  }
  return out;
}

const DAY = 86400000;
const HOUR = 3600000;

// Stav záznamu z jeho udalostí: open / on_hold / closed, časy a súčet času na hold.
export function deriveEntry(entry) {
  let status = 'open';
  let holdSince = null;
  let holdMs = 0;
  let holdReason = '';
  let closedAt = null;
  const events = [...(entry.events || [])].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  for (const ev of events) {
    const at = new Date(ev.created_at);
    if (ev.kind === 'hold' && status === 'open') {
      status = 'on_hold';
      holdSince = at;
      holdReason = ev.reason || '';
    } else if (ev.kind === 'resume' && status === 'on_hold') {
      holdMs += at - holdSince;
      holdSince = null;
      status = 'open';
    } else if (ev.kind === 'close' && status !== 'closed') {
      if (holdSince) {
        holdMs += at - holdSince;
        holdSince = null;
      }
      status = 'closed';
      closedAt = at;
    }
  }
  return { ...entry, createdAt: new Date(entry.created_at), status, holdSince, holdMs, holdReason, closedAt };
}

// Pracovný čas: uplynulý čas mínus čas čakania na niekoho iného.
export function workingMs(d, endDate) {
  const end = new Date(endDate);
  let held = d.holdMs || 0;
  if (d.holdSince && end > d.holdSince) held += end - d.holdSince;
  return Math.max(end - d.createdAt - held, 0);
}

export function durationText(ms) {
  const hours = ms / HOUR;
  if (hours < 1) return `${Math.max(Math.round(hours * 60), 1)} min`;
  if (hours < 48) return `${Math.round(hours)} h`;
  const days = hours / 24;
  return `${days < 10 ? Math.round(days * 10) / 10 : Math.round(days)} days`;
}

const fmtDateTime = (d) =>
  new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' }).format(new Date(d));
const fmtDate = (d) =>
  new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Europe/Madrid' }).format(new Date(d));
const fmtShort = (d) => new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'Europe/Madrid' }).format(new Date(d));
export { fmtDateTime, fmtDate, fmtShort };

function locationText(e) {
  return e.location + (e.block ? ` ${e.block}` : '');
}

function itemFor(d, to, from) {
  const closedInPeriod = d.status === 'closed' && d.closedAt > from && d.closedAt <= to;
  const heldTotal = (d.holdMs || 0) + (d.holdSince ? Math.max(to - d.holdSince, 0) : 0);
  return {
    ref: d.reference,
    when: fmtDateTime(d.createdAt),
    type: d.type,
    location: locationText(d),
    text: d.description,
    urgency: d.urgency,
    status: d.status,
    photo_path: d.photo_path || null,
    closedWhen: d.status === 'closed' ? fmtDateTime(d.closedAt) : '',
    took: d.status === 'closed' ? durationText(workingMs(d, d.closedAt)) : '',
    held: heldTotal ? durationText(heldTotal) : '',
    holdReason: d.holdReason || '',
    ageMs: workingMs(d, d.status === 'closed' ? d.closedAt : to),
    age: durationText(workingMs(d, to)),
    newThisPeriod: d.createdAt > from && d.createdAt <= to,
    closedThisPeriod: closedInPeriod,
  };
}

const avg = (arr) => (arr.length ? Math.round((arr.reduce((a, b) => a + b, 0) / arr.length) * 10) / 10 : null);

// Obdobie reportu Site Managera: od konca posledného reportu (akéhokoľvek druhu), inak 7 / 30 dní späť.
export function reportPeriod(reports, kind, now = new Date()) {
  const to = new Date(now);
  let from = null;
  const last = [...(reports || [])].sort((a, b) => new Date(a.created_at) - new Date(b.created_at)).pop();
  if (last) {
    const cand = new Date(last.period_to);
    if (!Number.isNaN(cand.getTime()) && cand.getFullYear() > 2020 && cand <= to) from = cand;
  }
  if (!from) {
    from = new Date(to);
    from.setDate(from.getDate() - (kind === 'monthly' ? 30 : 7));
  }
  return { from, to };
}

export function periodSummary({ entries, reports, kind = 'weekly', now = new Date() }) {
  const { from, to } = reportPeriod(reports, kind, now);
  const derived = (entries || []).map(deriveEntry);
  let count = 0;
  let closed = 0;
  let openNow = 0;
  let onHoldNow = 0;
  let highNow = 0;
  const closeDays = [];
  const items = [];
  const openItems = [];
  for (const d of derived) {
    const it = itemFor(d, to, from);
    if (it.newThisPeriod) count += 1;
    if (it.closedThisPeriod) {
      closed += 1;
      closeDays.push(workingMs(d, d.closedAt) / DAY);
    }
    if (it.newThisPeriod || it.closedThisPeriod) items.push(it);
    if (d.status !== 'closed') {
      openNow += 1;
      if (d.status === 'on_hold') onHoldNow += 1;
      if (d.urgency === 'high' && d.status === 'open') highNow += 1;
      openItems.push(it);
    }
  }
  openItems.sort((a, b) => b.ageMs - a.ageMs);
  return {
    kind,
    from: from.toISOString(),
    to: to.toISOString(),
    fromText: fmtDate(from),
    toText: fmtDate(to),
    entries: items,
    openItems,
    count,
    closed,
    openNow,
    onHoldNow,
    highNow,
    avgDays: avg(closeDays),
  };
}

export function kpiState({ met, total, ratioBelow = 0.8 }) {
  if (!total) return 'none';
  if (met === total) return 'met';
  return met / total >= ratioBelow ? 'below' : 'missed';
}

function kpi(name, target, result, state, source) {
  return { name, target, result, state, source };
}

// Zákazky nad limit a koľko ponúk k nim je skutočne zapísaných.
export function procurementStats(works, from, to, t) {
  const out = { works: 0, quoted: 0, items: [] };
  for (const w of works || []) {
    const when = new Date(w.created_at);
    if (when <= from || when > to) continue;
    if (Number(w.estimated_value) < t.quotation_threshold) continue;
    out.works += 1;
    const n = (w.quotations || []).filter((q) => q.supplier).length;
    if (n >= t.quotations_required) out.quoted += 1;
    const decision = [...(w.events || [])].reverse().find((e) => e.kind === 'decision');
    out.items.push({
      ref: w.reference,
      description: w.description,
      estimate: Number(w.estimated_value),
      count: n,
      recommended: w.recommended || '',
      approvedBy: decision?.data?.decided_by || w.approver_label || '',
    });
  }
  return out;
}

function monthStart(d) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

// Každý mesiac zvlášť, aby board videl smer, nielen jedno číslo.
export function monthlyTrend(derived, reports, from, to, t) {
  const months = [];
  for (let cur = monthStart(from); cur <= to; cur = new Date(cur.getFullYear(), cur.getMonth() + 1, 1)) {
    months.push({
      label: new Intl.DateTimeFormat('en-GB', { month: 'short' }).format(cur),
      start: cur,
      end: new Date(cur.getFullYear(), cur.getMonth() + 1, 1),
      closed: 0,
      onTime: 0,
      days: [],
      maintDue: 0,
      maintDone: 0,
    });
  }
  const bucket = (d) => months.find((m) => d >= m.start && d < m.end) || null;
  for (const d of derived) {
    if (d.status !== 'closed') continue;
    const b = bucket(d.closedAt);
    if (!b) continue;
    const hours = workingMs(d, d.closedAt) / HOUR;
    const limit = d.urgency === 'high' ? t.urgent_within_hours : t.routine_within_days * 24;
    b.closed += 1;
    if (hours <= limit) b.onTime += 1;
    b.days.push(hours / 24);
  }
  for (const r of reports || []) {
    const b = bucket(new Date(r.created_at));
    if (!b) continue;
    b.maintDue += Number(r.maintenance_due) || 0;
    b.maintDone += Number(r.maintenance_done) || 0;
  }
  return {
    months: months.map((m) => m.label),
    onTime: months.map((m) => (m.closed ? Math.round((m.onTime / m.closed) * 100) : null)),
    speed: months.map((m) => avg(m.days)),
    maintenance: months.map((m) => (m.maintDue ? Math.round((m.maintDone / m.maintDue) * 100) : null)),
  };
}

// Náhodná vzorka uzavretých vecí na kontrolu podstaty za číslami.
export function spotCheck(closedSample, n = 3, random = Math.random) {
  const pool = [...closedSample];
  const out = [];
  while (out.length < n && pool.length) out.push(pool.splice(Math.floor(random() * pool.length), 1)[0]);
  return out;
}

export function committeeSummary({ entries, reports, works, targets, days = 90, now = new Date(), random = Math.random }) {
  const t = targetValues(targets);
  const to = new Date(now);
  const from = new Date(to);
  from.setDate(from.getDate() - days);
  const derived = (entries || []).map(deriveEntry);

  const inPeriodReports = (reports || []).filter((r) => {
    const sent = new Date(r.created_at);
    return sent > from && sent <= to;
  });
  let maintDue = 0;
  let maintDone = 0;
  let inspections = 0;
  const notes = [];
  const reportRows = inPeriodReports.map((r) => {
    maintDue += Number(r.maintenance_due) || 0;
    maintDone += Number(r.maintenance_done) || 0;
    inspections += Number(r.inspections) || 0;
    if (r.note) notes.push({ when: fmtShort(r.created_at), text: r.note });
    return {
      sent: fmtShort(r.created_at),
      kind: r.kind,
      from: fmtShort(r.period_from),
      till: fmtShort(r.period_to),
      logged: r.metrics?.count ?? '',
      closed: r.metrics?.closed ?? '',
      fingerprint: r.fingerprint || '',
    };
  });

  const proc = procurementStats(works, from, to, t);

  let logged = 0;
  let closed = 0;
  let urgentClosed = 0;
  let urgentOnTime = 0;
  let routineClosed = 0;
  let routineOnTime = 0;
  let stale = 0;
  let openNow = 0;
  const closeDays = [];
  const closedSample = [];
  for (const d of derived) {
    if (d.createdAt > from && d.createdAt <= to) logged += 1;
    if (d.status === 'closed' && d.closedAt > from && d.closedAt <= to) {
      closed += 1;
      const ms = workingMs(d, d.closedAt);
      const hours = ms / HOUR;
      closeDays.push(hours / 24);
      closedSample.push({ ref: d.reference, location: d.location, text: d.description, took: durationText(ms), photo_path: d.photo_path || null });
      if (d.urgency === 'high') {
        urgentClosed += 1;
        if (hours <= t.urgent_within_hours) urgentOnTime += 1;
      } else {
        routineClosed += 1;
        if (hours / 24 <= t.routine_within_days) routineOnTime += 1;
      }
    }
    if (d.status !== 'closed') {
      openNow += 1;
      if (workingMs(d, to) / DAY > t.stale_days) stale += 1;
    }
  }
  const avgDays = avg(closeDays);
  const maintPct = maintDue ? Math.round((maintDone / maintDue) * 100) : null;

  const kpis = [
    kpi(`Urgent items closed within ${t.urgent_within_hours} h`, 'all',
      urgentClosed ? `${urgentOnTime} of ${urgentClosed}` : 'none this period',
      kpiState({ met: urgentOnTime, total: urgentClosed }), 'measured'),
    kpi(`Other items closed within ${t.routine_within_days} days`, 'all',
      routineClosed ? `${routineOnTime} of ${routineClosed}` : 'none this period',
      kpiState({ met: routineOnTime, total: routineClosed }), 'measured'),
    kpi(`Items open longer than ${t.stale_days} days`, '0', String(stale),
      stale === 0 ? 'met' : stale <= 2 ? 'below' : 'missed', 'measured'),
    kpi('Average working time to close', '—', avgDays === null ? 'nothing closed' : `${avgDays} days`, 'none', 'measured'),
    kpi(`${t.quotations_required} quotations above EUR ${t.quotation_threshold}`, 'always',
      proc.works ? `${proc.quoted} of ${proc.works}` : 'no such works',
      proc.works === 0 ? 'none' : proc.quoted === proc.works ? 'met' : 'below', 'measured'),
    kpi('Reports submitted', 'every period', String(reportRows.length), reportRows.length ? 'met' : 'missed', 'measured'),
    kpi('Preventive maintenance completed on time', `${t.maintenance_target}%`,
      maintPct === null ? 'not reported' : `${maintPct}%`,
      maintPct === null ? 'none' : maintPct >= t.maintenance_target ? 'met' : maintPct >= t.maintenance_target - 10 ? 'below' : 'missed',
      'reported'),
    kpi('Site inspection rounds', '—', inspections ? String(inspections) : 'not reported', 'none', 'reported'),
  ];

  return {
    days,
    from: from.toISOString(),
    to: to.toISOString(),
    fromText: fmtDate(from),
    toText: fmtDate(to),
    reports: reportRows,
    notes,
    spot: spotCheck(closedSample, 3, random),
    kpis,
    trend: monthlyTrend(derived, inPeriodReports, from, to, t),
    procurement: proc.items,
    logged,
    closed,
    openNow,
    stale,
    targets: t,
  };
}
