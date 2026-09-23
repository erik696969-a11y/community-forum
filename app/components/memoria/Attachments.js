'use client';

// Prílohy naviazané na jeden záznam Memorie (rozhodnutie, dodávateľ,
// zmluva, zákazka, ponuka, faktúra). Súbory idú do súkromného bucketu
// „memoria“ (prístup len pre board); otvárajú sa cez krátkodobý podpísaný odkaz.

import { useEffect, useState } from 'react';
import { supabase } from '../../../lib/supabaseClient';
import { getSignedUrl } from '../../../lib/storageClient';
import { formatDate } from '../../../lib/formatDate';
import { mt, DOC_TYPES, MAX_UPLOAD_BYTES, cleanFormValues } from '../../../lib/memoriaI18n';
import { Field, ErrorBox, Pill } from './MemoriaUi';

const BUCKET = 'memoria';

// Pri mazaní záznamu odstráni aj jeho prílohy a polymorfné väzby na rozhodnutia
// (tie nemajú cudzí kľúč, databáza by ich sama nezmazala).
export async function removeEntityExtras(entityType, entityId) {
  const { data } = await supabase
    .from('memoria_documents')
    .select('id, storage_path')
    .eq('entity_type', entityType)
    .eq('entity_id', entityId);
  const paths = (data || []).map((d) => d.storage_path).filter(Boolean);
  if (data && data.length > 0) {
    await supabase.from('memoria_documents').delete().in('id', data.map((d) => d.id));
  }
  if (paths.length > 0) await supabase.storage.from(BUCKET).remove(paths);
  await supabase.from('memoria_decision_links').delete().eq('entity_type', entityType).eq('entity_id', entityId);
}

