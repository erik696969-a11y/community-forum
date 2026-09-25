'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../../lib/supabaseClient';
import { formatDate } from '../../../lib/formatDate';
import { mt, cleanFormValues, formatMoney, todayIso, TENDER_STATUSES } from '../../../lib/memoriaI18n';
import { Field, Pill, ErrorBox, DetailRow, DemoPill } from './MemoriaUi';
import Attachments, { removeEntityExtras } from './Attachments';
import QuoteUploader from './QuoteUploader';
import TenderAnalysis from './TenderAnalysis';
import { getSignedUrl } from '../../../lib/storageClient';

const EMPTY_FORM = {
  title: '',
  description: '',
  category: '',
  opened_on: '',
  status: 'collecting',
  approved_budget: '',
  currency: 'EUR',
  selected_supplier_id: '',
  selection_reason: '',
  approved_by_decision_id: '',
};
const EMPTY_QUOTE = { supplier_id: '', amount: '', vat_included: false, submitted_on: '', valid_until: '', notes: '' };
const STATUS_TONE = { collecting: 'ochre', decided: 'green', cancelled: 'neutral' };

function toForm(t) {
  const form = { ...EMPTY_FORM };
  for (const key of Object.keys(EMPTY_FORM)) {
    const v = t[key];
    form[key] = v === null || v === undefined ? '' : String(v);
  }
  return form;
}

