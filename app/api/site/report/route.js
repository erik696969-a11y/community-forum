// Site Manager → kontaktná osoba: týždenný / mesačný report.
// Čísla sa počítajú zo záznamov (sm_read s tokenom používateľa), uložia sa ako zmrazená kópia
// a report odíde e-mailom kontaktnej osobe. Board ho dostane až od nej.

import { siteAuth, rateLimit, roleHolders, signedUrls, sendSiteEmail, namesFrom } from '../../../../lib/siteServer';
import { periodSummary } from '../../../../lib/siteKpi';
import { reportHtml } from '../../../../lib/siteEmail';
import { brandConfig } from '../../../../lib/brandConfig';
import { appBaseUrl } from '../../../../lib/memoriaDigestServer';

export const maxDuration = 30;

const intOrNull = (v) => (v === '' || v === null || v === undefined || Number.isNaN(Number(v)) ? null : Math.max(0, Math.round(Number(v))));

export async function POST(request) {
  const { user, me, db, admin, error } = await siteAuth(request);
  if (error) return error;
  if (!me?.site_manager) return Response.json({ error: 'Reports are sent by the Site Manager.' }, { status: 403 });
  const limited = await rateLimit(admin, user.id, 'site-report', 20);
  if (limited) return limited;

  try {
    const body = await request.json().catch(() => ({}));
    const kind = ['weekly', 'fortnightly', 'monthly'].includes(body.kind) ? body.kind : 'weekly';
    const note = String(body.note || '').trim().slice(0, 2000);
    const monthly = kind === 'monthly'
      ? {
          maintenance_due: intOrNull(body.monthly?.maintenance_due),
          maintenance_done: intOrNull(body.monthly?.maintenance_done),
          inspections: intOrNull(body.monthly?.inspections),
        }
      : null;

    const { data, error: readErr } = await db.rpc('sm_read', { p_scope: 'report' });
    if (readErr) return Response.json({ error: readErr.message }, { status: 403 });
    const sum = periodSummary({ entries: data.entries, reports: data.reports, kind });
    const fingerprint = data.integrity?.ok ? { fingerprint: data.integrity.fingerprint, count: data.integrity.count } : null;

    const to = await roleHolders(admin, 'point_of_contact');
    if (!to.length) return Response.json({ error: 'No point of contact is assigned.' }, { status: 409 });

    const urls = await signedUrls(admin, sum.entries.map((e) => e.photo_path));
    const html = reportHtml({
      sum,
      note,
      monthly,
      names: namesFrom(me),
      community: brandConfig.fullLegalName,
      photoUrl: (p) => urls[p] || null,
      fingerprint,
      appUrl: appBaseUrl(request),
    });
    const kindLabel = kind.charAt(0).toUpperCase() + kind.slice(1);
    const sentTo = await sendSiteEmail({ to, subject: `${kindLabel} site report — ${sum.fromText} to ${sum.toText}`, html });

    const { error: insErr } = await admin.from('sm_reports').insert({
      kind,
      period_from: sum.from,
      period_to: sum.to,
      maintenance_due: monthly?.maintenance_due ?? null,
      maintenance_done: monthly?.maintenance_done ?? null,
      inspections: monthly?.inspections ?? null,
      note: note || null,
      metrics: {
        count: sum.count, closed: sum.closed, openNow: sum.openNow, onHoldNow: sum.onHoldNow,
        highNow: sum.highNow, avgDays: sum.avgDays, refs: sum.entries.map((e) => e.ref),
      },
      sent_to: sentTo,
      fingerprint: fingerprint?.fingerprint || null,
      created_by: user.id,
    });
    if (insErr) return Response.json({ error: `Sent, but not recorded: ${insErr.message}` }, { status: 500 });

    return Response.json({ ok: true, count: sum.count, kind, sentTo: me.contact_name || 'the point of contact' });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