export default function Attachments({ lang, entityType, entityId, defaultType = 'other' }) {
  const [docs, setDocs] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ title: '', doc_type: defaultType, document_date: '', external_url: '' });
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function load() {
    const { data, error: err } = await supabase
      .from('memoria_documents')
      .select('*')
      .eq('entity_type', entityType)
      .eq('entity_id', entityId)
      .order('created_at', { ascending: false });
    if (err) setError(err.message);
    setDocs(data || []);
    setLoaded(true);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entityType, entityId]);

  function openForm() {
    setForm({ title: '', doc_type: defaultType, document_date: '', external_url: '' });
    setFile(null);
    setError('');
    setAdding(true);
  }

  async function handleSave(e) {
    e.preventDefault();
    setError('');
    const values = cleanFormValues(form);
    if (!file && !values.external_url) {
      setError(mt(lang, 'fileOrLinkRequired'));
      return;
    }
    if (file && file.size > MAX_UPLOAD_BYTES) {
      setError(mt(lang, 'fileTooLarge'));
      return;
    }
    setBusy(true);

    let storagePath = null;
    if (file) {
      const ext = (file.name.split('.').pop() || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '');
      storagePath = `${entityType}/${entityId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      const { error: upErr } = await supabase.storage.from(BUCKET).upload(storagePath, file, {
        contentType: file.type || undefined,
      });
      if (upErr) {
        setBusy(false);
        setError(mt(lang, 'saveError', { error: upErr.message }));
        return;
      }
    }

    const { error: insErr } = await supabase.from('memoria_documents').insert({
      ...values,
      title: values.title || (file ? file.name : values.external_url),
      storage_path: storagePath,
      external_url: file ? null : values.external_url,
      entity_type: entityType,
      entity_id: entityId,
    });
    if (insErr && storagePath) {
      // Záznam sa neuložil — neponechávať osirelý súbor v úložisku.
      await supabase.storage.from(BUCKET).remove([storagePath]);
    }
    setBusy(false);
    if (insErr) {
      setError(mt(lang, 'saveError', { error: insErr.message }));
      return;
    }
    setAdding(false);
    load();
  }

  async function handleOpen(doc) {
    if (doc.external_url) {
      window.open(doc.external_url, '_blank', 'noopener');
      return;
    }
    // Okno otvoríme hneď (inak ho prehliadač zablokuje ako vyskakovacie okno).
    const win = window.open('', '_blank');
    const url = await getSignedUrl(BUCKET, doc.storage_path, 300);
    if (url && win) win.location.href = url;
    else {
      win?.close();
      setError(mt(lang, 'saveError', { error: 'file not available' }));
    }
  }

  async function handleDelete(doc) {
    if (!window.confirm(mt(lang, 'confirmDelete', { name: doc.title }))) return;
    const { error: delErr } = await supabase.from('memoria_documents').delete().eq('id', doc.id);
    if (delErr) {
      setError(mt(lang, 'saveError', { error: delErr.message }));
      return;
    }
    if (doc.storage_path) await supabase.storage.from(BUCKET).remove([doc.storage_path]);
    load();
  }

  return (
    <div>
      <p className="text-xs font-semibold text-ink/50 uppercase tracking-wide mb-1">📎 {mt(lang, 'attachments')}</p>
      {loaded && docs.length === 0 && !adding && <p className="text-sm text-ink/50">{mt(lang, 'noAttachments')}</p>}
      {docs.length > 0 && (
        <ul className="text-sm space-y-1 mb-2">
          {docs.map((d) => (
            <li key={d.id} className="flex items-center gap-2 flex-wrap">
              <button type="button" className="text-harbor hover:underline text-left" onClick={() => handleOpen(d)}>
                {d.external_url ? '🔗' : '📄'} {d.title}
              </button>
              <Pill>{mt(lang, `doc_${d.doc_type}`)}</Pill>
              {d.document_date && <span className="text-xs text-ink/50">{formatDate(d.document_date, lang)}</span>}
              <button type="button" className="text-xs text-red-600 hover:underline" onClick={() => handleDelete(d)}>
                {mt(lang, 'delete')}
              </button>
            </li>
          ))}
        </ul>
      )}
      {adding ? (
        <form onSubmit={handleSave} className="mt-2 grid sm:grid-cols-2 gap-2 bg-sand/60 rounded-lg p-3">
          <Field label={mt(lang, 'file')}>
            <input type="file" className="text-sm" onChange={(e) => setFile(e.target.files?.[0] || null)} />
          </Field>
          <Field label={mt(lang, 'orLink')}>
            <input
              type="url"
              className="input-field"
              placeholder="https://"
              value={form.external_url}
              disabled={Boolean(file)}
              onChange={(e) => setForm((p) => ({ ...p, external_url: e.target.value }))}
            />
          </Field>
          <Field label={mt(lang, 'attachmentTitle')}>
            <input className="input-field" value={form.title} onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))} />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label={mt(lang, 'attachmentType')}>
              <select className="input-field" value={form.doc_type} onChange={(e) => setForm((p) => ({ ...p, doc_type: e.target.value }))}>
                {DOC_TYPES.map((dt) => (
                  <option key={dt} value={dt}>{mt(lang, `doc_${dt}`)}</option>
                ))}
              </select>
            </Field>
            <Field label={mt(lang, 'documentDate')}>
              <input type="date" className="input-field" value={form.document_date} onChange={(e) => setForm((p) => ({ ...p, document_date: e.target.value }))} />
            </Field>
          </div>
          <div className="sm:col-span-2"><ErrorBox message={error} /></div>
          <div className="sm:col-span-2 flex gap-2">
            <button type="submit" className="btn-primary text-sm" disabled={busy}>
              {busy ? mt(lang, 'uploading') : mt(lang, 'save')}
            </button>
            <button type="button" className="btn-secondary text-sm" onClick={() => setAdding(false)}>
              {mt(lang, 'cancel')}
            </button>
          </div>
        </form>
      ) : (
        <>
          <ErrorBox message={error} />
          <button type="button" className="text-sm text-harbor hover:underline" onClick={openForm}>
            + {mt(lang, 'addAttachment')}
          </button>
        </>
      )}
    </div>
  );
}
