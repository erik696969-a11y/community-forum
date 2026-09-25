'use client';

// Nahratie cenových ponúk k zákazke: AI prečíta PDF/fotky, člen boardu údaje
// skontroluje a opraví, až potom sa uložia (ponuka + prípadne nový dodávateľ
// + originálny dokument ako príloha). AI nič neukladá ani nerozhoduje.

import { useEffect, useState } from 'react';
import { supabase } from '../../../lib/supabaseClient';
import { mt, formatMoney, todayIso, SUPPLIER_CATEGORIES, MAX_UPLOAD_BYTES } from '../../../lib/memoriaI18n';
import { Field, ErrorBox } from './MemoriaUi';

const MAX_FILES = 5;
const ACCEPT = 'application/pdf,image/jpeg,image/png,image/webp';

function normName(s) {
  return (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\b(s\.?\s?l\.?u?|s\.?\s?a\.?|sociedad limitada|ltd|slu)\b/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function matchSupplier(data, suppliers) {
  const tax = (data.tax_id || '').replace(/[\s.-]/g, '').toUpperCase();
  if (tax) {
    const byTax = suppliers.find((s) => (s.tax_id || '').replace(/[\s.-]/g, '').toUpperCase() === tax);
    if (byTax) return byTax.id;
  }
  const n = normName(data.supplier_name);
  if (!n) return '';
  const byName = suppliers.find((s) => {
    const sn = normName(s.name);
    return sn && (sn === n || sn.includes(n) || n.includes(sn));
  });
  return byName ? byName.id : '';
}

function safeName(name) {
  return name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9._-]+/g, '_').slice(-80);
}

function buildNotes(d, lang) {
  const lines = [];
  if (d.price_period && d.price_period !== 'one_off' && d.price_period !== 'unknown') lines.push(`[${mt(lang, `freq_${d.price_period}`)}]`);
  if (d.quote_number) lines.push(`Ref. ${d.quote_number}`);
  if (d.scope_summary) lines.push(d.scope_summary);
  for (const c of d.key_conditions || []) lines.push(`• ${c}`);
  return lines.join('\n');
}

