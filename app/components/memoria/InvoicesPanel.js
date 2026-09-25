'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../../lib/supabaseClient';
import { formatDate } from '../../../lib/formatDate';
import {
  mt, cleanFormValues, formatMoney, todayIso,
  PAYMENT_STATUSES, FUNDING_SOURCES, INVOICE_CATEGORIES,
} from '../../../lib/memoriaI18n';
import { Field, Pill, ErrorBox, DetailRow, DemoPill } from './MemoriaUi';
import Attachments, { removeEntityExtras } from './Attachments';

const EMPTY_FORM = {
  supplier_id: '',
  contract_id: '',
  tender_id: '',
  invoice_number: '',
  invoice_date: '',
  due_date: '',
  paid_on: '',
  payment_status: 'pending',
  net_amount: '',
  vat_amount: '',
  total_amount: '',
  currency: 'EUR',
  description: '',
  category: 'other',
  funding_source: 'ordinary_budget',
  period_year: '',
  period_month: '',
  is_urgent_unbudgeted: false,
  urgency_reason: '',
  ratified_by_decision_id: '',
};
const NUMBER_FIELDS = ['net_amount', 'vat_amount', 'total_amount', 'period_year', 'period_month'];
const PAYMENT_TONE = { pending: 'ochre', paid: 'green', overdue: 'red', disputed: 'red' };

function toForm(inv) {
  const form = { ...EMPTY_FORM };
  for (const key of Object.keys(EMPTY_FORM)) {
    const v = inv[key];
    if (key === 'is_urgent_unbudgeted') form[key] = Boolean(v);
    else form[key] = v === null || v === undefined ? '' : String(v);
  }
  return form;
}

function friendlyError(lang, error) {
  if (error?.code === '23505') return mt(lang, 'duplicateInvoice');
  return mt(lang, 'saveError', { error: error?.message || '' });
}

