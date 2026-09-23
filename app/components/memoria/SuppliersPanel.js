'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../../lib/supabaseClient';
import { formatDate } from '../../../lib/formatDate';
import { mt, cleanFormValues, todayIso, SUPPLIER_CATEGORIES, SUPPLIER_STATUSES } from '../../../lib/memoriaI18n';
import { Field, Pill, ErrorBox, DetailRow, Stars } from './MemoriaUi';
import Attachments, { removeEntityExtras } from './Attachments';

const EMPTY_FORM = {
  name: '',
  category: 'other',
  tax_id: '',
  contact_person: '',
  phone: '',
  email: '',
  website: '',
  status: 'active',
  status_reason: '',
  first_engaged_on: '',
  conflict_of_interest_checked: false,
  conflict_of_interest_note: '',
  notes: '',
};

const STATUS_TONE = { active: 'green', inactive: 'neutral', blacklisted: 'red' };

function toForm(supplier) {
  const form = { ...EMPTY_FORM };
  for (const key of Object.keys(EMPTY_FORM)) {
    const v = supplier[key];
    if (key === 'conflict_of_interest_checked') form[key] = Boolean(v);
    else form[key] = v === null || v === undefined ? '' : String(v);
  }
  return form;
}

function friendlyError(lang, error) {
  if (error?.code === '23505') return mt(lang, 'duplicateTaxId');
  if (error?.code === '23503') return mt(lang, 'deleteBlocked');
  return mt(lang, 'saveError', { error: error?.message || '' });
}

