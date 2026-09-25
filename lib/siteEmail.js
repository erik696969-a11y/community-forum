// Site Manager reporting — HTML e-maily (prenesené z Code.gs so všetkými obmedzeniami z §4.6):
// grafy z buniek tabuľky s bgcolor aj inline výškou, stav vždy aj slovom, tri očíslované sekcie.

import { STATE_LABEL, TYPE_LABEL, URGENCY_LABEL } from './siteKpi';

export function escapeHtml(t) {
  return String(t ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const COLOUR = { met: '#2E7D4F', below: '#B5811A', missed: '#AE3A31', none: '#5A6B70' };

function fingerprintNote(s, fp) {
  if (!fp) return '';
  return `<p style="${s.small};max-width:640px;margin:6px auto">Record fingerprint <b style="font-family:monospace">${escapeHtml(fp.fingerprint)}</b> · ${fp.count} records. Keep this email: if any earlier record were ever changed, the fingerprint shown in the app would no longer match this one.</p>`;
}

function tile(s, value, label) {
  return `<div style="${s.tile}"><span style="${s.num}">${value}</span><span style="${s.small}">${label}</span></div>`;
}

function row(s, label, value) {
  const v = value === '' || value === null || value === undefined ? '—' : value;
  return `<tr><td style="${s.td}">${label}</td><td style="${s.td};text-align:right;font-weight:bold">${v}</td></tr>`;
}

const BASE = {
  body: 'font-family:Arial,Helvetica,sans-serif;color:#19282D;line-height:1.5;font-size:15px',
  head: 'background:#0E6A78;color:#fff;padding:16px 20px;font-size:17px;font-weight:bold',
  wrap: 'max-width:640px;margin:0 auto;border:1px solid #D9DFDB;background:#fff',
  pad: 'padding:18px 20px',
  tile: 'display:inline-block;width:31%;min-width:110px;vertical-align:top;padding:6px 0',
  num: 'font-size:24px;font-weight:bold;display:block',
  small: 'font-size:12px;color:#5A6B70',
  item: 'border-top:1px solid #D9DFDB;padding:12px 0',
  tag: 'font-size:11px;color:#0E6A78;background:#E3EFF1;padding:2px 6px;border-radius:3px',
  noteb: 'background:#E3EFF1;border-left:3px solid #0E6A78;padding:12px 14px;margin-top:4px',
  th: 'text-align:left;font-size:12px;color:#5A6B70;padding:6px 8px;border-bottom:1px solid #D9DFDB',
  td: 'padding:9px 8px;border-bottom:1px solid #D9DFDB;font-size:14px;vertical-align:top',
  sec: 'font-size:15px;font-weight:bold;margin:0 0 2px',
  secno: 'font-size:11px;letter-spacing:.06em;color:#0E6A78;font-weight:bold;margin:0',
  rule: 'border:0;border-top:2px solid #19282D;margin:26px 0 14px',
  box: 'background:#F4F6F4;border:1px solid #D9DFDB;padding:13px 15px',
  banner: 'background:#E3EFF1;border-left:3px solid #0E6A78;padding:12px 15px;font-size:13.5px',
};

// ---------------------------------------------------------------------------
// Site Manager → kontaktná osoba
// ---------------------------------------------------------------------------
export function reportHtml({ sum, note, monthly, names, community, photoUrl = () => null, fingerprint, appUrl }) {
  const s = BASE;
  const kindLabel = sum.kind.charAt(0).toUpperCase() + sum.kind.slice(1);
  let h = `<div style="${s.body}"><div style="${s.wrap}">`;
  h += `<div style="${s.head}">${kindLabel} site report</div><div style="${s.pad}">`;
  h += `<p style="${s.small};margin:0 0 14px">${sum.fromText} &ndash; ${sum.toText}<br>From ${escapeHtml(names.siteManager)}, Site Manager</p>`;
  h += '<div style="margin-bottom:14px">';
  h += tile(s, sum.count, 'logged this period') + tile(s, sum.closed, 'closed this period') + tile(s, sum.openNow, 'open in total');
  h += '</div><div style="margin-bottom:18px">';
  h += tile(s, sum.onHoldNow || 0, 'on hold &mdash; external') + tile(s, sum.highNow, 'open &amp; high urgency') + tile(s, sum.avgDays === null ? '—' : sum.avgDays, 'avg days to close');
  h += '</div>';
  if (monthly) {
    h += '<p style="font-weight:bold;margin:0 0 6px">Monthly figures (the Site Manager&rsquo;s own return)</p>';
    h += '<table style="width:100%;border-collapse:collapse;margin-bottom:18px">';
    h += row(s, 'Planned maintenance tasks due', monthly.maintenance_due);
    h += row(s, 'Completed on time', monthly.maintenance_done);
    h += row(s, 'Site inspection rounds completed', monthly.inspections);
    h += '</table>';
  }
  if (note) {
    h += '<p style="font-weight:bold;margin:0 0 4px">For the Committee to decide</p>';
    h += `<div style="${s.noteb}">${escapeHtml(note).replace(/\n/g, '<br>')}</div>`;
  }
  h += '<p style="font-weight:bold;margin:22px 0 0">Activity this period</p>';
  if (!sum.entries.length) {
    h += `<p style="${s.small}">Nothing logged or closed in this period.</p>`;
  } else {
    for (const e of sum.entries) {
      const url = e.photo_path ? photoUrl(e.photo_path) : null;
      h += `<div style="${s.item}"><div style="${s.small};margin-bottom:3px">${escapeHtml(e.location)} &middot; ${TYPE_LABEL[e.type] || e.type} &middot; ${URGENCY_LABEL[e.urgency] || e.urgency} <span style="${s.tag}">${e.ref}</span></div>`;
      h += `<div>${escapeHtml(e.text)}</div>`;
      h += `<div style="${s.small};margin-top:4px">Logged ${e.when}${
        e.closedWhen
          ? ` &middot; <span style="color:#2E7D4F;font-weight:bold">Closed ${e.closedWhen}</span> &middot; worked ${e.took}`
          : ' &middot; <span style="color:#B5811A;font-weight:bold">still open</span>'
      }${e.held ? ` &middot; on hold ${e.held}${e.holdReason ? ` (${escapeHtml(e.holdReason)})` : ''}` : ''}</div>`;
      if (url) h += `<div style="margin-top:4px"><a href="${url}" style="color:#0E6A78;font-size:13px">Photo</a></div>`;
      h += '</div>';
    }
  }
  if (sum.openItems.length) {
    h += '<p style="font-weight:bold;margin:26px 0 2px">Still open</p>';
    h += `<p style="${s.small};margin:0 0 6px">Everything not yet closed, oldest first.</p><table style="width:100%;border-collapse:collapse">`;
    for (const e of sum.openItems) {
      h += `<tr><td style="${s.td}">${escapeHtml(e.location)}<div style="${s.small}">${escapeHtml(e.text)}</div></td><td style="${s.td};text-align:right;white-space:nowrap">${
        e.urgency === 'high' ? '<span style="color:#AE3A31;font-weight:bold">High</span><br>' : `${URGENCY_LABEL[e.urgency] || e.urgency}<br>`
      }<span style="${s.small}">open ${e.age}${e.status === 'on_hold' ? ' &middot; on hold' : ''}</span></td></tr>`;
    }
    h += '</table>';
  }
  if (appUrl) h += `<p style="margin:22px 0 0"><a href="${appUrl}/site" style="color:#0E6A78">Open site reporting</a></p>`;
  h += '</div></div>';
  h += `<p style="${s.small};max-width:640px;margin:12px auto">Sent from the site reporting system of ${escapeHtml(community)}.</p>`;
  h += fingerprintNote(s, fingerprint);
  return `${h}</div>`;
}

// ---------------------------------------------------------------------------
// Kontaktná osoba → board
// ---------------------------------------------------------------------------
function kpiTable(s, rows) {
  if (!rows.length) return `<p style="${s.small}">Nothing to show.</p>`;
  let h = `<table style="width:100%;border-collapse:collapse"><tr><th style="${s.th}">Measure</th><th style="${s.th}">Target</th><th style="${s.th}">Result</th><th style="${s.th}">Status</th></tr>`;
  for (const k of rows) {
    h += `<tr><td style="${s.td}">${escapeHtml(k.name)}</td><td style="${s.td};color:#5A6B70">${escapeHtml(k.target)}</td><td style="${s.td};font-weight:bold">${escapeHtml(k.result)}</td><td style="${s.td};color:${COLOUR[k.state]};font-weight:bold">${STATE_LABEL[k.state]}</td></tr>`;
  }
  return `${h}</table>`;
}

export function chartHtml(title, labels, values, unit, higherIsBetter, fixedMax) {
  const real = values.filter((v) => v !== null);
  if (!real.length) return '';
  const max = fixedMax || Math.max(...real) || 1;
  const H = 64;
  let h = `<p style="font-size:13px;font-weight:bold;margin:16px 0 6px">${title}</p><table style="border-collapse:collapse"><tr>`;
  labels.forEach((lab, i) => {
    const v = values[i];
    const px = v === null ? 3 : Math.max(Math.round((v / max) * H), 3);
    let col = '#C9D2CD';
    if (v !== null) {
      const good = higherIsBetter ? v >= 90 : v <= 3;
      const mid = higherIsBetter ? v >= 75 : v <= 7;
      col = good ? '#2E7D4F' : mid ? '#B5811A' : '#AE3A31';
    }
    h += `<td style="padding:0 6px 0 0;vertical-align:bottom;text-align:center"><div style="font-size:11px;color:#19282D;font-weight:bold;margin-bottom:2px">${v === null ? '—' : v + unit}</div><table style="border-collapse:collapse"><tr><td width="34" height="${px}" bgcolor="${col}" style="width:34px;height:${px}px;background:${col};font-size:0;line-height:0;mso-line-height-rule:exactly">&nbsp;</td></tr></table><div style="font-size:11px;color:#5A6B70;margin-top:3px">${lab}</div></td>`;
  });
  return `${h}</tr></table>`;
}

export function committeeHtml({ sum, comment, names, community, conflicts = [], photoUrl = () => null, fingerprint, targetsDecided }) {
  const s = BASE;
  const measured = sum.kpis.filter((k) => k.source === 'measured');
  const reported = sum.kpis.filter((k) => k.source !== 'measured');
  let h = `<div style="${s.body}"><div style="${s.wrap}">`;
  h += `<div style="${s.head}">${escapeHtml(names.siteManager)} — report to the Committee</div><div style="${s.pad}">`;
  h += `<p style="${s.small};margin:0 0 14px">${sum.fromText} &ndash; ${sum.toText} &middot; ${sum.reports.length} reports received<br>Prepared by ${escapeHtml(names.contact)}, the Committee&rsquo;s point of contact</p>`;
  h += `<div style="${s.banner}">This report is built from dated records. Sections 1 and 2 are counted by the system and by the Site Manager&rsquo;s own returns; neither depends on anyone&rsquo;s opinion. Section 3 is commentary only and changes none of the figures above.</div>`;
  if (!targetsDecided) {
    h += `<p style="${s.small};margin:10px 0 0">The targets shown are the proposal values; the Committee has not yet set them by minute.</p>`;
  }
  h += `<hr style="${s.rule}"><p style="${s.secno}">SECTION 1</p><p style="${s.sec}">Measured by the system</p>`;
  h += `<p style="${s.small};margin:0 0 12px">Counted from the time each item was logged and closed, with time on hold for external reasons excluded. Nobody enters these figures by hand.</p>`;
  h += kpiTable(s, measured);
  if (sum.trend && sum.trend.months.length > 1) {
    h += `<p style="${s.sec};margin:22px 0 2px">Trend</p><p style="${s.small};margin:0 0 10px">Each month measured on its own, so the direction is visible rather than a single figure.</p>`;
    h += chartHtml('Closed within target', sum.trend.months, sum.trend.onTime, '%', true, 100);
    h += chartHtml('Average days to close', sum.trend.months, sum.trend.speed, ' d', false, null);
  }
  h += `<hr style="${s.rule}"><p style="${s.secno}">SECTION 2</p><p style="${s.sec}">Reported by the Site Manager</p>`;
  h += `<p style="${s.small};margin:0 0 12px">Figures the Site Manager submitted in her monthly returns. Verifiable against the maintenance plan and supplier files.</p>`;
  h += kpiTable(s, reported);
  if (sum.trend && sum.trend.months.length > 1) h += chartHtml('Preventive maintenance completed', sum.trend.months, sum.trend.maintenance, '%', true, 100);
  h += `<p style="margin:16px 0 0;font-size:14px">${sum.logged} logged, ${sum.closed} closed, ${sum.openNow} open now${sum.stale ? `, of which <b>${sum.stale}</b> open longer than ${sum.targets.stale_days} days` : ''}.</p>`;
  if (sum.spot.length) {
    h += `<p style="${s.sec};margin:22px 0 2px">Spot-check sample</p><p style="${s.small};margin:0 0 6px">Drawn at random by the system from the matters closed in this period, so the substance behind the figures can be checked. The Site Manager knows this sample is taken every period.</p><table style="width:100%;border-collapse:collapse">`;
    for (const x of sum.spot) {
      const url = x.photo_path ? photoUrl(x.photo_path) : null;
      h += `<tr><td style="${s.td}">${escapeHtml(x.location)}<div style="${s.small}">${escapeHtml(x.text)}${url ? ` &middot; <a href="${url}" style="color:#0E6A78">photo</a>` : ''}</div></td><td style="${s.td};text-align:right;white-space:nowrap">${x.took}<div style="${s.small}">${x.ref}</div></td></tr>`;
    }
    h += '</table>';
  }
  if (sum.procurement.length) {
    h += `<p style="${s.sec};margin:22px 0 4px">Works above the threshold</p><p style="${s.small};margin:0 0 6px">Each with the number of quotations actually recorded.</p><table style="width:100%;border-collapse:collapse">`;
    for (const p of sum.procurement) {
      const ok = p.count >= sum.targets.quotations_required;
      h += `<tr><td style="${s.td}">${escapeHtml(p.description)}<div style="${s.small}">${p.ref}${p.recommended ? ` &middot; ${escapeHtml(p.recommended)}` : ''}${p.approvedBy ? ` &middot; authorised by ${escapeHtml(p.approvedBy)}` : ''}</div></td><td style="${s.td};text-align:right;white-space:nowrap">EUR ${p.estimate}<div style="font-size:12px;color:${ok ? '#2E7D4F' : '#AE3A31'};font-weight:bold">${p.count} quotations</div></td></tr>`;
    }
    h += '</table>';
  }
  if (sum.notes.length) {
    h += `<p style="${s.sec};margin:22px 0 4px">Raised for the Committee to decide</p><table style="width:100%;border-collapse:collapse">`;
    for (const n of sum.notes) h += `<tr><td style="${s.td};white-space:nowrap;font-size:12px;color:#5A6B70">${n.when}</td><td style="${s.td}">${escapeHtml(n.text).replace(/\n/g, '<br>')}</td></tr>`;
    h += '</table>';
  }
  if (conflicts.length) {
    h += `<p style="${s.sec};margin:22px 0 4px">Declared conflicts of interest</p><p style="${s.small};margin:0 0 6px">These members take no part in authorising works procured by the Site Manager or in her assessment, for as long as the relationship is declared. This protects both sides; it is not a suspicion.</p>`;
    for (const c of conflicts) {
      h += `<p style="font-size:14px;margin:0 0 4px">${escapeHtml(c.name)} &middot; ${escapeHtml(c.description || c.relation)}${c.minute_ref ? ` &middot; minute ${escapeHtml(c.minute_ref)}` : ''}</p>`;
    }
  }
  h += `<hr style="${s.rule}"><p style="${s.secno}">SECTION 3</p><p style="${s.sec}">Comment from ${escapeHtml(names.contact)}</p>`;
  h += `<p style="${s.small};margin:0 0 10px">Context that the figures cannot show &mdash; why something slipped, whether a cause was outside the Site Manager&rsquo;s control. It is not a score and carries no weight of its own.</p>`;
  h += `<div style="${s.box}">${comment ? escapeHtml(comment).replace(/\n/g, '<br>') : `<span style="${s.small}">No comment added.</span>`}</div>`;
  h += '</div></div>';
  h += `<p style="${s.small};max-width:640px;margin:12px auto">Prepared from the reports submitted by ${escapeHtml(names.siteManager)}, under the criteria agreed by the Committee. She receives the same figures. Sent from the site reporting system of ${escapeHtml(community)}.</p>`;
  h += fingerprintNote(s, fingerprint);
  return `${h}</div>`;
}

// ---------------------------------------------------------------------------
// Žiadosť o schválenie — Site Manager → kontaktná osoba (nikdy priamo tomu, kto schvaľuje)
// ---------------------------------------------------------------------------
export function approvalHtml({ work, names, community, conflicts = [], docUrl = () => null, appUrl }) {
  const s = BASE;
  let h = `<div style="${s.body}"><div style="${s.wrap}"><div style="${s.head};background:#8C382E">Approval requested</div><div style="${s.pad}">`;
  h += `<p style="${s.small};margin:0 0 12px">Reference ${escapeHtml(work.reference)}</p>`;
  h += `<p style="font-weight:bold;margin:0 0 4px">${escapeHtml(work.description)}</p>`;
  h += `<p style="${s.small};margin:0 0 16px">${work.location ? `${escapeHtml(work.location)} &middot; ` : ''}estimated EUR ${Number(work.estimated_value)}</p>`;
  h += '<table style="width:100%;border-collapse:collapse">';
  for (const q of work.quotations || []) {
    const url = q.doc_path ? docUrl(q.doc_path) : null;
    h += `<tr><td style="${s.td}">${escapeHtml(q.supplier)}${url ? `<div><a href="${url}" style="color:#0E6A78;font-size:13px">Quotation</a></div>` : ''}</td><td style="${s.td};text-align:right;font-weight:bold;white-space:nowrap">EUR ${Number(q.amount)}</td></tr>`;
  }
  h += '</table>';
  if (work.recommended) {
    h += `<p style="font-weight:bold;margin:18px 0 2px">Recommended</p><div style="background:#F4F6F4;border-left:3px solid #8C382E;padding:12px 15px;margin-top:6px">${escapeHtml(work.recommended)}${work.recommendation_reason ? `<div style="${s.small};margin-top:6px">${escapeHtml(work.recommendation_reason)}</div>` : ''}</div>`;
  }
  if (conflicts.length) {
    h += `<div style="${s.banner};margin-top:16px"><b>Not part of the authorisation:</b> ${conflicts.map((c) => escapeHtml(c.name)).join(', ')} &mdash; declared relationship with the Site Manager${conflicts[0].minute_ref ? ` (minute ${escapeHtml(conflicts[0].minute_ref)})` : ''}. This protects both sides; it is not a suspicion.</div>`;
  }
  h += `<p style="margin:20px 0 0;font-size:14px"><b>A decision is needed before this work can proceed.</b> In the app you can send it to Memoria in one click, where the board compares the quotations and records its decision.</p>`;
  if (appUrl) h += `<p style="margin:10px 0 0"><a href="${appUrl}/site" style="color:#0E6A78">Open site reporting</a></p>`;
  h += `<p style="${s.small};margin:10px 0 0">Requested by ${escapeHtml(names.siteManager)}, Site Manager.</p></div></div>`;
  h += `<p style="${s.small};max-width:640px;margin:12px auto">Sent from the site reporting system of ${escapeHtml(community)}.</p></div>`;
  return h;
}
