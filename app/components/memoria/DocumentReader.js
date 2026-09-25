'use client';

// Tlačidlo „AI prečíta dokument“: nahrá PDF/fotku zmluvy alebo faktúry do súkromného
// bucketu, AI vráti návrh údajov a rodičovský formulár sa predvyplní.
// Uloženie ostáva na členovi boardu (princíp MIA).

import { useRef, useState } from 'react';
import { supabase } from '../../../lib/supabaseClient';
import { mt, MAX_UPLOAD_BYTES } from '../../../lib/memoriaI18n';
import { matchSupplier } from '../../../lib/importParse';

function safeName(name) {
  return String(name || 'file').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9._-]+/g, '_').slice(-80);
}

// onRead({ data, file: { path, name, type }, supplierId })
export default function DocumentReader({ lang, kind, label, onRead }) {
  const input = useRef(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  async function handle(file) {
    if (!file) return;
    setError('');
    if (file.size > MAX_UPLOAD_BYTES) return setError(mt(lang, 'fileTooLarge'));
    if (!/\.(pdf|png|jpe?g|webp)$/i.test(file.name)) return setError(mt(lang, 'importUnsupported'));
    try {
      setBusy(mt(lang, 'uploading'));
      const path = `inbox/${crypto.randomUUID()}/${safeName(file.name)}`;
      const up = await supabase.storage.from('memoria').upload(path, file, { contentType: file.type || undefined });
      if (up.error) throw new Error(up.error.message);
      setBusy(mt(lang, 'importAiReading'));
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const res = await fetch('/api/memoria/extract-document', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token || ''}` },
        body: JSON.stringify({ kind, path, lang }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || res.statusText);
      const { data: sups } = await supabase.from('memoria_suppliers').select('id, name, tax_id, is_demo');
      const m = matchSupplier({ supplier_name: json.data?.supplier_name, supplier_tax_id: json.data?.tax_id }, sups || []);
      const demoMode = (sups || []).some((s) => s.is_demo);
      onRead({ data: json.data || {}, file: { path, name: file.name, type: file.type }, supplierId: m?.supplier.id || '', demoMode });
    } catch (e) {
      setError(mt(lang, 'saveError', { error: e.message }));
    } finally {
      setBusy('');
      if (input.current) input.current.value = '';
    }
  }

  return (
    <span className="inline-flex flex-col items-end gap-1">
      <input ref={input} type="file" accept="application/pdf,image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => handle(e.target.files?.[0])} />
      <button type="button" className="btn-secondary text-sm" disabled={Boolean(busy)} onClick={() => input.current?.click()}>
        🤖 {busy || label}
      </button>
      {error && <span className="text-xs text-red-700 max-w-xs text-right">{error}</span>}
    </span>
  );
}

// Poznámka pod formulárom: čo AI prečítala, čo overiť, a tlačidlo na založenie dodávateľa.
const FIELD_LABEL = {
  supplier_name: 'supplier', tax_id: 'taxId', subject: 'subject', signed_on: 'signedOn', starts_on: 'startsOn', ends_on: 'endsOn',
  auto_renew: 'autoRenew', notice_period_days: 'noticePeriodDays', amount: 'amount', amount_period: 'paymentFrequency', signed_by: 'signedBy',
  invoice_number: 'invoiceNumber', invoice_date: 'invoiceDate', due_date: 'dueDate', paid_on: 'paidOn', net_amount: 'netAmount',
  vat_amount: 'vatAmount', total_amount: 'totalAmount', description: 'description', category: 'category', currency: 'currency',
};

export function ReadNotice({ lang, read, onCreateSupplier, onToggleDemo }) {
  if (!read) return null;
  const d = read.data || {};
  const unsure = (d.uncertain_fields || []).filter(Boolean).map((f) => (FIELD_LABEL[f] ? mt(lang, FIELD_LABEL[f]) : f));
  const notDoc = d.is_contract === false || d.is_invoice === false;
  return (
    <div className="rounded-md border border-sea/40 bg-sea/5 px-3 py-2 text-sm space-y-1">
      <p className="text-ink">🤖 {mt(lang, 'docReadFrom', { file: read.file.name })}</p>
      {notDoc && <p className="text-red-700">{mt(lang, 'docNotThisKind')}</p>}
      {unsure.length > 0 && <p className="text-ochre">{mt(lang, 'docCheckFields', { fields: unsure.join(', ') })}</p>}
      {!read.supplierId && d.supplier_name && (
        <p className="text-ink/70">
          {mt(lang, 'docSupplierMissing', { name: `${d.supplier_name}${d.tax_id ? ` (${d.tax_id})` : ''}` })}{' '}
          <button type="button" className="text-harbor font-semibold hover:underline" onClick={onCreateSupplier}>
            + {mt(lang, 'docCreateSupplier')}
          </button>
        </p>
      )}
      <label className="flex items-center gap-2 text-xs text-ink/70">
        <input type="checkbox" checked={Boolean(read.demoMode)} onChange={(e) => onToggleDemo?.(e.target.checked)} />
        {mt(lang, 'importAsDemo')}
      </label>
      <p className="text-xs text-ink/50">{mt(lang, 'docAttachNote')}</p>
    </div>
  );
}

// Založí dodávateľa z prečítaných údajov a vráti jeho id.
export async function createSupplierFromRead(read, category, isDemo) {
  const d = read.data || {};
  const { data, error } = await supabase
    .from('memoria_suppliers')
    .insert({ name: d.supplier_name, tax_id: d.tax_id || null, category: category || d.category || 'other', status: 'active', is_demo: Boolean(isDemo) })
    .select('id')
    .single();
  if (error) throw new Error(error.message);
  return data.id;
}

// Po uložení záznamu pripojí prečítaný súbor ako prílohu.
export async function attachReadFile(read, entityType, entityId, docType, documentDate, isDemo) {
  if (!read?.file?.path) return;
  await supabase.from('memoria_documents').insert({
    title: read.file.name,
    doc_type: docType,
    storage_path: read.file.path,
    document_date: documentDate || null,
    entity_type: entityType,
    entity_id: entityId,
    is_demo: Boolean(isDemo),
  });
}