export default function SuppliersPanel({ lang, onChanged }) {
  const [suppliers, setSuppliers] = useState([]);
  const [ratings, setRatings] = useState([]);
  const [decisions, setDecisions] = useState([]);
  const [links, setLinks] = useState([]);
  const [loadingData, setLoadingData] = useState(true);
  const [loadError, setLoadError] = useState('');

  const [query, setQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [expanded, setExpanded] = useState({});

  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const [ratingFor, setRatingFor] = useState(null);
  const [ratingForm, setRatingForm] = useState({ rating: '4', comment: '', rated_on: '' });
  const [ratingError, setRatingError] = useState('');

  async function load() {
    const [supRes, ratRes, decRes, linkRes] = await Promise.all([
      supabase.from('memoria_suppliers').select('*').order('name', { ascending: true }),
      supabase.from('memoria_supplier_ratings').select('*').order('rated_on', { ascending: false }),
      supabase.from('memoria_decisions').select('id, title, decided_on').order('decided_on', { ascending: false }),
      supabase.from('memoria_decision_links').select('decision_id, entity_id').eq('entity_type', 'supplier'),
    ]);
    const firstError = supRes.error || ratRes.error || decRes.error || linkRes.error;
    setLoadError(firstError ? firstError.message : '');
    setSuppliers(supRes.data || []);
    setRatings(ratRes.data || []);
    setDecisions(decRes.data || []);
    setLinks(linkRes.data || []);
    setLoadingData(false);
  }

  useEffect(() => {
    load();
  }, []);

  const ratingsBySupplier = useMemo(() => {
    const map = {};
    for (const r of ratings) (map[r.supplier_id] ||= []).push(r);
    return map;
  }, [ratings]);

  const decisionById = useMemo(() => Object.fromEntries(decisions.map((d) => [d.id, d])), [decisions]);

  function averageRating(supplierId) {
    const list = ratingsBySupplier[supplierId] || [];
    if (list.length === 0) return null;
    return list.reduce((sum, r) => sum + r.rating, 0) / list.length;
  }

  function decisionsOf(supplierId) {
    return links
      .filter((l) => l.entity_id === supplierId)
      .map((l) => decisionById[l.decision_id])
      .filter(Boolean)
      .sort((a, b) => (a.decided_on < b.decided_on ? 1 : -1));
  }

  const visible = suppliers.filter((s) => {
    if (categoryFilter && s.category !== categoryFilter) return false;
    if (statusFilter && s.status !== statusFilter) return false;
    if (query) {
      const q = query.toLowerCase();
      const haystack = [s.name, s.tax_id, s.contact_person, s.notes, s.email].join(' ').toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });

  function openNew() {
    setForm(EMPTY_FORM);
    setFormError('');
    setEditingId('new');
  }

  function openEdit(supplier) {
    setForm(toForm(supplier));
    setFormError('');
    setEditingId(supplier.id);
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
    const values = cleanFormValues(form);
    if (!values.name) {
      setFormError(`${mt(lang, 'supplierName')}: ${mt(lang, 'required')}`);
      return;
    }
    if (values.status === 'blacklisted' && !values.status_reason) {
      setFormError(mt(lang, 'blacklistReasonRequired'));
      return;
    }
    if (values.status === 'active') values.status_reason = null;

    setSaving(true);
    setFormError('');
    const { error } =
      editingId === 'new'
        ? await supabase.from('memoria_suppliers').insert(values)
        : await supabase.from('memoria_suppliers').update(values).eq('id', editingId);
    setSaving(false);
    if (error) {
      setFormError(friendlyError(lang, error));
      return;
    }
    closeForm();
    await load();
    onChanged?.();
  }

  async function handleDelete(supplier) {
    if (!window.confirm(mt(lang, 'confirmDelete', { name: supplier.name }))) return;
    const { error } = await supabase.from('memoria_suppliers').delete().eq('id', supplier.id);
    if (error) {
      window.alert(friendlyError(lang, error));
      return;
    }
    // Prílohy a väzby rozhodnutí sú polymorfné (bez cudzieho kľúča), preto ich upraceme ručne.
    await removeEntityExtras('supplier', supplier.id);
    await load();
    onChanged?.();
  }

  function openRating(supplierId) {
    setRatingFor(supplierId);
    setRatingForm({ rating: '4', comment: '', rated_on: todayIso() });
    setRatingError('');
  }

  async function saveRating(e) {
    e.preventDefault();
    const values = cleanFormValues({ ...ratingForm, supplier_id: ratingFor }, ['rating']);
    const { error } = await supabase.from('memoria_supplier_ratings').insert(values);
    if (error) {
      setRatingError(friendlyError(lang, error));
      return;
    }
    setRatingFor(null);
    await load();
    onChanged?.();
  }

  const formBlock = (
    <form onSubmit={handleSave} className="card p-4 space-y-4 mb-6 border-2 border-ochre/40">
      <h3 className="font-display text-lg text-harbor">
        {editingId === 'new' ? mt(lang, 'newSupplier') : mt(lang, 'edit')}
      </h3>
      <div className="grid sm:grid-cols-3 gap-3">
        <Field label={mt(lang, 'supplierName')} required className="sm:col-span-2">
          <input className="input-field" value={form.name} onChange={(e) => setField('name', e.target.value)} />
        </Field>
        <Field label={mt(lang, 'category')} required>
          <select className="input-field" value={form.category} onChange={(e) => setField('category', e.target.value)}>
            {SUPPLIER_CATEGORIES.map((c) => (
              <option key={c} value={c}>{mt(lang, `cat_${c}`)}</option>
            ))}
          </select>
        </Field>
      </div>
      <div className="grid sm:grid-cols-3 gap-3">
        <Field label={mt(lang, 'taxId')}>
          <input className="input-field" value={form.tax_id} onChange={(e) => setField('tax_id', e.target.value)} />
        </Field>
        <Field label={mt(lang, 'contactPerson')}>
          <input className="input-field" value={form.contact_person} onChange={(e) => setField('contact_person', e.target.value)} />
        </Field>
        <Field label={mt(lang, 'firstEngagedOn')}>
          <input type="date" className="input-field" value={form.first_engaged_on} onChange={(e) => setField('first_engaged_on', e.target.value)} />
        </Field>
      </div>
      <div className="grid sm:grid-cols-3 gap-3">
        <Field label={mt(lang, 'phone')}>
          <input type="tel" className="input-field" value={form.phone} onChange={(e) => setField('phone', e.target.value)} />
        </Field>
        <Field label={mt(lang, 'email')}>
          <input type="email" className="input-field" value={form.email} onChange={(e) => setField('email', e.target.value)} />
        </Field>
        <Field label={mt(lang, 'website')}>
          <input className="input-field" value={form.website} onChange={(e) => setField('website', e.target.value)} />
        </Field>
      </div>
      <div className="grid sm:grid-cols-3 gap-3">
        <Field label={mt(lang, 'status')}>
          <select className="input-field" value={form.status} onChange={(e) => setField('status', e.target.value)}>
            {SUPPLIER_STATUSES.map((s) => (
              <option key={s} value={s}>{mt(lang, `supplierStatus_${s}`)}</option>
            ))}
          </select>
        </Field>
        {form.status !== 'active' && (
          <Field label={mt(lang, 'statusReason')} required={form.status === 'blacklisted'} className="sm:col-span-2">
            <input className="input-field" value={form.status_reason} onChange={(e) => setField('status_reason', e.target.value)} />
          </Field>
        )}
      </div>
      <label className="flex items-start gap-2 text-sm text-ink">
        <input
          type="checkbox"
          className="mt-1"
          checked={form.conflict_of_interest_checked}
          onChange={(e) => setField('conflict_of_interest_checked', e.target.checked)}
        />
        <span>{mt(lang, 'conflictChecked')}</span>
      </label>
      {form.conflict_of_interest_checked && (
        <Field label={mt(lang, 'conflictNote')}>
          <input className="input-field" value={form.conflict_of_interest_note} onChange={(e) => setField('conflict_of_interest_note', e.target.value)} />
        </Field>
      )}
      <Field label={mt(lang, 'notes')}>
        <textarea rows={3} className="input-field" value={form.notes} onChange={(e) => setField('notes', e.target.value)} />
      </Field>
      <ErrorBox message={formError} />
      <div className="flex gap-2">
        <button type="submit" className="btn-primary" disabled={saving}>
          {saving ? mt(lang, 'saving') : mt(lang, 'save')}
        </button>
        <button type="button" className="btn-secondary" onClick={closeForm}>
          {mt(lang, 'cancel')}
        </button>
      </div>
    </form>
  );

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <input
          className="input-field flex-1 min-w-[12rem]"
          placeholder={mt(lang, 'search')}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <select className="input-field w-auto" value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
          <option value="">{mt(lang, 'category')}: {mt(lang, 'all')}</option>
          {SUPPLIER_CATEGORIES.map((c) => (
            <option key={c} value={c}>{mt(lang, `cat_${c}`)}</option>
          ))}
        </select>
        <select className="input-field w-auto" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">{mt(lang, 'status')}: {mt(lang, 'all')}</option>
          {SUPPLIER_STATUSES.map((s) => (
            <option key={s} value={s}>{mt(lang, `supplierStatus_${s}`)}</option>
          ))}
        </select>
        {editingId === null && (
          <button className="btn-primary text-sm" onClick={openNew}>+ {mt(lang, 'newSupplier')}</button>
        )}
      </div>

      {editingId === 'new' && formBlock}
      <ErrorBox message={loadError} />

      {loadingData ? (
        <p className="text-ink/60">{mt(lang, 'loading')}</p>
      ) : suppliers.length === 0 ? (
        <p className="text-ink/60">{mt(lang, 'empty')}</p>
      ) : visible.length === 0 ? (
        <p className="text-ink/60">{mt(lang, 'noMatches')}</p>
      ) : (
        <div className="space-y-3">
          {visible.map((s) => {
            if (editingId === s.id) return <div key={s.id}>{formBlock}</div>;
            const avg = averageRating(s.id);
            const supplierRatings = ratingsBySupplier[s.id] || [];
            const related = decisionsOf(s.id);
            return (
              <div key={s.id} className="card p-4">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <p className="font-semibold text-ink">{s.name}</p>
                    <div className="flex flex-wrap items-center gap-2 mt-1">
                      <Pill tone="harbor">{mt(lang, `cat_${s.category}`)}</Pill>
                      <Pill tone={STATUS_TONE[s.status]}>{mt(lang, `supplierStatus_${s.status}`)}</Pill>
                      {avg !== null && (
                        <span className="text-sm">
                          <Stars value={avg} /> <span className="text-xs text-ink/50">({supplierRatings.length})</span>
                        </span>
                      )}
                      {!s.conflict_of_interest_checked && <Pill tone="ochre">{mt(lang, 'conflictNotChecked')}</Pill>}
                    </div>
                    <p className="text-sm text-ink/70 mt-2">
                      {[s.contact_person, s.phone, s.email].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                  {editingId === null && (
                    <div className="flex gap-3 text-sm flex-shrink-0">
                      <button className="text-harbor hover:underline" onClick={() => openEdit(s)}>{mt(lang, 'edit')}</button>
                      <button className="text-red-600 hover:underline" onClick={() => handleDelete(s)}>{mt(lang, 'delete')}</button>
                    </div>
                  )}
                </div>
                <button
                  className="text-xs text-harbor/70 hover:text-harbor mt-3"
                  onClick={() => setExpanded((prev) => ({ ...prev, [s.id]: !prev[s.id] }))}
                >
                  {expanded[s.id] ? `▾ ${mt(lang, 'showLess')}` : `▸ ${mt(lang, 'showMore')}`}
                </button>
                {expanded[s.id] && (
                  <div className="mt-3 space-y-4 border-t border-ink/10 pt-3">
                    <DetailRow label={mt(lang, 'taxId')}>{s.tax_id}</DetailRow>
                    <DetailRow label={mt(lang, 'website')}>{s.website}</DetailRow>
                    <DetailRow label={mt(lang, 'firstEngagedOn')}>{s.first_engaged_on ? formatDate(s.first_engaged_on, lang) : null}</DetailRow>
                    <DetailRow label={mt(lang, 'statusReason')}>{s.status_reason}</DetailRow>
                    <DetailRow label={mt(lang, 'conflictNote')}>{s.conflict_of_interest_note}</DetailRow>
                    <DetailRow label={mt(lang, 'notes')}>{s.notes}</DetailRow>

                    <div>
                      <p className="text-xs font-semibold text-ink/50 uppercase tracking-wide mb-1">{mt(lang, 'relatedDecisions')}</p>
                      {related.length === 0 ? (
                        <p className="text-sm text-ink/50">{mt(lang, 'noRelatedDecisions')}</p>
                      ) : (
                        <ul className="text-sm text-ink space-y-0.5">
                          {related.map((d) => (
                            <li key={d.id}>{formatDate(d.decided_on, lang)} · {d.title}</li>
                          ))}
                        </ul>
                      )}
                    </div>

                    <div>
                      <p className="text-xs font-semibold text-ink/50 uppercase tracking-wide mb-1">{mt(lang, 'ratings')}</p>
                      {supplierRatings.length === 0 ? (
                        <p className="text-sm text-ink/50">{mt(lang, 'noRatings')}</p>
                      ) : (
                        <ul className="text-sm text-ink space-y-1">
                          {supplierRatings.map((r) => (
                            <li key={r.id}>
                              <Stars value={r.rating} /> <span className="text-ink/60">{formatDate(r.rated_on, lang)}</span>
                              {r.comment && <span> · {r.comment}</span>}
                            </li>
                          ))}
                        </ul>
                      )}
                      {ratingFor === s.id ? (
                        <form onSubmit={saveRating} className="mt-3 grid sm:grid-cols-4 gap-2 items-end">
                          <Field label={mt(lang, 'rating')}>
                            <select
                              className="input-field"
                              value={ratingForm.rating}
                              onChange={(e) => setRatingForm((p) => ({ ...p, rating: e.target.value }))}
                            >
                              {[5, 4, 3, 2, 1].map((n) => (
                                <option key={n} value={n}>{'★'.repeat(n)}</option>
                              ))}
                            </select>
                          </Field>
                          <Field label={mt(lang, 'comment')} className="sm:col-span-2">
                            <input
                              className="input-field"
                              value={ratingForm.comment}
                              onChange={(e) => setRatingForm((p) => ({ ...p, comment: e.target.value }))}
                            />
                          </Field>
                          <Field label={mt(lang, 'ratedOn')}>
                            <input
                              type="date"
                              className="input-field"
                              value={ratingForm.rated_on}
                              onChange={(e) => setRatingForm((p) => ({ ...p, rated_on: e.target.value }))}
                            />
                          </Field>
                          <div className="sm:col-span-4 flex gap-2">
                            <button type="submit" className="btn-primary text-sm">{mt(lang, 'save')}</button>
                            <button type="button" className="btn-secondary text-sm" onClick={() => setRatingFor(null)}>
                              {mt(lang, 'cancel')}
                            </button>
                          </div>
                          <div className="sm:col-span-4"><ErrorBox message={ratingError} /></div>
                        </form>
                      ) : (
                        <button className="text-sm text-harbor hover:underline mt-2" onClick={() => openRating(s.id)}>
                          + {mt(lang, 'addRating')}
                        </button>
                      )}
                    </div>

                    <Attachments lang={lang} entityType="supplier" entityId={s.id} defaultType="correspondence" />
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
