// Kontaktná osoba → board: KPI report za obdobie. Board nemá do záznamov prístup, dostáva iba tento e-mail.
// Rovnaké čísla dostáva aj Site Manager (nikdy nie je hodnotená číslami, ktoré nevidela).

import { siteAuth, rateLimit, roleHolders, boardEmails, signedUrls, sendSiteEmail, namesFrom, targetsDecided } from '../../../../lib/siteServer';
import { committeeSummary } from '../../../../lib/siteKpi';
import { committeeHtml } from '../../../../lib/siteEmail';
import { brandConfig } from '../../../../lib/brandConfig';

export const maxDuration = 30;

export async function POST(request) {
  const { user, me, db, admin, error } = await siteAuth(request);
  if (error) return error;
  if (!me?.point_of_contact) return Response.json({ error: 'The Committee report is sent by the point of contact.' }, { status: 403 });
  const limited = await rateLimit(admin, user.id, 'site-committee', 10);
  if (limited) return limited;

  try {
    const body = await request.json().catch(() => ({}));
    const days = [30, 60, 90, 180].includes(Number(body.days)) ? Number(body.days) : 90;
    const comment = String(body.comment || '').trim().slice(0, 4000);

    const { data, error: readErr } = await db.rpc('sm_read', { p_scope: 'committee' });
    if (readErr) return Response.json({ error: readErr.message }, { status: 403 });
    const { data: conflicts } = await db.rpc('sm_active_conflicts');
    const sum = committeeSummary({ entries: data.entries, reports: data.reports, works: data.works, targets: data.targets, days });
    const fingerprint = data.integrity?.ok ? { fingerprint: data.integrity.fingerprint, count: data.integrity.count } : null;

    const board = await boardEmails(admin);
    const siteManager = await roleHolders(admin, 'site_manager');
    const urls = await signedUrls(admin, sum.spot.map((x) => x.photo_path));
    const html = committeeHtml({
      sum,
      comment,
      names: namesFrom(me),
      community: brandConfig.fullLegalName,
      conflicts: conflicts || [],
      photoUrl: (p) => urls[p] || null,
      fingerprint,
      targetsDecided: targetsDecided(data.targets),
    });
    const sentTo = await sendSiteEmail({
      to: [...board, ...siteManager],
      subject: `Site Manager — report to the Committee, ${sum.fromText} to ${sum.toText}`,
      html,
    });

    const { error: insErr } = await admin.from('sm_committee_reports').insert({
      period_from: sum.from,
      period_to: sum.to,
      days,
      comment: comment || null,
      metrics: { kpis: sum.kpis, trend: sum.trend, logged: sum.logged, closed: sum.closed, openNow: sum.openNow, stale: sum.stale, procurement: sum.procurement },
      spot_check_refs: sum.spot.map((x) => x.ref),
      recipients: sentTo,
      fingerprint: fingerprint?.fingerprint || null,
      created_by: user.id,
    });
    if (insErr) return Response.json({ error: `Sent, but not recorded: ${insErr.message}` }, { status: 500 });

    return Response.json({ ok: true, sentTo: sentTo.length });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
