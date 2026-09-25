'use client';

// Poistné udalosti, spory, reklamácie a právne veci: čo sa stalo, s kým, o akú sumu,
// v akom je to stave, aký je ďalší krok a do kedy. Iba fakty; rozhoduje board.

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../../lib/supabaseClient';
import { formatDate } from '../../../lib/formatDate';
import { mt, cleanFormValues, formatMoney, todayIso, relativeDue } from '../../../lib/memoriaI18n';
import { Field, Pill, ErrorBox, DetailRow, DemoPill, StatTile } from './MemoriaUi';
import Attachments, { removeEntityExtras } from './Attachments';

export const CASE_TYPES = ['insurance_claim', 'dispute', 'warranty', 'legal'];
export const CASE_STATUSES = ['open', 'in_progress', 'waiting', 'settled', 'won', 'lost', 'closed'];
export const OPEN_CASE_STATUSES = ['open', 'in_progress', 'waiting'];
const STATUS_TONE = { open: 'ochre', in_progress: 'harbor', waiting: 'ochre', settled: 'green', won: 'green', lost: 'red', closed: 'neutral' };
const TYPE_ICON = { insurance_claim: '🛡️', dispute: '⚖️', warranty: '🔧', legal: '📜' };

const EMPTY_FORM = {
  case_type: 'insurance_claim',
  title: '',
  description: '',
  counterparty: '',
  supplier_id: '',
  reference: '',
  opened_on: '',
  status: 'open',
  amount_claimed: '',
  amount_recovered: '',
  next_step: '',
  next_step_due: '',
  responsible: '',
  decision_id: '',
  closed_on: '',
};
const NUMBER_FIELDS = ['amount_claimed', 'amount_recovered'];

function toForm(c) {
  const form = { ...EMPTY_FORM };
  for (const k of Object.keys(EMPTY_FORM)) form[k] = c[k] === null || c[k] === undefined ? '' : String(c[k]);
  return form;
}