export default function QuoteUploader({ lang, tender, onDone, onCancel, onClose }) {
  const [suppliers, setSuppliers] = useState([]);
  const [phase, setPhase] = useState('pick'); // pick | uploading | reading | review | saving | done
  const [error, setError] = useState('');
  const [items, setItems] = useState([]);
  const [savedCount, setSavedCount] = useState(0);

  useEffect(() => {
    supabase
      .from('memoria_suppliers')
      .select('id, name, tax_id')
      .order('name', { ascending: true })
      .then(({ data }) => setSuppliers(data || []));
  }, []);

  async function handleFiles(fileList) {
    const files = Array.from(fileList || []);
    if (files.length === 0) return;
    if (files.length > MAX_FILES) {
      setError(mt(lang, 'aiTooMany'));
      return;
    }
    const tooBig = files.find((f) => f.size > MAX_UPLOAD_BYTES);
    if (tooBig) {
      setError(`${tooBig.name}: > 25 MB`);
      return;
    }
    setError('');
    setPhase('uploading');
    const uploaded = [];
    for (const f of files) {
      const path = `tenders/${tender.id}/${crypto.randomUUID()}-${safeName(f.name)}`;
      const { error: upErr } = await supabase.storage.from('memoria').upload(path, f, { contentType: f.type || undefined });
      if (upErr) {
        setError(mt(lang, 'saveError', { error: upErr.message }));
        setPhase('pick');
        return;
      }
      uploaded.push({ path, fileName: f.name, mime: f.type });
    }

    setPhase('reading');
    const {
      data: { session },
    } = await supabase.auth.getSession();
    let results = [];
    try {
      const res = await fetch('/api/memoria/extract-quote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token || ''}` },
        body: JSON.stringify({ paths: uploaded.map((u) => u.path) }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || res.statusText);
      results = json.results || [];
    } catch (e) {
      setError(mt(lang, 'saveError', { error: e.message }));
      results = uploaded.map((u) => ({ path: u.path, ok: false }));
    }

    const next = uploaded.map((u) => {
      const r = results.find((x) => x.path === u.path) || { ok: false };
      const d = r.ok ? r.data || {} : {};
      const net = typeof d.amount_net === 'number' ? d.amount_net : null;
      const total = typeof d.amount_total === 'number' ? d.amount_total : null;
      return {
        ...u,
        ok: r.ok,
        isQuote: r.ok ? d.is_quote !== false : true,
        uncertain: new Set(d.uncertain_fields || []),
        raw: d,
        include: r.ok && d.is_quote !== false,
        supplier_id: r.ok ? matchSupplier(d, suppliers) : '',
        new_name: d.supplier_name || '',
        new_tax_id: d.tax_id || '',
        new_category: SUPPLIER_CATEGORIES.includes(d.category) ? d.category : tender.category && SUPPLIER_CATEGORIES.includes(tender.category) ? tender.category : 'other',
        new_contact: d.contact_person || '',
        new_phone: d.phone || '',
        new_email: d.email || '',
        new_website: d.website || '',
        amount: net !== null ? String(net) : total !== null ? String(total) : '',
        vat_included: net === null && total !== null,
        net,
        total,
        currency: (d.currency || tender.currency || 'EUR').toUpperCase().slice(0, 3),
        submitted_on: d.quote_date || todayIso(),
        valid_until: d.valid_until || '',
        notes: r.ok ? buildNotes(d, lang) : '',
        period: d.price_period || 'unknown',
      };
    });
    setItems(next);
    setPhase('review');
  }

  function setItem(i, patch) {
    setItems((prev) => prev.map((it, j) => (j === i ? { ...it, ...patch } : it)));
  }

  async function saveAll() {
    setPhase('saving');
    setError('');
    let count = 0;
    const createdSuppliers = {};
    for (const it of items) {
      if (!it.include) continue;
      let supplierId = it.supplier_id;
      if (!supplierId) {
        const key = normName(it.new_name);
        if (createdSuppliers[key]) {
          supplierId = createdSuppliers[key];
        } else {
          const { data: s, error: sErr } = await supabase
            .from('memoria_suppliers')
            .insert({
              name: it.new_name.trim() || it.fileName,
              tax_id: it.new_tax_id.trim() || null,
              category: it.new_category,
              contact_person: it.new_contact.trim() || null,
              phone: it.new_phone.trim() || null,
              email: it.new_email.trim() || null,
              website: it.new_website.trim() || null,
              status: 'active',
              notes: 'Created from an uploaded quote (AI-read, checked by the board).',
              is_demo: tender.is_demo,
            })
            .select('id')
            .single();
          if (sErr) {
            setError(`${it.fileName}: ${sErr.code === '23505' ? mt(lang, 'duplicateTaxId') : sErr.message}`);
            continue;
          }
          supplierId = s.id;
          createdSuppliers[key] = s.id;
        }
      }
      const amount = Number(String(it.amount).replace(',', '.'));
      if (!Number.isFinite(amount)) {
        setError(`${it.fileName}: ${mt(lang, 'amount')} — ${mt(lang, 'required')}`);
        continue;
      }
      const { data: q, error: qErr } = await supabase
        .from('memoria_quotes')
        .insert({
          tender_id: tender.id,
          supplier_id: supplierId,
          amount,
          vat_included: it.vat_included,
          currency: it.currency || 'EUR',
          submitted_on: it.submitted_on || null,
          valid_until: it.valid_until || null,
          notes: it.notes.trim() || null,
          is_demo: tender.is_demo,
        })
        .select('id')
        .single();
      if (qErr) {
        setError(`${it.fileName}: ${qErr.message}`);
        continue;
      }
      await supabase.from('memoria_documents').insert({
        title: it.fileName,
        doc_type: 'quote',
        storage_path: it.path,
        document_date: it.submitted_on || null,
        entity_type: 'quote',
        entity_id: q.id,
        is_demo: tender.is_demo,
      });
      count += 1;
    }
    // Nahraté, ale neuložené súbory zmažeme, aby v úložisku neostávali siroty.
    const unused = items.filter((it) => !it.include).map((it) => it.path);
    if (unused.length) await supabase.storage.from('memoria').remove(unused);
    setSavedCount(count);
    setPhase('done');
    onDone?.();
  }

  async function cancelAll() {
    const paths = items.map((it) => it.path);
    if (paths.length) await supabase.storage.from('memoria').remove(paths);
    onCancel?.();
  }

  const warn = (it, field) => (it.uncertain.has(field) ? 'ring-2 ring-ochre' : '');
  const warnMark = (it, field) => (it.uncertain.has(field) ? ' ⚠' : '');

  return (
    <div className="mt-3 rounded-lg border-2 border-harbor/20 bg-sand/40 p-3 space-y-3">
      <p className="text-sm font-semibold text-harbor">🤖 {mt(lang, 'aiUpload')}</p>

      {phase === 'pick' && (
        <>
          <p className="text-xs text-ink/60">{mt(lang, 'aiUploadHint')}</p>
          <input type="file" multiple accept={ACCEPT} className="text-sm" onChange={(e) => handleFiles(e.target.files)} />
          <ErrorBox message={error} />
          <button className="btn-secondary text-sm" onClick={onCancel}>{mt(lang, 'cancel')}</button>
        </>
      )}

      {phase === 'uploading' && <p className="text-sm text-ink/70 animate-pulse">⏫ {mt(lang, 'aiUploading')}</p>}
      {phase === 'reading' && <p className="text-sm text-ink/70 animate-pulse">🤖 {mt(lang, 'aiReading', { n: '…' })}</p>}

      {(phase === 'review' || phase === 'saving') && (
        <>
          <p className="text-sm font-semibold text-ink">{mt(lang, 'aiReview')}</p>
          <p className="text-xs text-ink/60 italic">{mt(lang, 'aiDisclaimer')}</p>
          <ErrorBox message={error} />
          {items.map((it, i) => (
            <div key={it.path} className={`card p-3 space-y-2 ${it.include ? '' : 'opacity-60'}`}>
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <p className="text-sm font-semibold text-ink">📄 {it.fileName}</p>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={it.include} onChange={(e) => setItem(i, { include: e.target.checked })} />
                  {mt(lang, 'aiInclude')}
                </label>
              </div>
              {!it.ok && <p className="text-sm text-red-700">{mt(lang, 'aiFailed')}</p>}
              {it.ok && !it.isQuote && <p className="text-sm text-red-700">{mt(lang, 'aiNotQuote')}</p>}

              <Field label={`${mt(lang, 'supplier')}${warnMark(it, 'supplier_name')}`}>
                <select className={`input-field ${warn(it, 'supplier_name')}`} value={it.supplier_id} onChange={(e) => setItem(i, { supplier_id: e.target.value })}>
                  <option value="">{mt(lang, 'aiNewSupplier', { name: it.new_name || '?' })}</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </Field>
              {it.supplier_id ? (
                <p className="text-xs text-sea">✓ {mt(lang, 'aiMatched')}</p>
              ) : (
                <div className="grid sm:grid-cols-3 gap-2">
                  <Field label={mt(lang, 'supplierName')}>
                    <input className="input-field" value={it.new_name} onChange={(e) => setItem(i, { new_name: e.target.value })} />
                  </Field>
                  <Field label={`${mt(lang, 'taxId')}${warnMark(it, 'tax_id')}`}>
                    <input className={`input-field ${warn(it, 'tax_id')}`} value={it.new_tax_id} onChange={(e) => setItem(i, { new_tax_id: e.target.value })} />
                  </Field>
                  <Field label={mt(lang, 'category')}>
                    <select className="input-field" value={it.new_category} onChange={(e) => setItem(i, { new_category: e.target.value })}>
                      {SUPPLIER_CATEGORIES.map((c) => (
                        <option key={c} value={c}>{mt(lang, `cat_${c}`)}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label={mt(lang, 'contactPerson')}>
                    <input className="input-field" value={it.new_contact} onChange={(e) => setItem(i, { new_contact: e.target.value })} />
                  </Field>
                  <Field label={mt(lang, 'phone')}>
                    <input className="input-field" value={it.new_phone} onChange={(e) => setItem(i, { new_phone: e.target.value })} />
                  </Field>
                  <Field label={mt(lang, 'email')}>
                    <input className="input-field" value={it.new_email} onChange={(e) => setItem(i, { new_email: e.target.value })} />
                  </Field>
                </div>
              )}

              <div className="grid sm:grid-cols-4 gap-2 items-end">
                <Field label={`${mt(lang, 'amount')}${warnMark(it, it.vat_included ? 'amount_total' : 'amount_net')}`}>
                  <input
                    type="number"
                    step="0.01"
                    className={`input-field ${warn(it, it.vat_included ? 'amount_total' : 'amount_net')}`}
                    value={it.amount}
                    onChange={(e) => setItem(i, { amount: e.target.value })}
                  />
                </Field>
                <label className="flex items-center gap-2 text-sm pb-3">
                  <input
                    type="checkbox"
                    checked={it.vat_included}
                    onChange={(e) => {
                      const incl = e.target.checked;
                      const v = incl ? it.total : it.net;
                      setItem(i, { vat_included: incl, amount: v !== null && v !== undefined ? String(v) : it.amount });
                    }}
                  />
                  {mt(lang, 'vatIncluded')}
                </label>
                <Field label={`${mt(lang, 'submittedOn')}${warnMark(it, 'quote_date')}`}>
                  <input type="date" className={`input-field ${warn(it, 'quote_date')}`} value={it.submitted_on} onChange={(e) => setItem(i, { submitted_on: e.target.value })} />
                </Field>
                <Field label={`${mt(lang, 'validUntil')}${warnMark(it, 'valid_until')}`}>
                  <input type="date" className={`input-field ${warn(it, 'valid_until')}`} value={it.valid_until} onChange={(e) => setItem(i, { valid_until: e.target.value })} />
                </Field>
              </div>
              {(it.net !== null || it.total !== null) && (
                <p className="text-xs text-ink/60">
                  {mt(lang, 'aiPriceNet')}: {it.net !== null ? formatMoney(it.net, it.currency, lang) : '—'} · {mt(lang, 'aiPriceTotal')}:{' '}
                  {it.total !== null ? formatMoney(it.total, it.currency, lang) : '—'} · {mt(lang, 'aiPeriod')}: {mt(lang, `freq_${it.period}`)}
                </p>
              )}
              <Field label={mt(lang, 'aiConditions')}>
                <textarea rows={4} className="input-field text-sm" value={it.notes} onChange={(e) => setItem(i, { notes: e.target.value })} />
              </Field>
            </div>
          ))}
          <div className="flex gap-2">
            <button className="btn-primary text-sm" disabled={phase === 'saving' || !items.some((x) => x.include)} onClick={saveAll}>
              {phase === 'saving' ? mt(lang, 'saving') : mt(lang, 'aiSaveAll')}
            </button>
            <button className="btn-secondary text-sm" disabled={phase === 'saving'} onClick={cancelAll}>{mt(lang, 'cancel')}</button>
          </div>
        </>
      )}

      {phase === 'done' && (
        <>
          <p className="text-sm text-sea">✓ {mt(lang, 'aiSaved', { n: savedCount })}</p>
          <ErrorBox message={error} />
          <button className="btn-secondary text-sm" onClick={onClose}>OK</button>
        </>
      )}
    </div>
  );
}