export default function TendersPanel({ lang, onChanged }) {
  const [tenders, setTenders] = useState([]);
  const [quotes, setQuotes] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [decisions, setDecisions] = useState([]);
  const [loadingData, setLoadingData] = useState(true);
  const [loadError, setLoadError] = useState('');

  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [expanded, setExpanded] = useState({});

  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const [quoteFor, setQuoteFor] = useState(null);
  const [quoteForm, setQuoteForm] = useState(EMPTY_QUOTE);
  const [quoteError, setQuoteError] = useState('');
  const [aiFor, setAiFor] = useState(null);
  const [compareFor, setCompareFor] = useState(null);
  const [quoteDocs, setQuoteDocs] = useState({});
  const [conflicts, setConflicts] = useState([]);

  async function load() {
    const [tRes, qRes, sRes, dRes, docRes] = await Promise.all([
      supabase.from('memoria_tenders').select('*').order('created_at', { ascending: false }),
      supabase.from('memoria_quotes').select('*').order('amount', { ascending: true }),
      supabase.from('memoria_suppliers').select('id, name').order('name', { ascending: true }),
      supabase.from('memoria_decisions').select('id, title, decided_on').order('decided_on', { ascending: false }),
      supabase.from('memoria_documents').select('entity_id, storage_path, title').eq('entity_type', 'quote').not('storage_path', 'is', null),
    ]);
    setQuoteDocs(Object.fromEntries((docRes.data || []).map((d) => [d.entity_id, d])));
    const firstError = tRes.error || qRes.error || sRes.error || dRes.error;
    setLoadError(firstError ? firstError.message : '');
    setTenders(tRes.data || []);
    setQuotes(qRes.data || []);
    setSuppliers(sRes.data || []);
    setDecisions(dRes.data || []);
    setLoadingData(false);
  }

  useEffect(() => {
    load();
    // Deklarované konflikty záujmov voči Site Managerovi (pre zákazky, ktoré obstarala ona).
    supabase.rpc('sm_active_conflicts').then(({ data }) => setConflicts(Array.isArray(data) ? data : []));
  }, []);

  const supplierName = useMemo(() => Object.fromEntries(suppliers.map((s) => [s.id, s.name])), [suppliers]);
  const decisionById = useMemo(() => Object.fromEntries(decisions.map((d) => [d.id, d])), [decisions]);
  const quotesByTender = useMemo(() => {
    const map = {};
    for (const q of quotes) (map[q.tender_id] ||= []).push(q);
    return map;
  }, [quotes]);

  const visible = tenders.filter((t) => {
    if (statusFilter && t.status !== statusFilter) return false;
    if (query) {
      const q = query.toLowerCase();
      const haystack = [t.title, t.description, t.category, supplierName[t.selected_supplier_id]].join(' ').toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });

  function openNew() {
    setForm({ ...EMPTY_FORM, opened_on: todayIso() });
    setFormError('');
    setEditingId('new');
  }

  function openEdit(t) {
    setForm(toForm(t));
    setFormError('');
    setEditingId(t.id);
  }

  function closeForm() {
    setEditingId(null);
    setFormError('');
  }

  function setField(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSave(e) {
    e.preventDefault();
    const values = cleanFormValues(form, ['approved_budget']);
    if (!values.title) {
      setFormError(`${mt(lang, 'decisionTitle')}: ${mt(lang, 'required')}`);
      return;
    }
    if (!values.currency) values.currency = 'EUR';
    setSaving(true);
    setFormError('');
    const { error } =
      editingId === 'new'
        ? await supabase.from('memoria_tenders').insert(values)
        : await supabase.from('memoria_tenders').update(values).eq('id', editingId);
    setSaving(false);
    if (error) {
      setFormError(mt(lang, 'saveError', { error: error.message }));
      return;
    }
    closeForm();
    await load();
    onChanged?.();
  }

  async function handleDelete(t) {
    if (!window.confirm(mt(lang, 'confirmDelete', { name: t.title }))) return;
    const quoteIds = (quotesByTender[t.id] || []).map((q) => q.id);
    const { error } = await supabase.from('memoria_tenders').delete().eq('id', t.id);
    if (error) {
      window.alert(mt(lang, 'saveError', { error: error.message }));
      return;
    }
    await removeEntityExtras('tender', t.id);
    for (const id of quoteIds) await removeEntityExtras('quote', id);
    await load();
    onChanged?.();
  }

  function openQuote(tenderId) {
    setQuoteFor(tenderId);
    setQuoteForm({ ...EMPTY_QUOTE, submitted_on: todayIso() });
    setQuoteError('');
  }

  async function saveQuote(e, tender) {
    e.preventDefault();
    const values = cleanFormValues({ ...quoteForm, tender_id: tender.id, currency: tender.currency || 'EUR' }, ['amount']);
    if (!values.supplier_id || values.amount === null || values.amount === undefined) {
      setQuoteError(`${mt(lang, 'supplier')}, ${mt(lang, 'amount')}: ${mt(lang, 'required')}`);
      return;
    }
    const { error } = await supabase.from('memoria_quotes').insert(values);
    if (error) {
      setQuoteError(mt(lang, 'saveError', { error: error.message }));
      return;
    }
    setQuoteFor(null);
    await load();
    onChanged?.();
  }

  async function deleteQuote(q) {
    if (!window.confirm(mt(lang, 'confirmDelete', { name: `${supplierName[q.supplier_id] || ''} ${formatMoney(q.amount, q.currency, lang)}` }))) return;
    const { error } = await supabase.from('memoria_quotes').delete().eq('id', q.id);
    if (error) {
      window.alert(mt(lang, 'saveError', { error: error.message }));
      return;
    }
    await removeEntityExtras('quote', q.id);
    await load();
    onChanged?.();
  }

  async function chooseQuote(tender, q) {
    const reason = window.prompt(mt(lang, 'chooseReasonPrompt'), tender.selection_reason || '');
    if (reason === null) return;
    const { error } = await supabase
      .from('memoria_tenders')
      .update({ selected_supplier_id: q.supplier_id, status: 'decided', selection_reason: reason.trim() || null })
      .eq('id', tender.id);
    if (error) {
      window.alert(mt(lang, 'saveError', { error: error.message }));
      return;
    }
    await load();
    onChanged?.();
  }

  const formBlock = (
    <form onSubmit={handleSave} className="card p-4 space-y-4 mb-6 border-2 border-ochre/40">
      <h3 className="font-display text-lg text-harbor">{editingId === 'new' ? mt(lang, 'newTender') : mt(lang, 'edit')}</h3>
      <div className="grid sm:grid-cols-3 gap-3">
        <Field label={mt(lang, 'decisionTitle')} required className="sm:col-span-2">
          <input className="input-field" value={form.title} onChange={(e) => setField('title', e.target.value)} />
        </Field>
        <Field label={mt(lang, 'openedOn')}>
          <input type="date" className="input-field" value={form.opened_on} onChange={(e) => setField('opened_on', e.target.value)} />
        </Field>
      </div>
      <Field label={mt(lang, 'description')}>
        <textarea rows={3} className="input-field" value={form.description} onChange={(e) => setField('description', e.target.value)} />
      </Field>
      <div className="grid sm:grid-cols-4 gap-3">
        <Field label={mt(lang, 'category')}>
          <input className="input-field" value={form.category} onChange={(e) => setField('category', e.target.value)} />
        </Field>
        <Field label={mt(lang, 'approvedBudget')}>
          <input type="number" step="0.01" min="0" className="input-field" value={form.approved_budget} onChange={(e) => setField('approved_budget', e.target.value)} />
        </Field>
        <Field label={mt(lang, 'currency')}>
          <input className="input-field" maxLength={3} value={form.currency} onChange={(e) => setField('currency', e.target.value.toUpperCase())} />
        </Field>
        <Field label={mt(lang, 'status')}>
          <select className="input-field" value={form.status} onChange={(e) => setField('status', e.target.value)}>
            {TENDER_STATUSES.map((s) => (
              <option key={s} value={s}>{mt(lang, `tenderStatus_${s}`)}</option>
            ))}
          </select>
        </Field>
      </div>
      <div className="grid sm:grid-cols-2 gap-3">
        <Field label={mt(lang, 'selectedSupplier')}>
          <select className="input-field" value={form.selected_supplier_id} onChange={(e) => setField('selected_supplier_id', e.target.value)}>
            <option value="">{mt(lang, 'none')}</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </Field>
        <Field label={mt(lang, 'approvedByDecision')}>
          <select className="input-field" value={form.approved_by_decision_id} onChange={(e) => setField('approved_by_decision_id', e.target.value)}>
            <option value="">{mt(lang, 'none')}</option>
            {decisions.map((d) => (
              <option key={d.id} value={d.id}>{formatDate(d.decided_on, lang)} · {d.title}</option>
            ))}
          </select>
        </Field>
      </div>
      <Field label={mt(lang, 'selectionReason')}>
        <textarea rows={2} className="input-field" value={form.selection_reason} onChange={(e) => setField('selection_reason', e.target.value)} />
      </Field>
      <ErrorBox message={formError} />
      <div className="flex gap-2">
        <button type="submit" className="btn-primary" disabled={saving}>{saving ? mt(lang, 'saving') : mt(lang, 'save')}</button>
        <button type="button" className="btn-secondary" onClick={closeForm}>{mt(lang, 'cancel')}</button>
      </div>
    </form>
  );

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <input className="input-field !w-auto flex-1 min-w-[12rem]" placeholder={mt(lang, 'search')} value={query} onChange={(e) => setQuery(e.target.value)} />
        <select className="input-field !w-auto" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">{mt(lang, 'status')}: {mt(lang, 'all')}</option>
          {TENDER_STATUSES.map((s) => (
            <option key={s} value={s}>{mt(lang, `tenderStatus_${s}`)}</option>
          ))}
        </select>
        {editingId === null && (
          <button className="btn-primary text-sm" onClick={openNew}>+ {mt(lang, 'newTender')}</button>
        )}
      </div>

      {editingId === 'new' && formBlock}
      <ErrorBox message={loadError} />

      {loadingData ? (
        <p className="text-ink/60">{mt(lang, 'loading')}</p>
      ) : tenders.length === 0 ? (
        <p className="text-ink/60">{mt(lang, 'empty')}</p>
      ) : visible.length === 0 ? (
        <p className="text-ink/60">{mt(lang, 'noMatches')}</p>
      ) : (
        <div className="space-y-3">
          {visible.map((t) => {
            if (editingId === t.id) return <div key={t.id}>{formBlock}</div>;
            const tq = quotesByTender[t.id] || [];
            const lowest = tq.length > 0 ? Math.min(...tq.map((q) => Number(q.amount))) : null;
            const mixedVat = tq.length > 1 && new Set(tq.map((q) => q.vat_included)).size > 1;
            return (
              <div key={t.id} className="card p-4">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <p className="font-semibold text-ink">{t.title} <DemoPill show={t.is_demo} /></p>
                    {t.sm_reference && (
                      <p className="text-xs text-harbor mt-1">{mt(lang, 'smFromSiteManager', { ref: t.sm_reference })}</p>
                    )}
                    {t.sm_reference && conflicts.length > 0 && (
                      <div className="mt-2 rounded-md border-l-4 border-ochre bg-ochre/10 px-3 py-2 text-sm text-ink">
                        <b>{mt(lang, 'smRecusedTitle', { names: conflicts.map((c) => c.name).join(', ') })}</b>{' '}
                        {mt(lang, 'smRecusedWhy')}
                        {conflicts[0].minute_ref ? ` (${mt(lang, 'smMinute')} ${conflicts[0].minute_ref})` : ''}
                      </div>
                    )}
                    <div className="flex flex-wrap items-center gap-2 mt-1">
                      <Pill tone={STATUS_TONE[t.status]}>{mt(lang, `tenderStatus_${t.status}`)}</Pill>
                      <Pill tone={tq.length < 2 ? 'ochre' : 'neutral'}>{mt(lang, 'quotes')}: {tq.length}</Pill>
                      {t.approved_budget !== null && (
                        <span className="text-xs text-ink/60">{mt(lang, 'approvedBudget')}: {formatMoney(t.approved_budget, t.currency, lang)}</span>
                      )}
                      {t.selected_supplier_id && (
                        <span className="text-xs text-ink/70">✓ {supplierName[t.selected_supplier_id] || '—'}</span>
                      )}
                    </div>
                  </div>
                  {editingId === null && (
                    <div className="flex gap-3 text-sm flex-shrink-0">
                      <button className="text-harbor hover:underline" onClick={() => openEdit(t)}>{mt(lang, 'edit')}</button>
                      <button className="text-red-600 hover:underline" onClick={() => handleDelete(t)}>{mt(lang, 'delete')}</button>
                    </div>
                  )}
                </div>
                <button className="text-xs text-harbor/70 hover:text-harbor mt-3" onClick={() => setExpanded((p) => ({ ...p, [t.id]: !p[t.id] }))}>
                  {expanded[t.id] ? `▾ ${mt(lang, 'showLess')}` : `▸ ${mt(lang, 'showMore')}`}
                </button>
                {expanded[t.id] && (
                  <div className="mt-3 space-y-4 border-t border-ink/10 pt-3">
                    <DetailRow label={mt(lang, 'description')}>{t.description}</DetailRow>
                    <DetailRow label={mt(lang, 'openedOn')}>{t.opened_on ? formatDate(t.opened_on, lang) : null}</DetailRow>
                    <DetailRow label={mt(lang, 'selectionReason')}>{t.selection_reason}</DetailRow>
                    <DetailRow label={mt(lang, 'approvedByDecision')}>
                      {decisionById[t.approved_by_decision_id]
                        ? `${formatDate(decisionById[t.approved_by_decision_id].decided_on, lang)} · ${decisionById[t.approved_by_decision_id].title}`
                        : null}
                    </DetailRow>

                    <div>
                      <p className="text-xs font-semibold text-ink/50 uppercase tracking-wide mb-2">{mt(lang, 'quotes')}</p>
                      {tq.length === 0 ? (
                        <p className="text-sm text-ink/50">{mt(lang, 'noQuotes')}</p>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <tbody>
                              {tq.map((q) => {
                                const isLowest = tq.length > 1 && Number(q.amount) === lowest;
                                const over = t.approved_budget !== null && Number(q.amount) > Number(t.approved_budget);
                                const chosen = t.selected_supplier_id === q.supplier_id;
                                return (
                                  <tr key={q.id} className={`border-b border-ink/5 ${chosen ? 'bg-sea/10' : ''}`}>
                                    <td className="py-2 pr-3 font-semibold text-ink">
                                      {supplierName[q.supplier_id] || '—'}
                                      {quoteDocs[q.id] && (
                                        <button
                                          className="ml-2 text-xs font-normal text-harbor hover:underline"
                                          title={quoteDocs[q.id].title}
                                          onClick={async () => {
                                            const win = window.open('', '_blank');
                                            const url = await getSignedUrl('memoria', quoteDocs[q.id].storage_path, 300);
                                            if (url && win) win.location.href = url;
                                            else win?.close();
                                          }}
                                        >
                                          📄 PDF
                                        </button>
                                      )}
                                    </td>
                                    <td className="py-2 pr-3 whitespace-nowrap">
                                      {formatMoney(q.amount, q.currency, lang)}{' '}
                                      <span className="text-xs text-ink/50">{q.vat_included ? mt(lang, 'vatIncluded') : mt(lang, 'vatExcluded')}</span>
                                    </td>
                                    <td className="py-2 pr-3">
                                      <div className="flex gap-1 flex-wrap">
                                        {isLowest && <Pill tone="green">{mt(lang, 'lowest')}</Pill>}
                                        {over && <Pill tone="red">{mt(lang, 'overBudget')}</Pill>}
                                      </div>
                                    </td>
                                    <td className="py-2 pr-3 text-xs text-ink/50 whitespace-nowrap">
                                      {q.valid_until ? `${mt(lang, 'validUntil')} ${formatDate(q.valid_until, lang)}` : ''}
                                    </td>
                                    <td className="py-2 text-right whitespace-nowrap">
                                      {chosen ? (
                                        <Pill tone="green">✓ {mt(lang, 'chosen')}</Pill>
                                      ) : (
                                        <button className="text-xs text-harbor hover:underline" onClick={() => chooseQuote(t, q)}>{mt(lang, 'chooseThis')}</button>
                                      )}
                                      <button className="text-xs text-red-600 hover:underline ml-3" onClick={() => deleteQuote(q)}>{mt(lang, 'delete')}</button>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}
                      {mixedVat && <p className="text-xs text-ochre mt-2">⚠ {mt(lang, 'mixedVat')}</p>}
                      {tq.length >= 2 && tq.some((q) => q.notes) && (
                        <button className="text-xs text-harbor hover:underline mt-2" onClick={() => setCompareFor(compareFor === t.id ? null : t.id)}>
                          ⇆ {mt(lang, 'aiCompare')}
                        </button>
                      )}
                      {tq.length >= 2 && (
                        <TenderAnalysis
                          lang={lang}
                          tender={t}
                          quotes={tq}
                          onSaved={async () => {
                            await load();
                            onChanged?.();
                          }}
                        />
                      )}
                      {compareFor === t.id && (
                        <div className="mt-2 overflow-x-auto">
                          <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${tq.length}, minmax(14rem, 1fr))` }}>
                            {tq.map((q) => (
                              <div key={q.id} className={`rounded-md border p-2 text-xs ${t.selected_supplier_id === q.supplier_id ? 'border-sea bg-sea/10' : 'border-ink/10 bg-white'}`}>
                                <p className="font-semibold text-sm text-ink">{supplierName[q.supplier_id] || '—'}</p>
                                <p className="text-ink/70 mb-1">
                                  {formatMoney(q.amount, q.currency, lang)} · {q.vat_included ? mt(lang, 'vatIncluded') : mt(lang, 'vatExcluded')}
                                </p>
                                <p className="whitespace-pre-wrap text-ink/80">{q.notes || '—'}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {quoteFor === t.id ? (
                        <form onSubmit={(e) => saveQuote(e, t)} className="mt-3 grid sm:grid-cols-4 gap-2 items-end bg-sand/60 rounded-lg p-3">
                          <Field label={mt(lang, 'supplier')} required className="sm:col-span-2">
                            <select className="input-field" value={quoteForm.supplier_id} onChange={(e) => setQuoteForm((p) => ({ ...p, supplier_id: e.target.value }))}>
                              <option value="">{mt(lang, 'none')}</option>
                              {suppliers.map((s) => (
                                <option key={s.id} value={s.id}>{s.name}</option>
                              ))}
                            </select>
                          </Field>
                          <Field label={`${mt(lang, 'amount')} (${t.currency || 'EUR'})`} required>
                            <input type="number" step="0.01" min="0" className="input-field" value={quoteForm.amount} onChange={(e) => setQuoteForm((p) => ({ ...p, amount: e.target.value }))} />
                          </Field>
                          <label className="flex items-center gap-2 text-sm text-ink pb-3">
                            <input type="checkbox" checked={quoteForm.vat_included} onChange={(e) => setQuoteForm((p) => ({ ...p, vat_included: e.target.checked }))} />
                            {mt(lang, 'vatIncluded')}
                          </label>
                          <Field label={mt(lang, 'submittedOn')}>
                            <input type="date" className="input-field" value={quoteForm.submitted_on} onChange={(e) => setQuoteForm((p) => ({ ...p, submitted_on: e.target.value }))} />
                          </Field>
                          <Field label={mt(lang, 'validUntil')}>
                            <input type="date" className="input-field" value={quoteForm.valid_until} onChange={(e) => setQuoteForm((p) => ({ ...p, valid_until: e.target.value }))} />
                          </Field>
                          <Field label={mt(lang, 'notes')} className="sm:col-span-2">
                            <input className="input-field" value={quoteForm.notes} onChange={(e) => setQuoteForm((p) => ({ ...p, notes: e.target.value }))} />
                          </Field>
                          <div className="sm:col-span-4"><ErrorBox message={quoteError} /></div>
                          <div className="sm:col-span-4 flex gap-2">
                            <button type="submit" className="btn-primary text-sm">{mt(lang, 'save')}</button>
                            <button type="button" className="btn-secondary text-sm" onClick={() => setQuoteFor(null)}>{mt(lang, 'cancel')}</button>
                          </div>
                        </form>
                      ) : (
                        aiFor !== t.id && (
                          <div className="flex flex-wrap gap-4 mt-2">
                            <button className="text-sm text-harbor hover:underline" onClick={() => openQuote(t.id)}>+ {mt(lang, 'addQuote')}</button>
                            <button className="text-sm font-semibold text-harbor hover:underline" onClick={() => setAiFor(t.id)}>🤖 {mt(lang, 'aiUpload')}</button>
                          </div>
                        )
                      )}
                      {aiFor === t.id && (
                        <QuoteUploader
                          lang={lang}
                          tender={t}
                          onDone={async () => {
                            await load();
                            onChanged?.();
                          }}
                          onCancel={() => setAiFor(null)}
                          onClose={() => setAiFor(null)}
                        />
                      )}
                    </div>

                    <Attachments lang={lang} entityType="tender" entityId={t.id} defaultType="quote" />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
