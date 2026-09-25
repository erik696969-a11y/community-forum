'use client';

// Kalendár povinností: systém za prezidenta pamätá lehoty.
// Spája (1) opakované povinnosti (revízie, poistky…), (2) lehoty zo stanov
// a zákona vypočítané zo zasadnutí, (3) termíny úloh a (4) lehoty zmlúv.

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../../lib/supabaseClient';
import { formatDate } from '../../../lib/formatDate';
import {
  mt, cleanFormValues, todayIso, addDaysIso, addMonthsIso, daysUntil, relativeDue,
  OBLIGATION_CATEGORIES, RECURRENCES, RECURRENCE_MONTHS, OPEN_TASK_STATUSES,
} from '../../../lib/memoriaI18n';
import { Field, Pill, ErrorBox, DetailRow, DemoPill } from './MemoriaUi';
import Attachments, { removeEntityExtras } from './Attachments';
import { buildTimeline } from './timeline';

const EMPTY_FORM = {
  title: '',
  category: 'inspection',
  legal_basis: '',
  recurrence: 'annual',
  next_due_on: '',
  remind_days: '30',
  responsible_name: '',
  supplier_id: '',
  contract_id: '',
  asset_note: '',
  notes: '',
  active: true,
};
const KIND_TONE = { obligation: 'harbor', statutory: 'ochre', task: 'neutral', contract: 'green' };

function toForm(o) {
  const form = { ...EMPTY_FORM };
  for (const key of Object.keys(EMPTY_FORM)) {
    const v = o[key];
    if (key === 'active') form[key] = Boolean(v);
    else form[key] = v === null || v === undefined ? '' : String(v);
  }
  return form;
}

