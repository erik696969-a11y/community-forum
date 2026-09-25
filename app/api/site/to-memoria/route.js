// Kontaktná osoba: jedným klikom presunie zákazku Site Managera do Memorie ako výberové konanie.
// Záznam v Memorii vytvorí databázová funkcia sm_push_to_memoria (overí rolu), dokumenty ponúk
// sa skopírujú z úložiska „site“ do „memoria“ s právami prihláseného používateľa.

import { siteAuth } from '../../../../lib/siteServer';

export const maxDuration = 60;

const safeName = (n) => String(n || 'quotation').replace(/[^\w.\-]+/g, '_').slice(-80);

export async function POST(request) {
  const { me, db, error } = await siteAuth(request);
  if (error) return error;
  if (!me?.point_of_contact) return Response.json({ error: 'Only the point of contact can send a work to Memoria.' }, { status: 403 });

  try {
    const { workId } = await request.json().catch(() => ({}));
    const { data, error: pushErr } = await db.rpc('sm_push_to_memoria', { p_work_id: workId });
    if (pushErr) return Response.json({ error: pushErr.message }, { status: 400 });

    let copied = 0;
    const failed = [];
    for (const q of data.quotes || []) {
      if (!q.doc_path) continue;
      const { data: blob, error: dlErr } = await db.storage.from('site').download(q.doc_path);
      if (dlErr || !blob) {
        failed.push(q.supplier);
        continue;
      }
      const name = safeName(q.doc_path.split('/').pop());
      const path = `tenders/${data.tender_id}/${crypto.randomUUID()}-${name}`;
      const { error: upErr } = await db.storage.from('memoria').upload(path, blob, { contentType: blob.type || undefined });
      if (upErr) {
        failed.push(q.supplier);
        continue;
      }
      const { error: docErr } = await db.from('memoria_documents').insert({
        title: `Quotation · ${q.supplier} · ${data.reference}`,
        doc_type: 'quote',
        storage_path: path,
        entity_type: 'quote',
        entity_id: q.quote_id,
        notes: `Copied from the Site Manager record ${data.reference}.`,
      });
      if (docErr) failed.push(q.supplier);
      else copied += 1;
    }
    return Response.json({ ok: true, tenderId: data.tender_id, reference: data.reference, documents: copied, failed });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