export default function InvoicesPanel({ lang, onChanged }) {
  const [invoices, setInvoices] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [contracts, setContracts] = useState([]);
  const [tenders, setTenders] = useState([]);
  const [decisions, setDecisions] = useState([]);
  const [loadingData, setLoadingData] = useState(true);
  const [loadError, setLoadError] = useState('');

  const [query, setQuery] = useState('');
  const [yearFilter, setYearFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [paymentFilter, setPaymentFilter] = useState('');
  const [fundingFilter, setFundingFilter] = useState('');
  const [onlyUnratified, setOnlyUnratified] = useState(false);
  const [expanded, setExpanded] = useState({});

  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  async function load() {
    const [iRes, sRes, cRes, tRes, dRes] = await Promise.all([
      supabase.from('memoria_invoices').select('*').order('invoice_date', { ascending: false, nullsFirst: false }).order('created_at', { ascending: false }),
      supabase.from('memoria_suppliers').select('id, name').order('name', { ascending: true }),
      supabase.from('memoria_contracts').select('id, subject, supplier_id').order('subject', { ascending: true }),
      supabase.from('memoria_tenders').select('id, title').order('created_at', { ascending: false }),
      supabase.from('memoria_decisions').select('id, title, decided_on').order('decided_on', { ascending: false }),
    ]);
    const firstError = iRes.error || sRes.error || cRes.error || tRes.error || dRes.error;
    setLoadError(firstError ? firstError.message : '');
    setInvoices(iRes.data || []);
    setSuppliers(sRes.data || []);
    setContracts(cRes.data || []);
    setTenders(tRes.data || []);
    setDecisions(dRes.data || []);
    setLoadingData(false);
  }

  useEffect(() => {
    load();
  }, []);

  const supplierName = useMemo(() => Object.fromEntries(suppliers.map((s) => [s.id, s.name])), [suppliers]);
  const contractById = useMemo(() => Object.fromEntries(contracts.map((c) => [c.id, c])), [contracts]);
  const tenderTitle = useMemo(() => Object.fromEntries(tenders.map((t) => [t.id, t.title])), [tenders]);
  const decisionById = useMemo(() => Object.fromEntries(decisions.map((d) => [d.id, d])), [decisions]);

  function yearOf(inv) {
    return inv.period_year || (inv.invoice_date ? Number(inv.invoice_date.slice(0, 4)) : null);
  }

  const years = useMemo(
    () => [...new Set(invoices.map(yearOf).filter(Boolean))].sort((a, b) => b - a),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [invoices]
  );

  const visible = invoices.filter((inv) => {
    if (yearFilter && String(yearOf(inv)) !== yearFilter) return false;
    if (categoryFilter && inv.category !== categoryFilter) return false;
    if (paymentFilter && inv.payment_status !== paymentFilter) return false;
    if (fundingFilter && inv.funding_source !== fundingFilter) return false;
    if (onlyUnratified && !(inv.is_urgent_unbudgeted && !inv.ratified_by_decision_id)) return false;
    if (query) {
      const q = query.toLowerCase();
      const haystack = [inv.invoice_number, inv.description, supplierName[inv.supplier_id], inv.external_ref].join(' ').toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });

  // Súčet po menách (väčšinou len EUR).
  const totals = useMemo(() => {
    const map = {};
    for (const inv of visible) map[inv.currency || 'EUR'] = (map[inv.currency || 'EUR'] || 0) + Number(inv.total_amount || 0);
    return Object.entries(map);
  }, [visible]);

  function openNew() {
    const today = todayIso();
    setForm({ ...EMPTY_FORM, invoice_date: today, period_year: today.slice(0, 4), period_month: String(Number(today.slice(5, 7))) });
    setFormError('');
    setEditingId('new');
  }

  function openEdit(inv) {
    // Pri úprave existujúcej faktúry sa celková suma už sama neprepočítava.
    setForm({ ...toForm(inv), total_amount_touched: true });
    setFormError('');
    setEditingId(inv.id);
  }

  function closeForm() {
    setEditingId(null);
    setFormError('');
  }

  function setField(key, value) {
    setForm((prev) => {
      const next = { ...prev, [key]: value };
      // Pri výbere zmluvy doplň dodávateľa, ak ešte nie je zvolený.
      if (key === 'contract_id' && value && !prev.supplier_id && contractById[value]) {
        next.supplier_id = contractById[value].supplier_id;
      }
      // Celkovú sumu dopočítaj z netto + DPH, ak ju používateľ nezadal.
      if ((key === 'net_amount' || key === 'vat_amount') && !prev.total_amount_touched) {
        const net = parseFloat(key === 'net_amount' ? value : prev.net_amount);
        const vat = parseFloat(key === 'vat_amount' ? value : prev.vat_amount);
        if (!Number.isNaN(net)) next.total_amount = String(Math.round((net + (Number.isNaN(vat) ? 0 : vat)) * 100) / 100);
      }
      if (key === 'total_amount') next.total_amount_touched = true;
      return next;
    });
  }

  async function handleSave(e) {
    e.preventDefault();
    const { total_amount_touched, ...raw } = form;
    const values = cleanFormValues(raw, NUMBER_FIELDS);
    if (values.total_amount === null || values.total_amount === undefined) {
      setFormError(`${mt(lang, 'totalAmount')}: ${mt(lang, 'required')}`);
      return;
    }
    if (values.is_urgent_unbudgeted && !values.urgency_reason) {
      setFormError(mt(lang, 'urgencyReasonRequired'));
      return;
    }
    if (!values.is_urgent_unbudgeted) {
      values.urgency_reason = null;
    }
    if (values.payment_status === 'paid' && !values.paid_on) values.paid_on = todayIso();
    if (!values.currency) values.currency = 'EUR';

    setSaving(true);
    setFormError('');
    const { error } =
      editingId === 'new'
        ? await supabase.from('memoria_invoices').insert({ ...values, import_source: 'manual' })
        : await supabase.from('memoria_invoices').update(values).eq('id', editingId);
    setSaving(false);
    if (error) {
      setFormError(friendlyError(lang, error));
      return;
    }
    closeForm();
    await load();
    onChanged?.();
  }

  async function handleDelete(inv) {
    if (!window.confirm(mt(lang, 'confirmDelete', { name: inv.invoice_number || inv.description || formatMoney(inv.total_amount, inv.currency, lang) }))) return;
    const { error } = await supabase.from('memoria_invoices').delete().eq('id', inv.id);
    if (error) {
      window.alert(friendlyError(lang, error));
      return;
    }
    await removeEntityExtras('invoice', inv.id);
    await load();
    onChanged?.();
  }

  const formBlock = (
    <form onSubmit={handleSave} className="card p-4 space-y-4 mb-6 border-2 border-ochre/40">
      <h3 className="font-display text-lg text-harbor">{editingId === 'new' ? mt(lang, 'newInvoice') : mt(lang, 'edit')}</h3>
      <div className="grid sm:grid-cols-3 gap-3">
        <Field label={mt(lang, 'supplier')}>
          <select className="input-field" value={form.supplier_id} onChange={(e) => setField('supplier_id', e.target.value)}>
            <option value="">{mt(lang, 'none')}</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </Field>
        <Field label={mt(lang, 'invoiceNumber')}>
          <input className="input-field" value={form.invoice_number} onChange={(e) => setField('invoice_number', e.target.value)} />
        </Field>
        <Field label={mt(lang, 'invoiceDate')}>
          <input type="date" className="input-field" value={form.invoice_date} onChange={(e) => setField('invoice_date', e.target.value)} />
        </Field>
      </div>
      <Field label={mt(lang, 'description')}>
        <input className="input-field" value={form.description} onChange={(e) => setField('description', e.target.value)} />
      </Field>
      <div className="grid sm:grid-cols-4 gap-3">
        <Field label={mt(lang, 'netAmount')}>
          <input type="number" step="0.01" className="input-field" value={form.net_amount} onChange={(e) => setField('net_amount', e.target.value)} />
        </Field>
        <Field label={mt(lang, 'vatAmount')}>
          <input type="number" step="0.01" className="input-field" value={form.vat_amount} onChange={(e) => setField('vat_amount', e.target.value)} />
        </Field>
        <Field label={mt(lang, 'totalAmount')} required>
          <input type="number" step="0.01" className="input-field" value={form.total_amount} onChange={(e) => setField('total_amount', e.target.value)} />
        </Field>
        <Field label={mt(lang, 'currency')}>
          <input className="input-field" maxLength={3} value={form.currency} onChange={(e) => setField('currency', e.target.value.toUpperCase())} />
        </Field>
      </div>
      <div className="grid sm:grid-cols-4 gap-3">
        <Field label={mt(lang, 'category')}>
          <select className="input-field" value={form.category} onChange={(e) => setField('category', e.target.value)}>
            {INVOICE_CATEGORIES.map((c) => (
              <option key={c} value={c}>{mt(lang, `invcat_${c}`)}</option>
            ))}
          </select>
        </Field>
        <Field label={mt(lang, 'fundingSource')}>
          <select className="input-field" value={form.funding_source} onChange={(e) => setField('funding_source', e.target.value)}>
            {FUNDING_SOURCES.map((f) => (
              <option key={f} value={f}>{mt(lang, `fund_${f}`)}</option>
            ))}
          </select>
        </Field>
        <Field label={mt(lang, 'periodYear')}>
          <input type="number" min="2000" max="2100" className="input-field" value={form.period_year} onChange={(e) => setField('period_year', e.target.value)} />
        </Field>
        <Field label={mt(lang, 'periodMonth')}>
          <select className="input-field" value={form.period_month} onChange={(e) => setField('period_month', e.target.value)}>
            <option value="">—</option>
            {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
              <option key={m} value={String(m)}>{m}</option>
            ))}
          </select>
        </Field>
      </div>
      <div className="grid sm:grid-cols-3 gap-3">
        <Field label={mt(lang, 'paymentStatus')}>
          <select className="input-field" value={form.payment_status} onChange={(e) => setField('payment_status', e.target.value)}>
            {PAYMENT_STATUSES.map((p) => (
              <option key={p} value={p}>{mt(lang, `payment_${p}`)}</option>
            ))}
          </select>
        </Field>
        <Field label={mt(lang, 'dueDate')}>
          <input type="date" className="input-field" value={form.due_date} onChange={(e) => setField('due_date', e.target.value)} />
        </Field>
        <Field label={mt(lang, 'paidOn')}>
          <input type="date" className="input-field" value={form.paid_on} onChange={(e) => setField('paid_on', e.target.value)} />
        </Field>
      </div>
      <div className="grid sm:grid-cols-2 gap-3">
        <Field label={mt(lang, 'contract')}>
          <select className="input-field" value={form.contract_id} onChange={(e) => setField('contract_id', e.target.value)}>
            <option value="">{mt(lang, 'none')}</option>
            {contracts.map((c) => (
              <option key={c.id} value={c.id}>{c.subject}{supplierName[c.supplier_id] ? ` (${supplierName[c.supplier_id]})` : ''}</option>
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
      <div className="rounded-lg border border-ochre/40 p-3 space-y-3">
        <label className="flex items-start gap-2 text-sm text-ink">
          <input type="checkbox" className="mt-1" checked={form.is_urgent_unbudgeted} onChange={(e) => setField('is_urgent_unbudgeted', e.target.checked)} />
          <span>{mt(lang, 'urgentUnbudgeted')}</span>
        </label>
        {form.is_urgent_unbudgeted && (
          <div className="grid sm:grid-cols-2 gap-3">
            <Field label={mt(lang, 'urgencyReason')} required>
              <input className="input-field" value={form.urgency_reason} onChange={(e) => setField('urgency_reason', e.target.value)} />
            </Field>
            <Field label={mt(lang, 'ratifiedByDecision')}>
              <select className="input-field" value={form.ratified_by_decision_id} onChange={(e) => setField('ratified_by_decision_id', e.target.value)}>
                <option value="">{mt(lang, 'notRatified')}</option>
                {decisions.map((d) => (
                  <option key={d.id} value={d.id}>{formatDate(d.decided_on, lang)} · {d.title}</option>
                ))}
              </select>
            </Field>
          </div>
        )}
      </div>
      <ErrorBox message={formError} />
      <div className="flex gap-2">
        <button type="submit" className="btn-primary" disabled={saving}>{saving ? mt(lang, 'saving') : mt(lang, 'save')}</button>
        <button type="button" className="btn-secondary" onClick={closeForm}>{mt(lang, 'cancel')}</button>
      </div>
    </form>
  );

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-2">
        <input className="input-field !w-auto flex-1 min-w-[12rem]" placeholder={mt(lang, 'search')} value={query} onChange={(e) => setQuery(e.target.value)} />
        <select className="input-field !w-auto" value={yearFilter} onChange={(e) => setYearFilter(e.target.value)}>
          <option value="">{mt(lang, 'periodYear')}: {mt(lang, 'all')}</option>
          {years.map((y) => (
            <option key={y} value={String(y)}>{y}</option>
          ))}
        </select>
        <select className="input-field !w-auto" value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
          <option value="">{mt(lang, 'category')}: {mt(lang, 'all')}</option>
          {INVOICE_CATEGORIES.map((c) => (
            <option key={c} value={c}>{mt(lang, `invcat_${c}`)}</option>
          ))}
        </select>
        <select className="input-field !w-auto" value={paymentFilter} onChange={(e) => setPaymentFilter(e.target.value)}>
          <option value="">{mt(lang, 'paymentStatus')}: {mt(lang, 'all')}</option>
          {PAYMENT_STATUSES.map((p) => (
            <option key={p} value={p}>{mt(lang, `payment_${p}`)}</option>
          ))}
        </select>
        <select className="input-field !w-auto" value={fundingFilter} onChange={(e) => setFundingFilter(e.target.value)}>
          <option value="">{mt(lang, 'fundingSource')}: {mt(lang, 'all')}</option>
          {FUNDING_SOURCES.map((f) => (
            <option key={f} value={f}>{mt(lang, `fund_${f}`)}</option>
          ))}
        </select>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <label className="flex items-center gap-2 text-sm text-ink">
          <input type="checkbox" checked={onlyUnratified} onChange={(e) => setOnlyUnratified(e.target.checked)} />
          {mt(lang, 'onlyUnratified')}
        </label>
        {editingId === null && (
          <button className="btn-primary text-sm" onClick={openNew}>+ {mt(lang, 'newInvoice')}</button>
        )}
      </div>

      {editingId === 'new' && formBlock}
      <ErrorBox message={loadError} />

      {loadingData ? (
        <p className="text-ink/60">{mt(lang, 'loading')}</p>
      ) : invoices.length === 0 ? (
        <p className="text-ink/60">{mt(lang, 'empty')}</p>
      ) : visible.length === 0 ? (
        <p className="text-ink/60">{mt(lang, 'noMatches')}</p>
      ) : (
        <>
          <p className="text-sm text-ink/70 mb-3">
            {mt(lang, 'totalShown')} ({visible.length}):{' '}
            <span className="font-semibold text-ink">{totals.map(([cur, sum]) => formatMoney(sum, cur, lang)).join(' + ')}</span>
          </p>
          <div className="space-y-3">
            {visible.map((inv) => {
              if (editingId === inv.id) return <div key={inv.id}>{formBlock}</div>;
              const unratified = inv.is_urgent_unbudgeted && !inv.ratified_by_decision_id;
              return (
                <div key={inv.id} className={`card p-4 ${unratified ? 'border-l-4 border-l-red-400' : ''}`}>
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="min-w-0">
                      <p className="font-semibold text-ink">
                        {formatMoney(inv.total_amount, inv.currency, lang)}
                        <span className="font-normal text-ink/70"> · {supplierName[inv.supplier_id] || '—'}</span>{' '}
                        <DemoPill show={inv.is_demo} />
                      </p>
                      <p className="text-sm text-ink/70">
                        {[inv.invoice_number, inv.invoice_date ? formatDate(inv.invoice_date, lang) : null, inv.description].filter(Boolean).join(' · ')}
                      </p>
                      <div className="flex flex-wrap items-center gap-2 mt-1">
                        <Pill tone={PAYMENT_TONE[inv.payment_status]}>{mt(lang, `payment_${inv.payment_status}`)}</Pill>
                        <Pill tone="harbor">{mt(lang, `invcat_${inv.category}`)}</Pill>
                        {inv.funding_source !== 'ordinary_budget' && <Pill tone="ochre">{mt(lang, `fund_${inv.funding_source}`)}</Pill>}
                        {inv.is_urgent_unbudgeted && (
                          <Pill tone={unratified ? 'red' : 'green'}>
                            {mt(lang, 'urgentBadge')} · {unratified ? mt(lang, 'notRatified') : '✓'}
                          </Pill>
                        )}
                      </div>
                    </div>
                    {editingId === null && (
                      <div className="flex gap-3 text-sm flex-shrink-0">
                        <button className="text-harbor hover:underline" onClick={() => openEdit(inv)}>{mt(lang, 'edit')}</button>
                        <button className="text-red-600 hover:underline" onClick={() => handleDelete(inv)}>{mt(lang, 'delete')}</button>
                      </div>
                    )}
                  </div>
                  <button className="text-xs text-harbor/70 hover:text-harbor mt-3" onClick={() => setExpanded((p) => ({ ...p, [inv.id]: !p[inv.id] }))}>
                    {expanded[inv.id] ? `▾ ${mt(lang, 'showLess')}` : `▸ ${mt(lang, 'showMore')}`}
                  </button>
                  {expanded[inv.id] && (
                    <div className="mt-3 space-y-3 border-t border-ink/10 pt-3">
                      <DetailRow label={`${mt(lang, 'netAmount')} / ${mt(lang, 'vatAmount')}`}>
                        {inv.net_amount !== null || inv.vat_amount !== null
                          ? `${formatMoney(inv.net_amount, inv.currency, lang)} / ${formatMoney(inv.vat_amount, inv.currency, lang)}`
                          : null}
                      </DetailRow>
                      <DetailRow label={mt(lang, 'dueDate')}>{inv.due_date ? formatDate(inv.due_date, lang) : null}</DetailRow>
                      <DetailRow label={mt(lang, 'paidOn')}>{inv.paid_on ? formatDate(inv.paid_on, lang) : null}</DetailRow>
                      <DetailRow label={`${mt(lang, 'periodYear')} / ${mt(lang, 'periodMonth')}`}>
                        {inv.period_year ? `${inv.period_year}${inv.period_month ? ` / ${inv.period_month}` : ''}` : null}
                      </DetailRow>
                      <DetailRow label={mt(lang, 'contract')}>{contractById[inv.contract_id]?.subject || null}</DetailRow>
                      <DetailRow label={mt(lang, 'tender')}>{tenderTitle[inv.tender_id] || null}</DetailRow>
                      <DetailRow label={mt(lang, 'urgencyReason')}>{inv.urgency_reason}</DetailRow>
                      <DetailRow label={mt(lang, 'ratifiedByDecision')}>
                        {decisionById[inv.ratified_by_decision_id]
                          ? `${formatDate(decisionById[inv.ratified_by_decision_id].decided_on, lang)} · ${decisionById[inv.ratified_by_decision_id].title}`
                          : null}
                      </DetailRow>
                      <Attachments lang={lang} entityType="invoice" entityId={inv.id} defaultType="invoice" />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
