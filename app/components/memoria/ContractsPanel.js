'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../../lib/supabaseClient';
import { formatDate } from '../../../lib/formatDate';
import {
  mt, cleanFormValues, formatMoney, todayIso, addDaysIso,
  CONTRACT_STATUSES, PAYMENT_FREQUENCIES,
} from '../../../lib/memoriaI18n';
import { Field, Pill, ErrorBox, DetailRow, DemoPill } from './MemoriaUi';
import Attachments, { removeEntityExtras } from './Attachments';
import DocumentReader, { ReadNotice, createSupplierFromRead, attachReadFile } from './DocumentReader';

const EMPTY_FORM = {
  supplier_id: '',
  tender_id: '',
  subject: '',
  signed_on: '',
  starts_on: '',
  ends_on: '',
  auto_renew: false,
  notice_period_days: '',
  amount: '',
  currency: 'EUR',
  payment_frequency: '',
  status: 'active',
  signed_by: '',
  approved_by_decision_id: '',
  notes: '',
};
const NUMBER_FIELDS = ['notice_period_days', 'amount'];
const STATUS_TONE = { negotiating: 'ochre', active: 'green', ended: 'neutral', disputed: 'red' };

function toForm(c) {
  const form = { ...EMPTY_FORM };
  for (const key of Object.keys(EMPTY_FORM)) {
    const v = c[key];
    if (key === 'auto_renew') form[key] = Boolean(v);
    else form[key] = v === null || v === undefined ? '' : String(v);
  }
  return form;
}

// Posledný deň na výpoveď pri automatickom predĺžení.
export function noticeDeadline(contract) {
  if (!contract.auto_renew || !contract.ends_on || contract.notice_period_days === null) return null;
  return addDaysIso(contract.ends_on, -Number(contract.notice_period_days || 0));
}

function daysUntil(iso) {
  if (!iso) return null;
  const [y, m, d] = iso.split('-').map(Number);
  const [ty, tm, td] = todayIso().split('-').map(Number);
  return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(ty, tm - 1, td)) / 86400000);
}