export default function CasesPanel({ lang, onChanged }) {
  const [cases, setCases] = useState([]);
  const [updates, setUpdates] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [decisions, setDecisions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('open');
  const [expanded, setExpanded] = useState({});
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [noteDraft, setNoteDraft] = useState({});

  const today = todayIso();

  async function load() {
    const [cRes, uRes, sRes, dRes] = await Promise.all([
      supabase.from('memoria_cases').select('*').order('opened_on', { ascending: false }),
      supabase.from('memoria_case_updates').select('*').order('happened_on', { ascending: false }),
      supabase.from('memoria_suppliers').select('id, name').order('name', { ascending: true }),
      supabase.from('memoria_decisions').select('id, title, decided_on').order('decided_on', { ascending: false }),
    ]);
    const firstError = [cRes, uRes, sRes, dRes].find((r) => r.error)?.error;
    setError(firstError ? firstError.message : '');
    setCases(cRes.data || []);
    setUpdates(uRes.data || []);
    setSuppliers(sRes.data || []);
    setDecisions(dRes.data || []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  const supplierName = useMemo(() => Object.fromEntries(suppliers.map((s) => [s.id, s.name])), [suppliers]);
  const decisionById = useMemo(() => Object.fromEntries(decisions.map((d) => [d.id, d])), [decisions]);
  const openCases = cases.filter((c) => OPEN_CASE_STATUSES.includes(c.status));
  const overdue = openCases.filter((c) => c.next_step_due && c.next_step_due < today);
  const claimedOpen = openCases.reduce((s, c) => s + Number(c.amount_claimed || 0), 0);
  const recovered = cases.reduce((s, c) => s + Number(c.amount_recovered || 0), 0);

  const visible = cases.filter((c) => {
    if (filter === 'open') return OPEN_CASE_STATUSES.includes(c.status);
    if (filter === 'overdue') return OPEN_CASE_STATUSES.includes(c.status) && c.next_step_due && c.next_step_due < today;
    if (filter === 'closed') return !OPEN_CASE_STATUSES.includes(c.status);
    return true;
  });

  function setField(k, v) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function handleSave(e) {
    e.preventDefault();
    const v = cleanFormValues(form, NUMBER_FIELDS);
    if (!v.title || !v.opened_on) {
      setError(`${mt(lang, 'title')}, ${mt(lang, 'caseOpenedOn')}: ${mt(lang, 'required')}`);
      return;
    }
    if (!OPEN_CASE_STATUSES.includes(v.status) && !v.closed_on) v.closed_on = today;
    if (OPEN_CASE_STATUSES.includes(v.status)) v.closed_on = null;
    setSaving(true);
    const res = editingId === 'new' ? await supabase.from('memoria_cases').insert(v) : await supabase.from('memoria_cases').update(v).eq('id', editingId);
    setSaving(false);
    if (res.error) return setError(mt(lang, 'saveError', { error: res.error.message }));
    setEditingId(null);
    await load();
    onChanged?.();
  }

  async function handleDelete(c) {
    if (!window.confirm(mt(lang, 'confirmDelete', { name: c.title }))) return;
    await removeEntityExtras('case', c.id);
    const { error: e1 } = await supabase.from('memoria_cases').delete().eq('id', c.id);
    if (e1) return setError(mt(lang, 'saveError', { error: e1.message }));
    await load();
    onChanged?.();
  }

  async function addNote(c) {
    const note = (noteDraft[c.id] || '').trim();
    if (!note) return;
    const { error: e1 } = await supabase.from('memoria_case_updates').insert({ case_id: c.id, note, happened_on: today, is_demo: c.is_demo });
    if (e1) return setError(mt(lang, 'saveError', { error: e1.message }));
    setNoteDraft((d) => ({ ...d, [c.id]: '' }));
    await load();
  }

  const formBlock = (
    <form onSubmit={handleSave} className="card p-4 space-y-3 border-2 border-ochre/40">
      <h3 className="font-display text-lg text-harbor">{editingId === 'new' ? mt(lang, 'newCase') : mt(lang, 'edit')}</h3>
      <div className="grid sm:grid-cols-2 gap-3">
        <Field label={mt(lang, 'caseType')} required>
          <select className="input-field" value={form.case_type} onChange={(e) => setField('case_type', e.target.value)}>
            {CASE_TYPES.map((t) => (
              <option key={t} value={t}>{mt(lang, `ct_${t}`)}</option>
            ))}
          </select>
        </Field>
        <Field label={mt(lang, 'status')} required>
          <select className="input-field" value={form.status} onChange={(e) => setField('status', e.target.value)}>
            {CASE_STATUSES.map((s) => (
              <option key={s} value={s}>{mt(lang, `cs_${s}`)}</option>
            ))}
          </select>
        </Field>
        <Field label={mt(lang, 'title')} required className="sm:col-span-2">
          <input className="input-field" value={form.title} onChange={(e) => setField('title', e.target.value)} />
        </Field>
        <Field label={mt(lang, 'caseCounterparty')} hint={mt(lang, 'caseNoOwnerNames')}>
          <input className="input-field" value={form.counterparty} onChange={(e) => setField('counterparty', e.target.value)} />
        </Field>
        <Field label={mt(lang, 'supplier')}>
          <select className="input-field" value={form.supplier_id} onChange={(e) => setField('supplier_id', e.target.value)}>
            <option value="">{mt(lang, 'none')}</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </Field>
        <Field label={mt(lang, 'caseReference')}>
          <input className="input-field" value={form.reference} onChange={(e) => setField('reference', e.target.value)} />
        </Field>
        <Field label={mt(lang, 'caseOpenedOn')} required>
          <input type="date" className="input-field" value={form.opened_on} onChange={(e) => setField('opened_on', e.target.value)} />
        </Field>
        <Field label={`${mt(lang, 'caseClaimed')} (EUR)`}>
          <input className="input-field" inputMode="decimal" value={form.amount_claimed} onChange={(e) => setField('amount_claimed', e.target.value)} />
        </Field>
        <Field label={`${mt(lang, 'caseRecovered')} (EUR)`}>
          <input className="input-field" inputMode="decimal" value={form.amount_recovered} onChange={(e) => setField('amount_recovered', e.target.value)} />
        </Field>
        <Field label={mt(lang, 'caseNextStep')}>
          <input className="input-field" value={form.next_step} onChange={(e) => setField('next_step', e.target.value)} />
        </Field>
        <Field label={mt(lang, 'caseNextStepDue')}>
          <input type="date" className="input-field" value={form.next_step_due} onChange={(e) => setField('next_step_due', e.target.value)} />
        </Field>
        <Field label={mt(lang, 'responsible')}>
          <input className="input-field" value={form.responsible} onChange={(e) => setField('responsible', e.target.value)} />
        </Field>
        <Field label={mt(lang, 'approvedByDecision')}>
          <select className="input-field" value={form.decision_id} onChange={(e) => setField('decision_id', e.target.value)}>
            <option value="">{mt(lang, 'none')}</option>
            {decisions.map((d) => (
              <option key={d.id} value={d.id}>{`${formatDate(d.decided_on, lang)} · ${d.title}`}</option>
            ))}
          </select>
        </Field>
      </div>
      <Field label={mt(lang, 'description')}>
        <textarea className="input-field" rows={3} value={form.description} onChange={(e) => setField('description', e.target.value)} />
      </Field>
      <div className="flex gap-2">
        <button type="submit" className="btn-primary" disabled={saving}>{saving ? mt(lang, 'saving') : mt(lang, 'save')}</button>
        <button type="button" className="btn-secondary" onClick={() => setEditingId(null)}>{mt(lang, 'cancel')}</button>
      </div>
    </form>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <p className="text-sm text-ink/70 max-w-2xl">{mt(lang, 'casesIntro')}</p>
        {editingId === null && (
          <button
            className="btn-primary text-sm"
            onClick={() => {
              setForm({ ...EMPTY_FORM, opened_on: today });
              setEditingId('new');
            }}
          >
            + {mt(lang, 'newCase')}
          </button>
        )}
      </div>
      <ErrorBox message={error} />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <StatTile label={mt(lang, 'casesOpen')} value={openCases.length} active={filter === 'open'} onClick={() => setFilter('open')} />
        <StatTile label={mt(lang, 'casesOverdue')} value={overdue.length} tone={overdue.length ? 'red' : 'neutral'} active={filter === 'overdue'} onClick={() => setFilter('overdue')} />
        <StatTile label={mt(lang, 'casesClaimedOpen')} value={formatMoney(claimedOpen, 'EUR', lang)} />
        <StatTile label={mt(lang, 'casesRecovered')} value={formatMoney(recovered, 'EUR', lang)} tone="green" active={filter === 'closed'} onClick={() => setFilter('closed')} />
      </div>
      <div className="flex gap-3 text-sm">
        {['open', 'overdue', 'closed', 'all'].map((f) => (
          <button key={f} className={`hover:underline ${filter === f ? 'font-semibold text-harbor' : 'text-ink/60'}`} onClick={() => setFilter(f)}>
            {mt(lang, `caseFilter_${f}`)}
          </button>
        ))}
      </div>

      {editingId === 'new' && formBlock}

      {loading ? (
        <p className="text-sm text-ink/60">{mt(lang, 'loading')}</p>
      ) : visible.length === 0 ? (
        <p className="text-sm text-ink/60">{mt(lang, 'empty')}</p>
      ) : (
        <ul className="space-y-3">
          {visible.map((c) =>
            editingId === c.id ? (
              <li key={c.id}>{formBlock}</li>
            ) : (
              <li key={c.id} className="card p-4">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <p className="font-semibold text-harbor">
                      {TYPE_ICON[c.case_type]} {c.title} <DemoPill show={c.is_demo} />
                    </p>
                    <p className="text-sm text-ink/70">
                      {mt(lang, `ct_${c.case_type}`)} · {c.counterparty || supplierName[c.supplier_id] || '—'}
                      {c.reference ? ` · ${c.reference}` : ''} · {mt(lang, 'caseOpenedOn')} {formatDate(c.opened_on, lang)}
                    </p>
                    {c.amount_claimed !== null && (
                      <p className="text-sm text-ink/70">
                        {mt(lang, 'caseClaimed')}: {formatMoney(c.amount_claimed, 'EUR', lang)}
                        {c.amount_recovered !== null ? ` · ${mt(lang, 'caseRecovered')}: ${formatMoney(c.amount_recovered, 'EUR', lang)}` : ''}
                      </p>
                    )}
                  </div>
                  <Pill tone={STATUS_TONE[c.status]}>{mt(lang, `cs_${c.status}`)}</Pill>
                </div>
                {OPEN_CASE_STATUSES.includes(c.status) && c.next_step && (
                  <p className={`text-sm mt-2 ${c.next_step_due && c.next_step_due < today ? 'text-red-700' : 'text-ink'}`}>
                    ➜ {c.next_step}
                    {c.next_step_due ? ` · ${formatDate(c.next_step_due, lang)} (${relativeDue(c.next_step_due, lang)})` : ''}
                    {c.responsible ? ` · ${c.responsible}` : ''}
                  </p>
                )}
                <div className="flex gap-3 mt-2 text-xs">
                  <button className="text-harbor hover:underline" onClick={() => setExpanded((x) => ({ ...x, [c.id]: !x[c.id] }))}>
                    {expanded[c.id] ? `▾ ${mt(lang, 'showLess')}` : `▸ ${mt(lang, 'showMore')}`}
                  </button>
                  <button
                    className="text-harbor hover:underline"
                    onClick={() => {
                      setForm(toForm(c));
                      setEditingId(c.id);
                    }}
                  >
                    {mt(lang, 'edit')}
                  </button>
                  <button className="text-red-700 hover:underline" onClick={() => handleDelete(c)}>{mt(lang, 'delete')}</button>
                </div>
                {expanded[c.id] && (
                  <div className="mt-3 space-y-3">
                    <DetailRow label={mt(lang, 'description')}>{c.description}</DetailRow>
                    {c.decision_id && decisionById[c.decision_id] && (
                      <DetailRow label={mt(lang, 'approvedByDecision')}>{`${formatDate(decisionById[c.decision_id].decided_on, lang)} · ${decisionById[c.decision_id].title}`}</DetailRow>
                    )}
                    {c.closed_on && <DetailRow label={mt(lang, 'caseClosedOn')}>{formatDate(c.closed_on, lang)}</DetailRow>}
                    <div>
                      <p className="text-xs font-semibold text-ink/50 uppercase tracking-wide mb-1">{mt(lang, 'caseHistory')}</p>
                      <ul className="text-sm space-y-1">
                        {updates
                          .filter((u) => u.case_id === c.id)
                          .map((u) => (
                            <li key={u.id}>
                              <span className="text-ink/50">{formatDate(u.happened_on, lang)}</span> · {u.note}
                            </li>
                          ))}
                      </ul>
                      <div className="flex gap-2 mt-2">
                        <input
                          className="input-field text-sm"
                          placeholder={mt(lang, 'caseAddNote')}
                          value={noteDraft[c.id] || ''}
                          onChange={(e) => setNoteDraft((d) => ({ ...d, [c.id]: e.target.value }))}
                          onKeyDown={(e) => e.key === 'Enter' && addNote(c)}
                        />
                        <button className="btn-secondary text-sm py-1" onClick={() => addNote(c)}>+</button>
                      </div>
                    </div>
                    <Attachments lang={lang} entityType="case" entityId={c.id} defaultType="correspondence" />
                  </div>
                )}
              </li>
            )
          )}
        </ul>
      )}
    </div>
  );
}
