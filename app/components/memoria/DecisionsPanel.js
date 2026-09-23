'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../../lib/supabaseClient';
import { formatDate } from '../../../lib/formatDate';
import { mt, cleanFormValues, DECISION_BODIES, DECISION_STATUSES } from '../../../lib/memoriaI18n';
import { Field, Pill, ErrorBox, DetailRow } from './MemoriaUi';

const EMPTY_FORM = {
  title: '',
  decided_on: '',
  body: 'board',
  authority_basis: '',
  context: '',
  alternatives: '',
  decision: '',
  rationale: '',
  votes_for: '',
  votes_against: '',
  votes_abstain: '',
  status: 'active',
  status_note: '',
  outcome_review: '',
  outcome_reviewed_on: '',
};
const NUMBER_FIELDS = ['votes_for', 'votes_against', 'votes_abstain'];

const STATUS_TONE = { active: 'green', suspended: 'ochre', superseded: 'neutral', cancelled: 'red' };

function toForm(decision) {
  const form = { ...EMPTY_FORM };
  for (const key of Object.keys(EMPTY_FORM)) {
    const v = decision[key];
    form[key] = v === null || v === undefined ? '' : String(v);
  }
  return form;
}

export default function DecisionsPanel({ lang, onChanged }) {
  const [decisions, setDecisions] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [links, setLinks] = useState([]);
  const [loadingData, setLoadingData] = useState(true);
  const [loadError, setLoadError] = useState('');

  const [query, setQuery] = useState('');
  const [bodyFilter, setBodyFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [expanded, setExpanded] = useState({});

  const [editingId, setEditingId] = useState(null); // null = zatvorené, 'new' = nové
  const [form, setForm] = useState(EMPTY_FORM);
  const [formSuppliers, setFormSuppliers] = useState([]);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  async function load() {
    const [decRes, supRes, linkRes] = await Promise.all([
      supabase.from('memoria_decisions').select('*').order('decided_on', { ascending: false }).order('created_at', { ascending: false }),
      supabase.from('memoria_suppliers').select('id, name, status').order('name', { ascending: true }),
      supabase.from('memoria_decision_links').select('id, decision_id, entity_id').eq('entity_type', 'supplier'),
    ]);
    const firstError = decRes.error || supRes.error || linkRes.error;
    setLoadError(firstError ? firstError.message : '');
    setDecisions(decRes.data || []);
    setSuppliers(supRes.data || []);
    setLinks(linkRes.data || []);
    setLoadingData(false);
  }

  useEffect(() => {
    load();
  }, []);

  const supplierName = useMemo(() => Object.fromEntries(suppliers.map((s) => [s.id, s.name])), [suppliers]);

  function suppliersOf(decisionId) {
    return links.filter((l) => l.decision_id === decisionId).map((l) => l.entity_id);
  }

  const visible = decisions.filter((d) => {
    if (bodyFilter && d.body !== bodyFilter) return false;
    if (statusFilter && d.status !== statusFilter) return false;
    if (query) {
      const q = query.toLowerCase();
      const haystack = [d.title, d.decision, d.rationale, d.context, d.authority_basis].join(' ').toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });

  function openNew() {
    setForm({ ...EMPTY_FORM, decided_on: new Date().toISOString().slice(0, 10) });
    setFormSuppliers([]);
    setFormError('');
    setEditingId('new');
  }

  function openEdit(decision) {
    setForm(toForm(decision));
    setFormSuppliers(suppliersOf(decision.id));
    setFormError('');
    setEditingId(decision.id);
  }

  function closeForm() {
    setEditingId(null);
    setFormError('');
  }

  function setField(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function toggleFormSupplier(id) {
    setFormSuppliers((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function syncSupplierLinks(decisionId, wanted) {
    const current = links.filter((l) => l.decision_id === decisionId);
    const toRemove = current.filter((l) => !wanted.includes(l.entity_id)).map((l) => l.id);
    const currentIds = current.map((l) => l.entity_id);
    const toAdd = wanted.filter((id) => !currentIds.includes(id));

    if (toRemove.length > 0) {
      const { error } = await supabase.from('memoria_decision_links').delete().in('id', toRemove);
      if (error) return error;
    }
    if (toAdd.length > 0) {
      const { error } = await supabase
        .from('memoria_decision_links')
        .insert(toAdd.map((entityId) => ({ decision_id: decisionId, entity_type: 'supplier', entity_id: entityId })));
      if (error) return error;
    }
    return null;
  }

  async function handleSave(e) {
    e.preventDefault();
    const values = cleanFormValues(form, NUMBER_FIELDS);
    if (!values.title || !values.decided_on || !values.decision) {
      setFormError(`${mt(lang, 'decisionTitle')}, ${mt(lang, 'decidedOn')}, ${mt(lang, 'decisionText')}: ${mt(lang, 'required')}`);
      return;
    }
    setSaving(true);
    setFormError('');

    let decisionId = editingId;
    let error;
    if (editingId === 'new') {
      const res = await supabase.from('memoria_decisions').insert(values).select('id').single();
      error = res.error;
      decisionId = res.data?.id;
    } else {
      ({ error } = await supabase.from('memoria_decisions').update(values).eq('id', editingId));
    }
    if (!error && decisionId) {
      error = await syncSupplierLinks(decisionId, formSuppliers);
    }

    setSaving(false);
    if (error) {
      setFormError(mt(lang, 'saveError', { error: error.message }));
      return;
    }
    closeForm();
    await load();
    onChanged?.();
  }

  async function handleDelete(decision) {
    if (!window.confirm(mt(lang, 'confirmDelete', { name: decision.title }))) return;
    const { error } = await supabase.from('memoria_decisions').delete().eq('id', decision.id);
    if (error) {
      window.alert(mt(lang, 'saveError', { error: error.message }));
      return;
    }
    await load();
    onChanged?.();
  }

  const formBlock = (
    <form onSubmit={handleSave} className="card p-4 space-y-4 mb-6 border-2 border-ochre/40">
      <h3 className="font-display text-lg text-harbor">
        {editingId === 'new' ? mt(lang, 'newDecision') : mt(lang, 'edit')}
      </h3>
      <div className="grid sm:grid-cols-3 gap-3">
        <Field label={mt(lang, 'decisionTitle')} required className="sm:col-span-2">
          <input className="input-field" value={form.title} onChange={(e) => setField('title', e.target.value)} />
        </Field>
        <Field label={mt(lang, 'decidedOn')} required>
          <input type="date" className="input-field" value={form.decided_on} onChange={(e) => setField('decided_on', e.target.value)} />
        </Field>
      </div>
      <div className="grid sm:grid-cols-2 gap-3">
        <Field label={mt(lang, 'body')} required>
          <select className="input-field" value={form.body} onChange={(e) => setField('body', e.target.value)}>
            {DECISION_BODIES.map((b) => (
              <option key={b} value={b}>{mt(lang, `body_${b}`)}</option>
            ))}
          </select>
        </Field>
        <Field label={mt(lang, 'authorityBasis')} hint={mt(lang, 'authorityBasisHint')}>
          <input className="input-field" value={form.authority_basis} onChange={(e) => setField('authority_basis', e.target.value)} />
        </Field>
      </div>
      <Field label={mt(lang, 'context')}>
        <textarea rows={3} className="input-field" value={form.context} onChange={(e) => setField('context', e.target.value)} />
      </Field>
      <Field label={mt(lang, 'alternatives')}>
        <textarea rows={2} className="input-field" value={form.alternatives} onChange={(e) => setField('alternatives', e.target.value)} />
      </Field>
      <Field label={mt(lang, 'decisionText')} required>
        <textarea rows={3} className="input-field" value={form.decision} onChange={(e) => setField('decision', e.target.value)} />
      </Field>
      <Field label={mt(lang, 'rationale')}>
        <textarea rows={3} className="input-field" value={form.rationale} onChange={(e) => setField('rationale', e.target.value)} />
      </Field>
      <div>
        <p className="text-sm font-semibold text-ink/80 mb-1">{mt(lang, 'votes')}</p>
        <div className="grid grid-cols-3 gap-3">
          <Field label={mt(lang, 'votesFor')}>
            <input type="number" min="0" className="input-field" value={form.votes_for} onChange={(e) => setField('votes_for', e.target.value)} />
          </Field>
          <Field label={mt(lang, 'votesAgainst')}>
            <input type="number" min="0" className="input-field" value={form.votes_against} onChange={(e) => setField('votes_against', e.target.value)} />
          </Field>
          <Field label={mt(lang, 'votesAbstain')}>
            <input type="number" min="0" className="input-field" value={form.votes_abstain} onChange={(e) => setField('votes_abstain', e.target.value)} />
          </Field>
        </div>
      </div>
      <div className="grid sm:grid-cols-2 gap-3">
        <Field label={mt(lang, 'status')}>
          <select className="input-field" value={form.status} onChange={(e) => setField('status', e.target.value)}>
            {DECISION_STATUSES.map((s) => (
              <option key={s} value={s}>{mt(lang, `decisionStatus_${s}`)}</option>
            ))}
          </select>
        </Field>
        {form.status !== 'active' && (
          <Field label={mt(lang, 'statusNote')}>
            <input className="input-field" value={form.status_note} onChange={(e) => setField('status_note', e.target.value)} />
          </Field>
        )}
      </div>
      <div>
        <p className="text-sm font-semibold text-ink/80 mb-1">{mt(lang, 'linkedSuppliers')}</p>
        {suppliers.length === 0 ? (
          <p className="text-sm text-ink/50">{mt(lang, 'noSuppliersYet')}</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {suppliers.map((s) => (
              <button
                type="button"
                key={s.id}
                onClick={() => toggleFormSupplier(s.id)}
                className={`text-sm px-3 py-1 rounded-full border ${
                  formSuppliers.includes(s.id) ? 'bg-harbor text-sand border-harbor' : 'border-sand-dark text-ink/70 hover:border-harbor'
                }`}
              >
                {s.name}
              </button>
            ))}
          </div>
        )}
      </div>
      {editingId !== 'new' && (
        <div className="grid sm:grid-cols-3 gap-3">
          <Field label={mt(lang, 'outcomeReview')} className="sm:col-span-2">
            <textarea rows={2} className="input-field" value={form.outcome_review} onChange={(e) => setField('outcome_review', e.target.value)} />
          </Field>
          <Field label={mt(lang, 'outcomeReviewedOn')}>
            <input type="date" className="input-field" value={form.outcome_reviewed_on} onChange={(e) => setField('outcome_reviewed_on', e.target.value)} />
          </Field>
        </div>
      )}
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
        <select className="input-field w-auto" value={bodyFilter} onChange={(e) => setBodyFilter(e.target.value)}>
          <option value="">{mt(lang, 'body')}: {mt(lang, 'all')}</option>
          {DECISION_BODIES.map((b) => (
            <option key={b} value={b}>{mt(lang, `body_${b}`)}</option>
          ))}
        </select>
        <select className="input-field w-auto" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">{mt(lang, 'status')}: {mt(lang, 'all')}</option>
          {DECISION_STATUSES.map((s) => (
            <option key={s} value={s}>{mt(lang, `decisionStatus_${s}`)}</option>
          ))}
        </select>
        {editingId === null && (
          <button className="btn-primary text-sm" onClick={openNew}>+ {mt(lang, 'newDecision')}</button>
        )}
      </div>

      {editingId === 'new' && formBlock}
      <ErrorBox message={loadError} />

      {loadingData ? (
        <p className="text-ink/60">{mt(lang, 'loading')}</p>
      ) : decisions.length === 0 ? (
        <p className="text-ink/60">{mt(lang, 'empty')}</p>
      ) : visible.length === 0 ? (
        <p className="text-ink/60">{mt(lang, 'noMatches')}</p>
      ) : (
        <div className="space-y-3">
          {visible.map((d) =>
            editingId === d.id ? (
              <div key={d.id}>{formBlock}</div>
            ) : (
              <div key={d.id} className="card p-4">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <p className="font-semibold text-ink">{d.title}</p>
                    <div className="flex flex-wrap items-center gap-2 mt-1">
                      <span className="text-xs text-ink/60">{formatDate(d.decided_on, lang)}</span>
                      <Pill tone="harbor">{mt(lang, `body_${d.body}`)}</Pill>
                      <Pill tone={STATUS_TONE[d.status]}>{mt(lang, `decisionStatus_${d.status}`)}</Pill>
                    </div>
                  </div>
                  {editingId === null && (
                    <div className="flex gap-3 text-sm flex-shrink-0">
                      <button className="text-harbor hover:underline" onClick={() => openEdit(d)}>{mt(lang, 'edit')}</button>
                      <button className="text-red-600 hover:underline" onClick={() => handleDelete(d)}>{mt(lang, 'delete')}</button>
                    </div>
                  )}
                </div>
                <p className="text-sm text-ink mt-3 whitespace-pre-wrap">{d.decision}</p>
                {suppliersOf(d.id).length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {suppliersOf(d.id).map((id) => (
                      <Pill key={id}>{supplierName[id] || '—'}</Pill>
                    ))}
                  </div>
                )}
                <button
                  className="text-xs text-harbor/70 hover:text-harbor mt-3"
                  onClick={() => setExpanded((prev) => ({ ...prev, [d.id]: !prev[d.id] }))}
                >
                  {expanded[d.id] ? `▾ ${mt(lang, 'showLess')}` : `▸ ${mt(lang, 'showMore')}`}
                </button>
                {expanded[d.id] && (
                  <div className="mt-3 space-y-3 border-t border-ink/10 pt-3">
                    <DetailRow label={mt(lang, 'rationale')}>{d.rationale}</DetailRow>
                    <DetailRow label={mt(lang, 'context')}>{d.context}</DetailRow>
                    <DetailRow label={mt(lang, 'alternatives')}>{d.alternatives}</DetailRow>
                    <DetailRow label={mt(lang, 'authorityBasis')}>{d.authority_basis}</DetailRow>
                    {(d.votes_for !== null || d.votes_against !== null || d.votes_abstain !== null) && (
                      <DetailRow label={mt(lang, 'votes')}>
                        {`${mt(lang, 'votesFor')}: ${d.votes_for ?? '—'} · ${mt(lang, 'votesAgainst')}: ${d.votes_against ?? '—'} · ${mt(lang, 'votesAbstain')}: ${d.votes_abstain ?? '—'}`}
                      </DetailRow>
                    )}
                    <DetailRow label={mt(lang, 'statusNote')}>{d.status_note}</DetailRow>
                    <DetailRow label={mt(lang, 'outcomeReview')}>
                      {d.outcome_review
                        ? `${d.outcome_review}${d.outcome_reviewed_on ? ` (${formatDate(d.outcome_reviewed_on, lang)})` : ''}`
                        : null}
                    </DetailRow>
                  </div>
                )}
              </div>
            )
          )}
        </div>
      )}
    </div>
  );
}
