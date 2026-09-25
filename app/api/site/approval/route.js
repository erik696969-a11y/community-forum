// Žiadosť o schválenie zákazky: Site Manager → IBA kontaktná osoba, hneď, nie až v ďalšom reporte.
// Nikdy nejde priamo tomu, kto schvaľuje.

import { siteAuth, rateLimit, roleHolders, signedUrls, sendSiteEmail, namesFrom } from '../../../../lib/siteServer';
import { approvalHtml } from '../../../../lib/siteEmail';
import { brandConfig } from '../../../../lib/brandConfig';
import { appBaseUrl } from '../../../../lib/memoriaDigestServer';

export const maxDuration = 30;

export async function POST(request) {
  const { user, me, db, admin, error } = await siteAuth(request);
  if (error) return error;
  if (!me?.site_manager) return Response.json({ error: 'Approval is requested by the Site Manager.' }, { status: 403 });
  const limited = await rateLimit(admin, user.id, 'site-approval', 30);
  if (limited) return limited;

  try {
    const { reference } = await request.json().catch(() => ({}));
    const { data, error: readErr } = await db.rpc('sm_read', { p_scope: 'approval' });
    if (readErr) return Response.json({ error: readErr.message }, { status: 403 });
    const work = (data.works || []).find((w) => w.reference === reference);
    if (!work) return Response.json({ error: 'Reference not found.' }, { status: 404 });
    if (!(work.events || []).some((e) => e.kind === 'approval_requested')) {
      return Response.json({ error: 'Approval was not requested for this work.' }, { status: 409 });
    }
    const { data: conflicts } = await db.rpc('sm_active_conflicts');
    const to = await roleHolders(admin, 'point_of_contact');
    if (!to.length) return Response.json({ error: 'No point of contact is assigned.' }, { status: 409 });
    const urls = await signedUrls(admin, (work.quotations || []).map((q) => q.doc_path));
    const html = approvalHtml({
      work,
      names: namesFrom(me),
      community: brandConfig.fullLegalName,
      conflicts: conflicts || [],
      docUrl: (p) => urls[p] || null,
      appUrl: appBaseUrl(request),
    });
    await sendSiteEmail({ to, subject: `Approval requested — ${work.description.slice(0, 60)} (EUR ${Number(work.estimated_value)})`, html });
    return Response.json({ ok: true, to: me.contact_name || 'the point of contact' });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