export default function ContractsPanel({ lang, onChanged }) {
  const [contracts, setContracts] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [decisions, setDecisions] = useState([]);
  const [tenders, setTenders] = useState([]);
  const [loadingData, setLoadingData] = useState(true);
  const [loadError, setLoadError] = useState('');

  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [expanded, setExpanded] = useState({});

  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [read, setRead] = useState(null);

  async function load() {
    const [cRes, sRes, dRes, tRes] = await Promise.all([
      supabase.from('memoria_contracts').select('*').order('ends_on', { ascending: true, nullsFirst: false }),
      supabase.from('memoria_suppliers').select('id, name').order('name', { ascending: true }),
      supabase.from('memoria_decisions').select('id, title, decided_on').order('decided_on', { ascending: false }),
      supabase.from('memoria_tenders').select('id, title').order('created_at', { ascending: false }),
    ]);
    const firstError = cRes.error || sRes.error || dRes.error || tRes.error;
    setLoadError(firstError ? firstError.message : '');
    setContracts(cRes.data || []);
    setSuppliers(sRes.data || []);
    setDecisions(dRes.data || []);
    setTenders(tRes.data || []);
    setLoadingData(false);
  }

  useEffect(() => {
    load();
  }, []);

  const supplierName = useMemo(() => Object.fromEntries(suppliers.map((s) => [s.id, s.name])), [suppliers]);
  const decisionById = useMemo(() => Object.fromEntries(decisions.map((d) => [d.id, d])), [decisions]);
  const tenderTitle = useMemo(() => Object.fromEntries(tenders.map((t) => [t.id, t.title])), [tenders]);

  const visible = contracts.filter((c) => {
    if (statusFilter && c.status !== statusFilter) return false;
    if (query) {
      const q = query.toLowerCase();
      const haystack = [c.subject, supplierName[c.supplier_id], c.notes, c.signed_by].join(' ').toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });

  function openNew() {
    setForm(EMPTY_FORM);
    setFormError('');
    setEditingId('new');
  }

  function openEdit(c) {
    setForm(toForm(c));
    setFormError('');
    setEditingId(c.id);
  }

  function closeForm() {
    setEditingId(null);
    setFormError('');
    setRead(null);
  }

  function applyRead(r) {
    const d = r.data || {};
    const freq = { one_off: 'one_off', monthly: 'monthly', quarterly: 'quarterly', yearly: 'yearly' }[d.amount_period] || '';
    const notes = [
      d.renewal_text,
      d.notice_text ? `${mt(lang, 'noticePeriodDays')}: ${d.notice_text}` : null,
      d.vat_included === true ? mt(lang, 'vatIncluded') : d.vat_included === false ? mt(lang, 'vatExcluded') : null,
      ...(d.key_clauses || []).map((c) => `• ${c}`),
    ].filter(Boolean).join('\n');
    setForm({
      ...EMPTY_FORM,
      supplier_id: r.supplierId || '',
      subject: d.subject || '',
      signed_on: d.signed_on || '',
      starts_on: d.starts_on || '',
      ends_on: d.ends_on || '',
      auto_renew: Boolean(d.auto_renew),
      notice_period_days: d.notice_period_days !== null && d.notice_period_days !== undefined ? String(d.notice_period_days) : '',
      amount: d.amount !== null && d.amount !== undefined ? String(d.amount) : '',
      currency: d.currency || 'EUR',
      payment_frequency: freq,
      signed_by: d.signed_by || '',
      notes,
    });
    setFormError('');
    setRead(r);
    setEditingId('new');
  }

  async function createSupplier() {
    try {
      const id = await createSupplierFromRead(read, read.data?.category, read.demoMode);
      await load();
      setField('supplier_id', id);
      setRead((r) => ({ ...r, supplierId: id }));
    } catch (e) {
      setFormError(mt(lang, 'saveError', { error: e.message }));
    }
  }

  function setField(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSave(e) {
    e.preventDefault();
    const values = cleanFormValues(form, NUMBER_FIELDS);
    if (!values.supplier_id || !values.subject) {
      setFormError(`${mt(lang, 'supplier')}, ${mt(lang, 'subject')}: ${mt(lang, 'required')}`);
      return;
    }
    if (values.starts_on && values.ends_on && values.ends_on < values.starts_on) {
      setFormError(mt(lang, 'contractDatesInvalid'));
      return;
    }
    if (!values.currency) values.currency = 'EUR';
    setSaving(true);
    setFormError('');
    const { data: saved, error } =
      editingId === 'new'
        ? await supabase.from('memoria_contracts').insert(read?.demoMode ? { ...values, is_demo: true } : values).select('id').single()
        : await supabase.from('memoria_contracts').update(values).eq('id', editingId).select('id').single();
    setSaving(false);
    if (error) {
      setFormError(mt(lang, 'saveError', { error: error.message }));
      return;
    }
    if (editingId === 'new' && read && saved?.id) await attachReadFile(read, 'contract', saved.id, 'contract', values.signed_on, read.demoMode);
    closeForm();
    await load();
    onChanged?.();
  }

  async function handleDelete(c) {
    if (!window.confirm(mt(lang, 'confirmDelete', { name: c.subject }))) return;
    const { error } = await supabase.from('memoria_contracts').delete().eq('id', c.id);
    if (error) {
      window.alert(mt(lang, 'saveError', { error: error.message }));
      return;
    }
    await removeEntityExtras('contract', c.id);
    await load();
    onChanged?.();
  }

  const formBlock = (
    <form onSubmit={handleSave} className="card p-4 space-y-4 mb-6 border-2 border-ochre/40">
      <h3 className="font-display text-lg text-harbor">
        {editingId === 'new' ? mt(lang, 'newContract') : mt(lang, 'edit')}
      </h3>
      {editingId === 'new' && (
        <ReadNotice lang={lang} read={read} onCreateSupplier={createSupplier} onToggleDemo={(v) => setRead((r) => ({ ...r, demoMode: v }))} />
      )}
      <div className="grid sm:grid-cols-2 gap-3">
        <Field label={mt(lang, 'supplier')} required>
          <select className="input-field" value={form.supplier_id} onChange={(e) => setField('supplier_id', e.target.value)}>
            <option value="">{mt(lang, 'none')}</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </Field>
        <Field label={mt(lang, 'subject')} required>
          <input className="input-field" value={form.subject} onChange={(e) => setField('subject', e.target.value)} />
        </Field>
      </div>
      <div className="grid sm:grid-cols-3 gap-3">
        <Field label={mt(lang, 'signedOn')}>
          <input type="date" className="input-field" value={form.signed_on} onChange={(e) => setField('signed_on', e.target.value)} />
        </Field>
        <Field label={mt(lang, 'startsOn')}>
          <input type="date" className="input-field" value={form.starts_on} onChange={(e) => setField('starts_on', e.target.value)} />
        </Field>
        <Field label={mt(lang, 'endsOn')}>
          <input type="date" className="input-field" value={form.ends_on} onChange={(e) => setField('ends_on', e.target.value)} />
        </Field>
      </div>
      <div className="grid sm:grid-cols-3 gap-3 items-end">
        <label className="flex items-center gap-2 text-sm text-ink pb-3">
          <input type="checkbox" checked={form.auto_renew} onChange={(e) => setField('auto_renew', e.target.checked)} />
          {mt(lang, 'autoRenew')}
        </label>
        <Field label={mt(lang, 'noticePeriodDays')}>
          <input type="number" min="0" className="input-field" value={form.notice_period_days} onChange={(e) => setField('notice_period_days', e.target.value)} />
        </Field>
        <Field label={mt(lang, 'status')}>
          <select className="input-field" value={form.status} onChange={(e) => setField('status', e.target.value)}>
            {CONTRACT_STATUSES.map((s) => (
              <option key={s} value={s}>{mt(lang, `contractStatus_${s}`)}</option>
            ))}
          </select>
        </Field>
      </div>
      <div className="grid sm:grid-cols-3 gap-3">
        <Field label={mt(lang, 'amount')}>
          <input type="number" step="0.01" min="0" className="input-field" value={form.amount} onChange={(e) => setField('amount', e.target.value)} />
        </Field>
        <Field label={mt(lang, 'currency')}>
          <input className="input-field" maxLength={3} value={form.currency} onChange={(e) => setField('currency', e.target.value.toUpperCase())} />
        </Field>
        <Field label={mt(lang, 'paymentFrequency')}>
          <select className="input-field" value={form.payment_frequency} onChange={(e) => setField('payment_frequency', e.target.value)}>
            <option value="">{mt(lang, 'none')}</option>
            {PAYMENT_FREQUENCIES.map((f) => (
              <option key={f} value={f}>{mt(lang, `freq_${f}`)}</option>
            ))}
          </select>
        </Field>
      </div>
      <div className="grid sm:grid-cols-3 gap-3">
        <Field label={mt(lang, 'signedBy')}>
          <input className="input-field" value={form.signed_by} onChange={(e) => setField('signed_by', e.target.value)} />
        </Field>
        <Field label={mt(lang, 'approvedByDecision')}>
          <select className="input-field" value={form.approved_by_decision_id} onChange={(e) => setField('approved_by_decision_id', e.target.value)}>
            <option value="">{mt(lang, 'none')}</option>
            {decisions.map((d) => (
              <option key={d.id} value={d.id}>{formatDate(d.decided_on, lang)} · {d.title}</option>
            ))}
          </select>
        </Field>
        <Field label={mt(lang, 'tender')}>
          <select className="input-field" value={form.tender_id} onChange={(e) => setField('tender_id', e.target.value)}>
            <option value="">{mt(lang, 'none')}</option>
            {tenders.map((t) => (
              <option key={t.id} value={t.id}>{t.title}</option>
            ))}
          </select>
        </Field>
      </div>
      <Field label={mt(lang, 'notes')}>
        <textarea rows={2} className="input-field" value={form.notes} onChange={(e) => setField('notes', e.target.value)} />
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
          {CONTRACT_STATUSES.map((s) => (
            <option key={s} value={s}>{mt(lang, `contractStatus_${s}`)}</option>
          ))}
        </select>
        {editingId === null && (
          <span className="flex gap-2 flex-wrap items-start">
            <DocumentReader lang={lang} kind="contract" label={mt(lang, 'docReadContract')} onRead={applyRead} />
            <button className="btn-primary text-sm" onClick={openNew}>+ {mt(lang, 'newContract')}</button>
          </span>
        )}
      </div>
      {suppliers.length === 0 && !loadingData && <p className="text-sm text-ink/50 mb-3">{mt(lang, 'noSuppliersYet')}</p>}

      {editingId === 'new' && formBlock}
      <ErrorBox message={loadError} />

      {loadingData ? (
        <p className="text-ink/60">{mt(lang, 'loading')}</p>
      ) : contracts.length === 0 ? (
        <p className="text-ink/60">{mt(lang, 'empty')}</p>
      ) : visible.length === 0 ? (
        <p className="text-ink/60">{mt(lang, 'noMatches')}</p>
      ) : (
        <div className="space-y-3">
          {visible.map((c) => {
            if (editingId === c.id) return <div key={c.id}>{formBlock}</div>;
            const left = c.status === 'active' ? daysUntil(c.ends_on) : null;
            const notice = c.status === 'active' ? noticeDeadline(c) : null;
            const noticeLeft = daysUntil(notice);
            return (
              <div key={c.id} className="card p-4">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <p className="font-semibold text-ink">{c.subject} <DemoPill show={c.is_demo} /></p>
                    <p className="text-sm text-ink/70">{supplierName[c.supplier_id] || '—'}</p>
                    <div className="flex flex-wrap items-center gap-2 mt-1">
                      <Pill tone={STATUS_TONE[c.status]}>{mt(lang, `contractStatus_${c.status}`)}</Pill>
                      {c.ends_on && (
                        <span className="text-xs text-ink/60">
                          {mt(lang, 'endsOn')}: {formatDate(c.ends_on, lang)}
                          {left !== null && ` (${left} ${mt(lang, 'days')})`}
                        </span>
                      )}
                      {c.auto_renew && <Pill tone="harbor">↻ {mt(lang, 'autoRenew')}</Pill>}
                      {noticeLeft !== null && noticeLeft <= 60 && (
                        <Pill tone={noticeLeft < 0 ? 'neutral' : 'red'}>
                          {mt(lang, 'noticeDeadline')}: {formatDate(notice, lang)}
                        </Pill>
                      )}
                      {c.amount !== null && (
                        <span className="text-xs text-ink/60">
                          {formatMoney(c.amount, c.currency, lang)}
                          {c.payment_frequency ? ` · ${mt(lang, `freq_${c.payment_frequency}`)}` : ''}
                        </span>
                      )}
                    </div>
                  </div>
                  {editingId === null && (
                    <div className="flex gap-3 text-sm flex-shrink-0">
                      <button className="text-harbor hover:underline" onClick={() => openEdit(c)}>{mt(lang, 'edit')}</button>
                      <button className="text-red-600 hover:underline" onClick={() => handleDelete(c)}>{mt(lang, 'delete')}</button>
                    </div>
                  )}
                </div>
                <button className="text-xs text-harbor/70 hover:text-harbor mt-3" onClick={() => setExpanded((p) => ({ ...p, [c.id]: !p[c.id] }))}>
                  {expanded[c.id] ? `▾ ${mt(lang, 'showLess')}` : `▸ ${mt(lang, 'showMore')}`}
                </button>
                {expanded[c.id] && (
                  <div className="mt-3 space-y-3 border-t border-ink/10 pt-3">
                    <DetailRow label={mt(lang, 'signedOn')}>{c.signed_on ? formatDate(c.signed_on, lang) : null}</DetailRow>
                    <DetailRow label={mt(lang, 'startsOn')}>{c.starts_on ? formatDate(c.starts_on, lang) : null}</DetailRow>
                    <DetailRow label={mt(lang, 'noticePeriodDays')}>{c.notice_period_days !== null ? String(c.notice_period_days) : null}</DetailRow>
                    <DetailRow label={mt(lang, 'signedBy')}>{c.signed_by}</DetailRow>
                    <DetailRow label={mt(lang, 'approvedByDecision')}>
                      {decisionById[c.approved_by_decision_id]
                        ? `${formatDate(decisionById[c.approved_by_decision_id].decided_on, lang)} · ${decisionById[c.approved_by_decision_id].title}`
                        : null}
                    </DetailRow>
                    <DetailRow label={mt(lang, 'tender')}>{tenderTitle[c.tender_id] || null}</DetailRow>
                    <DetailRow label={mt(lang, 'notes')}>{c.notes}</DetailRow>
                    <Attachments lang={lang} entityType="contract" entityId={c.id} defaultType="contract" />
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