export default function CalendarPanel({ lang, onChanged, onOpenTab }) {
  const [view, setView] = useState('timeline');
  const [obligations, setObligations] = useState([]);
  const [logs, setLogs] = useState({});
  const [tasks, setTasks] = useState([]);
  const [meetings, setMeetings] = useState([]);
  const [contracts, setContracts] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [loadingData, setLoadingData] = useState(true);
  const [loadError, setLoadError] = useState('');

  const [query, setQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [expanded, setExpanded] = useState({});
  const [doneForm, setDoneForm] = useState({}); // id -> {done_on, evidence, issues_found}

  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  async function load() {
    const [oRes, tRes, mRes, cRes, sRes] = await Promise.all([
      supabase.from('memoria_obligations').select('*').order('next_due_on', { ascending: true }),
      supabase.from('memoria_tasks').select('id, title, due_date, status, is_demo').in('status', OPEN_TASK_STATUSES).not('due_date', 'is', null),
      supabase.from('memoria_meetings').select('*').order('meeting_on', { ascending: true }),
      supabase.from('memoria_contracts').select('id, subject, ends_on, auto_renew, notice_period_days, status, is_demo').eq('status', 'active'),
      supabase.from('memoria_suppliers').select('id, name').order('name', { ascending: true }),
    ]);
    const firstError = oRes.error || tRes.error || mRes.error || cRes.error || sRes.error;
    setLoadError(firstError ? firstError.message : '');
    setObligations(oRes.data || []);
    setTasks(tRes.data || []);
    setMeetings(mRes.data || []);
    setContracts(cRes.data || []);
    setSuppliers(sRes.data || []);
    setLoadingData(false);
  }

  async function loadLogs(id) {
    const { data } = await supabase
      .from('memoria_obligation_logs')
      .select('*')
      .eq('obligation_id', id)
      .order('done_on', { ascending: false });
    setLogs((p) => ({ ...p, [id]: data || [] }));
  }

  useEffect(() => {
    load();
  }, []);

  const supplierName = useMemo(() => Object.fromEntries(suppliers.map((s) => [s.id, s.name])), [suppliers]);
  const contractSubject = useMemo(() => Object.fromEntries(contracts.map((c) => [c.id, c.subject])), [contracts]);

  // ---------- Časová os ----------
  const timeline = useMemo(() => {
    const items = buildTimeline({ obligations, meetings, tasks, contracts }, lang, 12);
    const today = todayIso();
    const overdue = items.filter((i) => i.date < today);
    const upcoming = items.filter((i) => i.date >= today);
    const byMonth = [];
    for (const i of upcoming) {
      const key = i.date.slice(0, 7);
      let group = byMonth[byMonth.length - 1];
      if (!group || group.key !== key) {
        group = { key, items: [] };
        byMonth.push(group);
      }
      group.items.push(i);
    }
    return { overdue, byMonth };
  }, [obligations, meetings, tasks, contracts, lang]);

  function monthLabel(key) {
    const [y, m] = key.split('-').map(Number);
    const locale = { en: 'en-GB', es: 'es-ES', fr: 'fr-FR', de: 'de-DE' }[lang] || 'en-GB';
    return new Date(Date.UTC(y, m - 1, 15)).toLocaleDateString(locale, { month: 'long', year: 'numeric', timeZone: 'UTC' });
  }

  // ---------- Povinnosti: CRUD ----------
  function openNew() {
    setForm({ ...EMPTY_FORM, next_due_on: todayIso() });
    setFormError('');
    setEditingId('new');
    setView('obligations');
  }

  function openEdit(o) {
    setForm(toForm(o));
    setFormError('');
    setEditingId(o.id);
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
    const values = cleanFormValues(form, ['remind_days']);
    if (!values.title || !values.next_due_on) {
      setFormError(`${mt(lang, 'title')}, ${mt(lang, 'nextDue')}: ${mt(lang, 'required')}`);
      return;
    }
    if (values.remind_days === null) values.remind_days = 30;
    setSaving(true);
    setFormError('');
    const { error } =
      editingId === 'new'
        ? await supabase.from('memoria_obligations').insert(values)
        : await supabase.from('memoria_obligations').update(values).eq('id', editingId);
    setSaving(false);
    if (error) {
      setFormError(mt(lang, 'saveError', { error: error.message }));
      return;
    }
    closeForm();
    await load();
    onChanged?.();
  }

  async function handleDelete(o) {
    if (!window.confirm(mt(lang, 'confirmDelete', { name: o.title }))) return;
    const { error } = await supabase.from('memoria_obligations').delete().eq('id', o.id);
    if (error) {
      window.alert(mt(lang, 'saveError', { error: error.message }));
      return;
    }
    await removeEntityExtras('obligation', o.id);
    await load();
    onChanged?.();
  }

  function openDone(o) {
    setDoneForm((p) => ({ ...p, [o.id]: { done_on: todayIso(), evidence: '', issues_found: '' } }));
  }

  async function saveDone(o) {
    const f = doneForm[o.id];
    if (!f?.done_on) return;
    const { error } = await supabase.from('memoria_obligation_logs').insert({
      obligation_id: o.id,
      due_on: o.next_due_on,
      done_on: f.done_on,
      evidence: f.evidence.trim() || null,
      issues_found: f.issues_found.trim() || null,
      is_demo: o.is_demo,
    });
    if (error) {
      window.alert(mt(lang, 'saveError', { error: error.message }));
      return;
    }
    const step = RECURRENCE_MONTHS[o.recurrence];
    const patch = step ? { next_due_on: addMonthsIso(o.next_due_on, step) } : { active: false };
    await supabase.from('memoria_obligations').update(patch).eq('id', o.id);

    if (f.issues_found.trim() && window.confirm(mt(lang, 'issuesCreateTask'))) {
      await supabase.from('memoria_tasks').insert({
        title: `${o.title}: ${mt(lang, 'issuesFound').toLowerCase()}`,
        description: f.issues_found.trim(),
        executor_role: 'administrator',
        supervisor_name: o.responsible_name,
        due_date: addDaysIso(f.done_on, 30),
        priority: 'high',
        is_demo: o.is_demo,
      });
    }
    setDoneForm((p) => {
      const next = { ...p };
      delete next[o.id];
      return next;
    });
    await load();
    if (expanded[o.id]) await loadLogs(o.id);
    onChanged?.();
  }

  const visibleObligations = obligations.filter((o) => {
    if (categoryFilter && o.category !== categoryFilter) return false;
    if (query) {
      const q = query.toLowerCase();
      const hay = [o.title, o.legal_basis, o.responsible_name, o.asset_note, supplierName[o.supplier_id], o.notes].join(' ').toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  const formBlock = (
    <form onSubmit={handleSave} className="card p-4 space-y-4 mb-6 border-2 border-ochre/40">
      <h3 className="font-display text-lg text-harbor">{editingId === 'new' ? mt(lang, 'newObligation') : mt(lang, 'edit')}</h3>
      <div className="grid sm:grid-cols-2 gap-3">
        <Field label={mt(lang, 'title')} required>
          <input className="input-field" value={form.title} onChange={(e) => setField('title', e.target.value)} />
        </Field>
        <Field label={mt(lang, 'category')}>
          <select className="input-field" value={form.category} onChange={(e) => setField('category', e.target.value)}>
            {OBLIGATION_CATEGORIES.map((c) => (
              <option key={c} value={c}>{mt(lang, `obligationCategory_${c}`)}</option>
            ))}
          </select>
        </Field>
      </div>
      <div className="grid sm:grid-cols-3 gap-3">
        <Field label={mt(lang, 'nextDue')} required>
          <input type="date" className="input-field" value={form.next_due_on} onChange={(e) => setField('next_due_on', e.target.value)} />
        </Field>
        <Field label={mt(lang, 'recurrence')}>
          <select className="input-field" value={form.recurrence} onChange={(e) => setField('recurrence', e.target.value)}>
            {RECURRENCES.map((r) => (
              <option key={r} value={r}>{mt(lang, `recurrence_${r}`)}</option>
            ))}
          </select>
        </Field>
        <Field label={mt(lang, 'remindDays')}>
          <input type="number" min="0" max="365" className="input-field" value={form.remind_days} onChange={(e) => setField('remind_days', e.target.value)} />
        </Field>
      </div>
      <div className="grid sm:grid-cols-2 gap-3">
        <Field label={mt(lang, 'legalBasis')}>
          <input className="input-field" value={form.legal_basis} onChange={(e) => setField('legal_basis', e.target.value)} />
        </Field>
        <Field label={mt(lang, 'assetNote')}>
          <input className="input-field" value={form.asset_note} onChange={(e) => setField('asset_note', e.target.value)} />
        </Field>
      </div>
      <div className="grid sm:grid-cols-3 gap-3">
        <Field label={mt(lang, 'responsible')}>
          <input className="input-field" value={form.responsible_name} onChange={(e) => setField('responsible_name', e.target.value)} />
        </Field>
        <Field label={mt(lang, 'supplier')}>
          <select className="input-field" value={form.supplier_id} onChange={(e) => setField('supplier_id', e.target.value)}>
            <option value="">{mt(lang, 'none')}</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </Field>
        <Field label={mt(lang, 'contract')}>
          <select className="input-field" value={form.contract_id} onChange={(e) => setField('contract_id', e.target.value)}>
            <option value="">{mt(lang, 'none')}</option>
            {contracts.map((c) => (
              <option key={c.id} value={c.id}>{c.subject}</option>
            ))}
          </select>
        </Field>
      </div>
      <Field label={mt(lang, 'notes')}>
        <textarea rows={2} className="input-field" value={form.notes} onChange={(e) => setField('notes', e.target.value)} />
      </Field>
      <label className="flex items-center gap-2 text-sm text-ink">
        <input type="checkbox" checked={form.active} onChange={(e) => setField('active', e.target.checked)} />
        {mt(lang, 'activeObligation')}
      </label>
      <ErrorBox message={formError} />
      <div className="flex gap-2">
        <button type="submit" className="btn-primary" disabled={saving}>{saving ? mt(lang, 'saving') : mt(lang, 'save')}</button>
        <button type="button" className="btn-secondary" onClick={closeForm}>{mt(lang, 'cancel')}</button>
      </div>
    </form>
  );

  function TimelineRow({ i }) {
    const overdue = i.date < todayIso();
    return (
      <li>
        <button
          className="w-full flex items-start gap-3 text-left py-2 border-b border-ink/5 hover:bg-sand/40 rounded"
          onClick={() => {
            if (i.kind === 'obligation') setView('obligations');
            else onOpenTab?.(i.tab);
          }}
        >
          <span className={`w-20 flex-shrink-0 text-sm ${overdue ? 'text-red-700 font-semibold' : 'text-ink/70'}`}>
            {formatDate(i.date, lang)}
          </span>
          <span className="flex-1 min-w-0">
            <span className={`text-sm ${i.projected ? 'text-ink/50' : 'text-ink'}`}>{i.text}</span> <DemoPill show={i.isDemo} />
            {i.sub && <span className="block text-xs text-ink/50">{i.sub}</span>}
          </span>
          <span className="flex-shrink-0 flex flex-col items-end gap-1">
            <Pill tone={KIND_TONE[i.kind]}>{mt(lang, `kind_${i.kind}`)}</Pill>
            <span className={`text-xs ${overdue ? 'text-red-700' : 'text-ink/50'}`}>{relativeDue(i.date, lang)}</span>
          </span>
        </button>
      </li>
    );
  }

  return (
    <div>
      <p className="text-sm text-ink/60 mb-4">{mt(lang, 'calendarIntro')}</p>
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="flex rounded-md border border-sand-dark overflow-hidden">
          {['timeline', 'obligations'].map((v) => (
            <button
              key={v}
              className={`px-3 py-1.5 text-sm ${view === v ? 'bg-harbor text-white' : 'bg-white text-ink/70 hover:text-harbor'}`}
              onClick={() => setView(v)}
            >
              {mt(lang, v === 'timeline' ? 'viewTimeline' : 'viewObligations')}
            </button>
          ))}
        </div>
        {view === 'obligations' && (
          <>
            <input className="input-field !w-auto flex-1 min-w-[10rem]" placeholder={mt(lang, 'search')} value={query} onChange={(e) => setQuery(e.target.value)} />
            <select className="input-field !w-auto" value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
              <option value="">{mt(lang, 'category')}: {mt(lang, 'all')}</option>
              {OBLIGATION_CATEGORIES.map((c) => (
                <option key={c} value={c}>{mt(lang, `obligationCategory_${c}`)}</option>
              ))}
            </select>
          </>
        )}
        <span className="flex-1" />
        {editingId === null && (
          <button className="btn-primary text-sm" onClick={openNew}>+ {mt(lang, 'newObligation')}</button>
        )}
      </div>

      {editingId === 'new' && formBlock}
      <ErrorBox message={loadError} />

      {loadingData ? (
        <p className="text-ink/60">{mt(lang, 'loading')}</p>
      ) : view === 'timeline' ? (
        <div className="space-y-5">
          {timeline.overdue.length > 0 && (
            <div className="card p-4 border-l-4 border-l-red-500">
              <p className="text-sm font-semibold text-red-700 mb-1">⚠️ {mt(lang, 'overdueSection')} ({timeline.overdue.length})</p>
              <ul>{timeline.overdue.map((i, idx) => <TimelineRow key={`o-${idx}`} i={i} />)}</ul>
            </div>
          )}
          {timeline.byMonth.length === 0 ? (
            <p className="text-ink/60">{mt(lang, 'nothingUpcoming')}</p>
          ) : (
            timeline.byMonth.map((g) => (
              <div key={g.key} className="card p-4">
                <p className="font-display text-harbor capitalize mb-1">{monthLabel(g.key)}</p>
                <ul>{g.items.map((i, idx) => <TimelineRow key={`${g.key}-${idx}`} i={i} />)}</ul>
              </div>
            ))
          )}
        </div>
      ) : obligations.length === 0 ? (
        <p className="text-ink/60">{mt(lang, 'empty')}</p>
      ) : visibleObligations.length === 0 ? (
        <p className="text-ink/60">{mt(lang, 'noMatches')}</p>
      ) : (
        <div className="space-y-3">
          {visibleObligations.map((o) => {
            if (editingId === o.id) return <div key={o.id}>{formBlock}</div>;
            const left = daysUntil(o.next_due_on);
            const tone = !o.active ? 'neutral' : left < 0 ? 'red' : left <= o.remind_days ? 'ochre' : 'green';
            return (
              <div key={o.id} className={`card p-4 ${!o.active ? 'opacity-60' : ''}`}>
                <div className="flex items-start justify-between gap-3 flex-wrap sm:flex-nowrap">
                  <div className="min-w-0">
                    <p className="font-semibold text-ink">{o.title} <DemoPill show={o.is_demo} /></p>
                    <div className="flex flex-wrap items-center gap-2 mt-1">
                      <Pill tone="harbor">{mt(lang, `obligationCategory_${o.category}`)}</Pill>
                      <Pill tone={tone}>
                        {mt(lang, 'nextDue')}: {formatDate(o.next_due_on, lang)}
                        {o.active ? ` · ${relativeDue(o.next_due_on, lang)}` : ` · ${mt(lang, 'inactive')}`}
                      </Pill>
                      <span className="text-xs text-ink/60">↻ {mt(lang, `recurrence_${o.recurrence}`)}</span>
                      {o.responsible_name && <span className="text-xs text-ink/60">👤 {o.responsible_name}</span>}
                      {o.supplier_id && <span className="text-xs text-ink/60">🏢 {supplierName[o.supplier_id]}</span>}
                    </div>
                  </div>
                  {editingId === null && (
                    <div className="flex flex-col items-end gap-2 flex-shrink-0">
                      {o.active && !doneForm[o.id] && (
                        <button className="btn-secondary text-sm py-1" onClick={() => openDone(o)}>✓ {mt(lang, 'markDone')}</button>
                      )}
                      <div className="flex gap-3 text-sm">
                        <button className="text-harbor hover:underline" onClick={() => openEdit(o)}>{mt(lang, 'edit')}</button>
                        <button className="text-red-600 hover:underline" onClick={() => handleDelete(o)}>{mt(lang, 'delete')}</button>
                      </div>
                    </div>
                  )}
                </div>

                {doneForm[o.id] && (
                  <div className="mt-3 p-3 rounded-md bg-sand/50 space-y-2">
                    <div className="grid sm:grid-cols-3 gap-2">
                      <Field label={mt(lang, 'doneOn')}>
                        <input
                          type="date"
                          className="input-field"
                          value={doneForm[o.id].done_on}
                          onChange={(e) => setDoneForm((p) => ({ ...p, [o.id]: { ...p[o.id], done_on: e.target.value } }))}
                        />
                      </Field>
                      <Field label={mt(lang, 'evidence')} className="sm:col-span-2">
                        <input
                          className="input-field"
                          value={doneForm[o.id].evidence}
                          onChange={(e) => setDoneForm((p) => ({ ...p, [o.id]: { ...p[o.id], evidence: e.target.value } }))}
                        />
                      </Field>
                    </div>
                    <Field label={mt(lang, 'issuesFound')}>
                      <textarea
                        rows={2}
                        className="input-field"
                        value={doneForm[o.id].issues_found}
                        onChange={(e) => setDoneForm((p) => ({ ...p, [o.id]: { ...p[o.id], issues_found: e.target.value } }))}
                      />
                    </Field>
                    {RECURRENCE_MONTHS[o.recurrence] && (
                      <p className="text-xs text-ink/60">
                        {mt(lang, 'nextDueAfter', { date: formatDate(addMonthsIso(o.next_due_on, RECURRENCE_MONTHS[o.recurrence]), lang) })}
                      </p>
                    )}
                    <div className="flex gap-2">
                      <button className="btn-primary text-sm" onClick={() => saveDone(o)}>{mt(lang, 'save')}</button>
                      <button
                        className="btn-secondary text-sm"
                        onClick={() =>
                          setDoneForm((p) => {
                            const n = { ...p };
                            delete n[o.id];
                            return n;
                          })
                        }
                      >
                        {mt(lang, 'cancel')}
                      </button>
                    </div>
                  </div>
                )}

                <button
                  className="text-xs text-harbor/70 hover:text-harbor mt-3"
                  onClick={() => {
                    const next = !expanded[o.id];
                    setExpanded((p) => ({ ...p, [o.id]: next }));
                    if (next) loadLogs(o.id);
                  }}
                >
                  {expanded[o.id] ? `▾ ${mt(lang, 'showLess')}` : `▸ ${mt(lang, 'showMore')}`}
                </button>
                {expanded[o.id] && (
                  <div className="mt-3 space-y-3 border-t border-ink/10 pt-3">
                    <DetailRow label={mt(lang, 'legalBasis')}>{o.legal_basis}</DetailRow>
                    <DetailRow label={mt(lang, 'assetNote')}>{o.asset_note}</DetailRow>
                    <DetailRow label={mt(lang, 'contract')}>{contractSubject[o.contract_id] || null}</DetailRow>
                    <DetailRow label={mt(lang, 'remindDays')}>{String(o.remind_days)}</DetailRow>
                    <DetailRow label={mt(lang, 'notes')}>{o.notes}</DetailRow>
                    <div>
                      <p className="text-xs font-semibold text-ink/50 uppercase tracking-wide mb-1">{mt(lang, 'historyLog')}</p>
                      {(logs[o.id] || []).length === 0 ? (
                        <p className="text-xs text-ink/40">—</p>
                      ) : (
                        <ul className="space-y-1">
                          {(logs[o.id] || []).map((l) => (
                            <li key={l.id} className="text-sm text-ink">
                              ✓ {formatDate(l.done_on, lang)}
                              {l.evidence && <span className="text-ink/60"> · {l.evidence}</span>}
                              {l.issues_found && <span className="block text-xs text-red-700">⚠ {l.issues_found}</span>}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                    <Attachments lang={lang} entityType="obligation" entityId={o.id} defaultType="inspection_report" />
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
